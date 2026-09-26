import type { CanvasEdge, CanvasNode, GraphEnvelope, InputBinding } from '@ilmheg/contracts';
import {
  getModel,
  getProvider,
  validateParams,
  type CapabilityKind,
  type EndpointManifest,
  type ModelManifest,
  type ResolvedModelManifest,
  type VideoMode,
} from '@ilmheg/model-catalog';

export interface CanonicalInputAsset {
  assetId: string;
  role: 'source' | 'first_frame' | 'last_frame' | 'reference';
  order: number;
  binding: InputBinding;
}

export interface CompiledRun {
  schemaVersion: 1;
  projectId: string;
  nodeId: string;
  graphRevision: number;
  providerId: string;
  providerBaseUrl: string;
  requiresCredential: boolean;
  modelId: string;
  upstreamModel: string;
  endpointId: string;
  capability: CapabilityKind;
  prompt: string;
  inputAssets: CanonicalInputAsset[];
  params: Record<string, unknown>;
  model: ModelManifest;
  endpoint: EndpointManifest;
}

export class CompileError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'CompileError';
  }
}

function requireNode(graph: GraphEnvelope, nodeId: string) {
  const node = graph.nodes.find((item) => item.id === nodeId);
  if (!node) throw new CompileError('INPUT_MISSING', '目标节点不存在');
  return node;
}

function compilePrompt(graph: GraphEnvelope, node: CanvasNode) {
  const promptEdges = graph.edges.filter((edge) => edge.target === node.id && edge.binding.kind === 'prompt')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const upstream = promptEdges.map((edge) => requireNode(graph, edge.source))
    .filter((item) => item.kind === 'prompt')
    .map((item) => item.output.text || item.config.prompt)
    .filter(Boolean);
  const own = node.kind === 'group' ? '' : node.config.prompt;
  return [...upstream, own].filter(Boolean).join('\n\n').trim();
}

function firstAsset(node: CanvasNode) {
  if (node.kind !== 'image') return undefined;
  return node.output.assetIds[0] ?? node.config.sourceAssetId;
}

function roleForBinding(binding: InputBinding): CanonicalInputAsset['role'] {
  switch (binding.kind) {
    case 'first_frame': return 'first_frame';
    case 'last_frame': return 'last_frame';
    case 'reference_image': return 'reference';
    default: return 'source';
  }
}

function collectInputAssets(graph: GraphEnvelope, node: CanvasNode): CanonicalInputAsset[] {
  const result: CanonicalInputAsset[] = [];
  if (node.kind === 'image' && node.config.sourceAssetId) {
    result.push({ assetId: node.config.sourceAssetId, role: 'source', order: 0, binding: { kind: 'source_image', index: 0 } });
  }
  const edges = graph.edges.filter((edge) => edge.target === node.id && edge.binding.kind !== 'prompt')
    .sort(compareBindings);
  for (const edge of edges) {
    const source = requireNode(graph, edge.source);
    const assetId = firstAsset(source);
    if (!assetId) throw new CompileError('INPUT_MISSING', `上游节点「${source.title}」还没有可用图片`);
    result.push({ assetId, role: roleForBinding(edge.binding), order: result.length, binding: edge.binding });
  }
  return result;
}

function compareBindings(a: CanvasEdge, b: CanvasEdge) {
  const order = (binding: InputBinding) => {
    if (binding.kind === 'first_frame') return 0;
    if (binding.kind === 'last_frame') return 1;
    if ('index' in binding) return 10 + binding.index;
    return 99;
  };
  return order(a.binding) - order(b.binding) || a.createdAt.localeCompare(b.createdAt);
}

function inferCapability(node: CanvasNode, assets: CanonicalInputAsset[]): CapabilityKind {
  if (node.kind === 'image') return assets.length ? 'image_to_image' : 'text_to_image';
  if (node.kind === 'video') return 'image_to_video';
  throw new CompileError('UNSUPPORTED_BINDING', '只有图片或视频节点可以执行生成');
}

function inferVideoMode(assets: CanonicalInputAsset[]): VideoMode {
  if (!assets.length) return 'text';
  if (assets.some((item) => item.role === 'reference')) return 'reference';
  if (assets.some((item) => item.role === 'last_frame')) return 'first_last';
  return 'first_frame';
}

function alignVideoAssetsWithEndpoint(assets: CanonicalInputAsset[], endpoint: EndpointManifest): CanonicalInputAsset[] {
  const capability = endpoint.capabilities.find((item) => item.kind === 'image_to_video');
  if (capability?.videoModes?.length !== 1 || capability.videoModes[0] !== 'reference') return assets;
  return assets.map((asset, index) => ({
    ...asset,
    role: 'reference' as const,
    order: index,
    binding: { kind: 'reference_image' as const, index },
  }));
}

function normalizeLegacyParams(endpoint: EndpointManifest, params: Record<string, unknown>) {
  let normalized = params;
  for (const field of endpoint.params) {
    if (field.type !== 'select' || params[field.key] === undefined || !field.options) continue;
    if (!field.options.some((option) => option.value === params[field.key])) {
      normalized = { ...normalized, [field.key]: field.defaultValue };
    }
  }
  return normalized;
}

function chooseEndpoint(model: ModelManifest, capability: CapabilityKind, selected?: string, videoMode?: VideoMode) {
  const candidates = model.endpoints.filter((endpoint) => endpoint.capabilities.some((item) => item.kind === capability));
  if (selected) {
    const endpoint = model.endpoints.find((item) => item.id === selected);
    if (!endpoint) throw new CompileError('MODEL_DISABLED', '所选端点不存在');
    if (!candidates.includes(endpoint)) throw new CompileError('UNSUPPORTED_BINDING', '当前端点不支持画布上的输入，请在右侧切换生成模式');
    return endpoint;
  }
  const matching = videoMode
    ? candidates.find((endpoint) => endpoint.capabilities.some((item) => item.kind === capability && item.videoModes?.includes(videoMode)))
      ?? candidates.find((endpoint) => endpoint.capabilities.some((item) => item.kind === capability && item.videoModes?.length === 1 && item.videoModes[0] === 'reference'))
    : candidates[0];
  if (!matching) throw new CompileError('UNSUPPORTED_BINDING', '所选模型不支持当前生成模式');
  return matching;
}

export type ModelResolver = (modelId: string) => ResolvedModelManifest;

export function compileGraphRun(graph: GraphEnvelope, nodeId: string, resolveModel: ModelResolver = resolveBuiltInModel): CompiledRun {
  const node = requireNode(graph, nodeId);
  if (node.kind !== 'image' && node.kind !== 'video') {
    throw new CompileError('UNSUPPORTED_BINDING', '请选择图片或视频节点运行');
  }
  const selection = node.config.model;
  if (!selection?.modelId) throw new CompileError('MODEL_DISABLED', '请先选择模型');
  const resolved = resolveModel(selection.modelId);
  const model = resolved.model;
  if (model.kind !== node.kind) throw new CompileError('MODEL_DISABLED', '模型类型与节点不匹配');
  let assets = collectInputAssets(graph, node);
  const capability = inferCapability(node, assets);
  const videoMode = capability === 'image_to_video' ? inferVideoMode(assets) : undefined;
  const endpoint = chooseEndpoint(model, capability, selection.endpointId, videoMode);
  if (capability === 'image_to_video') assets = alignVideoAssetsWithEndpoint(assets, endpoint);
  const capabilityConfig = endpoint.capabilities.find((item) => item.kind === capability)!;
  if (assets.length < capabilityConfig.minImages) throw new CompileError('INPUT_MISSING', `至少需要 ${capabilityConfig.minImages} 张输入图片`);
  if (assets.length > capabilityConfig.maxImages) throw new CompileError('INPUT_LIMIT_EXCEEDED', `当前模型最多接收 ${capabilityConfig.maxImages} 张图片，已连接 ${assets.length} 张`);
  if (capability === 'image_to_video') {
    const mode = inferVideoMode(assets);
    if (!capabilityConfig.videoModes?.includes(mode)) throw new CompileError('UNSUPPORTED_BINDING', `当前模型不支持「${mode}」输入模式`);
    if (mode === 'first_last' && !assets.some((item) => item.role === 'first_frame')) {
      throw new CompileError('INPUT_MISSING', '首尾帧模式缺少首帧');
    }
  }
  const prompt = compilePrompt(graph, node);
  if (!prompt) throw new CompileError('INPUT_MISSING', '请输入提示词，或连接一个提示词节点');
  return {
    schemaVersion: 1,
    projectId: graph.projectId,
    nodeId,
    graphRevision: graph.revision,
    providerId: model.providerId,
    providerBaseUrl: resolved.providerBaseUrl,
    requiresCredential: resolved.requiresCredential,
    modelId: model.id,
    upstreamModel: model.upstreamModel,
    endpointId: endpoint.id,
    capability,
    prompt,
    inputAssets: assets,
    params: validateParams(endpoint.params, normalizeLegacyParams(endpoint, selection.params)),
    model,
    endpoint,
  };
}

function resolveBuiltInModel(modelId: string): ResolvedModelManifest {
  const model = getModel(modelId);
  const provider = getProvider(model.providerId);
  return { model, providerBaseUrl: provider.baseUrl, requiresCredential: provider.requiresCredential };
}

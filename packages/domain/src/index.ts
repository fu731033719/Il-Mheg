import {
  CanvasEdgeSchema,
  CanvasNodeSchema,
  GraphEnvelopeSchema,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeKind,
  type GraphEnvelope,
  type InputBinding,
} from '@ilmheg/contracts';

export class DomainError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

export function createEmptyGraph(projectId: string): GraphEnvelope {
  return GraphEnvelopeSchema.parse({
    schemaVersion: 1,
    projectId,
    revision: 0,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    updatedAt: now(),
  });
}

export function createNode<K extends CanvasNodeKind>(kind: K, position: { x: number; y: number }): Extract<CanvasNode, { kind: K }> {
  const createdAt = now();
  const base = {
    id: id(), position, runtime: { status: 'idle' as const }, createdAt, updatedAt: createdAt,
  };
  const nodes: Record<CanvasNodeKind, unknown> = {
    prompt: { ...base, kind: 'prompt', title: '提示词', config: { prompt: '' }, output: {} },
    image: {
      ...base, kind: 'image', title: '图片生成',
      config: {
        prompt: '',
        model: { modelId: 'mock-image', endpointId: 'mock-image-generate', params: { count: 1, ratio: '1:1' } },
        regenerationPolicy: 'variant',
      },
      output: { assetIds: [] },
    },
    video: {
      ...base, kind: 'video', title: '视频生成',
      config: {
        prompt: '',
        model: { modelId: 'mock-video', endpointId: 'mock-video-generate', params: { duration: 4, ratio: '16:9' } },
        regenerationPolicy: 'variant',
      },
      output: { assetIds: [] },
    },
    group: {
      ...base, kind: 'group', title: '分组',
      size: { width: 560, height: 360 }, config: { layout: 'free' }, output: {},
    },
  };
  return CanvasNodeSchema.parse(nodes[kind]) as Extract<CanvasNode, { kind: K }>;
}

export function bindingLabel(binding: InputBinding): string {
  switch (binding.kind) {
    case 'prompt': return '提示词';
    case 'source_image': return `源图片 ${binding.index + 1}`;
    case 'first_frame': return '首帧';
    case 'last_frame': return '尾帧';
    case 'reference_image': return `参考图 ${binding.index + 1}`;
    case 'source_video': return `视频 ${binding.index + 1}`;
  }
}

function nextIndex(edges: CanvasEdge[], target: string, kind: 'source_image' | 'reference_image' | 'source_video') {
  return edges.filter((edge) => edge.target === target && edge.binding.kind === kind).length;
}

export function inferBinding(
  source: CanvasNode,
  target: CanvasNode,
  edges: CanvasEdge[],
  requested?: string | null,
): InputBinding {
  if (source.kind === 'group' || target.kind === 'group') {
    throw new DomainError('GROUP_EDGE', '分组不能作为执行连线端点');
  }
  if (source.kind === 'prompt' && (target.kind === 'image' || target.kind === 'video')) return { kind: 'prompt' };
  if (source.kind === 'image' && target.kind === 'image') {
    return { kind: 'source_image', index: nextIndex(edges, target.id, 'source_image') };
  }
  if (source.kind === 'image' && target.kind === 'video') {
    if (requested === 'last_frame') return { kind: 'last_frame' };
    if (requested === 'reference_image') {
      return { kind: 'reference_image', index: nextIndex(edges, target.id, 'reference_image') };
    }
    if (requested === 'first_frame') return { kind: 'first_frame' };
    const incoming = edges.filter((edge) => edge.target === target.id);
    if (!incoming.some((edge) => edge.binding.kind === 'first_frame')) return { kind: 'first_frame' };
    if (!incoming.some((edge) => edge.binding.kind === 'last_frame')) return { kind: 'last_frame' };
    return { kind: 'reference_image', index: nextIndex(edges, target.id, 'reference_image') };
  }
  if (source.kind === 'video' && target.kind === 'video') {
    return { kind: 'source_video', index: nextIndex(edges, target.id, 'source_video') };
  }
  throw new DomainError('INCOMPATIBLE_NODES', `不支持 ${source.kind} → ${target.kind} 连线`);
}

export function wouldCreateCycle(nodes: CanvasNode[], edges: CanvasEdge[], source: string, target: string): boolean {
  if (source === target) return true;
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const edge of edges) adjacency.get(edge.source)?.push(edge.target);
  adjacency.get(source)?.push(target);
  const seen = new Set<string>();
  const stack = [target];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === source) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(adjacency.get(current) ?? []));
  }
  return false;
}

export function connectNodes(
  graph: GraphEnvelope,
  input: { source: string; target: string; targetHandle?: string | null },
): GraphEnvelope {
  const source = graph.nodes.find((node) => node.id === input.source);
  const target = graph.nodes.find((node) => node.id === input.target);
  if (!source || !target) throw new DomainError('NODE_NOT_FOUND', '连线节点不存在');
  if (wouldCreateCycle(graph.nodes, graph.edges, source.id, target.id)) {
    throw new DomainError('CYCLE', '执行图不允许形成环');
  }
  const binding = inferBinding(source, target, graph.edges, input.targetHandle);
  const duplicateSlot = graph.edges.some((edge) => {
    if (edge.target !== target.id || edge.binding.kind !== binding.kind) return false;
    if ('index' in edge.binding && 'index' in binding) return edge.binding.index === binding.index;
    return true;
  });
  if (duplicateSlot) throw new DomainError('DUPLICATE_BINDING', `${bindingLabel(binding)} 已连接`);
  const edge = CanvasEdgeSchema.parse({ id: id(), source: source.id, target: target.id, binding, createdAt: now() });
  return validateGraph({ ...graph, edges: normalizeBindingIndices([...graph.edges, edge]) });
}

export function normalizeBindingIndices(edges: CanvasEdge[]): CanvasEdge[] {
  const counters = new Map<string, number>();
  return edges.map((edge) => {
    if (!['source_image', 'reference_image', 'source_video'].includes(edge.binding.kind)) return edge;
    const key = `${edge.target}:${edge.binding.kind}`;
    const index = counters.get(key) ?? 0;
    counters.set(key, index + 1);
    return { ...edge, binding: { ...edge.binding, index } } as CanvasEdge;
  });
}

export function validateGraph(graph: GraphEnvelope): GraphEnvelope {
  const parsed = GraphEnvelopeSchema.parse(graph);
  const ids = new Set(parsed.nodes.map((node) => node.id));
  const slots = new Set<string>();
  for (const edge of parsed.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) throw new DomainError('ORPHAN_EDGE', '图中存在孤立连线');
    if (edge.source === edge.target) throw new DomainError('SELF_EDGE', '节点不能连接自身');
    const suffix = 'index' in edge.binding ? edge.binding.index : '';
    const slot = `${edge.target}:${edge.binding.kind}:${suffix}`;
    if (slots.has(slot)) throw new DomainError('DUPLICATE_BINDING', '同一输入槽位只能连接一次');
    slots.add(slot);
  }
  if (parsed.edges.some((edge) => wouldCreateCycle(parsed.nodes, parsed.edges.filter((item) => item.id !== edge.id), edge.source, edge.target))) {
    throw new DomainError('CYCLE', '执行图不允许形成环');
  }
  return parsed;
}

export function autoLayout(graph: GraphEnvelope): GraphEnvelope {
  const executable = graph.nodes.filter((node) => node.kind !== 'group');
  const incoming = new Map(executable.map((node) => [node.id, 0]));
  for (const edge of graph.edges) incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  const queue = executable.filter((node) => incoming.get(node.id) === 0).map((node) => node.id);
  const layer = new Map<string, number>(queue.map((nodeId) => [nodeId, 0]));
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of graph.edges.filter((item) => item.source === current)) {
      layer.set(edge.target, Math.max(layer.get(edge.target) ?? 0, (layer.get(current) ?? 0) + 1));
      incoming.set(edge.target, (incoming.get(edge.target) ?? 1) - 1);
      if (incoming.get(edge.target) === 0) queue.push(edge.target);
    }
  }
  const rows = new Map<number, number>();
  const updatedAt = now();
  const nodes = graph.nodes.map((node) => {
    if (node.kind === 'group') return node;
    const column = layer.get(node.id) ?? 0;
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    return { ...node, position: { x: 120 + column * 360, y: 100 + row * 280 }, updatedAt };
  });
  return { ...graph, nodes };
}

export function cloneNodes(graph: GraphEnvelope, nodeIds: string[], offset = { x: 48, y: 48 }): GraphEnvelope {
  const selected = graph.nodes.filter((node) => nodeIds.includes(node.id));
  const mapping = new Map(selected.map((node) => [node.id, id()]));
  const stamp = now();
  const clones = selected.map((node) => CanvasNodeSchema.parse({
    ...structuredClone(node), id: mapping.get(node.id),
    parentId: node.parentId ? mapping.get(node.parentId) : undefined,
    position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
    title: `${node.title} 副本`, runtime: { status: 'idle' }, createdAt: stamp, updatedAt: stamp,
  }));
  const clonedEdges = graph.edges
    .filter((edge) => mapping.has(edge.source) && mapping.has(edge.target))
    .map((edge) => CanvasEdgeSchema.parse({
      ...edge, id: id(), source: mapping.get(edge.source), target: mapping.get(edge.target), createdAt: stamp,
    }));
  return validateGraph({ ...graph, nodes: [...graph.nodes, ...clones], edges: [...graph.edges, ...clonedEdges] });
}

export function removeNodes(graph: GraphEnvelope, nodeIds: string[]): GraphEnvelope {
  const removed = new Set(nodeIds);
  return validateGraph({
    ...graph,
    nodes: graph.nodes.filter((node) => !removed.has(node.id)).map((node) =>
      node.parentId && removed.has(node.parentId) ? { ...node, parentId: undefined } : node),
    edges: normalizeBindingIndices(graph.edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target))),
  });
}

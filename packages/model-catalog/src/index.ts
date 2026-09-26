import type { CanvasNodeKind, CustomVideoMode, ModelConfiguration, ModelType, ParamField, PublicModel } from '@ilmheg/contracts';

export type CapabilityKind = 'text_to_image' | 'image_to_image' | 'image_to_video';
export type VideoMode = 'text' | 'first_frame' | 'first_last' | 'reference';

export interface CapabilityManifest {
  kind: CapabilityKind;
  minImages: number;
  maxImages: number;
  maxOutputs: number;
  videoModes?: VideoMode[];
}

export interface EndpointManifest {
  id: string;
  displayName: string;
  path: string;
  protocol: 'mock' | 'openai-image' | 'dashscope-video';
  requestEncoding: 'json' | 'multipart';
  responseMode: 'sync' | 'async';
  capabilities: CapabilityManifest[];
  params: ParamField[];
  pollPath?: string;
}

export interface ModelManifest {
  id: string;
  providerId: string;
  displayName: string;
  description: string;
  kind: 'image' | 'video';
  upstreamModel: string;
  endpoints: EndpointManifest[];
}

export interface ResolvedModelManifest {
  model: ModelManifest;
  providerBaseUrl: string;
  requiresCredential: boolean;
}

export interface ProviderManifest {
  id: string;
  displayName: string;
  baseUrl: string;
  requiresCredential: boolean;
}

const imageParams: ParamField[] = [
  { key: 'size', label: '画面尺寸', type: 'select', defaultValue: '1024x1024', options: [
    { label: '方形 · 1024 × 1024', value: '1024x1024' },
    { label: '横向 · 1536 × 1024', value: '1536x1024' },
    { label: '纵向 · 1024 × 1536', value: '1024x1536' },
  ] },
  { key: 'quality', label: '生成质量', type: 'select', defaultValue: 'medium', options: [
    { label: '快速草图', value: 'low' }, { label: '标准', value: 'medium' }, { label: '精细', value: 'high' },
  ] },
  { key: 'count', label: '输出数量', type: 'number', defaultValue: 1, min: 1, max: 4, step: 1 },
  { key: 'output_format', label: '文件格式', type: 'select', defaultValue: 'png', options: [
    { label: 'PNG', value: 'png' }, { label: 'WebP', value: 'webp' }, { label: 'JPEG', value: 'jpeg' },
  ] },
];

const mockImageParams: ParamField[] = [
  { key: 'ratio', label: '画面比例', type: 'select', defaultValue: '1:1', options: [
    { label: '方形 · 1:1', value: '1:1' }, { label: '横向 · 16:9', value: '16:9' }, { label: '纵向 · 9:16', value: '9:16' },
  ] },
  { key: 'count', label: '输出数量', type: 'number', defaultValue: 1, min: 1, max: 4, step: 1 },
];

const wan27VideoParams = createVideoParams({
  resolutions: ['720P', '1080P'],
  ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
  defaultRatio: '16:9',
  maxDuration: 15,
});

const wan3VideoParams = createVideoParams({
  resolutions: ['480P', '720P', '1080P'],
  ratios: ['adaptive', '21:9', '16:9', '9:16', '1:1', '4:3', '3:4'],
  defaultRatio: 'adaptive',
  maxDuration: 30,
});

export const providers: ProviderManifest[] = [
  { id: 'mock', displayName: '本地演示引擎', baseUrl: 'mock://provider', requiresCredential: false },
  { id: 'openai', displayName: 'OpenAI', baseUrl: 'https://api.openai.com', requiresCredential: true },
  { id: 'dashscope', displayName: '通义万相', baseUrl: 'https://dashscope.aliyuncs.com', requiresCredential: true },
];

export const models: ModelManifest[] = [
  {
    id: 'mock-image', providerId: 'mock', displayName: 'Dream Sketch Local', kind: 'image', upstreamModel: 'mock-image',
    description: '无需密钥，用于验证文生图与图生图完整链路。',
    endpoints: [{
      id: 'mock-image-generate', displayName: '生成 / 编辑', path: '/images', protocol: 'mock', requestEncoding: 'json', responseMode: 'sync',
      capabilities: [
        { kind: 'text_to_image', minImages: 0, maxImages: 0, maxOutputs: 4 },
        { kind: 'image_to_image', minImages: 1, maxImages: 6, maxOutputs: 4 },
      ],
      params: mockImageParams,
    }],
  },
  {
    id: 'mock-video', providerId: 'mock', displayName: 'Motion Study Local', kind: 'video', upstreamModel: 'mock-video',
    description: '无需密钥，模拟异步图生视频、轮询、取消与恢复。',
    endpoints: [{
      id: 'mock-video-generate', displayName: '图生视频', path: '/videos', protocol: 'mock', requestEncoding: 'json', responseMode: 'async',
      capabilities: [{ kind: 'image_to_video', minImages: 1, maxImages: 6, maxOutputs: 1, videoModes: ['first_frame', 'first_last', 'reference'] }],
      params: [
        { key: 'duration', label: '时长（秒）', type: 'number', defaultValue: 4, min: 2, max: 8, step: 1 },
        { key: 'ratio', label: '画面比例', type: 'select', defaultValue: '16:9', options: [
          { label: '横向 · 16:9', value: '16:9' }, { label: '纵向 · 9:16', value: '9:16' }, { label: '方形 · 1:1', value: '1:1' },
        ] },
      ],
      pollPath: '/videos/{taskId}',
    }],
  },
  {
    id: 'gpt-image-2', providerId: 'openai', displayName: 'GPT Image 2', kind: 'image', upstreamModel: 'gpt-image-2',
    description: 'OpenAI 图片生成与高保真多图编辑。',
    endpoints: [
      {
        id: 'openai-image-generate', displayName: '文生图', path: '/v1/images/generations', protocol: 'openai-image', requestEncoding: 'json', responseMode: 'sync',
        capabilities: [{ kind: 'text_to_image', minImages: 0, maxImages: 0, maxOutputs: 4 }], params: imageParams,
      },
      {
        id: 'openai-image-edit', displayName: '图片编辑', path: '/v1/images/edits', protocol: 'openai-image', requestEncoding: 'multipart', responseMode: 'sync',
        capabilities: [{ kind: 'image_to_image', minImages: 1, maxImages: 8, maxOutputs: 4 }], params: imageParams,
      },
    ],
  },
  {
    id: 'wan2.7-i2v', providerId: 'dashscope', displayName: 'Wan 2.7 图生视频', kind: 'video', upstreamModel: 'wan2.7-i2v-2026-04-25',
    description: '首帧或首尾帧生成视频，任务完成后自动保存到本地。',
    endpoints: [{
      id: 'wan27-image-to-video', displayName: '首帧 / 首尾帧',
      path: '/api/v1/services/aigc/video-generation/video-synthesis', pollPath: '/api/v1/tasks/{taskId}',
      protocol: 'dashscope-video', requestEncoding: 'json', responseMode: 'async',
      capabilities: [{ kind: 'image_to_video', minImages: 1, maxImages: 2, maxOutputs: 1, videoModes: ['first_frame', 'first_last'] }],
      params: wan27VideoParams,
    }],
  },
  {
    id: 'wan2.7-r2v', providerId: 'dashscope', displayName: 'Wan 2.7 参考生视频', kind: 'video', upstreamModel: 'wan2.7-r2v-2026-06-12',
    description: '使用一个或多个角色/场景参考图生成视频。',
    endpoints: [{
      id: 'wan27-reference-to-video', displayName: '多参考图',
      path: '/api/v1/services/aigc/video-generation/video-synthesis', pollPath: '/api/v1/tasks/{taskId}',
      protocol: 'dashscope-video', requestEncoding: 'json', responseMode: 'async',
      capabilities: [{ kind: 'image_to_video', minImages: 1, maxImages: 5, maxOutputs: 1, videoModes: ['reference'] }],
      params: wan27VideoParams,
    }],
  },
];

export function getModel(modelId: string): ModelManifest {
  const model = models.find((item) => item.id === modelId);
  if (!model) throw new Error(`MODEL_DISABLED: 未找到模型 ${modelId}`);
  return model;
}

export function getProvider(providerId: string): ProviderManifest {
  const provider = providers.find((item) => item.id === providerId);
  if (!provider) throw new Error(`MODEL_DISABLED: 未找到 Provider ${providerId}`);
  return provider;
}

export function listPublicModels(): PublicModel[] {
  return models.map((model) => ({
    id: model.id,
    providerId: model.providerId,
    displayName: model.displayName,
    kind: model.kind,
    modelType: 'vision',
    source: 'builtin',
    compatibleNodeKinds: [model.kind],
    description: model.description,
    endpoints: model.endpoints.map((endpoint) => ({
      id: endpoint.id,
      displayName: endpoint.displayName,
      capabilities: endpoint.capabilities.map((capability) => capability.kind),
      params: endpoint.params,
    })),
  }));
}

export function customModelProviderId(id: string) {
  return `custom-model:${id}`;
}

export function compatibleNodeKindsForModelType(modelType: ModelType): Array<Exclude<CanvasNodeKind, 'group'>> {
  if (modelType === 'language') return ['prompt'];
  if (modelType === 'vision') return ['image', 'video'];
  if (modelType === 'multimodal') return ['prompt', 'image'];
  return [];
}

export function customModelToPublicModel(configuration: ModelConfiguration): PublicModel {
  const videoModel = isCustomVideoModel(configuration);
  const compatibleNodeKinds = compatibleNodeKindsForConfiguration(configuration);
  if (videoModel) {
    return {
      id: configuration.id,
      providerId: customModelProviderId(configuration.id),
      displayName: configuration.displayName,
      kind: 'video',
      modelType: configuration.modelType,
      source: 'custom',
      compatibleNodeKinds,
      description: `${configuration.provider} · ${configuration.modelName}`,
      endpoints: [{
        id: customModelEndpointId(configuration.id),
        displayName: videoModeLabel(configuration.videoMode),
        capabilities: ['image_to_video'],
        params: customVideoParams(configuration.modelName),
      }],
    };
  }
  const endpointUrl = resolveCustomImageEndpoint(configuration.endpoint);
  const mode = customImageEndpointMode(endpointUrl);
  const imageCapabilities: CapabilityKind[] = compatibleNodeKinds.includes('image')
    ? mode === 'edit' ? ['image_to_image'] : isAliyunMaas(endpointUrl) ? ['text_to_image', 'image_to_image'] : ['text_to_image']
    : [];
  return {
    id: configuration.id,
    providerId: customModelProviderId(configuration.id),
    displayName: configuration.displayName,
    kind: 'image',
    modelType: configuration.modelType,
    source: 'custom',
    compatibleNodeKinds,
    description: `${configuration.provider} · ${configuration.modelName}`,
    endpoints: [{
      id: customModelEndpointId(configuration.id),
      displayName: '默认 Endpoint',
      capabilities: imageCapabilities,
      params: compatibleNodeKinds.includes('image') ? customImageParams(endpointUrl) : [],
    }],
  };
}

export function resolveCustomModel(configuration: ModelConfiguration): ResolvedModelManifest {
  if (isCustomVideoModel(configuration)) return resolveCustomVideoModel(configuration);
  if (!compatibleNodeKindsForConfiguration(configuration).includes('image')) {
    throw new Error('MODEL_DISABLED: 当前自定义模型类型不支持图片节点执行');
  }
  const url = resolveCustomImageEndpoint(configuration.endpoint);
  const mode = customImageEndpointMode(url);
  const aliyunMaas = isAliyunMaas(url);
  const endpoint: EndpointManifest = {
    id: customModelEndpointId(configuration.id),
    displayName: '默认 Endpoint',
    path: `${url.pathname}${url.search}`,
    protocol: 'openai-image',
    requestEncoding: mode === 'edit' ? 'multipart' : 'json',
    responseMode: 'sync',
    capabilities: mode === 'edit'
      ? [{ kind: 'image_to_image', minImages: 1, maxImages: 8, maxOutputs: 4 }]
      : [
        { kind: 'text_to_image', minImages: 0, maxImages: 0, maxOutputs: aliyunMaas ? 6 : 4 },
        ...(aliyunMaas ? [{ kind: 'image_to_image' as const, minImages: 1, maxImages: 3, maxOutputs: 6 }] : []),
      ],
    params: customImageParams(url),
  };
  return {
    providerBaseUrl: url.origin,
    requiresCredential: configuration.credentialConfigured,
    model: {
      id: configuration.id,
      providerId: customModelProviderId(configuration.id),
      displayName: configuration.displayName,
      description: `${configuration.provider} · ${configuration.modelName}`,
      kind: 'image',
      upstreamModel: configuration.modelName,
      endpoints: [endpoint],
    },
  };
}

function resolveCustomVideoModel(configuration: ModelConfiguration): ResolvedModelManifest {
  const url = resolveCustomVideoEndpoint(configuration.endpoint);
  const endpoint: EndpointManifest = {
    id: customModelEndpointId(configuration.id),
    displayName: videoModeLabel(configuration.videoMode),
    path: `${url.pathname}${url.search}`,
    pollPath: '/api/v1/tasks/{taskId}',
    protocol: 'dashscope-video',
    requestEncoding: 'json',
    responseMode: 'async',
    capabilities: [customVideoCapability(configuration.videoMode)],
    params: customVideoParams(configuration.modelName),
  };
  return {
    providerBaseUrl: url.origin,
    requiresCredential: configuration.credentialConfigured,
    model: {
      id: configuration.id,
      providerId: customModelProviderId(configuration.id),
      displayName: configuration.displayName,
      description: `${configuration.provider} · ${configuration.modelName}`,
      kind: 'video',
      upstreamModel: configuration.modelName,
      endpoints: [endpoint],
    },
  };
}

function compatibleNodeKindsForConfiguration(configuration: ModelConfiguration): Array<Exclude<CanvasNodeKind, 'group'>> {
  if (configuration.modelType === 'vision') return [configuration.visualKind];
  return compatibleNodeKindsForModelType(configuration.modelType);
}

function isCustomVideoModel(configuration: ModelConfiguration) {
  return configuration.modelType === 'vision' && configuration.visualKind === 'video';
}

function customVideoCapability(mode: CustomVideoMode): CapabilityManifest {
  if (mode === 'text') return { kind: 'image_to_video', minImages: 0, maxImages: 0, maxOutputs: 1, videoModes: ['text'] };
  if (mode === 'first_last') return { kind: 'image_to_video', minImages: 1, maxImages: 2, maxOutputs: 1, videoModes: ['first_frame', 'first_last'] };
  if (mode === 'reference') return { kind: 'image_to_video', minImages: 1, maxImages: 9, maxOutputs: 1, videoModes: ['reference'] };
  return { kind: 'image_to_video', minImages: 0, maxImages: 9, maxOutputs: 1, videoModes: ['text', 'first_frame', 'first_last', 'reference'] };
}

function videoModeLabel(mode: CustomVideoMode) {
  if (mode === 'text') return '文生视频';
  if (mode === 'first_last') return '首帧 / 首尾帧';
  if (mode === 'reference') return '参考生视频';
  return '通用视频生成';
}

function customVideoParams(modelName: string) {
  return modelName.toLowerCase().startsWith('wan2.7') ? wan27VideoParams : wan3VideoParams;
}

function createVideoParams({ resolutions, ratios, defaultRatio, maxDuration }: {
  resolutions: string[];
  ratios: string[];
  defaultRatio: string;
  maxDuration: number;
}): ParamField[] {
  const ratioLabels: Record<string, string> = {
    adaptive: '智能适配',
    '21:9': '超宽 · 21:9',
    '16:9': '横向 · 16:9',
    '9:16': '纵向 · 9:16',
    '1:1': '方形 · 1:1',
    '4:3': '横向 · 4:3',
    '3:4': '纵向 · 3:4',
  };
  return [
    { key: 'resolution', label: '分辨率', type: 'select', defaultValue: resolutions.includes('720P') ? '720P' : resolutions[0], options: resolutions.map((value) => ({ label: value, value })) },
    { key: 'ratio', label: '画面比例', type: 'select', defaultValue: defaultRatio, options: ratios.map((value) => ({ label: ratioLabels[value] ?? value, value })) },
    { key: 'duration', label: '时长（秒）', type: 'number', defaultValue: 5, min: 2, max: maxDuration, step: 1 },
    { key: 'prompt_extend', label: '智能扩写', type: 'boolean', defaultValue: true },
    { key: 'watermark', label: '添加水印', type: 'boolean', defaultValue: false },
  ];
}

function customModelEndpointId(id: string) {
  return `custom-endpoint:${id}`;
}

export function resolveCustomImageEndpoint(endpoint: string): URL {
  const url = new URL(endpoint);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  url.pathname = path.endsWith('/v1') ? `${path}/images/generations` : path;
  return url;
}

export function resolveCustomVideoEndpoint(endpoint: string): URL {
  const url = new URL(endpoint);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  url.pathname = isAliyunMaas(url) && path.endsWith('/compatible-mode/v1')
    ? '/api/v1/services/aigc/video-generation/video-synthesis'
    : path;
  return url;
}

function customImageEndpointMode(endpoint: URL): 'generate' | 'edit' {
  return endpoint.pathname.endsWith('/edits') ? 'edit' : 'generate';
}

function isAliyunMaas(endpoint: URL) {
  return endpoint.hostname === 'maas.aliyuncs.com' || endpoint.hostname.endsWith('.maas.aliyuncs.com');
}

function customImageParams(endpoint: URL): ParamField[] {
  return isAliyunMaas(endpoint) ? imageParams.filter((field) => field.key === 'size' || field.key === 'count') : imageParams;
}

export function applyParamDefaults(fields: ParamField[], values: Record<string, unknown> = {}) {
  return Object.fromEntries(fields.map((field) => [field.key, values[field.key] ?? field.defaultValue]));
}

export function validateParams(fields: ParamField[], values: Record<string, unknown>) {
  const result = applyParamDefaults(fields, values);
  for (const field of fields) {
    const value = result[field.key];
    if (field.required && (value === undefined || value === '')) throw new Error(`INPUT_MISSING: 缺少参数 ${field.label}`);
    if (field.type === 'number' && typeof value === 'number') {
      if (field.min !== undefined && value < field.min) throw new Error(`PROVIDER_BAD_REQUEST: ${field.label} 不能小于 ${field.min}`);
      if (field.max !== undefined && value > field.max) throw new Error(`PROVIDER_BAD_REQUEST: ${field.label} 不能大于 ${field.max}`);
    }
    if (field.options && !field.options.some((option) => option.value === value)) {
      throw new Error(`PROVIDER_BAD_REQUEST: ${field.label} 取值无效`);
    }
  }
  return result;
}

export function inputTransform(template: unknown, values: Record<string, unknown>): unknown {
  if (typeof template === 'string') {
    const exact = template.match(/^\$\$\{([^}]+)\}$/);
    if (exact) return readPath(values, exact[1]);
    return template.replace(/\$\$\{([^}]+)\}/g, (_, path: string) => String(readPath(values, path) ?? ''));
  }
  if (Array.isArray(template)) return template.map((item) => inputTransform(item, values)).filter(hasValue);
  if (template && typeof template === 'object') {
    const source = template as Record<string, unknown>;
    if ('@conditional' in source) {
      const condition = String(source['@conditional']);
      if (!readPath(values, condition)) return undefined;
      return inputTransform(source['@value'], values);
    }
    return Object.fromEntries(Object.entries(source)
      .map(([key, value]) => [key, inputTransform(value, values)])
      .filter(([, value]) => hasValue(value)));
  }
  return template;
}

function readPath(values: Record<string, unknown>, path: string): unknown {
  return path.replace(/\[(\d+)\]/g, '.$1').split('.').reduce<unknown>((value, key) => {
    if (value && typeof value === 'object') return (value as Record<string, unknown>)[key];
    return undefined;
  }, values);
}

function hasValue(value: unknown) {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

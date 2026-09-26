import type { ProviderManifest } from './manifest';

export const providers: ProviderManifest[] = [
  {
    id: 'mock', displayName: '本地演示引擎', description: '无需联网，用于验证图片与视频画布链路。',
    logoPath: './providers/local.svg', baseUrl: 'mock://provider', requiresCredential: false,
  },
  {
    id: 'openai', displayName: 'OpenAI', description: 'GPT Image 图片生成与多图编辑。',
    logoPath: './providers/openai.svg', baseUrl: 'https://api.openai.com', requiresCredential: true,
    credentialPlaceholder: 'sk-…', docsUrl: 'https://developers.openai.com/api/docs/guides/image-generation',
    authScheme: 'bearer', testPath: '/v1/models',
  },
  {
    id: 'xai', displayName: 'xAI', description: 'Grok Imagine 图片、编辑与原生音频视频生成。',
    logoPath: './providers/xai.svg', baseUrl: 'https://api.x.ai', requiresCredential: true,
    credentialPlaceholder: 'xai-…', docsUrl: 'https://docs.x.ai/developers/model-capabilities/imagine',
    authScheme: 'bearer', testPath: '/v1/models',
  },
  {
    id: 'google', displayName: 'Google AI', description: 'Gemini / Nano Banana 图片生成与 Veo 视频生成。',
    logoPath: './providers/google.svg', baseUrl: 'https://generativelanguage.googleapis.com', requiresCredential: true,
    credentialPlaceholder: 'AIza…', docsUrl: 'https://ai.google.dev/gemini-api/docs/image-generation',
    authScheme: 'x-goog-api-key', testPath: '/v1beta/models?pageSize=1',
  },
  {
    id: 'minimax', displayName: 'MiniMax', description: 'Image-01 与 Hailuo 系列图片、视频生成。',
    logoPath: './providers/minimax.svg', baseUrl: 'https://api.minimax.io', requiresCredential: true,
    credentialPlaceholder: 'sk-api-…', docsUrl: 'https://platform.minimax.io/docs/api-reference/video-generation-create',
    authScheme: 'bearer', testPath: '/account/query_balance',
  },
  {
    id: 'volcengine', displayName: '火山方舟', description: '字节跳动 Seedance 系列原生视频生成。',
    logoPath: './providers/bytedance.svg', baseUrl: 'https://ark.cn-beijing.volces.com', requiresCredential: true,
    credentialPlaceholder: 'Ark API Key', docsUrl: 'https://docs.volcengine.com/docs/ark/create-video-generation-task-api',
    authScheme: 'bearer', testPath: '/api/v3/models',
  },
  {
    id: 'fal', displayName: 'fal', description: '统一队列 API；首批接入 HappyHorse 1.0。',
    logoPath: './providers/fal.svg', baseUrl: 'https://queue.fal.run', requiresCredential: true,
    credentialPlaceholder: 'fal_…', docsUrl: 'https://fal.ai/docs/model-apis/model-endpoints/queue',
    authScheme: 'key',
  },
  {
    id: 'dashscope', displayName: '阿里云百炼', description: '通义万相 Wan 系列视频生成。',
    logoPath: './providers/alibaba-cloud.svg', baseUrl: 'https://dashscope.aliyuncs.com', requiresCredential: true,
    credentialPlaceholder: 'sk-…', docsUrl: 'https://help.aliyun.com/zh/model-studio/wan-video-generation-api-reference',
    authScheme: 'bearer', testPath: '/api/v1/models',
  },
];

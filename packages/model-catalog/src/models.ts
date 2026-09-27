import type { ParamField } from '@ilmheg/contracts';
import { bailianQualityModels } from './bailian';
import type { CapabilityManifest, EndpointManifest, ModelManifest, VideoMode } from './manifest';
import {
  createVideoParams,
  googleImageParams,
  happyHorseImageVideoParams,
  happyHorseTextVideoParams,
  imageParams,
  minimaxImageParams,
  mockImageParams,
  selectParam,
  wan27VideoParams,
  xaiImageParams,
} from './presets';

const imageCapabilities: CapabilityManifest[] = [
  { kind: 'text_to_image', minImages: 0, maxImages: 0, maxOutputs: 4 },
  { kind: 'image_to_image', minImages: 1, maxImages: 8, maxOutputs: 4 },
];

const allVideoModes: VideoMode[] = ['text', 'first_frame', 'first_last', 'reference'];

function openAiImageModel(id: string, displayName: string, description: string, quality: string[]): ModelManifest {
  const params = imageParams.map((field) => field.key === 'quality'
    ? selectParam('quality', '生成质量', quality, quality.includes('medium') ? 'medium' : quality[0])
    : field);
  return {
    id, providerId: 'openai', displayName, kind: 'image', upstreamModel: id, description,
    endpoints: [
      {
        id: `${id}-generate`, displayName: '文生图', path: '/v1/images/generations', protocol: 'openai-image', requestEncoding: 'json', responseMode: 'sync',
        capabilities: [imageCapabilities[0]!], params,
      },
      {
        id: `${id}-edit`, displayName: '图片编辑', path: '/v1/images/edits', protocol: 'openai-image', requestEncoding: 'multipart', responseMode: 'sync',
        capabilities: [imageCapabilities[1]!], params,
      },
    ],
  };
}

function googleImageModel(id: string, displayName: string, description: string, params: ParamField[], maxImages: number): ModelManifest {
  return {
    id, providerId: 'google', displayName, kind: 'image', upstreamModel: id, description,
    endpoints: [{
      id: `${id}-interaction`, displayName: '生成 / 编辑', path: '/v1beta/interactions', protocol: 'google-image', requestEncoding: 'json', responseMode: 'sync',
      capabilities: [
        { kind: 'text_to_image', minImages: 0, maxImages: 0, maxOutputs: 1 },
        { kind: 'image_to_image', minImages: 1, maxImages, maxOutputs: 1 },
      ],
      params,
    }],
  };
}

function veoModel(id: string, displayName: string, description: string): ModelManifest {
  return {
    id, providerId: 'google', displayName, kind: 'video', upstreamModel: id, description,
    endpoints: [{
      id: `${id}-generate`, displayName: '文本 / 首尾帧 / 参考生视频',
      path: '/v1beta/models/{model}:predictLongRunning', pollPath: '/v1beta/{taskId}',
      protocol: 'google-video', requestEncoding: 'json', responseMode: 'async',
      capabilities: [{ kind: 'image_to_video', minImages: 0, maxImages: 3, maxOutputs: 1, videoModes: allVideoModes }],
      params: createVideoParams({ resolutions: ['720p', '1080p', '4k'], ratios: ['16:9', '9:16'], defaultRatio: '16:9', maxDuration: 8, durations: [4, 6, 8] }),
    }],
  };
}

function minimaxLegacyVideo(id: string, displayName: string, description: string, modes: VideoMode[], minImages: number, maxImages: number): ModelManifest {
  return {
    id: id.toLowerCase(), providerId: 'minimax', displayName, kind: 'video', upstreamModel: id, description,
    endpoints: [{
      id: `${id.toLowerCase()}-generate`, displayName: modes.includes('text') ? '文本 / 图片生视频' : '图片生视频',
      path: '/v1/video_generation', pollPath: '/v1/query/video_generation?task_id={taskId}',
      protocol: 'minimax-video', requestEncoding: 'json', responseMode: 'async',
      capabilities: [{ kind: 'image_to_video', minImages, maxImages, maxOutputs: 1, videoModes: modes }],
      params: [],
    }],
  };
}

function arkVideoModel(id: string, displayName: string, description: string, maxImages: number, resolutions: string[]): ModelManifest {
  return {
    id, providerId: 'volcengine', displayName, kind: 'video', upstreamModel: id, description,
    endpoints: [{
      id: `${id}-generate`, displayName: '文本 / 首尾帧 / 全模态参考',
      path: '/api/v3/contents/generations/tasks', pollPath: '/api/v3/contents/generations/tasks/{taskId}',
      protocol: 'ark-video', requestEncoding: 'json', responseMode: 'async',
      capabilities: [{ kind: 'image_to_video', minImages: 0, maxImages, maxOutputs: 1, videoModes: allVideoModes }],
      params: createVideoParams({ resolutions, ratios: ['adaptive', '21:9', '16:9', '9:16', '1:1', '4:3', '3:4'], defaultRatio: 'adaptive', minDuration: 4, maxDuration: 15, audio: true }),
    }],
  };
}

export const models: ModelManifest[] = [
  {
    id: 'mock-image', providerId: 'mock', displayName: 'Dream Sketch Local', kind: 'image', upstreamModel: 'mock-image',
    description: '无需密钥，用于验证文生图与图生图完整链路。',
    endpoints: [{
      id: 'mock-image-generate', displayName: '生成 / 编辑', path: '/images', protocol: 'mock', requestEncoding: 'json', responseMode: 'sync',
      capabilities: [
        { kind: 'text_to_image', minImages: 0, maxImages: 0, maxOutputs: 4 },
        { kind: 'image_to_image', minImages: 1, maxImages: 6, maxOutputs: 4 },
      ], params: mockImageParams,
    }],
  },
  {
    id: 'mock-video', providerId: 'mock', displayName: 'Motion Study Local', kind: 'video', upstreamModel: 'mock-video',
    description: '无需密钥，模拟异步视频生成、轮询、取消与恢复。',
    endpoints: [{
      id: 'mock-video-generate', displayName: '文本 / 图片生视频', path: '/videos', pollPath: '/videos/{taskId}', protocol: 'mock', requestEncoding: 'json', responseMode: 'async',
      capabilities: [{ kind: 'image_to_video', minImages: 0, maxImages: 6, maxOutputs: 1, videoModes: allVideoModes }],
      params: createVideoParams({ resolutions: ['720p'], ratios: ['16:9', '9:16', '1:1'], defaultRatio: '16:9', minDuration: 2, maxDuration: 8 }),
    }],
  },

  openAiImageModel('gpt-image-2.5-sunburst', 'GPT Image 2.5 Sunburst', 'OpenAI 高精度图片生成与编辑模型。', ['low', 'medium', 'high', 'xhigh', 'max']),
  openAiImageModel('gpt-image-2.5-flare', 'GPT Image 2.5 Flare', 'OpenAI 快速、高质量日常图片生成模型。', ['low', 'medium', 'high', 'xhigh', 'max']),
  openAiImageModel('gpt-image-2', 'GPT Image 2', 'OpenAI 图片生成与高保真多图编辑。', ['low', 'medium', 'high']),

  {
    id: 'grok-imagine-image-2.0', providerId: 'xai', displayName: 'Grok Imagine Image 2.0', kind: 'image', upstreamModel: 'grok-imagine-image-2.0',
    description: 'xAI 1K/2K 图片生成与最多五张参考图编辑。',
    endpoints: [
      {
        id: 'grok-imagine-image-generate', displayName: '文生图', path: '/v1/images/generations', protocol: 'xai-image', requestEncoding: 'json', responseMode: 'sync',
        capabilities: [{ kind: 'text_to_image', minImages: 0, maxImages: 0, maxOutputs: 10 }], params: xaiImageParams,
      },
      {
        id: 'grok-imagine-image-edit', displayName: '图片编辑', path: '/v1/images/edits', protocol: 'xai-image', requestEncoding: 'json', responseMode: 'sync',
        capabilities: [{ kind: 'image_to_image', minImages: 1, maxImages: 5, maxOutputs: 10 }], params: xaiImageParams,
      },
    ],
  },
  {
    id: 'grok-imagine-video-1.5', providerId: 'xai', displayName: 'Grok Imagine Video 1.5', kind: 'video', upstreamModel: 'grok-imagine-video-1.5',
    description: 'xAI 文本、首尾帧与多参考图生视频，最高 1080p / 15 秒并支持原生音频。',
    endpoints: [{
      id: 'grok-imagine-video-generate', displayName: '文本 / 首尾帧 / 参考生视频', path: '/v1/videos/generations', pollPath: '/v1/videos/{taskId}',
      protocol: 'xai-video', requestEncoding: 'json', responseMode: 'async',
      capabilities: [{ kind: 'image_to_video', minImages: 0, maxImages: 5, maxOutputs: 1, videoModes: allVideoModes }],
      params: createVideoParams({ resolutions: ['480p', '720p', '1080p'], ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'], defaultRatio: '16:9', minDuration: 1, maxDuration: 15, audio: true }),
    }],
  },

  googleImageModel('gemini-3.1-flash-lite-image', 'Nano Banana 2 Lite', 'Google 最快、成本最低的图片生成模型。', googleImageParams(['1K']), 1),
  googleImageModel('gemini-3.1-flash-image', 'Nano Banana 2', 'Google 通用图片生成与编辑模型，支持最高 4K。', googleImageParams(), 14),
  googleImageModel('gemini-3-pro-image', 'Nano Banana Pro', 'Google 面向复杂指令、品牌一致性与专业资产的图片模型。', googleImageParams(), 14),
  googleImageModel('gemini-2.5-flash-image', 'Nano Banana', 'Google 低延迟图片生成与编辑模型。', googleImageParams(['1K']), 3),
  veoModel('veo-3.1-generate-preview', 'Veo 3.1', 'Google 原生音频视频生成，支持文本、首尾帧与参考图。'),
  veoModel('veo-3.1-fast-generate-preview', 'Veo 3.1 Fast', 'Google 低延迟原生音频视频生成。'),

  {
    id: 'minimax-image-01', providerId: 'minimax', displayName: 'MiniMax Image-01', kind: 'image', upstreamModel: 'image-01',
    description: 'MiniMax 图片生成与主体参考工作流。',
    endpoints: [{
      id: 'minimax-image-01-generate', displayName: '生成 / 主体参考', path: '/v1/image_generation', protocol: 'minimax-image', requestEncoding: 'json', responseMode: 'sync',
      capabilities: [
        { kind: 'text_to_image', minImages: 0, maxImages: 0, maxOutputs: 9 },
        { kind: 'image_to_image', minImages: 1, maxImages: 1, maxOutputs: 9 },
      ], params: minimaxImageParams,
    }],
  },
  minimaxLegacyVideo('MiniMax-Hailuo-2.3', 'MiniMax Hailuo 2.3', 'MiniMax 文本或首帧生视频。', ['text', 'first_frame'], 0, 1),
  minimaxLegacyVideo('MiniMax-Hailuo-2.3-Fast', 'MiniMax Hailuo 2.3 Fast', 'MiniMax 低延迟首帧生视频。', ['first_frame'], 1, 1),
  minimaxLegacyVideo('MiniMax-Hailuo-02', 'MiniMax Hailuo 02', 'MiniMax 首帧或首尾帧生视频。', ['first_frame', 'first_last'], 1, 2),
  {
    id: 'minimax-h3', providerId: 'minimax', displayName: 'MiniMax H3', kind: 'video', upstreamModel: 'MiniMax-H3',
    description: 'MiniMax 2K 全模态视频生成，支持首尾帧与参考图。',
    endpoints: [{
      id: 'minimax-h3-generate', displayName: '全模态视频生成', path: '/v2/video_generation', pollPath: '/v2/query/video_generation/{taskId}',
      protocol: 'minimax-video', requestEncoding: 'json', responseMode: 'async',
      capabilities: [{ kind: 'image_to_video', minImages: 0, maxImages: 9, maxOutputs: 1, videoModes: allVideoModes }],
      params: createVideoParams({ resolutions: ['2K'], ratios: ['adaptive', '21:9', '16:9', '9:16', '1:1', '4:3', '3:4'], defaultRatio: 'adaptive', minDuration: 4, maxDuration: 15 }),
    }],
  },

  arkVideoModel('doubao-seedance-2-5-260628', 'Seedance 2.5', '字节跳动全模态视频生成，支持多参考素材与原生音频。', 30, ['480p', '720p', '1080p', '4k']),
  arkVideoModel('doubao-seedance-2-0-260128', 'Seedance 2.0', '字节跳动全模态视频生成与编辑模型。', 9, ['480p', '720p', '1080p', '4k']),
  arkVideoModel('doubao-seedance-2-0-mini-260615', 'Seedance 2.0 Mini', '字节跳动轻量、低成本全模态视频模型。', 9, ['480p', '720p']),

  {
    id: 'happyhorse-1.0', providerId: 'fal', displayName: 'HappyHorse 1.0', kind: 'video', upstreamModel: 'happyhorse-1.0',
    description: '通过 fal 官方合作队列接入的音画同步视频模型。',
    endpoints: [
      {
        id: 'happyhorse-text-to-video', displayName: '文生视频', path: '/alibaba/happy-horse/text-to-video', pollPath: '/alibaba/happy-horse/text-to-video/requests/{taskId}/status',
        protocol: 'fal-queue', requestEncoding: 'json', responseMode: 'async',
        capabilities: [{ kind: 'image_to_video', minImages: 0, maxImages: 0, maxOutputs: 1, videoModes: ['text'] }],
        params: happyHorseTextVideoParams,
      },
      {
        id: 'happyhorse-image-to-video', displayName: '图生视频', path: '/alibaba/happy-horse/image-to-video', pollPath: '/alibaba/happy-horse/image-to-video/requests/{taskId}/status',
        protocol: 'fal-queue', requestEncoding: 'json', responseMode: 'async',
        capabilities: [{ kind: 'image_to_video', minImages: 1, maxImages: 1, maxOutputs: 1, videoModes: ['first_frame'] }],
        params: happyHorseImageVideoParams,
      },
      {
        id: 'happyhorse-reference-to-video', displayName: '参考生视频', path: '/alibaba/happy-horse/reference-to-video', pollPath: '/alibaba/happy-horse/reference-to-video/requests/{taskId}/status',
        protocol: 'fal-queue', requestEncoding: 'json', responseMode: 'async',
        capabilities: [{ kind: 'image_to_video', minImages: 1, maxImages: 9, maxOutputs: 1, videoModes: ['reference'] }],
        params: happyHorseTextVideoParams,
      },
    ],
  },

  ...bailianQualityModels,

  {
    id: 'wan2.7-i2v', providerId: 'dashscope', displayName: 'Wan 2.7 图生视频', kind: 'video', upstreamModel: 'wan2.7-i2v-2026-04-25',
    description: '首帧或首尾帧生成视频，任务完成后自动保存到本地。',
    endpoints: [{
      id: 'wan27-image-to-video', displayName: '首帧 / 首尾帧', path: '/api/v1/services/aigc/video-generation/video-synthesis', pollPath: '/api/v1/tasks/{taskId}',
      protocol: 'dashscope-video', requestEncoding: 'json', responseMode: 'async',
      capabilities: [{ kind: 'image_to_video', minImages: 1, maxImages: 2, maxOutputs: 1, videoModes: ['first_frame', 'first_last'] }], params: wan27VideoParams,
    }],
  },
  {
    id: 'wan2.7-r2v', providerId: 'dashscope', displayName: 'Wan 2.7 参考生视频', kind: 'video', upstreamModel: 'wan2.7-r2v-2026-06-12',
    description: '使用一个或多个角色/场景参考图生成视频。',
    endpoints: [{
      id: 'wan27-reference-to-video', displayName: '多参考图', path: '/api/v1/services/aigc/video-generation/video-synthesis', pollPath: '/api/v1/tasks/{taskId}',
      protocol: 'dashscope-video', requestEncoding: 'json', responseMode: 'async',
      capabilities: [{ kind: 'image_to_video', minImages: 1, maxImages: 5, maxOutputs: 1, videoModes: ['reference'] }], params: wan27VideoParams,
    }],
  },
];

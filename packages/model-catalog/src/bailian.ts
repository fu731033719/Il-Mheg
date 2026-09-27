import type { ParamField } from '@ilmheg/contracts';
import type { ModelManifest } from './manifest';
import { createVideoParams, outputCountParam, selectParam, wan3VideoParams } from './presets';

const imagePath = '/api/v1/services/aigc/multimodal-generation/generation';
const watermark: ParamField = { key: 'watermark', label: '添加水印', type: 'boolean', defaultValue: false };
const twoKSizes = ['2048*2048', '2688*1536', '1536*2688', '2368*1728', '1728*2368'];
const sizeLabels = {
  '2048*2048': '2K 方形', '2688*1536': '2K 横向', '1536*2688': '2K 纵向',
  '2368*1728': '2K 横向 · 4:3', '1728*2368': '2K 纵向 · 3:4',
  '4096*4096': '4K 方形', '4096*2304': '4K 横向 · 16:9', '2304*4096': '4K 纵向 · 9:16',
  '2K': '2K · 跟随输入比例',
};

function wanImageParams(edit: boolean): ParamField[] {
  return [
    selectParam('size', '画面尺寸', edit ? ['2K', ...twoKSizes] : [...twoKSizes, '4096*4096', '4096*2304', '2304*4096'], edit ? '2K' : '4096*4096', sizeLabels),
    outputCountParam,
    ...(!edit ? [{ key: 'thinking_mode', label: '思考模式', type: 'boolean' as const, defaultValue: true }] : []),
    watermark,
  ];
}

function wan3Model(id: string, displayName: string, description: string): ModelManifest {
  const params: ParamField[] = [
    ...wan3VideoParams.map((field) => field.key === 'resolution' ? { ...field, defaultValue: '1080P' } : field),
    { key: 'audio', label: '生成声音', type: 'boolean', defaultValue: true },
  ];
  const shared = {
    path: '/api/v1/services/aigc/video-generation/video-synthesis',
    pollPath: '/api/v1/tasks/{taskId}',
    protocol: 'dashscope-video' as const,
    requestEncoding: 'json' as const,
    responseMode: 'async' as const,
    params,
  };
  return {
    id, providerId: 'dashscope', displayName, description, kind: 'video', upstreamModel: id,
    endpoints: [
      { ...shared, id: `${id}-generate`, displayName: '文本 / 首帧 / 首尾帧', capabilities: [
        { kind: 'image_to_video', minImages: 0, maxImages: 2, maxOutputs: 1, videoModes: ['text', 'first_frame', 'first_last'] },
      ] },
      { ...shared, id: `${id}-reference`, displayName: '多参考图', capabilities: [
        { kind: 'image_to_video', minImages: 1, maxImages: 10, maxOutputs: 1, videoModes: ['reference'] },
      ] },
    ],
  };
}

export const bailianQualityModels: ModelManifest[] = [
  {
    id: 'qwen-image-3.0-pro', providerId: 'dashscope', displayName: 'Qwen Image 3.0 Pro', kind: 'image', upstreamModel: 'qwen-image-3.0-pro',
    description: '千问旗舰图像模型，擅长中英文文字、复杂布局和指令遵循；支持最多三张参考图编辑。',
    endpoints: [{
      id: 'qwen-image-3.0-pro-generate', displayName: '文生图 / 图片编辑', path: imagePath,
      protocol: 'dashscope-image', requestEncoding: 'json', responseMode: 'sync',
      capabilities: [
        { kind: 'text_to_image', minImages: 0, maxImages: 0, maxOutputs: 6 },
        { kind: 'image_to_image', minImages: 1, maxImages: 3, maxOutputs: 6 },
      ],
      params: [
        selectParam('size', '画面尺寸', twoKSizes, '2048*2048', sizeLabels),
        { ...outputCountParam, max: 6 },
        { key: 'prompt_extend', label: '智能扩写', type: 'boolean', defaultValue: true },
        { key: 'enable_thinking', label: '思考模式', type: 'boolean', defaultValue: true },
        watermark,
      ],
    }],
  },
  {
    id: 'wan2.7-image-pro', providerId: 'dashscope', displayName: 'Wan 2.7 Image Pro', kind: 'image', upstreamModel: 'wan2.7-image-pro',
    description: '万相高质量图像模型；文生图最高 4K，图片编辑最高 2K，支持最多九张参考图。',
    endpoints: [
      { id: 'wan2.7-image-pro-generate', displayName: '文生图 · 最高 4K', path: imagePath,
        protocol: 'dashscope-image', requestEncoding: 'json', responseMode: 'sync',
        capabilities: [{ kind: 'text_to_image', minImages: 0, maxImages: 0, maxOutputs: 4 }], params: wanImageParams(false) },
      { id: 'wan2.7-image-pro-edit', displayName: '多图编辑 · 最高 2K', path: imagePath,
        protocol: 'dashscope-image', requestEncoding: 'json', responseMode: 'sync',
        capabilities: [{ kind: 'image_to_image', minImages: 1, maxImages: 9, maxOutputs: 4 }], params: wanImageParams(true) },
    ],
  },
  wan3Model('wan3.0-video', 'Wan 3.0', '万相 3.0 标准版，支持文本、首尾帧和多参考图生视频，最高 1080P / 30 秒及原生声音。'),
  wan3Model('wan3.0-video-prime', 'Wan 3.0 Prime', '万相 3.0 高速版，能力对齐标准版，端到端生成速度更快。'),
  {
    id: 'bailian-minimax-h3', providerId: 'dashscope', displayName: 'MiniMax H3（百炼）', kind: 'video', upstreamModel: 'MiniMax/MiniMax-H3',
    description: '通过百炼北京接入 MiniMax H3，支持文本、首尾帧和最多九张参考图；最高 2K、4–15 秒。需在百炼开通该模型。',
    endpoints: (['text', 'frames', 'reference'] as const).map((mode) => ({
      id: `bailian-minimax-h3-${mode}`,
      displayName: mode === 'text' ? '文生视频' : mode === 'frames' ? '首帧 / 首尾帧' : '多参考图',
      path: '/api/v1/services/aigc/video-generation/video-synthesis', pollPath: '/api/v1/tasks/{taskId}',
      protocol: 'dashscope-video', requestEncoding: 'json', responseMode: 'async',
      mediaTransport: 'dashscope-oss', referenceImageType: 'image_url',
      capabilities: [{ kind: 'image_to_video', minImages: mode === 'text' ? 0 : 1,
        maxImages: mode === 'text' ? 0 : mode === 'frames' ? 2 : 9, maxOutputs: 1,
        videoModes: mode === 'text' ? ['text'] : mode === 'frames' ? ['first_frame', 'first_last'] : ['reference'],
      }],
      params: createVideoParams({ resolutions: ['2K', '768P'],
        ratios: mode === 'frames' ? ['adaptive'] : [...(mode === 'reference' ? ['adaptive'] : []), '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        defaultRatio: mode === 'text' ? '16:9' : 'adaptive', minDuration: 4, maxDuration: 15,
      }),
    })),
  },
];

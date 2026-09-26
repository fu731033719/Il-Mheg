import type { ParamField } from '@ilmheg/contracts';

const ratioLabels: Record<string, string> = {
  adaptive: '智能适配',
  '21:9': '超宽 · 21:9',
  '16:9': '横向 · 16:9',
  '9:16': '纵向 · 9:16',
  '1:1': '方形 · 1:1',
  '4:3': '横向 · 4:3',
  '3:4': '纵向 · 3:4',
  '3:2': '横向 · 3:2',
  '2:3': '纵向 · 2:3',
  '4:5': '纵向 · 4:5',
  '5:4': '横向 · 5:4',
};

export function selectParam(key: string, label: string, values: string[], defaultValue = values[0]!, labels: Record<string, string> = {}) : ParamField {
  return { key, label, type: 'select', defaultValue, options: values.map((value) => ({ label: labels[value] ?? value, value })) };
}

export function ratioParam(values: string[], defaultValue = values[0]!) {
  return selectParam('ratio', '画面比例', values, defaultValue, ratioLabels);
}

export const outputCountParam: ParamField = { key: 'count', label: '输出数量', type: 'number', defaultValue: 1, min: 1, max: 4, step: 1 };

export const imageParams: ParamField[] = [
  selectParam('size', '画面尺寸', ['1024x1024', '1536x1024', '1024x1536', '2048x2048', '2048x1152', '3840x2160', '2160x3840'], '1024x1024', {
    '1024x1024': '方形 · 1024 × 1024', '1536x1024': '横向 · 1536 × 1024', '1024x1536': '纵向 · 1024 × 1536',
    '2048x2048': '2K 方形', '2048x1152': '2K 横向', '3840x2160': '4K 横向', '2160x3840': '4K 纵向',
  }),
  selectParam('quality', '生成质量', ['low', 'medium', 'high'], 'medium', { low: '快速', medium: '标准', high: '精细' }),
  outputCountParam,
  selectParam('output_format', '文件格式', ['png', 'webp', 'jpeg'], 'png', { png: 'PNG', webp: 'WebP', jpeg: 'JPEG' }),
  selectParam('background', '背景', ['auto', 'opaque', 'transparent'], 'auto', { auto: '自动', opaque: '不透明', transparent: '透明' }),
];

export const mockImageParams: ParamField[] = [
  ratioParam(['1:1', '16:9', '9:16'], '1:1'),
  outputCountParam,
];

export const xaiImageParams: ParamField[] = [
  { ...ratioParam(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'], '1:1'), key: 'aspect_ratio' },
  selectParam('resolution', '分辨率', ['1k', '2k'], '1k', { '1k': '1K', '2k': '2K' }),
  { ...outputCountParam, max: 10 },
  selectParam('response_format', '返回格式', ['url', 'b64_json'], 'url', { url: 'URL', b64_json: 'Base64' }),
];

export function googleImageParams(sizes: string[] = ['1K', '2K', '4K']): ParamField[] {
  return [
    { ...ratioParam(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'], '1:1'), key: 'aspect_ratio' },
    selectParam('image_size', '图片尺寸', sizes, sizes[0]),
    selectParam('output_format', '文件格式', ['image/png', 'image/jpeg'], 'image/png', { 'image/png': 'PNG', 'image/jpeg': 'JPEG' }),
  ];
}

export const minimaxImageParams: ParamField[] = [
  { ...ratioParam(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'], '1:1'), key: 'aspect_ratio' },
  { ...outputCountParam, max: 9 },
  { key: 'seed', label: '随机种子（-1 为随机）', type: 'number', defaultValue: -1, min: -1, max: 2147483647, step: 1 },
  { key: 'prompt_optimizer', label: '提示词优化', type: 'boolean', defaultValue: true },
  { key: 'watermark', label: 'AIGC 水印', type: 'boolean', defaultValue: false },
];

const happyHorseResolution = selectParam('resolution', '分辨率', ['720p', '1080p'], '1080p', { '720p': '720p', '1080p': '1080p' });
const happyHorseDuration = selectParam('duration', '时长（秒）', Array.from({ length: 13 }, (_, index) => String(index + 3)), '5');
const happyHorseSeed: ParamField = { key: 'seed', label: '随机种子（-1 为随机）', type: 'number', defaultValue: -1, min: -1, max: 2147483647, step: 1 };
const happyHorseSafety: ParamField = { key: 'enable_safety_checker', label: '安全检查', type: 'boolean', defaultValue: true };

export const happyHorseTextVideoParams: ParamField[] = [
  happyHorseResolution,
  ratioParam(['16:9', '9:16', '1:1', '4:3', '3:4'], '16:9'),
  happyHorseDuration,
  happyHorseSeed,
  happyHorseSafety,
];

export const happyHorseImageVideoParams: ParamField[] = [
  happyHorseResolution,
  happyHorseDuration,
  happyHorseSeed,
  happyHorseSafety,
];

export function createVideoParams({ resolutions, ratios, defaultRatio, minDuration = 2, maxDuration, durations, audio = false }: {
  resolutions: string[];
  ratios: string[];
  defaultRatio: string;
  minDuration?: number;
  maxDuration: number;
  durations?: number[];
  audio?: boolean;
}): ParamField[] {
  const duration: ParamField = durations
    ? { key: 'duration', label: '时长（秒）', type: 'select', defaultValue: durations[0], options: durations.map((value) => ({ label: `${value} 秒`, value })) }
    : { key: 'duration', label: '时长（秒）', type: 'number', defaultValue: Math.max(minDuration, 5), min: minDuration, max: maxDuration, step: 1 };
  return [
    selectParam('resolution', '分辨率', resolutions, resolutions.includes('720p') ? '720p' : resolutions.includes('720P') ? '720P' : resolutions[0]),
    ratioParam(ratios, defaultRatio),
    duration,
    ...(audio ? [{ key: 'generate_audio', label: '生成音频', type: 'boolean' as const, defaultValue: true }] : []),
    { key: 'watermark', label: '添加水印', type: 'boolean', defaultValue: false },
  ];
}

export const wan27VideoParams = [
  ...createVideoParams({ resolutions: ['720P', '1080P'], ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'], defaultRatio: '16:9', maxDuration: 15 }),
  { key: 'prompt_extend', label: '智能扩写', type: 'boolean' as const, defaultValue: true },
];

export const wan3VideoParams = [
  ...createVideoParams({ resolutions: ['480P', '720P', '1080P'], ratios: ['adaptive', '21:9', '16:9', '9:16', '1:1', '4:3', '3:4'], defaultRatio: 'adaptive', maxDuration: 30 }),
  { key: 'prompt_extend', label: '智能扩写', type: 'boolean' as const, defaultValue: true },
];

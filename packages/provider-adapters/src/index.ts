import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type { ProviderOutput } from '@ilmheg/asset-store';
import type { CompiledRun } from '@ilmheg/graph-compiler';

export interface PreparedInput extends CompiledRun {
  files: Array<{ assetId: string; role: CompiledRun['inputAssets'][number]['role']; order: number; bytes: Uint8Array; mimeType: string; fileName: string; dataUrl: string }>;
}

export type SubmitOutcome =
  | { kind: 'completed'; outputs: ProviderOutput[] }
  | { kind: 'remote'; taskId: string; providerStatus?: string };
export type PollOutcome =
  | { kind: 'pending'; providerStatus?: string }
  | { kind: 'completed'; outputs: ProviderOutput[] }
  | { kind: 'failed'; message: string; providerStatus?: string };

export interface ProviderAdapter {
  readonly protocol: PreparedInput['endpoint']['protocol'];
  submit(input: PreparedInput, secret: string | undefined, signal: AbortSignal): Promise<SubmitOutcome>;
  poll?(input: PreparedInput, taskId: string, attempt: number, secret: string | undefined, signal: AbortSignal): Promise<PollOutcome>;
}

export class ProviderRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ProviderRequestError';
  }
}

class MockAdapter implements ProviderAdapter {
  readonly protocol = 'mock' as const;

  async submit(input: PreparedInput, _secret: string | undefined, signal: AbortSignal): Promise<SubmitOutcome> {
    await delay(420, signal);
    if (input.prompt.toLowerCase().includes('[fail]')) throw new ProviderRequestError(400, 'Mock 故障注入：提示词包含 [fail]');
    if (input.capability === 'image_to_video') {
      return { kind: 'remote', taskId: `mock-${randomUUID()}`, providerStatus: 'PENDING' };
    }
    const count = clampNumber(input.params.count, 1, 4, 1);
    return {
      kind: 'completed',
      outputs: Array.from({ length: count }, (_, index) => ({
        kind: 'bytes' as const,
        bytes: new TextEncoder().encode(createImageSvg(input.prompt, input.capability === 'image_to_image', index, String(input.params.ratio ?? '1:1'))),
        mimeType: 'image/svg+xml',
        fileName: `mock-image-${index + 1}.svg`,
      })),
    };
  }

  async poll(input: PreparedInput, _taskId: string, attempt: number, _secret: string | undefined, signal: AbortSignal): Promise<PollOutcome> {
    await delay(500, signal);
    if (attempt < 2) return { kind: 'pending', providerStatus: attempt === 0 ? 'PENDING' : 'RUNNING' };
    return {
      kind: 'completed',
      outputs: [{
        kind: 'bytes',
        bytes: new TextEncoder().encode(createMotionSvg(input.prompt, String(input.params.ratio ?? '16:9'))),
        mimeType: 'image/svg+xml',
        fileName: 'mock-motion-preview.svg',
      }],
    };
  }
}

class OpenAiImageAdapter implements ProviderAdapter {
  readonly protocol = 'openai-image' as const;

  async submit(input: PreparedInput, secret: string | undefined, signal: AbortSignal): Promise<SubmitOutcome> {
    const headers: Record<string, string> = secret ? { Authorization: `Bearer ${secret}` } : {};
    let body: BodyInit;
    if (input.endpoint.requestEncoding === 'multipart') {
      const form = new FormData();
      form.set('model', input.upstreamModel);
      form.set('prompt', input.prompt);
      form.set('n', String(clampNumber(input.params.count, 1, 4, 1)));
      setFormParam(form, 'size', input.params.size);
      setFormParam(form, 'quality', input.params.quality);
      setFormParam(form, 'output_format', input.params.output_format);
      input.files.forEach((file, index) => {
        const key = input.files.length === 1 ? 'image' : 'image[]';
        form.append(key, new Blob([file.bytes as BlobPart], { type: file.mimeType }), file.fileName || `image-${index + 1}${path.extname(file.fileName)}`);
      });
      body = form;
    } else {
      headers['Content-Type'] = 'application/json';
      const aliyunMaas = isAliyunMaas(input.providerBaseUrl);
      body = JSON.stringify({
        model: input.upstreamModel,
        prompt: input.prompt,
        n: clampNumber(input.params.count, 1, 4, 1),
        size: input.params.size,
        ...(input.files.length ? { image: input.files.map((file) => file.dataUrl) } : {}),
        ...(!aliyunMaas ? { quality: input.params.quality, output_format: input.params.output_format } : {}),
      });
    }
    const response = await fetch(new URL(input.endpoint.path, input.providerBaseUrl), { method: 'POST', headers, body, signal });
    const payload = await readJson(response);
    if (!response.ok) throw providerError(response.status, payload);
    const data = Array.isArray(payload.data) ? payload.data as Array<Record<string, unknown>> : [];
    const mimeType = outputMime(String(input.params.output_format ?? 'png'));
    const outputs = data.map((item): ProviderOutput | null => {
      if (typeof item.b64_json === 'string') return { kind: 'base64', data: item.b64_json, mimeType };
      if (typeof item.url === 'string') return { kind: 'remote_url', url: item.url, mimeType };
      return null;
    }).filter((item): item is ProviderOutput => Boolean(item));
    if (!outputs.length) throw new Error('RESULT_UNSUPPORTED: OpenAI 响应中没有图片');
    return { kind: 'completed', outputs };
  }
}

class DashScopeVideoAdapter implements ProviderAdapter {
  readonly protocol = 'dashscope-video' as const;

  async submit(input: PreparedInput, secret: string | undefined, signal: AbortSignal): Promise<SubmitOutcome> {
    if (!secret) throw new Error('CREDENTIAL_MISSING: 尚未配置 DashScope API Key');
    const media = input.files.map((file) => ({
      type: dashScopeMediaType(file.role),
      url: file.dataUrl,
    }));
    const response = await fetch(new URL(input.endpoint.path, input.providerBaseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: input.upstreamModel,
        input: { prompt: input.prompt, ...(media.length ? { media } : {}) },
        parameters: {
          resolution: input.params.resolution,
          ratio: input.params.ratio,
          duration: input.params.duration,
          prompt_extend: input.params.prompt_extend,
          watermark: input.params.watermark,
        },
      }),
      signal,
    });
    const payload = await readJson(response);
    if (!response.ok || typeof (payload.output as Record<string, unknown> | undefined)?.task_id !== 'string') {
      throw providerError(response.status, payload);
    }
    const output = payload.output as Record<string, unknown>;
    return { kind: 'remote', taskId: String(output.task_id), providerStatus: String(output.task_status ?? 'PENDING') };
  }

  async poll(input: PreparedInput, taskId: string, _attempt: number, secret: string | undefined, signal: AbortSignal): Promise<PollOutcome> {
    if (!secret) throw new Error('CREDENTIAL_MISSING: 尚未配置 DashScope API Key');
    const pollPath = (input.endpoint.pollPath ?? '/api/v1/tasks/{taskId}').replace('{taskId}', encodeURIComponent(taskId));
    const response = await fetch(new URL(pollPath, input.providerBaseUrl), {
      headers: { Authorization: `Bearer ${secret}` }, signal,
    });
    const payload = await readJson(response);
    if (!response.ok) throw providerError(response.status, payload);
    const output = (payload.output ?? {}) as Record<string, unknown>;
    const status = String(output.task_status ?? 'UNKNOWN');
    if (['PENDING', 'RUNNING'].includes(status)) return { kind: 'pending', providerStatus: status };
    if (status === 'SUCCEEDED' && typeof output.video_url === 'string') {
      return { kind: 'completed', outputs: [{ kind: 'remote_url', url: output.video_url, mimeType: 'video/mp4', fileName: 'wan-video.mp4' }] };
    }
    return { kind: 'failed', providerStatus: status, message: String(output.message ?? payload.message ?? '远程视频任务失败') };
  }
}

function dashScopeMediaType(role: PreparedInput['files'][number]['role']) {
  if (role === 'source') return 'first_frame';
  if (role === 'reference') return 'reference_image';
  return role;
}

export const adapters: ProviderAdapter[] = [new MockAdapter(), new OpenAiImageAdapter(), new DashScopeVideoAdapter()];

export function getAdapter(protocol: ProviderAdapter['protocol']): ProviderAdapter {
  const adapter = adapters.find((item) => item.protocol === protocol);
  if (!adapter) throw new Error(`未注册协议适配器：${protocol}`);
  return adapter;
}

function createImageSvg(prompt: string, edited: boolean, index: number, ratio: string) {
  const [width, height] = dimensions(ratio);
  const seed = createHash('sha256').update(`${prompt}:${index}`).digest();
  const a = `hsl(${seed[0] * 1.4},70%,58%)`;
  const b = `hsl(${seed[1] * 1.4},68%,36%)`;
  const c = `hsl(${seed[2] * 1.4},78%,68%)`;
  const safe = escapeXml(prompt.slice(0, 110) || 'Untitled study');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><filter id="blur"><feGaussianBlur stdDeviation="48"/></filter></defs>
  <rect width="100%" height="100%" fill="#131019"/><circle cx="${width * .28}" cy="${height * .32}" r="${Math.min(width,height)*.34}" fill="${a}" opacity=".72" filter="url(#blur)"/><circle cx="${width * .7}" cy="${height * .64}" r="${Math.min(width,height)*.32}" fill="${c}" opacity=".56" filter="url(#blur)"/>
  <path d="M0 ${height*.76} Q ${width*.3} ${height*.5} ${width*.56} ${height*.72} T ${width} ${height*.58} V${height}H0Z" fill="url(#g)" opacity=".82"/>
  <rect x="36" y="36" width="${width-72}" height="${height-72}" rx="26" fill="none" stroke="rgba(255,255,255,.24)"/>
  <text x="58" y="${height-86}" font-family="ui-sans-serif,system-ui" font-size="${Math.max(18,width/34)}" fill="white" opacity=".94">${safe}</text>
  <text x="58" y="${height-48}" font-family="ui-monospace,monospace" font-size="14" fill="white" opacity=".55">${edited ? 'IMAGE STUDY' : 'DREAM STUDY'} · LOCAL ${index+1}</text></svg>`;
}

function createMotionSvg(prompt: string, ratio: string) {
  const [width, height] = dimensions(ratio);
  const safe = escapeXml(prompt.slice(0, 90));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs><radialGradient id="bg"><stop stop-color="#6d4aa2"/><stop offset="1" stop-color="#141019"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#bg)"/>
  <circle cx="20%" cy="50%" r="15%" fill="#f0c987" opacity=".8"><animate attributeName="cx" values="20%;80%;20%" dur="4s" repeatCount="indefinite"/></circle>
  <circle cx="75%" cy="35%" r="11%" fill="#b9a4ff" opacity=".72"><animate attributeName="cy" values="25%;75%;25%" dur="3s" repeatCount="indefinite"/></circle>
  <path d="M0 ${height*.7} Q ${width*.25} ${height*.5} ${width*.5} ${height*.7} T ${width} ${height*.6}V${height}H0Z" fill="#17121f" opacity=".75"/>
  <text x="40" y="${height-58}" font-family="ui-sans-serif,system-ui" font-size="${Math.max(18,width/38)}" fill="white">${safe}</text><text x="40" y="${height-28}" font-family="ui-monospace,monospace" font-size="13" fill="white" opacity=".55">MOTION STUDY · LOCAL ASYNC PREVIEW</text></svg>`;
}

function dimensions(ratio: string): [number, number] {
  if (ratio === '16:9') return [960, 540];
  if (ratio === '9:16') return [540, 960];
  return [720, 720];
}

function escapeXml(value: string) { return value.replace(/[<>&'"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character]!); }
function clampNumber(value: unknown, min: number, max: number, fallback: number) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback; }
function setFormParam(form: FormData, key: string, value: unknown) { if (value !== undefined && value !== '') form.set(key, String(value)); }
function outputMime(format: string) { return format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png'; }
function isAliyunMaas(baseUrl: string) { const hostname = new URL(baseUrl).hostname; return hostname === 'maas.aliyuncs.com' || hostname.endsWith('.maas.aliyuncs.com'); }
function delay(ms: number, signal: AbortSignal) { return new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, ms); signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason ?? new DOMException('Aborted', 'AbortError')); }, { once: true }); }); }
async function readJson(response: Response): Promise<Record<string, unknown>> { const text = await response.text(); try { return JSON.parse(text) as Record<string, unknown>; } catch { return { message: text.slice(0, 1000) }; } }
function providerError(status: number, payload: Record<string, unknown>) { const nested = payload.error && typeof payload.error === 'object' ? payload.error as Record<string, unknown> : payload; return new ProviderRequestError(status, String(nested.message ?? payload.message ?? `Provider 请求失败 (${status})`).slice(0, 1000)); }

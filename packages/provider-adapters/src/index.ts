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
      setFormParam(form, 'background', input.params.background);
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
        ...(!aliyunMaas && input.params.background ? { background: input.params.background } : {}),
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

class XaiImageAdapter implements ProviderAdapter {
  readonly protocol = 'xai-image' as const;

  async submit(input: PreparedInput, secret: string | undefined, signal: AbortSignal): Promise<SubmitOutcome> {
    requireSecret(secret, 'xAI');
    const imageFields = input.files.map((file) => ({ type: 'image_url', url: file.dataUrl }));
    const response = await fetch(endpointUrl(input), {
      method: 'POST',
      headers: bearerJson(secret),
      body: JSON.stringify({
        model: input.upstreamModel,
        prompt: input.prompt,
        n: clampNumber(input.params.count, 1, 10, 1),
        aspect_ratio: input.params.aspect_ratio,
        resolution: input.params.resolution,
        response_format: input.params.response_format,
        ...(imageFields.length === 1 ? { image: imageFields[0] } : imageFields.length ? { images: imageFields } : {}),
      }),
      signal,
    });
    const payload = await readJson(response);
    if (!response.ok) throw providerError(response.status, payload);
    const outputs = imageOutputs(payload, 'image/jpeg');
    if (!outputs.length) throw new Error('RESULT_UNSUPPORTED: xAI 响应中没有图片');
    return { kind: 'completed', outputs };
  }
}

class XaiVideoAdapter implements ProviderAdapter {
  readonly protocol = 'xai-video' as const;

  async submit(input: PreparedInput, secret: string | undefined, signal: AbortSignal): Promise<SubmitOutcome> {
    requireSecret(secret, 'xAI');
    const first = input.files.find((file) => file.role === 'first_frame' || file.role === 'source');
    const last = input.files.find((file) => file.role === 'last_frame');
    const references = input.files.filter((file) => file.role === 'reference');
    const response = await fetch(endpointUrl(input), {
      method: 'POST', headers: bearerJson(secret), signal,
      body: JSON.stringify({
        model: input.upstreamModel, prompt: input.prompt,
        duration: input.params.duration, aspect_ratio: input.params.ratio,
        resolution: input.params.resolution, generate_audio: input.params.generate_audio,
        ...(first ? { image: { url: first.dataUrl } } : {}),
        ...(last ? { last_frame: { url: last.dataUrl } } : {}),
        ...(references.length ? { reference_images: references.map((file) => ({ url: file.dataUrl })) } : {}),
      }),
    });
    const payload = await readJson(response);
    if (!response.ok || typeof payload.request_id !== 'string') throw providerError(response.status, payload);
    return { kind: 'remote', taskId: payload.request_id, providerStatus: String(payload.status ?? 'pending') };
  }

  async poll(input: PreparedInput, taskId: string, _attempt: number, secret: string | undefined, signal: AbortSignal): Promise<PollOutcome> {
    requireSecret(secret, 'xAI');
    const response = await fetch(pollUrl(input, taskId), { headers: bearerHeaders(secret), signal });
    const payload = await readJson(response);
    if (!response.ok) throw providerError(response.status, payload);
    const status = String(payload.status ?? 'unknown').toLowerCase();
    if (['pending', 'queued', 'in_progress', 'running'].includes(status)) return { kind: 'pending', providerStatus: status };
    const video = asRecord(payload.video);
    if (status === 'done' && typeof video.url === 'string') {
      return { kind: 'completed', outputs: [{ kind: 'remote_url', url: video.url, mimeType: 'video/mp4', fileName: 'grok-video.mp4' }] };
    }
    return { kind: 'failed', providerStatus: status, message: nestedMessage(payload, `xAI 视频任务状态：${status}`) };
  }
}

class GoogleImageAdapter implements ProviderAdapter {
  readonly protocol = 'google-image' as const;

  async submit(input: PreparedInput, secret: string | undefined, signal: AbortSignal): Promise<SubmitOutcome> {
    requireSecret(secret, 'Gemini');
    const interactionInput: unknown = input.files.length
      ? [
        { type: 'text', text: input.prompt },
        ...input.files.map((file) => ({ type: 'image', mime_type: file.mimeType, data: base64FromDataUrl(file.dataUrl) })),
      ]
      : input.prompt;
    const response = await fetch(endpointUrl(input), {
      method: 'POST', headers: googleJson(secret), signal,
      body: JSON.stringify({
        model: input.upstreamModel,
        input: interactionInput,
        response_format: {
          type: 'image', mime_type: input.params.output_format,
          aspect_ratio: input.params.aspect_ratio, image_size: input.params.image_size,
        },
      }),
    });
    const payload = await readJson(response);
    if (!response.ok) throw providerError(response.status, payload);
    const images = collectObjects(payload, (item) => item.type === 'image' && typeof item.data === 'string');
    const direct = asRecord(payload.output_image);
    if (!images.length && typeof direct.data === 'string') images.push(direct);
    const outputs = images.map((item): ProviderOutput => ({
      kind: 'base64', data: String(item.data), mimeType: String(item.mime_type ?? input.params.output_format ?? 'image/png'),
    }));
    if (!outputs.length) throw new Error('RESULT_UNSUPPORTED: Gemini 响应中没有图片');
    return { kind: 'completed', outputs };
  }
}

class GoogleVideoAdapter implements ProviderAdapter {
  readonly protocol = 'google-video' as const;

  async submit(input: PreparedInput, secret: string | undefined, signal: AbortSignal): Promise<SubmitOutcome> {
    requireSecret(secret, 'Gemini');
    const first = input.files.find((file) => file.role === 'first_frame' || file.role === 'source');
    const last = input.files.find((file) => file.role === 'last_frame');
    const references = input.files.filter((file) => file.role === 'reference');
    const imageValue = (file: PreparedInput['files'][number]) => ({ inlineData: { mimeType: file.mimeType, data: base64FromDataUrl(file.dataUrl) } });
    const instance = {
      prompt: input.prompt,
      ...(first ? { image: imageValue(first) } : {}),
      ...(last ? { lastFrame: imageValue(last) } : {}),
      ...(references.length ? { referenceImages: references.map((file) => ({ image: imageValue(file), referenceType: 'asset' })) } : {}),
    };
    const response = await fetch(endpointUrl(input), {
      method: 'POST', headers: googleJson(secret), signal,
      body: JSON.stringify({ instances: [instance], parameters: {
        aspectRatio: input.params.ratio, durationSeconds: Number(input.params.duration), resolution: input.params.resolution,
      } }),
    });
    const payload = await readJson(response);
    if (!response.ok || typeof payload.name !== 'string') throw providerError(response.status, payload);
    return { kind: 'remote', taskId: payload.name, providerStatus: 'PENDING' };
  }

  async poll(input: PreparedInput, taskId: string, _attempt: number, secret: string | undefined, signal: AbortSignal): Promise<PollOutcome> {
    requireSecret(secret, 'Gemini');
    const response = await fetch(pollUrl(input, taskId), { headers: googleHeaders(secret), signal });
    const payload = await readJson(response);
    if (!response.ok) throw providerError(response.status, payload);
    if (!payload.done) return { kind: 'pending', providerStatus: 'RUNNING' };
    if (payload.error) return { kind: 'failed', providerStatus: 'FAILED', message: nestedMessage(payload, 'Veo 视频任务失败') };
    const uri = firstStringAtPaths(payload, [
      ['response', 'generateVideoResponse', 'generatedSamples', '0', 'video', 'uri'],
      ['response', 'generatedVideos', '0', 'video', 'uri'],
    ]);
    if (!uri) return { kind: 'failed', providerStatus: 'SUCCEEDED', message: 'Veo 任务完成但没有返回视频地址' };
    const mediaResponse = await fetch(uri, { headers: googleHeaders(secret), signal, redirect: 'follow' });
    if (!mediaResponse.ok) throw new ProviderRequestError(mediaResponse.status, `Veo 视频下载失败 (${mediaResponse.status})`);
    return { kind: 'completed', outputs: [{ kind: 'bytes', bytes: new Uint8Array(await mediaResponse.arrayBuffer()), mimeType: mediaResponse.headers.get('content-type') ?? 'video/mp4', fileName: 'veo-video.mp4' }] };
  }
}

class MiniMaxImageAdapter implements ProviderAdapter {
  readonly protocol = 'minimax-image' as const;

  async submit(input: PreparedInput, secret: string | undefined, signal: AbortSignal): Promise<SubmitOutcome> {
    requireSecret(secret, 'MiniMax');
    const reference = input.files[0];
    const response = await fetch(endpointUrl(input), {
      method: 'POST', headers: bearerJson(secret), signal,
      body: JSON.stringify({
        model: input.upstreamModel, prompt: input.prompt,
        aspect_ratio: input.params.aspect_ratio, n: input.params.count, seed: input.params.seed,
        prompt_optimizer: input.params.prompt_optimizer, aigc_watermark: input.params.watermark,
        response_format: 'base64',
        ...(reference ? { subject_reference: [{ type: 'character', image_file: reference.dataUrl }] } : {}),
      }),
    });
    const payload = await readJson(response);
    if (!response.ok || miniMaxFailed(payload)) throw providerError(response.status || 400, payload);
    const data = asRecord(payload.data);
    const encoded = Array.isArray(data.image_base64) ? data.image_base64 : [];
    const urls = Array.isArray(data.image_urls) ? data.image_urls : [];
    const outputs: ProviderOutput[] = [
      ...encoded.filter((value): value is string => typeof value === 'string').map((value) => ({ kind: 'base64' as const, data: value, mimeType: 'image/jpeg' })),
      ...urls.filter((value): value is string => typeof value === 'string').map((url) => ({ kind: 'remote_url' as const, url, mimeType: 'image/jpeg' })),
    ];
    if (!outputs.length) throw new Error('RESULT_UNSUPPORTED: MiniMax 响应中没有图片');
    return { kind: 'completed', outputs };
  }
}

class MiniMaxVideoAdapter implements ProviderAdapter {
  readonly protocol = 'minimax-video' as const;

  async submit(input: PreparedInput, secret: string | undefined, signal: AbortSignal): Promise<SubmitOutcome> {
    requireSecret(secret, 'MiniMax');
    const v2 = input.endpoint.path.startsWith('/v2/');
    const first = input.files.find((file) => file.role === 'first_frame' || file.role === 'source');
    const last = input.files.find((file) => file.role === 'last_frame');
    const references = input.files.filter((file) => file.role === 'reference');
    const body = v2 ? {
      model: input.upstreamModel,
      content: [
        { type: 'text', text: input.prompt },
        ...(first ? [{ type: 'image_url', image_url: { url: first.dataUrl }, role: 'first_frame' }] : []),
        ...(last ? [{ type: 'image_url', image_url: { url: last.dataUrl }, role: 'last_frame' }] : []),
        ...references.map((file) => ({ type: 'image_url', image_url: { url: file.dataUrl }, role: 'reference_image' })),
      ],
      resolution: input.params.resolution, duration: input.params.duration, ratio: input.params.ratio,
    } : {
      model: input.upstreamModel, prompt: input.prompt,
      ...(first ? { first_frame_image: first.dataUrl } : {}),
      ...(last ? { last_frame_image: last.dataUrl } : {}),
    };
    const response = await fetch(endpointUrl(input), { method: 'POST', headers: bearerJson(secret), body: JSON.stringify(body), signal });
    const payload = await readJson(response);
    if (!response.ok || miniMaxFailed(payload) || typeof payload.task_id !== 'string') throw providerError(response.status || 400, payload);
    return { kind: 'remote', taskId: payload.task_id, providerStatus: String(payload.status ?? 'Queueing') };
  }

  async poll(input: PreparedInput, taskId: string, _attempt: number, secret: string | undefined, signal: AbortSignal): Promise<PollOutcome> {
    requireSecret(secret, 'MiniMax');
    const v2 = input.endpoint.path.startsWith('/v2/');
    const response = await fetch(pollUrl(input, taskId), { headers: bearerHeaders(secret), signal });
    const payload = await readJson(response);
    if (!response.ok || miniMaxFailed(payload)) throw providerError(response.status || 400, payload);
    if (v2) {
      const task = asRecord(payload.task);
      const status = String(task.status ?? 'unknown').toLowerCase();
      if (['queued', 'running'].includes(status)) return { kind: 'pending', providerStatus: status };
      const content = asRecord(task.content);
      if (status === 'succeeded' && typeof content.url === 'string') return { kind: 'completed', outputs: [{ kind: 'remote_url', url: content.url, mimeType: 'video/mp4', fileName: 'minimax-h3.mp4' }] };
      return { kind: 'failed', providerStatus: status, message: nestedMessage(task, 'MiniMax H3 视频任务失败') };
    }
    const status = String(payload.status ?? 'Unknown');
    if (['Queueing', 'Processing'].includes(status)) return { kind: 'pending', providerStatus: status };
    if (status !== 'Success' || typeof payload.file_id !== 'string') return { kind: 'failed', providerStatus: status, message: nestedMessage(payload, 'MiniMax 视频任务失败') };
    const fileResponse = await fetch(new URL(`/v1/files/retrieve?file_id=${encodeURIComponent(payload.file_id)}`, input.providerBaseUrl), { headers: bearerHeaders(secret), signal });
    const filePayload = await readJson(fileResponse);
    if (!fileResponse.ok || miniMaxFailed(filePayload)) throw providerError(fileResponse.status || 400, filePayload);
    const file = asRecord(filePayload.file);
    if (typeof file.download_url !== 'string') return { kind: 'failed', providerStatus: status, message: 'MiniMax 任务完成但没有返回下载地址' };
    return { kind: 'completed', outputs: [{ kind: 'remote_url', url: file.download_url, mimeType: 'video/mp4', fileName: 'minimax-video.mp4' }] };
  }
}

class ArkVideoAdapter implements ProviderAdapter {
  readonly protocol = 'ark-video' as const;

  async submit(input: PreparedInput, secret: string | undefined, signal: AbortSignal): Promise<SubmitOutcome> {
    requireSecret(secret, '火山方舟');
    const content = [
      { type: 'text', text: input.prompt },
      ...input.files.map((file) => ({ type: 'image_url', image_url: { url: file.dataUrl }, role: arkRole(file.role) })),
    ];
    const response = await fetch(endpointUrl(input), {
      method: 'POST', headers: bearerJson(secret), signal,
      body: JSON.stringify({
        model: input.upstreamModel, content,
        resolution: input.params.resolution, ratio: input.params.ratio, duration: input.params.duration,
        generate_audio: input.params.generate_audio, watermark: input.params.watermark,
      }),
    });
    const payload = await readJson(response);
    if (!response.ok || typeof payload.id !== 'string') throw providerError(response.status, payload);
    return { kind: 'remote', taskId: payload.id, providerStatus: String(payload.status ?? 'queued') };
  }

  async poll(input: PreparedInput, taskId: string, _attempt: number, secret: string | undefined, signal: AbortSignal): Promise<PollOutcome> {
    requireSecret(secret, '火山方舟');
    const response = await fetch(pollUrl(input, taskId), { headers: bearerHeaders(secret), signal });
    const payload = await readJson(response);
    if (!response.ok) throw providerError(response.status, payload);
    const status = String(payload.status ?? 'unknown').toLowerCase();
    if (['queued', 'running'].includes(status)) return { kind: 'pending', providerStatus: status };
    const content = asRecord(payload.content);
    if (status === 'succeeded' && typeof content.video_url === 'string') return { kind: 'completed', outputs: [{ kind: 'remote_url', url: content.video_url, mimeType: 'video/mp4', fileName: 'seedance-video.mp4' }] };
    return { kind: 'failed', providerStatus: status, message: nestedMessage(payload, 'Seedance 视频任务失败') };
  }
}

class FalQueueAdapter implements ProviderAdapter {
  readonly protocol = 'fal-queue' as const;

  async submit(input: PreparedInput, secret: string | undefined, signal: AbortSignal): Promise<SubmitOutcome> {
    requireSecret(secret, 'fal');
    const first = input.files[0];
    const referenceMode = input.endpoint.path.endsWith('/reference-to-video');
    const seed = Number(input.params.seed);
    const response = await fetch(endpointUrl(input), {
      method: 'POST', headers: keyJson(secret), signal,
      body: JSON.stringify({
        prompt: input.prompt, duration: Number(input.params.duration), resolution: input.params.resolution,
        ...(input.params.ratio ? { aspect_ratio: input.params.ratio } : {}),
        ...(Number.isInteger(seed) && seed >= 0 ? { seed } : {}),
        enable_safety_checker: input.params.enable_safety_checker,
        ...(referenceMode ? { image_urls: input.files.map((file) => file.dataUrl) } : first ? { image_url: first.dataUrl } : {}),
      }),
    });
    const payload = await readJson(response);
    if (!response.ok || typeof payload.request_id !== 'string') throw providerError(response.status, payload);
    return { kind: 'remote', taskId: payload.request_id, providerStatus: String(payload.status ?? 'IN_QUEUE') };
  }

  async poll(input: PreparedInput, taskId: string, _attempt: number, secret: string | undefined, signal: AbortSignal): Promise<PollOutcome> {
    requireSecret(secret, 'fal');
    const statusUrl = pollUrl(input, taskId);
    const response = await fetch(statusUrl, { headers: keyHeaders(secret), signal });
    const payload = await readJson(response);
    if (!response.ok) throw providerError(response.status, payload);
    const status = String(payload.status ?? 'UNKNOWN').toUpperCase();
    if (['IN_QUEUE', 'IN_PROGRESS'].includes(status)) return { kind: 'pending', providerStatus: status };
    if (status !== 'COMPLETED') return { kind: 'failed', providerStatus: status, message: nestedMessage(payload, 'fal 队列任务失败') };
    const resultResponse = await fetch(statusUrl.toString().replace(/\/status(?:\?.*)?$/, ''), { headers: keyHeaders(secret), signal });
    const result = await readJson(resultResponse);
    if (!resultResponse.ok) throw providerError(resultResponse.status, result);
    const url = findMediaUrl(result);
    if (!url) return { kind: 'failed', providerStatus: status, message: 'fal 任务完成但没有返回视频地址' };
    return { kind: 'completed', outputs: [{ kind: 'remote_url', url, mimeType: 'video/mp4', fileName: 'happyhorse-video.mp4' }] };
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

export const adapters: ProviderAdapter[] = [
  new MockAdapter(),
  new OpenAiImageAdapter(),
  new XaiImageAdapter(),
  new XaiVideoAdapter(),
  new GoogleImageAdapter(),
  new GoogleVideoAdapter(),
  new MiniMaxImageAdapter(),
  new MiniMaxVideoAdapter(),
  new ArkVideoAdapter(),
  new FalQueueAdapter(),
  new DashScopeVideoAdapter(),
];

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

function requireSecret(secret: string | undefined, provider: string): asserts secret is string {
  if (!secret) throw new Error(`CREDENTIAL_MISSING: 尚未配置 ${provider} API Key`);
}

function bearerHeaders(secret: string) { return { Authorization: `Bearer ${secret}` }; }
function bearerJson(secret: string) { return { ...bearerHeaders(secret), 'Content-Type': 'application/json' }; }
function googleHeaders(secret: string) { return { 'x-goog-api-key': secret }; }
function googleJson(secret: string) { return { ...googleHeaders(secret), 'Content-Type': 'application/json' }; }
function keyHeaders(secret: string) { return { Authorization: `Key ${secret}` }; }
function keyJson(secret: string) { return { ...keyHeaders(secret), 'Content-Type': 'application/json' }; }

function endpointUrl(input: PreparedInput) {
  const pathname = input.endpoint.path.replace('{model}', encodeURIComponent(input.upstreamModel));
  return new URL(pathname, input.providerBaseUrl);
}

function pollUrl(input: PreparedInput, taskId: string) {
  const safeTaskId = taskId.split('/').map(encodeURIComponent).join('/');
  const pathname = (input.endpoint.pollPath ?? '').replace('{taskId}', safeTaskId).replace('{model}', encodeURIComponent(input.upstreamModel));
  return new URL(pathname, input.providerBaseUrl);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function base64FromDataUrl(value: string) {
  const comma = value.indexOf(',');
  return comma >= 0 ? value.slice(comma + 1) : value;
}

function imageOutputs(payload: Record<string, unknown>, mimeType: string): ProviderOutput[] {
  const data = Array.isArray(payload.data) ? payload.data : [];
  return data.map((value): ProviderOutput | null => {
    const item = asRecord(value);
    if (typeof item.b64_json === 'string') return { kind: 'base64', data: item.b64_json, mimeType };
    if (typeof item.url === 'string') return { kind: 'remote_url', url: item.url, mimeType };
    return null;
  }).filter((value): value is ProviderOutput => Boolean(value));
}

function collectObjects(value: unknown, predicate: (item: Record<string, unknown>) => boolean, result: Record<string, unknown>[] = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectObjects(item, predicate, result));
  } else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (predicate(record)) result.push(record);
    Object.values(record).forEach((item) => collectObjects(item, predicate, result));
  }
  return result;
}

function firstStringAtPaths(value: unknown, paths: string[][]) {
  for (const pathParts of paths) {
    let current: unknown = value;
    for (const part of pathParts) {
      if (Array.isArray(current)) current = current[Number(part)];
      else current = asRecord(current)[part];
    }
    if (typeof current === 'string') return current;
  }
  return undefined;
}

function nestedMessage(payload: Record<string, unknown>, fallback: string) {
  const error = asRecord(payload.error);
  const task = asRecord(payload.task);
  const taskError = asRecord(task.error);
  return String(error.message ?? taskError.message ?? payload.message ?? fallback).slice(0, 1000);
}

function miniMaxFailed(payload: Record<string, unknown>) {
  const base = asRecord(payload.base_resp);
  return typeof base.status_code === 'number' && base.status_code !== 0;
}

function arkRole(role: PreparedInput['files'][number]['role']) {
  if (role === 'source' || role === 'first_frame') return 'first_frame';
  if (role === 'last_frame') return 'last_frame';
  return 'reference_image';
}

function findMediaUrl(payload: Record<string, unknown>) {
  const candidates = collectObjects(payload, (item) => typeof item.url === 'string');
  const video = candidates.find((item) => typeof item.url === 'string' && (/video/.test(String(item.content_type ?? item.mime_type ?? '')) || /\.(mp4|mov|webm)(?:\?|$)/i.test(String(item.url))));
  return typeof (video ?? candidates[0])?.url === 'string' ? String((video ?? candidates[0])!.url) : undefined;
}

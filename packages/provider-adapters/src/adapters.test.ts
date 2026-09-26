import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAdapter, type PreparedInput } from './index';
import { getModel, getProvider, resolveCustomModel } from '@ilmheg/model-catalog';

afterEach(() => vi.restoreAllMocks());

function builtInInput(modelId: string, endpointIndex: number, params: Record<string, unknown>, files: PreparedInput['files'] = []): PreparedInput {
  const model = getModel(modelId);
  const endpoint = model.endpoints[endpointIndex]!;
  const provider = getProvider(model.providerId);
  return {
    schemaVersion: 1, projectId: crypto.randomUUID(), nodeId: crypto.randomUUID(), graphRevision: 1,
    providerId: provider.id, providerBaseUrl: provider.baseUrl, requiresCredential: provider.requiresCredential,
    modelId: model.id, upstreamModel: model.upstreamModel, endpointId: endpoint.id,
    capability: model.kind === 'video' ? 'image_to_video' : files.length ? 'image_to_image' : 'text_to_image',
    prompt: 'cinematic garden', inputAssets: [], params, model, endpoint, files,
  };
}

describe('mock adapter', () => {
  it('returns deterministic local outputs', async () => {
    const model = getModel('mock-image');
    const endpoint = model.endpoints[0]!;
    const input = {
      schemaVersion: 1, projectId: crypto.randomUUID(), nodeId: crypto.randomUUID(), graphRevision: 0,
      providerId: 'mock', providerBaseUrl: getProvider('mock').baseUrl, requiresCredential: false, modelId: model.id,
      upstreamModel: model.upstreamModel, endpointId: endpoint.id, capability: 'text_to_image', prompt: 'mist garden',
      inputAssets: [], params: { count: 2, ratio: '1:1' }, model, endpoint, files: [],
    } satisfies PreparedInput;
    const outcome = await getAdapter('mock').submit(input, undefined, new AbortController().signal);
    expect(outcome.kind).toBe('completed');
    if (outcome.kind === 'completed') expect(outcome.outputs).toHaveLength(2);
  });
});

describe('OpenAI-compatible image adapter', () => {
  it('expands Alibaba MaaS requests with image data and omits unsupported OpenAI fields', async () => {
    const configuration = {
      id: crypto.randomUUID(), displayName: 'Qwen Image', modelName: 'qwen-image-3.0',
      endpoint: 'https://ws-example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
      modelType: 'vision' as const, visualKind: 'image' as const, videoMode: 'universal' as const,
      provider: '阿里云百炼', credentialConfigured: true,
      createdAt: '2026-09-26T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z',
    };
    const resolved = resolveCustomModel(configuration);
    const endpoint = resolved.model.endpoints[0]!;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [{ url: 'https://example.com/result.png' }] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    const input = {
      schemaVersion: 1, projectId: crypto.randomUUID(), nodeId: crypto.randomUUID(), graphRevision: 1,
      providerId: resolved.model.providerId, providerBaseUrl: resolved.providerBaseUrl, requiresCredential: true,
      modelId: resolved.model.id, upstreamModel: resolved.model.upstreamModel, endpointId: endpoint.id,
      capability: 'image_to_image', prompt: 'restyle', inputAssets: [], params: { count: 1, size: '1024x1024', quality: 'medium', output_format: 'png' },
      model: resolved.model, endpoint,
      files: [{ assetId: crypto.randomUUID(), role: 'source', order: 0, bytes: new Uint8Array([1]), mimeType: 'image/png', fileName: 'source.png', dataUrl: 'data:image/png;base64,AQ==' }],
    } satisfies PreparedInput;

    await getAdapter('openai-image').submit(input, 'secret', new AbortController().signal);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://ws-example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/images/generations');
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.image).toEqual(['data:image/png;base64,AQ==']);
    expect(body).not.toHaveProperty('quality');
    expect(body).not.toHaveProperty('output_format');
  });
});

describe('xAI adapters', () => {
  it('submits Grok video parameters and returns the remote request id', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ request_id: 'xai-task-1', status: 'pending' }), { status: 200 }));
    const input = builtInInput('grok-imagine-video-1.5', 0, { duration: 10, ratio: '16:9', resolution: '1080p', generate_audio: true });

    const outcome = await getAdapter('xai-video').submit(input, 'xai-secret', new AbortController().signal);

    expect(outcome).toEqual({ kind: 'remote', taskId: 'xai-task-1', providerStatus: 'pending' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.x.ai/v1/videos/generations');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer xai-secret' });
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'grok-imagine-video-1.5', duration: 10, resolution: '1080p', generate_audio: true });
  });
});

describe('Google adapters', () => {
  it('sends Nano Banana interactions with the Google API key header and parses inline output', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      output_image: { type: 'image', mime_type: 'image/png', data: 'AQ==' },
    }), { status: 200 }));
    const input = builtInInput('gemini-3.1-flash-image', 0, { aspect_ratio: '16:9', image_size: '2K', output_format: 'image/png' });

    const outcome = await getAdapter('google-image').submit(input, 'google-secret', new AbortController().signal);

    expect(outcome).toEqual({ kind: 'completed', outputs: [{ kind: 'base64', data: 'AQ==', mimeType: 'image/png' }] });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-goog-api-key': 'google-secret' });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      model: 'gemini-3.1-flash-image', response_format: { aspect_ratio: '16:9', image_size: '2K' },
    });
  });
});

describe('MiniMax adapters', () => {
  it('requests base64 Image-01 output and parses it without a second download', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      base_resp: { status_code: 0, status_msg: '' }, data: { image_base64: ['Ag=='], task_id: 'mm-1', success_count: 1, failed_count: 0 },
    }), { status: 200 }));
    const input = builtInInput('minimax-image-01', 0, { aspect_ratio: '1:1', count: 1, seed: -1, prompt_optimizer: true, watermark: false });

    const outcome = await getAdapter('minimax-image').submit(input, 'minimax-secret', new AbortController().signal);

    expect(outcome).toEqual({ kind: 'completed', outputs: [{ kind: 'base64', data: 'Ag==', mimeType: 'image/jpeg' }] });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ model: 'image-01', response_format: 'base64', n: 1 });
  });
});

describe('Volcengine Ark adapter', () => {
  it('maps canvas image roles into the Seedance content array', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'ark-task-1', status: 'queued' }), { status: 200 }));
    const files: PreparedInput['files'] = [
      { assetId: crypto.randomUUID(), role: 'first_frame', order: 0, bytes: new Uint8Array([1]), mimeType: 'image/png', fileName: 'first.png', dataUrl: 'data:image/png;base64,AQ==' },
      { assetId: crypto.randomUUID(), role: 'last_frame', order: 1, bytes: new Uint8Array([2]), mimeType: 'image/png', fileName: 'last.png', dataUrl: 'data:image/png;base64,Ag==' },
    ];
    const input = builtInInput('doubao-seedance-2-5-260628', 0, { resolution: '720p', ratio: 'adaptive', duration: 5, generate_audio: true, watermark: false }, files);

    const outcome = await getAdapter('ark-video').submit(input, 'ark-secret', new AbortController().signal);

    expect(outcome).toEqual({ kind: 'remote', taskId: 'ark-task-1', providerStatus: 'queued' });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { content: Array<{ role?: string }> };
    expect(body.content.slice(1).map((item) => item.role)).toEqual(['first_frame', 'last_frame']);
  });
});

describe('fal queue adapter', () => {
  it('submits and resolves a HappyHorse queue task', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ request_id: 'fal-task-1', status: 'IN_QUEUE' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ video: { url: 'https://cdn.example.com/happyhorse.mp4', content_type: 'video/mp4' } }), { status: 200 }));
    const input = builtInInput('happyhorse-1.0', 0, { resolution: '720p', ratio: '16:9', duration: '5', seed: -1, enable_safety_checker: true });
    const adapter = getAdapter('fal-queue');

    const submitted = await adapter.submit(input, 'fal-secret', new AbortController().signal);
    const completed = await adapter.poll!(input, 'fal-task-1', 0, 'fal-secret', new AbortController().signal);

    expect(submitted).toEqual({ kind: 'remote', taskId: 'fal-task-1', providerStatus: 'IN_QUEUE' });
    expect(completed).toEqual({ kind: 'completed', outputs: [{ kind: 'remote_url', url: 'https://cdn.example.com/happyhorse.mp4', mimeType: 'video/mp4', fileName: 'happyhorse-video.mp4' }] });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/alibaba/happy-horse/text-to-video');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ duration: 5, aspect_ratio: '16:9', enable_safety_checker: true });
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/requests/fal-task-1/status');
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Key fal-secret' });
  });

  it('maps HappyHorse reference images to the official image_urls field', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ request_id: 'fal-ref-1' }), { status: 200 }));
    const files: PreparedInput['files'] = [
      { assetId: crypto.randomUUID(), role: 'reference', order: 0, bytes: new Uint8Array([1]), mimeType: 'image/png', fileName: 'one.png', dataUrl: 'data:image/png;base64,AQ==' },
      { assetId: crypto.randomUUID(), role: 'reference', order: 1, bytes: new Uint8Array([2]), mimeType: 'image/png', fileName: 'two.png', dataUrl: 'data:image/png;base64,Ag==' },
    ];
    const input = builtInInput('happyhorse-1.0', 2, { resolution: '1080p', ratio: '16:9', duration: '5', seed: 42, enable_safety_checker: true }, files);

    await getAdapter('fal-queue').submit(input, 'fal-secret', new AbortController().signal);

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/alibaba/happy-horse/reference-to-video');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      image_urls: ['data:image/png;base64,AQ==', 'data:image/png;base64,Ag=='], seed: 42,
    });
  });
});

describe('DashScope video adapter', () => {
  it('submits a custom Wan first-last-frame request to the native MaaS async endpoint', async () => {
    const configuration = {
      id: crypto.randomUUID(), displayName: 'Wan Video', modelName: 'wan3.0-video-prime',
      endpoint: 'https://ws-example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
      modelType: 'vision' as const, visualKind: 'video' as const, videoMode: 'first_last' as const,
      provider: '阿里云百炼', credentialConfigured: true,
      createdAt: '2026-09-26T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z',
    };
    const resolved = resolveCustomModel(configuration);
    const endpoint = resolved.model.endpoints[0]!;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      output: { task_id: 'task-wan-1', task_status: 'PENDING' },
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    const input = {
      schemaVersion: 1, projectId: crypto.randomUUID(), nodeId: crypto.randomUUID(), graphRevision: 1,
      providerId: resolved.model.providerId, providerBaseUrl: resolved.providerBaseUrl, requiresCredential: true,
      modelId: resolved.model.id, upstreamModel: resolved.model.upstreamModel, endpointId: endpoint.id,
      capability: 'image_to_video', prompt: 'cinematic orbit',
      inputAssets: [
        { assetId: crypto.randomUUID(), role: 'first_frame' as const, order: 0, binding: { kind: 'first_frame' as const } },
        { assetId: crypto.randomUUID(), role: 'last_frame' as const, order: 1, binding: { kind: 'last_frame' as const } },
      ],
      params: { resolution: '1080P', ratio: '16:9', duration: 5, prompt_extend: true, watermark: false },
      model: resolved.model, endpoint,
      files: [
        { assetId: crypto.randomUUID(), role: 'first_frame' as const, order: 0, bytes: new Uint8Array([1]), mimeType: 'image/png', fileName: 'first.png', dataUrl: 'data:image/png;base64,AQ==' },
        { assetId: crypto.randomUUID(), role: 'last_frame' as const, order: 1, bytes: new Uint8Array([2]), mimeType: 'image/png', fileName: 'last.png', dataUrl: 'data:image/png;base64,Ag==' },
      ],
    } satisfies PreparedInput;

    const outcome = await getAdapter('dashscope-video').submit(input, 'secret', new AbortController().signal);

    expect(outcome).toEqual({ kind: 'remote', taskId: 'task-wan-1', providerStatus: 'PENDING' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://ws-example.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis');
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer secret',
      'X-DashScope-Async': 'enable',
    });
    const body = JSON.parse(String(init?.body)) as {
      input: { media: Array<{ type: string; url: string }> };
      parameters: { ratio: string };
    };
    expect(body.input.media).toEqual([
      { type: 'first_frame', url: 'data:image/png;base64,AQ==' },
      { type: 'last_frame', url: 'data:image/png;base64,Ag==' },
    ]);
    expect(body.parameters.ratio).toBe('16:9');
  });

  it('maps internal reference roles to the Wan reference_image media type', async () => {
    const configuration = {
      id: crypto.randomUUID(), displayName: 'Wan Reference Video', modelName: 'wan2.7-r2v-2026-06-12',
      endpoint: 'https://ws-example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
      modelType: 'vision' as const, visualKind: 'video' as const, videoMode: 'reference' as const,
      provider: '阿里云百炼', credentialConfigured: true,
      createdAt: '2026-09-26T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z',
    };
    const resolved = resolveCustomModel(configuration);
    const endpoint = resolved.model.endpoints[0]!;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      output: { task_id: 'task-r2v-1', task_status: 'PENDING' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const input = {
      schemaVersion: 1, projectId: crypto.randomUUID(), nodeId: crypto.randomUUID(), graphRevision: 1,
      providerId: resolved.model.providerId, providerBaseUrl: resolved.providerBaseUrl, requiresCredential: true,
      modelId: resolved.model.id, upstreamModel: resolved.model.upstreamModel, endpointId: endpoint.id,
      capability: 'image_to_video', prompt: 'keep both subjects consistent',
      inputAssets: [
        { assetId: crypto.randomUUID(), role: 'reference' as const, order: 0, binding: { kind: 'reference_image' as const, index: 0 } },
        { assetId: crypto.randomUUID(), role: 'reference' as const, order: 1, binding: { kind: 'reference_image' as const, index: 1 } },
      ],
      params: { resolution: '720P', ratio: '16:9', duration: 3, prompt_extend: true, watermark: false },
      model: resolved.model, endpoint,
      files: [
        { assetId: crypto.randomUUID(), role: 'reference' as const, order: 0, bytes: new Uint8Array([1]), mimeType: 'image/png', fileName: 'one.png', dataUrl: 'data:image/png;base64,AQ==' },
        { assetId: crypto.randomUUID(), role: 'reference' as const, order: 1, bytes: new Uint8Array([2]), mimeType: 'image/png', fileName: 'two.png', dataUrl: 'data:image/png;base64,Ag==' },
      ],
    } satisfies PreparedInput;

    await getAdapter('dashscope-video').submit(input, 'secret', new AbortController().signal);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { input: { media: Array<{ type: string }> } };
    expect(body.input.media.map((item) => item.type)).toEqual(['reference_image', 'reference_image']);
  });
});

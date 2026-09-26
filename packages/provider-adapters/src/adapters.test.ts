import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAdapter, type PreparedInput } from './index';
import { getModel, getProvider, resolveCustomModel } from '@ilmheg/model-catalog';

afterEach(() => vi.restoreAllMocks());

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

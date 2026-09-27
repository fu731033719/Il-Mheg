import { afterEach, describe, expect, it, vi } from 'vitest';
import { getModel, getProvider, validateParams } from '@ilmheg/model-catalog';
import { getAdapter, type PreparedInput } from './index';

afterEach(() => vi.restoreAllMocks());

function inputFor(id: string, endpointIndex = 0, params: Record<string, unknown> = {}): PreparedInput {
  const model = getModel(id);
  const endpoint = model.endpoints[endpointIndex]!;
  const provider = getProvider(model.providerId);
  return {
    schemaVersion: 1, projectId: crypto.randomUUID(), nodeId: crypto.randomUUID(), graphRevision: 1,
    providerId: provider.id, providerBaseUrl: provider.baseUrl, requiresCredential: true,
    modelId: model.id, upstreamModel: model.upstreamModel, endpointId: endpoint.id,
    capability: model.kind === 'video' ? 'image_to_video' : endpointIndex ? 'image_to_image' : 'text_to_image',
    prompt: '一张带有中文标题的海报', inputAssets: [], params: validateParams(endpoint.params, params), model, endpoint, files: [],
  };
}

const imageResponse = { output: { choices: [{ message: { role: 'assistant', content: [
  { text: '完成' }, { image: 'https://example.com/result.png', type: 'image' },
] } }] } };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('Bailian native image protocol', () => {
  it('sends six Qwen outputs and native thinking parameters without OpenAI or async fields', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(imageResponse));
    const input = inputFor('qwen-image-3.0-pro', 0, { count: 6 });
    const signal = new AbortController().signal;
    const result = await getAdapter('dashscope-image').submit(input, 'test-key', signal);
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation');
    expect(request?.headers).toEqual({ Authorization: 'Bearer test-key', 'Content-Type': 'application/json' });
    expect(request?.signal).toBe(signal);
    expect(JSON.parse(String(request?.body))).toEqual({
      model: 'qwen-image-3.0-pro',
      input: { messages: [{ role: 'user', content: [{ text: input.prompt }] }] },
      parameters: { size: '2048*2048', n: 6, prompt_extend: true, enable_thinking: true, watermark: false },
    });
    expect(result).toEqual({ kind: 'completed', outputs: [{ kind: 'remote_url', url: 'https://example.com/result.png', mimeType: 'image/png' }] });
  });

  it('preserves multi-image order in native editing requests and uses 2K rather than 4K', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(imageResponse));
    const input = inputFor('wan2.7-image-pro', 1);
    input.files = ['AAAA', 'BBBB'].map((base64, order) => ({
      assetId: crypto.randomUUID(), role: 'source', order, bytes: new Uint8Array(), mimeType: 'image/png', fileName: `ref-${order}.png`, dataUrl: `data:image/png;base64,${base64}`,
    }));
    await getAdapter('dashscope-image').submit(input, 'test-key', new AbortController().signal);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({
      model: 'wan2.7-image-pro', input: { messages: [{ role: 'user', content: [
        { image: 'data:image/png;base64,AAAA' }, { image: 'data:image/png;base64,BBBB' }, { text: input.prompt },
      ] }] }, parameters: { size: '2K', n: 1, watermark: false },
    });
  });

  it('enables Wan thinking and 4K only for text-to-image', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(imageResponse));
    await getAdapter('dashscope-image').submit(inputFor('wan2.7-image-pro'), 'test-key', new AbortController().signal);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)).parameters).toEqual({ size: '4096*4096', n: 1, thinking_mode: true, watermark: false });
    expect(() => inputFor('wan2.7-image-pro', 1, { size: '4096*4096' })).toThrow();
  });

  it('rejects missing credentials, provider errors and responses without images', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const input = inputFor('qwen-image-3.0-pro');
    const run = (key?: string) => getAdapter('dashscope-image').submit(input, key, new AbortController().signal);
    await expect(run()).rejects.toThrow('CREDENTIAL_MISSING');
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(json({ code: 'InvalidApiKey', message: 'Invalid key' }, 401));
    await expect(run('test-key')).rejects.toMatchObject({ status: 401 });
    fetchMock.mockResolvedValueOnce(json({ code: 'DataInspectionFailed', message: 'Rejected' }));
    await expect(run('test-key')).rejects.toThrow('Rejected');
    fetchMock.mockResolvedValueOnce(json({ output: { choices: [] } }));
    await expect(run('test-key')).rejects.toThrow('RESULT_UNSUPPORTED');
  });
});

describe('Wan 3.0 native video protocol', () => {
  it.each(['wan3.0-video', 'wan3.0-video-prime'])('submits %s with optional silent output and polls the same Beijing service', async (id) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ output: { task_id: 'task-123', task_status: 'PENDING' } }))
      .mockResolvedValueOnce(json({ output: { task_status: 'RUNNING' } }))
      .mockResolvedValueOnce(json({ output: { task_status: 'SUCCEEDED', video_url: 'https://example.com/video.mp4' } }));
    const input = inputFor(id, 0, { audio: false });
    const adapter = getAdapter('dashscope-video');
    const signal = new AbortController().signal;
    await expect(adapter.submit(input, 'test-key', signal)).resolves.toMatchObject({ kind: 'remote', taskId: 'task-123' });
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis');
    expect(request?.headers).toMatchObject({ 'X-DashScope-Async': 'enable' });
    expect(JSON.parse(String(request?.body))).toEqual({ model: id, input: { prompt: input.prompt }, parameters: {
      resolution: '1080P', ratio: 'adaptive', duration: 5, prompt_extend: true, watermark: false, audio: false,
    } });
    await expect(adapter.poll!(input, 'task-123', 0, 'test-key', signal)).resolves.toMatchObject({ kind: 'pending' });
    await expect(adapter.poll!(input, 'task-123', 1, 'test-key', signal)).resolves.toMatchObject({ kind: 'completed', outputs: [{ kind: 'remote_url', url: 'https://example.com/video.mp4' }] });
    expect(String(fetchMock.mock.calls[1]![0])).toBe('https://dashscope.aliyuncs.com/api/v1/tasks/task-123');
  });
});

describe('MiniMax H3 through Bailian', () => {
  const policy = { data: {
    policy: 'test-policy', signature: 'test-signature', upload_dir: 'dashscope-instant/test',
    upload_host: 'https://dashscope-file-test.oss-cn-beijing.aliyuncs.com', oss_access_key_id: 'test-oss-key',
    x_oss_object_acl: 'private', x_oss_forbid_overwrite: 'true', max_file_size_mb: 30,
  } };
  const pending = { output: { task_id: 'h3-task', task_status: 'PENDING' } };
  const file = (role: PreparedInput['files'][number]['role'], order = 0): PreparedInput['files'][number] => ({
    assetId: crypto.randomUUID(), role, order, bytes: new Uint8Array([1, 2, 3]),
    mimeType: 'image/png', fileName: 'private-original.png', dataUrl: 'data:image/png;base64,AQID',
  });

  it('routes text-only H3 through the existing Bailian key without uploading or sending Wan parameters', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(pending));
    const input = inputFor('bailian-minimax-h3');
    await expect(getAdapter('dashscope-video').submit(input, 'test-bailian-key', new AbortController().signal)).resolves.toMatchObject({ taskId: 'h3-task' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis');
    expect(request?.headers).toEqual({ Authorization: 'Bearer test-bailian-key', 'Content-Type': 'application/json', 'X-DashScope-Async': 'enable' });
    expect(JSON.parse(String(request?.body))).toEqual({ model: 'MiniMax/MiniMax-H3', input: { prompt: input.prompt }, parameters: {
      resolution: '2K', ratio: '16:9', duration: 5, watermark: false,
    } });
  });

  it.each([{ endpoint: 1, roles: ['first_frame', 'last_frame'] as const, types: ['first_frame', 'last_frame'] },
    { endpoint: 2, roles: ['reference', 'reference'] as const, types: ['image_url', 'image_url'] }])('uploads private media then submits endpoint $endpoint with native roles', async ({ endpoint, roles, types }) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(policy)).mockResolvedValueOnce(new Response(null)).mockResolvedValueOnce(new Response(null))
      .mockResolvedValueOnce(json(pending)).mockResolvedValueOnce(json({ output: { task_status: 'SUCCEEDED', video_url: 'https://example.com/h3.mp4' } }));
    const input = inputFor('bailian-minimax-h3', endpoint);
    input.files = roles.map(file);
    const signal = new AbortController().signal;
    const adapter = getAdapter('dashscope-video');
    await adapter.submit(input, 'test-bailian-key', signal);
    const policyUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(policyUrl.pathname).toBe('/api/v1/uploads');
    expect(policyUrl.searchParams.get('model')).toBe('MiniMax/MiniMax-H3');
    const urls = [1, 2].map((index) => {
      const [host, request] = fetchMock.mock.calls[index]!;
      expect(String(host)).toBe(`${policy.data.upload_host}/`);
      expect(request?.headers).toBeUndefined();
      expect(request?.signal).toBe(signal);
      expect(request?.redirect).toBe('error');
      const form = request?.body as FormData;
      expect(form.get('x-oss-object-acl')).toBe('private');
      expect(form.get('OSSAccessKeyId')).toBe('test-oss-key');
      expect((form.get('file') as File).name).not.toBe('private-original.png');
      return `oss://${form.get('key')}`;
    });
    const request = fetchMock.mock.calls[3]![1]!;
    expect(request.headers).toMatchObject({ 'X-DashScope-OssResourceResolve': 'enable', Authorization: 'Bearer test-bailian-key' });
    const body = JSON.parse(String(request.body));
    expect(body.input.media).toEqual(types.map((type, index) => ({ type, url: urls[index] })));
    expect(body.parameters.ratio).toBe('adaptive');
    await expect(adapter.poll!(input, 'h3-task', 0, 'test-bailian-key', signal)).resolves.toMatchObject({ kind: 'completed', outputs: [{ url: 'https://example.com/h3.mp4' }] });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(String(fetchMock.mock.calls[4]![0])).toBe('https://dashscope.aliyuncs.com/api/v1/tasks/h3-task');
  });

  it('does not submit a billable task after an upload error or cancellation', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(policy)).mockResolvedValueOnce(new Response(null, { status: 403 }));
    const input = inputFor('bailian-minimax-h3', 1);
    input.files = [file('first_frame')];
    const adapter = getAdapter('dashscope-video');
    await expect(adapter.submit(input, 'test-key', new AbortController().signal)).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const controller = new AbortController();
    controller.abort();
    await expect(adapter.submit(input, 'test-key', controller.signal)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects non-OSS destinations and unsupported image formats before uploading', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ data: { ...policy.data, upload_host: 'https://example.com' } }));
    const input = inputFor('bailian-minimax-h3', 1);
    input.files = [file('first_frame')];
    await expect(getAdapter('dashscope-video').submit(input, 'test-key', new AbortController().signal)).rejects.toThrow('OSS HTTPS');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    input.files[0]!.mimeType = 'image/svg+xml';
    await expect(getAdapter('dashscope-video').submit(input, 'test-key', new AbortController().signal)).rejects.toThrow('INPUT_UNSUPPORTED');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

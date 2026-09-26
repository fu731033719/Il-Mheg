import { describe, expect, it } from 'vitest';
import { connectNodes, createEmptyGraph, createNode } from '@ilmheg/domain';
import { resolveCustomModel } from '@ilmheg/model-catalog';
import { compileGraphRun } from './index';

describe('graph compiler', () => {
  it('compiles upstream and local prompts deterministically', () => {
    const graph = createEmptyGraph(crypto.randomUUID());
    const prompt = createNode('prompt', { x: 0, y: 0 });
    prompt.config.prompt = 'cinematic light';
    const image = createNode('image', { x: 200, y: 0 });
    image.config.prompt = 'a glass fox';
    const compiled = compileGraphRun(connectNodes({ ...graph, nodes: [prompt, image] }, { source: prompt.id, target: image.id }), image.id);
    expect(compiled.capability).toBe('text_to_image');
    expect(compiled.prompt).toBe('cinematic light\n\na glass fox');
  });

  it('requires an available upstream image', () => {
    const graph = createEmptyGraph(crypto.randomUUID());
    const source = createNode('image', { x: 0, y: 0 });
    const target = createNode('image', { x: 200, y: 0 });
    const connected = connectNodes({ ...graph, nodes: [source, target] }, { source: source.id, target: target.id });
    expect(() => compileGraphRun(connected, target.id)).toThrow(/还没有可用图片/);
  });

  it('compiles two connected images as ordered video first and last frames', () => {
    const graph = createEmptyGraph(crypto.randomUUID());
    const first = createNode('image', { x: 0, y: 0 });
    first.output.assetIds = [crypto.randomUUID()];
    const last = createNode('image', { x: 600, y: 0 });
    last.output.assetIds = [crypto.randomUUID()];
    const video = createNode('video', { x: 300, y: 400 });
    video.config.prompt = 'camera orbit';
    const withFirstFrame = connectNodes({ ...graph, nodes: [first, last, video] }, { source: first.id, target: video.id });
    const withLastFrame = connectNodes(withFirstFrame, { source: last.id, target: video.id });

    const compiled = compileGraphRun(withLastFrame, video.id);

    expect(compiled.inputAssets.map((asset) => asset.role)).toEqual(['first_frame', 'last_frame']);
    expect(compiled.inputAssets.map((asset) => asset.assetId)).toEqual([first.output.assetIds[0], last.output.assetIds[0]]);
  });

  it('compiles a node against its exact custom model configuration id', () => {
    const graph = createEmptyGraph(crypto.randomUUID());
    const image = createNode('image', { x: 0, y: 0 });
    const modelId = crypto.randomUUID();
    image.config.prompt = 'paper sculpture';
    image.config.model = { modelId, endpointId: `custom-endpoint:${modelId}`, params: {} };
    const configuration = {
      id: modelId,
      displayName: 'Vision Endpoint',
      modelName: 'vision-v4',
      endpoint: 'https://example.com/v1/images/generations',
      modelType: 'vision' as const,
      visualKind: 'image' as const,
      videoMode: 'universal' as const,
      provider: 'Example AI',
      credentialConfigured: false,
      createdAt: '2026-09-26T00:00:00.000Z',
      updatedAt: '2026-09-26T00:00:00.000Z',
    };

    const compiled = compileGraphRun({ ...graph, nodes: [image] }, image.id, (id) => {
      expect(id).toBe(modelId);
      return resolveCustomModel(configuration);
    });

    expect(compiled.modelId).toBe(modelId);
    expect(compiled.upstreamModel).toBe('vision-v4');
    expect(compiled.providerBaseUrl).toBe('https://example.com');
    expect(compiled.requiresCredential).toBe(false);
  });

  it('compiles a video node against a custom visual video model', () => {
    const graph = createEmptyGraph(crypto.randomUUID());
    const first = createNode('image', { x: 0, y: 0 });
    first.output.assetIds = [crypto.randomUUID()];
    const video = createNode('video', { x: 300, y: 0 });
    const modelId = crypto.randomUUID();
    video.config.prompt = 'slow camera push';
    video.config.model = { modelId, endpointId: `custom-endpoint:${modelId}`, params: {} };
    const connected = connectNodes({ ...graph, nodes: [first, video] }, {
      source: first.id,
      target: video.id,
      targetHandle: 'first_frame',
    });
    const configuration = {
      id: modelId,
      displayName: 'Wan 3 Video',
      modelName: 'wan3.0-video-prime',
      endpoint: 'https://ws-example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
      modelType: 'vision' as const,
      visualKind: 'video' as const,
      videoMode: 'universal' as const,
      provider: '阿里云百炼',
      credentialConfigured: true,
      createdAt: '2026-09-26T00:00:00.000Z',
      updatedAt: '2026-09-26T00:00:00.000Z',
    };

    const compiled = compileGraphRun(connected, video.id, () => resolveCustomModel(configuration));

    expect(compiled.modelId).toBe(modelId);
    expect(compiled.model.kind).toBe('video');
    expect(compiled.endpoint.protocol).toBe('dashscope-video');
    expect(compiled.inputAssets.map((asset) => asset.role)).toEqual(['first_frame']);
  });

  it('normalizes connected images as references for a reference-only custom video model', () => {
    const graph = createEmptyGraph(crypto.randomUUID());
    const sourceA = createNode('image', { x: 0, y: 0 });
    sourceA.output.assetIds = [crypto.randomUUID()];
    const sourceB = createNode('image', { x: 0, y: 240 });
    sourceB.output.assetIds = [crypto.randomUUID()];
    const video = createNode('video', { x: 300, y: 0 });
    const modelId = crypto.randomUUID();
    video.config.prompt = 'preserve the character';
    video.config.model = { modelId, params: { ratio: 'adaptive', resolution: '480P' } };
    const withFirst = connectNodes({ ...graph, nodes: [sourceA, sourceB, video] }, { source: sourceA.id, target: video.id });
    const connected = connectNodes(withFirst, { source: sourceB.id, target: video.id });
    const configuration = {
      id: modelId,
      displayName: 'Wan Reference Video',
      modelName: 'wan2.7-r2v-2026-06-12',
      endpoint: 'https://ws-example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
      modelType: 'vision' as const,
      visualKind: 'video' as const,
      videoMode: 'reference' as const,
      provider: '阿里云百炼',
      credentialConfigured: true,
      createdAt: '2026-09-26T00:00:00.000Z',
      updatedAt: '2026-09-26T00:00:00.000Z',
    };

    const compiled = compileGraphRun(connected, video.id, () => resolveCustomModel(configuration));

    expect(compiled.inputAssets).toMatchObject([
      { role: 'reference', binding: { kind: 'reference_image', index: 0 } },
      { role: 'reference', binding: { kind: 'reference_image', index: 1 } },
    ]);
    expect(compiled.params.ratio).toBe('16:9');
    expect(compiled.params.resolution).toBe('720P');
  });

  it('compiles a text-only custom video model without input assets', () => {
    const graph = createEmptyGraph(crypto.randomUUID());
    const video = createNode('video', { x: 0, y: 0 });
    const modelId = crypto.randomUUID();
    video.config.prompt = 'a cloud city at sunrise';
    video.config.model = { modelId, params: {} };
    const configuration = {
      id: modelId,
      displayName: 'Wan Text Video',
      modelName: 'wan2.7-t2v-2026-06-12',
      endpoint: 'https://ws-example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
      modelType: 'vision' as const,
      visualKind: 'video' as const,
      videoMode: 'text' as const,
      provider: '阿里云百炼',
      credentialConfigured: true,
      createdAt: '2026-09-26T00:00:00.000Z',
      updatedAt: '2026-09-26T00:00:00.000Z',
    };

    const compiled = compileGraphRun({ ...graph, nodes: [video] }, video.id, () => resolveCustomModel(configuration));

    expect(compiled.capability).toBe('image_to_video');
    expect(compiled.inputAssets).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import type { GraphEnvelope } from '@ilmheg/contracts';
import { connectNodes, createEmptyGraph, createNode } from '@ilmheg/domain';
import { compileGraphRun } from './index';

describe('Bailian model compilation', () => {
  it('compiles Bailian H3 with explicit text ratio and bounded duration', () => {
    const video = createNode('video', { x: 0, y: 0 });
    video.config.prompt = '一只猫在草地上奔跑';
    video.config.model = { modelId: 'bailian-minimax-h3', params: { ratio: 'adaptive' } };
    const graph = { ...createEmptyGraph(crypto.randomUUID()), nodes: [video] };
    const result = compileGraphRun(graph, video.id);
    expect(result.providerId).toBe('dashscope');
    expect(result.upstreamModel).toBe('MiniMax/MiniMax-H3');
    expect(result.endpoint.id).toBe('bailian-minimax-h3-text');
    expect(result.params).toEqual({ resolution: '2K', ratio: '16:9', duration: 5, watermark: false });
    for (const duration of [3, 16]) {
      video.config.model.params.duration = duration;
      expect(() => compileGraphRun(graph, video.id)).toThrow();
    }
  });

  it('compiles H3 frames using adaptive ratio and limits references to nine images', () => {
    const video = createNode('video', { x: 500, y: 0 });
    video.config.prompt = '镜头缓慢移动';
    video.config.model = { modelId: 'bailian-minimax-h3', params: { ratio: '16:9' } };
    const sources = Array.from({ length: 10 }, (_, y) => {
      const node = createNode('image', { x: 0, y: y * 100 });
      node.output.assetIds = [crypto.randomUUID()];
      return node;
    });
    const base = { ...createEmptyGraph(crypto.randomUUID()), nodes: [...sources, video] };
    const first = connectNodes(base, { source: sources[0]!.id, target: video.id, targetHandle: 'first_frame' });
    const frames = connectNodes(first, { source: sources[1]!.id, target: video.id, targetHandle: 'last_frame' });
    expect(compileGraphRun(frames, video.id)).toMatchObject({ endpointId: 'bailian-minimax-h3-frames', params: { ratio: 'adaptive' } });
    let reference: GraphEnvelope = base;
    sources.slice(0, 9).forEach((source) => {
      reference = connectNodes(reference, { source: source.id, target: video.id, targetHandle: 'reference_image' });
    });
    const compiled = compileGraphRun(reference, video.id);
    expect(compiled.endpointId).toBe('bailian-minimax-h3-reference');
    expect(compiled.inputAssets).toHaveLength(9);
    expect(compiled.inputAssets.every((asset) => asset.role === 'reference')).toBe(true);
    reference = connectNodes(reference, { source: sources[9]!.id, target: video.id, targetHandle: 'reference_image' });
    expect(() => compileGraphRun(reference, video.id)).toThrow('最多接收 9 张图片');
  });

  it('selects Wan image editing and normalizes an old 4K selection to supported 2K', () => {
    const image = createNode('image', { x: 0, y: 0 });
    image.config.prompt = '编辑这张图片';
    image.config.sourceAssetId = crypto.randomUUID();
    image.config.model = { modelId: 'wan2.7-image-pro', params: { size: '4096*4096' } };
    const graph = { ...createEmptyGraph(crypto.randomUUID()), nodes: [image] };
    const result = compileGraphRun(graph, image.id);
    expect(result.endpoint.id).toBe('wan2.7-image-pro-edit');
    expect(result.params.size).toBe('2K');
    expect(result.providerId).toBe('dashscope');
    expect(result.requiresCredential).toBe(true);
  });

  it('enforces Qwen three-image and Wan nine-image input limits', () => {
    const image = createNode('image', { x: 500, y: 0 });
    image.config.prompt = '合成这些参考图';
    image.config.model = { modelId: 'qwen-image-3.0-pro', params: {} };
    const sources = Array.from({ length: 9 }, (_, index) => {
      const node = createNode('image', { x: 0, y: index * 100 });
      node.output.assetIds = [crypto.randomUUID()];
      return node;
    });
    let graph: GraphEnvelope = { ...createEmptyGraph(crypto.randomUUID()), nodes: [...sources, image] };
    sources.forEach((source) => { graph = connectNodes(graph, { source: source.id, target: image.id }); });
    expect(() => compileGraphRun(graph, image.id)).toThrow('最多接收 3 张图片');
    const target = graph.nodes.find((node) => node.id === image.id)!;
    if (target.kind !== 'image') throw new Error('Expected image node');
    target.config.model = { modelId: 'wan2.7-image-pro', params: {} };
    expect(compileGraphRun(graph, image.id).inputAssets).toHaveLength(9);
    target.config.sourceAssetId = crypto.randomUUID();
    expect(() => compileGraphRun(graph, image.id)).toThrow('最多接收 9 张图片');
  });

  it.each(['wan3.0-video', 'wan3.0-video-prime'])('compiles text-only %s with audio and 1080P defaults', (modelId) => {
    const video = createNode('video', { x: 0, y: 0 });
    video.config.prompt = '一只猫在花园里奔跑';
    video.config.model = { modelId, params: {} };
    const result = compileGraphRun({ ...createEmptyGraph(crypto.randomUUID()), nodes: [video] }, video.id);
    expect(result.params).toMatchObject({ resolution: '1080P', duration: 5, audio: true });
    expect(result.inputAssets).toEqual([]);
    expect(result.endpoint.protocol).toBe('dashscope-video');
  });
});

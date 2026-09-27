import { describe, expect, it } from 'vitest';
import { bindingKindsForConnection, connectNodes, createEmptyGraph, createNode, normalizeBindingIndices, updateEdgeBinding } from './index';

describe('graph invariants', () => {
  it('creates an explicit prompt binding', () => {
    const graph = createEmptyGraph(crypto.randomUUID());
    const prompt = createNode('prompt', { x: 0, y: 0 });
    const image = createNode('image', { x: 300, y: 0 });
    const connected = connectNodes({ ...graph, nodes: [prompt, image] }, { source: prompt.id, target: image.id });
    expect(connected.edges[0]?.binding).toEqual({ kind: 'prompt' });
  });

  it('rejects cycles', () => {
    const graph = createEmptyGraph(crypto.randomUUID());
    const a = createNode('video', { x: 0, y: 0 });
    const b = createNode('video', { x: 300, y: 0 });
    const once = connectNodes({ ...graph, nodes: [a, b] }, { source: a.id, target: b.id });
    expect(() => connectNodes(once, { source: b.id, target: a.id })).toThrow(/环/);
  });

  it('normalizes ordered image bindings', () => {
    const target = crypto.randomUUID();
    const edges = [2, 9].map((index) => ({
      id: crypto.randomUUID(), source: crypto.randomUUID(), target,
      binding: { kind: 'reference_image' as const, index }, createdAt: new Date().toISOString(),
    }));
    expect(normalizeBindingIndices(edges).map((edge) => 'index' in edge.binding && edge.binding.index)).toEqual([0, 1]);
  });

  it('automatically assigns the first two image inputs as video first and last frames', () => {
    const graph = createEmptyGraph(crypto.randomUUID());
    const first = createNode('image', { x: 0, y: 0 });
    const last = createNode('image', { x: 600, y: 0 });
    const video = createNode('video', { x: 300, y: 400 });
    const withImageChain = connectNodes({ ...graph, nodes: [first, last, video] }, { source: first.id, target: last.id });
    const withFirstFrame = connectNodes(withImageChain, { source: first.id, target: video.id });
    const withLastFrame = connectNodes(withFirstFrame, { source: last.id, target: video.id });

    expect(withLastFrame.edges.filter((edge) => edge.target === video.id).map((edge) => edge.binding)).toEqual([
      { kind: 'first_frame' },
      { kind: 'last_frame' },
    ]);
  });

  it('offers every video image reference role through one connection', () => {
    const image = createNode('image', { x: 0, y: 0 });
    const video = createNode('video', { x: 300, y: 0 });

    expect(bindingKindsForConnection(image, video)).toEqual(['first_frame', 'last_frame', 'reference_image']);
  });

  it('updates a video image reference role and normalizes reference indices', () => {
    const graph = createEmptyGraph(crypto.randomUUID());
    const first = createNode('image', { x: 0, y: 0 });
    const last = createNode('image', { x: 0, y: 200 });
    const reference = createNode('image', { x: 0, y: 400 });
    const video = createNode('video', { x: 400, y: 0 });
    const withFirst = connectNodes({ ...graph, nodes: [first, last, reference, video] }, { source: first.id, target: video.id });
    const withLast = connectNodes(withFirst, { source: last.id, target: video.id });
    const connected = connectNodes(withLast, { source: reference.id, target: video.id });
    const referenceEdge = connected.edges.find((edge) => edge.source === reference.id)!;

    const updated = updateEdgeBinding(connected, referenceEdge.id, 'first_frame');

    expect(updated.edges.map((edge) => edge.binding)).toEqual([
      { kind: 'reference_image', index: 0 },
      { kind: 'last_frame' },
      { kind: 'first_frame' },
    ]);
  });

  it('swaps occupied first and last frame roles', () => {
    const graph = createEmptyGraph(crypto.randomUUID());
    const first = createNode('image', { x: 0, y: 0 });
    const last = createNode('image', { x: 0, y: 200 });
    const video = createNode('video', { x: 400, y: 0 });
    const withFirst = connectNodes({ ...graph, nodes: [first, last, video] }, { source: first.id, target: video.id });
    const connected = connectNodes(withFirst, { source: last.id, target: video.id });

    const updated = updateEdgeBinding(connected, connected.edges[0]!.id, 'last_frame');

    expect(updated.edges.map((edge) => edge.binding)).toEqual([
      { kind: 'last_frame' },
      { kind: 'first_frame' },
    ]);
  });

  it('rejects a reference role that is incompatible with the connected node kinds', () => {
    const graph = createEmptyGraph(crypto.randomUUID());
    const source = createNode('image', { x: 0, y: 0 });
    const target = createNode('image', { x: 300, y: 0 });
    const connected = connectNodes({ ...graph, nodes: [source, target] }, { source: source.id, target: target.id });

    expect(() => updateEdgeBinding(connected, connected.edges[0]!.id, 'first_frame')).toThrow(/不支持/);
  });
});

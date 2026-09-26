import { describe, expect, it } from 'vitest';
import type { NodeChange } from '@xyflow/react';
import { createEmptyGraph, createNode } from '@ilmheg/domain';
import { applyNodeGeometryChanges } from './flow-changes';

describe('applyNodeGeometryChanges', () => {
  it('ignores React Flow measurements for regular nodes', () => {
    const image = createNode('image', { x: 120, y: 80 });
    const graph = { ...createEmptyGraph(crypto.randomUUID()), nodes: [image] };
    const changes: NodeChange[] = [{
      id: image.id,
      type: 'dimensions',
      dimensions: { width: 280, height: 264 },
      setAttributes: true,
    }];

    expect(applyNodeGeometryChanges(graph, changes)).toBe(graph);
  });

  it('returns the same graph for repeated positions', () => {
    const image = createNode('image', { x: 120, y: 80 });
    const graph = { ...createEmptyGraph(crypto.randomUUID()), nodes: [image] };

    expect(applyNodeGeometryChanges(graph, [{ id: image.id, type: 'position', position: image.position }])).toBe(graph);
  });

  it('persists user geometry changes once', () => {
    const group = createNode('group', { x: 40, y: 50 });
    const graph = { ...createEmptyGraph(crypto.randomUUID()), nodes: [group] };
    const stamp = '2026-09-26T00:00:00.000Z';
    const next = applyNodeGeometryChanges(graph, [
      { id: group.id, type: 'position', position: { x: 64, y: 72 }, dragging: true },
      { id: group.id, type: 'dimensions', dimensions: { width: 640, height: 420 }, resizing: true },
    ], stamp);

    expect(next).not.toBe(graph);
    expect(next.nodes[0]).toMatchObject({
      position: { x: 64, y: 72 },
      size: { width: 640, height: 420 },
      updatedAt: stamp,
    });
  });
});

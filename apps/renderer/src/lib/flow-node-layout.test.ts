import { describe, expect, it } from 'vitest';
import { createNode } from '@ilmheg/domain';
import { canvasNodeFlowSize } from './flow-node-layout';

describe('canvas node flow sizes', () => {
  it('provides explicit dimensions for every executable node kind', () => {
    expect(canvasNodeFlowSize(createNode('prompt', { x: 0, y: 0 }))).toEqual({ width: 224, height: 108 });
    expect(canvasNodeFlowSize(createNode('image', { x: 0, y: 0 }))).toEqual({ width: 224, height: 260 });
    expect(canvasNodeFlowSize(createNode('video', { x: 0, y: 0 }))).toEqual({ width: 224, height: 162 });
  });

  it('uses the persisted group size and a stable fallback', () => {
    const group = createNode('group', { x: 0, y: 0 });
    expect(canvasNodeFlowSize(group)).toEqual({ width: 560, height: 360 });
    group.size = { width: 720, height: 480 };
    expect(canvasNodeFlowSize(group)).toEqual({ width: 720, height: 480 });
  });
});

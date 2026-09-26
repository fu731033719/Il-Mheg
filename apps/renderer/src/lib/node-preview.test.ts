import { describe, expect, it } from 'vitest';
import { createNode } from '@ilmheg/domain';
import { nodePreviewAssetId } from './node-preview';

describe('nodePreviewAssetId', () => {
  it('prefers the latest image output over an imported source image', () => {
    const node = createNode('image', { x: 0, y: 0 });
    node.output.assetIds = [crypto.randomUUID()];
    node.config.sourceAssetId = crypto.randomUUID();

    expect(nodePreviewAssetId(node)).toBe(node.output.assetIds[0]);
  });

  it('falls back to the imported source image', () => {
    const node = createNode('image', { x: 0, y: 0 });
    node.config.sourceAssetId = crypto.randomUUID();

    expect(nodePreviewAssetId(node)).toBe(node.config.sourceAssetId);
  });

  it('returns video output and leaves non-media nodes empty', () => {
    const video = createNode('video', { x: 0, y: 0 });
    video.output.assetIds = [crypto.randomUUID()];

    expect(nodePreviewAssetId(video)).toBe(video.output.assetIds[0]);
    expect(nodePreviewAssetId(createNode('prompt', { x: 0, y: 0 }))).toBeUndefined();
    expect(nodePreviewAssetId(createNode('group', { x: 0, y: 0 }))).toBeUndefined();
  });
});

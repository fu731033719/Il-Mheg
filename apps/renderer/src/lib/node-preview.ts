import type { CanvasNode } from '@ilmheg/contracts';

export function nodePreviewAssetId(node: CanvasNode): string | undefined {
  if (node.kind === 'image') return node.output.assetIds[0] ?? node.config.sourceAssetId;
  if (node.kind === 'video') return node.output.assetIds[0];
  return undefined;
}

import type { CanvasNode } from '@ilmheg/contracts';

export type FlowNodeSize = { width: number; height: number };

export function canvasNodeFlowSize(node: CanvasNode): FlowNodeSize {
  if (node.kind === 'group') return node.size ?? { width: 560, height: 360 };
  if (node.kind === 'prompt') return { width: 224, height: 108 };
  if (node.kind === 'image') return { width: 224, height: 260 };
  return { width: 224, height: 162 };
}

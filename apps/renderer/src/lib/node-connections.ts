import type { CanvasNodeKind, InputBinding } from '@ilmheg/contracts';

export type ConnectionSide = 'left' | 'right';
export type ConnectionMenuPlacement = 'adjacent' | 'drop';
export type ExecutableNodeKind = Exclude<CanvasNodeKind, 'group'>;
export type ConnectionEndpoint = { id: string; kind: ExecutableNodeKind };

export type ConnectionGesture = {
  pointerId: number;
  originNodeId: string;
  originKind: CanvasNodeKind;
  side: ConnectionSide;
  anchorY: number;
  start: { x: number; y: number };
  current: { x: number; y: number };
  started: boolean;
  hoveredNodeId?: string;
};

export type ConnectionPointerStart = {
  pointerId: number;
  nodeId: string;
  nodeKind: CanvasNodeKind;
  side: ConnectionSide;
  anchorY: number;
  clientX: number;
  clientY: number;
};

const nodeKinds = ['prompt', 'image', 'video'] as const;

export const CONNECTION_TARGET_HANDLES = {
  default: 'input',
  firstFrame: 'first-frame-input',
  lastFrame: 'last-frame-input',
} as const;

export function connectionTargetHandle(binding: InputBinding) {
  if (binding.kind === 'first_frame') return CONNECTION_TARGET_HANDLES.firstFrame;
  if (binding.kind === 'last_frame') return CONNECTION_TARGET_HANDLES.lastFrame;
  return CONNECTION_TARGET_HANDLES.default;
}

export function connectionOptions(kind: CanvasNodeKind, _side: ConnectionSide): readonly ExecutableNodeKind[] {
  if (kind === 'group') return [];
  return nodeKinds.filter((otherKind) => supportsDirection(kind, otherKind) || supportsDirection(otherKind, kind));
}

export function connectionForDrop(origin: ConnectionEndpoint, other: ConnectionEndpoint, side: ConnectionSide) {
  const preferred = side === 'right'
    ? { source: origin, target: other }
    : { source: other, target: origin };
  if (supportsDirection(preferred.source.kind, preferred.target.kind)) {
    return { source: preferred.source.id, target: preferred.target.id };
  }
  const reversed = { source: preferred.target, target: preferred.source };
  return supportsDirection(reversed.source.kind, reversed.target.kind)
    ? { source: reversed.source.id, target: reversed.target.id }
    : undefined;
}

function supportsDirection(source: ExecutableNodeKind, target: ExecutableNodeKind) {
  if (source === 'prompt') return target === 'image' || target === 'video';
  if (source === 'image') return target === 'image' || target === 'video';
  return target === 'video';
}

export function connectedNodePosition(
  point: { x: number; y: number },
  side: ConnectionSide,
  kind: Exclude<CanvasNodeKind, 'group'>,
  placement: ConnectionMenuPlacement,
) {
  const bodyCenterOffset = kind === 'prompt' ? 72 : kind === 'image' ? 148 : 99;
  const x = placement === 'adjacent'
    ? point.x + (side === 'right' ? 68 : -292)
    : point.x + (side === 'right' ? 28 : -252);
  return { x, y: point.y - bodyCenterOffset };
}

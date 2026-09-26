import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { CanvasNodeKind } from '@ilmheg/contracts';
import {
  connectedNodePosition,
  connectionForDrop,
  type ConnectionGesture,
  type ConnectionMenuPlacement,
  type ConnectionPointerStart,
  type ConnectionSide,
} from '@/lib/node-connections';

export type ConnectionNodeMenu = {
  originNodeId: string;
  originKind: CanvasNodeKind;
  side: ConnectionSide;
  placement: ConnectionMenuPlacement;
  point: { x: number; y: number };
  position: { x: number; y: number };
};

type FlowProjector = {
  screenToFlowPosition(position: { x: number; y: number }): { x: number; y: number };
};

type ConnectionInteractionOptions = {
  workspaceRef: RefObject<HTMLDivElement | null>;
  instance: FlowProjector | null;
  projectId?: string;
  connect(source: string, target: string): void;
  addConnectedNode(
    originNodeId: string,
    side: ConnectionSide,
    kind: Exclude<CanvasNodeKind, 'group'>,
    position: { x: number; y: number },
  ): void;
};

const DRAG_DISTANCE = 5;
const HOLD_DELAY = 180;
const MENU_WIDTH = 220;

export function useNodeConnectionInteraction({
  workspaceRef,
  instance,
  projectId,
  connect,
  addConnectedNode,
}: ConnectionInteractionOptions) {
  const [gesture, setGesture] = useState<ConnectionGesture | null>(null);
  const [menu, setMenu] = useState<ConnectionNodeMenu | null>(null);
  const cleanupListenersRef = useRef<() => void>(() => undefined);

  const openMenu = useCallback((
    input: ConnectionPointerStart,
    clientX: number,
    clientY: number,
    placement: ConnectionMenuPlacement,
  ) => {
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds || !instance) return;
    const localX = clientX - bounds.left;
    const localY = clientY - bounds.top;
    const desiredX = input.side === 'right' ? localX + 14 : localX - MENU_WIDTH - 14;
    setMenu({
      originNodeId: input.nodeId,
      originKind: input.nodeKind,
      side: input.side,
      placement,
      point: instance.screenToFlowPosition({ x: clientX, y: clientY }),
      position: {
        x: Math.max(12, Math.min(bounds.width - MENU_WIDTH - 12, desiredX)),
        y: Math.max(12, Math.min(bounds.height - 210, localY - 22)),
      },
    });
  }, [instance, workspaceRef]);

  const close = useCallback(() => {
    cleanupListenersRef.current();
    setGesture(null);
    setMenu(null);
  }, []);

  useEffect(() => close(), [close, projectId]);
  useEffect(() => () => cleanupListenersRef.current(), []);

  const begin = useCallback((input: ConnectionPointerStart) => {
    cleanupListenersRef.current();
    setMenu(null);
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds) return;

    const start = { x: input.clientX - bounds.left, y: input.clientY - bounds.top };
    let dragStarted = false;
    let holdTimer: ReturnType<typeof setTimeout> | undefined;

    const startDragging = () => {
      if (dragStarted) return;
      dragStarted = true;
      setGesture((current) => current?.pointerId === input.pointerId ? { ...current, started: true } : current);
    };

    const cleanupListeners = () => {
      if (holdTimer) clearTimeout(holdTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      cleanupListenersRef.current = () => undefined;
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== input.pointerId) return;
      event.preventDefault();
      const current = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      if (Math.hypot(current.x - start.x, current.y - start.y) >= DRAG_DISTANCE) startDragging();
      const hoveredNode = dragStarted ? compatibleNodeAtPoint(event.clientX, event.clientY, input) : undefined;
      setGesture((active) => active?.pointerId === input.pointerId ? { ...active, current, hoveredNodeId: hoveredNode?.id } : active);
    };

    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== input.pointerId) return;
      cleanupListeners();
      const hoveredNode = compatibleNodeAtPoint(event.clientX, event.clientY, input);
      setGesture(null);
      if (dragStarted && hoveredNode) {
        const connection = connectionForDrop(
          { id: input.nodeId, kind: input.nodeKind as Exclude<CanvasNodeKind, 'group'> },
          hoveredNode,
          input.side,
        );
        if (connection) connect(connection.source, connection.target);
        return;
      }
      openMenu(input, event.clientX, event.clientY, dragStarted ? 'drop' : 'adjacent');
    };

    const onCancel = (event: PointerEvent) => {
      if (event.pointerId !== input.pointerId) return;
      cleanupListeners();
      setGesture(null);
    };

    setGesture({
      pointerId: input.pointerId,
      originNodeId: input.nodeId,
      originKind: input.nodeKind,
      side: input.side,
      anchorY: input.anchorY,
      start,
      current: start,
      started: false,
    });
    holdTimer = setTimeout(startDragging, HOLD_DELAY);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    cleanupListenersRef.current = cleanupListeners;
  }, [connect, openMenu, workspaceRef]);

  const createFromMenu = useCallback((kind: Exclude<CanvasNodeKind, 'group'>) => {
    if (!menu) return;
    addConnectedNode(
      menu.originNodeId,
      menu.side,
      kind,
      connectedNodePosition(menu.point, menu.side, kind, menu.placement),
    );
    setMenu(null);
  }, [addConnectedNode, menu]);

  return { gesture, menu, begin, close, createFromMenu };
}

function compatibleNodeAtPoint(clientX: number, clientY: number, input: ConnectionPointerStart) {
  const element = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-canvas-node-id]');
  const nodeId = element?.dataset.canvasNodeId;
  const nodeKind = element?.dataset.canvasNodeKind as Exclude<CanvasNodeKind, 'group'> | undefined;
  if (!nodeId || nodeId === input.nodeId || !nodeKind) return undefined;
  const origin = { id: input.nodeId, kind: input.nodeKind as Exclude<CanvasNodeKind, 'group'> };
  const other = { id: nodeId, kind: nodeKind };
  return connectionForDrop(origin, other, input.side) ? other : undefined;
}

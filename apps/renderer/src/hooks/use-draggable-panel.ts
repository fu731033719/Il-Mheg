import { useRef, useState, type PointerEventHandler } from 'react';

type Point = { x: number; y: number };
type DragState = {
  pointerId: number;
  startPointer: Point;
  startOffset: Point;
  panelRect: DOMRect;
  boundsRect: DOMRect;
};

export function useDraggablePanel<T extends HTMLElement>() {
  const panelRef = useRef<T>(null);
  const dragState = useRef<DragState | undefined>(undefined);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });

  const onPointerDown: PointerEventHandler<HTMLElement> = (event) => {
    if (event.button !== 0 || !panelRef.current?.parentElement) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      pointerId: event.pointerId,
      startPointer: { x: event.clientX, y: event.clientY },
      startOffset: offset,
      panelRect: panelRef.current.getBoundingClientRect(),
      boundsRect: panelRef.current.parentElement.getBoundingClientRect(),
    };
  };

  const onPointerMove: PointerEventHandler<HTMLElement> = (event) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const requestedLeft = drag.panelRect.left + event.clientX - drag.startPointer.x;
    const requestedTop = drag.panelRect.top + event.clientY - drag.startPointer.y;
    const minimumLeft = drag.boundsRect.left + 12;
    const minimumTop = drag.boundsRect.top + 12;
    const maximumLeft = Math.max(minimumLeft, drag.boundsRect.right - drag.panelRect.width - 12);
    const maximumTop = Math.max(minimumTop, drag.boundsRect.bottom - drag.panelRect.height - 12);
    const left = clamp(requestedLeft, minimumLeft, maximumLeft);
    const top = clamp(requestedTop, minimumTop, maximumTop);
    setOffset({
      x: drag.startOffset.x + left - drag.panelRect.left,
      y: drag.startOffset.y + top - drag.panelRect.top,
    });
  };

  const stopDragging: PointerEventHandler<HTMLElement> = (event) => {
    if (dragState.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragState.current = undefined;
  };

  return {
    panelRef,
    offset,
    dragHandleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: stopDragging,
      onPointerCancel: stopDragging,
    },
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

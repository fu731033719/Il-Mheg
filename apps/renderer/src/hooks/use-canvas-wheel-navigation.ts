import { useEffect, type RefObject } from 'react';
import { type Edge, type ReactFlowInstance } from '@xyflow/react';
import type { CanvasFlowNode } from '@/components/nodes/canvas-nodes';
import { createCanvasWheelIntentClassifier, viewportForWheelZoom, type CanvasWheelInput } from '@/lib/canvas-navigation';

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2.5;

export function useCanvasWheelNavigation(
  workspaceRef: RefObject<HTMLDivElement | null>,
  instance: ReactFlowInstance<CanvasFlowNode, Edge> | null,
) {
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace || !instance) return;

    const classify = createCanvasWheelIntentClassifier();
    const handleWheel = (event: WheelEvent) => {
      const renderer = workspace.querySelector<HTMLElement>('.react-flow__renderer');
      if (!renderer || !(event.target instanceof Node) || !renderer.contains(event.target)) return;

      const intent = classify(event as CanvasWheelInput);
      if (intent !== 'wheel-zoom') return;

      event.preventDefault();
      event.stopPropagation();
      const bounds = renderer.getBoundingClientRect();
      const viewport = viewportForWheelZoom(
        instance.getViewport(),
        { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
        event,
        MIN_ZOOM,
        MAX_ZOOM,
      );
      void instance.setViewport(viewport);
    };

    workspace.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => workspace.removeEventListener('wheel', handleWheel, { capture: true });
  }, [instance, workspaceRef]);
}

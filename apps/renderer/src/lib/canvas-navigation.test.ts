import { describe, expect, it } from 'vitest';
import { createCanvasWheelIntentClassifier, viewportForWheelZoom, type CanvasWheelInput } from './canvas-navigation';

function wheel(overrides: Partial<CanvasWheelInput> = {}): CanvasWheelInput {
  return {
    ctrlKey: false,
    deltaMode: 0,
    deltaX: 0,
    deltaY: 0,
    timeStamp: 0,
    ...overrides,
  };
}

describe('canvas wheel navigation', () => {
  it('keeps trackpad scrolling as pan throughout its momentum sequence', () => {
    const classify = createCanvasWheelIntentClassifier();

    expect(classify(wheel({ deltaY: 2.5, timeStamp: 10 }))).toBe('pan');
    expect(classify(wheel({ deltaY: 72, timeStamp: 80 }))).toBe('pan');
    expect(classify(wheel({ deltaX: 14, deltaY: 5, timeStamp: 140 }))).toBe('pan');
  });

  it('recognizes discrete mouse wheel input and macOS pinch input', () => {
    const classify = createCanvasWheelIntentClassifier();

    expect(classify(wheel({ deltaY: 100, wheelDeltaY: -120, timeStamp: 10 }))).toBe('wheel-zoom');
    expect(classify(wheel({ ctrlKey: true, deltaY: -1.2, timeStamp: 30 }))).toBe('pinch-zoom');
    expect(classify(wheel({ deltaMode: 1, deltaY: -3, timeStamp: 300 }))).toBe('wheel-zoom');
  });

  it('zooms around the pointer and respects zoom bounds', () => {
    const anchor = { x: 140, y: 90 };
    const initial = { x: 20, y: 10, zoom: 1 };
    const next = viewportForWheelZoom(initial, anchor, wheel({ deltaY: -100 }), 0.15, 2.5);
    const flowPoint = {
      x: (anchor.x - initial.x) / initial.zoom,
      y: (anchor.y - initial.y) / initial.zoom,
    };

    expect(next.zoom).toBeGreaterThan(initial.zoom);
    expect(flowPoint.x * next.zoom + next.x).toBeCloseTo(anchor.x);
    expect(flowPoint.y * next.zoom + next.y).toBeCloseTo(anchor.y);
    expect(viewportForWheelZoom(initial, anchor, wheel({ deltaY: -10_000 }), 0.15, 2.5).zoom).toBe(2.5);
  });
});

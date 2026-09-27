export type CanvasWheelIntent = 'pan' | 'pinch-zoom' | 'wheel-zoom';

export type CanvasWheelInput = Pick<WheelEvent, 'ctrlKey' | 'deltaMode' | 'deltaX' | 'deltaY' | 'timeStamp'> & {
  wheelDeltaY?: number;
};

export type CanvasViewport = { x: number; y: number; zoom: number };
export type ScreenPoint = { x: number; y: number };

const PIXEL_DELTA_MODE = 0;
const WHEEL_SEQUENCE_IDLE_MS = 180;
const DISCRETE_PIXEL_DELTA = 50;
const LEGACY_WHEEL_STEP = 120;

export function createCanvasWheelIntentClassifier() {
  let activeIntent: Exclude<CanvasWheelIntent, 'pinch-zoom'> | null = null;
  let lastEventAt = Number.NEGATIVE_INFINITY;

  return (event: CanvasWheelInput): CanvasWheelIntent => {
    if (event.ctrlKey) return 'pinch-zoom';

    const belongsToActiveSequence = event.timeStamp - lastEventAt <= WHEEL_SEQUENCE_IDLE_MS;
    lastEventAt = event.timeStamp;
    if (belongsToActiveSequence && activeIntent) return activeIntent;

    activeIntent = isDiscreteMouseWheel(event) ? 'wheel-zoom' : 'pan';
    return activeIntent;
  };
}

export function viewportForWheelZoom(
  viewport: CanvasViewport,
  anchor: ScreenPoint,
  event: Pick<CanvasWheelInput, 'deltaMode' | 'deltaY'>,
  minZoom: number,
  maxZoom: number,
): CanvasViewport {
  const deltaScale = event.deltaMode === 1 ? 0.05 : event.deltaMode === 0 ? 0.002 : 1;
  const zoom = clamp(viewport.zoom * Math.pow(2, -event.deltaY * deltaScale), minZoom, maxZoom);
  const ratio = zoom / viewport.zoom;

  return {
    x: anchor.x - (anchor.x - viewport.x) * ratio,
    y: anchor.y - (anchor.y - viewport.y) * ratio,
    zoom,
  };
}

function isDiscreteMouseWheel(event: CanvasWheelInput): boolean {
  if (event.deltaMode !== PIXEL_DELTA_MODE) return true;
  if (Math.abs(event.deltaX) > 0) return false;

  const legacyDelta = Math.abs(event.wheelDeltaY ?? 0);
  if (legacyDelta >= LEGACY_WHEEL_STEP && legacyDelta % LEGACY_WHEEL_STEP === 0) return true;

  return Number.isInteger(event.deltaY) && Math.abs(event.deltaY) >= DISCRETE_PIXEL_DELTA;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

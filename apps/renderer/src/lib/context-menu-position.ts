export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ScreenSize {
  width: number;
  height: number;
}

export function fitContextMenuPosition(
  point: ScreenPoint,
  viewport: ScreenSize,
  menu: ScreenSize,
  margin = 8,
): ScreenPoint {
  const maxX = Math.max(margin, viewport.width - menu.width - margin);
  const maxY = Math.max(margin, viewport.height - menu.height - margin);
  return {
    x: Math.max(margin, Math.min(point.x, maxX)),
    y: Math.max(margin, Math.min(point.y, maxY)),
  };
}

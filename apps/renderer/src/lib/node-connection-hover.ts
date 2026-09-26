export const CONNECTION_BUTTON_SIZE = 24;

// Keep the 24px button plus 150% of its size as extra pointer tolerance.
export const CONNECTION_HOVER_ALLOWANCE = CONNECTION_BUTTON_SIZE * 1.5;
export const CONNECTION_HOVER_ZONE_SIZE = CONNECTION_BUTTON_SIZE + CONNECTION_HOVER_ALLOWANCE;

export const CONNECTION_BUTTON_CENTER_OUTSET = 28;
export const CONNECTION_HOVER_ZONE_OUTSET = CONNECTION_HOVER_ZONE_SIZE / 2 + CONNECTION_BUTTON_CENTER_OUTSET;
export const CONNECTION_HOVER_CARD_OVERLAP = CONNECTION_HOVER_ZONE_SIZE - CONNECTION_HOVER_ZONE_OUTSET;

const CONNECTION_POINT_EDGE_INSET = 14;

export function connectionPointY(clientY: number, cardTop: number, renderedHeight: number, localHeight = renderedHeight) {
  const scale = renderedHeight > 0 ? localHeight / renderedHeight : 1;
  const localY = (clientY - cardTop) * scale;
  return Math.round(Math.max(
    CONNECTION_POINT_EDGE_INSET,
    Math.min(localHeight - CONNECTION_POINT_EDGE_INSET, localY),
  ));
}

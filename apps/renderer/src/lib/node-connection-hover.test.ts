import { describe, expect, it } from 'vitest';
import {
  CONNECTION_BUTTON_SIZE,
  CONNECTION_BUTTON_CENTER_OUTSET,
  CONNECTION_HOVER_ALLOWANCE,
  CONNECTION_HOVER_CARD_OVERLAP,
  CONNECTION_HOVER_ZONE_OUTSET,
  CONNECTION_HOVER_ZONE_SIZE,
  connectionPointY,
} from './node-connection-hover';

describe('node connection hover geometry', () => {
  it('adds 150% of the button size as an external pointer tolerance', () => {
    expect(CONNECTION_HOVER_ALLOWANCE).toBe(CONNECTION_BUTTON_SIZE * 1.5);
    expect(CONNECTION_HOVER_ZONE_SIZE).toBe(60);
    expect(CONNECTION_HOVER_ZONE_OUTSET - CONNECTION_HOVER_ZONE_SIZE / 2).toBe(CONNECTION_BUTTON_CENTER_OUTSET);
    expect(CONNECTION_HOVER_ZONE_SIZE - CONNECTION_HOVER_ZONE_OUTSET).toBe(CONNECTION_HOVER_CARD_OVERLAP);
  });

  it('tracks the pointer along the card edge while keeping the button inside its corners', () => {
    expect(connectionPointY(160, 100, 224)).toBe(60);
    expect(connectionPointY(90, 100, 224)).toBe(14);
    expect(connectionPointY(400, 100, 224)).toBe(210);
  });

  it('converts screen coordinates into local node coordinates at a scaled viewport', () => {
    expect(connectionPointY(160, 100, 112, 224)).toBe(120);
  });
});

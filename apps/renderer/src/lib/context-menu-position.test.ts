import { describe, expect, it } from 'vitest';
import { fitContextMenuPosition } from './context-menu-position';

describe('fitContextMenuPosition', () => {
  it('keeps a pointer position that has room for the menu', () => {
    expect(fitContextMenuPosition(
      { x: 120, y: 180 },
      { width: 1280, height: 720 },
      { width: 208, height: 52 },
    )).toEqual({ x: 120, y: 180 });
  });

  it('keeps the menu inside every viewport edge', () => {
    expect(fitContextMenuPosition(
      { x: 1275, y: 715 },
      { width: 1280, height: 720 },
      { width: 208, height: 52 },
    )).toEqual({ x: 1064, y: 660 });
    expect(fitContextMenuPosition(
      { x: -40, y: -20 },
      { width: 1280, height: 720 },
      { width: 208, height: 52 },
    )).toEqual({ x: 8, y: 8 });
  });
});

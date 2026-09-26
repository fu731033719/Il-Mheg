import { describe, expect, it } from 'vitest';
import {
  connectedNodePosition,
  connectionForDrop,
  connectionOptions,
  connectionTargetHandle,
} from './node-connections';

describe('node connection interactions', () => {
  it('exposes domain-compatible node options from either spatial side', () => {
    expect(connectionOptions('prompt', 'left')).toEqual(['image', 'video']);
    expect(connectionOptions('prompt', 'right')).toEqual(['image', 'video']);
    expect(connectionOptions('image', 'left')).toEqual(['prompt', 'image', 'video']);
    expect(connectionOptions('video', 'right')).toEqual(['prompt', 'image', 'video']);
  });

  it('uses the activated side for direction when both node types are equivalent', () => {
    const origin = { id: 'origin', kind: 'image' as const };
    const other = { id: 'other', kind: 'image' as const };
    expect(connectionForDrop(origin, other, 'right')).toEqual({ source: 'origin', target: 'other' });
    expect(connectionForDrop(origin, other, 'left')).toEqual({ source: 'other', target: 'origin' });
  });

  it('keeps image to video direction regardless of spatial side', () => {
    const image = { id: 'image', kind: 'image' as const };
    const video = { id: 'video', kind: 'video' as const };
    expect(connectionForDrop(image, video, 'left')).toEqual({ source: 'image', target: 'video' });
    expect(connectionForDrop(video, image, 'right')).toEqual({ source: 'image', target: 'video' });
  });

  it('anchors video first and last frames on opposite sides', () => {
    expect(connectionTargetHandle({ kind: 'first_frame' })).toBe('first-frame-input');
    expect(connectionTargetHandle({ kind: 'last_frame' })).toBe('last-frame-input');
    expect(connectionTargetHandle({ kind: 'reference_image', index: 0 })).toBe('input');
  });

  it('places created cards against the selected or dropped connection point', () => {
    expect(connectedNodePosition({ x: 100, y: 100 }, 'right', 'prompt', 'adjacent')).toEqual({ x: 168, y: 28 });
    expect(connectedNodePosition({ x: 100, y: 200 }, 'left', 'image', 'drop')).toEqual({ x: -152, y: 52 });
  });
});

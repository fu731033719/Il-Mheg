import { describe, expect, it } from 'vitest';
import { resolveStoredTheme } from './theme';

describe('theme preference', () => {
  it('restores an explicitly selected dark theme', () => {
    expect(resolveStoredTheme('dark')).toBe('dark');
  });

  it('uses the light theme for missing or unsupported values', () => {
    expect(resolveStoredTheme(null)).toBe('light');
    expect(resolveStoredTheme('system')).toBe('light');
  });
});

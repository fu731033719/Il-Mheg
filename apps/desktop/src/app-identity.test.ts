import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_DISPLAY_NAME,
  resolveStartupApplicationName,
  resolveUserDataPath,
  SAFE_STORAGE_KEYCHAIN_NAME,
  USER_DATA_DIRECTORY_NAME,
} from './app-identity';

describe('desktop app identity', () => {
  it('keeps the persistence directory independent from the display name', () => {
    expect(APP_DISPLAY_NAME).toBe('ILMhegAgent');
    expect(USER_DATA_DIRECTORY_NAME).toBe('il-mheg-canvas');
    expect(resolveUserDataPath('/app-data')).toBe(path.join('/app-data', 'il-mheg-canvas'));
    expect(USER_DATA_DIRECTORY_NAME).not.toBe(APP_DISPLAY_NAME);
  });

  it('keeps the legacy macOS Keychain identity while preserving the display name elsewhere', () => {
    expect(SAFE_STORAGE_KEYCHAIN_NAME).toBe('il-mheg-canvas');
    expect(resolveStartupApplicationName('darwin')).toBe(SAFE_STORAGE_KEYCHAIN_NAME);
    expect(resolveStartupApplicationName('win32')).toBe(APP_DISPLAY_NAME);
    expect(resolveStartupApplicationName('linux')).toBe(APP_DISPLAY_NAME);
  });
});

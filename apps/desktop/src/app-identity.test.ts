import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_DISPLAY_NAME, resolveUserDataPath, USER_DATA_DIRECTORY_NAME } from './app-identity';

describe('desktop app identity', () => {
  it('keeps the persistence directory independent from the display name', () => {
    expect(APP_DISPLAY_NAME).toBe('ILMhegAgent');
    expect(USER_DATA_DIRECTORY_NAME).toBe('il-mheg-canvas');
    expect(resolveUserDataPath('/app-data')).toBe(path.join('/app-data', 'il-mheg-canvas'));
    expect(USER_DATA_DIRECTORY_NAME).not.toBe(APP_DISPLAY_NAME);
  });
});

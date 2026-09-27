import path from 'node:path';

export const APP_DISPLAY_NAME = 'ILMhegAgent';
export const USER_DATA_DIRECTORY_NAME = 'il-mheg-canvas';
export const SAFE_STORAGE_KEYCHAIN_NAME = 'il-mheg-canvas';

export function resolveUserDataPath(appDataPath: string) {
  return path.join(appDataPath, USER_DATA_DIRECTORY_NAME);
}

export function resolveStartupApplicationName(platform: NodeJS.Platform) {
  return platform === 'darwin' ? SAFE_STORAGE_KEYCHAIN_NAME : APP_DISPLAY_NAME;
}

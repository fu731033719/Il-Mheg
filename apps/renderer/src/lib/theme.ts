export const THEME_STORAGE_KEY = 'il-mheg:theme';

export type AppTheme = 'light' | 'dark';

export function resolveStoredTheme(value: string | null | undefined): AppTheme {
  return value === 'dark' ? 'dark' : 'light';
}

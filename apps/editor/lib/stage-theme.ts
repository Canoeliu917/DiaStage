export type StageThemePreference = 'day' | 'night' | 'system'

export const STAGE_THEME_STORAGE_KEY = 'diastage-stage-theme'

export function stageThemePreference(value: string | null): StageThemePreference {
  return value === 'day' || value === 'night' ? value : 'system'
}

export function resolveStageTheme(preference: StageThemePreference, dark: boolean) {
  return preference === 'system' ? (dark ? 'night' : 'day') : preference
}

export const STAGE_THEME_BOOTSTRAP = `(() => {
  let preference = 'system';
  try { preference = localStorage.getItem('${STAGE_THEME_STORAGE_KEY}') || 'system'; } catch {}
  const theme = preference === 'day' || preference === 'night'
    ? preference : (matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day');
  document.documentElement.dataset.stageTheme = theme;
  document.documentElement.classList.toggle('dark', theme === 'night');
})();`

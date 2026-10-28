/*
 * Theme sets are classes on <html>: `kradan` (กระดานเขียว, the board's default) and `workbench` (the design
 * workbench's look). The boot payload's `theme: {name, tokens}` (config kradan.theme) picks one and may override
 * any token, e.g. {"k-accent": "#7c3aed"}.
 */
export const THEMES = ['kradan', 'workbench'];

export function applyTheme(theme, fallback = 'kradan', root = document.documentElement) {
  const name = THEMES.includes(theme?.name) ? theme.name : fallback;
  THEMES.forEach(n => root.classList.toggle(n, n === name));
  Object.entries(theme?.tokens || {}).forEach(([k, v]) => {
    const prop = `--${String(k).replace(/^--/, '')}`;
    if (/^--[a-z0-9-]+$/i.test(prop) && typeof v === 'string' && !/[;{}<>]/.test(v)) { root.style.setProperty(prop, v); }
  });
  return name;
}

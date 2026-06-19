// Light/dark theme: defaults to the OS preference, overridable by the user and
// persisted. The initial value is applied by an inline script in index.html to
// avoid a flash of the wrong theme before React mounts.

export type Theme = 'light' | 'dark';

const KEY = 'spliced:theme';

export function getStoredTheme(): Theme | null {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

export function applyTheme(theme: Theme | null): void {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') {
    root.setAttribute('data-theme', theme);
  } else {
    root.removeAttribute('data-theme');
  }
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable — still apply for this session */
  }
  applyTheme(theme);
}

// The theme actually in effect right now (resolving "follow OS").
export function resolvedTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { resolvedTheme, setTheme } from '../theme.js';
import type { Theme } from '../theme.js';

export default function ThemeToggle() {
  const [theme, setLocal] = useState<Theme>('light');

  // Resolve on mount (avoids SSR/initial mismatch) and keep in sync.
  useEffect(() => setLocal(resolvedTheme()), []);

  function toggle() {
    const next = resolvedTheme() === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setLocal(next);
  }

  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Light theme' : 'Dark theme'}
    >
      <Icon name={isDark ? 'sun' : 'moon'} />
    </button>
  );
}

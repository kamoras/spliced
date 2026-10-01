// The active observance, applied to the whole page: sets data-obs on <html>
// plus CSS variables (flag colours, accent) that the stylesheet uses for the
// page stripe, console band, strip edges, lamps and accent.

import { useEffect, useState } from 'react';
import { observanceFor, userRegion } from './observances.js';
import type { Observance } from './observances.js';

const override = () => {
  try {
    return new URLSearchParams(location.search).get('theme');
  } catch {
    return null;
  }
};

const current = () => observanceFor(new Date(), override(), userRegion());

export function useObservance(): Observance | null {
  const [obs, setObs] = useState(current);

  // The local date can roll over while the tab is open; re-check on focus.
  useEffect(() => {
    const check = () => setObs(current());
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const vars = ['--obs-gradient', '--obs-accent', '--obs-on-accent'];
    const colors = obs?.colors ?? [];
    if (!obs) {
      root.removeAttribute('data-obs');
    } else {
      root.setAttribute('data-obs', obs.id);
      const stops = colors
        .map((c, i) => {
          const a = (i / colors.length) * 100;
          const b = ((i + 1) / colors.length) * 100;
          return `${c} ${a.toFixed(2)}% ${b.toFixed(2)}%`;
        })
        .join(', ');
      root.style.setProperty(
        '--obs-gradient',
        stops ? `linear-gradient(90deg, ${stops})` : 'none'
      );
      if (obs.accent) root.style.setProperty('--obs-accent', obs.accent);
      if (obs.onAccent) root.style.setProperty('--obs-on-accent', obs.onAccent);
      colors.forEach((c, i) => root.style.setProperty(`--obs-${i + 1}`, c));
    }
    return () => {
      root.removeAttribute('data-obs');
      [...vars, ...colors.map((_, i) => `--obs-${i + 1}`)].forEach((v) =>
        root.style.removeProperty(v)
      );
    };
  }, [obs]);

  return obs;
}

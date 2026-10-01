// A one-shot burst of CSS confetti for a win. Decorative; skipped entirely
// under prefers-reduced-motion.

import { useMemo } from 'react';
import type { CSSProperties } from 'react';

const COLORS = [
  '#7c5cff',
  '#ff4f8b',
  '#14a7bd',
  '#ff7a2f',
  '#ffd166',
  '#53d769',
];

export default function Confetti({ pieces = 60 }: { pieces?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        x: Math.random() * 100,
        drift: (Math.random() - 0.5) * 30,
        rot: Math.random() * 720 - 360,
        delay: Math.random() * 0.35,
        dur: 1.6 + Math.random() * 1.2,
        color: COLORS[i % COLORS.length],
        w: 6 + Math.random() * 6,
      })),
    [pieces]
  );
  if (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ) {
    return null;
  }
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <i
          key={i}
          style={
            {
              '--x': `${b.x}vw`,
              '--drift': `${b.drift}vw`,
              '--rot': `${b.rot}deg`,
              '--delay': `${b.delay}s`,
              '--dur': `${b.dur}s`,
              '--w': `${b.w}px`,
              background: b.color,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

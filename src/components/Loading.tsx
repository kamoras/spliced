// Loading state that looks like the board it's about to become, with a little
// tape-deck patter and real progress (tracks decoded so far).

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

const LINES = [
  'Threading the tape…',
  'Cutting today’s clips…',
  'Shuffling the reels…',
  'Warming up the faders…',
];

export default function Loading({
  loaded,
  total,
  rows = 4,
  cols = 4,
}: {
  loaded: number;
  total: number;
  rows?: number;
  cols?: number;
}) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLine((l) => (l + 1) % LINES.length), 1200);
    return () => clearInterval(id);
  }, []);
  return (
    <section className="loading" aria-busy="true">
      <div
        className="skeleton"
        style={{ '--cols': cols } as CSSProperties}
        aria-hidden="true"
      >
        {Array.from({ length: rows * cols }, (_, i) => (
          <span
            key={i}
            className={i < (loaded / total) * rows * cols ? 'is-loaded' : ''}
          />
        ))}
      </div>
      <p className="loading-line">
        {LINES[line]}{' '}
        <span className="muted">
          {loaded}/{total}
        </span>
      </p>
    </section>
  );
}

// A small analog-style VU meter. While `active`, it polls `getLevel()` each
// frame and lights segments; idle channels rest at the floor. Decorative, so
// it's hidden from assistive tech, and it stays still under reduced motion.

import { useEffect, useRef } from 'react';

const SEGMENTS = 5;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function VuMeter({
  getLevel,
  active,
}: {
  getLevel: () => number;
  active: boolean;
}) {
  const segRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rafRef = useRef(0);
  const levelRef = useRef(0);

  useEffect(() => {
    const paint = (level: number) => {
      segRefs.current.forEach((el, i) => {
        if (!el) return;
        const threshold = i / SEGMENTS;
        el.dataset.lit = level > threshold ? 'true' : 'false';
      });
    };

    if (!active || prefersReducedMotion()) {
      levelRef.current = 0;
      paint(0);
      return undefined;
    }

    const tick = () => {
      const target = getLevel();
      // Fast attack, slow release — the classic VU needle feel.
      const k = target > levelRef.current ? 0.55 : 0.12;
      levelRef.current += (target - levelRef.current) * k;
      paint(levelRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [active, getLevel]);

  return (
    <span
      className={`vu-meter${active ? ' vu-meter--active' : ''}`}
      aria-hidden="true"
    >
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            segRefs.current[i] = el;
          }}
          className="vu-seg"
          data-lit="false"
        />
      ))}
    </span>
  );
}

// A little analog VU meter: cream face, printed scale, swinging needle. While
// `active`, the needle follows the real output level; otherwise it rests.
// Decorative (aria-hidden). Under reduced motion the needle stays put and a
// small SIG lamp lights when there's signal instead.

import { useEffect, useRef } from 'react';
import { prefersReducedMotion, subscribeLevel } from '../audio/meter.js';

export default function VuNeedle({
  active,
  label,
}: {
  active: boolean;
  label?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (!active) {
      el.style.setProperty('--vu', '0');
      el.dataset.sig = 'false';
      return undefined;
    }
    const still = prefersReducedMotion();
    return subscribeLevel((v) => {
      el.dataset.sig = v > 0.05 ? 'true' : 'false';
      if (!still) el.style.setProperty('--vu', Math.min(1.08, v).toFixed(3));
    });
  }, [active]);

  return (
    <span ref={ref} className="vu" aria-hidden="true">
      <svg className="vu-scale" viewBox="0 0 44 28">
        <path d="M6 22 A19 19 0 0 1 38 22" className="vu-arc" />
        <path d="M30.5 12.6 A19 19 0 0 1 38 22" className="vu-red" />
        {[-50, -30, -10, 10, 30, 50].map((a) => (
          <line
            key={a}
            x1="22"
            y1="7"
            x2="22"
            y2="10"
            transform={`rotate(${a} 22 26)`}
          />
        ))}
        <text x="22" y="25">
          {label ?? 'VU'}
        </text>
      </svg>
      <span className="vu-needle" />
      <span className="vu-sig" />
    </span>
  );
}

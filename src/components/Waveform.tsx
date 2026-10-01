// A clip's waveform as inline SVG, drawn from its precomputed peaks. It uses
// `currentColor`, so it follows the theme with no redraw. While the clip plays,
// an accent copy is revealed left-to-right up to the playhead (driven by
// `getProgress` each frame, without re-rendering React).

import { useEffect, useMemo, useRef } from 'react';

interface WaveformProps {
  peaks: number[];
  active?: boolean;
  getProgress?: () => number | null;
}

function barsPath(peaks: number[]): string {
  const n = peaks.length || 1;
  const w = 100 / n;
  const bar = Math.max(0.6, w * 0.62);
  return peaks
    .map((p, i) => {
      const h = Math.max(4, p * 92);
      const x = i * w + (w - bar) / 2;
      const y = (100 - h) / 2;
      return `M${x.toFixed(2)} ${y.toFixed(2)}h${bar.toFixed(2)}v${h.toFixed(2)}h-${bar.toFixed(2)}z`;
    })
    .join('');
}

export default function Waveform({
  peaks,
  active = false,
  getProgress,
}: WaveformProps) {
  const d = useMemo(() => barsPath(peaks), [peaks]);
  const fillRef = useRef<SVGSVGElement | null>(null);
  const headRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const fill = fillRef.current;
    const head = headRef.current;
    if (!fill || !head) return undefined;
    const paint = (p: number | null) => {
      const pct = p == null ? 0 : p * 100;
      fill.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
      head.style.left = `${pct}%`;
      head.style.opacity = p == null ? '0' : '1';
    };
    if (!active || !getProgress) {
      paint(null);
      return undefined;
    }
    let raf = 0;
    const tick = () => {
      paint(getProgress());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, getProgress]);

  return (
    <span className="wave" aria-hidden="true">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="wave-base"
      >
        <path d={d} />
      </svg>
      <svg
        ref={fillRef}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="wave-fill"
      >
        <path d={d} />
      </svg>
      <span ref={headRef} className="wave-head" />
    </span>
  );
}

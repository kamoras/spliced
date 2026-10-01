// One shared level meter for the whole console: a single rAF loop reads the
// active player's output level and fans it out (with VU ballistics: quick
// attack, slow release) to every meter on screen — channel VUs, the logo's LED
// bar. Subscribers write CSS variables directly, so React never re-renders.

type Listener = (level: number) => void;

let source: (() => number) | null = null;
const listeners = new Set<Listener>();
let raf = 0;
let level = 0;

export function setLevelSource(fn: (() => number) | null): void {
  source = fn;
}

function tick() {
  const target = source?.() ?? 0;
  level += (target - level) * (target > level ? 0.3 : 0.06);
  if (level < 0.002) level = 0;
  listeners.forEach((fn) => fn(level));
  raf = requestAnimationFrame(tick);
}

export function subscribeLevel(fn: Listener): () => void {
  listeners.add(fn);
  if (!raf && typeof requestAnimationFrame !== 'undefined') {
    raf = requestAnimationFrame(tick);
  }
  return () => {
    listeners.delete(fn);
    if (!listeners.size && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

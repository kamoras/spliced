// Shared seeded RNG used by both the client (puzzle layout, practice picks) and
// the daily API (catalog shuffle). One copy keeps every surface deterministic:
// the same seed yields the same sequence in every browser and runtime.
//
// Files prefixed with "_" are NOT treated as routes by Vercel.

// Returns a float in [0, 1) on each call.
export type Rng = () => number;

// Small, fast seeded PRNG. Same seed -> same sequence, everywhere.
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher–Yates shuffle into a new array. `rand` returns a float in [0, 1);
// pass a seeded generator for deterministic output, or omit for Math.random.
export function shuffle<T>(items: readonly T[], rand: Rng = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

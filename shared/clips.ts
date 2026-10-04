// Opaque clip ids, shared by the slicer (client) and /api/reveal (server).
// The ids are a seeded shuffle of the board's clip indexes, so nothing in
// the page (ids, saved progress) spells out which song or slot a clip belongs
// to, while the server can still recompute which ids make up a row.

import { mulberry32 } from './prng.js';

// Ids for a board of `count` clips (track-major: clip i of track t is index
// t * clipsPerTrack + i), keyed by that index.
export function clipIds(count: number, seed: number): string[] {
  const rand = mulberry32(seed * 7919 + 17);
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.map((n) => `clip-${n.toString(36)}`);
}

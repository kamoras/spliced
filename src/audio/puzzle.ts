// Pure helpers for arranging and grading mixer puzzle pieces.

import { mulberry32, shuffle } from '../../shared/prng.js';

// The minimal piece shape these helpers need. The real Piece satisfies it; the
// looser shape keeps the functions easy to unit-test with bare fixtures.
interface OrderablePiece {
  id: string;
  correctIndex: number;
  trackId?: string;
}

// Fisher-Yates shuffle that guarantees the result is not already solved when
// the piece set is large enough to scramble. Pass a seed for deterministic play.
export function shufflePieces<T extends OrderablePiece>(
  pieces: T[],
  seed?: number
): T[] {
  if (pieces.length < 2) return [...pieces];

  const seeded = typeof seed === 'number';
  let attempt = 0;
  let order: T[];
  do {
    const rand = seeded ? mulberry32(seed + attempt) : Math.random;
    order = shuffle(pieces, rand);
    attempt++;
  } while (isSolved(order) && attempt < 200);

  return order;
}

// Solved when every piece sits at its correct index, in ascending order.
export function isSolved(order: OrderablePiece[]): boolean {
  return order.every((piece, idx) => piece.correctIndex === idx);
}

export function chunkTracks<T>(order: T[], clipsPerTrack: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < order.length; i += clipsPerTrack) {
    rows.push(order.slice(i, i + clipsPerTrack));
  }
  return rows;
}

// Is any row already its own song, in order? A fresh board shouldn't hand
// out a free lock.
export function anyRowSolved<T extends OrderablePiece>(
  order: T[],
  tracks: { pieces: T[] }[],
  clipsPerTrack: number
): boolean {
  return chunkTracks(order, clipsPerTrack).some((row, r) => {
    const want = tracks[r]?.pieces;
    return (
      want != null &&
      row.length === want.length &&
      row.every((p, i) => p.id === want[i].id)
    );
  });
}

export function buildMixerOrder<T extends OrderablePiece>(
  tracks: { pieces: T[] }[],
  seed?: number
): T[] {
  const pieces = tracks.flatMap((track) => track.pieces);
  if (pieces.length < 2) return [...pieces];

  const clipsPerTrack = tracks[0]?.pieces.length || 1;
  const seeded = typeof seed === 'number';
  let attempt = 0;
  let order: T[];
  do {
    const rand = seeded ? mulberry32(seed + attempt) : Math.random;
    order = shuffle(pieces, rand);
    attempt++;
  } while (anyRowSolved(order, tracks, clipsPerTrack) && attempt < 200);

  return order;
}

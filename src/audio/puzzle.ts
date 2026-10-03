// Pure helpers for arranging and grading mixer puzzle pieces.

import { mulberry32, shuffle } from '../../shared/prng.js';
import type { CellGrade, RowGrade } from '../types.js';

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
  } while (
    isMixerSolved(chunkTracks(order, clipsPerTrack), tracks.length) &&
    attempt < 200
  );

  return order;
}

// Which song a row is "trying" to be: the song with the most clips in it. Ties
// go to the song with more clips already in their correct slot, then to the
// earliest clip. Anchoring on the majority (not just the first clip) means a
// single stray clip at the front can't make the whole row's feedback useless.
export function rowAnchor(row: OrderablePiece[]): string | null {
  let best: string | null = null;
  let bestCount = -1;
  let bestPlaced = -1;
  row.forEach((piece) => {
    const id = piece.trackId;
    if (!id || id === best) return;
    let count = 0;
    let placed = 0;
    row.forEach((other, idx) => {
      if (other.trackId !== id) return;
      count++;
      if (other.correctIndex === idx) placed++;
    });
    if (count > bestCount || (count === bestCount && placed > bestPlaced)) {
      best = id;
      bestCount = count;
      bestPlaced = placed;
    }
  });
  return best;
}

export function gradeMixerRow(
  row: OrderablePiece[],
  solvedTrackIds: string[] = []
): RowGrade {
  const trackId = rowAnchor(row);
  const alreadySolved = trackId ? solvedTrackIds.includes(trackId) : false;
  const cells: CellGrade[] = row.map((piece, idx) => {
    const sameTrack = Boolean(trackId) && piece.trackId === trackId;
    const correct = sameTrack && piece.correctIndex === idx;
    return {
      id: piece.id,
      correct,
      sameTrack: sameTrack && !correct,
    };
  });
  const correctPositions = cells.filter((cell) => cell.correct).length;
  const rightRowCount = cells.filter(
    (cell) => cell.correct || cell.sameTrack
  ).length;
  const solved =
    row.length > 0 && correctPositions === row.length && !alreadySolved;

  return {
    solved,
    trackId,
    sameTrack: rightRowCount === row.length && row.length > 0,
    correctPositions,
    rightRowCount,
    alreadySolved,
    cells,
  };
}

export function isMixerSolved(
  rows: OrderablePiece[][],
  trackCount: number
): boolean {
  const solvedTrackIds: string[] = [];
  for (const row of rows) {
    const grade = gradeMixerRow(row, solvedTrackIds);
    if (grade.solved && grade.trackId) solvedTrackIds.push(grade.trackId);
  }
  return solvedTrackIds.length === trackCount;
}

// Build the engine's view of a board from the sliced tracks.

import type { PuzzleDef } from './engine.js';
import type { Track } from '../types.js';

export function puzzleDef(
  tracks: Track[],
  clipsPerTrack: number,
  maxGuesses: number
): PuzzleDef {
  return {
    clipsPerTrack,
    maxGuesses,
    tracks: tracks.map((t) => ({ id: t.id, pieces: t.pieces, clue: t.clue })),
  };
}

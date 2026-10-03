// Guards for what the API sends back. A malformed payload (an old deploy, a
// proxy error page) fails here with a clear message instead of deep inside
// the slicer or the engine.

import type { DailyResponse, TrackDef } from '../types.js';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v != null && typeof v === 'object' && !Array.isArray(v);

export function parseTrackDef(v: unknown): TrackDef | null {
  if (!isRecord(v) || typeof v.previewUrl !== 'string') return null;
  if (!/^https?:\/\//.test(v.previewUrl)) return null;
  const track: TrackDef = { previewUrl: v.previewUrl };
  if (typeof v.id === 'string') track.id = v.id;
  if (typeof v.ref === 'string') track.ref = v.ref;
  if (isRecord(v.clue)) {
    track.clue = {
      ...(typeof v.clue.year === 'number' ? { year: v.clue.year } : {}),
      ...(typeof v.clue.genre === 'string' ? { genre: v.clue.genre } : {}),
      showGenre: v.clue.showGenre === true,
    };
  }
  if (
    isRecord(v.beat) &&
    typeof v.beat.bpm === 'number' &&
    typeof v.beat.offset === 'number'
  ) {
    track.beat = { bpm: v.beat.bpm, offset: v.beat.offset };
  }
  return track;
}

export function parseTracks(v: unknown): TrackDef[] | null {
  if (!Array.isArray(v)) return null;
  const tracks = v.map(parseTrackDef);
  return tracks.every((t): t is TrackDef => t != null) ? tracks : null;
}

export function parseDaily(v: unknown): DailyResponse | null {
  if (!isRecord(v)) return null;
  const tracks = parseTracks(v.tracks);
  if (
    !tracks ||
    typeof v.puzzleNumber !== 'number' ||
    typeof v.clipsPerTrack !== 'number' ||
    typeof v.maxGuesses !== 'number'
  ) {
    return null;
  }
  return {
    puzzleNumber: v.puzzleNumber,
    trackCount: tracks.length,
    clipsPerTrack: v.clipsPerTrack,
    numPieces: tracks.length * v.clipsPerTrack,
    maxGuesses: v.maxGuesses,
    tracks,
  };
}

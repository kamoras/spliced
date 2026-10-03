// Reveals a row's song, in two steps, only when the game needs it:
//
//   ?ref=…&part=choices&order=…  the 4 name-that-tune options (row spliced)
//   ?ref=…&part=answer&order=…   title, artist, artwork (after the quiz, or
//                                 at the end)
//
// `order` is the row's clip ids in the correct order: proof the row was
// solved (or revealed), since those ids are only known once it is.
//
// /api/daily and /api/practice send only an opaque `ref` per row, so the
// answers aren't sitting in the network panel. (The catalog and schedule are
// open source, so this deters peeking rather than determined cheating.)
//
// Refs are stateless (see dailyRef/practiceRef in daily.ts): the server
// rebuilds the row from them, so the same ref always gives the same answer
// and responses cache forever. Future dailies are refused.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { json } from './_http.js';
import {
  CATALOG,
  choiceRand,
  choicesFor,
  selectDaily,
  sortTimeline,
} from './daily.js';
import { DAILY_CLIPS_PER_TRACK, DAY_MS, LAUNCH_UTC } from '../shared/game.js';
import { clipIds } from '../shared/clips.js';
import type { CatalogEntry } from './_types.js';

const MAX_SONGS = 6;

interface Row {
  songs: CatalogEntry[];
  idx: number;
  seed: number;
  // The clip ids that make up this row, in the right order (the proof a
  // caller must show: see rowOrder).
  order: string[];
}

// The ids of row `idx` on a board sliced with `seed` (see shared/clips.ts).
function rowOrder(
  tracks: number,
  clips: number,
  seed: number,
  idx: number
): string[] {
  return clipIds(tracks * clips, seed).slice(idx * clips, (idx + 1) * clips);
}

const b36 = (v: string) => (/^[0-9a-z]{1,12}$/.test(v) ? parseInt(v, 36) : NaN);

// Parse a ref back into its mix (timeline order), row and decoy seed.
export function resolveRef(
  ref: string,
  nowMs: number,
  catalog: CatalogEntry[] = CATALOG
): Row | null {
  const daily = /^d([0-9a-z]{1,6})\.(\d)$/.exec(ref);
  if (daily) {
    const puzzle = b36(daily[1]);
    const today = Math.floor((nowMs - LAUNCH_UTC) / DAY_MS);
    if (!(puzzle >= 0 && puzzle <= today)) return null;
    const { songs } = selectDaily(LAUNCH_UTC + puzzle * DAY_MS, catalog);
    const idx = Number(daily[2]);
    if (idx >= songs.length) return null;
    return {
      songs: sortTimeline(songs),
      idx,
      seed: puzzle,
      order: rowOrder(songs.length, DAILY_CLIPS_PER_TRACK, puzzle, idx),
    };
  }
  const practice = /^p([0-9a-z-]{1,100})\.([0-9a-z]{1,8})\.(\d)\.(\d)$/.exec(
    ref
  );
  if (practice) {
    const ids = practice[1].split('-').map(b36);
    const seed = b36(practice[2]);
    const clips = Number(practice[3]);
    const idx = Number(practice[4]);
    if (ids.length < 2 || ids.length > MAX_SONGS || idx >= ids.length) {
      return null;
    }
    if (clips < 2 || clips > 8) return null;
    const byId = new Map(catalog.map((c) => [c.trackId, c]));
    const songs = ids.map((id) => byId.get(id));
    if (songs.some((s) => !s) || !Number.isFinite(seed)) return null;
    return {
      songs: songs as CatalogEntry[],
      idx,
      seed,
      order: rowOrder(ids.length, clips, seed, idx),
    };
  }
  return null;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const part = url.searchParams.get('part');
  const row = resolveRef(url.searchParams.get('ref') ?? '', Date.now());
  if (!row || (part !== 'choices' && part !== 'answer')) {
    return json(res, 404, { error: 'unknown_ref' });
  }
  // Show your work: the row's clips in the right order. The board only has
  // that once the song is spliced (or the game is over and revealed), so a
  // reveal can't be read ahead of time just by knowing the URL.
  if (url.searchParams.get('order') !== row.order.join(',')) {
    return json(res, 403, { error: 'not_earned' });
  }
  const song = row.songs[row.idx];
  const cache = 'public, max-age=86400, s-maxage=31536000, immutable';
  if (part === 'choices') {
    const choices = choicesFor(song, row.songs, choiceRand(row.seed, row.idx));
    return json(res, 200, { choices }, cache);
  }
  return json(
    res,
    200,
    { title: song.title, artist: song.artist, artwork: song.artwork },
    cache
  );
}

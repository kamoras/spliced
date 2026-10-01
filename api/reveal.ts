// Reveals a row's song, in two steps, only when the game needs it:
//
//   ?ref=…&part=choices  the 4 name-that-tune options (after the row is spliced)
//   ?ref=…&part=answer   title, artist and artwork (after the quiz, or at the end)
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
import { LAUNCH_UTC } from './_songs.js';
import type { CatalogEntry } from './_types.js';

const DAY_MS = 86400000;
const MAX_SONGS = 6;

interface Row {
  songs: CatalogEntry[];
  idx: number;
  seed: number;
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
    return { songs: sortTimeline(songs), idx, seed: puzzle };
  }
  const practice = /^p([0-9a-z-]{1,100})\.([0-9a-z]{1,8})\.(\d)$/.exec(ref);
  if (practice) {
    const ids = practice[1].split('-').map(b36);
    const seed = b36(practice[2]);
    const idx = Number(practice[3]);
    if (ids.length < 2 || ids.length > MAX_SONGS || idx >= ids.length) {
      return null;
    }
    const byId = new Map(catalog.map((c) => [c.trackId, c]));
    const songs = ids.map((id) => byId.get(id));
    if (songs.some((s) => !s) || !Number.isFinite(seed)) return null;
    return { songs: songs as CatalogEntry[], idx, seed };
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

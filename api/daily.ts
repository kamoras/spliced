// Returns today's puzzle: deterministic by UTC date, identical for everyone.
//
// Songs come from api/_catalog.json — a large catalog of iTunes tracks (charts
// + curated classics) pinned by scripts/build-catalog.ts. Each entry already
// carries its preview URL, so serving is just selection: no live resolution, no
// drift. Answers are not included: see api/reveal.ts.

import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { json } from './_http.js';
import { mulberry32, shuffle } from './_prng.js';
import type { CatalogEntry, ITunesResult } from './_types.js';
import {
  DAILY_TRACKS,
  DAILY_CLIPS_PER_TRACK,
  DAILY_PIECES,
  DAILY_GUESSES,
  LAUNCH_UTC,
} from './_songs.js';

const DAY_MS = 86400000;

// The pinned catalog (source of truth). Empty only if the build wasn't run.
export const CATALOG = loadCatalog();
function loadCatalog(): CatalogEntry[] {
  try {
    return JSON.parse(
      readFileSync(new URL('./_catalog.json', import.meta.url), 'utf8')
    );
  } catch (err) {
    console.error('daily: could not load _catalog.json', err);
    return [];
  }
}

export const norm = (s: string | null | undefined): string =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();

// Prefer a result whose artist matches; require a preview; else first preview.
// Used by scripts/build-catalog.ts to resolve curated songs.
export function pickMatch(
  results: ITunesResult[] | null | undefined,
  song: { artist: string }
): ITunesResult | null {
  const withPreview = (results || []).filter((t) => t.previewUrl);
  const wantArtist = norm(song.artist);
  const byArtist = withPreview.find((t) =>
    norm(t.artistName).includes(wantArtist)
  );
  return byArtist || withPreview[0] || null;
}

// Deterministic seeded shuffle so the same epoch yields the same catalog order
// in every browser/runtime. The `+ 1` keeps epoch 0 from being the identity
// seed — preserving the established daily rotation.
const seededShuffle = (items: readonly CatalogEntry[], seed: number) =>
  shuffle(items, mulberry32(seed + 1));

// Pure: which puzzle + songs correspond to a given moment (UTC). Identical for
// everyone on a given UTC day; clamps to puzzle #0 before launch.
//
// Songs are drawn from a per-epoch shuffle of the whole catalog, taking the
// next DAILY_TRACKS each day. An epoch is one full pass (floor(N / tracks)
// puzzles), so no song repeats within an epoch and each epoch reshuffles for
// fresh groupings — maximizing variety. `catalog` is injectable for tests.
export function selectDaily(nowMs: number, catalog: CatalogEntry[] = CATALOG) {
  const todayUtc = Math.floor(nowMs / DAY_MS) * DAY_MS;
  const puzzleNumber = Math.max(
    0,
    Math.floor((todayUtc - LAUNCH_UTC) / DAY_MS)
  );
  const perEpoch = Math.max(1, Math.floor(catalog.length / DAILY_TRACKS));
  const epoch = Math.floor(puzzleNumber / perEpoch);
  const indexInEpoch = puzzleNumber % perEpoch;
  const ordered = seededShuffle(catalog, epoch);
  const start = indexInEpoch * DAILY_TRACKS;
  const songs = ordered.slice(start, start + DAILY_TRACKS);
  return { puzzleNumber, songs };
}

// Name-that-tune options: the answer plus three decoys from the catalog (none
// of today's songs, none by the same artist), in a shuffled order. Pass a
// seeded `rand` for the daily so everyone sees the same choices.
export interface Choice {
  title: string;
  artist: string;
}

export function choicesFor(
  answer: CatalogEntry,
  exclude: CatalogEntry[],
  rand: () => number,
  catalog: CatalogEntry[] = CATALOG
): Choice[] {
  const banned = new Set(exclude.map((s) => s.trackId));
  const artists = new Set([norm(answer.artist)]);
  const near = (c: CatalogEntry, span: number) =>
    answer.year == null ||
    c.year == null ||
    Math.abs(c.year - answer.year) <= span;
  // Decoys should be plausible: same genre and era first, widening as needed,
  // so the answer can't be spotted by genre or decade alone.
  const tiers: ((c: CatalogEntry) => boolean)[] = [
    (c) => c.genre === answer.genre && near(c, 4),
    (c) => c.genre === answer.genre && near(c, 8),
    (c) => near(c, 8),
    () => true,
  ];
  const decoys: CatalogEntry[] = [];
  for (const fits of tiers) {
    // Seeded shuffle of the candidates keeps the daily identical for everyone.
    const pool = shuffle(
      catalog.filter(
        (c) => fits(c) && !banned.has(c.trackId) && !artists.has(norm(c.artist))
      ),
      rand
    );
    for (const pick of pool) {
      if (decoys.length === 3) break;
      if (artists.has(norm(pick.artist))) continue;
      artists.add(norm(pick.artist));
      banned.add(pick.trackId);
      decoys.push(pick);
    }
    if (decoys.length === 3) break;
  }
  return shuffle([answer, ...decoys], rand).map(({ title, artist }) => ({
    title,
    artist,
  }));
}

// Minimum tempo-analysis confidence to cut a song on its beat grid; below
// this (rubato, live drums, ambient) clips fall back to fixed-length cuts.
export const BEAT_CONFIDENCE = 0.3;

export function beatGrid(
  song: CatalogEntry
): { bpm: number; offset: number } | undefined {
  if (!song.bpm || song.beat == null) return undefined;
  if ((song.beatConf ?? 0) < BEAT_CONFIDENCE) return undefined;
  return { bpm: song.bpm, offset: song.beat };
}

// Timeline order: oldest first, ties broken by id so it's stable.
export function sortTimeline(songs: CatalogEntry[]): CatalogEntry[] {
  return [...songs].sort(
    (a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.trackId - b.trackId
  );
}

// Lay a set of songs out as a Timeline board: rows ordered by release year
// (oldest first), each with its year clue, plus genre where two rows share a
// year (or the year is unknown), so every row stays distinguishable.
//
// No titles, artists, artwork or quiz choices: each row carries an opaque
// `ref`, and /api/reveal hands those out only once the song is spliced (see
// api/reveal.ts), so the answers aren't sitting in the network panel.
export function timelineTracks(
  songs: CatalogEntry[],
  refFor: (idx: number) => string
) {
  const sorted = sortTimeline(songs);
  return sorted.map((song, idx) => {
    const collides =
      song.year == null ||
      sorted.some((o) => o !== song && o.year === song.year);
    return {
      id: `track-${idx}`,
      ref: refFor(idx),
      previewUrl: song.previewUrl,
      clue: { year: song.year, genre: song.genre, showGenre: collides },
      beat: beatGrid(song),
    };
  });
}

// Opaque row references for /api/reveal. Daily: the puzzle number and row.
// Practice: the mix's song ids, a decoy seed, and the row (all base 36).
export const dailyRef = (puzzle: number, idx: number) =>
  `d${puzzle.toString(36)}.${idx}`;
export const practiceRef = (ids: number[], seed: number, idx: number) =>
  `p${ids.map((n) => n.toString(36)).join('-')}.${seed.toString(36)}.${idx}`;

// Seed for a row's name-that-tune decoys (shared by the daily and practice).
export const choiceRand = (seed: number, idx: number) =>
  mulberry32(seed * 977 + idx);

// Practice songs: ones that already appeared in a past daily this epoch, so
// practising never spoils an upcoming puzzle. Early in an epoch (a small pool)
// it falls back to the whole catalog. Today's songs are always excluded.
export function practicePool(
  nowMs: number,
  catalog: CatalogEntry[] = CATALOG
): CatalogEntry[] {
  const { puzzleNumber, songs: today } = selectDaily(nowMs, catalog);
  const perEpoch = Math.max(1, Math.floor(catalog.length / DAILY_TRACKS));
  const epoch = Math.floor(puzzleNumber / perEpoch);
  const played = (puzzleNumber % perEpoch) * DAILY_TRACKS;
  const order = seededShuffle(catalog, epoch);
  const past = order.slice(0, played);
  const todayIds = new Set(today.map((s) => s.trackId));
  if (past.length >= 40) return past.filter((s) => !todayIds.has(s.trackId));
  // Early in an epoch: use the whole catalog, minus today and the next 30
  // days of this epoch, so practice can't spoil an upcoming daily.
  const upcoming = new Set(
    order.slice(played, played + 31 * DAILY_TRACKS).map((s) => s.trackId)
  );
  return catalog.filter(
    (s) => !todayIds.has(s.trackId) && !upcoming.has(s.trackId)
  );
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
) {
  const url = new URL(req.url ?? '/', 'http://localhost');

  // ?date=YYYY-MM-DD picks a day (the client always sends its UTC date, so
  // each day is its own cache entry and nobody gets yesterday's puzzle from
  // cache after midnight). Future days are refused: no peeking ahead.
  const dateParam = url.searchParams.get('date');
  const realNow = Date.now();
  const nowMs = dateParam ? Date.parse(dateParam) : realNow;
  if (Number.isNaN(nowMs)) return json(res, 400, { error: 'bad_date' });
  if (Math.floor(nowMs / DAY_MS) > Math.floor(realNow / DAY_MS)) {
    return json(res, 404, { error: 'not_yet' });
  }

  if (CATALOG.length < DAILY_TRACKS) {
    return json(res, 502, { error: 'catalog_unavailable' });
  }

  const { puzzleNumber, songs } = selectDaily(nowMs);
  const tracks = timelineTracks(songs, (idx) => dailyRef(puzzleNumber, idx));

  // A dated request never changes, so it can be cached for a long time. An
  // undated one is "today": cache only until the midnight flip, never stale.
  const secondsLeft = Math.max(
    1,
    Math.ceil((DAY_MS - (realNow % DAY_MS)) / 1000)
  );
  const cache = dateParam
    ? 'public, max-age=86400, s-maxage=31536000, immutable'
    : `public, max-age=${Math.min(300, secondsLeft)}, s-maxage=${secondsLeft}`;

  return json(
    res,
    200,
    {
      puzzleNumber,
      trackCount: DAILY_TRACKS,
      clipsPerTrack: DAILY_CLIPS_PER_TRACK,
      numPieces: DAILY_PIECES,
      maxGuesses: DAILY_GUESSES,
      tracks,
    },
    cache
  );
}

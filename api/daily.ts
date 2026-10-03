// Returns today's puzzle: deterministic by UTC date, identical for everyone.
//
// Songs come from api/_catalog.json — a large catalog of iTunes tracks (charts
// + curated classics) pinned by scripts/build-catalog.ts. Each entry already
// carries its preview URL, so serving is just selection: no live resolution, no
// drift. Answers are not included: see api/reveal.ts.

import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { json } from './_http.js';
import { mulberry32, shuffle } from '../shared/prng.js';
import { DAY_MS, puzzleDate, puzzleNumberFor } from '../shared/game.js';
import { FEATURES, featureFor, inFeature } from './_features.js';
import type { Feature } from './_features.js';
import type { CatalogEntry, ITunesResult } from './_types.js';
import {
  DAILY_TRACKS,
  DAILY_CLIPS_PER_TRACK,
  DAILY_PIECES,
  DAILY_GUESSES,
} from './_songs.js';

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
// seed.
const seededShuffle = (items: readonly CatalogEntry[], seed: number) =>
  shuffle(items, mulberry32(seed + 1));

// ---- The schedule ------------------------------------------------------------
// A daily is three songs, and a bad trio is the one thing the rules can't
// save: three songs nobody knows, two by the same artist, a seam that stumbles
// because a song was cut off the beat. So the schedule is a constrained,
// deterministic pass over the catalog rather than a blind shuffle.
//
// Each epoch shuffles the eligible catalog (seeded), then walks it greedily:
// the next unused song anchors a day, and the first two later songs that make
// a valid trio with it join. A song that can't find partners is held back for
// the next epoch. Every day must have:
//   - three different artists and three different release years
//   - every song cut on its beat grid (seams never clunk)
//   - at least one classic (curated, or released before 2000)
//   - at most one song from the last couple of years
//   - not all three from the same decade
// and, during an observance, a song from its pool while the pool lasts.

const RECENT_FROM = 2024;
const CLASSIC_BEFORE = 2000;

export const isClassic = (s: CatalogEntry): boolean =>
  Boolean(s.classic) || (s.year ?? 9999) < CLASSIC_BEFORE;
const isRecent = (s: CatalogEntry): boolean => (s.year ?? 0) >= RECENT_FROM;
// Audible for long enough to cut four clips from, after the intro.
const audible = (s: CatalogEntry): boolean =>
  !s.loud || s.loud[1] - s.loud[0] >= 12;

export const dailyEligible = (s: CatalogEntry): boolean =>
  s.year != null && beatGrid(s) != null && audible(s);

const decade = (s: CatalogEntry) => Math.floor((s.year ?? 0) / 10);
const artistKey = (s: CatalogEntry) => norm(s.artist);

function pairOk(a: CatalogEntry, b: CatalogEntry): boolean {
  return artistKey(a) !== artistKey(b) && a.year !== b.year;
}

export function trioOk(songs: CatalogEntry[]): boolean {
  for (let i = 0; i < songs.length; i++) {
    for (let j = i + 1; j < songs.length; j++) {
      if (!pairOk(songs[i], songs[j])) return false;
    }
  }
  return (
    songs.some(isClassic) &&
    songs.filter(isRecent).length <= 1 &&
    new Set(songs.map(decade)).size > 1
  );
}

// Features whose window hasn't started yet in an epoch that began on `start`.
function upcomingFeatures(date: Date, start: Date): Feature[] {
  return FEATURES.filter((f) => {
    let from = Date.UTC(start.getUTCFullYear(), f.from[0] - 1, f.from[1]);
    const to = Date.UTC(start.getUTCFullYear(), f.to[0] - 1, f.to[1]);
    if (to < start.getTime())
      from = Date.UTC(start.getUTCFullYear() + 1, f.from[0] - 1, f.from[1]);
    return from > date.getTime();
  });
}

// One epoch's days, starting at puzzle number `first`.
function buildEpoch(
  catalog: CatalogEntry[],
  epoch: number,
  first: number
): CatalogEntry[][] {
  const eligible = catalog.filter(dailyEligible);
  // A tiny catalog (tests) gets no constraints at all beyond "three songs".
  if (eligible.length < 60) {
    const order = seededShuffle(catalog, epoch);
    const days: CatalogEntry[][] = [];
    for (let i = 0; i + DAILY_TRACKS <= order.length; i += DAILY_TRACKS) {
      days.push(order.slice(i, i + DAILY_TRACKS));
    }
    return days;
  }
  const remaining = seededShuffle(eligible, epoch);
  const days: CatalogEntry[][] = [];
  const epochStart = puzzleDate(first);
  // How many leading songs we've given up on this epoch (no partners).
  let skipped = 0;
  while (remaining.length - skipped >= DAILY_TRACKS) {
    const date = puzzleDate(first + days.length);
    const feature = featureFor(date);
    // Songs saved for an observance still to come this epoch aren't fillers
    // on ordinary days; after the window they're free again.
    const reserved = (s: CatalogEntry) =>
      upcomingFeatures(date, epochStart).some((f) => inFeature(s, f));
    const pool = feature ? remaining.filter((s) => inFeature(s, feature)) : [];
    const usable = pool.length
      ? remaining
      : remaining.filter((s) => !reserved(s));
    // The day's anchor: a featured song while there are any, else the next
    // song in line.
    const anchor = pool[0] ?? usable[skipped];
    if (!anchor) break;
    const anchorAt = remaining.indexOf(anchor);
    let trio: CatalogEntry[] | null = null;
    // A featured day takes one song from the pool and fills the rest from
    // outside it, so the pool stretches across the whole window.
    const rest = pool.length
      ? remaining.filter((s) => s !== anchor && !inFeature(s, feature!))
      : usable.filter((s) => s !== anchor);
    let tries = 0;
    for (let i = 0; i < rest.length && !trio && tries < 60; i++) {
      if (!pairOk(anchor, rest[i])) continue;
      tries++;
      for (let j = i + 1; j < rest.length; j++) {
        const candidate = [anchor, rest[i], rest[j]];
        if (trioOk(candidate)) {
          trio = candidate;
          break;
        }
      }
    }
    if (!trio) {
      // No valid partners: park the anchor at the back so it stops anchoring.
      remaining.splice(anchorAt, 1);
      remaining.push(anchor);
      skipped++;
      continue;
    }
    const used = new Set(trio.map((s) => s.trackId));
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (used.has(remaining[i].trackId)) remaining.splice(i, 1);
    }
    days.push(trio);
  }
  return days;
}

// Epochs are built lazily and cached per catalog (tests inject their own).
const schedules = new WeakMap<CatalogEntry[], CatalogEntry[][][]>();

export function scheduleFor(
  puzzleNumber: number,
  catalog: CatalogEntry[] = CATALOG
): { epoch: number; day: number; songs: CatalogEntry[] } {
  let epochs = schedules.get(catalog);
  if (!epochs) {
    epochs = [];
    schedules.set(catalog, epochs);
  }
  let first = 0;
  for (let e = 0; ; e++) {
    if (!epochs[e]) epochs[e] = buildEpoch(catalog, e, first);
    const days = epochs[e];
    if (!days.length) return { epoch: e, day: 0, songs: [] };
    if (puzzleNumber < first + days.length) {
      return {
        epoch: e,
        day: puzzleNumber - first,
        songs: days[puzzleNumber - first],
      };
    }
    first += days.length;
  }
}

// Pure: which puzzle + songs correspond to a given moment (UTC). Identical for
// everyone on a given UTC day; clamps to puzzle #0 before launch.
export function selectDaily(nowMs: number, catalog: CatalogEntry[] = CATALOG) {
  const puzzleNumber = puzzleNumberFor(nowMs);
  return { puzzleNumber, songs: scheduleFor(puzzleNumber, catalog).songs };
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
export const practiceRef = (
  ids: number[],
  seed: number,
  clips: number,
  idx: number
) =>
  `p${ids.map((n) => n.toString(36)).join('-')}.${seed.toString(36)}.${clips}.${idx}`;

// Seed for a row's name-that-tune decoys (shared by the daily and practice).
export const choiceRand = (seed: number, idx: number) =>
  mulberry32(seed * 977 + idx);

// Practice songs: ones that already appeared in a past daily this epoch, so
// practising never spoils an upcoming puzzle. Early in an epoch (a small pool)
// it falls back to the whole catalog minus the next month. Today's songs are
// always excluded.
export function practicePool(
  nowMs: number,
  catalog: CatalogEntry[] = CATALOG
): CatalogEntry[] {
  const puzzleNumber = puzzleNumberFor(nowMs);
  const { epoch, day, songs: today } = scheduleFor(puzzleNumber, catalog);
  const todayIds = new Set(today.map((s) => s.trackId));
  const past: CatalogEntry[] = [];
  for (let d = 0; d < day; d++) {
    past.push(...scheduleFor(puzzleNumber - day + d, catalog).songs);
  }
  if (past.length >= 40) return past.filter((s) => !todayIds.has(s.trackId));
  const upcoming = new Set<number>();
  for (let d = 1; d <= 31; d++) {
    const next = scheduleFor(puzzleNumber + d, catalog);
    if (next.epoch !== epoch) break;
    next.songs.forEach((s) => upcoming.add(s.trackId));
  }
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
  // Only the one spelling, so a day can't be cached under several keys.
  if (dateParam != null && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return json(res, 400, { error: 'bad_date' });
  }
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

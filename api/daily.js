// Returns today's puzzle: deterministic by UTC date, identical for everyone.
//
// Songs come from api/_catalog.json — a large catalog of iTunes tracks (charts
// + curated classics) pinned by scripts/build-catalog.mjs. Each entry already
// carries its preview URL and answer, so serving is just selection: no live
// resolution, no drift. The response includes the answer (title/artist/artwork)
// because the client needs it to celebrate on a solve; the UI keeps it hidden.

import { readFileSync } from 'node:fs';
import {
  DAILY_TRACKS,
  DAILY_CLIPS_PER_TRACK,
  DAILY_PIECES,
  DAILY_GUESSES,
  LAUNCH_UTC,
} from './_songs.js';

const DAY_MS = 86400000;

// The pinned catalog (source of truth). Empty only if the build wasn't run.
const CATALOG = loadCatalog();
function loadCatalog() {
  try {
    return JSON.parse(
      readFileSync(new URL('./_catalog.json', import.meta.url), 'utf8')
    );
  } catch {
    return [];
  }
}

const json = (res, status, body, cache) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('access-control-allow-origin', '*');
  if (cache) res.setHeader('cache-control', cache);
  res.end(JSON.stringify(body));
};

export const norm = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();

// Prefer a result whose artist matches; require a preview; else first preview.
// Used by scripts/build-catalog.mjs to resolve curated songs.
export function pickMatch(results, song) {
  const withPreview = (results || []).filter((t) => t.previewUrl);
  const wantArtist = norm(song.artist);
  const byArtist = withPreview.find((t) =>
    norm(t.artistName).includes(wantArtist)
  );
  return byArtist || withPreview[0] || null;
}

// Deterministic seeded shuffle (Fisher–Yates with a mulberry32 PRNG), so the
// same seed yields the same order in every browser/runtime.
function seededShuffle(items, seed) {
  const arr = [...items];
  let a = (seed + 1) >>> 0;
  const rand = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Pure: which puzzle + songs correspond to a given moment (UTC). Identical for
// everyone on a given UTC day; clamps to puzzle #0 before launch.
//
// Songs are drawn from a per-epoch shuffle of the whole catalog, taking the
// next DAILY_TRACKS each day. An epoch is one full pass (floor(N / tracks)
// puzzles), so no song repeats within an epoch and each epoch reshuffles for
// fresh groupings — maximizing variety. `catalog` is injectable for tests.
export function selectDaily(nowMs, catalog = CATALOG) {
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

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');

  // ?date=YYYY-MM-DD lets us preview a specific day; default is "now".
  const dateParam = url.searchParams.get('date');
  const nowMs = dateParam ? Date.parse(dateParam) : Date.now();
  if (Number.isNaN(nowMs)) return json(res, 400, { error: 'bad_date' });

  if (CATALOG.length < DAILY_TRACKS) {
    return json(res, 502, { error: 'catalog_unavailable' });
  }

  const { puzzleNumber, songs } = selectDaily(nowMs);
  const tracks = songs.map((song, idx) => ({
    id: `track-${idx}`,
    previewUrl: song.previewUrl,
    answer: { title: song.title, artist: song.artist, artwork: song.artwork },
  }));

  // The puzzle is fixed for the whole UTC day, so let the CDN hold it until the
  // next midnight flip.
  const secondsLeft = Math.max(
    60,
    Math.ceil((DAY_MS - (nowMs % DAY_MS)) / 1000)
  );

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
      answers: tracks.map((track) => track.answer),
    },
    `public, max-age=300, s-maxage=${secondsLeft}, stale-while-revalidate=86400`
  );
}

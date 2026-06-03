// Returns today's puzzle: deterministic by UTC date, identical for everyone.
//
// The response includes the answer (title/artist/artwork) because the client
// needs it to celebrate on a solve — the UI keeps it hidden until then. This
// is the same trade-off Heardle-style games make: discoverable in the network
// tab, but the experience is honest.

import { readFileSync } from 'node:fs';
import {
  SONGS,
  DAILY_TRACKS,
  DAILY_CLIPS_PER_TRACK,
  DAILY_PIECES,
  DAILY_GUESSES,
  LAUNCH_UTC,
} from './_songs.js';

const DAY_MS = 86400000;

// Pinned resolutions written by `npm run resolve:songs`. Serving from this keeps
// the daily audio byte-identical for every player; if it is missing we fall back
// to a live iTunes lookup so the game still runs.
const MANIFEST = loadManifest();
function loadManifest() {
  try {
    return JSON.parse(
      readFileSync(new URL('./_manifest.json', import.meta.url), 'utf8')
    );
  } catch {
    return {};
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

// Manifest entries are keyed by the curated title + artist, so a SONGS reorder
// can never mismatch a pin. Must match scripts/resolve-songs.mjs.
export const manifestKey = (song) => `${norm(song.title)}|${norm(song.artist)}`;

// Prefer a result whose artist matches; require a preview; else first preview.
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
// fresh groupings — maximizing variety from a fixed catalog.
export function selectDaily(nowMs) {
  const todayUtc = Math.floor(nowMs / DAY_MS) * DAY_MS;
  const puzzleNumber = Math.max(
    0,
    Math.floor((todayUtc - LAUNCH_UTC) / DAY_MS)
  );
  const puzzlesPerEpoch = Math.max(1, Math.floor(SONGS.length / DAILY_TRACKS));
  const epoch = Math.floor(puzzleNumber / puzzlesPerEpoch);
  const indexInEpoch = puzzleNumber % puzzlesPerEpoch;
  const ordered = seededShuffle(SONGS, epoch);
  const start = indexInEpoch * DAILY_TRACKS;
  const songs = ordered.slice(start, start + DAILY_TRACKS);
  return { puzzleNumber, songs };
}

async function resolveSong(song) {
  // Pinned audio first: identical for everyone, no network, no drift.
  const pinned = MANIFEST[manifestKey(song)];
  if (pinned?.previewUrl) {
    return { previewUrl: pinned.previewUrl, answer: pinned.answer };
  }

  // Fallback for an unpinned song: resolve live against a fixed storefront so
  // the result at least doesn't depend on which region the request runs in.
  const api =
    'https://itunes.apple.com/search?' +
    new URLSearchParams({
      term: `${song.title} ${song.artist}`,
      media: 'music',
      entity: 'song',
      country: 'US',
      limit: '10',
    }).toString();

  const r = await fetch(api, {
    headers: { 'User-Agent': 'Spliced/0.1 (music puzzle)' },
  });
  if (!r.ok) throw new Error('itunes_unavailable');

  const data = await r.json();
  const match = pickMatch(data.results, song);
  if (!match) throw new Error('no_preview');

  return {
    previewUrl: match.previewUrl,
    answer: {
      title: match.trackName,
      artist: match.artistName,
      artwork: (match.artworkUrl100 || '').replace('100x100bb', '200x200bb'),
    },
  };
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');

  // ?date=YYYY-MM-DD lets us preview a specific day; default is "now".
  const dateParam = url.searchParams.get('date');
  const nowMs = dateParam ? Date.parse(dateParam) : Date.now();
  if (Number.isNaN(nowMs)) return json(res, 400, { error: 'bad_date' });

  const { puzzleNumber, songs } = selectDaily(nowMs);
  // The puzzle is fixed for the whole UTC day, so let the CDN hold it until the
  // next midnight flip; the manifest no longer rotates within a day.
  const secondsLeft = Math.max(
    60,
    Math.ceil((DAY_MS - (nowMs % DAY_MS)) / 1000)
  );

  try {
    const resolved = await Promise.all(songs.map(resolveSong));
    const tracks = resolved.map((track, idx) => ({
      id: `track-${idx}`,
      ...track,
    }));

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
  } catch (err) {
    return json(res, 502, { error: err.message || 'daily_failed' });
  }
}

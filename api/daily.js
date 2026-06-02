// Returns today's puzzle: deterministic by UTC date, identical for everyone.
//
// The response includes the answer (title/artist/artwork) because the client
// needs it to celebrate on a solve — the UI keeps it hidden until then. This
// is the same trade-off Heardle-style games make: discoverable in the network
// tab, but the experience is honest.

import {
  SONGS,
  DAILY_TRACKS,
  DAILY_CLIPS_PER_TRACK,
  DAILY_PIECES,
  DAILY_GUESSES,
  LAUNCH_UTC,
} from './_songs.js';

const DAY_MS = 86400000;

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
export function pickMatch(results, song) {
  const withPreview = (results || []).filter((t) => t.previewUrl);
  const wantArtist = norm(song.artist);
  const byArtist = withPreview.find((t) =>
    norm(t.artistName).includes(wantArtist)
  );
  return byArtist || withPreview[0] || null;
}

// Pure: which puzzle + song corresponds to a given moment (UTC). Identical for
// everyone on a given UTC day; clamps to puzzle #0 before launch.
export function selectDaily(nowMs) {
  const todayUtc = Math.floor(nowMs / DAY_MS) * DAY_MS;
  const puzzleNumber = Math.max(
    0,
    Math.floor((todayUtc - LAUNCH_UTC) / DAY_MS)
  );
  const start = (puzzleNumber * DAILY_TRACKS) % SONGS.length;
  const songs = Array.from(
    { length: DAILY_TRACKS },
    (_, i) => SONGS[(start + i) % SONGS.length]
  );
  return { puzzleNumber, songs };
}

async function resolveSong(song) {
  const api =
    'https://itunes.apple.com/search?' +
    new URLSearchParams({
      term: `${song.title} ${song.artist}`,
      media: 'music',
      entity: 'song',
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
      // Short cache: preview URLs rotate, and the puzzle flips at UTC midnight.
      'public, max-age=300'
    );
  } catch (err) {
    return json(res, 502, { error: err.message || 'daily_failed' });
  }
}

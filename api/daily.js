// Returns today's puzzle: deterministic by UTC date, identical for everyone.
//
// The response includes the answer (title/artist/artwork) because the client
// needs it to celebrate on a solve — the UI keeps it hidden until then. This
// is the same trade-off Heardle-style games make: discoverable in the network
// tab, but the experience is honest.

import { SONGS, DAILY_PIECES, LAUNCH_UTC } from './_songs.js';

const DAY_MS = 86400000;

const json = (res, status, body, cache) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('access-control-allow-origin', '*');
  if (cache) res.setHeader('cache-control', cache);
  res.end(JSON.stringify(body));
};

const norm = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();

// Prefer a result whose artist matches; require a preview; else first preview.
function pickMatch(results, song) {
  const withPreview = (results || []).filter((t) => t.previewUrl);
  const wantArtist = norm(song.artist);
  const byArtist = withPreview.find((t) => norm(t.artistName).includes(wantArtist));
  return byArtist || withPreview[0] || null;
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');

  // ?date=YYYY-MM-DD lets us preview a specific day; default is "now".
  const dateParam = url.searchParams.get('date');
  const nowMs = dateParam ? Date.parse(dateParam) : Date.now();
  if (Number.isNaN(nowMs)) return json(res, 400, { error: 'bad_date' });

  const todayUtc = Math.floor(nowMs / DAY_MS) * DAY_MS;
  const puzzleNumber = Math.max(0, Math.floor((todayUtc - LAUNCH_UTC) / DAY_MS));
  const song = SONGS[puzzleNumber % SONGS.length];

  const api =
    'https://itunes.apple.com/search?' +
    new URLSearchParams({
      term: `${song.title} ${song.artist}`,
      media: 'music',
      entity: 'song',
      limit: '10',
    }).toString();

  try {
    const r = await fetch(api, {
      headers: { 'User-Agent': 'Spliced/0.1 (music puzzle)' },
    });
    if (!r.ok) return json(res, 502, { error: 'itunes_unavailable' });

    const data = await r.json();
    const match = pickMatch(data.results, song);
    if (!match) return json(res, 502, { error: 'no_preview' });

    return json(
      res,
      200,
      {
        puzzleNumber,
        numPieces: DAILY_PIECES,
        previewUrl: match.previewUrl,
        answer: {
          title: match.trackName,
          artist: match.artistName,
          artwork: (match.artworkUrl100 || '').replace('100x100bb', '200x200bb'),
        },
      },
      // Short cache: preview URLs rotate, and the puzzle flips at UTC midnight.
      'public, max-age=300'
    );
  } catch (err) {
    return json(res, 502, { error: 'daily_failed' });
  }
}

// Serves a random set of catalog songs for Practice mode, in the same track
// shape as /api/daily. Songs come from past daily puzzles (see practicePool),
// so practice never spoils an upcoming day — and, being pinned catalog
// entries, they always resolve to the real recording.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { json } from './_http.js';
import { shuffle } from './_prng.js';
import { practicePool, timelineTracks } from './daily.js';

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const count = Math.min(
    6,
    Math.max(2, Number(url.searchParams.get('count')) || 4)
  );

  const pool = practicePool(Date.now());
  if (pool.length < count) {
    return json(res, 502, { error: 'catalog_unavailable' });
  }

  // Avoid two songs by the same artist in one mix — too easy to group by voice.
  const picks: typeof pool = [];
  const artists = new Set<string>();
  for (const song of shuffle(pool)) {
    const artist = song.artist.toLowerCase();
    if (artists.has(artist)) continue;
    artists.add(artist);
    picks.push(song);
    if (picks.length === count) break;
  }

  const tracks = timelineTracks(picks, () => Math.random);

  return json(res, 200, { tracks }, 'no-store');
}

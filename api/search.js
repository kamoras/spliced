// Proxies the public iTunes Search API.
//
// Why a proxy? The iTunes Search endpoint does not reliably send CORS
// headers, so calling it directly from the browser is flaky. Routing it
// through a same-origin function makes it deterministic and lets us reshape
// the (large) iTunes payload down to just what the puzzle needs.
//
// Written with raw Node req/res so the exact same handler works as a Vercel
// serverless function in production and as Connect middleware in `vite dev`
// (see vite.config.js).

const json = (res, status, body, cache) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('access-control-allow-origin', '*');
  if (cache) res.setHeader('cache-control', cache);
  res.end(JSON.stringify(body));
};

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const term = (url.searchParams.get('term') || '').trim();

  if (!term) return json(res, 200, { results: [] });

  const api =
    'https://itunes.apple.com/search?' +
    new URLSearchParams({
      term,
      media: 'music',
      entity: 'song',
      limit: '24',
    }).toString();

  try {
    const r = await fetch(api, {
      headers: { 'User-Agent': 'Spliced/0.1 (music puzzle)' },
    });
    if (!r.ok) return json(res, 502, { error: 'itunes_unavailable' });

    const data = await r.json();
    const results = (data.results || [])
      .filter((t) => t.previewUrl)
      .map((t) => ({
        id: t.trackId,
        title: t.trackName,
        artist: t.artistName,
        album: t.collectionName,
        // Ask for a crisper square than the default 100px thumbnail.
        artwork: (t.artworkUrl100 || '').replace('100x100bb', '200x200bb'),
        previewUrl: t.previewUrl,
      }));

    return json(res, 200, { results }, 'public, max-age=3600');
  } catch (err) {
    return json(res, 502, { error: 'search_failed' });
  }
}

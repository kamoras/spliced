// Resolves every curated song to a stable iTunes track and writes a committed
// manifest (api/_manifest.json). The daily endpoint serves from this manifest,
// so every player gets the byte-identical preview — the puzzle audio can't drift
// by region, search-ranking changes, or preview-URL rotation between requests.
//
// Re-run when you change SONGS or want to refresh rotated preview URLs:
//   npm run resolve:songs

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SONGS } from '../api/_songs.js';
import { pickMatch, norm } from '../api/daily.js';

// Pin a single storefront so results don't depend on where the request runs.
const COUNTRY = 'US';
const OUT = fileURLToPath(new URL('../api/_manifest.json', import.meta.url));

export function manifestKey(song) {
  return `${norm(song.title)}|${norm(song.artist)}`;
}

async function resolve(song) {
  const api =
    'https://itunes.apple.com/search?' +
    new URLSearchParams({
      term: `${song.title} ${song.artist}`,
      media: 'music',
      entity: 'song',
      country: COUNTRY,
      limit: '10',
    }).toString();

  const r = await fetch(api, {
    headers: { 'User-Agent': 'Spliced/0.1 (music puzzle)' },
  });
  if (!r.ok) throw new Error(`itunes ${r.status} for ${song.title}`);

  const data = await r.json();
  const match = pickMatch(data.results, song);
  if (!match) throw new Error(`no preview for ${song.title} — ${song.artist}`);

  return {
    trackId: match.trackId,
    previewUrl: match.previewUrl,
    answer: {
      title: match.trackName,
      artist: match.artistName,
      artwork: (match.artworkUrl100 || '').replace('100x100bb', '200x200bb'),
    },
  };
}

async function main() {
  const manifest = {};
  const failed = [];
  for (const song of SONGS) {
    process.stdout.write(`resolving ${song.title} — ${song.artist}… `);
    try {
      const entry = await resolve(song);
      manifest[manifestKey(song)] = entry;
      console.log(`#${entry.trackId} (${entry.answer.artist})`);
    } catch (err) {
      failed.push(`${song.title} — ${song.artist} (${err.message})`);
      console.log(`SKIP — ${err.message}`);
    }
    await new Promise((done) => setTimeout(done, 150)); // be polite to iTunes
  }
  await writeFile(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `\nwrote ${Object.keys(manifest).length} songs → api/_manifest.json`
  );
  if (failed.length) {
    console.warn(`\n${failed.length} unresolved (remove from SONGS):`);
    for (const f of failed) console.warn(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

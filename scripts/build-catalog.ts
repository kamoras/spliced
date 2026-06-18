// Builds api/_catalog.json — the pinned daily song catalog. Sources:
//   1. Curated cross-era classics (api/_songs.ts), resolved via iTunes Search.
//   2. iTunes top-songs charts across many genres (recognizable, current).
// Curated entries are placed first (priority), the rest fill from charts, all
// deduped and resolved to clean records with previews via the lookup API.
//
// Re-run to refresh:  npm run build:catalog

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SONGS } from '../api/_songs.js';
import { pickMatch, norm } from '../api/daily.js';
import type { CatalogEntry, ITunesResult } from '../api/_types.js';

const STORE = 'us';
const UA = { 'User-Agent': 'Spliced/0.1 (music puzzle)' };
const OUT = fileURLToPath(new URL('../api/_catalog.json', import.meta.url));
const TARGET = 1460; // ~4 tracks * 365 days
const PER_GENRE = 100;
// iTunes music genre ids: Pop, Hip-Hop, Rock, R&B/Soul, Country, Dance,
// Electronic, Alternative, Singer/Songwriter, Latino, Soundtrack, Jazz,
// Reggae, Worldwide, Blues, Christian/Gospel.
const GENRES = [14, 18, 21, 15, 6, 17, 7, 20, 10, 12, 16, 11, 24, 19, 2, 22];

interface RssEntry {
  id?: { attributes?: { 'im:id'?: string } };
}

const errMsg = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T = unknown>(url: string, attempt = 0): Promise<T> {
  const r = await fetch(url, { headers: UA });
  // The Search API rate-limits aggressively (429); back off and retry.
  if (r.status === 429 && attempt < 6) {
    await delay(1500 * (attempt + 1));
    return getJson<T>(url, attempt + 1);
  }
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json() as Promise<T>;
}

// Resolve curated title/artist pairs to track ids (priority order).
async function curatedIds(): Promise<string[]> {
  const ids: string[] = [];
  for (const song of SONGS) {
    try {
      const url =
        'https://itunes.apple.com/search?' +
        new URLSearchParams({
          term: `${song.title} ${song.artist}`,
          media: 'music',
          entity: 'song',
          country: STORE.toUpperCase(),
          limit: '5',
        });
      const { results } = await getJson<{ results?: ITunesResult[] }>(url);
      const match = pickMatch(results, song);
      if (match?.trackId) ids.push(String(match.trackId));
      else console.warn(`  curated no match: ${song.title} — ${song.artist}`);
    } catch (err) {
      console.warn(`  curated fail: ${song.title} (${errMsg(err)})`);
    }
    await delay(500); // Search API is rate-limited; go gently.
  }
  return ids;
}

// Pull top-song track ids from each genre chart.
async function chartIds(): Promise<string[]> {
  const ids: string[] = [];
  for (const genre of GENRES) {
    const url = `https://itunes.apple.com/${STORE}/rss/topsongs/limit=${PER_GENRE}/genre=${genre}/json`;
    try {
      const { feed } = await getJson<{ feed: { entry?: RssEntry[] } }>(url);
      const entries = feed.entry || [];
      for (const entry of entries) {
        const id = entry.id?.attributes?.['im:id'];
        if (id) ids.push(id);
      }
      process.stdout.write(`genre ${genre}: ${entries.length}  `);
    } catch (err) {
      console.warn(`genre ${genre} failed (${errMsg(err)})`);
    }
    await delay(120);
  }
  console.log('');
  return ids;
}

// Look up full records (with previews) for a list of ids, in batches.
async function lookup(ids: string[]): Promise<Map<number, ITunesResult>> {
  const byId = new Map<number, ITunesResult>();
  for (let i = 0; i < ids.length; i += 180) {
    const batch = ids.slice(i, i + 180);
    const url = `https://itunes.apple.com/lookup?id=${batch.join(',')}&entity=song`;
    try {
      const { results } = await getJson<{ results?: ITunesResult[] }>(url);
      for (const t of results || []) {
        if (t.kind === 'song' && t.previewUrl && t.trackId)
          byId.set(t.trackId, t);
      }
    } catch (err) {
      console.warn(`lookup batch failed (${errMsg(err)})`);
    }
    await delay(120);
  }
  return byId;
}

function toEntry(t: ITunesResult): CatalogEntry {
  return {
    trackId: t.trackId!,
    title: t.trackName ?? '',
    artist: t.artistName ?? '',
    artwork: (t.artworkUrl100 || '').replace('100x100bb', '200x200bb'),
    previewUrl: t.previewUrl ?? '',
  };
}

async function main(): Promise<void> {
  console.log(`resolving ${SONGS.length} curated songs…`);
  const curated = await curatedIds();
  console.log(`fetching charts across ${GENRES.length} genres…`);
  const charts = await chartIds();

  // Unique ids, curated first so they survive the TARGET cap.
  const orderedIds: string[] = [];
  const seenId = new Set<string>();
  for (const id of [...curated, ...charts]) {
    if (!seenId.has(id)) {
      seenId.add(id);
      orderedIds.push(id);
    }
  }
  console.log(`looking up ${orderedIds.length} unique track ids…`);
  const records = await lookup(orderedIds);

  // Build catalog in priority order, deduped by title+artist, capped at TARGET.
  const catalog: CatalogEntry[] = [];
  const seenKey = new Set<string>();
  for (const id of orderedIds) {
    const t = records.get(Number(id));
    if (!t) continue;
    const key = `${norm(t.trackName)}|${norm(t.artistName)}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);
    catalog.push(toEntry(t));
    if (catalog.length >= TARGET) break;
  }

  await writeFile(OUT, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`\nwrote ${catalog.length} songs → api/_catalog.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

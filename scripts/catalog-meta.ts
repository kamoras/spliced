// Adds release `year` and friendly `genre` to catalog entries, for the row
// clues and name-that-tune decoys. Run standalone to enrich the pinned catalog
// in place (order and songs are untouched, so the daily rotation is too):
//
//   npm run enrich:catalog
//
// iTunes often dates a track by its remaster/compilation, so when the
// release's collection looks like one (or the lookup fails) we search for the
// song and take the EARLIEST year among matching non-compilation releases.
// api/_year-overrides.json has the final say for the stubborn few.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { norm } from '../api/daily.js';
import { baseTitle } from '../api/_catalog-keys.js';
import { delay, getJson } from './_itunes.js';
import { genreBucket } from '../api/_genres.js';
import type { CatalogEntry } from '../api/_types.js';

interface MetaResult {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  releaseDate?: string;
  primaryGenreName?: string;
  kind?: string;
}

const COMPILATION =
  /remaster|deluxe|greatest|hits|best of|anniversary|live|edition|collection|essential|anthology|gold|ultimate|playlist|now that|karaoke/i;

const yearOf = (r: MetaResult) =>
  r.releaseDate ? Number(r.releaseDate.slice(0, 4)) : NaN;

async function earliestYear(entry: CatalogEntry): Promise<number> {
  const url =
    'https://itunes.apple.com/search?' +
    new URLSearchParams({
      term: `${entry.title.replace(/\s*[([].*?[)\]]/g, '')} ${entry.artist}`,
      media: 'music',
      entity: 'song',
      limit: '25',
    });
  const { results = [] } = await getJson<{ results?: MetaResult[] }>(url);
  const want = baseTitle(entry.title);
  const artist = norm(entry.artist).slice(0, 8);
  const years = results
    .filter(
      (r) =>
        baseTitle(r.trackName) === want &&
        norm(r.artistName).includes(artist) &&
        !COMPILATION.test(r.collectionName ?? '') &&
        !COMPILATION.test(r.trackName ?? '')
    )
    .map(yearOf)
    .filter((y) => y > 1900);
  return years.length ? Math.min(...years) : NaN;
}

export async function enrich(
  catalog: CatalogEntry[],
  overrides: Record<string, number> = {},
  { search = true }: { search?: boolean } = {}
): Promise<CatalogEntry[]> {
  const byId = new Map<number, MetaResult>();
  for (let i = 0; i < catalog.length; i += 150) {
    const ids = catalog.slice(i, i + 150).map((c) => c.trackId);
    const { results = [] } = await getJson<{ results?: MetaResult[] }>(
      `https://itunes.apple.com/lookup?id=${ids.join(',')}`
    );
    results.forEach((r) => r.trackId && byId.set(r.trackId, r));
    await delay(150);
  }

  const out: CatalogEntry[] = [];
  let searched = 0;
  for (const entry of catalog) {
    const meta = byId.get(entry.trackId);
    let year = meta ? yearOf(meta) : NaN;
    const suspicious =
      !meta ||
      COMPILATION.test(meta.collectionName ?? '') ||
      COMPILATION.test(meta.trackName ?? '');
    if (suspicious && search) {
      try {
        const found = await earliestYear(entry);
        searched++;
        if (searched % 25 === 0) console.log(`searched ${searched}…`);
        if (Number.isFinite(found)) {
          year = Number.isFinite(year) ? Math.min(year, found) : found;
        }
      } catch (err) {
        console.warn(`search failed for ${entry.title}: ${String(err)}`);
      }
      await delay(3100); // the Search API allows ~20 calls/minute
    }
    const override = overrides[String(entry.trackId)];
    out.push({
      ...entry,
      year: override ?? (Number.isFinite(year) ? year : entry.year),
      genre: meta?.primaryGenreName
        ? genreBucket(meta.primaryGenreName)
        : (entry.genre ?? 'Pop'),
    });
  }
  console.log(`enriched ${out.length} (searched ${searched})`);
  return out;
}

async function main() {
  const file = fileURLToPath(new URL('../api/_catalog.json', import.meta.url));
  const overridesFile = fileURLToPath(
    new URL('../api/_year-overrides.json', import.meta.url)
  );
  const catalog = JSON.parse(await readFile(file, 'utf8')) as CatalogEntry[];
  const overrides = JSON.parse(await readFile(overridesFile, 'utf8'));
  // --fast: lookup data only (seconds); default also searches for original
  // release years of remasters/compilations (rate-limited, can take an hour).
  const enriched = await enrich(catalog, overrides, {
    search: !process.argv.includes('--fast'),
  });
  const missing = enriched.filter((e) => !e.year).length;
  if (missing) console.warn(`${missing} songs still have no year`);
  await writeFile(file, `${JSON.stringify(enriched, null, 2)}\n`);
}

// Run main() only when executed directly (tsx scripts/catalog-meta.ts), not
// when imported by build-catalog.ts.
if (/catalog-meta\.ts$/.test(process.argv[1] ?? '')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

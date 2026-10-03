// Curates api/_catalog.json for the daily: keeps the songs people can know,
// marks the classics, and measures where each preview is actually audible.
//
//   npm run curate:catalog            # filter + classic flag + loudness
//   npm run curate:catalog -- --quick # skip the (slow) loudness pass
//
// Why: the daily is an ear test, and the chart feeds the catalog came from
// are heavy on this year's long tail (stock-library and one-release artists
// nobody could name). A day of three of those isn't a hard puzzle, it's an
// unfair one. So a song from the last two years stays only when its artist
// is established: on the curated list, or in the catalog with an older song.
//
// Order is preserved for the songs that stay, but the daily schedule is a
// pass over the whole catalog, so every puzzle changes. Run beats:catalog
// afterwards for any new songs. Needs ffmpeg on PATH for the loudness pass.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SONGS } from '../api/_songs.js';
import { norm } from '../api/daily.js';
import type { CatalogEntry } from '../api/_types.js';
import { decode } from './beats.js';

const FILE = fileURLToPath(new URL('../api/_catalog.json', import.meta.url));
// Songs this recent need an established artist to stay.
const RECENT = new Date().getUTCFullYear() - 1;

// Every credited artist on a track ("Lady Gaga & Bruno Mars" -> both).
export const creditedArtists = (artist: string): string[] =>
  artist
    .split(/\s*(?:&|,|feat\.?|featuring|with)\s+/i)
    .map(norm)
    .filter(Boolean);

export function curate(catalog: CatalogEntry[]): CatalogEntry[] {
  const curated = new Set(SONGS.map((s) => norm(s.artist)));
  const curatedKeys = new Set(
    SONGS.map((s) => `${norm(s.title)}|${norm(s.artist)}`)
  );
  // Artists with an older song in the catalog (not just this year's chart).
  const veterans = new Set<string>();
  catalog.forEach((e) => {
    if ((e.year ?? 9999) < RECENT)
      creditedArtists(e.artist).forEach((a) => veterans.add(a));
  });
  const established = (e: CatalogEntry) =>
    creditedArtists(e.artist).some((a) => curated.has(a) || veterans.has(a));

  return catalog
    .filter((e) => (e.year ?? 0) < RECENT || established(e))
    .map((e) => {
      const classic = curatedKeys.has(`${norm(e.title)}|${norm(e.artist)}`);
      const rest: CatalogEntry = { ...e };
      delete rest.classic;
      return classic ? { ...rest, classic: true } : rest;
    });
}

// Where the preview is audible: [from, to] seconds, so clips never land on a
// silent intro or a faded-out tail. A half-second window counts as loud when
// its RMS is at least a quarter of the loud parts (90th percentile).
export function loudWindow(x: Float32Array, sr: number): [number, number] {
  const win = Math.round(sr / 2);
  const rms: number[] = [];
  for (let s = 0; s + win <= x.length; s += win) {
    let sum = 0;
    for (let i = s; i < s + win; i++) sum += x[i] * x[i];
    rms.push(Math.sqrt(sum / win));
  }
  if (!rms.length) return [0, 0];
  const sorted = [...rms].sort((a, b) => a - b);
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  const floor = p90 * 0.25;
  let first = rms.findIndex((v) => v >= floor);
  let last = rms.length - 1;
  while (last > 0 && rms[last] < floor) last--;
  if (first < 0) first = 0;
  return [first / 2, (last + 1) / 2];
}

async function main() {
  const quick = process.argv.includes('--quick');
  const before = JSON.parse(await readFile(FILE, 'utf8')) as CatalogEntry[];
  const catalog = curate(before);
  console.log(
    `kept ${catalog.length} of ${before.length} songs (${catalog.filter((e) => e.classic).length} classics)`
  );
  if (!quick) {
    const todo = catalog.filter((e) => !e.loud);
    console.log(`measuring loudness for ${todo.length} songs…`);
    let done = 0;
    const worker = async () => {
      for (let e = todo.shift(); e; e = todo.shift()) {
        try {
          const r = await fetch(e.previewUrl);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const pcm = await decode(new Uint8Array(await r.arrayBuffer()));
          e.loud = loudWindow(pcm, 22050);
        } catch (err) {
          console.warn(`skip ${e.title}: ${String(err)}`);
        }
        if (++done % 50 === 0) {
          console.log(`${done} done`);
          await writeFile(FILE, `${JSON.stringify(catalog, null, 2)}\n`);
        }
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
  }
  await writeFile(FILE, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`wrote ${catalog.length} songs -> api/_catalog.json`);
}

if (/curate-catalog\.ts$/.test(process.argv[1] ?? '')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

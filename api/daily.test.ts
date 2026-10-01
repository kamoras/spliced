import { describe, it, expect } from 'vitest';
import {
  choicesFor,
  timelineTracks,
  selectDaily,
  practicePool,
  pickMatch,
  norm,
} from './daily.js';
import { mulberry32 } from './_prng.js';
import { DAILY_TRACKS, LAUNCH_UTC } from './_songs.js';
import catalog from './_catalog.json';

const DAY = 86400000;

// Small synthetic catalog so selection invariants don't depend on the real one.
const fakeCatalog = Array.from({ length: 20 }, (_, i) => ({
  trackId: 1000 + i,
  title: `Song ${i}`,
  artist: `Artist ${i}`,
  artwork: 'art',
  previewUrl: 'https://example.test/p.m4a',
}));
const perEpoch = Math.floor(fakeCatalog.length / DAILY_TRACKS);
const key = (s: { title: string; artist: string }) => `${s.title}|${s.artist}`;

describe('selectDaily', () => {
  it('advances one puzzle per UTC day', () => {
    expect(selectDaily(LAUNCH_UTC, fakeCatalog).puzzleNumber).toBe(0);
    expect(selectDaily(LAUNCH_UTC + 3 * DAY, fakeCatalog).puzzleNumber).toBe(3);
  });

  it('returns DAILY_TRACKS songs drawn from the catalog', () => {
    const { songs } = selectDaily(LAUNCH_UTC + 5 * DAY, fakeCatalog);
    expect(songs).toHaveLength(DAILY_TRACKS);
    songs.forEach((s) => expect(fakeCatalog).toContainEqual(s));
  });

  it('never repeats a song within one epoch', () => {
    const seen = new Set();
    for (let p = 0; p < perEpoch; p++) {
      for (const s of selectDaily(LAUNCH_UTC + p * DAY, fakeCatalog).songs) {
        expect(seen.has(key(s))).toBe(false);
        seen.add(key(s));
      }
    }
  });

  it('reshuffles each epoch (fresh groupings, not a fixed cycle)', () => {
    const first = selectDaily(LAUNCH_UTC, fakeCatalog).songs.map(key);
    const next = selectDaily(
      LAUNCH_UTC + perEpoch * DAY,
      fakeCatalog
    ).songs.map(key);
    expect(next).not.toEqual(first);
  });

  it('is identical at any moment within the same UTC day', () => {
    const morning = selectDaily(LAUNCH_UTC + 5 * DAY + 1, fakeCatalog);
    const night = selectDaily(LAUNCH_UTC + 5 * DAY + (DAY - 1), fakeCatalog);
    expect(morning).toEqual(night);
  });

  it('clamps to puzzle #0 before launch', () => {
    expect(selectDaily(LAUNCH_UTC - 10 * DAY, fakeCatalog).puzzleNumber).toBe(
      0
    );
  });
});

describe('practicePool', () => {
  const real = catalog as NonNullable<Parameters<typeof practicePool>[1]>;

  it('only uses songs from past dailies once the pool is big enough', () => {
    const now = LAUNCH_UTC + 100 * DAY;
    const pool = practicePool(now, real);
    const past = new Set<number>();
    for (let d = 0; d < 100; d++) {
      selectDaily(LAUNCH_UTC + d * DAY, real).songs.forEach((s) =>
        past.add(s.trackId)
      );
    }
    expect(pool.length).toBe(past.size);
    expect(pool.every((s) => past.has(s.trackId))).toBe(true);
  });

  it('never includes today’s songs, even when falling back', () => {
    const now = LAUNCH_UTC + 2 * DAY;
    const today = new Set(selectDaily(now, real).songs.map((s) => s.trackId));
    const pool = practicePool(now, real);
    expect(pool.length).toBe(real.length - DAILY_TRACKS);
    expect(pool.some((s) => today.has(s.trackId))).toBe(false);
  });
});

describe('choicesFor', () => {
  it('offers the answer plus 3 distinct-artist decoys, deterministically', () => {
    const [answer, ...today] = fakeCatalog.slice(0, 4);
    const a = choicesFor(
      answer,
      [answer, ...today],
      mulberry32(7),
      fakeCatalog
    );
    const b = choicesFor(
      answer,
      [answer, ...today],
      mulberry32(7),
      fakeCatalog
    );
    expect(a).toEqual(b);
    expect(a).toHaveLength(4);
    expect(a).toContainEqual({ title: answer.title, artist: answer.artist });
    expect(new Set(a.map((c) => c.artist)).size).toBe(4);
    const todayTitles = today.map((s) => s.title);
    expect(a.some((c) => todayTitles.includes(c.title))).toBe(false);
  });
});

describe('timelineTracks', () => {
  const genres = ['Pop', 'Rock'];
  const dated = fakeCatalog.map((s, i) => ({
    ...s,
    year: 1980 + i,
    genre: genres[i % 2],
  }));

  it('orders rows oldest-first with a year clue, adding genre on collisions', () => {
    const songs = [
      { ...dated[3], year: 1985 },
      { ...dated[1], year: 1975 },
      { ...dated[11], year: 1975 },
      { ...dated[0], year: 1970 },
    ];
    const rows = timelineTracks(songs, (i) => mulberry32(i), dated);
    expect(rows.map((r) => r.clue.year)).toEqual([1970, 1975, 1975, 1985]);
    expect(rows.map((r) => r.clue.showGenre)).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(rows.map((r) => r.id)).toEqual([
      'track-0',
      'track-1',
      'track-2',
      'track-3',
    ]);
  });

  it('draws decoys from the same genre and era when it can', () => {
    const answer = dated[10]; // 1990, Pop
    const choices = choicesFor(answer, [answer], mulberry32(3), dated);
    const byTitle = new Map(dated.map((d) => [d.title, d]));
    choices.forEach((c) => {
      const d = byTitle.get(c.title)!;
      expect(d.genre).toBe('Pop');
      expect(Math.abs(d.year - 1990)).toBeLessThanOrEqual(4);
    });
  });
});

describe('catalog', () => {
  it('is roughly a year of unique, previewable songs', () => {
    // ~4 tracks * 365 days, allowing a little slack from dedupe.
    expect(catalog.length).toBeGreaterThanOrEqual(4 * 365 - 60);
    expect(new Set(catalog.map((c) => c.trackId)).size).toBe(catalog.length);
    expect(
      catalog.every(
        (c) => c.title && c.artist && c.trackId && /^https?:/.test(c.previewUrl)
      )
    ).toBe(true);
  });
});

describe('catalog metadata', () => {
  it('gives every song a plausible release year and a genre', () => {
    const withYear = catalog.filter(
      (c) =>
        c.year && c.year >= 1900 && c.year <= new Date().getUTCFullYear() + 1
    );
    expect(withYear.length).toBe(catalog.length);
    expect(catalog.every((c) => typeof c.genre === 'string')).toBe(true);
  });
});

describe('pickMatch', () => {
  const song = { title: 'Africa', artist: 'Toto' };

  it('prefers an artist match that has a preview', () => {
    const results = [
      { artistName: 'Weezer', previewUrl: 'x', trackName: 'Africa' },
      { artistName: 'Toto', previewUrl: 'y', trackName: 'Africa' },
    ];
    expect(pickMatch(results, song)!.artistName).toBe('Toto');
  });

  it('falls back to the first result that has a preview', () => {
    const results = [
      { artistName: 'No Preview Artist', trackName: 'Africa' },
      { artistName: 'Cover Band', previewUrl: 'y', trackName: 'Africa' },
    ];
    expect(pickMatch(results, song)!.artistName).toBe('Cover Band');
  });

  it('returns null when nothing has a preview', () => {
    expect(pickMatch([{ artistName: 'Toto' }], song)).toBeNull();
    expect(pickMatch([], song)).toBeNull();
    expect(pickMatch(null, song)).toBeNull();
  });
});

describe('norm', () => {
  it('lowercases and strips non-alphanumerics', () => {
    expect(norm("Guns N' Roses")).toBe('gunsnroses');
    expect(norm('Earth, Wind & Fire')).toBe('earthwindfire');
    expect(norm(null)).toBe('');
  });
});

import { describe, it, expect } from 'vitest';
import { selectDaily, pickMatch, norm } from './daily.js';
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

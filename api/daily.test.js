import { describe, it, expect } from 'vitest';
import { selectDaily, pickMatch, norm, manifestKey } from './daily.js';
import { SONGS, DAILY_TRACKS, LAUNCH_UTC } from './_songs.js';
import manifest from './_manifest.json';

const DAY = 86400000;

describe('selectDaily', () => {
  const key = (s) => `${s.title}|${s.artist}`;
  const puzzlesPerEpoch = Math.floor(SONGS.length / DAILY_TRACKS);

  it('advances one puzzle per UTC day', () => {
    expect(selectDaily(LAUNCH_UTC).puzzleNumber).toBe(0);
    expect(selectDaily(LAUNCH_UTC + 3 * DAY).puzzleNumber).toBe(3);
  });

  it('returns DAILY_TRACKS real catalog songs', () => {
    const { songs } = selectDaily(LAUNCH_UTC + 5 * DAY);
    expect(songs).toHaveLength(DAILY_TRACKS);
    songs.forEach((s) => expect(SONGS).toContainEqual(s));
  });

  it('never repeats a song within one epoch', () => {
    const seen = new Set();
    for (let p = 0; p < puzzlesPerEpoch; p++) {
      for (const s of selectDaily(LAUNCH_UTC + p * DAY).songs) {
        expect(seen.has(key(s))).toBe(false);
        seen.add(key(s));
      }
    }
  });

  it('reshuffles each epoch (fresh groupings, not a fixed cycle)', () => {
    const first = selectDaily(LAUNCH_UTC).songs.map(key);
    const nextEpoch = selectDaily(LAUNCH_UTC + puzzlesPerEpoch * DAY).songs.map(
      key
    );
    expect(nextEpoch).not.toEqual(first);
  });

  it('is identical at any moment within the same UTC day', () => {
    const morning = selectDaily(LAUNCH_UTC + 5 * DAY + 1);
    const night = selectDaily(LAUNCH_UTC + 5 * DAY + (DAY - 1));
    expect(morning).toEqual(night);
  });

  it('clamps to puzzle #0 before launch', () => {
    expect(selectDaily(LAUNCH_UTC - 10 * DAY).puzzleNumber).toBe(0);
  });
});

describe('pickMatch', () => {
  const song = { title: 'Africa', artist: 'Toto' };

  it('prefers an artist match that has a preview', () => {
    const results = [
      { artistName: 'Weezer', previewUrl: 'x', trackName: 'Africa' },
      { artistName: 'Toto', previewUrl: 'y', trackName: 'Africa' },
    ];
    expect(pickMatch(results, song).artistName).toBe('Toto');
  });

  it('falls back to the first result that has a preview', () => {
    const results = [
      { artistName: 'No Preview Artist', trackName: 'Africa' },
      { artistName: 'Cover Band', previewUrl: 'y', trackName: 'Africa' },
    ];
    expect(pickMatch(results, song).artistName).toBe('Cover Band');
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

describe('daily manifest', () => {
  // If this fails after editing SONGS, regenerate with `npm run resolve:songs`.
  it('pins every curated song with a preview and track id', () => {
    for (const song of SONGS) {
      const entry = manifest[manifestKey(song)];
      expect(entry, `missing manifest entry for ${song.title}`).toBeTruthy();
      expect(entry.previewUrl).toMatch(/^https:\/\//);
      expect(entry.trackId).toBeGreaterThan(0);
      expect(entry.answer?.title).toBeTruthy();
      expect(entry.answer?.artist).toBeTruthy();
    }
  });
});

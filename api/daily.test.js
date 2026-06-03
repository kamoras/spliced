import { describe, it, expect } from 'vitest';
import { selectDaily, pickMatch, norm, manifestKey } from './daily.js';
import {
  SONGS,
  DAILY_TRACKS,
  LAUNCH_UTC,
  clipsPerTrackForDay,
} from './_songs.js';
import manifest from './_manifest.json';

const DAY = 86400000;

describe('selectDaily', () => {
  it('is puzzle #0 with the first four songs at launch', () => {
    const { puzzleNumber, songs } = selectDaily(LAUNCH_UTC);
    expect(puzzleNumber).toBe(0);
    expect(songs).toEqual(SONGS.slice(0, DAILY_TRACKS));
  });

  it('advances one puzzle per UTC day and wraps the song list by track groups', () => {
    const dayThree = selectDaily(LAUNCH_UTC + 3 * DAY);
    expect(dayThree.puzzleNumber).toBe(3);
    expect(dayThree.songs).toEqual(
      Array.from(
        { length: DAILY_TRACKS },
        (_, i) => SONGS[(3 * DAILY_TRACKS + i) % SONGS.length]
      )
    );

    const wrapped = selectDaily(LAUNCH_UTC + SONGS.length * DAY);
    expect(wrapped.puzzleNumber).toBe(SONGS.length);
    expect(wrapped.songs).toEqual(SONGS.slice(0, DAILY_TRACKS));
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

describe('clipsPerTrackForDay', () => {
  it('ramps from easy early-week to hard late-week', () => {
    expect(clipsPerTrackForDay(Date.UTC(2026, 0, 5))).toBe(3); // Monday
    expect(clipsPerTrackForDay(Date.UTC(2026, 0, 7))).toBe(4); // Wednesday
    expect(clipsPerTrackForDay(Date.UTC(2026, 0, 10))).toBe(5); // Saturday
  });

  it('is constant across a UTC day and always 3..5', () => {
    const morning = clipsPerTrackForDay(Date.UTC(2026, 0, 5, 0, 0, 1));
    const night = clipsPerTrackForDay(Date.UTC(2026, 0, 5, 23, 59, 59));
    expect(morning).toBe(night);
    for (let d = 0; d < 7; d++) {
      const v = clipsPerTrackForDay(Date.UTC(2026, 0, 4 + d));
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
    }
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

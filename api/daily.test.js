import { describe, it, expect } from 'vitest';
import { selectDaily, pickMatch, norm } from './daily.js';
import { SONGS, LAUNCH_UTC } from './_songs.js';

const DAY = 86400000;

describe('selectDaily', () => {
  it('is puzzle #0 with the first song at launch', () => {
    const { puzzleNumber, song } = selectDaily(LAUNCH_UTC);
    expect(puzzleNumber).toBe(0);
    expect(song).toEqual(SONGS[0]);
  });

  it('advances one puzzle per UTC day and wraps the song list', () => {
    expect(selectDaily(LAUNCH_UTC + 3 * DAY).puzzleNumber).toBe(3);
    const wrapped = selectDaily(LAUNCH_UTC + SONGS.length * DAY);
    expect(wrapped.puzzleNumber).toBe(SONGS.length);
    expect(wrapped.song).toEqual(SONGS[0]);
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

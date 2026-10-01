import { describe, it, expect, beforeEach } from 'vitest';
import {
  getResult,
  saveResult,
  computeStats,
  formatCountdown,
  formatDuration,
  msUntilNextPuzzle,
  getProgress,
  saveProgress,
  getPrefs,
  setPrefs,
  liveStreak,
  getCrate,
  addToCrate,
} from './storage.js';

beforeEach(() => localStorage.clear());

describe('saveResult / getResult', () => {
  it('round-trips a result', () => {
    saveResult(1, { solved: true, mistakes: 3 });
    expect(getResult(1)).toMatchObject({ solved: true, mistakes: 3 });
  });

  it('does not let a later reveal overwrite a genuine solve', () => {
    saveResult(2, { solved: true, mistakes: 2 });
    saveResult(2, { solved: false, mistakes: 9 });
    expect(getResult(2)).toMatchObject({ solved: true, mistakes: 2 });
  });

  it('returns null for unknown puzzles', () => {
    expect(getResult(999)).toBeNull();
  });
});

describe('computeStats', () => {
  it('counts plays, wins, win %, and perfect (0-mistake) solves', () => {
    saveResult(1, { solved: true, mistakes: 0 });
    saveResult(2, { solved: true, mistakes: 2 });
    saveResult(3, { solved: false, mistakes: 4 });
    const s = computeStats(3);
    expect(s).toMatchObject({ played: 3, wins: 2, winPct: 67, perfect: 1 });
  });

  it('counts the current streak only when the latest puzzle was solved', () => {
    saveResult(5, { solved: true, mistakes: 1 });
    saveResult(6, { solved: true, mistakes: 0 });
    saveResult(7, { solved: true, mistakes: 1 });
    expect(computeStats(7).currentStreak).toBe(3);
    saveResult(7, { solved: false, mistakes: 4 });
    // A loss can't overwrite the solve, so 7 stays solved...
    expect(computeStats(7).currentStreak).toBe(3);
    // ...but a brand-new unsolved latest day breaks the active streak.
    expect(computeStats(8).currentStreak).toBe(0);
  });

  it('finds the longest run of consecutive solved days', () => {
    saveResult(1, { solved: true });
    saveResult(2, { solved: true });
    saveResult(4, { solved: true });
    saveResult(5, { solved: true });
    saveResult(6, { solved: true });
    expect(computeStats(6).maxStreak).toBe(3);
  });

  it('is all zeros with no history', () => {
    expect(computeStats(10)).toEqual({
      played: 0,
      wins: 0,
      winPct: 0,
      perfect: 0,
      currentStreak: 0,
      maxStreak: 0,
      distribution: [0, 0, 0, 0],
      losses: 0,
    });
  });

  it('buckets wins by mistake count', () => {
    saveResult(1, { solved: true, mistakes: 0 });
    saveResult(2, { solved: true, mistakes: 2 });
    saveResult(3, { solved: true, mistakes: 2 });
    saveResult(4, { solved: false, mistakes: 4 });
    expect(computeStats(4)).toMatchObject({
      distribution: [1, 0, 2, 0],
      losses: 1,
    });
  });
});

describe('progress', () => {
  const state = {
    order: ['a'],
    solved: [],
    mistakes: 1,
    attempts: [],
    tried: {},
    status: 'playing' as const,
    elapsedMs: 10,
  };

  it('round-trips and keeps only the latest week', () => {
    for (let n = 1; n <= 9; n++) saveProgress(n, { ...state, mistakes: n });
    expect(getProgress(9)).toMatchObject({ mistakes: 9 });
    expect(getProgress(3)).toMatchObject({ mistakes: 3 });
    expect(getProgress(2)).toBeNull();
  });
});

describe('prefs', () => {
  it('defaults sound on and help unseen, and persists changes', () => {
    expect(getPrefs()).toMatchObject({ sfx: true, seenHelp: false });
    setPrefs({ seenHelp: true, volume: 0.4 });
    expect(getPrefs()).toEqual({
      sfx: true,
      seenHelp: true,
      volume: 0.4,
      muted: false,
    });
  });
});

describe('formatDuration', () => {
  it('formats m:ss and rolls hours into minutes', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5000)).toBe('0:05');
    expect(formatDuration((2 * 60 + 5) * 1000)).toBe('2:05');
    expect(formatDuration(75 * 60 * 1000)).toBe('75:00');
  });
});

describe('formatCountdown', () => {
  it('formats hh:mm:ss with zero padding', () => {
    expect(formatCountdown(0)).toBe('00:00:00');
    expect(formatCountdown((3 * 3600 + 4 * 60 + 5) * 1000)).toBe('03:04:05');
  });
});

describe('msUntilNextPuzzle', () => {
  it('is within (0, one day]', () => {
    const ms = msUntilNextPuzzle();
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(86400000);
  });
});

describe('liveStreak', () => {
  it('keeps yesterday’s streak alive until today is played', () => {
    saveResult(4, { solved: true });
    saveResult(5, { solved: true });
    expect(liveStreak(6)).toBe(2);
    saveResult(6, { solved: true });
    expect(liveStreak(6)).toBe(3);
    expect(liveStreak(8)).toBe(0);
  });
});

describe('crate', () => {
  const song = { title: 'Africa', artist: 'Toto', solved: false, named: false };

  it('collects songs newest-first without duplicates, upgrading flags', () => {
    addToCrate([song, { ...song, title: 'Rosanna' }]);
    addToCrate([{ ...song, solved: true, named: true }]);
    addToCrate([{ ...song, solved: false }]);
    const crate = getCrate();
    expect(crate.map((e) => e.title)).toEqual(['Africa', 'Rosanna']);
    expect(crate[0]).toMatchObject({ solved: true, named: true });
  });
});

describe('corrupted storage', () => {
  it('ignores junk instead of crashing', () => {
    localStorage.setItem('spliced:daily', '"oops"');
    expect(getResult(1)).toBeNull();
    localStorage.setItem(
      'spliced:crate',
      '[null, 3, {"title":"A","artist":"B"}]'
    );
    expect(getCrate()).toHaveLength(1);
    localStorage.setItem('spliced:prefs', '{"volume":"loud","sfx":"no"}');
    expect(getPrefs()).toMatchObject({ volume: 0.85, sfx: true });
  });
});

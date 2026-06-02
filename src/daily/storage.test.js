import { describe, it, expect, beforeEach } from 'vitest';
import {
  getResult,
  saveResult,
  formatCountdown,
  msUntilNextPuzzle,
} from './storage.js';

beforeEach(() => localStorage.clear());

describe('saveResult / getResult', () => {
  it('round-trips a result', () => {
    saveResult(1, { solved: true, attempts: 3 });
    expect(getResult(1)).toMatchObject({ solved: true, attempts: 3 });
  });

  it('does not let a later reveal overwrite a genuine solve', () => {
    saveResult(2, { solved: true, attempts: 2 });
    saveResult(2, { solved: false, attempts: 9 });
    expect(getResult(2)).toMatchObject({ solved: true, attempts: 2 });
  });

  it('returns null for unknown puzzles', () => {
    expect(getResult(999)).toBeNull();
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

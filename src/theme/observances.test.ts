import { describe, it, expect } from 'vitest';
import { observanceFor } from './observances.js';

const on = (m: number, d: number, y = 2026) => new Date(y, m - 1, d, 12);
const id = (m: number, d: number, y?: number) =>
  observanceFor(on(m, d, y))?.id ?? null;

describe('observanceFor', () => {
  it('matches month observances by local date', () => {
    expect(id(2, 1)).toBe('bhm');
    expect(id(2, 29, 2028)).toBe('bhm');
    expect(id(3, 15)).toBe('whm');
    expect(id(5, 31)).toBe('aanhpi');
    expect(id(7, 4)).toBe('disability');
    expect(id(11, 30)).toBe('nahm');
    expect(id(8, 1)).toBeNull();
  });

  it('handles a range that spans two months', () => {
    expect(id(9, 14)).toBeNull();
    expect(id(9, 15)).toBe('hhm');
    expect(id(10, 15)).toBe('hhm');
    expect(id(10, 16)).toBeNull();
  });

  it('lets the shorter observance win an overlap', () => {
    expect(id(6, 18)).toBe('pride');
    expect(id(6, 19)).toBe('juneteenth');
    expect(id(6, 20)).toBe('pride');
  });

  it('moves Black History Month to October in the UK and Ireland', () => {
    expect(observanceFor(on(2, 10), null, 'GB')).toBeNull();
    expect(observanceFor(on(10, 20), null, 'GB')?.id).toBe('bhm-uk');
    expect(observanceFor(on(10, 10), null, 'IE')?.id).toBe('bhm-uk');
    expect(observanceFor(on(10, 20), null, 'US')).toBeNull();
    expect(observanceFor(on(2, 10), null, 'US')?.id).toBe('bhm');
  });

  it('supports preview overrides', () => {
    expect(observanceFor(on(8, 1), 'pride')?.id).toBe('pride');
    expect(observanceFor(on(6, 1), 'none')).toBeNull();
    expect(observanceFor(on(6, 1), 'bogus')).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import {
  mulberry32,
  shufflePieces,
  isSolved,
  countCorrect,
  guessesLeft,
} from './puzzle.js';

const makePieces = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, correctIndex: i }));

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    const seqA = [a(), a(), a()];
    expect(seqA).toEqual([b(), b(), b()]);
    seqA.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    });
  });

  it('produces different streams for different seeds', () => {
    expect(mulberry32(1)()).not.toEqual(mulberry32(2)());
  });
});

describe('shufflePieces', () => {
  it('is deterministic for a fixed seed', () => {
    const pieces = makePieces(6);
    expect(shufflePieces(pieces, 42).map((p) => p.id)).toEqual(
      shufflePieces(pieces, 42).map((p) => p.id)
    );
  });

  it('never returns an already-solved arrangement', () => {
    const pieces = makePieces(6);
    for (let seed = 0; seed < 200; seed++) {
      expect(isSolved(shufflePieces(pieces, seed))).toBe(false);
    }
  });

  it('returns a copy (not solved) for the trivial 1-piece case', () => {
    const pieces = makePieces(1);
    const out = shufflePieces(pieces, 1);
    expect(out).toEqual(pieces);
    expect(out).not.toBe(pieces);
  });

  it('preserves the full set of pieces', () => {
    const pieces = makePieces(6);
    expect(
      shufflePieces(pieces, 7)
        .map((p) => p.id)
        .sort()
    ).toEqual(pieces.map((p) => p.id).sort());
  });
});

describe('isSolved / countCorrect', () => {
  it('isSolved is true only when every piece sits at its index', () => {
    const pieces = makePieces(4);
    expect(isSolved(pieces)).toBe(true);
    expect(isSolved([pieces[1], pieces[0], pieces[2], pieces[3]])).toBe(false);
  });

  it('countCorrect counts pieces in their correct slot', () => {
    const pieces = makePieces(4);
    expect(countCorrect(pieces)).toBe(4);
    expect(countCorrect([pieces[1], pieces[0], pieces[2], pieces[3]])).toBe(2);
  });
});

describe('guessesLeft', () => {
  it('counts down from the cap and never goes negative', () => {
    expect(guessesLeft(0, 6)).toBe(6);
    expect(guessesLeft(4, 6)).toBe(2);
    expect(guessesLeft(6, 6)).toBe(0);
    expect(guessesLeft(9, 6)).toBe(0);
  });
});

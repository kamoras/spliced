import { describe, it, expect } from 'vitest';
import {
  mulberry32,
  shufflePieces,
  buildAnchoredOrder,
  gradeOrder,
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

describe('buildAnchoredOrder', () => {
  it('locks the first clip in the first position', () => {
    const pieces = makePieces(7);
    const order = buildAnchoredOrder(pieces, 12);

    expect(order[0]).toEqual(pieces[0]);
  });

  it('shuffles only the movable clips deterministically', () => {
    const pieces = makePieces(7);
    const first = buildAnchoredOrder(pieces, 42);
    const second = buildAnchoredOrder(pieces, 42);

    expect(first.map((p) => p.id)).toEqual(second.map((p) => p.id));
    expect(
      first
        .slice(1)
        .map((p) => p.id)
        .sort()
    ).toEqual(
      pieces
        .slice(1)
        .map((p) => p.id)
        .sort()
    );
  });

  it('does not return a solved full arrangement when movable clips can be shuffled', () => {
    const pieces = makePieces(7);
    for (let seed = 0; seed < 200; seed++) {
      expect(isSolved(buildAnchoredOrder(pieces, seed))).toBe(false);
    }
  });
});

describe('gradeOrder', () => {
  it('marks each guessed slot as correct or wrong', () => {
    const pieces = makePieces(4);
    expect(gradeOrder([pieces[0], pieces[2], pieces[1], pieces[3]])).toEqual([
      { id: 'p0', correct: true, anchor: true },
      { id: 'p2', correct: false, anchor: false },
      { id: 'p1', correct: false, anchor: false },
      { id: 'p3', correct: true, anchor: false },
    ]);
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

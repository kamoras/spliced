import { describe, it, expect } from 'vitest';
import {
  finishedFromResult,
  isValidState,
  moveClip,
  newGame,
  revealAll,
  rowsOf,
  shareText,
  submitRow,
  wrongHint,
} from './engine.js';
import type { GameState, PuzzleDef } from './engine.js';

function makeDef(trackCount = 3, clips = 3, maxGuesses = 3): PuzzleDef {
  return {
    clipsPerTrack: clips,
    maxGuesses,
    tracks: Array.from({ length: trackCount }, (_, t) => ({
      id: `t${t}`,
      pieces: Array.from({ length: clips }, (_, i) => ({
        id: `t${t}-${i}`,
        trackId: `t${t}`,
        correctIndex: i,
      })),
    })),
  };
}

// A playing state with an explicit board.
function boardState(order: string[]): GameState {
  return {
    order,
    solved: [],
    mistakes: 0,
    attempts: [],
    tried: {},
    status: 'playing',
    elapsedMs: 0,
  };
}

describe('newGame', () => {
  it('is deterministic for a seed and contains every piece once', () => {
    const def = makeDef();
    const a = newGame(def, 42);
    expect(newGame(def, 42).order).toEqual(a.order);
    expect([...a.order].sort()).toEqual(
      def.tracks.flatMap((t) => t.pieces.map((p) => p.id)).sort()
    );
    expect(a.status).toBe('playing');
  });
});

describe('moveClip', () => {
  const def = makeDef();
  const start = boardState([
    't0-0', 't1-0', 't2-0',
    't0-1', 't1-1', 't2-1',
    't0-2', 't1-2', 't2-2',
  ]); // prettier-ignore

  it('pushes within a row', () => {
    const s = moveClip(start, def, 't0-0', 't2-0');
    expect(rowsOf(s, def)[0]).toEqual(['t1-0', 't2-0', 't0-0']);
  });

  it('swaps across rows', () => {
    const s = moveClip(start, def, 't0-0', 't1-1');
    expect(rowsOf(s, def)[0]).toEqual(['t1-1', 't1-0', 't2-0']);
    expect(rowsOf(s, def)[1]).toEqual(['t0-1', 't0-0', 't2-1']);
  });

  it('refuses to touch locked rows or finished games', () => {
    const locked = { ...start, solved: ['t0'] };
    expect(moveClip(locked, def, 't0-0', 't1-1')).toBe(locked);
    const over = { ...start, status: 'won' as const };
    expect(moveClip(over, def, 't0-1', 't1-1')).toBe(over);
  });
});

describe('submitRow', () => {
  const def = makeDef();

  it('locks a correct row and floats it to the top', () => {
    const s = boardState([
      't1-0', 't0-1', 't2-0',
      't0-0', 't1-1', 't2-1',
      't2-2', 't1-2', 't0-2',
    ]); // prettier-ignore
    // Make row 2 a complete song: t1 in order.
    const ready = boardState([
      't0-1', 't0-0', 't2-0',
      't2-2', 't0-2', 't2-1',
      't1-0', 't1-1', 't1-2',
    ]); // prettier-ignore
    expect(submitRow(s, def, 0).outcome.kind).toBe('wrong');

    const { state, outcome } = submitRow(ready, def, 2);
    expect(outcome).toMatchObject({
      kind: 'solved',
      trackId: 't1',
      won: false,
    });
    expect(state.solved).toEqual(['t1']);
    expect(rowsOf(state, def)[0]).toEqual(['t1-0', 't1-1', 't1-2']);
    expect(state.mistakes).toBe(0);
    expect(state.attempts).toEqual([
      { marks: ['correct', 'correct', 'correct'], solved: true },
    ]);
  });

  it('charges a mistake for a wrong row, but not for re-checking it', () => {
    const s = boardState([
      't0-1', 't0-0', 't1-0',
      't1-1', 't1-2', 't2-0',
      't2-1', 't2-2', 't0-2',
    ]); // prettier-ignore
    const first = submitRow(s, def, 0);
    expect(first.outcome).toMatchObject({
      kind: 'wrong',
      trackId: 't0',
      rightSong: 2,
      inPlace: 0,
    });
    expect(first.state.mistakes).toBe(1);
    const again = submitRow(first.state, def, 0);
    expect(again.outcome.kind).toBe('repeat');
    expect(again.state).toBe(first.state);
  });

  it('reveals every song when the last mistake is spent', () => {
    let s = boardState([
      't0-1', 't0-0', 't1-0',
      't1-1', 't1-2', 't2-0',
      't2-1', 't2-2', 't0-2',
    ]); // prettier-ignore
    s = submitRow(s, def, 0).state;
    s = submitRow(s, def, 1).state;
    const last = submitRow(s, def, 2);
    expect(last.outcome).toMatchObject({ kind: 'wrong', lost: true });
    expect(last.state.status).toBe('lost');
    expect(last.state.order).toEqual(
      def.tracks.flatMap((t) => t.pieces.map((p) => p.id))
    );
  });

  it('wins when the final song locks', () => {
    const s: GameState = {
      ...boardState([
        't2-0', 't2-1', 't2-2',
        't0-0', 't0-1', 't0-2',
        't1-0', 't1-1', 't1-2',
      ]), // prettier-ignore
      solved: ['t2', 't0'],
    };
    const { state, outcome } = submitRow(s, def, 2);
    expect(outcome).toMatchObject({ kind: 'solved', won: true });
    expect(state.status).toBe('won');
  });

  it('ignores locked rows', () => {
    const s = { ...boardState(newGame(def, 1).order), solved: ['t0'] };
    expect(submitRow(s, def, 0).outcome.kind).toBe('ignored');
  });
});

describe('revealAll / finishedFromResult', () => {
  const def = makeDef();
  it('keeps locked songs on top, then the rest in canonical order', () => {
    const s = { ...boardState(newGame(def, 3).order), solved: ['t2'] };
    expect(rowsOf(revealAll(s, def), def).map((r) => r[0])).toEqual([
      't2-0',
      't0-0',
      't1-0',
    ]);
  });

  it('rebuilds a finished board from a legacy result', () => {
    const s = finishedFromResult(def, { solved: true, mistakes: 2 });
    expect(s).toMatchObject({ status: 'won', mistakes: 2 });
    expect(s.solved).toEqual(['t0', 't1', 't2']);
  });
});

describe('isValidState', () => {
  const def = makeDef();
  it('accepts a real state and rejects a mismatched one', () => {
    const s = newGame(def, 5);
    expect(isValidState(s, def)).toBe(true);
    expect(isValidState({ ...s, order: s.order.slice(1) }, def)).toBe(false);
    expect(isValidState({ ...s, solved: ['nope'] }, def)).toBe(false);
    expect(isValidState(null, def)).toBe(false);
    expect(isValidState(s, makeDef(3, 4))).toBe(false);
  });
});

describe('wrongHint', () => {
  it('calls out the "one away" moments', () => {
    expect(wrongHint({ rightSong: 4, inPlace: 1 }, 4)).toMatch(/all one song/i);
    expect(wrongHint({ rightSong: 3, inPlace: 1 }, 4)).toMatch(/so close/i);
    expect(wrongHint({ rightSong: 1, inPlace: 0 }, 4)).toMatch(/mashup/i);
  });
});

describe('shareText', () => {
  const def = makeDef(2, 3, 4);
  it('renders an emoji grid with score and time', () => {
    const s: GameState = {
      ...boardState([]),
      status: 'won',
      mistakes: 1,
      elapsedMs: 95_000,
      attempts: [
        { marks: ['correct', 'misplaced', 'miss'], solved: false },
        { marks: ['correct', 'correct', 'correct'], solved: true },
      ],
    };
    expect(shareText('Spliced #12', s, def, 'https://x.test')).toBe(
      'Spliced #12 · 1/4 mistakes · ⏱ 1:35\n🟩🟨⬛\n🟩🟩🟩\nhttps://x.test'
    );
  });

  it('marks a perfect solve and a loss', () => {
    const won = { ...boardState([]), status: 'won' as const };
    expect(shareText('S', won, def)).toMatch(/Perfect mix/);
    const lost = { ...boardState([]), status: 'lost' as const, mistakes: 4 };
    expect(shareText('S', lost, def)).toBe('S · X/4');
  });
});

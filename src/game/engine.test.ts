import { describe, it, expect } from 'vitest';
import {
  clueFor,
  swapRows,
  hasHeard,
  hear,
  parFor,
  relToPar,
  rowPlayKey,
  seamKey,
  takesOf,
  decodeGhost,
  encodeGhost,
  raceResult,
  finishedFromResult,
  headline,
  nameTrack,
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

  it('swaps within a row', () => {
    const s = moveClip(start, def, 't0-0', 't2-0');
    expect(rowsOf(s, def)[0]).toEqual(['t2-0', 't1-0', 't0-0']);
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

  it('locks a row that spells its own song, in place', () => {
    const ready = boardState([
      't2-0', 't0-0', 't2-1',
      't1-0', 't1-1', 't1-2',
      't0-1', 't2-2', 't0-2',
    ]); // prettier-ignore
    const { state, outcome } = submitRow(ready, def, 1);
    expect(outcome).toMatchObject({
      kind: 'solved',
      trackId: 't1',
      won: false,
    });
    expect(state.solved).toEqual(['t1']);
    expect(rowsOf(state, def)[1]).toEqual(['t1-0', 't1-1', 't1-2']);
    expect(state.mistakes).toBe(0);
    expect(state.attempts).toEqual([
      {
        marks: ['correct', 'correct', 'correct'],
        solved: true,
        atMs: 0,
        row: 1,
      },
    ]);
  });

  it('grades against the row’s assigned song', () => {
    const s = boardState([
      't1-0', 't0-1', 't0-0',
      't0-2', 't1-1', 't2-1',
      't2-0', 't1-2', 't2-2',
    ]); // prettier-ignore
    const { outcome } = submitRow(s, def, 0);
    expect(outcome).toMatchObject({
      kind: 'wrong',
      trackId: 't0',
      marks: ['miss', 'correct', 'misplaced'],
      rightSong: 2,
      inPlace: 1,
    });
  });

  it('charges a mistake for a wrong row, but not for re-checking it', () => {
    const s = boardState([
      't0-1', 't0-0', 't1-0',
      't1-1', 't1-2', 't2-0',
      't2-1', 't2-2', 't0-2',
    ]); // prettier-ignore
    const first = submitRow(s, def, 0);
    expect(first.state.mistakes).toBe(1);
    const again = submitRow(first.state, def, 0);
    expect(again.outcome.kind).toBe('repeat');
    expect(again.state).toBe(first.state);
  });

  it('moves a right-song-wrong-year row home, locks it, and charges a mistake', () => {
    const s = boardState([
      't2-0', 't2-1', 't2-2',
      't1-0', 't0-1', 't1-2',
      't0-0', 't1-1', 't0-2',
    ]); // prettier-ignore
    const { state, outcome } = submitRow(s, def, 0);
    expect(outcome).toMatchObject({ kind: 'wrongEra', trackId: 't2' });
    expect(state.mistakes).toBe(1);
    expect(state.solved).toEqual(['t2']);
    expect(rowsOf(state, def)[2]).toEqual(['t2-0', 't2-1', 't2-2']);
    expect(rowsOf(state, def)[0]).toEqual(['t0-0', 't1-1', 't0-2']);
  });

  it('re-grades the same clips on a different row (tried is per row)', () => {
    const s = boardState([
      't1-0', 't0-1', 't0-0',
      't0-2', 't1-1', 't2-1',
      't2-0', 't1-2', 't2-2',
    ]); // prettier-ignore
    const first = submitRow(s, def, 0).state;
    const swapped = swapRows(first, def, 0, 1);
    expect(submitRow(swapped, def, 1).outcome.kind).toBe('wrong');
    // …but re-checking the very same row is still free.
    expect(submitRow(first, def, 0).outcome.kind).toBe('repeat');
  });

  it('marks a wrong-year lock so the share grid can show it', () => {
    const s = boardState([
      't2-0', 't2-1', 't2-2',
      't1-0', 't0-1', 't1-2',
      't0-0', 't1-1', 't0-2',
    ]); // prettier-ignore
    const { state } = submitRow(s, def, 0);
    expect(state.attempts.at(-1)).toMatchObject({ era: true, row: 0 });
    const won = { ...state, status: 'won' as const };
    expect(shareText('S', won, def).split('\n')).toContain('🟦🟦🟦');
  });

  it('locks both rows when moving a song home completes this row too', () => {
    const s = boardState([
      't1-0', 't1-1', 't1-2',
      't0-0', 't0-1', 't0-2',
      't2-1', 't2-0', 't2-2',
    ]); // prettier-ignore
    const { state, outcome } = submitRow(s, def, 0);
    expect(outcome.kind).toBe('wrongEra');
    expect(state.solved).toEqual(['t1', 't0']);
    expect(state.mistakes).toBe(1);
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
        't0-0', 't0-1', 't0-2',
        't1-0', 't1-1', 't1-2',
        't2-0', 't2-1', 't2-2',
      ]), // prettier-ignore
      solved: ['t2', 't0'],
    };
    const { state, outcome } = submitRow(s, def, 1);
    expect(outcome).toMatchObject({ kind: 'solved', won: true });
    expect(state.status).toBe('won');
  });

  it('ignores locked rows', () => {
    const s = { ...boardState(newGame(def, 1).order), solved: ['t0'] };
    expect(submitRow(s, def, 0).outcome.kind).toBe('ignored');
  });
});

describe('swapRows / clueFor', () => {
  const def: PuzzleDef = {
    ...makeDef(),
    tracks: makeDef().tracks.map((t, i) => ({
      ...t,
      clue: { year: 1980 + i, genre: 'Pop', showGenre: i === 2 },
    })),
  };
  const s = boardState(def.tracks.flatMap((t) => t.pieces.map((p) => p.id)));

  it('swaps two unlocked rows, never a locked one', () => {
    expect(rowsOf(swapRows(s, def, 0, 1), def)[0][0]).toBe('t1-0');
    const locked = { ...s, solved: ['t0'] };
    expect(swapRows(locked, def, 0, 1)).toBe(locked);
  });

  it('shows genre on year collisions or after a miss on that row', () => {
    expect(clueFor(s, def, 0)).toEqual({ year: 1980, genre: undefined });
    expect(clueFor(s, def, 2)).toEqual({ year: 1982, genre: 'Pop' });
    const missed = {
      ...s,
      attempts: [{ marks: [], solved: false, row: 0 }],
    };
    expect(clueFor(missed, def, 0).genre).toBe('Pop');
  });
});

describe('revealAll / finishedFromResult', () => {
  const def = makeDef();
  it('puts every song in its own row, in order', () => {
    const s = { ...boardState(newGame(def, 3).order), solved: ['t2'] };
    expect(rowsOf(revealAll(s, def), def).map((r) => r[0])).toEqual([
      't0-0',
      't1-0',
      't2-0',
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
    expect(wrongHint({ rightSong: 4, inPlace: 1 }, 4, '1984')).toMatch(
      /all 1984/i
    );
    expect(wrongHint({ rightSong: 3, inPlace: 1 }, 4, '1984')).toMatch(
      /isn’t from 1984/
    );
    expect(wrongHint({ rightSong: 0, inPlace: 0 }, 4, '1984')).toBe(
      'Nothing here is from 1984.'
    );
  });
});

describe('nameTrack / headline', () => {
  it('records one answer per locked song only', () => {
    const s: GameState = { ...boardState([]), solved: ['t0'] };
    const a = nameTrack(s, 't0', true);
    expect(a.named).toEqual({ t0: true });
    expect(nameTrack(a, 't0', false)).toBe(a);
    expect(nameTrack(s, 't1', true)).toBe(s);
  });

  it('picks a headline by mistakes', () => {
    const won = { ...boardState([]), status: 'won' as const };
    expect(headline(won).title).toMatch(/perfect/i);
    expect(headline({ ...won, mistakes: 3 }).title).toMatch(/final mix/i);
    expect(headline({ ...won, status: 'lost' }).title).toMatch(/jam/i);
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
      'Spliced #12 · 1/4 mistakes · ⏱ 1:35 · 🎧 2 takes (14 under par)\n🟩🟨⬛\n🟩🟩🟩\nhttps://x.test'
    );
  });

  it('adds a name-that-tune line once songs are locked', () => {
    const s: GameState = {
      ...boardState([]),
      status: 'won',
      solved: ['t0', 't1'],
      named: { t0: true, t1: false },
    };
    expect(shareText('S', s, def).split('\n')[1]).toBe('Named 1/2 🎵🔇');
  });

  it('marks a perfect solve and a loss', () => {
    const won = { ...boardState([]), status: 'won' as const };
    expect(shareText('S', won, def)).toMatch(/Perfect mix/);
    const lost = { ...boardState([]), status: 'lost' as const, mistakes: 4 };
    expect(shareText('S', lost, def)).toBe('S · X/4');
  });
});

describe('ghost race', () => {
  const run: GameState = {
    ...boardState([]),
    status: 'won',
    mistakes: 1,
    elapsedMs: 161_000,
    heard: Array.from({ length: 31 }, (_, i) => `s:${i}`),
    attempts: [
      {
        marks: ['correct', 'misplaced', 'miss', 'correct'],
        solved: false,
        atMs: 40_000,
      },
      {
        marks: ['correct', 'correct', 'correct', 'correct'],
        solved: true,
        atMs: 75_300,
      },
    ],
  };

  it('round-trips a run through a URL-safe code', () => {
    const code = encodeGhost(run, 153);
    expect(code).toMatch(/^[0-9a-z._]+$/);
    expect(decodeGhost(code)).toEqual({
      puzzle: 153,
      won: true,
      elapsedMs: 161_000,
      mistakes: 1,
      takes: 33,
      attempts: run.attempts,
    });
  });

  it('rejects junk', () => {
    expect(decodeGhost(null)).toBeNull();
    expect(decodeGhost('hello')).toBeNull();
    expect(decodeGhost('g1.4h.w.zz.1.v.2103x1')).toBeNull();
    expect(decodeGhost('g1.4h.q.zz.1.v.')).toBeNull();
    expect(decodeGhost('g1.4h.w.zz.1.v.')).toMatchObject({ attempts: [] });
    expect(decodeGhost('g1.1.w.10.3abc.5.')).toBeNull();
    expect(decodeGhost('g1.1.w.10.3.5.22s' + 'z'.repeat(300))).toBeNull();
  });

  it('ranks a win, then fewer mistakes, then time', () => {
    const ghost = decodeGhost(encodeGhost(run, 1))!;
    expect(raceResult({ ...run, mistakes: 0 }, ghost)).toBeGreaterThan(0);
    expect(raceResult({ ...run, elapsedMs: 200_000 }, ghost)).toBeLessThan(0);
    expect(raceResult({ ...run, status: 'lost' }, ghost)).toBeLessThan(0);
  });

  it('stamps lock-ins with the play time', () => {
    const def = makeDef();
    const s = { ...newGame(def, 9), elapsedMs: 12_345 };
    expect(submitRow(s, def, 0).state.attempts[0].atMs).toBe(12_345);
  });
});

describe('takes + par', () => {
  it('counts each new seam or row order once; replays are free', () => {
    let s = boardState(['a', 'b']);
    s = hear(s, seamKey('a', 'b'));
    s = hear(s, seamKey('a', 'b'));
    s = hear(s, seamKey('b', 'a'));
    s = hear(s, rowPlayKey(['a', 'b']));
    expect(takesOf(s)).toBe(3);
    expect(hasHeard(s, seamKey('b', 'a'))).toBe(true);
    // Each lock-in is a take, and a wrong one costs two more.
    const locked = {
      ...s,
      mistakes: 1,
      attempts: [
        { marks: [], solved: false },
        { marks: [], solved: true },
      ],
    };
    expect(takesOf(locked)).toBe(3 + 2);
    expect(hear({ ...s, status: 'won' }, 'x').heard).toHaveLength(3);
  });

  it('sets par from the board size and shows it in the share', () => {
    const def = makeDef(4, 4, 4);
    expect(parFor(def)).toBe(40);
    expect(relToPar(22, 28)).toBe('6 under par');
    expect(relToPar(28, 28)).toBe('even par');
    expect(relToPar(30, 28)).toBe('2 over par');
    const s: GameState = {
      ...boardState([]),
      status: 'won',
      heard: ['s:a>b', 'r:a,b'],
      attempts: [{ marks: ['correct'], solved: true }],
    };
    expect(shareText('S', s, def).split('\n')[0]).toBe(
      'S · Perfect mix 🎚️ · 🎧 3 takes (37 under par)'
    );
  });
});

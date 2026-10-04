import { describe, it, expect } from 'vitest';
import {
  rowTrack,
  isRowLocked,
  hasHeard,
  hasHeardClip,
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
  spliceJoin,
  chainOf,
  canMove,
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

  it('slides within a row, shifting the clips in between', () => {
    const s = moveClip(start, def, 't0-0', 't2-0');
    expect(rowsOf(s, def)[0]).toEqual(['t1-0', 't2-0', 't0-0']);
    const back = moveClip(s, def, 't0-0', 't1-0');
    expect(rowsOf(back, def)[0]).toEqual(['t0-0', 't1-0', 't2-0']);
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

describe('moveClip with spliced runs', () => {
  const def = makeDef();
  // Row 0 holds a spliced pair t1-0>t1-1 in slots 1-2.
  const base: GameState = {
    ...boardState([
      't0-0', 't1-0', 't1-1',
      't0-1', 't2-0', 't2-1',
      't0-2', 't1-2', 't2-2',
    ]), // prettier-ignore
    links: ['t1-0>t1-1'],
  };

  it('reads a clip’s run from its links', () => {
    expect(chainOf(base, def, 't1-1')).toEqual(['t1-0', 't1-1']);
    expect(chainOf(base, def, 't0-0')).toEqual(['t0-0']);
  });

  it('moves a run as one block, nudged to fit its target row', () => {
    const s = moveClip(base, def, 't1-0', 't2-1');
    // The pair lands in slots 1-2 of row 1 (nudged left from slot 2) and the
    // two clips it displaced take its old place.
    expect(rowsOf(s, def)[1]).toEqual(['t0-1', 't1-0', 't1-1']);
    expect(rowsOf(s, def)[0]).toEqual(['t0-0', 't2-0', 't2-1']);
    expect(canMove(base, def, 't1-0', 't2-1')).toBe(true);
  });

  it('never cuts a spliced run', () => {
    // Moving a lone clip from another row onto a member of the pair would
    // split it.
    expect(moveClip(base, def, 't0-2', 't1-1')).toBe(base);
    expect(canMove(base, def, 't0-2', 't1-0')).toBe(false);
    // Nor can the pair land on itself.
    expect(moveClip(base, def, 't1-0', 't1-1')).toBe(base);
  });

  it('lands beside a spliced run, never inside it', () => {
    // Row 0: [t0-0, (t1-0 t1-1)]. Sliding t0-0 right onto the run's first
    // member puts it after the whole run.
    const right = moveClip(base, def, 't0-0', 't1-0');
    expect(rowsOf(right, def)[0]).toEqual(['t1-0', 't1-1', 't0-0']);
    expect(chainOf(right, def, 't1-0')).toEqual(['t1-0', 't1-1']);
    // And sliding left onto the run's last member lands before the run.
    const wide = makeDef(3, 4);
    const s: GameState = {
      ...boardState([
        't1-0', 't1-1', 't2-0', 't0-0',
        't0-1', 't0-2', 't0-3', 't2-1',
        't1-2', 't1-3', 't2-2', 't2-3',
      ]), // prettier-ignore
      links: ['t1-0>t1-1'],
    };
    const left = moveClip(s, wide, 't0-0', 't1-1');
    expect(rowsOf(left, wide)[0]).toEqual(['t0-0', 't1-0', 't1-1', 't2-0']);
    expect(chainOf(left, wide, 't1-1')).toEqual(['t1-0', 't1-1']);
  });

  it('slides a run within its row past a lone clip', () => {
    // [t0-0, (t1-0 t1-1)] -> the pair slides to the front.
    const s = moveClip(base, def, 't1-1', 't0-0');
    expect(rowsOf(s, def)[0]).toEqual(['t1-0', 't1-1', 't0-0']);
    // And a lone clip can hop over the pair.
    const hop = moveClip(base, def, 't0-0', 't1-1');
    expect(rowsOf(hop, def)[0]).toEqual(['t1-0', 't1-1', 't0-0']);
  });
});

describe('spliceJoin', () => {
  const def = makeDef();

  it('fuses a true join without charging anything', () => {
    const s = boardState([
      't2-0', 't0-0', 't0-1',
      't1-0', 't1-1', 't1-2',
      't2-1', 't2-2', 't0-2',
    ]); // prettier-ignore
    const { state, outcome } = spliceJoin(s, def, 't0-0', 't0-1');
    expect(outcome).toMatchObject({ kind: 'fused', won: false, lost: false });
    expect(outcome.completed).toBeUndefined();
    expect(state.links).toEqual(['t0-0>t0-1']);
    expect(state.mistakes).toBe(0);
    expect(state.attempts).toEqual([
      { marks: ['correct'], solved: false, atMs: 0 },
    ]);
  });

  it('charges a mistake for a wrong join and remembers it', () => {
    const s = boardState([
      't0-0', 't1-0', 't0-1',
      't1-1', 't1-2', 't2-0',
      't2-1', 't2-2', 't0-2',
    ]); // prettier-ignore
    const first = spliceJoin(s, def, 't0-0', 't1-0');
    expect(first.outcome.kind).toBe('wrong');
    expect(first.state.mistakes).toBe(1);
    expect(first.state.bad).toEqual(['t0-0>t1-0']);
    // The same join can't be charged twice.
    const again = spliceJoin(first.state, def, 't0-0', 't1-0');
    expect(again.outcome.kind).toBe('repeat');
    expect(again.state).toBe(first.state);
    // Right clips, wrong way round, is still not a join.
    expect(spliceJoin(s, def, 't1-0', 't0-1').outcome.kind).toBe('wrong');
  });

  it('only splices adjacent clips in the same row', () => {
    const s = boardState([
      't0-0', 't1-0', 't0-1',
      't1-1', 't1-2', 't2-0',
      't2-1', 't2-2', 't0-2',
    ]); // prettier-ignore
    expect(spliceJoin(s, def, 't0-0', 't0-1').outcome.kind).toBe('ignored');
    expect(spliceJoin(s, def, 't0-1', 't1-1').outcome.kind).toBe('ignored');
  });

  it('completes a song on its last clip and locks the row it was built on', () => {
    const s: GameState = {
      ...boardState([
        't1-0', 't1-1', 't1-2',
        't0-0', 't2-0', 't0-1',
        't2-1', 't2-2', 't0-2',
      ]), // prettier-ignore
      links: ['t1-0>t1-1'],
    };
    // Rows have no song of their own: t1 stays on row 0, where it was built.
    const { state, outcome } = spliceJoin(s, def, 't1-1', 't1-2');
    expect(outcome).toMatchObject({ kind: 'fused', completed: 't1' });
    expect(state.solved).toEqual(['t1']);
    expect(state.mistakes).toBe(0);
    expect(rowsOf(state, def)[0]).toEqual(['t1-0', 't1-1', 't1-2']);
    expect(rowsOf(state, def)[1]).toEqual(['t0-0', 't2-0', 't0-1']);
    expect(rowTrack(state, def, 0)).toBe('t1');
    expect(rowTrack(state, def, 1)).toBeNull();
    expect(isRowLocked(state, def, 0)).toBe(true);
    expect(isRowLocked(state, def, 1)).toBe(false);
    expect(state.attempts.at(-1)).toMatchObject({
      solved: true,
      trackId: 't1',
    });
  });

  it('reveals every song, fused, when the last mistake is spent', () => {
    const s = boardState([
      't0-1', 't0-0', 't1-0',
      't1-1', 't1-2', 't2-0',
      't2-1', 't2-2', 't0-2',
    ]); // prettier-ignore
    let cur = s;
    cur = spliceJoin(cur, def, 't0-1', 't0-0').state;
    cur = spliceJoin(cur, def, 't0-0', 't1-0').state;
    const last = spliceJoin(cur, def, 't1-2', 't2-0');
    expect(last.outcome).toMatchObject({ kind: 'wrong', lost: true });
    expect(last.state.status).toBe('lost');
    expect(rowsOf(last.state, def)).toEqual([
      ['t0-0', 't0-1', 't0-2'],
      ['t1-0', 't1-1', 't1-2'],
      ['t2-0', 't2-1', 't2-2'],
    ]);
    expect(last.state.links).toContain('t2-0>t2-1');
  });

  it('wins when the final song fuses', () => {
    const s: GameState = {
      ...boardState([
        't0-0', 't0-1', 't0-2',
        't1-0', 't1-1', 't1-2',
        't2-0', 't2-1', 't2-2',
      ]), // prettier-ignore
      solved: ['t2', 't0'],
      links: ['t1-0>t1-1'],
    };
    const { state, outcome } = spliceJoin(s, def, 't1-1', 't1-2');
    expect(outcome).toMatchObject({ kind: 'fused', won: true });
    expect(state.status).toBe('won');
  });

  it('ignores locked rows and finished games', () => {
    const s: GameState = {
      ...boardState(def.tracks.flatMap((t) => t.pieces.map((p) => p.id))),
      solved: ['t0'],
    };
    expect(spliceJoin(s, def, 't0-0', 't0-1').outcome.kind).toBe('ignored');
    const over = { ...s, status: 'won' as const };
    expect(spliceJoin(over, def, 't1-0', 't1-1').outcome.kind).toBe('ignored');
  });
});

describe('rowTrack', () => {
  const def = makeDef();
  const s = boardState([
    't2-0', 't2-1', 't2-2',
    't0-0', 't1-0', 't0-1',
    't1-1', 't1-2', 't0-2',
  ]); // prettier-ignore

  it('names the song a row holds only once it is found', () => {
    expect(rowTrack(s, def, 0)).toBeNull();
    expect(rowTrack({ ...s, solved: ['t2'] }, def, 0)).toBe('t2');
    expect(rowTrack({ ...s, solved: ['t2'] }, def, 1)).toBeNull();
  });

  it('shows every row’s song once the game is over', () => {
    const over = revealAll({ ...s, solved: ['t2'] }, def, 'lost');
    expect([0, 1, 2].map((r) => rowTrack(over, def, r))).toEqual([
      't2',
      't0',
      't1',
    ]);
  });
});

describe('revealAll / finishedFromResult', () => {
  const def = makeDef();
  it('keeps found songs on their rows and fills the rest oldest first', () => {
    const s: GameState = {
      ...boardState([
        't0-0', 't2-0', 't0-1',
        't1-0', 't1-1', 't1-2',
        't2-1', 't2-2', 't0-2',
      ]), // prettier-ignore
      solved: ['t1'],
      links: ['t1-0>t1-1', 't1-1>t1-2'],
    };
    expect(rowsOf(revealAll(s, def), def)).toEqual([
      ['t0-0', 't0-1', 't0-2'],
      ['t1-0', 't1-1', 't1-2'],
      ['t2-0', 't2-1', 't2-2'],
    ]);
    // Nothing found yet: plain oldest-first.
    expect(
      rowsOf(revealAll(newGame(def, 3), def), def).map((r) => r[0])
    ).toEqual(['t0-0', 't1-0', 't2-0']);
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
    // A found song must sit whole on one row.
    expect(isValidState({ ...s, solved: ['t0'] }, def)).toBe(false);
    const built = {
      ...s,
      order: def.tracks.flatMap((t) => t.pieces.map((p) => p.id)),
    };
    expect(isValidState({ ...built, solved: ['t0', 't2'] }, def)).toBe(true);
    expect(isValidState(null, def)).toBe(false);
    expect(isValidState(s, makeDef(3, 4))).toBe(false);
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
        { marks: ['correct'], solved: false },
        { marks: ['miss'], solved: false },
        { marks: ['correct'], solved: true, trackId: 't0' },
        { marks: ['correct'], solved: false },
        { marks: ['correct'], solved: true, trackId: 't1' },
      ],
    };
    expect(shareText('Spliced #12', s, def, 'https://x.test')).toBe(
      'Spliced #12 · 1/4 mistakes · ⏱ 1:35\n🟩⬛🟩\n🟩🟩\nhttps://x.test'
    );
  });

  it('marks a named song on its line of the grid', () => {
    const s: GameState = {
      ...boardState([]),
      status: 'won',
      solved: ['t0', 't1'],
      named: { t0: true, t1: false },
      attempts: [
        { marks: ['correct'], solved: false },
        { marks: ['correct'], solved: true, trackId: 't0' },
        { marks: ['correct'], solved: false },
        { marks: ['correct'], solved: true, trackId: 't1' },
      ],
    };
    expect(shareText('S', s, def).split('\n').slice(1)).toEqual([
      '🟩🟩 🎵',
      '🟩🟩',
    ]);
  });

  it('marks a perfect solve and a loss', () => {
    const won = { ...boardState([]), status: 'won' as const };
    expect(shareText('S', won, def)).toMatch(/Perfect mix/);
    const lost = {
      ...boardState([]),
      status: 'lost' as const,
      mistakes: 4,
      solved: ['t0'],
    };
    expect(shareText('S', lost, def)).toBe('S · 1/2 songs · X/4');
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
      named: 0,
      attempts: run.attempts,
    });
  });

  it('still reads the old wrong-year mark as a finished song', () => {
    const code = encodeGhost(run, 2).replace(/s([0-9a-z]+)$/, 'e$1');
    expect(code).toContain('e');
    expect(decodeGhost(code)!.attempts.at(-1)).toMatchObject({ solved: true });
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

  it('ranks a win, then fewer mistakes, then names, then time', () => {
    const ghost = decodeGhost(encodeGhost(run, 1))!;
    expect(raceResult({ ...run, mistakes: 0 }, ghost)).toBeGreaterThan(0);
    expect(raceResult({ ...run, named: { t0: true } }, ghost)).toBeGreaterThan(
      0
    );
    // Old g1 links still decode (their listens count is ignored).
    expect(decodeGhost('g1.4h.w.zz.1.v.')).toMatchObject({ named: 0 });
    expect(raceResult({ ...run, elapsedMs: 200_000 }, ghost)).toBeLessThan(0);
    expect(raceResult({ ...run, status: 'lost' }, ghost)).toBeLessThan(0);
  });

  it('stamps splices with the play time', () => {
    const def = makeDef();
    const s = {
      ...boardState(def.tracks.flatMap((t) => t.pieces.map((p) => p.id))),
      elapsedMs: 12_345,
    };
    expect(spliceJoin(s, def, 't0-0', 't0-1').state.attempts[0].atMs).toBe(
      12_345
    );
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

  it('counts listens that live inside joins and channel plays', () => {
    const s = { ...boardState([]), heard: ['s:a>b', 'r:c,d', 'c:e'] };
    ['a', 'b', 'c', 'd', 'e'].forEach((id) =>
      expect(hasHeardClip(s, id)).toBe(true)
    );
    expect(hasHeardClip(s, 'f')).toBe(false);
  });

  it('sets par from the board size and keeps it out of the share', () => {
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
    expect(takesOf(s)).toBe(3);
    expect(shareText('S', s, def).split('\n')[0]).toBe('S · Perfect mix 🎚️');
  });
});

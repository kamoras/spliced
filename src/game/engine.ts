// Pure game engine for the mixer puzzle. Everything the board does — moving
// clips, locking in a row, running out of mistakes — is a function from one
// GameState to the next, so it is easy to test, persist, and restore.

import { buildMixerOrder, chunkTracks } from '../audio/puzzle.js';
import { formatDuration } from '../daily/storage.js';
import type { Clue } from '../types.js';

export type Mark = 'correct' | 'misplaced' | 'miss';
export type Status = 'playing' | 'won' | 'lost';

// One SPLICE press, kept for the share grid: a true join ('correct') or a
// wrong one ('miss').
export interface Attempt {
  marks: Mark[];
  // This splice completed a song.
  solved: boolean;
  // Active play time when this splice happened (drives the ghost race).
  atMs?: number;
  // Which row it was on (drives the consolation genre clue).
  row?: number;
  // The completed song sat on the wrong year's row (it moved home).
  era?: boolean;
  // The song this splice completed.
  trackId?: string;
}

export interface GameState {
  // Piece ids, row-major (row = floor(index / clipsPerTrack)). Fused clips
  // are always adjacent, in order, within a row.
  order: string[];
  // Track ids in the order they were completed (row r is always tracks[r]).
  solved: string[];
  mistakes: number;
  attempts: Attempt[];
  // Confirmed joins, "a>b": clip b follows clip a, and they move together.
  links?: string[];
  // Joins that turned out wrong, "a>b". Free to hear again; can't be spliced.
  bad?: string[];
  status: Status;
  elapsedMs: number;
  // Name-that-tune bonus: trackId -> named correctly? (absent = not answered).
  named?: Record<string, boolean>;
  // Every clip, seam and row arrangement you've listened to (see "Listens
  // + par" below). Replays of anything already heard are free.
  heard?: string[];
  // Played with the hard-mode mistake cap (recorded with the game).
  hard?: boolean;
}

// The minimal piece shape the engine needs.
export interface EnginePiece {
  id: string;
  trackId?: string;
  correctIndex: number;
}

export type { Clue } from '../types.js';

export interface PuzzleDef {
  clipsPerTrack: number;
  maxGuesses: number;
  // One entry per row, in row order: row r must become tracks[r], its
  // pieces listed in the right order.
  tracks: { id: string; pieces: EnginePiece[]; clue?: Clue }[];
}

export interface SpliceOutcome {
  // 'fused': a true join. 'wrong': not a join (a mistake). 'repeat': a join
  // already known to be wrong (free). 'ignored': not a legal splice.
  kind: 'fused' | 'wrong' | 'repeat' | 'ignored';
  // The song this splice completed, if it did.
  completed?: string;
  // The completed song sat on the wrong year's row and slid home.
  movedHome?: boolean;
  won: boolean;
  lost: boolean;
}

export const joinKey = (a: string, b: string): string => `${a}>${b}`;

function pieceMap(def: PuzzleDef): Map<string, EnginePiece> {
  const map = new Map<string, EnginePiece>();
  def.tracks.forEach((t) => t.pieces.forEach((p) => map.set(p.id, p)));
  return map;
}

export function newGame(def: PuzzleDef, seed?: number): GameState {
  return {
    order: buildMixerOrder(def.tracks, seed).map((p) => p.id),
    solved: [],
    mistakes: 0,
    attempts: [],
    status: 'playing',
    elapsedMs: 0,
  };
}

export function rowsOf(state: GameState, def: PuzzleDef): string[][] {
  return chunkTracks(state.order, def.clipsPerTrack);
}

export function isRowLocked(
  state: GameState,
  def: PuzzleDef,
  rowIndex: number
): boolean {
  if (state.status !== 'playing') return true;
  const id = def.tracks[rowIndex]?.id;
  return id != null && state.solved.includes(id);
}

export function isLinked(state: GameState, a: string, b: string): boolean {
  return Boolean(state.links?.includes(joinKey(a, b)));
}

export function isBadJoin(state: GameState, a: string, b: string): boolean {
  return Boolean(state.bad?.includes(joinKey(a, b)));
}

// The fused run a clip belongs to, in board order (just the clip if it isn't
// spliced to anything).
export function chainOf(
  state: GameState,
  def: PuzzleDef,
  id: string
): string[] {
  const i = state.order.indexOf(id);
  if (i < 0) return [];
  const cpt = def.clipsPerTrack;
  const row = Math.floor(i / cpt);
  let lo = i;
  while (
    lo > row * cpt &&
    isLinked(state, state.order[lo - 1], state.order[lo])
  ) {
    lo--;
  }
  let hi = i;
  while (
    hi < (row + 1) * cpt - 1 &&
    isLinked(state, state.order[hi], state.order[hi + 1])
  ) {
    hi++;
  }
  return state.order.slice(lo, hi + 1);
}

// Swap the contents of two unlocked rows (free, just rearranging).
export function swapRows(
  state: GameState,
  def: PuzzleDef,
  a: number,
  b: number
): GameState {
  if (a === b || isRowLocked(state, def, a) || isRowLocked(state, def, b)) {
    return state;
  }
  const rows = chunkTracks(state.order, def.clipsPerTrack);
  if (!rows[a] || !rows[b]) return state;
  [rows[a], rows[b]] = [rows[b], rows[a]];
  return { ...state, order: rows.flat() };
}

// What a row's clue shows right now: always the year; the genre too when the
// day has a year collision, or as a consolation after a wrong splice there.
export function clueFor(
  state: GameState,
  def: PuzzleDef,
  rowIndex: number
): { year?: number; genre?: string } {
  const clue = def.tracks[rowIndex]?.clue;
  if (!clue) return {};
  const missed = state.attempts.some(
    (a) => a.row === rowIndex && a.marks[0] === 'miss'
  );
  return {
    year: clue.year,
    genre: clue.showGenre || missed ? clue.genre : undefined,
  };
}

export function clueLabel(
  clue: { year?: number; genre?: string },
  rowIndex: number
): string {
  return clue.year ? String(clue.year) : `track ${rowIndex + 1}`;
}

// Move a clip (with everything it's spliced to) onto another spot. Within a
// row the run slides there and the clips in between shift over; across rows
// the two runs of equal length swap places (the target run is the clips
// starting at `toId`, nudged left so it fits, and it can't cut through a
// spliced run of its own). Rows stay full, joins stay joined.
export function moveClip(
  state: GameState,
  def: PuzzleDef,
  fromId: string,
  toId: string
): GameState {
  if (state.status !== 'playing' || fromId === toId) return state;
  const cpt = def.clipsPerTrack;
  const chain = chainOf(state, def, fromId);
  if (!chain.length || chain.includes(toId)) return state;
  const len = chain.length;
  const fromStart = state.order.indexOf(chain[0]);
  const to = state.order.indexOf(toId);
  if (to < 0) return state;
  const fromRow = Math.floor(fromStart / cpt);
  const toRow = Math.floor(to / cpt);
  if (isRowLocked(state, def, fromRow) || isRowLocked(state, def, toRow)) {
    return state;
  }
  const order = [...state.order];

  if (fromRow === toRow) {
    // Slide: lift the run out of the row and drop it back in at the target,
    // so that the target clip ends up just past (or before) the run.
    const row = order.slice(toRow * cpt, (toRow + 1) * cpt);
    const rest = row.filter((id) => !chain.includes(id));
    const localTo = rest.indexOf(toId);
    const localFrom = fromStart - toRow * cpt;
    // Moving right: land after the target clip; moving left: before it.
    const at = to > fromStart ? localTo + 1 : localTo;
    rest.splice(at, 0, ...chain);
    if (rest.indexOf(chain[0]) === localFrom) return state;
    order.splice(toRow * cpt, cpt, ...rest);
    return { ...state, order };
  }

  const start = Math.min(to, (toRow + 1) * cpt - len);
  if (start < toRow * cpt) return state;
  const target = order.slice(start, start + len);
  // A cut chain is not allowed.
  if (
    target.some((id) =>
      chainOf(state, def, id).some((member) => !target.includes(member))
    )
  ) {
    return state;
  }
  for (let k = 0; k < len; k++) {
    order[fromStart + k] = target[k];
    order[start + k] = chain[k];
  }
  return { ...state, order };
}

// Could this clip's run land on that spot? (For lighting the ⇄ targets.)
export function canMove(
  state: GameState,
  def: PuzzleDef,
  fromId: string,
  toId: string
): boolean {
  return moveClip(state, def, fromId, toId) !== state;
}

// SPLICE the join between two adjacent clips. A true join fuses them (they
// move together from now on); the fourth clip of a song completes it, and it
// locks onto its year's row (sliding home for free if it sat elsewhere). A
// wrong join spends a mistake. Running out of mistakes reveals everything.
export function spliceJoin(
  state: GameState,
  def: PuzzleDef,
  a: string,
  b: string
): { state: GameState; outcome: SpliceOutcome } {
  const none = (kind: SpliceOutcome['kind']) => ({
    state,
    outcome: { kind, won: false, lost: false },
  });
  if (state.status !== 'playing') return none('ignored');
  const cpt = def.clipsPerTrack;
  const i = state.order.indexOf(a);
  const row = Math.floor(i / cpt);
  if (i < 0 || state.order[i + 1] !== b || (i + 1) % cpt === 0) {
    return none('ignored');
  }
  if (isRowLocked(state, def, row) || isLinked(state, a, b)) {
    return none('ignored');
  }
  if (isBadJoin(state, a, b)) return none('repeat');

  const pieces = pieceMap(def);
  const pa = pieces.get(a);
  const pb = pieces.get(b);
  if (!pa || !pb) return none('ignored');
  const atMs = Math.round(state.elapsedMs);
  const key = joinKey(a, b);

  if (pa.trackId !== pb.trackId || pb.correctIndex !== pa.correctIndex + 1) {
    const mistakes = state.mistakes + 1;
    const lost = mistakes >= def.maxGuesses;
    const next: GameState = {
      ...state,
      mistakes,
      bad: [...(state.bad ?? []), key],
      attempts: [
        ...state.attempts,
        { marks: ['miss'], solved: false, atMs, row },
      ],
    };
    return {
      state: lost ? revealAll(next, def, 'lost') : next,
      outcome: { kind: 'wrong', won: false, lost },
    };
  }

  let next: GameState = { ...state, links: [...(state.links ?? []), key] };
  const chain = chainOf(next, def, a);
  const trackId = pa.trackId;
  const completed = chain.length === cpt && trackId != null;
  let movedHome = false;
  if (completed) {
    const home = def.tracks.findIndex((t) => t.id === trackId);
    if (home >= 0 && home !== row) {
      next = swapRows(next, def, row, home);
      movedHome = true;
    }
    next = { ...next, solved: [...next.solved, trackId] };
  }
  const won = next.solved.length === def.tracks.length;
  next = {
    ...next,
    attempts: [
      ...next.attempts,
      {
        marks: ['correct'],
        solved: completed,
        atMs,
        row,
        ...(movedHome ? { era: true } : {}),
        ...(completed ? { trackId } : {}),
      },
    ],
    status: won ? 'won' : 'playing',
  };
  return {
    state: next,
    outcome: {
      kind: 'fused',
      ...(completed ? { completed: trackId } : {}),
      movedHome,
      won,
      lost: false,
    },
  };
}

// Every true join on the board, for revealing a finished game fused.
function allLinks(def: PuzzleDef): string[] {
  return def.tracks.flatMap((t) =>
    t.pieces.slice(1).map((p, i) => joinKey(t.pieces[i].id, p.id))
  );
}

// End the game with every song shown in its own row, in order.
export function revealAll(
  state: GameState,
  def: PuzzleDef,
  status: Status = 'lost'
): GameState {
  const order = def.tracks.flatMap((t) => t.pieces.map((p) => p.id));
  return { ...state, order, links: allLinks(def), status };
}

// A finished board for a result saved before progress was persisted (or when
// progress was cleared): every song revealed, no attempt history.
export function finishedFromResult(
  def: PuzzleDef,
  result: { solved: boolean; mistakes?: number; elapsedMs?: number }
): GameState {
  const base: GameState = {
    order: [],
    solved: result.solved ? def.tracks.map((t) => t.id) : [],
    mistakes: result.mistakes ?? 0,
    attempts: [],
    status: result.solved ? 'won' : 'lost',
    elapsedMs: result.elapsedMs ?? 0,
    // The songs were already shown when this result was saved: no quiz.
    named: Object.fromEntries(def.tracks.map((t) => [t.id, false])),
  };
  return revealAll(base, def, base.status);
}

// Guard against stale or tampered saved state: it must describe exactly this
// puzzle's pieces, or we start fresh.
export function isValidState(state: unknown, def: PuzzleDef): boolean {
  if (!state || typeof state !== 'object') return false;
  const s = state as Partial<GameState>;
  if (!Array.isArray(s.order) || !Array.isArray(s.solved)) return false;
  if (!Array.isArray(s.attempts) || typeof s.mistakes !== 'number')
    return false;
  if (s.heard != null && !Array.isArray(s.heard)) return false;
  if (s.links != null && !Array.isArray(s.links)) return false;
  if (s.bad != null && !Array.isArray(s.bad)) return false;
  if (s.named != null && typeof s.named !== 'object') return false;
  if (s.status !== 'playing' && s.status !== 'won' && s.status !== 'lost') {
    return false;
  }
  const ids = def.tracks.flatMap((t) => t.pieces.map((p) => p.id));
  if (s.order.length !== ids.length) return false;
  const want = new Set(ids);
  if (!s.order.every((id) => want.delete(id)) || want.size) return false;
  const trackIds = new Set(def.tracks.map((t) => t.id));
  return s.solved.every((id) => trackIds.has(id));
}

// Record a name-that-tune answer for a locked song. One try per song.
export function nameTrack(
  state: GameState,
  trackId: string,
  correct: boolean
): GameState {
  if (!state.solved.includes(trackId) || state.named?.[trackId] != null) {
    return state;
  }
  return { ...state, named: { ...state.named, [trackId]: correct } };
}

export function namedCount(state: GameState): number {
  return Object.values(state.named ?? {}).filter(Boolean).length;
}

// Results headline + subline, by outcome.
export function headline(state: GameState): { title: string; sub: string } {
  if (state.status === 'lost') {
    return {
      title: 'Tape jam.',
      sub: 'Here’s what you were hearing. Back tomorrow!',
    };
  }
  return (
    [
      { title: 'Perfect mix!', sub: 'Not one bad splice.' },
      { title: 'One rough splice.', sub: 'Clean everywhere else.' },
      { title: 'Solid take.', sub: 'Every song found.' },
    ][state.mistakes] ?? {
      title: 'Saved in the final mix!',
      sub: 'Clutch! Every song found.',
    }
  );
}

// The Wordle-style share card: one emoji row per lock-in.
const EMOJI: Record<Mark, string> = {
  correct: '🟩',
  misplaced: '🟨',
  miss: '⬛',
};

// ---- Listens + par -------------------------------------------------------------
// Listening is never limited. A side stat for good ears counts "listens": each
// clip, join and channel order heard for the first time, plus each lock-in.
// Replays are free. It's shown after the game (and live on the display), but
// mistakes are the score.

export const seamKey = (a: string, b: string) => `s:${a}>${b}`;
export const rowPlayKey = (ids: string[]) => `r:${ids.join(',')}`;

export function hear(state: GameState, key: string): GameState {
  if (state.status !== 'playing' || state.heard?.includes(key)) return state;
  return { ...state, heard: [...(state.heard ?? []), key] };
}

export function hasHeard(state: GameState, key: string): boolean {
  return Boolean(state.heard?.includes(key));
}

// Has this clip sounded at all: on its own, in a join, or in a channel play?
export function hasHeardClip(state: GameState, id: string): boolean {
  return Boolean(
    state.heard?.some(
      (k) =>
        k === clipKey(id) ||
        (k.startsWith('s:') && k.slice(2).split('>').includes(id)) ||
        (k.startsWith('r:') && k.slice(2).split(',').includes(id))
    )
  );
}

// Listens: everything heard for the first time plus each LOCK.
export function takesOf(state: GameState): number {
  return (state.heard?.length ?? 0) + state.attempts.length;
}

// Every clip once, about one join per clip, a couple of channel plays and a
// lock per song.
export function parFor(def: PuzzleDef): number {
  return def.tracks.length * (2 * def.clipsPerTrack + 2);
}

export const clipKey = (id: string) => `c:${id}`;

// Was the takes count actually recorded? (A board rebuilt from a bare saved
// result has no history, so its takes would be meaningless.)
export function hasTakes(state: GameState): boolean {
  return state.attempts.length > 0;
}

// Golf-style, in words: "6 under par", "even par", "3 over par".
export function relToPar(takes: number, par: number): string {
  const d = takes - par;
  return d === 0 ? 'even par' : d < 0 ? `${-d} under par` : `${d} over par`;
}

// ---- Ghost race -------------------------------------------------------------
// A finished run, compact enough for a share URL. It carries only the *shape*
// of the run (marks, timings) — never clip or song identities — so it can't
// spoil the puzzle for the friend who opens it.

export interface Ghost {
  puzzle: number;
  won: boolean;
  elapsedMs: number;
  mistakes: number;
  // Songs named in the bonus (0 for links made before it counted).
  named: number;
  attempts: Attempt[];
}

const MARK_DIGIT: Record<Mark, string> = {
  miss: '0',
  misplaced: '1',
  correct: '2',
};
const DIGIT_MARK: Record<string, Mark> = {
  0: 'miss',
  1: 'misplaced',
  2: 'correct',
};
const ds36 = (ms: number) => Math.max(0, Math.round(ms / 100)).toString(36);

export function encodeGhost(state: GameState, puzzle: number): string {
  const attempts = state.attempts
    .map(
      (a) =>
        a.marks.map((m) => MARK_DIGIT[m]).join('') +
        (a.solved ? (a.era ? 'e' : 's') : 'x') +
        ds36(a.atMs ?? 0)
    )
    .join('_');
  return [
    'g2',
    puzzle.toString(36),
    state.status === 'won' ? 'w' : 'l',
    ds36(state.elapsedMs),
    state.mistakes,
    namedCount(state).toString(36),
    attempts,
  ].join('.');
}

export function decodeGhost(code: string | null | undefined): Ghost | null {
  if (!code || code.length > 400) return null;
  const parts = code.split('.');
  // g1 links carried a listens count in the fifth slot instead of names.
  if (parts.length !== 7 || (parts[0] !== 'g1' && parts[0] !== 'g2')) {
    return null;
  }
  const [v, p, w, t, m, l, att] = parts;
  const num = (v: string, radix = 36) =>
    /^[0-9a-z]+$/.test(v) ? parseInt(v, radix) : NaN;
  const puzzle = num(p);
  const elapsed = num(t);
  const mistakes = /^\d{1,2}$/.test(m) ? Number(m) : NaN;
  const named = v === 'g2' ? num(l) : 0;
  if (!Number.isFinite(num(l))) return null;
  if ([puzzle, elapsed, mistakes, named].some((n) => !Number.isFinite(n))) {
    return null;
  }
  if (w !== 'w' && w !== 'l') return null;
  const attempts: Attempt[] = [];
  for (const chunk of att ? att.split('_') : []) {
    const match = /^([012]{1,8})([sxe])([0-9a-z]+)$/.exec(chunk);
    if (!match) return null;
    const atMs = parseInt(match[3], 36) * 100;
    if (!Number.isFinite(atMs) || atMs > 24 * 3600 * 1000) return null;
    attempts.push({
      marks: [...match[1]].map((d) => DIGIT_MARK[d]),
      solved: match[2] !== 'x',
      ...(match[2] === 'e' ? { era: true } : {}),
      atMs,
    });
  }
  if (attempts.length > 20) return null;
  return {
    puzzle,
    won: w === 'w',
    elapsedMs: elapsed * 100,
    mistakes,
    named,
    attempts,
  };
}

// Compare a finished run against a ghost: a win beats a loss, then fewer
// mistakes, then more songs named, then the faster time. Positive = you beat
// them.
export function raceResult(state: GameState, ghost: Ghost): number {
  const won = state.status === 'won';
  if (won !== ghost.won) return won ? 1 : -1;
  if (state.mistakes !== ghost.mistakes) return ghost.mistakes - state.mistakes;
  if (namedCount(state) !== ghost.named) return namedCount(state) - ghost.named;
  return ghost.elapsedMs - state.elapsedMs;
}

export function shareText(
  title: string,
  state: GameState,
  def: PuzzleDef,
  url?: string,
  extra?: string
): string {
  const won = state.status === 'won';
  // One number up front: mistakes on a win, songs found on a loss.
  const score = won
    ? state.mistakes === 0
      ? 'Perfect mix 🎚️'
      : `${state.mistakes}/${def.maxGuesses} mistakes`
    : `${state.solved.length}/${def.tracks.length} songs · X/${def.maxGuesses}`;
  const time =
    won && state.elapsedMs ? ` · ⏱ ${formatDuration(state.elapsedMs)}` : '';
  // One line per song: its splices in order, 🟩 a true join, ⬛ a wrong one,
  // 🟦 the join that completed a song on the wrong year's row (it slid home),
  // and a 🎵 if you then named the song.
  const grid: string[] = [];
  let line = '';
  state.attempts.forEach((a) => {
    line += a.era ? '🟦' : a.marks.map((m) => EMOJI[m]).join('');
    if (a.solved) {
      grid.push(a.trackId && state.named?.[a.trackId] ? `${line} 🎵` : line);
      line = '';
    }
  });
  if (line) grid.push(line);
  return [`${title} · ${score}${time}`, ...grid, extra, url]
    .filter(Boolean)
    .join('\n');
}

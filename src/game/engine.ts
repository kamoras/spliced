// Pure game engine for the mixer puzzle. Everything the board does — moving
// clips, locking in a row, running out of mistakes — is a function from one
// GameState to the next, so it is easy to test, persist, and restore.

import { buildMixerOrder, chunkTracks } from '../audio/puzzle.js';
import { formatDuration } from '../daily/storage.js';
import type { Clue } from '../types.js';

export type Mark = 'correct' | 'misplaced' | 'miss';
export type Status = 'playing' | 'won' | 'lost';

// One "Lock in" press, kept for the share grid.
export interface Attempt {
  marks: Mark[];
  solved: boolean;
  // Active play time when this lock-in happened (drives the ghost race).
  atMs?: number;
  // Which row was locked in (drives the consolation genre clue).
  row?: number;
  // A whole song locked on the wrong year's row (it moved home).
  era?: boolean;
}

export interface GameState {
  // Piece ids, row-major (row = floor(index / clipsPerTrack)).
  order: string[];
  // Track ids in the order they were locked (row r is always tracks[r]).
  solved: string[];
  mistakes: number;
  attempts: Attempt[];
  // Every arrangement already checked (row key -> marks). Re-checking one is
  // free, and the board re-lights its marks whenever a row matches one again.
  tried: Record<string, Mark[]>;
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
  // One entry per row, in row order: row r must become tracks[r] — its
  // pieces listed in the right order.
  tracks: { id: string; pieces: EnginePiece[]; clue?: Clue }[];
}

export interface GradedOutcome {
  // 'wrongEra': a complete, in-order song — but it belongs to another row.
  kind: 'solved' | 'wrong' | 'wrongEra';
  marks: Mark[];
  // The song that locked (for 'solved' / 'wrongEra'), else the row's song.
  trackId: string | null;
  // Clips in this row from the row's song, and how many are in their slot.
  rightSong: number;
  inPlace: number;
  won: boolean;
  lost: boolean;
}

export type SubmitOutcome =
  { kind: 'ignored' } | { kind: 'repeat'; marks: Mark[] } | GradedOutcome;

// Tried arrangements are per row: the same clips grade differently on a
// different channel (each row has its own song).
export const rowKey = (row: number, ids: string[]): string =>
  `${row}:${ids.join('|')}`;

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
    tried: {},
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

// Swap the contents of two unlocked rows (free — just rearranging).
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
// day has a year collision, or as a consolation after a wrong lock-in there.
export function clueFor(
  state: GameState,
  def: PuzzleDef,
  rowIndex: number
): { year?: number; genre?: string } {
  const clue = def.tracks[rowIndex]?.clue;
  if (!clue) return {};
  const missed = state.attempts.some((a) => a.row === rowIndex && !a.solved);
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

// Swap two clips. Every move is a swap — within a row or across rows — so a
// move never disturbs any other clip, and any order is at most a few swaps
// away.
export function moveClip(
  state: GameState,
  def: PuzzleDef,
  fromId: string,
  toId: string
): GameState {
  if (state.status !== 'playing' || fromId === toId) return state;
  const from = state.order.indexOf(fromId);
  const to = state.order.indexOf(toId);
  if (from < 0 || to < 0) return state;
  const cpt = def.clipsPerTrack;
  const fromRow = Math.floor(from / cpt);
  const toRow = Math.floor(to / cpt);
  if (isRowLocked(state, def, fromRow) || isRowLocked(state, def, toRow)) {
    return state;
  }

  const order = [...state.order];
  [order[from], order[to]] = [order[to], order[from]];
  return { ...state, order };
}

// Grade a row against the song assigned to it: right song + right slot,
// right song + wrong slot, or a clip from another song.
export function gradeAssigned(
  rowIds: string[],
  trackId: string,
  pieces: Map<string, EnginePiece>
): { marks: Mark[]; rightSong: number; inPlace: number } {
  const marks: Mark[] = rowIds.map((id, slot) => {
    const p = pieces.get(id);
    if (p?.trackId !== trackId) return 'miss';
    return p.correctIndex === slot ? 'correct' : 'misplaced';
  });
  const inPlace = marks.filter((m) => m === 'correct').length;
  const rightSong = inPlace + marks.filter((m) => m === 'misplaced').length;
  return { marks, rightSong, inPlace };
}

// The track a row spells out completely and in order, if any.
function completeSong(
  rowIds: string[],
  pieces: Map<string, EnginePiece>
): string | null {
  const first = pieces.get(rowIds[0])?.trackId;
  if (!first) return null;
  return rowIds.every((id, slot) => {
    const p = pieces.get(id);
    return p?.trackId === first && p.correctIndex === slot;
  })
    ? first
    : null;
}

// Lock in one row: grade it against the row's song. Correct locks the song in
// place. Wrong spends a mistake — and if the row was a different song,
// complete and in order ("right song, wrong year"), that song locks too and
// slides into its own row. Running out of mistakes reveals everything.
export function submitRow(
  state: GameState,
  def: PuzzleDef,
  rowIndex: number
): { state: GameState; outcome: SubmitOutcome } {
  if (isRowLocked(state, def, rowIndex)) {
    return { state, outcome: { kind: 'ignored' } };
  }
  const cpt = def.clipsPerTrack;
  const rowIds = state.order.slice(rowIndex * cpt, rowIndex * cpt + cpt);
  if (rowIds.length !== cpt) return { state, outcome: { kind: 'ignored' } };

  const key = rowKey(rowIndex, rowIds);
  if (state.tried[key]) {
    return { state, outcome: { kind: 'repeat', marks: state.tried[key] } };
  }

  const pieces = pieceMap(def);
  const trackId = def.tracks[rowIndex].id;
  const grade = gradeAssigned(rowIds, trackId, pieces);
  const solved = grade.inPlace === cpt;
  const attempts = [
    ...state.attempts,
    {
      marks: grade.marks,
      solved,
      atMs: Math.round(state.elapsedMs),
      row: rowIndex,
    },
  ];
  const tried = { ...state.tried, [key]: grade.marks };

  if (solved) {
    const nextSolved = [...state.solved, trackId];
    const won = nextSolved.length === def.tracks.length;
    return {
      state: {
        ...state,
        solved: nextSolved,
        attempts,
        tried,
        status: won ? 'won' : 'playing',
      },
      outcome: { kind: 'solved', ...grade, trackId, won, lost: false },
    };
  }

  const other = completeSong(rowIds, pieces);
  const otherRow = def.tracks.findIndex((t) => t.id === other);
  const wrongEra =
    other != null && otherRow >= 0 && !state.solved.includes(other);
  // Right song, wrong year is progress, not a listening mistake: the song
  // locks and slides home for free. (Release years are a hint, not the test.)
  const mistakes = wrongEra ? state.mistakes : state.mistakes + 1;
  const lost = mistakes >= def.maxGuesses;
  let next: GameState = { ...state, mistakes, attempts, tried };
  let kind: GradedOutcome['kind'] = 'wrong';
  let outcomeTrack: string = trackId;

  if (wrongEra) {
    // Move it home and lock it.
    next = swapRows(next, def, rowIndex, otherRow);
    // If the song that came back from its row completes this one, it locks
    // too: no need to spend another lock-in on an already-correct row.
    const back = completeSong(
      next.order.slice(rowIndex * cpt, rowIndex * cpt + cpt),
      pieces
    );
    const alsoHere =
      back === trackId && !next.solved.includes(trackId) ? [trackId] : [];
    next = {
      ...next,
      solved: [...next.solved, other!, ...alsoHere],
      attempts: next.attempts.map((a, i) =>
        i === next.attempts.length - 1 ? { ...a, era: true } : a
      ),
    };
    kind = 'wrongEra';
    outcomeTrack = other;
    if (next.solved.length === def.tracks.length) {
      next = { ...next, status: 'won' };
    }
  }

  // Completing every song wins, even on the last mistake.
  const lostNow = lost && next.status !== 'won';
  return {
    state: lostNow ? revealAll(next, def, 'lost') : next,
    outcome: {
      kind,
      ...grade,
      trackId: outcomeTrack,
      won: next.status === 'won',
      lost: lostNow,
    },
  };
}

// End the game with every song shown in its own row, in order.
export function revealAll(
  state: GameState,
  def: PuzzleDef,
  status: Status = 'lost'
): GameState {
  const order = def.tracks.flatMap((t) => t.pieces.map((p) => p.id));
  return { ...state, order, status };
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
    tried: {},
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
  if (!s.tried || typeof s.tried !== 'object') return false;
  if (s.heard != null && !Array.isArray(s.heard)) return false;
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

// Short hint after a wrong lock-in, phrased around the row's clue ("1984").
export function wrongHint(
  outcome: Pick<GradedOutcome, 'rightSong' | 'inPlace'>,
  clipsPerTrack: number,
  label = 'this track'
): string {
  const { rightSong, inPlace } = outcome;
  if (rightSong === clipsPerTrack) {
    return inPlace === 0
      ? `All ${label}! Now find the order. Listen for the seams.`
      : `All ${label}! ${inPlace} in place. Fix the order.`;
  }
  if (rightSong === clipsPerTrack - 1) {
    return `So close! One clip isn’t from ${label}.`;
  }
  if (rightSong === 0) return `Nothing here is from ${label}.`;
  return `${rightSong} ${rightSong === 1 ? 'clip is' : 'clips are'} from ${label} (${inPlace} in place).`;
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
        (a.solved ? 's' : a.era ? 'e' : 'x') +
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
    const match = /^([012]{2,8})([sxe])([0-9a-z]+)$/.exec(chunk);
    if (!match) return null;
    const atMs = parseInt(match[3], 36) * 100;
    if (!Number.isFinite(atMs) || atMs > 24 * 3600 * 1000) return null;
    attempts.push({
      marks: [...match[1]].map((d) => DIGIT_MARK[d]),
      solved: match[2] === 's',
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
  // A right-song-wrong-year lock shows as 🟦 (the song still locked); a row
  // whose song you then named gets a 🎵.
  const grid = state.attempts.map((a) => {
    const cells = a.era
      ? a.marks.map(() => '🟦').join('')
      : a.marks.map((m) => EMOJI[m]).join('');
    const id = a.solved && a.row != null ? def.tracks[a.row]?.id : undefined;
    return id && state.named?.[id] ? `${cells} 🎵` : cells;
  });
  return [`${title} · ${score}${time}`, ...grid, extra, url]
    .filter(Boolean)
    .join('\n');
}

// Re-grade an arbitrary row (for lighting marks on the board).
export function triedMarks(
  state: GameState,
  row: number,
  rowIds: string[]
): Mark[] | null {
  return state.tried[rowKey(row, rowIds)] ?? null;
}

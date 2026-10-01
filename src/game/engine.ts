// Pure game engine for the mixer puzzle. Everything the board does — moving
// clips, locking in a row, running out of mistakes — is a function from one
// GameState to the next, so it is easy to test, persist, and restore.

import {
  buildMixerOrder,
  chunkTracks,
  gradeMixerRow,
} from '../audio/puzzle.js';
import { formatDuration } from '../daily/storage.js';

export type Mark = 'correct' | 'misplaced' | 'miss';
export type Status = 'playing' | 'won' | 'lost';

// One "Lock in" press, kept for the share grid.
export interface Attempt {
  marks: Mark[];
  solved: boolean;
}

export interface GameState {
  // Piece ids, row-major (row = floor(index / clipsPerTrack)).
  order: string[];
  // Track ids in the order they were locked. Locked songs float to the top,
  // so row i < solved.length is always the song solved[i].
  solved: string[];
  mistakes: number;
  attempts: Attempt[];
  // Every arrangement already checked (row key -> marks). Re-checking one is
  // free, and the board re-lights its marks whenever a row matches one again.
  tried: Record<string, Mark[]>;
  status: Status;
  elapsedMs: number;
}

// The minimal piece shape the engine needs.
export interface EnginePiece {
  id: string;
  trackId?: string;
  correctIndex: number;
}

export interface PuzzleDef {
  clipsPerTrack: number;
  maxGuesses: number;
  // Track ids in canonical order, each with its piece ids in the right order.
  tracks: { id: string; pieces: EnginePiece[] }[];
}

export interface GradedOutcome {
  kind: 'solved' | 'wrong';
  marks: Mark[];
  trackId: string | null;
  // Clips in this row from its majority song, and how many of those are
  // already in their slot.
  rightSong: number;
  inPlace: number;
  won: boolean;
  lost: boolean;
}

export type SubmitOutcome =
  { kind: 'ignored' } | { kind: 'repeat'; marks: Mark[] } | GradedOutcome;

export const rowKey = (ids: string[]): string => ids.join('|');

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

export function isRowLocked(state: GameState, rowIndex: number): boolean {
  return state.status !== 'playing' || rowIndex < state.solved.length;
}

// Drag `fromId` onto `toId`. Within a row the clip is pushed into the slot (a
// natural reorder); across rows the two clips swap, so dropping a clip never
// shoves an unrelated clip into a neighbouring row.
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
  if (isRowLocked(state, fromRow) || isRowLocked(state, toRow)) return state;

  const order = [...state.order];
  if (fromRow === toRow) {
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
  } else {
    [order[from], order[to]] = [order[to], order[from]];
  }
  return { ...state, order };
}

function marksFor(
  rowIds: string[],
  pieces: Map<string, EnginePiece>
): ReturnType<typeof gradeMixerRow> & { marks: Mark[] } {
  const grade = gradeMixerRow(rowIds.map((id) => pieces.get(id)!));
  const marks: Mark[] = grade.cells.map((c) =>
    c.correct ? 'correct' : c.sameTrack ? 'misplaced' : 'miss'
  );
  return { ...grade, marks };
}

// Lock in one row: grade it, then either lock the song (floating it to the
// top), or spend a mistake. Running out reveals every song.
export function submitRow(
  state: GameState,
  def: PuzzleDef,
  rowIndex: number
): { state: GameState; outcome: SubmitOutcome } {
  if (isRowLocked(state, rowIndex)) {
    return { state, outcome: { kind: 'ignored' } };
  }
  const cpt = def.clipsPerTrack;
  const rowIds = state.order.slice(rowIndex * cpt, rowIndex * cpt + cpt);
  if (rowIds.length !== cpt) return { state, outcome: { kind: 'ignored' } };

  const key = rowKey(rowIds);
  if (state.tried[key]) {
    return { state, outcome: { kind: 'repeat', marks: state.tried[key] } };
  }

  const pieces = pieceMap(def);
  const grade = marksFor(rowIds, pieces);
  const solved = grade.solved && grade.trackId != null;
  const attempts = [...state.attempts, { marks: grade.marks, solved }];
  const tried = { ...state.tried, [key]: grade.marks };

  if (solved) {
    // Float the locked row up beneath the previously locked ones.
    const rows = chunkTracks(state.order, cpt);
    const [row] = rows.splice(rowIndex, 1);
    rows.splice(state.solved.length, 0, row);
    const nextSolved = [...state.solved, grade.trackId!];
    const won = nextSolved.length === def.tracks.length;
    return {
      state: {
        ...state,
        order: rows.flat(),
        solved: nextSolved,
        attempts,
        tried,
        status: won ? 'won' : 'playing',
      },
      outcome: {
        kind: 'solved',
        marks: grade.marks,
        trackId: grade.trackId,
        rightSong: grade.rightRowCount,
        inPlace: grade.correctPositions,
        won,
        lost: false,
      },
    };
  }

  const mistakes = state.mistakes + 1;
  const lost = mistakes >= def.maxGuesses;
  const next: GameState = { ...state, mistakes, attempts, tried };
  return {
    state: lost ? revealAll(next, def, 'lost') : next,
    outcome: {
      kind: 'wrong',
      marks: grade.marks,
      trackId: grade.trackId,
      rightSong: grade.rightRowCount,
      inPlace: grade.correctPositions,
      won: false,
      lost,
    },
  };
}

// End the game with every song shown in order: the ones you locked stay on
// top, the rest follow in their canonical order.
export function revealAll(
  state: GameState,
  def: PuzzleDef,
  status: Status = 'lost'
): GameState {
  const byId = new Map(def.tracks.map((t) => [t.id, t]));
  const rest = def.tracks
    .map((t) => t.id)
    .filter((id) => !state.solved.includes(id));
  const order = [...state.solved, ...rest].flatMap((id) =>
    byId.get(id)!.pieces.map((p) => p.id)
  );
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

// Short hint after a wrong lock-in — the "one away" moment.
export function wrongHint(
  outcome: Pick<GradedOutcome, 'rightSong' | 'inPlace'>,
  clipsPerTrack: number
): string {
  const { rightSong, inPlace } = outcome;
  if (rightSong === clipsPerTrack) {
    return inPlace === 0
      ? 'All one song! Now find the order — listen for the seams.'
      : `All one song! ${inPlace} ${inPlace === 1 ? 'clip is' : 'clips are'} in place — fix the order.`;
  }
  if (rightSong === clipsPerTrack - 1) {
    return 'So close — one clip belongs to a different song.';
  }
  if (rightSong <= 1) {
    return 'Total mashup! No two clips here share a song.';
  }
  return `${rightSong} clips share a song (${inPlace} in place). Keep sorting.`;
}

const EMOJI: Record<Mark, string> = {
  correct: '🟩',
  misplaced: '🟨',
  miss: '⬛',
};

// The Wordle-style share card: one emoji row per lock-in.
export function shareText(
  title: string,
  state: GameState,
  def: PuzzleDef,
  url?: string
): string {
  const won = state.status === 'won';
  const score = won
    ? state.mistakes === 0
      ? 'Perfect mix 🎚️'
      : `${state.mistakes}/${def.maxGuesses} mistakes`
    : `X/${def.maxGuesses}`;
  const time =
    won && state.elapsedMs ? ` · ⏱ ${formatDuration(state.elapsedMs)}` : '';
  const grid = state.attempts.map((a) => a.marks.map((m) => EMOJI[m]).join(''));
  return [`${title} · ${score}${time}`, ...grid, url]
    .filter(Boolean)
    .join('\n');
}

// Re-grade an arbitrary row (for lighting marks on the board).
export function triedMarks(state: GameState, rowIds: string[]): Mark[] | null {
  return state.tried[rowKey(rowIds)] ?? null;
}

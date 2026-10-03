// Per-day result persistence + countdown helpers for the daily puzzle.

import type { GameResult } from '../types.js';
import type { GameState } from '../game/engine.js';
import { DAY_MS } from '../../shared/game.js';

const KEY = 'spliced:daily';
// v7: spliced joins instead of row locks; older saves describe a different
// game and don't apply.
const PROGRESS_KEY = 'spliced:progress:v7';
const PREFS_KEY = 'spliced:prefs';
const GHOST_KEY = 'spliced:ghost';

type ResultMap = Record<number, GameResult>;

// Parse a stored JSON object, ignoring anything that isn't a plain object.
function readObject<T extends object>(key: string): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : ({} as T);
  } catch {
    return {} as T;
  }
}

function readAll(): ResultMap {
  return readObject<ResultMap>(KEY);
}

export function getResult(puzzleNumber: number): GameResult | null {
  const r = readAll()[puzzleNumber];
  return r && typeof r === 'object' && typeof r.solved === 'boolean' ? r : null;
}

// Record the outcome for a given puzzle. Won't overwrite a prior solve with a
// later "revealed" (so a genuine solve always wins).
export function saveResult(
  puzzleNumber: number,
  result: GameResult
): GameResult {
  const all = readAll();
  const prev = all[puzzleNumber];
  // The first finished result for a puzzle is final.
  if (prev && typeof prev.solved === 'boolean') return prev;
  all[puzzleNumber] = { ...result, ts: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable — non-fatal */
  }
  return all[puzzleNumber];
}

// In-progress (and finished) board state per puzzle, so a refresh resumes the
// game exactly — including mistakes already spent. Only the latest few days
// are kept.
type ProgressMap = Record<number, GameState>;

function readProgress(): ProgressMap {
  return readObject<ProgressMap>(PROGRESS_KEY);
}

export function getProgress(puzzleNumber: number): GameState | null {
  return readProgress()[puzzleNumber] || null;
}

export function saveProgress(puzzleNumber: number, state: GameState): void {
  const all = readProgress();
  // Never reopen a finished game (e.g. from a second tab still playing).
  const prev = all[puzzleNumber];
  // A finished game is final: never reopen it, and never let a second tab's
  // different ending replace it.
  if (prev && prev.status !== 'playing' && state.status !== prev.status) {
    return;
  }
  all[puzzleNumber] = state;
  const keep = Object.keys(all)
    .map(Number)
    .sort((a, b) => b - a)
    .slice(0, 7);
  const trimmed: ProgressMap = {};
  keep.forEach((n) => (trimmed[n] = all[n]));
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(trimmed));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

// Small per-device preferences (sound effects, first-visit help).
export interface Prefs {
  sfx: boolean;
  seenHelp: boolean;
  // Master volume 0..1 and a mute that silences everything.
  volume: number;
  muted: boolean;
  // Optional name shown to friends who race your ghost.
  name?: string;
  // Hard mode: half the mistakes.
  hard: boolean;
  // The observance banner the player closed (its id), so it stays closed.
  obsDismissed?: string;
}

export function getPrefs(): Prefs {
  const defaults: Prefs = {
    sfx: true,
    seenHelp: false,
    volume: 0.85,
    muted: false,
    hard: false,
  };
  const raw = readObject<Partial<Prefs>>(PREFS_KEY);
  return {
    sfx: typeof raw.sfx === 'boolean' ? raw.sfx : defaults.sfx,
    seenHelp:
      typeof raw.seenHelp === 'boolean' ? raw.seenHelp : defaults.seenHelp,
    volume:
      typeof raw.volume === 'number' && raw.volume >= 0 && raw.volume <= 1
        ? raw.volume
        : defaults.volume,
    muted: typeof raw.muted === 'boolean' ? raw.muted : defaults.muted,
    hard: typeof raw.hard === 'boolean' ? raw.hard : defaults.hard,
    ...(typeof raw.name === 'string' ? { name: raw.name.slice(0, 16) } : {}),
    ...(typeof raw.obsDismissed === 'string'
      ? { obsDismissed: raw.obsDismissed }
      : {}),
  };
}

export function setPrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...getPrefs(), ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — keep for this session only */
  }
  return next;
}

export interface Stats {
  played: number;
  wins: number;
  winPct: number;
  perfect: number;
  currentStreak: number;
  maxStreak: number;
  // Wins by mistake count: distribution[k] = solves with k mistakes.
  distribution: number[];
  losses: number;
  // Songs found across every game, wins and losses alike.
  songsFound: number;
  hardWins: number;
}

// Aggregate play history into headline stats. `currentPuzzleNumber` anchors the
// active streak so it only counts when today's puzzle was solved.
export function computeStats(
  currentPuzzleNumber: number,
  maxGuesses = 4
): Stats {
  const all = readAll();
  const entries = Object.entries(all).map(([n, r]) => ({ n: Number(n), ...r }));
  const played = entries.length;
  const wins = entries.filter((e) => e.solved).length;
  const perfect = entries.filter(
    (e) => e.solved && (e.mistakes ?? 0) === 0
  ).length;
  const winPct = played ? Math.round((wins / played) * 100) : 0;

  const currentStreak = streakEndingAt(all, currentPuzzleNumber);

  // Max streak: the longest run ending on any solved day.
  let maxStreak = currentStreak;
  entries.forEach((e) => {
    if (e.solved) maxStreak = Math.max(maxStreak, streakEndingAt(all, e.n));
  });

  const distribution = Array.from({ length: maxGuesses }, () => 0);
  entries.forEach((e) => {
    if (!e.solved) return;
    const k = Math.min(maxGuesses - 1, Math.max(0, e.mistakes ?? 0));
    distribution[k]++;
  });

  return {
    played,
    wins,
    winPct,
    perfect,
    currentStreak,
    maxStreak,
    distribution,
    losses: played - wins,
    songsFound: entries.reduce(
      (n, e) => n + (e.solvedTracks ?? (e.solved ? 3 : 0)),
      0
    ),
    hardWins: entries.filter((e) => e.solved && e.hard).length,
  };
}

// Days a streak may skip: one missed day in any seven keeps it alive, so a
// day off doesn't wipe out a month. A loss always ends it. Archive plays
// (made after their day) don't count either way.
const FREEZE_WINDOW = 7;

// The streak as of puzzle `end` (walking back from it). If `end` itself is
// unplayed it isn't counted against you: yesterday's run still stands.
export function streakEndingAt(all: ResultMap, end: number): number {
  const played = (k: number) => all[k] && !all[k].late;
  let k = played(end) ? end : end - 1;
  let streak = 0;
  let lastFreeze: number | null = null;
  for (; k >= 0; k--) {
    const r = all[k];
    if (r && !r.late) {
      if (!r.solved) break;
      streak++;
      continue;
    }
    // A missed day: freeze it, unless one was already used this week. A
    // leading miss (yesterday, say) only counts if a solved day sits behind
    // it, so a lone old win can't carry a streak.
    const behind = all[k - 1];
    if (lastFreeze != null && lastFreeze - k < FREEZE_WINDOW) break;
    if (!streak && !(behind && behind.solved && !behind.late)) break;
    lastFreeze = k;
  }
  return streak;
}

// ms until the next UTC midnight (when the puzzle flips).
export function msUntilNextPuzzle(): number {
  return DAY_MS - (Date.now() % DAY_MS);
}

export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

// Solve time as m:ss (e.g. 2:05); hours roll into the minutes field.
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, '0');
  return `${m}:${sec}`;
}

// Streak as it stands right now: today's solve extends it, but an unplayed
// today doesn't break yesterday's run yet.
export function liveStreak(currentPuzzleNumber: number): number {
  return streakEndingAt(readAll(), currentPuzzleNumber);
}

// ---- Record Crate ------------------------------------------------------------
// Every song you've revealed, collected as a sleeve: a reason to come back and
// a ready-made discovery playlist.

const CRATE_KEY = 'spliced:crate';

export interface CrateEntry {
  title: string;
  artist: string;
  artwork?: string;
  previewUrl?: string;
  puzzle?: number;
  solved: boolean;
  named: boolean;
  practice?: boolean;
  ts: number;
}

export function getCrate(): CrateEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(CRATE_KEY) || '[]');
    return Array.isArray(list)
      ? list.filter(
          (e) =>
            e &&
            typeof e === 'object' &&
            typeof e.title === 'string' &&
            typeof e.artist === 'string'
        )
      : [];
  } catch {
    return [];
  }
}

const crateKey = (e: { title: string; artist: string }) =>
  `${e.title}\u0000${e.artist}`.toLowerCase();

// Add songs (newest first). A song already in the crate is upgraded, never
// downgraded: once solved or named, it stays that way.
export function addToCrate(entries: Omit<CrateEntry, 'ts'>[]): CrateEntry[] {
  const crate = getCrate();
  const byKey = new Map(crate.map((e) => [crateKey(e), e]));
  const added: CrateEntry[] = [];
  entries.forEach((entry) => {
    const prev = byKey.get(crateKey(entry));
    if (prev) {
      prev.solved = prev.solved || entry.solved;
      prev.named = prev.named || entry.named;
      if (prev.practice && !entry.practice) {
        prev.practice = false;
        prev.puzzle = entry.puzzle;
      }
    } else {
      const fresh = { ...entry, ts: Date.now() };
      byKey.set(crateKey(entry), fresh);
      added.push(fresh);
    }
  });
  const next = [...added, ...crate].slice(0, 2000);
  try {
    localStorage.setItem(CRATE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — non-fatal */
  }
  return next;
}

// The friend's ghost you're racing today, so a reload mid-game keeps the race.
export interface SavedGhost {
  code: string;
  name: string;
}

export function saveGhost(g: SavedGhost): void {
  try {
    localStorage.setItem(GHOST_KEY, JSON.stringify(g));
  } catch {
    /* storage unavailable: non-fatal */
  }
}

export function getGhost(): SavedGhost | null {
  const g = readObject<Partial<SavedGhost>>(GHOST_KEY);
  return typeof g.code === 'string' && typeof g.name === 'string'
    ? { code: g.code, name: g.name }
    : null;
}

// Per-day result persistence + countdown helpers for the daily puzzle.

import type { GameResult } from '../types.js';
import type { GameState } from '../game/engine.js';

const KEY = 'spliced:daily';
const PROGRESS_KEY = 'spliced:progress';
const PREFS_KEY = 'spliced:prefs';

type ResultMap = Record<number, GameResult>;

function readAll(): ResultMap {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function getResult(puzzleNumber: number): GameResult | null {
  return readAll()[puzzleNumber] || null;
}

// Record the outcome for a given puzzle. Won't overwrite a prior solve with a
// later "revealed" (so a genuine solve always wins).
export function saveResult(
  puzzleNumber: number,
  result: GameResult
): GameResult {
  const all = readAll();
  const prev = all[puzzleNumber];
  if (prev?.solved && !result.solved) return prev;
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
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function getProgress(puzzleNumber: number): GameState | null {
  return readProgress()[puzzleNumber] || null;
}

export function saveProgress(puzzleNumber: number, state: GameState): void {
  const all = readProgress();
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
  // Optional name shown to friends who race your ghost.
  name?: string;
}

export function getPrefs(): Prefs {
  const defaults: Prefs = { sfx: true, seenHelp: false };
  try {
    return {
      ...defaults,
      ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'),
    };
  } catch {
    return defaults;
  }
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

  // Current streak: consecutive solved days ending at the current puzzle.
  let currentStreak = 0;
  if (typeof currentPuzzleNumber === 'number') {
    for (let k = currentPuzzleNumber; all[k]?.solved; k--) currentStreak++;
  }

  // Max streak: longest run of consecutive solved puzzle numbers.
  const solvedNums = entries
    .filter((e) => e.solved)
    .map((e) => e.n)
    .sort((a, b) => a - b);
  let maxStreak = 0;
  let run = 0;
  let prev: number | null = null;
  for (const n of solvedNums) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    if (run > maxStreak) maxStreak = run;
    prev = n;
  }

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
  };
}

// ms until the next UTC midnight (when the puzzle flips).
export function msUntilNextPuzzle(): number {
  const now = Date.now();
  const DAY = 86400000;
  return DAY - (now % DAY);
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
  const all = readAll();
  let k = all[currentPuzzleNumber]?.solved
    ? currentPuzzleNumber
    : currentPuzzleNumber - 1;
  let streak = 0;
  for (; all[k]?.solved; k--) streak++;
  return streak;
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
    return Array.isArray(list) ? list : [];
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

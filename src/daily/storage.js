// Per-day result persistence + countdown helpers for the daily puzzle.

const KEY = 'spliced:daily';

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

export function getResult(puzzleNumber) {
  return readAll()[puzzleNumber] || null;
}

// Record the outcome for a given puzzle. Won't overwrite a prior solve with a
// later "revealed" (so a genuine solve always wins).
export function saveResult(puzzleNumber, result) {
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

// Aggregate play history into headline stats. `currentPuzzleNumber` anchors the
// active streak so it only counts when today's puzzle was solved.
export function computeStats(currentPuzzleNumber) {
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
  let prev = null;
  for (const n of solvedNums) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    if (run > maxStreak) maxStreak = run;
    prev = n;
  }

  return { played, wins, winPct, perfect, currentStreak, maxStreak };
}

// ms until the next UTC midnight (when the puzzle flips).
export function msUntilNextPuzzle() {
  const now = Date.now();
  const DAY = 86400000;
  return DAY - (now % DAY);
}

export function formatCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

// Solve time as m:ss (e.g. 2:05); hours roll into the minutes field.
export function formatDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, '0');
  return `${m}:${sec}`;
}

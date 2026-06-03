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

export function formatGuessGrid(grid = []) {
  return grid
    .map((row) =>
      (row || [])
        .filter((cell) => !cell.anchor)
        .map((cell) => {
          if (cell.correct) return '🟩';
          if (cell.sameTrack) return '🟨';
          return '⬛';
        })
        .join('')
    )
    .filter(Boolean)
    .join('\n');
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

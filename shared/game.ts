// Constants shared by the client, the serverless API and the scripts. One
// place, so the board the client draws and the puzzle the API serves can't
// drift apart.

export const DAY_MS = 86400000;

// The daily board: three songs, four clips each.
export const DAILY_TRACKS = 3;
export const DAILY_CLIPS_PER_TRACK = 4;
export const DAILY_PIECES = DAILY_TRACKS * DAILY_CLIPS_PER_TRACK;

// Wrong lock-ins before the tape jams. Hard mode halves it.
export const DAILY_GUESSES = 4;
export const HARD_GUESSES = 2;

// Puzzle #0's UTC day. Everything is dated from here.
export const LAUNCH_UTC = Date.UTC(2026, 0, 1); // 2026-01-01

export const puzzleNumberFor = (nowMs: number): number =>
  Math.max(0, Math.floor((nowMs - LAUNCH_UTC) / DAY_MS));
export const puzzleDate = (n: number): Date =>
  new Date(LAUNCH_UTC + n * DAY_MS);

// Client-side game defaults shared across modes.

// Wordle-style cap: how many "Check" attempts you get before the answer is
// revealed. The daily puzzle gets this value from the API (so it can be tuned
// server-side); Practice mode uses this constant directly.
export const MAX_GUESSES = 3;

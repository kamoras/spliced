// Pure helpers for arranging and grading puzzle pieces.

// Small, fast seeded PRNG. Same seed -> same sequence, in every browser.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledCopy(pieces, rand) {
  const order = [...pieces];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function anchorIndexFor(pieces, seed) {
  if (pieces.length === 0) return -1;
  const rand =
    typeof seed === 'number' ? mulberry32(seed + 0x9e3779b9) : Math.random;
  return Math.floor(rand() * pieces.length);
}

function markLocked(piece, locked) {
  return { ...piece, locked };
}

// Fisher-Yates shuffle that guarantees the result isn't already solved
// (and isn't the trivial single-piece case). Pass a seed for a deterministic,
// shareable scramble; omit it for a random one.
export function shufflePieces(pieces, seed) {
  if (pieces.length < 2) return [...pieces];

  const seeded = typeof seed === 'number';
  // For a fixed seed the scramble is deterministic, so nudge the seed until
  // it produces an unsolved arrangement rather than looping forever.
  let attempt = 0;
  let order;
  do {
    const rand = seeded ? mulberry32(seed + attempt) : Math.random;
    order = shuffledCopy(pieces, rand);
    attempt++;
  } while (isSolved(order));

  return order;
}

// Pick the clip to lock in place. Seeded puzzles choose the same locked slot
// for everyone; practice puzzles choose a fresh one.
export function getAnchorPiece(pieces, seed) {
  const anchorIndex = anchorIndexFor(pieces, seed);
  return (
    pieces.find((piece) => piece.correctIndex === anchorIndex) ||
    pieces[0] ||
    null
  );
}

// Build the playable puzzle order: one clip is locked in its correct position
// and all remaining clips are shuffled around it. The full arrangement is never
// already solved unless there are too few movable clips to scramble.
export function buildAnchoredOrder(pieces, seed) {
  const anchor = getAnchorPiece(pieces, seed);
  if (!anchor) return [];

  const lockedAnchor = markLocked(anchor, true);
  const movable = pieces
    .filter((piece) => piece.id !== anchor.id)
    .map((piece) => markLocked(piece, false));

  if (movable.length < 2) {
    return pieces.map((piece) =>
      piece.id === anchor.id ? lockedAnchor : markLocked(piece, false)
    );
  }

  const seeded = typeof seed === 'number';
  let attempt = 0;
  let order;
  do {
    const rand = seeded ? mulberry32(seed + attempt) : Math.random;
    const shuffled = shuffledCopy(movable, rand);
    order = Array.from({ length: pieces.length }, (_, idx) => {
      if (idx === anchor.correctIndex) return lockedAnchor;
      return shuffled.shift();
    });
    attempt++;
  } while (isSolved(order));

  return order;
}

// Solved when every piece sits at its correct index, in ascending order.
export function isSolved(order) {
  return order.every((piece, idx) => piece.correctIndex === idx);
}

// Per-slot grading for Wordle-style guess history.
export function gradeOrder(order) {
  return order.map((piece, idx) => ({
    id: piece.id,
    correct: piece.correctIndex === idx,
    anchor: Boolean(piece.locked),
  }));
}

// How many pieces are currently in their correct slot (for "close!" feedback).
export function countCorrect(order) {
  return order.reduce(
    (n, piece, idx) => (piece.correctIndex === idx ? n + 1 : n),
    0
  );
}

// Guesses remaining given attempts used and a cap (never negative).
export function guessesLeft(attempts, maxGuesses) {
  return Math.max(0, maxGuesses - attempts);
}

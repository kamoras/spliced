// Pure helpers for arranging and grading puzzle pieces.

// Small, fast seeded PRNG. Same seed → same sequence, in every browser.
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

// Fisher–Yates shuffle that guarantees the result isn't already solved
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

// The first clip stays fixed so players have a stable starting point in the
// random iTunes preview.
export function getAnchorPiece(pieces) {
  return pieces.find((piece) => piece.correctIndex === 0) || pieces[0] || null;
}

// Build the playable puzzle order: the first clip is locked in place and all
// remaining clips are shuffled. The full arrangement is never already solved
// unless there are too few movable clips to scramble.
export function buildAnchoredOrder(pieces, seed) {
  const anchor = getAnchorPiece(pieces);
  if (!anchor) return [];

  const movable = pieces.filter((piece) => piece.id !== anchor.id);
  if (movable.length < 2) return [anchor, ...movable];

  const seeded = typeof seed === 'number';
  let attempt = 0;
  let order;
  do {
    const rand = seeded ? mulberry32(seed + attempt) : Math.random;
    order = [anchor, ...shuffledCopy(movable, rand)];
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
    anchor: piece.correctIndex === 0,
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

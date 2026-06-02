// Pure helpers for arranging and grading mixer puzzle pieces.

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

// Fisher-Yates shuffle that guarantees the result is not already solved when
// the piece set is large enough to scramble. Pass a seed for deterministic play.
export function shufflePieces(pieces, seed) {
  if (pieces.length < 2) return [...pieces];

  const seeded = typeof seed === 'number';
  let attempt = 0;
  let order;
  do {
    const rand = seeded ? mulberry32(seed + attempt) : Math.random;
    order = shuffledCopy(pieces, rand);
    attempt++;
  } while (isSolved(order) && attempt < 200);

  return order;
}

// Solved when every piece sits at its correct index, in ascending order.
export function isSolved(order) {
  return order.every((piece, idx) => piece.correctIndex === idx);
}

export function chunkTracks(order, clipsPerTrack) {
  const rows = [];
  for (let i = 0; i < order.length; i += clipsPerTrack) {
    rows.push(order.slice(i, i + clipsPerTrack));
  }
  return rows;
}

export function buildMixerOrder(tracks, seed) {
  const pieces = tracks.flatMap((track) => track.pieces);
  if (pieces.length < 2) return [...pieces];

  const clipsPerTrack = tracks[0]?.pieces.length || 1;
  const seeded = typeof seed === 'number';
  let attempt = 0;
  let order;
  do {
    const rand = seeded ? mulberry32(seed + attempt) : Math.random;
    order = shuffledCopy(pieces, rand);
    attempt++;
  } while (
    isMixerSolved(chunkTracks(order, clipsPerTrack), tracks.length) &&
    attempt < 200
  );

  return order;
}

export function gradeMixerRow(row, solvedTrackIds = []) {
  const trackId = row[0]?.trackId ?? null;
  const alreadySolved = trackId ? solvedTrackIds.includes(trackId) : false;
  const cells = row.map((piece, idx) => {
    const sameTrack = Boolean(trackId) && piece.trackId === trackId;
    const correct = sameTrack && piece.correctIndex === idx;
    return {
      id: piece.id,
      correct,
      sameTrack: sameTrack && !correct,
    };
  });
  const correctPositions = cells.filter((cell) => cell.correct).length;
  const rightRowCount = cells.filter(
    (cell) => cell.correct || cell.sameTrack
  ).length;
  const solved =
    row.length > 0 && correctPositions === row.length && !alreadySolved;

  return {
    solved,
    trackId,
    sameTrack: rightRowCount === row.length && row.length > 0,
    correctPositions,
    rightRowCount,
    alreadySolved,
    cells,
  };
}

export function isMixerSolved(rows, trackCount) {
  const solvedTrackIds = [];
  for (const row of rows) {
    const grade = gradeMixerRow(row, solvedTrackIds);
    if (!grade.solved) continue;
    solvedTrackIds.push(grade.trackId);
  }
  return solvedTrackIds.length === trackCount;
}

import { describe, it, expect } from 'vitest';
import {
  mulberry32,
  shufflePieces,
  buildMixerOrder,
  chunkTracks,
  gradeMixerRow,
  isMixerSolved,
  isSolved,
} from './puzzle.js';

const makePieces = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, correctIndex: i }));

const makeTrackPieces = (trackId, n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${trackId}-${i}`,
    trackId,
    correctIndex: i,
  }));

const makeTracks = (trackIds = ['a', 'b', 'c', 'd'], clipsPerTrack = 4) =>
  trackIds.map((trackId) => ({
    id: trackId,
    pieces: makeTrackPieces(trackId, clipsPerTrack),
  }));

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    const seqA = [a(), a(), a()];
    expect(seqA).toEqual([b(), b(), b()]);
    seqA.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    });
  });

  it('produces different streams for different seeds', () => {
    expect(mulberry32(1)()).not.toEqual(mulberry32(2)());
  });
});

describe('shufflePieces', () => {
  it('is deterministic for a fixed seed', () => {
    const pieces = makePieces(6);
    expect(shufflePieces(pieces, 42).map((p) => p.id)).toEqual(
      shufflePieces(pieces, 42).map((p) => p.id)
    );
  });

  it('never returns an already-solved arrangement', () => {
    const pieces = makePieces(6);
    for (let seed = 0; seed < 200; seed++) {
      expect(isSolved(shufflePieces(pieces, seed))).toBe(false);
    }
  });

  it('returns a copy for the trivial 1-piece case', () => {
    const pieces = makePieces(1);
    const out = shufflePieces(pieces, 1);
    expect(out).toEqual(pieces);
    expect(out).not.toBe(pieces);
  });

  it('preserves the full set of pieces', () => {
    const pieces = makePieces(6);
    expect(
      shufflePieces(pieces, 7)
        .map((p) => p.id)
        .sort()
    ).toEqual(pieces.map((p) => p.id).sort());
  });
});

describe('buildMixerOrder', () => {
  it('scrambles all clips deterministically for a fixed seed', () => {
    const tracks = makeTracks();
    const first = buildMixerOrder(tracks, 42);
    const second = buildMixerOrder(tracks, 42);

    expect(first.map((p) => p.id)).toEqual(second.map((p) => p.id));
    expect(first.map((p) => p.id).sort()).toEqual(
      tracks
        .flatMap((track) => track.pieces)
        .map((p) => p.id)
        .sort()
    );
  });

  it('does not start with every track already solved', () => {
    const tracks = makeTracks();
    for (let seed = 0; seed < 200; seed++) {
      expect(
        isMixerSolved(chunkTracks(buildMixerOrder(tracks, seed), 4), 4)
      ).toBe(false);
    }
  });
});

describe('multi-track mixer helpers', () => {
  it('chunks a flat board into track rows', () => {
    const pieces = [...makeTrackPieces('a', 4), ...makeTrackPieces('b', 4)];
    expect(chunkTracks(pieces, 4).map((row) => row.map((p) => p.id))).toEqual([
      ['a-0', 'a-1', 'a-2', 'a-3'],
      ['b-0', 'b-1', 'b-2', 'b-3'],
    ]);
  });

  it('uses the first clip as the submitted row target', () => {
    const a = makeTrackPieces('a', 4);
    const b = makeTrackPieces('b', 4);
    const grade = gradeMixerRow([a[1], a[0], b[1], a[3]]);

    expect(grade).toMatchObject({
      solved: false,
      trackId: 'a',
      sameTrack: false,
      correctPositions: 1,
      rightRowCount: 3,
    });
    expect(grade.cells).toEqual([
      { id: 'a-1', correct: false, sameTrack: true },
      { id: 'a-0', correct: false, sameTrack: true },
      { id: 'b-1', correct: false, sameTrack: false },
      { id: 'a-3', correct: true, sameTrack: false },
    ]);
  });

  it('solves any physical row that contains one complete track in order', () => {
    expect(gradeMixerRow(makeTrackPieces('b', 4))).toMatchObject({
      solved: true,
      sameTrack: true,
      trackId: 'b',
      correctPositions: 4,
      rightRowCount: 4,
    });
  });

  it('does not let the same song solve multiple rows', () => {
    expect(gradeMixerRow(makeTrackPieces('a', 4), ['a'])).toMatchObject({
      solved: false,
      alreadySolved: true,
    });
  });

  it('detects when every mystery track has one solved row regardless of row order', () => {
    expect(
      isMixerSolved(
        [
          makeTrackPieces('b', 4),
          makeTrackPieces('a', 4),
          makeTrackPieces('c', 4),
        ],
        3
      )
    ).toBe(true);
    expect(
      isMixerSolved(
        [
          makeTrackPieces('a', 4),
          makeTrackPieces('b', 4),
          makeTrackPieces('b', 4),
        ],
        3
      )
    ).toBe(false);
  });
});

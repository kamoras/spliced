import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../shared/prng.js';
import {
  shufflePieces,
  buildMixerOrder,
  chunkTracks,
  anyRowSolved,
  isSolved,
} from './puzzle.js';

const makePieces = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, correctIndex: i }));

const makeTrackPieces = (trackId: string, n: number) =>
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
      expect(anyRowSolved(buildMixerOrder(tracks, seed), tracks, 4)).toBe(
        false
      );
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

  it('never hands out a row that is already its own song', () => {
    const tracks = [
      { pieces: makeTrackPieces('a', 3) },
      { pieces: makeTrackPieces('b', 3) },
    ];
    expect(
      anyRowSolved(
        tracks.flatMap((t) => t.pieces),
        tracks,
        3
      )
    ).toBe(true);
    const order = [...tracks[1].pieces, ...tracks[0].pieces];
    expect(anyRowSolved(order, tracks, 3)).toBe(false);
  });
});

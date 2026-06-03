import { describe, it, expect } from 'vitest';
import { computePeaks, samplePieces } from './slicer.js';

// Minimal stand-in for an AudioBuffer's single channel.
function fakeBuffer(samples, sampleRate = 8) {
  return { sampleRate, getChannelData: () => Float32Array.from(samples) };
}

function cut(seed, opts = {}) {
  return samplePieces({
    buffer: fakeBuffer(new Array(64).fill(0.4)),
    trackId: 't',
    trackIndex: 0,
    duration: 30,
    clipsPerTrack: 4,
    seed,
    clipSeconds: 2.4,
    ...opts,
  });
}

describe('computePeaks', () => {
  it('returns `bars` values in [0,1], normalized to the loudest bar', () => {
    const data = [0, 0.2, -0.5, 0.1, 1.0, -0.3, 0.25, 0.4];
    const peaks = computePeaks(fakeBuffer(data), 0, 1, 4);
    expect(peaks).toHaveLength(4);
    peaks.forEach((p) => {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    });
    expect(Math.max(...peaks)).toBeCloseTo(1, 5);
  });

  it('handles a silent slice without producing NaN', () => {
    const peaks = computePeaks(fakeBuffer([0, 0, 0, 0]), 0, 1, 2);
    expect(peaks).toHaveLength(2);
    peaks.forEach((p) => expect(Number.isNaN(p)).toBe(false));
  });
});

describe('samplePieces', () => {
  it('cuts contiguous, back-to-back clips in correct order', () => {
    const pieces = cut(1);
    expect(pieces).toHaveLength(4);
    pieces.forEach((p, i) => expect(p.correctIndex).toBe(i));
    for (let i = 1; i < pieces.length; i++) {
      // Each clip starts exactly where the previous one ended — no gaps.
      expect(pieces[i].offset - pieces[i - 1].offset).toBeCloseTo(
        pieces[0].duration,
        5
      );
    }
  });

  it('keeps every clip inside the track', () => {
    cut(7).forEach((p) => {
      expect(p.offset).toBeGreaterThanOrEqual(0);
      expect(p.offset + p.duration).toBeLessThanOrEqual(30 + 1e-9);
    });
  });

  it('is deterministic for a given seed', () => {
    const a = cut(42).map((p) => p.offset);
    const b = cut(42).map((p) => p.offset);
    expect(a).toEqual(b);
  });
});

import { describe, it, expect } from 'vitest';
import { beatsPerClip, computePeaks, samplePieces } from './slicer.js';

// Minimal stand-in for an AudioBuffer's single channel.
function fakeBuffer(samples: number[], sampleRate = 8): AudioBuffer {
  return {
    sampleRate,
    getChannelData: () => Float32Array.from(samples),
  } as unknown as AudioBuffer;
}

function cut(
  seed: number,
  opts: Partial<Parameters<typeof samplePieces>[0]> = {}
) {
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

describe('beat-aligned cutting', () => {
  it('picks about a bar per clip, doubling/halving for extreme tempos', () => {
    expect(beatsPerClip(120)).toBe(4); // 2.0s
    expect(beatsPerClip(200)).toBe(8); // 2.4s (tempo found at double speed)
    expect(beatsPerClip(61)).toBe(2); // 1.97s (half speed)
  });

  it('cuts whole-beat clips that start on the beat grid', () => {
    const bpm = 120;
    const period = 0.5;
    const pieces = cut(7, { beat: { bpm, offset: 0.137 } });
    pieces.forEach((p, i) => {
      expect(p.duration).toBeCloseTo(4 * period, 6);
      // Start lies on the grid: (offset - 0.137) is a whole number of beats.
      const beats = (p.offset - 0.137) / period;
      expect(Math.abs(beats - Math.round(beats))).toBeLessThan(1e-6);
      if (i > 0) {
        expect(p.offset).toBeCloseTo(pieces[i - 1].offset + p.duration, 6);
      }
    });
    // Deterministic for a seed.
    expect(
      cut(7, { beat: { bpm, offset: 0.137 } }).map((p) => p.offset)
    ).toEqual(pieces.map((p) => p.offset));
  });

  it('keeps the clips inside the audible window when it fits', () => {
    for (let seed = 0; seed < 20; seed++) {
      const pieces = cut(seed, {
        beat: { bpm: 120, offset: 0 },
        audible: [6, 24],
      });
      expect(pieces[0].offset).toBeGreaterThanOrEqual(6);
      const last = pieces[pieces.length - 1];
      expect(last.offset + last.duration).toBeLessThanOrEqual(24 + 1e-6);
    }
    // Too narrow a window to hold four clips: the whole preview is used.
    const wide = cut(3, { beat: { bpm: 120, offset: 0 }, audible: [10, 14] });
    expect(wide[0].offset).toBeLessThan(10 + 8);
  });

  it('falls back to fixed cuts when the grid would not fit', () => {
    const pieces = cut(3, { duration: 5, beat: { bpm: 60, offset: 0 } });
    expect(pieces[0].duration).toBeCloseTo(5 / 4, 6);
  });
});

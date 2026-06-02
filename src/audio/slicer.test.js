import { describe, it, expect } from 'vitest';
import { computePeaks } from './slicer.js';

// Minimal stand-in for an AudioBuffer's single channel.
function fakeBuffer(samples, sampleRate = 8) {
  return { sampleRate, getChannelData: () => Float32Array.from(samples) };
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

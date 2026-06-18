// Loads Apple preview clips and prepares waveform-backed puzzle samples.

import { mulberry32 } from '../../api/_prng.js';
import type { Piece, Track, TrackDef } from '../types.js';

let _ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!_ctx) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    _ctx = new Ctx();
  }
  return _ctx;
}

async function decodePreview(
  previewUrl: string
): Promise<{ buffer: AudioBuffer; duration: number }> {
  const ctx = getAudioContext();
  const proxied = `/api/audio?url=${encodeURIComponent(previewUrl)}`;

  const resp = await fetch(proxied);
  if (!resp.ok) throw new Error('Could not load the audio preview.');

  const arrayBuffer = await resp.arrayBuffer();
  const buffer = await ctx.decodeAudioData(arrayBuffer);
  return { buffer, duration: buffer.duration };
}

// Downsample a slice of the waveform into `bars` normalized peak amplitudes.
export function computePeaks(
  buffer: AudioBuffer,
  offset: number,
  duration: number,
  bars: number
): number[] {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const start = Math.floor(offset * sampleRate);
  const length = Math.floor(duration * sampleRate);
  const per = Math.max(1, Math.floor(length / bars));

  const peaks: number[] = [];
  for (let b = 0; b < bars; b++) {
    let max = 0;
    const s = start + b * per;
    for (let j = 0; j < per; j++) {
      const v = Math.abs(data[s + j] || 0);
      if (v > max) max = v;
    }
    peaks.push(max);
  }

  const ceiling = Math.max(...peaks, 0.0001);
  return peaks.map((p) => p / ceiling);
}

export async function loadAndSampleTracks(
  trackDefs: TrackDef[],
  clipsPerTrack: number,
  { seed = 0, clipSeconds = 2.4 }: { seed?: number; clipSeconds?: number } = {}
): Promise<Track[]> {
  return Promise.all(
    trackDefs.map(async (track, trackIndex) => {
      const trackId = track.id || `track-${trackIndex}`;
      const { buffer, duration } = await decodePreview(track.previewUrl);
      const pieces = samplePieces({
        buffer,
        trackId,
        trackIndex,
        duration,
        clipsPerTrack,
        seed: seed + trackIndex * 101,
        clipSeconds,
      });

      return {
        ...track,
        id: trackId,
        buffer,
        duration,
        pieces,
      };
    })
  );
}

// Offsets snap to this grid (seconds) so a tiny difference in a preview's
// decoded length can't shift where clips are cut — the layout stays identical
// for everyone playing the same seed.
const OFFSET_STEP = 0.05;
const snap = (t: number) => Math.round(t / OFFSET_STEP) * OFFSET_STEP;

interface SampleArgs {
  buffer: AudioBuffer;
  trackId: string;
  trackIndex: number;
  duration: number;
  clipsPerTrack: number;
  seed: number;
  clipSeconds: number;
}

/**
 * Cut `clipsPerTrack` contiguous, back-to-back clips from one track. Because the
 * clips are consecutive, the correct order reconstructs a continuous passage and
 * any wrong order leaves an audible seam. A seeded start point keeps the window
 * from always being the intro while staying identical for a given seed.
 */
export function samplePieces({
  buffer,
  trackId,
  trackIndex,
  duration,
  clipsPerTrack,
  seed,
  clipSeconds,
}: SampleArgs): Piece[] {
  const clipDuration = Math.min(clipSeconds, duration / clipsPerTrack);
  const span = clipDuration * clipsPerTrack;
  const slack = Math.max(0, duration - span);
  const start = snap(slack * mulberry32(seed)());
  const maxOffset = Math.max(0, duration - clipDuration);

  return Array.from({ length: clipsPerTrack }, (_, i) => {
    const offset = snap(Math.min(maxOffset, start + i * clipDuration));
    return {
      id: `${trackId}-piece-${i}`,
      trackId,
      trackIndex,
      correctIndex: i,
      offset,
      duration: clipDuration,
      buffer,
      peaks: computePeaks(buffer, offset, clipDuration, 56),
    };
  });
}

export { loadAndSampleTracks as loadAndSliceTracks };

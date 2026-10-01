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
    // iOS mutes Web Audio under the ring/silent switch unless the page asks for
    // "playback" audio (Safari 17+). Harmless elsewhere.
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) {
      try {
        nav.audioSession.type = 'playback';
      } catch {
        /* unsupported */
      }
    }
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
  let buffer: AudioBuffer;
  try {
    buffer = await ctx.decodeAudioData(arrayBuffer);
  } catch {
    throw new Error(
      'This browser couldn’t decode the song previews (AAC). Try Chrome, Safari, Firefox, or Edge.'
    );
  }
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
  {
    seed = 0,
    clipSeconds = 2.4,
    onProgress,
  }: {
    seed?: number;
    clipSeconds?: number;
    // Called with the number of tracks decoded so far.
    onProgress?: (loaded: number) => void;
  } = {}
): Promise<Track[]> {
  let loaded = 0;
  return Promise.all(
    trackDefs.map(async (track, trackIndex) => {
      const trackId = track.id || `track-${trackIndex}`;
      const { buffer, duration } = await decodePreview(track.previewUrl);
      onProgress?.(++loaded);
      const pieces = samplePieces({
        buffer,
        trackId,
        trackIndex,
        duration,
        clipsPerTrack,
        seed: seed + trackIndex * 101,
        clipSeconds,
        beat: track.beat,
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
  // The song's beat grid (bpm + time of a beat), when analysed.
  beat?: { bpm: number; offset: number };
}

// How many beats one clip spans: about a bar (4 beats) when that's a
// comfortable length, else 8 or 2 (fast or slow tempos, or a tempo found at
// double/half speed), else whatever lands closest to ~2.4s.
export function beatsPerClip(bpm: number): number {
  const period = 60 / bpm;
  for (const n of [4, 8, 2, 6, 3]) {
    const d = n * period;
    if (d >= 1.8 && d <= 3.2) return n;
  }
  return Math.max(1, Math.round(2.4 / period));
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
  beat,
}: SampleArgs): Piece[] {
  // On the beat: every clip is a whole number of beats and starts on a beat,
  // so any join keeps the groove; only melody and harmony give a wrong
  // order away.
  if (beat && beat.bpm > 0) {
    const period = 60 / beat.bpm;
    const clipDuration = beatsPerClip(beat.bpm) * period;
    const span = clipDuration * clipsPerTrack;
    const first = beat.offset % period;
    // Use a nominal length (half-second steps, at most 29s) so a few ms of
    // decoder difference between browsers can't change the window, and so
    // the seeded start beat — everyone's puzzle.
    const nominal = Math.min(29, Math.floor(duration * 2) / 2);
    const lastStartBeat = Math.floor((nominal - span - first) / period);
    if (lastStartBeat >= 0) {
      const k = Math.floor(mulberry32(seed)() * (lastStartBeat + 1));
      const start = first + k * period;
      return Array.from({ length: clipsPerTrack }, (_, i) => {
        const offset = start + i * clipDuration;
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
  }

  // Snap the clip length too, so snapped offsets stay exactly back-to-back.
  const clipDuration = Math.max(
    OFFSET_STEP,
    Math.floor(Math.min(clipSeconds, duration / clipsPerTrack) / OFFSET_STEP) *
      OFFSET_STEP
  );
  const span = clipDuration * clipsPerTrack;
  const slack = Math.max(0, duration - span);
  // Round down so the last clip never runs past the end of the buffer.
  const start =
    Math.floor((slack * mulberry32(seed)()) / OFFSET_STEP) * OFFSET_STEP;

  return Array.from({ length: clipsPerTrack }, (_, i) => {
    const offset = snap(start + i * clipDuration);
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

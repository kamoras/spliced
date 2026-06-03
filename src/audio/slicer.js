// Loads Apple preview clips and prepares waveform-backed puzzle samples.

let _ctx = null;

export function getAudioContext() {
  if (!_ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    _ctx = new Ctx();
  }
  return _ctx;
}

// Browsers start the AudioContext "suspended" until a user gesture.
export async function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();
  return ctx;
}

async function decodePreview(previewUrl) {
  const ctx = getAudioContext();
  const proxied = `/api/audio?url=${encodeURIComponent(previewUrl)}`;

  const resp = await fetch(proxied);
  if (!resp.ok) throw new Error('Could not load the audio preview.');

  const arrayBuffer = await resp.arrayBuffer();
  const buffer = await ctx.decodeAudioData(arrayBuffer);
  return { buffer, duration: buffer.duration };
}

/**
 * Fetch the preview (via our CORS proxy), decode it, and cut it into
 * `numPieces` equal slices. Kept for utility/tests; the main game uses
 * spaced samples from several tracks.
 *
 * @returns {{ buffer: AudioBuffer, pieces: Piece[], duration: number }}
 */
export async function loadAndSlice(previewUrl, numPieces) {
  const { buffer, duration } = await decodePreview(previewUrl);

  const pieceDuration = duration / numPieces;
  const pieces = [];
  for (let i = 0; i < numPieces; i++) {
    const offset = i * pieceDuration;
    pieces.push({
      id: `piece-${i}`,
      correctIndex: i,
      offset,
      duration: pieceDuration,
      peaks: computePeaks(buffer, offset, pieceDuration, 56),
    });
  }

  return { buffer, pieces, duration };
}

// Downsample a slice of the waveform into `bars` normalized peak amplitudes.
export function computePeaks(buffer, offset, duration, bars) {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const start = Math.floor(offset * sampleRate);
  const length = Math.floor(duration * sampleRate);
  const per = Math.max(1, Math.floor(length / bars));

  const peaks = [];
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
  trackDefs,
  clipsPerTrack,
  { seed = 0, clipSeconds = 2.4 } = {}
) {
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
const snap = (t) => Math.round(t / OFFSET_STEP) * OFFSET_STEP;

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
}) {
  const clipDuration = Math.min(clipSeconds, duration / clipsPerTrack);
  const span = clipDuration * clipsPerTrack;
  const slack = Math.max(0, duration - span);
  const start = snap(slack * seededRand(seed)());
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

function seededRand(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { loadAndSampleTracks as loadAndSliceTracks };

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
  { seed = 0, clipSeconds = 2.4, minGapSeconds = 2.2 } = {}
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
        minGapSeconds,
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

function samplePieces({
  buffer,
  trackId,
  trackIndex,
  duration,
  clipsPerTrack,
  seed,
  clipSeconds,
  minGapSeconds,
}) {
  const clipDuration = Math.min(clipSeconds, duration / (clipsPerTrack * 2.2));
  const availableGap = Math.max(0, duration - clipsPerTrack * clipDuration);
  const minimumGap = Math.min(
    minGapSeconds,
    availableGap / Math.max(1, clipsPerTrack)
  );
  const fixedGapTotal = minimumGap * Math.max(0, clipsPerTrack - 1);
  const freeSpace = Math.max(0, availableGap - fixedGapTotal);
  const extras = distributeSpace(freeSpace, clipsPerTrack + 1, seed);

  let offset = extras[0] || 0;
  return Array.from({ length: clipsPerTrack }, (_, i) => {
    const safeOffset = Math.min(Math.max(0, duration - clipDuration), offset);
    offset += clipDuration + minimumGap + (extras[i + 1] || 0);
    return {
      id: `${trackId}-piece-${i}`,
      trackId,
      trackIndex,
      correctIndex: i,
      offset: safeOffset,
      duration: clipDuration,
      buffer,
      peaks: computePeaks(buffer, safeOffset, clipDuration, 56),
    };
  });
}

function distributeSpace(total, buckets, seed) {
  if (total <= 0 || buckets <= 0)
    return Array.from({ length: buckets }, () => 0);
  const rand = seededRand(seed);
  const weights = Array.from({ length: buckets }, () => 0.2 + rand());
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  return weights.map((weight) => (weight / sum) * total);
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

// Loads an Apple preview clip and slices it into N equal-length pieces.

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

/**
 * Fetch the preview (via our CORS proxy), decode it, and cut it into
 * `numPieces` equal slices. Each piece carries its correct position and a
 * small set of normalized peaks for a waveform thumbnail.
 *
 * @returns {{ buffer: AudioBuffer, pieces: Piece[], duration: number }}
 */
export async function loadAndSlice(previewUrl, numPieces) {
  const ctx = getAudioContext();
  const proxied = `/api/audio?url=${encodeURIComponent(previewUrl)}`;

  const resp = await fetch(proxied);
  if (!resp.ok) throw new Error('Could not load the audio preview.');

  const arrayBuffer = await resp.arrayBuffer();
  const buffer = await ctx.decodeAudioData(arrayBuffer);

  const pieceDuration = buffer.duration / numPieces;
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

  return { buffer, pieces, duration: buffer.duration };
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

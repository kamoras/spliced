// Beat analysis for the pinned catalog. For each song's 30s preview, estimate
// its tempo and the time of a beat, and store them in api/_catalog.json as
// `bpm`, `beat` (seconds) and `beatConf` (0..1). The client then cuts clips a
// whole number of beats long, starting on a beat, so a wrong join never
// stumbles rhythmically: ordering becomes a musical judgement (melody,
// harmony, lyrics) instead of spotting a glitch.
//
// Done once at build time (not in the browser) so every player gets the exact
// same cut points. Needs ffmpeg on PATH to decode AAC.
//
//   npm run beats:catalog            # analyse songs missing beat data
//   npm run beats:catalog -- --all   # re-analyse everything

import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { CatalogEntry } from '../api/_types.js';

const SR = 22050;
const HOP = 256; // ~11.6ms per onset frame
const FPS = SR / HOP;

// Decode compressed audio bytes to mono float PCM via ffmpeg.
function decode(bytes: Uint8Array): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      'pipe:0',
      '-ac',
      '1',
      '-ar',
      String(SR),
      '-f',
      'f32le',
      'pipe:1',
    ]);
    const chunks: Buffer[] = [];
    ff.stdout.on('data', (c: Buffer) => chunks.push(c));
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited ${code}`));
      const buf = Buffer.concat(chunks);
      resolve(
        new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4))
      );
    });
    ff.stdin.on('error', () => {});
    ff.stdin.end(Buffer.from(bytes));
  });
}

// In-place radix-2 FFT (re/im arrays, length a power of two).
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

// Onset strength via log-magnitude spectral flux (rectified rises across
// frequency bins), with a moving local mean removed.
export function onsetEnvelope(x: Float32Array): Float32Array {
  const N = 1024;
  const n = Math.max(0, Math.floor((x.length - N) / HOP));
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const bins = N / 2;
  // Up to ~8 kHz; most rhythmic energy lives below.
  const maxBin = Math.floor((8000 / SR) * N);
  let prev = new Float64Array(bins);
  const env = new Float32Array(n);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let f = 0; f < n; f++) {
    for (let i = 0; i < N; i++) {
      re[i] = x[f * HOP + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    const mag = new Float64Array(bins);
    let flux = 0;
    for (let k = 1; k < maxBin; k++) {
      mag[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
      const d = mag[k] - prev[k];
      if (d > 0 && f > 0) flux += d;
    }
    env[f] = flux;
    prev = mag;
  }
  const w = Math.round(0.4 * FPS);
  const out = new Float32Array(n);
  let sum = 0;
  for (let f = 0; f < n; f++) {
    sum += env[f];
    if (f >= w) sum -= env[f - w];
    out[f] = Math.max(0, env[f] - sum / Math.min(f + 1, w));
  }
  return out;
}

// Average onset strength sampled on a beat grid (fractional frame period).
function comb(env: Float32Array, period: number, phase: number): number {
  let s = 0;
  let k = 0;
  for (let t = phase; t < env.length - 1; t += period) {
    const i = Math.floor(t);
    const f = t - i;
    s += env[i] * (1 - f) + env[i + 1] * f;
    k++;
  }
  return k ? s / k : 0;
}

function bestPhase(env: Float32Array, period: number) {
  let best = 0;
  let score = -1;
  for (let p = 0; p < period; p += 0.5) {
    const c = comb(env, period, p);
    if (c > score) {
      score = c;
      best = p;
    }
  }
  return { phase: best, score };
}

export interface BeatInfo {
  bpm: number;
  beat: number;
  beatConf: number;
}

export function analyse(x: Float32Array): BeatInfo {
  const env = onsetEnvelope(x);
  const n = env.length;
  let mean = 0;
  for (const v of env) mean += v;
  mean /= n;
  let sd = 0;
  for (const v of env) sd += (v - mean) ** 2;
  sd = Math.sqrt(sd / n) || 1;

  // Autocorrelation over 60-200 BPM with a gentle prior around 115 BPM.
  const minLag = Math.floor((60 / 200) * FPS);
  const maxLag = Math.ceil((60 / 60) * FPS);
  const ac = new Float64Array(4 * maxLag + 4);
  for (let lag = 1; lag < ac.length && lag < n; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += (env[i] - mean) * (env[i + lag] - mean);
    ac[lag] = s / (n - lag);
  }
  let bestLag = minLag;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * FPS) / lag;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 115) / 1.0) ** 2);
    // Harmonic enhancement: a true beat period is also periodic at 2x and 4x
    // (bars), which suppresses the 3/2 and 2/3 'triplet' traps.
    const score =
      (ac[lag] + 0.5 * (ac[2 * lag] ?? 0) + 0.25 * (ac[4 * lag] ?? 0)) * prior;
    if (ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1] && score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  // Parabolic interpolation for a sub-frame period.
  const [a, b, c] = [ac[bestLag - 1], ac[bestLag], ac[bestLag + 1]];
  const denom = a - 2 * b + c;
  let period = bestLag + (denom ? (0.5 * (a - c)) / denom : 0);

  // Refine: the period that best lines a beat grid up with onsets across the
  // whole preview (tiny errors would accumulate across joins).
  let best = bestPhase(env, period);
  for (let p = period * 0.985; p <= period * 1.015; p += period * 0.0005) {
    const cand = bestPhase(env, p);
    if (cand.score > best.score) {
      best = cand;
      period = p;
    }
  }
  const { phase, score } = best;
  const conf = Math.max(0, Math.min(1, (score - mean) / (3 * sd)));
  const periodS = period / FPS;
  // Report the first beat at or after 0.
  let beat = (phase * HOP) / SR;
  while (beat - periodS >= 0) beat -= periodS;
  return {
    bpm: Math.round((60 / periodS) * 100) / 100,
    beat: Math.round(beat * 1000) / 1000,
    beatConf: Math.round(conf * 100) / 100,
  };
}

async function main() {
  const file = fileURLToPath(new URL('../api/_catalog.json', import.meta.url));
  const catalog = JSON.parse(await readFile(file, 'utf8')) as CatalogEntry[];
  const all = process.argv.includes('--all');
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
  const todo = catalog.filter(
    (e) =>
      (all || e.bpm == null) &&
      (!only || only.split(',').includes(String(e.trackId)))
  );
  console.log(`analysing ${todo.length} of ${catalog.length} songs…`);
  let done = 0;
  const worker = async () => {
    for (let e = todo.shift(); e; e = todo.shift()) {
      try {
        const r = await fetch(e.previewUrl);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const pcm = await decode(new Uint8Array(await r.arrayBuffer()));
        Object.assign(e, analyse(pcm));
      } catch (err) {
        console.warn(`skip ${e.title}: ${String(err)}`);
      }
      if (++done % 50 === 0) {
        console.log(`${done} done`);
        await writeFile(file, `${JSON.stringify(catalog, null, 2)}\n`);
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  await writeFile(file, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log('wrote beat data');
}

if (/beats\.ts$/.test(process.argv[1] ?? '')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

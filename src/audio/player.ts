// Plays individual pieces or a full arrangement from a single decoded buffer.

import type { Piece } from '../types.js';
import { kickMeter } from './meter.js';

const DEFAULT_VOLUME = 0.85;

function clampVolume(value: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, numeric));
}

interface ActiveClip {
  pieceId: string;
  startedAt: number;
  duration: number;
  fromFraction: number;
}

export class Player {
  private ctx: AudioContext;
  private buffer: AudioBuffer | null;
  private output: GainNode;
  // Sources feed a per-take "deck" gain, so a tape-stop can fade the take out
  // without touching the master volume.
  private deck: GainNode;
  private analyser: AnalyserNode;
  private _timeData: Uint8Array<ArrayBuffer>;
  private sources: AudioBufferSourceNode[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  // Bumped on every stop/new playback so stale highlight callbacks no-op.
  private token = 0;
  // Tracks the single clip currently playing so the UI can draw a playhead.
  private _clip: ActiveClip | null = null;

  constructor(ctx: AudioContext, buffer: AudioBuffer | null = null) {
    this.ctx = ctx;
    this.buffer = buffer;
    this.output = ctx.createGain();
    // Tap the master bus with an analyser so the UI can render live VU meters.
    // Graph: sources -> output(gain) -> analyser -> destination.
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.5;
    this._timeData = new Uint8Array(this.analyser.fftSize);
    this.output.connect(this.analyser);
    this.deck = ctx.createGain();
    this.deck.connect(this.output);
    this.analyser.connect(ctx.destination);
    this.setVolume(DEFAULT_VOLUME);
  }

  // Fraction (0..1) through the currently playing clip, or null when that clip
  // isn't the one playing. Used to position the waveform playhead.
  getClipProgress(pieceId: string): number | null {
    const clip = this._clip;
    if (!clip || clip.pieceId !== pieceId) return null;
    const elapsed = this.ctx.currentTime - clip.startedAt;
    return Math.min(
      1,
      Math.max(0, clip.fromFraction + elapsed / clip.duration)
    );
  }

  // Current output loudness as a 0..1 level (RMS of the master bus, scaled so
  // typical music roughly fills the meter). Returns 0 when nothing is playing.
  getLevel(): number {
    if (this.sources.length === 0) return 0;
    this.analyser.getByteTimeDomainData(this._timeData);
    let sum = 0;
    for (let i = 0; i < this._timeData.length; i++) {
      const v = (this._timeData[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this._timeData.length);
    return Math.min(1, rms * 2.6);
  }

  setVolume(value: number): void {
    const volume = clampVolume(value);
    this.output.gain.setValueAtTime(volume, this.ctx.currentTime);
  }

  // Stop everything. With `tapeStop`, the take winds down like a tape
  // machine (pitch drop + fade over ~250ms) instead of cutting dead.
  stop(tapeStop = false): void {
    if (tapeStop && this.sources.length) {
      const now = this.ctx.currentTime;
      const old = this.deck;
      this.sources.forEach((s) => {
        try {
          s.onended = null;
          s.playbackRate.setValueAtTime(s.playbackRate.value, now);
          s.playbackRate.linearRampToValueAtTime(0.3, now + 0.25);
          s.stop(now + 0.26);
        } catch {
          /* already stopped */
        }
      });
      old.gain.setValueAtTime(old.gain.value, now);
      old.gain.linearRampToValueAtTime(0, now + 0.25);
      this.deck = this.ctx.createGain();
      this.deck.connect(this.output);
      this.sources = [];
    }
    this.token++;
    this.sources.forEach((s) => {
      try {
        s.onended = null;
        s.stop();
      } catch {
        /* already stopped */
      }
    });
    this.timers.forEach((t) => clearTimeout(t));
    this.sources = [];
    this.timers = [];
    this._clip = null;
  }

  private async _resume(): Promise<void> {
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    // Something is about to play: make sure the meters are running.
    setTimeout(kickMeter, 80);
  }

  private _bufferFor(piece: Piece): AudioBuffer | null {
    return piece.buffer || this.buffer;
  }

  // Play a single piece, optionally starting partway through (`fromFraction` in
  // 0..1, for scrubbing). `onEnd` fires when it finishes naturally.
  async playPiece(
    piece: Piece,
    onEnd?: () => void,
    fromFraction = 0
  ): Promise<void> {
    await this._resume();
    this.stop();
    const myToken = this.token;

    const from = Math.min(0.999, Math.max(0, fromFraction));
    const startOffset = piece.offset + from * piece.duration;
    const playLength = piece.duration * (1 - from);

    const src = this.ctx.createBufferSource();
    src.buffer = this._bufferFor(piece);
    src.connect(this.deck);
    src.onended = () => {
      if (myToken === this.token) {
        this._clip = null;
        onEnd?.();
      }
    };
    src.start(0, startOffset, playLength);
    this.sources.push(src);
    this._clip = {
      pieceId: piece.id,
      startedAt: this.ctx.currentTime,
      duration: piece.duration,
      fromFraction: from,
    };
  }

  /**
   * Play an ordered list of pieces back-to-back, gaplessly. `onPiece(idx)`
   * fires as each piece begins; `onEnd()` fires when the sequence finishes.
   */
  async playSequence(
    pieces: Piece[],
    {
      onPiece,
      onEnd,
      delay = 0,
      tapeStart = false,
    }: {
      onPiece?: (idx: number) => void;
      onEnd?: () => void;
      // Seconds to wait before the first clip (e.g. to let a chime ring).
      delay?: number;
      // Spin the first clip up from slightly slow, like a tape machine.
      tapeStart?: boolean;
    } = {}
  ): Promise<void> {
    await this._resume();
    this.stop();
    const myToken = this.token;

    const startAt = this.ctx.currentTime + 0.06 + delay;
    let t = startAt;

    pieces.forEach((p, idx) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this._bufferFor(p);
      src.connect(this.deck);
      if (tapeStart && idx === 0) {
        src.playbackRate.setValueAtTime(0.85, t);
        src.playbackRate.linearRampToValueAtTime(1, t + 0.12);
      }
      src.start(t, p.offset, p.duration);
      this.sources.push(src);

      const delayMs = Math.max(0, (t - this.ctx.currentTime) * 1000);
      this.timers.push(
        setTimeout(() => {
          if (myToken === this.token) onPiece?.(idx);
        }, delayMs)
      );

      // Remember which clip is sounding so its waveform can draw a playhead.
      this.timers.push(
        setTimeout(() => {
          if (myToken !== this.token) return;
          this._clip = {
            pieceId: p.id,
            startedAt: this.ctx.currentTime,
            duration: p.duration,
            fromFraction: 0,
          };
        }, delayMs)
      );

      t += p.duration;
    });

    const totalMs = Math.max(0, (t - this.ctx.currentTime) * 1000);
    this.timers.push(
      setTimeout(() => {
        if (myToken === this.token) onEnd?.();
      }, totalMs)
    );
  }

  /**
   * Play the join between two clips: the tail of `a` straight into the head of
   * `b`. Clips are cut back-to-back, so a true neighbour sounds seamless and a
   * wrong one jolts. `onEnd` fires when the seam finishes.
   */
  async playSeam(
    a: Piece,
    b: Piece,
    onEnd?: () => void,
    span = 0.7
  ): Promise<void> {
    await this._resume();
    this.stop();
    const myToken = this.token;
    const len = Math.min(span, a.duration, b.duration);
    const t0 = this.ctx.currentTime + 0.04;
    const parts: [Piece, number, number][] = [
      [a, a.offset + a.duration - len, t0],
      [b, b.offset, t0 + len],
    ];
    parts.forEach(([piece, offset, at], i) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this._bufferFor(piece);
      // Tiny fades at the outer edges only, so the join itself is untouched.
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(i === 0 ? 0 : 1, at);
      if (i === 0) env.gain.linearRampToValueAtTime(1, at + 0.03);
      else {
        env.gain.setValueAtTime(1, at + len - 0.04);
        env.gain.linearRampToValueAtTime(0, at + len);
      }
      src.connect(env).connect(this.deck);
      src.start(at, offset, len);
      this.sources.push(src);
    });
    this.timers.push(
      setTimeout(
        () => {
          if (myToken === this.token) {
            this.sources = [];
            onEnd?.();
          }
        },
        (t0 + 2 * len - this.ctx.currentTime) * 1000
      )
    );
  }
}

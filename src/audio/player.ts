// Plays individual pieces or a full arrangement from a single decoded buffer.

import type { Piece } from '../types.js';

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

  stop(): void {
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
    src.connect(this.output);
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
    }: {
      onPiece?: (idx: number) => void;
      onEnd?: () => void;
      // Seconds to wait before the first clip (e.g. to let a chime ring).
      delay?: number;
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
      src.connect(this.output);
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

  // Short synthesized cues, so a lock-in *feels* like something. They bypass
  // the analyser (no VU flicker) but follow the master volume.
  async sfx(kind: 'lock' | 'wrong' | 'win' | 'pick'): Promise<void> {
    await this._resume();
    const now = this.ctx.currentTime + 0.01;
    const notes: [
      freq: number,
      at: number,
      len: number,
      type: OscillatorType,
    ][] =
      kind === 'lock'
        ? [
            [659.25, 0, 0.16, 'triangle'],
            [880, 0.08, 0.16, 'triangle'],
            [1318.5, 0.16, 0.28, 'triangle'],
          ]
        : kind === 'win'
          ? [
              [523.25, 0, 0.18, 'triangle'],
              [659.25, 0.1, 0.18, 'triangle'],
              [783.99, 0.2, 0.18, 'triangle'],
              [1046.5, 0.3, 0.6, 'triangle'],
              [1318.5, 0.3, 0.6, 'sine'],
            ]
          : kind === 'wrong'
            ? [
                [196, 0, 0.14, 'square'],
                [155.56, 0.12, 0.22, 'square'],
              ]
            : [[1200, 0, 0.05, 'sine']];
    const peak = kind === 'wrong' ? 0.07 : kind === 'pick' ? 0.05 : 0.14;
    const bus = this.ctx.createGain();
    bus.gain.value = this.output.gain.value;
    bus.connect(this.ctx.destination);
    notes.forEach(([freq, at, len, type]) => {
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      env.gain.setValueAtTime(0, now + at);
      env.gain.linearRampToValueAtTime(peak, now + at + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, now + at + len);
      osc.connect(env).connect(bus);
      osc.start(now + at);
      osc.stop(now + at + len + 0.05);
    });
  }
}

// Plays individual pieces or a full arrangement from a single decoded buffer.

import type { Piece } from '../types.js';
import { kickMeter } from './meter.js';

const DEFAULT_VOLUME = 0.85;
// Crossfade at every join (and fade at outer edges), in seconds. Joins
// overlap by exactly this much with complementary linear ramps, so a correct
// join reproduces the original samples exactly and a wrong one can't click.
const XF = 0.003;

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
  // Bumped on every stop/new playback so stale callbacks (and plays still
  // waiting on the context to resume) no-op.
  private token = 0;
  // Tracks the clip currently sounding so the UI can draw a playhead.
  private _clip: ActiveClip | null = null;
  // Context time when the scheduled audio ends (keeps the meters awake).
  private busyUntil = 0;
  private lastState: AudioContextState;
  // Called when the context can't start (or is interrupted mid-take), so the
  // UI can drop its "playing" state; no other callback will fire.
  onHalt: (() => void) | null = null;
  private disposed = false;

  // An interruption (phone call, Siri, lock screen) freezes the context while
  // wall-clock timers keep firing: end the take so audio and UI stay in step.
  private _onState = () => {
    const was = this.lastState;
    this.lastState = this.ctx.state;
    if (was === 'running' && this.ctx.state !== 'running' && this.isActive()) {
      this.stop();
      this.onHalt?.();
    }
  };

  constructor(ctx: AudioContext, buffer: AudioBuffer | null = null) {
    this.ctx = ctx;
    this.buffer = buffer;
    this.output = ctx.createGain();
    // Tap the master bus with an analyser so the UI can render live VU meters.
    // Graph: sources -> clip gains -> deck -> output -> analyser -> out.
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.5;
    this._timeData = new Uint8Array(this.analyser.fftSize);
    this.output.connect(this.analyser);
    this.deck = ctx.createGain();
    this.deck.connect(this.output);
    this.analyser.connect(ctx.destination);
    this.output.gain.value = DEFAULT_VOLUME;
    this.lastState = ctx.state;
    ctx.addEventListener('statechange', this._onState);
  }

  private isActive(): boolean {
    return this.sources.length > 0 || this.timers.length > 0;
  }

  // Fraction (0..1) through the currently playing clip, or null when that clip
  // isn't the one playing. Used to position the waveform playhead.
  getClipProgress(pieceId: string): number | null {
    const clip = this._clip;
    if (!clip || clip.pieceId !== pieceId) return null;
    const elapsed = this.ctx.currentTime - clip.startedAt;
    if (elapsed < 0) return clip.fromFraction;
    return Math.min(
      1,
      Math.max(0, clip.fromFraction + elapsed / clip.duration)
    );
  }

  // Current output loudness as a 0..1 level (RMS of the master bus, scaled so
  // typical music roughly fills the meter). Returns 0 when nothing is playing.
  getLevel(): number {
    if (!this.isBusy()) return 0;
    this.analyser.getByteTimeDomainData(this._timeData);
    let sum = 0;
    for (let i = 0; i < this._timeData.length; i++) {
      const v = (this._timeData[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this._timeData.length);
    return Math.min(1, rms * 2.6);
  }

  // Is scheduled audio still to come (or sounding)?
  isBusy(): boolean {
    // A suspended or interrupted context freezes currentTime: nothing sounds.
    return (
      this.ctx.state === 'running' && this.ctx.currentTime < this.busyUntil
    );
  }

  setVolume(value: number): void {
    // Glide rather than step, so moving the slider never zippers.
    this.output.gain.setTargetAtTime(
      clampVolume(value),
      this.ctx.currentTime,
      0.015
    );
  }

  // Stop everything. With `tapeStop`, the take winds down like a tape
  // machine (pitch drop + fade over ~250ms); otherwise it fades out over a
  // few milliseconds so a cut never clicks.
  stop(tapeStop = false): void {
    this.token++;
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
    this._clip = null;
    this.busyUntil = 0;
    if (!this.sources.length) return;
    const now = this.ctx.currentTime;
    const tail = tapeStop ? 0.25 : 0.008;
    const old = this.deck;
    this.sources.forEach((s) => {
      try {
        s.onended = null;
        if (tapeStop) {
          s.playbackRate.setValueAtTime(s.playbackRate.value, now);
          s.playbackRate.linearRampToValueAtTime(0.3, now + tail);
        }
        s.stop(now + tail + 0.01);
      } catch {
        /* already stopped */
      }
    });
    old.gain.cancelScheduledValues(now);
    old.gain.setValueAtTime(old.gain.value, now);
    old.gain.linearRampToValueAtTime(0, now + tail);
    setTimeout(() => old.disconnect(), (tail + 0.15) * 1000);
    this.deck = this.ctx.createGain();
    this.deck.connect(this.output);
    this.sources = [];
    // Keep the meters moving while the wind-down is audible.
    if (tapeStop) this.busyUntil = now + tail;
  }

  // Detach from the speakers (the board unmounted) so the graph can be
  // collected. Reattaches on the next play, which keeps React's dev-mode
  // double mount working.
  dispose(): void {
    this.stop();
    if (this.disposed) return;
    this.disposed = true;
    this.ctx.removeEventListener('statechange', this._onState);
    const analyser = this.analyser;
    setTimeout(() => this.disposed && analyser.disconnect(), 200);
  }

  private _attach(): void {
    if (!this.disposed) return;
    this.disposed = false;
    this.analyser.disconnect();
    this.analyser.connect(this.ctx.destination);
    this.ctx.addEventListener('statechange', this._onState);
  }

  // Stop what's playing, then make sure the context is running. Returns the
  // token for the new take, or null if another stop/play happened while we
  // waited (or the context couldn't start).
  private async _begin(): Promise<number | null> {
    this.stop();
    this._attach();
    const myToken = this.token;
    try {
      // 'suspended' before a gesture; iOS also uses 'interrupted' after a
      // call, Siri or backgrounding.
      if (this.ctx.state !== 'running') await this.ctx.resume();
    } catch {
      if (myToken === this.token) this.onHalt?.();
      return null;
    }
    if (myToken !== this.token) return null;
    if (this.ctx.state !== 'running') {
      this.onHalt?.();
      return null;
    }
    this.lastState = this.ctx.state;
    return myToken;
  }

  // Schedule `len` seconds of a piece's audio from buffer time `offset`,
  // starting at context time `at`, with linear fades in/out.
  private _play(
    piece: Piece,
    at: number,
    offset: number,
    len: number,
    dest: AudioNode,
    fadeIn = XF,
    fadeOut = XF
  ): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this._bufferFor(piece);
    const g = this.ctx.createGain();
    const fi = Math.min(fadeIn, len / 4);
    const fo = Math.min(fadeOut, len / 4);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(1, at + fi);
    g.gain.setValueAtTime(1, at + len - fo);
    g.gain.linearRampToValueAtTime(0, at + len);
    src.connect(g).connect(dest);
    src.addEventListener('ended', () => g.disconnect());
    src.start(at, offset, len);
    this.sources.push(src);
    return src;
  }

  // Schedule pieces back to back from `t`, with matched crossfades at every
  // join. Returns each piece's nominal start time and the end time.
  private _run(
    pieces: Piece[],
    t: number,
    dest: AudioNode
  ): { starts: number[]; end: number } {
    const starts: number[] = [];
    pieces.forEach((p, i) => {
      starts.push(t);
      // Every clip after the first starts XF early, reading XF earlier in the
      // buffer, and ramps in while the previous one ramps out.
      const lead = i > 0 ? Math.min(XF, p.offset) : 0;
      this._play(
        p,
        t - lead,
        p.offset - lead,
        p.duration + lead,
        dest,
        lead || XF,
        XF
      );
      t += p.duration;
    });
    return { starts, end: t };
  }

  private _busy(until: number): void {
    this.busyUntil = until;
    kickMeter();
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
    const myToken = await this._begin();
    if (myToken == null) return;

    const from = Math.min(0.999, Math.max(0, fromFraction));
    const startOffset = piece.offset + from * piece.duration;
    const playLength = piece.duration * (1 - from);
    const at = this.ctx.currentTime + 0.01;
    const src = this._play(piece, at, startOffset, playLength, this.deck);
    src.onended = () => {
      if (myToken === this.token) {
        this._clip = null;
        onEnd?.();
      }
    };
    this._clip = {
      pieceId: piece.id,
      startedAt: at,
      duration: piece.duration,
      fromFraction: from,
    };
    this._busy(at + playLength);
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
    const myToken = await this._begin();
    if (myToken == null) return;

    const { starts, end } = this._run(
      pieces,
      this.ctx.currentTime + 0.06 + delay,
      this.deck
    );
    starts.forEach((t, idx) => {
      const p = pieces[idx];
      this.timers.push(
        setTimeout(
          () => {
            if (myToken !== this.token) return;
            // Playhead timing comes from the schedule, not the timer.
            this._clip = {
              pieceId: p.id,
              startedAt: t,
              duration: p.duration,
              fromFraction: 0,
            };
            onPiece?.(idx);
          },
          Math.max(0, (t - this.ctx.currentTime) * 1000)
        )
      );
    });
    this.timers.push(
      setTimeout(
        () => {
          if (myToken !== this.token) return;
          this._clip = null;
          this.sources = [];
          onEnd?.();
        },
        Math.max(0, (end - this.ctx.currentTime) * 1000)
      )
    );
    this._busy(end);
  }

  /**
   * Play the join between two clips: the tail of `a` straight into the head of
   * `b`, with the same matched crossfade as every other join. A true
   * neighbour sounds seamless. `onEnd` fires when the seam finishes.
   */
  async playSeam(
    a: Piece,
    b: Piece,
    onEnd?: () => void,
    span = 0.7
  ): Promise<void> {
    const myToken = await this._begin();
    if (myToken == null) return;
    const len = Math.min(span, a.duration, b.duration);
    const t0 = this.ctx.currentTime + 0.04;
    this._play(a, t0, a.offset + a.duration - len, len, this.deck, 0.03);
    const lead = Math.min(XF, b.offset);
    this._play(
      b,
      t0 + len - lead,
      b.offset - lead,
      len + lead,
      this.deck,
      lead || XF,
      0.04
    );
    const end = t0 + 2 * len;
    this.timers.push(
      setTimeout(
        () => {
          if (myToken === this.token) {
            this.sources = [];
            onEnd?.();
          }
        },
        Math.max(0, (end - this.ctx.currentTime) * 1000)
      )
    );
    this._busy(end);
  }

  /**
   * The win "mixtape": a medley of several songs back to back, each a short
   * run of its clips, with equal-power crossfades between songs.
   * `onSegment(i)` fires as each song comes in; `onEnd()` when it's done.
   */
  async playMixtape(
    segments: Piece[][],
    {
      onSegment,
      onEnd,
      fade = 0.4,
    }: {
      onSegment?: (idx: number) => void;
      onEnd?: () => void;
      fade?: number;
    } = {}
  ): Promise<void> {
    const myToken = await this._begin();
    if (myToken == null) return;
    const steps = 32;
    const fadeIn = new Float32Array(steps);
    const fadeOut = new Float32Array(steps);
    for (let i = 0; i < steps; i++) {
      const x = i / (steps - 1);
      fadeIn[i] = Math.sin((x * Math.PI) / 2);
      fadeOut[i] = Math.cos((x * Math.PI) / 2);
    }

    let t = this.ctx.currentTime + 0.08;
    segments.forEach((pieces, idx) => {
      const len = pieces.reduce((sum, p) => sum + p.duration, 0);
      const gain = this.ctx.createGain();
      gain.connect(this.deck);
      const first = idx === 0;
      const last = idx === segments.length - 1;
      gain.gain.setValueAtTime(first ? 1 : 0, t);
      if (!first) gain.gain.setValueCurveAtTime(fadeIn, t, fade);
      if (!last) gain.gain.setValueCurveAtTime(fadeOut, t + len - fade, fade);
      const { end } = this._run(pieces, t, gain);
      this.timers.push(
        setTimeout(
          () => gain.disconnect(),
          Math.max(0, (end - this.ctx.currentTime) * 1000) + 200
        )
      );

      const startMs = Math.max(0, (t - this.ctx.currentTime) * 1000);
      this.timers.push(
        setTimeout(() => {
          if (myToken === this.token) onSegment?.(idx);
        }, startMs)
      );
      // The next song starts as this one fades out.
      t += len - (last ? 0 : fade);
    });

    this.timers.push(
      setTimeout(
        () => {
          if (myToken === this.token) {
            this.sources = [];
            onEnd?.();
          }
        },
        Math.max(0, (t - this.ctx.currentTime) * 1000)
      )
    );
    this._busy(t);
  }
}

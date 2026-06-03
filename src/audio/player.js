// Plays individual pieces or a full arrangement from a single decoded buffer.

const DEFAULT_VOLUME = 0.85;

function clampVolume(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, numeric));
}

export class Player {
  constructor(ctx, buffer = null) {
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
    this.sources = [];
    this.timers = [];
    // Bumped on every stop/new playback so stale highlight callbacks no-op.
    this.token = 0;
    // Tracks the single clip currently playing so the UI can draw a playhead.
    this._clip = null;
  }

  // Fraction (0..1) through the currently playing clip, or null when that clip
  // isn't the one playing. Used to position the waveform playhead.
  getClipProgress(pieceId) {
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
  getLevel() {
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

  setVolume(value) {
    const volume = clampVolume(value);
    this.output.gain.setValueAtTime(volume, this.ctx.currentTime);
  }

  stop() {
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

  async _resume() {
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  _bufferFor(piece) {
    return piece.buffer || this.buffer;
  }

  // Play a single piece, optionally starting partway through (`fromFraction` in
  // 0..1, for scrubbing). `onEnd` fires when it finishes naturally.
  async playPiece(piece, onEnd, fromFraction = 0) {
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
  async playSequence(pieces, { onPiece, onEnd } = {}) {
    await this._resume();
    this.stop();
    const myToken = this.token;

    const startAt = this.ctx.currentTime + 0.06;
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

      t += p.duration;
    });

    const totalMs = Math.max(0, (t - this.ctx.currentTime) * 1000);
    this.timers.push(
      setTimeout(() => {
        if (myToken === this.token) onEnd?.();
      }, totalMs)
    );
  }
}

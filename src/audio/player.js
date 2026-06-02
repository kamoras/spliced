// Plays individual pieces or a full arrangement from a single decoded buffer.

const DEFAULT_VOLUME = 0.85;

function clampVolume(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, numeric));
}

export class Player {
  constructor(ctx, buffer) {
    this.ctx = ctx;
    this.buffer = buffer;
    this.output = ctx.createGain();
    this.output.connect(ctx.destination);
    this.setVolume(DEFAULT_VOLUME);
    this.sources = [];
    this.timers = [];
    // Bumped on every stop/new playback so stale highlight callbacks no-op.
    this.token = 0;
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
  }

  async _resume() {
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  // Play a single piece. `onEnd` fires when it finishes naturally.
  async playPiece(piece, onEnd) {
    await this._resume();
    this.stop();
    const myToken = this.token;

    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.output);
    src.onended = () => {
      if (myToken === this.token) onEnd?.();
    };
    src.start(0, piece.offset, piece.duration);
    this.sources.push(src);
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
      src.buffer = this.buffer;
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

  /**
   * Play the transition between two adjacent pieces without exposing either
   * complete clip. Used for checking whether a join sounds natural.
   */
  async playJoin(left, right, { windowSeconds = 0.75, onPiece, onEnd } = {}) {
    await this._resume();
    this.stop();
    const myToken = this.token;

    const leftDuration = Math.min(windowSeconds, left.duration);
    const rightDuration = Math.min(windowSeconds, right.duration);
    const startAt = this.ctx.currentTime + 0.06;
    const clips = [
      {
        offset: left.offset + left.duration - leftDuration,
        duration: leftDuration,
      },
      { offset: right.offset, duration: rightDuration },
    ];

    let t = startAt;
    clips.forEach(({ offset, duration }, idx) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffer;
      src.connect(this.output);
      src.start(t, offset, duration);
      this.sources.push(src);

      const delayMs = Math.max(0, (t - this.ctx.currentTime) * 1000);
      this.timers.push(
        setTimeout(() => {
          if (myToken === this.token) onPiece?.(idx);
        }, delayMs)
      );

      t += duration;
    });

    const totalMs = Math.max(0, (t - this.ctx.currentTime) * 1000);
    this.timers.push(
      setTimeout(() => {
        if (myToken === this.token) onEnd?.();
      }, totalMs)
    );
  }
}

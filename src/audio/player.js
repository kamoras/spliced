// Plays individual pieces or a full arrangement from a single decoded buffer.

export class Player {
  constructor(ctx, buffer) {
    this.ctx = ctx;
    this.buffer = buffer;
    this.sources = [];
    this.timers = [];
    // Bumped on every stop/new playback so stale highlight callbacks no-op.
    this.token = 0;
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
    src.connect(this.ctx.destination);
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
      src.connect(this.ctx.destination);
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

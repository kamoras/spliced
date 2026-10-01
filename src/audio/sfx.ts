// Console sound effects, synthesized on the fly with Web Audio (no samples):
// switch clicks, patch swaps, knob detents, fader slides, the "channel open"
// chime, the buzzer, the power-on thunk. They run on their own gain bus so
// they can be switched off without touching the music, and the master volume
// (and mute) still applies.

export type SfxKind =
  | 'click'
  | 'release'
  | 'swap'
  | 'detent'
  | 'slide'
  | 'open'
  | 'buzzer'
  | 'thunk'
  | 'win'
  | 'lose'
  | 'star';

const SFX_LEVEL = 0.5;

export class Sfx {
  private ctx: AudioContext;
  private bus: GainNode;
  private noise: AudioBuffer | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = SFX_LEVEL * 0.85;
    this.bus.connect(ctx.destination);
  }

  // Master volume 0..1 (0 = muted).
  setVolume(volume: number): void {
    this.bus.gain.setTargetAtTime(
      SFX_LEVEL * volume,
      this.ctx.currentTime,
      0.015
    );
  }

  private noiseBuffer(): AudioBuffer {
    if (!this.noise) {
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  // A filtered noise burst with an exponential decay.
  private burst(
    at: number,
    {
      len,
      freq,
      q = 1,
      gain,
      type = 'bandpass' as BiquadFilterType,
    }: {
      len: number;
      freq: number;
      q?: number;
      gain: number;
      type?: BiquadFilterType;
    }
  ) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + len);
    src.connect(filter).connect(env).connect(this.bus);
    src.start(at, Math.random() * 0.3, len + 0.02);
  }

  // A pitched tone with attack/decay and an optional pitch glide.
  private tone(
    at: number,
    {
      freq,
      to,
      len,
      gain,
      type = 'sine' as OscillatorType,
      attack = 0.005,
      lowpass,
    }: {
      freq: number;
      to?: number;
      len: number;
      gain: number;
      type?: OscillatorType;
      attack?: number;
      lowpass?: number;
    }
  ) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, at + len);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, at + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, at + len);
    let node: AudioNode = osc;
    if (lowpass) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = lowpass;
      osc.connect(lp);
      node = lp;
    }
    node.connect(env).connect(this.bus);
    osc.start(at);
    osc.stop(at + len + 0.05);
  }

  async play(kind: SfxKind): Promise<void> {
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        return;
      }
    }
    const t = this.ctx.currentTime + 0.005;
    switch (kind) {
      case 'click':
        this.burst(t, { len: 0.025, freq: 3200, q: 1.2, gain: 0.25 });
        this.tone(t, { freq: 140, len: 0.012, gain: 0.12 });
        break;
      case 'release':
        this.burst(t, { len: 0.02, freq: 2400, q: 1.2, gain: 0.12 });
        break;
      case 'swap':
        this.burst(t, { len: 0.03, freq: 1500, q: 1, gain: 0.2 });
        this.tone(t, { freq: 220, to: 160, len: 0.03, gain: 0.15 });
        break;
      case 'detent':
        for (let i = 0; i < 3; i++) {
          this.burst(t + i * 0.018, {
            len: 0.012,
            freq: 4000,
            q: 2,
            gain: 0.08,
          });
        }
        break;
      case 'slide': {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer();
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(400, t);
        bp.frequency.exponentialRampToValueAtTime(1200, t + 0.28);
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(0.09, t + 0.12);
        env.gain.linearRampToValueAtTime(0, t + 0.28);
        src.connect(lp).connect(bp).connect(env).connect(this.bus);
        src.start(t, 0, 0.3);
        break;
      }
      case 'open':
        // Relay clunk, then a two-note chime and a little shimmer.
        this.tone(t, { freq: 90, len: 0.04, gain: 0.25 });
        this.tone(t + 0.04, {
          freq: 523.25,
          len: 0.3,
          gain: 0.15,
          type: 'triangle',
          attack: 0.008,
        });
        this.tone(t + 0.1, {
          freq: 783.99,
          len: 0.35,
          gain: 0.15,
          type: 'triangle',
          attack: 0.008,
        });
        this.tone(t + 0.16, { freq: 1318.5, len: 0.4, gain: 0.04 });
        this.tone(t + 0.16, { freq: 1975.5, len: 0.4, gain: 0.04 });
        break;
      case 'buzzer':
        this.tone(t, {
          freq: 98,
          to: 88,
          len: 0.26,
          gain: 0.18,
          type: 'sawtooth',
          attack: 0.02,
          lowpass: 900,
        });
        this.tone(t, {
          freq: 104,
          to: 93,
          len: 0.26,
          gain: 0.18,
          type: 'sawtooth',
          attack: 0.02,
          lowpass: 900,
        });
        break;
      case 'thunk':
        this.tone(t, { freq: 80, to: 45, len: 0.18, gain: 0.35 });
        this.burst(t, { len: 0.06, freq: 200, type: 'lowpass', gain: 0.2 });
        this.tone(t + 0.05, { freq: 60, len: 0.4, gain: 0.03 });
        break;
      case 'win':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          this.tone(t + i * 0.06, {
            freq: f,
            len: i === 3 ? 0.5 : 0.09,
            gain: 0.1,
            type: 'square',
            lowpass: 2500,
          })
        );
        break;
      case 'lose':
        this.tone(t, {
          freq: 392,
          to: 120,
          len: 0.7,
          gain: 0.08,
          type: 'sawtooth',
          lowpass: 1200,
        });
        break;
      case 'star':
        this.tone(t, { freq: 1568, len: 0.12, gain: 0.1 });
        this.tone(t + 0.07, { freq: 2093, len: 0.3, gain: 0.1 });
        break;
    }
  }
}

let shared: Sfx | null = null;
export function getSfx(ctx: AudioContext): Sfx {
  if (!shared) shared = new Sfx(ctx);
  return shared;
}

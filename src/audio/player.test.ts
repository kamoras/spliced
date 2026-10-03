// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Piece } from '../types.js';

// The meter loop needs requestAnimationFrame; the player only has to wake it.
vi.mock('./meter.js', () => ({ kickMeter: vi.fn() }));

const { kickMeter } = await import('./meter.js');
const { Player } = await import('./player.js');

// ---- a fake Web Audio graph --------------------------------------------------
// Just enough of AudioContext for the player: every node records the calls
// the player makes, and `connect` returns its argument so chains work.

interface FakeParam {
  value: number;
  setValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  setTargetAtTime: ReturnType<typeof vi.fn>;
  cancelScheduledValues: ReturnType<typeof vi.fn>;
  setValueCurveAtTime: ReturnType<typeof vi.fn>;
}

function param(value: number): FakeParam {
  return {
    value,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    setValueCurveAtTime: vi.fn(),
  };
}

function node() {
  return {
    connect: vi.fn((dest: unknown) => dest),
    disconnect: vi.fn(),
  };
}

type FakeGain = ReturnType<typeof node> & { gain: FakeParam };
type FakeSource = ReturnType<typeof node> & {
  buffer: unknown;
  playbackRate: FakeParam;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
};

function makeCtx() {
  const listeners = new Map<string, Set<() => void>>();
  const gains: FakeGain[] = [];
  const sources: FakeSource[] = [];
  const analyser = {
    ...node(),
    fftSize: 0,
    smoothingTimeConstant: 0,
    getByteTimeDomainData: vi.fn((arr: Uint8Array) => arr.fill(128)),
  };
  const ctx = {
    currentTime: 0,
    state: 'running' as AudioContextState,
    destination: { id: 'destination' },
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    addEventListener: vi.fn((type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    }),
    removeEventListener: vi.fn((type: string, fn: () => void) => {
      listeners.get(type)?.delete(fn);
    }),
    createGain: vi.fn(() => {
      const g: FakeGain = { ...node(), gain: param(1) };
      gains.push(g);
      return g;
    }),
    createBufferSource: vi.fn(() => {
      const s: FakeSource = {
        ...node(),
        buffer: null,
        playbackRate: param(1),
        start: vi.fn(),
        stop: vi.fn(),
        addEventListener: vi.fn(),
        onended: null,
      };
      sources.push(s);
      return s;
    }),
    createAnalyser: vi.fn(() => analyser),
    // Simulate a context state change (the player listens for it).
    setState(state: AudioContextState) {
      ctx.state = state;
      listeners.get('statechange')?.forEach((fn) => fn());
    },
    listenerCount: () => listeners.get('statechange')?.size ?? 0,
    gains,
    sources,
    analyser,
  };
  return ctx;
}

type Ctx = ReturnType<typeof makeCtx>;
const asAudioContext = (ctx: Ctx) => ctx as unknown as AudioContext;

const piece = (id: string, offset: number, duration: number): Piece => ({
  id,
  correctIndex: 0,
  offset,
  duration,
  peaks: [],
});

// Resolve the microtasks a play goes through before scheduling.
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('Player', () => {
  let ctx: Ctx;
  let player: InstanceType<typeof Player>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(kickMeter).mockClear();
    ctx = makeCtx();
    player = new Player(asAudioContext(ctx));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('wires sources -> deck -> output -> analyser -> destination', () => {
    // output, deck
    expect(ctx.gains).toHaveLength(2);
    const [output, deck] = ctx.gains;
    expect(output.connect).toHaveBeenCalledWith(ctx.analyser);
    expect(deck.connect).toHaveBeenCalledWith(output);
    expect(ctx.analyser.connect).toHaveBeenCalledWith(ctx.destination);
    expect(output.gain.value).toBe(0.85);
    expect(ctx.listenerCount()).toBe(1);
  });

  describe('playPiece', () => {
    it('schedules the clip at its offset/duration and is busy until it ends', async () => {
      ctx.currentTime = 1;
      const onEnd = vi.fn();
      const p = piece('a', 3, 2);
      expect(player.isBusy()).toBe(false);
      await player.playPiece(p, onEnd);

      expect(ctx.sources).toHaveLength(1);
      const src = ctx.sources[0];
      expect(src.start).toHaveBeenCalledWith(1.01, 3, 2);
      // The clip's gain feeds the deck.
      const deck = ctx.gains[1];
      const clipGain = ctx.gains[2];
      expect(src.connect).toHaveBeenCalledWith(clipGain);
      expect(clipGain.connect).toHaveBeenCalledWith(deck);
      expect(kickMeter).toHaveBeenCalledTimes(1);

      expect(player.isBusy()).toBe(true);
      ctx.currentTime = 2.01;
      expect(player.getClipProgress('a')).toBeCloseTo(0.5);
      expect(player.getClipProgress('other')).toBeNull();
      ctx.currentTime = 3.01;
      expect(player.isBusy()).toBe(false);

      expect(onEnd).not.toHaveBeenCalled();
      src.onended?.();
      expect(onEnd).toHaveBeenCalledTimes(1);
      expect(player.getClipProgress('a')).toBeNull();
    });

    it('starts partway through for a scrub', async () => {
      const p = piece('a', 10, 4);
      await player.playPiece(p, undefined, 0.5);
      expect(ctx.sources[0].start).toHaveBeenCalledWith(0.01, 12, 2);
      ctx.currentTime = 0.01;
      expect(player.getClipProgress('a')).toBeCloseTo(0.5);
      ctx.currentTime = 1.01;
      expect(player.getClipProgress('a')).toBeCloseTo(0.75);
    });

    it('uses the piece buffer, falling back to the shared one', async () => {
      const shared = { id: 'shared' } as unknown as AudioBuffer;
      const own = { id: 'own' } as unknown as AudioBuffer;
      player = new Player(asAudioContext(ctx), shared);
      await player.playPiece(piece('a', 0, 1));
      expect(ctx.sources[0].buffer).toBe(shared);
      await player.playPiece({ ...piece('b', 0, 1), buffer: own });
      expect(ctx.sources[1].buffer).toBe(own);
    });

    it('is not busy while the context is suspended, even with audio queued', async () => {
      await player.playPiece(piece('a', 0, 5));
      expect(player.isBusy()).toBe(true);
      ctx.state = 'suspended';
      expect(player.isBusy()).toBe(false);
      expect(player.getLevel()).toBe(0);
    });
  });

  describe('stop', () => {
    it('fades the take out on a fresh deck and drops the old one later', async () => {
      await player.playPiece(piece('a', 0, 5), vi.fn());
      const src = ctx.sources[0];
      const oldDeck = ctx.gains[1];
      ctx.currentTime = 1;

      player.stop();

      expect(src.stop).toHaveBeenCalledWith(1 + 0.008 + 0.01);
      expect(src.onended).toBeNull();
      expect(oldDeck.gain.cancelScheduledValues).toHaveBeenCalledWith(1);
      expect(oldDeck.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
        0,
        1.008
      );
      expect(player.isBusy()).toBe(false);
      expect(player.getClipProgress('a')).toBeNull();

      // A new deck is wired to the output; the old one disconnects once the
      // fade is inaudible.
      const newDeck = ctx.gains[ctx.gains.length - 1];
      expect(newDeck).not.toBe(oldDeck);
      expect(newDeck.connect).toHaveBeenCalledWith(ctx.gains[0]);
      expect(oldDeck.disconnect).not.toHaveBeenCalled();
      vi.advanceTimersByTime(200);
      expect(oldDeck.disconnect).toHaveBeenCalledTimes(1);

      // The next play goes through the new deck.
      await player.playPiece(piece('b', 0, 1));
      const clipGain = ctx.gains[ctx.gains.length - 1];
      expect(clipGain.connect).toHaveBeenCalledWith(newDeck);
    });

    it('tape-stops with a pitch drop and stays busy through the wind-down', async () => {
      await player.playPiece(piece('a', 0, 5));
      const src = ctx.sources[0];
      ctx.currentTime = 2;
      player.stop(true);
      expect(src.playbackRate.setValueAtTime).toHaveBeenCalledWith(1, 2);
      expect(src.playbackRate.linearRampToValueAtTime).toHaveBeenCalledWith(
        0.3,
        2.25
      );
      expect(src.stop).toHaveBeenCalledWith(2.26);
      expect(player.isBusy()).toBe(true);
      ctx.currentTime = 2.3;
      expect(player.isBusy()).toBe(false);
    });

    it('is a no-op on an idle player', () => {
      expect(() => player.stop()).not.toThrow();
      expect(ctx.gains).toHaveLength(2);
    });
  });

  describe('tokens', () => {
    it('a second play while the first waits on resume() wins', async () => {
      ctx.state = 'suspended';
      let release!: () => void;
      ctx.resume.mockImplementationOnce(
        () =>
          new Promise<void>((r) => {
            release = () => {
              ctx.state = 'running';
              r();
            };
          })
      );
      const endA = vi.fn();
      const endB = vi.fn();
      const first = player.playPiece(piece('a', 0, 1), endA);
      await flush();
      expect(ctx.sources).toHaveLength(0);
      const second = player.playPiece(piece('b', 5, 1), endB);
      release();
      await Promise.all([first, second]);
      // Only the second take was scheduled.
      expect(ctx.sources).toHaveLength(1);
      expect(ctx.sources[0].start).toHaveBeenCalledWith(0.01, 5, 1);
      expect(player.getClipProgress('a')).toBeNull();
      expect(player.getClipProgress('b')).toBe(0);
    });

    it('a new play silences the previous sequence’s callbacks', async () => {
      const onPiece = vi.fn();
      const onEnd = vi.fn();
      await player.playSequence([piece('a', 0, 1), piece('b', 1, 1)], {
        onPiece,
        onEnd,
      });
      vi.advanceTimersByTime(60);
      expect(onPiece).toHaveBeenCalledWith(0);
      await player.playPiece(piece('c', 0, 1));
      vi.advanceTimersByTime(5000);
      expect(onPiece).toHaveBeenCalledTimes(1);
      expect(onEnd).not.toHaveBeenCalled();
      // The old sources were cut when the new take began.
      expect(ctx.sources[0].stop).toHaveBeenCalled();
      expect(ctx.sources[1].stop).toHaveBeenCalled();
      expect(ctx.sources[2].stop).not.toHaveBeenCalled();
    });
  });

  describe('playSequence', () => {
    it('plays pieces back to back and reports each one in order', async () => {
      const events: string[] = [];
      const pieces = [piece('a', 2, 1), piece('b', 7, 2), piece('c', 11, 0.5)];
      await player.playSequence(pieces, {
        onPiece: (i) => events.push(`piece${i}`),
        onEnd: () => events.push('end'),
      });

      expect(ctx.sources).toHaveLength(3);
      // First clip starts clean at t+0.06; later ones lead by the crossfade
      // and read that much earlier in the buffer.
      expect(ctx.sources[0].start).toHaveBeenCalledWith(0.06, 2, 1);
      const [at1, off1, len1] = ctx.sources[1].start.mock.calls[0] as number[];
      expect(at1).toBeCloseTo(1.06 - 0.003, 6);
      expect(off1).toBeCloseTo(7 - 0.003, 6);
      expect(len1).toBeCloseTo(2.003, 6);
      const [at2] = ctx.sources[2].start.mock.calls[0] as number[];
      expect(at2).toBeCloseTo(3.06 - 0.003, 6);
      expect(player.isBusy()).toBe(true);

      expect(events).toEqual([]);
      vi.advanceTimersByTime(60);
      expect(events).toEqual(['piece0']);
      expect(player.getClipProgress('a')).toBe(0);
      vi.advanceTimersByTime(1000);
      expect(events).toEqual(['piece0', 'piece1']);
      expect(player.getClipProgress('a')).toBeNull();
      vi.advanceTimersByTime(2000);
      expect(events).toEqual(['piece0', 'piece1', 'piece2']);
      vi.advanceTimersByTime(500);
      expect(events).toEqual(['piece0', 'piece1', 'piece2', 'end']);
      expect(player.getClipProgress('c')).toBeNull();
    });

    it('honours a lead-in delay', async () => {
      const onPiece = vi.fn();
      await player.playSequence([piece('a', 0, 1)], { onPiece, delay: 1 });
      expect(ctx.sources[0].start).toHaveBeenCalledWith(1.06, 0, 1);
      vi.advanceTimersByTime(1000);
      expect(onPiece).not.toHaveBeenCalled();
      vi.advanceTimersByTime(60);
      expect(onPiece).toHaveBeenCalledWith(0);
    });
  });

  describe('playSeam', () => {
    it('plays the tail of a into the head of b, then reports the end', async () => {
      const onEnd = vi.fn();
      ctx.currentTime = 1;
      await player.playSeam(piece('a', 10, 2), piece('b', 20, 2), onEnd);
      expect(ctx.sources).toHaveLength(2);
      const [a, b] = ctx.sources;
      // t0 = 1.04, len = 0.7: a's last 0.7s, then b's first 0.7s (+ lead).
      const [atA, offA, lenA] = a.start.mock.calls[0] as number[];
      expect(atA).toBeCloseTo(1.04, 6);
      expect(offA).toBeCloseTo(11.3, 6);
      expect(lenA).toBeCloseTo(0.7, 6);
      const [atB, offB, lenB] = b.start.mock.calls[0] as number[];
      expect(atB).toBeCloseTo(1.74 - 0.003, 6);
      expect(offB).toBeCloseTo(20 - 0.003, 6);
      expect(lenB).toBeCloseTo(0.703, 6);
      expect(player.isBusy()).toBe(true);

      // The end timer runs from "now" (1.0): 0.04 lead-in + 2 x 0.7.
      vi.advanceTimersByTime(1439);
      expect(onEnd).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('clamps the span to the shorter clip', async () => {
      await player.playSeam(piece('a', 0, 0.2), piece('b', 5, 3));
      const [, offA, lenA] = ctx.sources[0].start.mock.calls[0] as number[];
      expect(lenA).toBeCloseTo(0.2, 6);
      expect(offA).toBeCloseTo(0, 6);
    });
  });

  describe('_begin / context state', () => {
    it('halts without scheduling when resume() rejects', async () => {
      ctx.state = 'suspended';
      ctx.resume.mockRejectedValueOnce(new Error('no gesture'));
      const onHalt = vi.fn();
      player.onHalt = onHalt;
      const onEnd = vi.fn();
      await player.playPiece(piece('a', 0, 1), onEnd);
      expect(ctx.sources).toHaveLength(0);
      expect(onHalt).toHaveBeenCalledTimes(1);
      expect(onEnd).not.toHaveBeenCalled();
      expect(player.isBusy()).toBe(false);
    });

    it('halts when the context still is not running after resume()', async () => {
      ctx.state = 'suspended';
      ctx.resume.mockImplementationOnce(async () => {
        /* stays suspended */
      });
      const onHalt = vi.fn();
      player.onHalt = onHalt;
      await player.playSequence([piece('a', 0, 1)], { onEnd: vi.fn() });
      expect(ctx.sources).toHaveLength(0);
      expect(onHalt).toHaveBeenCalledTimes(1);
    });

    it('resumes a suspended context before playing', async () => {
      ctx.state = 'suspended';
      await player.playPiece(piece('a', 0, 1));
      expect(ctx.resume).toHaveBeenCalledTimes(1);
      expect(ctx.sources).toHaveLength(1);
      // Already running: no second resume.
      await player.playPiece(piece('b', 0, 1));
      expect(ctx.resume).toHaveBeenCalledTimes(1);
    });

    it('stops and halts when the context is interrupted mid-take', async () => {
      const onHalt = vi.fn();
      const onEnd = vi.fn();
      player.onHalt = onHalt;
      await player.playPiece(piece('a', 0, 5), onEnd);
      ctx.currentTime = 1;

      ctx.setState('interrupted');

      expect(onHalt).toHaveBeenCalledTimes(1);
      expect(ctx.sources[0].stop).toHaveBeenCalled();
      expect(player.getClipProgress('a')).toBeNull();
      ctx.sources[0].onended?.();
      expect(onEnd).not.toHaveBeenCalled();
      // Nothing was playing any more: coming back is quiet.
      ctx.setState('running');
      expect(onHalt).toHaveBeenCalledTimes(1);
    });

    it('ignores state changes while idle', () => {
      const onHalt = vi.fn();
      player.onHalt = onHalt;
      ctx.setState('interrupted');
      ctx.setState('running');
      expect(onHalt).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('detaches from the speakers and reattaches on the next play', async () => {
      await player.playPiece(piece('a', 0, 5));
      player.dispose();
      expect(ctx.sources[0].stop).toHaveBeenCalled();
      expect(ctx.removeEventListener).toHaveBeenCalledWith(
        'statechange',
        expect.any(Function)
      );
      expect(ctx.listenerCount()).toBe(0);
      expect(ctx.analyser.disconnect).not.toHaveBeenCalled();
      vi.advanceTimersByTime(200);
      expect(ctx.analyser.disconnect).toHaveBeenCalledTimes(1);

      ctx.analyser.connect.mockClear();
      await player.playPiece(piece('b', 0, 1));
      expect(ctx.analyser.connect).toHaveBeenCalledWith(ctx.destination);
      expect(ctx.listenerCount()).toBe(1);
      expect(ctx.sources).toHaveLength(2);
      // Interruptions are handled again after reattaching.
      const onHalt = vi.fn();
      player.onHalt = onHalt;
      ctx.setState('interrupted');
      expect(onHalt).toHaveBeenCalledTimes(1);
    });

    it('survives a dev-mode double mount (play before the detach timer)', async () => {
      player.dispose();
      player.dispose();
      await player.playPiece(piece('a', 0, 1));
      const calls = () =>
        ctx.analyser.connect.mock.invocationCallOrder.at(-1)! >
        (ctx.analyser.disconnect.mock.invocationCallOrder.at(-1) ?? 0);
      expect(calls()).toBe(true);
      vi.advanceTimersByTime(500);
      // The pending detach saw the player was back in use and left it alone.
      expect(calls()).toBe(true);
      expect(ctx.listenerCount()).toBe(1);
    });
  });

  it('setVolume glides to a clamped value', () => {
    ctx.currentTime = 4;
    player.setVolume(2);
    expect(ctx.gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(1, 4, 0.015);
    player.setVolume(-1);
    expect(ctx.gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(0, 4, 0.015);
    player.setVolume(Number.NaN);
    expect(ctx.gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(
      0.85,
      4,
      0.015
    );
  });

  it('getLevel reads the analyser only while busy', async () => {
    expect(player.getLevel()).toBe(0);
    expect(ctx.analyser.getByteTimeDomainData).not.toHaveBeenCalled();
    await player.playPiece(piece('a', 0, 5));
    ctx.analyser.getByteTimeDomainData.mockImplementationOnce(
      (arr: Uint8Array) => arr.fill(255)
    );
    expect(player.getLevel()).toBe(1);
    expect(player.getLevel()).toBe(0);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Track } from '../types.js';
import { newGame, spliceJoin } from '../game/engine.js';

// No Web Audio in jsdom: stub the player and context.
vi.mock('../audio/slicer.js', () => ({ getAudioContext: () => ({}) }));
vi.mock('../audio/sfx.js', () => ({
  getSfx: () => ({ play() {}, setVolume() {} }),
}));
vi.mock('../audio/player.js', () => ({
  Player: class {
    stop() {}
    setVolume() {}
    playPiece() {}
    // The stub plays instantly.
    playSequence(_seq: unknown, opts?: { onEnd?: () => void }) {
      opts?.onEnd?.();
    }
    playSeam() {}
    sfx() {}
    getClipProgress() {
      return null;
    }
    getLevel() {
      return 0;
    }
    isBusy() {
      return false;
    }
    dispose() {}
    onHalt = null;
  },
}));

const { default: Puzzle, puzzleDef } = await import('./Puzzle.jsx');

function makeTracks(n = 3, clips = 3): Track[] {
  return Array.from({ length: n }, (_, t) => ({
    id: `t${t}`,
    previewUrl: '',
    buffer: {} as AudioBuffer,
    duration: 30,
    answer: { title: `Song ${t}`, artist: `Artist ${t}` },
    choices: [{ title: `Song ${t}`, artist: `Artist ${t}` }],
    pieces: Array.from({ length: clips }, (_, i) => ({
      id: `t${t}-piece-${i}`,
      trackId: `t${t}`,
      trackIndex: t,
      correctIndex: i,
      offset: i * 2,
      duration: 2,
      peaks: [0.2, 0.8, 0.5],
    })),
  }));
}

const tileIds = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.tile')).map(
    (t) => t.dataset.piece
  );

describe('Puzzle', () => {
  beforeEach(() => localStorage.clear());

  it('cues a clip on tap and swaps it with ⇄', async () => {
    render(
      <Puzzle
        tracks={makeTracks()}
        clipsPerTrack={3}
        maxGuesses={4}
        seed={3}
        label="Test"
      />
    );
    const before = tileIds();
    expect(before).toHaveLength(9);
    await userEvent.click(
      screen.getByRole('button', {
        name: new RegExp(`^Clip \\w, channel 1 slot 1`),
      })
    );
    const swaps = screen.getAllByRole('button', { name: /^Swap clip/ });
    expect(swaps).toHaveLength(8);
    await userEvent.click(swaps[0]);
    const after = tileIds();
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
    expect(
      screen.queryAllByRole('button', { name: /^Swap clip/ })
    ).toHaveLength(0);
  });

  it('splices only a heard join, charging a mistake when it is wrong', async () => {
    const onChange = vi.fn();
    render(
      <Puzzle
        tracks={makeTracks()}
        clipsPerTrack={3}
        maxGuesses={4}
        seed={3}
        label="Test"
        onChange={onChange}
      />
    );
    // Find a seam between clips of different songs (never a true join).
    const ids = tileIds();
    const row = [0, 1, 2].find(
      (r) => ids[r * 3]!.split('-')[0] !== ids[r * 3 + 1]!.split('-')[0]
    )!;
    const [a, b] = [ids[row * 3]!, ids[row * 3 + 1]!];
    const lanes = screen.getAllByRole('listitem');
    const key = () =>
      within(lanes[row]).getAllByRole('button', { name: /^Splice clips/ })[0];
    // Unheard: the key is off and pressing it plays the join instead.
    expect(key()).toBeDisabled();
    await userEvent.click(
      within(lanes[row]).getAllByRole('button', { name: /^Hear the join/ })[0]
    );
    expect(key()).toBeEnabled();
    await userEvent.click(key());
    expect(
      screen.getByRole('img', { name: '3 of 4 mistakes left' })
    ).toBeInTheDocument();
    expect(document.querySelector('.vfd-msg')).toHaveTextContent(/Not a join/);
    expect(onChange.mock.lastCall?.[0]).toMatchObject({
      mistakes: 1,
      bad: [`${a}>${b}`],
    });
    // A join proven wrong can't be spliced again.
    expect(
      within(lanes[row]).getByRole('button', { name: /: not a join/ })
    ).toBeDisabled();
  });

  it('fetches a solved song’s choices, and its title only after a pick', async () => {
    const tracks = makeTracks().map((t, i) => ({
      ...t,
      answer: undefined,
      choices: undefined,
      ref: `d0.${i}`,
    }));
    const def = puzzleDef(tracks, 3, 4);
    const fresh = newGame(def, 3);
    const order = [
      ...def.tracks[0].pieces.map((p) => p.id),
      ...fresh.order.filter((id) => !id.startsWith('t0-')),
    ];
    const [p0, p1, p2] = def.tracks[0].pieces.map((p) => p.id);
    const pair = spliceJoin({ ...fresh, order }, def, p0, p1).state;
    const solved = spliceJoin(pair, def, p1, p2).state;
    const fetchMock = vi.fn(async (url: string) => {
      const q = new URL(url, 'http://x').searchParams;
      const part = q.get('part');
      const n = q.get('ref')!.slice(-1);
      const body =
        part === 'choices'
          ? {
              choices: [
                { title: 'Song 0', artist: 'Artist 0' },
                { title: 'Decoy', artist: 'Someone' },
              ],
            }
          : { title: `Song ${n}`, artist: `Artist ${n}` };
      return new Response(JSON.stringify(body));
    });
    vi.stubGlobal('fetch', fetchMock);
    // Even once the game is over, an open quiz keeps its title back.
    render(
      <Puzzle
        tracks={tracks}
        clipsPerTrack={3}
        maxGuesses={4}
        seed={3}
        label="Test"
        initialState={{ ...solved, status: 'lost' }}
      />
    );
    const pick = await screen.findByRole('button', { name: /^Song 0/ });
    const asked = () =>
      fetchMock.mock.calls.map(([u]) => {
        const q = new URL(u, 'http://x').searchParams;
        return `${q.get('part')}:${q.get('ref')}`;
      });
    expect(asked()).not.toContain('answer:d0.0');
    await userEvent.click(pick);
    expect(await screen.findByText(/Named it!/)).toBeInTheDocument();
    expect(asked()).toContain('answer:d0.0');
    vi.unstubAllGlobals();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Track } from '../types.js';

// No Web Audio in jsdom: stub the player and context.
vi.mock('../audio/slicer.js', () => ({ getAudioContext: () => ({}) }));
vi.mock('../audio/player.js', () => ({
  Player: class {
    stop() {}
    setVolume() {}
    playPiece() {}
    playSequence() {}
    playSeam() {}
    sfx() {}
    getClipProgress() {
      return null;
    }
  },
}));

const { default: Puzzle } = await import('./Puzzle.jsx');

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
        name: new RegExp(`^Clip \\w, track 1 slot 1`),
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

  it('spends a mistake on a wrong lock-in, and re-checking is free', async () => {
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
    const lanes = screen.getAllByRole('listitem');
    // Find a row that isn't already solved by the scramble.
    const ids = tileIds();
    const row = [0, 1, 2].find(
      (r) =>
        !ids
          .slice(r * 3, r * 3 + 3)
          .every(
            (id, i) =>
              id?.endsWith(`-${i}`) &&
              id.split('-')[0] === ids[r * 3]!.split('-')[0]
          )
    )!;
    await userEvent.click(
      within(lanes[row]).getByRole('button', {
        name: `Lock in track ${row + 1}`,
      })
    );
    expect(
      screen.getByRole('img', { name: '3 of 4 mistakes left' })
    ).toBeInTheDocument();
    await userEvent.click(
      within(lanes[row]).getByRole('button', { name: /already tried/ })
    );
    expect(
      screen.getByRole('img', { name: '3 of 4 mistakes left' })
    ).toBeInTheDocument();
    expect(document.querySelector('.hint')).toHaveTextContent(
      /no mistake charged/
    );
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ mistakes: 1 });
  });
});

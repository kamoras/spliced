import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { DailyResponse, Track, TrackDef } from '../types.js';
import { encodeGhost, newGame } from '../game/engine.js';
import type { GameState } from '../game/engine.js';
import { puzzleDef } from '../game/def.js';

const CLIPS = 4;
const PUZZLE = 12;

// No Web Audio in jsdom: the slicer hands back ready-made tracks and the
// player is a silent stub.
vi.mock('../audio/slicer.js', () => ({
  getAudioContext: () => ({}),
  loadAndSliceTracks: vi.fn(
    async (
      defs: TrackDef[],
      clipsPerTrack: number,
      opts?: { onProgress?: (n: number) => void }
    ): Promise<Track[]> =>
      defs.map((d, t) => {
        opts?.onProgress?.(t + 1);
        return {
          ...d,
          id: d.id || `track-${t}`,
          buffer: {} as AudioBuffer,
          duration: 30,
          pieces: Array.from({ length: clipsPerTrack }, (_, i) => ({
            id: `clip-${t * clipsPerTrack + i}`,
            trackId: d.id || `track-${t}`,
            trackIndex: t,
            correctIndex: i,
            offset: i * 2.4,
            duration: 2.4,
            peaks: [0.2, 0.8, 0.5],
          })),
        };
      })
  ),
}));
vi.mock('../audio/sfx.js', () => ({
  getSfx: () => ({ play() {}, setVolume() {} }),
}));
vi.mock('../audio/player.js', () => ({
  Player: class {
    stop() {}
    setVolume() {}
    playPiece() {}
    playSequence() {}
    playSeam() {}
    playMixtape() {}
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

function payload(puzzleNumber = PUZZLE): DailyResponse {
  return {
    puzzleNumber,
    trackCount: 3,
    clipsPerTrack: CLIPS,
    numPieces: 3 * CLIPS,
    maxGuesses: 4,
    tracks: [0, 1, 2].map((i) => ({
      id: `t${i}`,
      ref: `d${puzzleNumber}.${i}`,
      previewUrl: `https://example.test/preview-${i}.m4a`,
      clue: { year: 1980 + i, genre: 'Pop', showGenre: false },
    })),
  };
}

// The tracks exactly as the slicer mock will produce them, for building
// saved states that pass isValidState.
function slicedTracks(d = payload()): Track[] {
  return d.tracks.map((t, i) => ({
    ...t,
    id: t.id!,
    buffer: {} as AudioBuffer,
    duration: 30,
    pieces: Array.from({ length: CLIPS }, (_, j) => ({
      id: `clip-${i * CLIPS + j}`,
      trackId: t.id,
      correctIndex: j,
      offset: j * 2.4,
      duration: 2.4,
      peaks: [],
    })),
  }));
}

const today = () => new Date().toISOString().slice(0, 10);

// A fetch that answers /api/daily (dated or not) and /api/reveal.
function stubFetch({
  daily = payload(),
  dated = 200,
}: { daily?: DailyResponse; dated?: number } = {}) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input), 'http://x');
    if (url.pathname === '/api/daily') {
      if (url.searchParams.has('date') && dated !== 200) {
        return new Response('', { status: dated });
      }
      return new Response(JSON.stringify(daily));
    }
    if (url.pathname === '/api/reveal') {
      const ref = url.searchParams.get('ref') ?? '';
      const n = ref.slice(-1);
      const body =
        url.searchParams.get('part') === 'choices'
          ? { choices: [{ title: `Song ${n}`, artist: `Artist ${n}` }] }
          : { title: `Song ${n}`, artist: `Artist ${n}` };
      return new Response(JSON.stringify(body));
    }
    return new Response('', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const requested = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls
    .map(([u]) => String(u))
    .filter((u) => u.startsWith('/api/daily'));

const tileIds = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.tile')).map(
    (t) => t.dataset.piece
  );

const props = {
  onPractice: vi.fn(),
  onArchive: vi.fn(),
  sfx: false,
  volume: 0.5,
  paused: false,
  hard: false,
};

// The ghost param is read once per module load, so each test gets a fresh
// module (which also resets the reveal cache).
async function loadDailyGame() {
  const mod = await import('./DailyGame.jsx');
  return mod.default;
}

describe('DailyGame', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    history.replaceState(null, '', '/');
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads today’s puzzle and renders the board', async () => {
    const fetchMock = stubFetch();
    const DailyGame = await loadDailyGame();
    // Rendered outside act so the loading state is observable.
    render(<DailyGame {...props} />);
    expect(document.querySelector('.loading')).toHaveAttribute(
      'aria-busy',
      'true'
    );

    expect(await screen.findByText(`Spliced #${PUZZLE}`)).toBeInTheDocument();
    expect(requested(fetchMock)).toEqual([`/api/daily?date=${today()}`]);
    const ids = tileIds();
    expect(ids).toHaveLength(3 * CLIPS);
    expect(new Set(ids).size).toBe(3 * CLIPS);
    expect(ids.every((id) => id?.startsWith('clip-'))).toBe(true);
    expect(
      screen.getByRole('img', { name: '4 of 4 mistakes left' })
    ).toBeInTheDocument();
    expect(screen.queryByText(/From the archive/)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Results' })).toBeNull();
  });

  it('falls back to /api/daily when the dated request 404s', async () => {
    const fetchMock = stubFetch({ dated: 404 });
    const DailyGame = await loadDailyGame();
    await act(async () => {
      render(<DailyGame {...props} />);
    });
    expect(await screen.findByText(`Spliced #${PUZZLE}`)).toBeInTheDocument();
    expect(requested(fetchMock)).toEqual([
      `/api/daily?date=${today()}`,
      '/api/daily',
    ]);
  });

  it('shows an error (and retry) when the puzzle will not load', async () => {
    stubFetch({ dated: 500 });
    const DailyGame = await loadDailyGame();
    await act(async () => {
      render(<DailyGame {...props} />);
    });
    expect(
      await screen.findByText(/The tape snapped\. Could not load the puzzle\./)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('restores a game in progress from localStorage', async () => {
    stubFetch();
    const def = puzzleDef(slicedTracks(), CLIPS, 4);
    const saved: GameState = {
      ...newGame(def, PUZZLE),
      mistakes: 2,
      solved: ['t1'],
      attempts: [
        { marks: ['miss', 'miss', 'miss', 'miss'], solved: false, row: 0 },
      ],
      elapsedMs: 12000,
    };
    localStorage.setItem(
      'spliced:progress:v7',
      JSON.stringify({ [PUZZLE]: saved })
    );
    const DailyGame = await loadDailyGame();
    await act(async () => {
      render(<DailyGame {...props} />);
    });
    expect(await screen.findByText(`Spliced #${PUZZLE}`)).toBeInTheDocument();
    // Rows 0 and 2 are still clips in the saved order; row 1 (t1) is locked
    // and shows its quiz instead.
    expect(tileIds()).toEqual(
      saved.order.filter((_, i) => Math.floor(i / CLIPS) !== 1)
    );
    expect(
      await screen.findByRole('group', { name: 'Name that tune' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '2 of 4 mistakes left' })
    ).toBeInTheDocument();
    expect(document.querySelector('.vfd-msg')).toHaveTextContent(
      'Welcome back. 2 songs to go.'
    );
    expect(screen.queryByRole('region', { name: 'Results' })).toBeNull();
  });

  it('ignores saved progress that does not describe this board', async () => {
    stubFetch();
    const def = puzzleDef(slicedTracks(), CLIPS, 4);
    const stale = { ...newGame(def, PUZZLE), mistakes: 3 };
    stale.order = stale.order.map((id) => `old-${id}`);
    localStorage.setItem(
      'spliced:progress:v7',
      JSON.stringify({ [PUZZLE]: stale })
    );
    const DailyGame = await loadDailyGame();
    await act(async () => {
      render(<DailyGame {...props} />);
    });
    expect(await screen.findByText(`Spliced #${PUZZLE}`)).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '4 of 4 mistakes left' })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Welcome back/)).toBeNull();
  });

  it('shows Results straight away for a saved finished game', async () => {
    const fetchMock = stubFetch();
    localStorage.setItem(
      'spliced:daily',
      JSON.stringify({
        [PUZZLE]: { solved: true, mistakes: 1, elapsedMs: 65000, ts: 1 },
      })
    );
    const DailyGame = await loadDailyGame();
    await act(async () => {
      render(<DailyGame {...props} />);
    });
    const results = await screen.findByRole('region', { name: 'Results' });
    expect(results).toHaveTextContent('One rough splice.');
    expect(results).toHaveTextContent('1:05');
    // Every row is locked (no loose clips) and, with no quiz left to play,
    // every title is fetched and shown.
    expect(tileIds()).toEqual([]);
    for (const i of [0, 1, 2]) {
      expect(
        await screen.findByRole('button', {
          name: `Play Song ${i} by Artist ${i}`,
        })
      ).toBeInTheDocument();
    }
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([u]) => String(u).includes('part=answer'))
      ).toHaveLength(3)
    );
    expect(
      fetchMock.mock.calls.some(([u]) => String(u).includes('part=choices'))
    ).toBe(false);
  });

  it('races a friend’s ghost from a ?g= link', async () => {
    stubFetch();
    const def = puzzleDef(slicedTracks(), CLIPS, 4);
    const run: GameState = {
      ...newGame(def, PUZZLE),
      status: 'won',
      mistakes: 1,
      elapsedMs: 90000,
      attempts: [
        {
          marks: ['correct', 'misplaced', 'miss', 'miss'],
          solved: false,
          atMs: 30000,
        },
        {
          marks: ['correct', 'correct', 'correct', 'correct'],
          solved: true,
          atMs: 90000,
        },
      ],
    };
    const code = encodeGhost(run, PUZZLE);
    history.replaceState(null, '', `/?g=${code}&n=Sam`);
    const DailyGame = await loadDailyGame();
    await act(async () => {
      render(<DailyGame {...props} />);
    });
    expect(await screen.findByText(`Spliced #${PUZZLE}`)).toBeInTheDocument();
    const chip = document.querySelector('.vfd-ghost');
    expect(chip).toHaveAttribute('title', 'Racing Sam');
    expect(chip).toHaveTextContent('Sam 1:30');
    expect(document.querySelector('.vfd-msg')).toHaveTextContent(
      /Racing Sam’s ghost: beat 1:30 with fewer mistakes/
    );
    // The link was consumed and the ghost kept for a reload mid-race.
    expect(location.search).toBe('');
    expect(JSON.parse(localStorage.getItem('spliced:ghost')!)).toEqual({
      code,
      name: 'Sam',
    });
  });

  it('tells you when a ghost link was for another day', async () => {
    stubFetch();
    const def = puzzleDef(slicedTracks(), CLIPS, 4);
    const code = encodeGhost(
      { ...newGame(def, 3), status: 'lost', mistakes: 4 },
      PUZZLE - 1
    );
    history.replaceState(null, '', `/?g=${code}&n=Sam`);
    const DailyGame = await loadDailyGame();
    await act(async () => {
      render(<DailyGame {...props} />);
    });
    expect(await screen.findByText(`Spliced #${PUZZLE}`)).toBeInTheDocument();
    expect(
      screen.getByText(/Sam’s link was for Spliced #11\. Here’s today’s mix/)
    ).toBeInTheDocument();
    expect(document.querySelector('.vfd-ghost')).toBeNull();
  });

  it('requests an archive date and shows the archive notice', async () => {
    const fetchMock = stubFetch({ daily: payload(10) });
    const DailyGame = await loadDailyGame();
    await act(async () => {
      render(<DailyGame {...props} date="2026-01-11" />);
    });
    expect(await screen.findByText('Spliced #10')).toBeInTheDocument();
    expect(requested(fetchMock)).toEqual(['/api/daily?date=2026-01-11']);
    const notice = screen.getByText(/From the archive: Spliced #10/);
    expect(notice).toHaveTextContent('2026');
    expect(
      screen.getByRole('button', { name: 'Back to today' })
    ).toBeInTheDocument();
  });

  it('does not fall back to /api/daily for an archive date that 404s', async () => {
    const fetchMock = stubFetch({ dated: 404 });
    const DailyGame = await loadDailyGame();
    await act(async () => {
      render(<DailyGame {...props} date="2026-01-11" />);
    });
    expect(await screen.findByText(/The tape snapped/)).toBeInTheDocument();
    expect(requested(fetchMock)).toEqual(['/api/daily?date=2026-01-11']);
    expect(
      screen.getByRole('button', { name: 'Back to today' })
    ).toBeInTheDocument();
  });
});

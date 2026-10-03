import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useReveals } from './useReveals.js';
import type { GameState } from '../../game/engine.js';
import type { Track } from '../../types.js';

const CLIPS = 2;

// /api/reveal caches successful lookups per ref for the life of the module,
// so every test uses refs of its own.
let run = 0;
function makeTracks(n = 2): Track[] {
  run++;
  return Array.from({ length: n }, (_, t) => ({
    id: `t${t}`,
    ref: `r${run}.${t}`,
    previewUrl: 'https://example.test/p.m4a',
    buffer: {} as AudioBuffer,
    duration: 10,
    pieces: Array.from({ length: CLIPS }, (_, i) => ({
      id: `t${t}-${i}`,
      trackId: `t${t}`,
      correctIndex: i,
      offset: i,
      duration: 1,
      peaks: [],
    })),
  }));
}

// Row-major board: row r holds track r's clips, in whatever order given.
function state(order: string[], patch: Partial<GameState> = {}): GameState {
  return {
    order,
    solved: [],
    mistakes: 0,
    attempts: [],
    tried: {},
    status: 'playing',
    elapsedMs: 0,
    ...patch,
  };
}

type Call = { part: string | null; ref: string | null; order: string | null };

function stubFetch(respond: (call: Call) => Response | Promise<Response> = ok) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const q = new URL(String(input), 'http://x').searchParams;
    return respond({
      part: q.get('part'),
      ref: q.get('ref'),
      order: q.get('order'),
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function ok(call: Call): Response {
  const n = call.ref?.slice(-1);
  const body =
    call.part === 'choices'
      ? {
          choices: [
            { title: `Song ${n}`, artist: `Artist ${n}` },
            { title: 'Decoy', artist: 'Nobody' },
          ],
        }
      : { title: `Song ${n}`, artist: `Artist ${n}` };
  return new Response(JSON.stringify(body));
}

const asked = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.map(([u]) => {
    const q = new URL(String(u), 'http://x').searchParams;
    return `${q.get('part')}:${q.get('ref')}`;
  });

function setup(tracks: Track[], initial: GameState, onAnswers?: () => void) {
  return renderHook(
    ({ s }: { s: GameState }) => useReveals(tracks, s, CLIPS, onAnswers),
    { initialProps: { s: initial } }
  );
}

describe('useReveals', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('fetches a row’s choices once it is solved, and its answer only after a pick', async () => {
    const fetchMock = stubFetch();
    const tracks = makeTracks();
    const [r0, r1] = tracks.map((t) => t.ref!);
    const board = ['t0-0', 't0-1', 't1-1', 't1-0'];
    const { result, rerender } = setup(tracks, state(board));

    // Nothing earned yet.
    expect(result.current.reveals).toEqual({});
    expect(result.current.hasQuiz('t0')).toBe(true);
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();

    rerender({ s: state(board, { solved: ['t0'] }) });
    await waitFor(() =>
      expect(result.current.reveals.t0?.choices).toHaveLength(2)
    );
    expect(asked(fetchMock)).toEqual([`choices:${r0}`]);
    expect(result.current.reveals.t0?.answer).toBeUndefined();
    expect(result.current.hasQuiz('t0')).toBe(true);

    // Naming the song (right or wrong) earns the title.
    rerender({ s: state(board, { solved: ['t0'], named: { t0: false } }) });
    await waitFor(() =>
      expect(result.current.reveals.t0?.answer).toEqual({
        title: 'Song 0',
        artist: 'Artist 0',
      })
    );
    expect(asked(fetchMock)).toEqual([`choices:${r0}`, `answer:${r0}`]);
    // The other row is still untouched.
    expect(asked(fetchMock)).not.toContain(`choices:${r1}`);
    expect(result.current.reveals.t1).toBeUndefined();
  });

  it('passes the row’s clips on the board as the order proof', async () => {
    const fetchMock = stubFetch();
    const tracks = makeTracks();
    // Row 1 is track t1 with its clips as they sit: 't1-1','t1-0'.
    const board = ['t0-1', 't0-0', 't1-1', 't1-0'];
    const { rerender } = setup(tracks, state(board));
    rerender({ s: state(board, { solved: ['t1'] }) });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://x');
    expect(url.pathname).toBe('/api/reveal');
    expect(url.searchParams.get('ref')).toBe(tracks[1].ref);
    expect(url.searchParams.get('part')).toBe('choices');
    expect(url.searchParams.get('order')).toBe('t1-1,t1-0');
  });

  it('fetches every unsolved answer when the game ends, and reports them', async () => {
    const fetchMock = stubFetch();
    const onAnswers = vi.fn();
    const tracks = makeTracks();
    const [r0, r1] = tracks.map((t) => t.ref!);
    const board = ['t0-0', 't0-1', 't1-0', 't1-1'];
    const { result, rerender } = setup(tracks, state(board), onAnswers);
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onAnswers).toHaveBeenLastCalledWith({});

    rerender({ s: state(board, { status: 'lost' }) });
    await waitFor(() => {
      expect(result.current.reveals.t0?.answer).toBeDefined();
      expect(result.current.reveals.t1?.answer).toBeDefined();
    });
    expect(asked(fetchMock).sort()).toEqual([`answer:${r0}`, `answer:${r1}`]);
    // A song never found gets no quiz.
    expect(asked(fetchMock)).not.toContain(`choices:${r0}`);
    expect(onAnswers).toHaveBeenLastCalledWith({
      t0: { title: 'Song 0', artist: 'Artist 0' },
      t1: { title: 'Song 1', artist: 'Artist 1' },
    });
  });

  it('holds a solved row’s title back after the game ends until its quiz is done', async () => {
    const fetchMock = stubFetch();
    const tracks = makeTracks();
    const [r0, r1] = tracks.map((t) => t.ref!);
    const board = ['t0-0', 't0-1', 't1-0', 't1-1'];
    const { result, rerender } = setup(
      tracks,
      state(board, { solved: ['t0'], status: 'lost' })
    );
    await waitFor(() => {
      expect(result.current.reveals.t0?.choices).toBeDefined();
      expect(result.current.reveals.t1?.answer).toBeDefined();
    });
    expect(asked(fetchMock)).not.toContain(`answer:${r0}`);
    expect(asked(fetchMock)).toContain(`answer:${r1}`);

    rerender({
      s: state(board, { solved: ['t0'], status: 'lost', named: { t0: true } }),
    });
    await waitFor(() =>
      expect(result.current.reveals.t0?.answer).toBeDefined()
    );
  });

  it('retries failed choices twice, then gives up the quiz', async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch(
      (call) =>
        new Response(call.part === 'choices' ? 'nope' : '{}', { status: 500 })
    );
    const tracks = makeTracks(1);
    const board = ['t0-0', 't0-1'];
    const { result } = setup(tracks, state(board, { solved: ['t0'] }));

    const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.reveals.t0).toBeUndefined();
    expect(result.current.hasQuiz('t0')).toBe(true);

    // Second try after 3s.
    await act(() => vi.advanceTimersByTimeAsync(2999));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Third and last.
    await act(() => vi.advanceTimersByTimeAsync(3000));
    const choiceCalls = () =>
      asked(fetchMock).filter((k) => k.startsWith('choices:'));
    expect(choiceCalls()).toHaveLength(3);
    expect(result.current.reveals.t0).toMatchObject({ noQuiz: true });
    expect(result.current.hasQuiz('t0')).toBe(false);

    // No fourth try for the choices; without a quiz the title is due now.
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(choiceCalls()).toHaveLength(3);
    expect(
      asked(fetchMock).filter((k) => k.startsWith('answer:')).length
    ).toBeGreaterThan(0);
  });

  it('marks an answer stuck after three failures, and retry() tries again', async () => {
    vi.useFakeTimers();
    let fail = true;
    const fetchMock = stubFetch((call) =>
      fail ? new Response('', { status: 502 }) : ok(call)
    );
    const tracks = makeTracks(1);
    const board = ['t0-0', 't0-1'];
    const { result } = setup(tracks, state(board, { status: 'lost' }));

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(3000));
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.reveals.t0).toEqual({ stuck: true });

    // Stuck: no more automatic retries.
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fail = false;
    act(() => result.current.retry('t0'));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.current.reveals.t0).toEqual({
      stuck: false,
      answer: { title: 'Song 0', artist: 'Artist 0' },
    });
  });

  it('revealAnswer fetches on demand and reuses a known answer', async () => {
    const fetchMock = stubFetch();
    const tracks = makeTracks(1);
    const board = ['t0-1', 't0-0'];
    const { result } = setup(tracks, state(board));
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();

    let song: unknown;
    await act(async () => {
      song = await result.current.revealAnswer('t0');
    });
    expect(song).toEqual({ title: 'Song 0', artist: 'Artist 0' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://x');
    expect(url.searchParams.get('order')).toBe('t0-1,t0-0');
    expect(result.current.reveals.t0?.answer).toEqual(song);

    await act(async () => {
      song = await result.current.revealAnswer('t0');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await result.current.revealAnswer('missing')).toBeNull();
  });

  it('uses inline answers/choices for tracks without a ref', async () => {
    const fetchMock = stubFetch();
    const tracks = makeTracks().map((t, i) => ({
      ...t,
      ref: undefined,
      answer: { title: `Local ${i}`, artist: 'Me' },
      choices: i === 0 ? [{ title: `Local ${i}`, artist: 'Me' }] : [],
    }));
    const { result } = setup(
      tracks,
      state(['t0-0', 't0-1', 't1-0', 't1-1'], { solved: ['t0', 't1'] })
    );
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.reveals.t0).toMatchObject({
      answer: { title: 'Local 0' },
      noQuiz: false,
    });
    expect(result.current.reveals.t1).toMatchObject({ noQuiz: true });
    expect(result.current.hasQuiz('t0')).toBe(true);
    expect(result.current.hasQuiz('t1')).toBe(false);
  });
});

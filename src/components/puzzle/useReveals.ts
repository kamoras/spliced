// Quiz choices and answers arrive from /api/reveal only when earned: a row's
// choices once it's spliced, its title once the quiz is answered or skipped
// (or, for a song never found, when the game ends). Failed lookups retry a
// couple of times before a row gives up its quiz or asks you to retry.

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAnswer, fetchChoices } from '../../game/reveal.js';
import type { GameState } from '../../game/engine.js';
import type { Choice, Song, Track } from '../../types.js';

// What /api/reveal has handed over for a row so far.
export interface Reveal {
  choices?: Choice[];
  answer?: Song;
  // No quiz for this row (none offered, or the choices couldn't load).
  noQuiz?: boolean;
  // The answer lookup gave up; the card offers a retry.
  stuck?: boolean;
}

const MAX_TRIES = 3;
const RETRY_MS = 3000;

export function useReveals(
  tracks: Track[],
  state: GameState,
  clipsPerTrack: number,
  onAnswers?: (answers: Record<string, Song>) => void
) {
  const over = state.status !== 'playing';
  // A row's clips as they sit on the board: once solved (or revealed at the
  // end) that is the right order, which is the proof /api/reveal asks for.
  const rowOrder = useCallback(
    (trackId: string) => {
      const r = tracks.findIndex((t) => t.id === trackId);
      return state.order.slice(r * clipsPerTrack, (r + 1) * clipsPerTrack);
    },
    [tracks, state.order, clipsPerTrack]
  );
  const [reveals, setReveals] = useState<Record<string, Reveal>>(() =>
    Object.fromEntries(
      tracks
        .filter((t) => t.answer || t.choices)
        .map((t) => [
          t.id,
          {
            answer: t.answer,
            choices: t.choices,
            noQuiz: !t.choices?.length,
          },
        ])
    )
  );
  const failures = useRef<Record<string, number>>({});
  const pending = useRef(new Set<string>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [retryTick, setRetryTick] = useState(0);
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  const merge = useCallback(
    (id: string, patch: Reveal) =>
      setReveals((r) => ({ ...r, [id]: { ...r[id], ...patch } })),
    []
  );

  useEffect(() => {
    const failed = (key: string, giveUp: () => void) => {
      const n = (failures.current[key] = (failures.current[key] ?? 0) + 1);
      if (n < MAX_TRIES) {
        timers.current.push(
          setTimeout(() => setRetryTick((t) => t + 1), RETRY_MS)
        );
      } else giveUp();
    };
    const once = <T>(key: string, get: () => Promise<T>) => {
      if (pending.current.has(key)) return null;
      pending.current.add(key);
      return get().finally(() => pending.current.delete(key));
    };
    tracks.forEach((t) => {
      const ref = t.ref;
      if (!ref) return;
      const r = reveals[t.id] ?? {};
      const solved = state.solved.includes(t.id);
      const answered = state.named?.[t.id] != null;
      if (solved && !answered && !r.choices && !r.noQuiz) {
        once(`c:${t.id}`, () => fetchChoices(ref, rowOrder(t.id)))?.then(
          (choices) =>
            merge(t.id, choices.length ? { choices } : { noQuiz: true }),
          () => failed(`c:${t.id}`, () => merge(t.id, { noQuiz: true }))
        );
      }
      // A solved row's title waits for its quiz (even after the game ends),
      // so it can't be read in the crate or network panel before a pick.
      const due = solved ? answered || r.noQuiz : over;
      if (!r.answer && !r.stuck && due) {
        once(`a:${t.id}`, () => fetchAnswer(ref, rowOrder(t.id)))?.then(
          (answer) => merge(t.id, { answer }),
          () => failed(`a:${t.id}`, () => merge(t.id, { stuck: true }))
        );
      }
    });
  }, [
    tracks,
    reveals,
    state.solved,
    state.named,
    over,
    retryTick,
    merge,
    rowOrder,
  ]);

  const onAnswersRef = useRef(onAnswers);
  onAnswersRef.current = onAnswers;
  useEffect(() => {
    const answers: Record<string, Song> = {};
    Object.entries(reveals).forEach(([id, r]) => {
      if (r.answer) answers[id] = r.answer;
    });
    onAnswersRef.current?.(answers);
  }, [reveals]);

  // Try a stuck row again (from the card's Retry).
  const retry = useCallback(
    (trackId: string) => {
      delete failures.current[`a:${trackId}`];
      merge(trackId, { stuck: false });
    },
    [merge]
  );

  // Fetch (and keep) a row's answer now: the quiz needs it to grade a pick.
  const revealAnswer = useCallback(
    async (trackId: string): Promise<Song | null> => {
      const t = tracks.find((x) => x.id === trackId);
      const known = reveals[trackId]?.answer;
      if (known) return known;
      if (!t?.ref) return null;
      const answer = await fetchAnswer(t.ref, rowOrder(trackId));
      merge(trackId, { answer });
      return answer;
    },
    [tracks, reveals, merge, rowOrder]
  );

  const hasQuiz = useCallback(
    (trackId: string) => {
      const t = tracks.find((x) => x.id === trackId);
      return t?.ref ? !reveals[trackId]?.noQuiz : Boolean(t?.choices?.length);
    },
    [tracks, reveals]
  );

  return { reveals, hasQuiz, revealAnswer, retry };
}

// The mixer board: sort shuffled clips into rows, one song per row, in order.
// All rules live in the pure engine (../game/engine.ts); this component turns
// them into something that feels good: listening tools (clips, seams, whole
// rows), swaps, marks, and the "splice" when a song locks in. The clock,
// reveals, audio and ghost commentary each live in their own hook under
// ./puzzle/.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSwappingStrategy } from '@dnd-kit/sortable';

import SongCard from './SongCard.jsx';
import ChannelStrip from './puzzle/ChannelStrip.jsx';
import { Display } from './puzzle/Display.jsx';
import { useGameClock } from './puzzle/useGameClock.js';
import { useReveals } from './puzzle/useReveals.js';
import { useBoardAudio } from './puzzle/useBoardAudio.js';
import { useGhostTicker } from './puzzle/useGhostTicker.js';
import { prefersReducedMotion } from '../audio/meter.js';
import { shufflePieces } from '../audio/puzzle.js';
import { formatDuration } from '../daily/storage.js';
import { puzzleDef } from '../game/def.js';
import {
  clipKey,
  hasHeard,
  hasHeardClip,
  hear,
  rowPlayKey,
  seamKey,
  clueLabel,
  isRowLocked,
  rowTrack,
  moveClip,
  canMove,
  chainOf,
  isBadJoin,
  isLinked,
  nameTrack,
  newGame,
  rowsOf,
  spliceJoin,
  takesOf,
} from '../game/engine.js';
import type { GameState, Ghost } from '../game/engine.js';
import type { SeamState } from './puzzle/ChannelStrip.jsx';
import type { Choice, Piece, Song, Track } from '../types.js';

export { puzzleDef } from '../game/def.js';

// Song-card label stripes.
export const SONG_HUES = [
  '#7c5cff',
  '#ff4f8b',
  '#14a7bd',
  '#ff7a2f',
  '#3f7bff',
  '#b24dff',
];

const vibrate = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
};

// Things the page around the board reacts to (the logo's fader cap).
export type BoardEvent = 'new' | 'win';

export interface PuzzleProps {
  tracks: Track[];
  clipsPerTrack: number;
  maxGuesses: number;
  seed?: number;
  label: string;
  initialState?: GameState | null;
  sfx?: boolean;
  // Master volume 0..1 (0 = muted; mutes sound effects too).
  volume?: number;
  // Pause the clock (e.g. while a dialog is open).
  paused?: boolean;
  // Hard mode: recorded with the game (the mistake cap is in maxGuesses).
  hard?: boolean;
  // A friend's run to race (daily only).
  ghost?: { ghost: Ghost; name: string } | null;
  // Take keyboard focus on mount (the control that opened this board is gone).
  focusOnMount?: boolean;
  // Bump to replay the win mixtape (the results panel's encore key).
  encore?: number;
  onChange?: (state: GameState) => void;
  // Fires once, the moment a live game ends (not when restoring a finished
  // one): save the result here.
  onFinish?: (state: GameState) => void;
  // Fires once the ending has played out (celebration, last quiz): show the
  // results now. Also fires on mount for an already-finished game.
  onSettled?: (state: GameState) => void;
  // Answers revealed so far (track id -> song), for the crate.
  onAnswers?: (answers: Record<string, Song>) => void;
  onBoardEvent?: (event: BoardEvent) => void;
}

const COACH = [
  'Tap any clip to hear it.',
  'Turn a knob to hear the join between two clips. Sounds right? SPLICE it.',
  'Tap ⇄ on another clip to move a clip next to its neighbour.',
];

export default function Puzzle({
  tracks,
  clipsPerTrack,
  maxGuesses,
  seed,
  label,
  initialState,
  sfx = true,
  volume = 0.85,
  paused = false,
  hard = false,
  ghost,
  focusOnMount = false,
  encore = 0,
  onChange,
  onFinish,
  onSettled,
  onAnswers,
  onBoardEvent,
}: PuzzleProps) {
  const def = useMemo(
    () => puzzleDef(tracks, clipsPerTrack, maxGuesses),
    [tracks, clipsPerTrack, maxGuesses]
  );
  const [state, setState] = useState<GameState>(
    () => initialState ?? { ...newGame(def, seed), ...(hard ? { hard } : {}) }
  );
  const over = state.status !== 'playing';
  const fresh = !initialState;

  const pieceById = useMemo(() => {
    const map = new Map<string, Piece>();
    tracks.forEach((t) => t.pieces.forEach((p) => map.set(p.id, p)));
    return map;
  }, [tracks]);
  const pieceIds = useMemo(() => [...pieceById.keys()], [pieceById]);
  const trackIndex = useMemo(
    () => new Map(tracks.map((t, i) => [t.id, i])),
    [tracks]
  );

  // Letters, shuffled by seed so a clip's letter says nothing about its song
  // or slot. The letter is the clip's identity as it moves around.
  const letters = useMemo(() => {
    const all = tracks.flatMap((t) => t.pieces);
    const tokenSeed = typeof seed === 'number' ? seed + 1009 : undefined;
    const map = new Map<string, string>();
    shufflePieces(all, tokenSeed).forEach((p, i) =>
      map.set(p.id, String.fromCharCode(65 + i))
    );
    return map;
  }, [tracks, seed]);
  const letterOf = useCallback(
    (id: string) => letters.get(id) ?? '?',
    [letters]
  );

  // ---- persistence + clock -------------------------------------------------
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const stateRef = useRef(state);
  stateRef.current = state;
  const clockRef = useRef<{ elapsedNow: () => number } | null>(null);
  const persist = useCallback(() => {
    onChangeRef.current?.({
      ...stateRef.current,
      elapsedMs: clockRef.current?.elapsedNow() ?? stateRef.current.elapsedMs,
    });
  }, []);
  // ---- reveals ------------------------------------------------------------------
  const { reveals, hasQuiz, revealAnswer, retry } = useReveals(
    tracks,
    state,
    clipsPerTrack,
    onAnswers
  );
  // A name-that-tune quiz is open (the clock pauses: naming isn't timed).
  const quizPending = state.solved.some(
    (id) => state.named?.[id] == null && hasQuiz(id)
  );

  const clock = useGameClock({
    initialMs: initialState?.elapsedMs ?? 0,
    over,
    paused: paused || quizPending,
    onHide: persist,
  });
  clockRef.current = clock;
  const { elapsedNow, beginTiming } = clock;
  useEffect(() => {
    persist();
  }, [state, persist]);

  // ---- audio ---------------------------------------------------------------
  const {
    player,
    cue,
    playing,
    setPlaying,
    stopAll,
    playPiece,
    progressGetters,
  } = useBoardAudio({ sfx, volume, pieceIds });

  // Record a new listen (replays of anything heard are free).
  const listen = (key: string) => {
    beginTiming();
    setState((s) => hear(s, key));
  };

  // ---- coach line, feedback, and moment-to-moment animation ----------------
  const [coach, setCoach] = useState(fresh ? 0 : 3);
  const [message, setMessage] = useState<string | null>(() => {
    if (ghost && fresh) {
      const g = ghost.ghost;
      return `Racing ${ghost.name}’s ghost: ${g.won ? `${g.mistakes} ${g.mistakes === 1 ? 'mistake' : 'mistakes'} in ${formatDuration(g.elapsedMs)}` : 'they lost'}. Fewer mistakes wins, then faster.`;
    }
    if (initialState && initialState.status === 'playing') {
      const left = tracks.length - initialState.solved.length;
      return `Welcome back. ${left} ${left === 1 ? 'song' : 'songs'} to go.`;
    }
    return null;
  });
  const [cued, setCued] = useState<string | null>(null);
  const [flash, setFlash] = useState<string[]>([]);
  const [splicing, setSplicing] = useState<number | null>(null);
  const [shake, setShake] = useState<{ row: number; n: number } | null>(null);
  const [freshCard, setFreshCard] = useState<string | null>(null);
  const [ledPop, setLedPop] = useState<number | null>(null);
  const [chase, setChase] = useState(false);
  const justDragged = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);
  const later = (fn: () => void, ms: number) =>
    timers.current.push(setTimeout(fn, ms));
  // A passing note on the display (a swap, a quiz result) that gives way to
  // the coach line again after a moment.
  const note = (text: string, ms = 1600) => {
    setMessage(text);
    later(() => setMessage((m) => (m === text ? null : m)), ms);
  };
  // Own feedback (as opposed to ghost commentary) stamps its time.
  const ownMessageAt = useRef(0);
  const tell = (text: string | null) => {
    ownMessageAt.current = Date.now();
    setMessage(text);
  };

  // Power-on sweep, once per session.
  const [booting, setBooting] = useState(() => {
    try {
      if (sessionStorage.getItem('spliced:booted')) return false;
    } catch {
      /* storage unavailable */
    }
    return !prefersReducedMotion();
  });
  useEffect(() => {
    if (!booting) return undefined;
    try {
      sessionStorage.setItem('spliced:booted', '1');
    } catch {
      /* storage unavailable */
    }
    const id = setTimeout(() => setBooting(false), 1300);
    return () => clearTimeout(id);
  }, [booting]);

  // A fresh board: let the logo's fader cap drop back down.
  const onBoardEventRef = useRef(onBoardEvent);
  onBoardEventRef.current = onBoardEvent;
  useEffect(() => {
    if (!initialState || initialState.status === 'playing') {
      onBoardEventRef.current?.('new');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc cancels a cued clip.
  useEffect(() => {
    if (!cued) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCued(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [cued]);

  // ---- focus ----------------------------------------------------------------
  const boardRef = useRef<HTMLOListElement | null>(null);
  useEffect(() => {
    if (!focusOnMount) return;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    boardRef.current
      ?.querySelector<HTMLElement>('.tile-face')
      ?.focus({ preventScroll: true });
  }, [focusOnMount]);
  // When a strip turns into a song card (or a quiz closes), the focused
  // button disappears: move focus to that song's card instead of <body>.
  const focusSong = useRef<string | null>(null);
  useEffect(() => {
    const trackId = focusSong.current;
    if (!trackId) return;
    focusSong.current = null;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    const card = boardRef.current?.querySelector(`[data-track="${trackId}"]`);
    const target =
      card?.querySelector<HTMLElement>('.quiz-choice') ??
      card?.querySelector<HTMLElement>('.song-play');
    target?.focus();
  });

  // ---- ghost race ticker ------------------------------------------------------
  // Ghost commentary never talks over your own feedback.
  useGhostTicker({
    ghost,
    over,
    startMs: initialState?.elapsedMs ?? 0,
    elapsedNow,
    say: (text) => {
      if (Date.now() - ownMessageAt.current < 2500) return;
      note(text, 2500);
    },
  });

  // ---- board derivations -----------------------------------------------------
  const rows = rowsOf(state, def);
  const busy = splicing != null;
  const unlockedIds = over
    ? []
    : rows.flatMap((ids, r) => (isRowLocked(state, def, r) ? [] : ids));
  const lastRow =
    !over && state.solved.length === def.tracks.length - 1
      ? rows.findIndex((_, r) => !isRowLocked(state, def, r))
      : null;
  const rowOfId = (id: string) =>
    Math.floor(state.order.indexOf(id) / clipsPerTrack);
  const labelOf = (trackId: string) => {
    const ti = trackIndex.get(trackId) ?? 0;
    return clueLabel(def.tracks[ti]?.clue ?? {}, ti);
  };
  // A join counts as heard on its own or inside a channel play.
  const heardJoin = (a: string, b: string) =>
    hasHeard(state, seamKey(a, b)) ||
    Boolean(
      state.heard?.some((k) => k.startsWith('r:') && k.includes(`${a},${b}`))
    );
  const seamState = (a: string, b: string): SeamState =>
    isLinked(state, a, b)
      ? 'linked'
      : isBadJoin(state, a, b)
        ? 'bad'
        : heardJoin(a, b)
          ? 'heard'
          : 'open';

  // ---- interactions -----------------------------------------------------------
  function tapClip(piece: Piece, fraction: number | null) {
    if (Date.now() - justDragged.current < 250) return;
    if (coach === 0) {
      setCoach(1);
      setMessage(null);
    }
    setCued(over ? null : piece.id);
    if (fraction == null) listen(clipKey(piece.id));
    else beginTiming();
    playPiece(piece, fraction ?? 0);
  }

  function afterMove() {
    beginTiming();
    cue('swap');
    if (coach <= 1) setCoach(2);
    if (playing?.kind === 'row' || playing?.kind === 'seam') stopAll();
  }

  function swapWith(targetId: string) {
    if (!cued || busy) return;
    const next = moveClip(state, def, cued, targetId);
    setCued(null);
    if (next === state) return;
    afterMove();
    // Say what actually moved: a taped run travels as one, and a move
    // across rows trades it for an equal-length run on the other side.
    const moved = chainOf(state, def, cued);
    // The run that took the moved run's place (a cross-row trade may nudge
    // the target so an equal-length block fits), read off the result.
    const fromStart = state.order.indexOf(moved[0]);
    const target = next.order.slice(fromStart, fromStart + moved.length);
    const rowOf = (id: string) => rows.findIndex((r) => r.includes(id));
    const sameRow = rowOf(cued) === rowOf(targetId);
    const run = (ids: string[]) => ids.map(letterOf).join('+');
    setFlash(sameRow ? [...moved, targetId] : [...moved, ...target]);
    later(() => setFlash([]), 260);
    note(
      sameRow
        ? moved.length > 1
          ? `Moved ${run(moved)} next to ${letterOf(targetId)}.`
          : `Swapped ${letterOf(cued)} and ${letterOf(targetId)}.`
        : `Swapped ${run(moved)} with ${run(target)}.`
    );
    setState(next);
    // Keep keyboard focus on the board: the ⇄ button that was pressed is gone.
    focusTile(targetId);
  }

  function focusTile(id: string) {
    requestAnimationFrame(() =>
      boardRef.current
        ?.querySelector<HTMLElement>(`[data-piece="${id}"] .tile-face`)
        ?.focus()
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    justDragged.current = Date.now();
    const { active, over: target } = event;
    if (!target || busy || active.id === target.id) return;
    const next = moveClip(state, def, String(active.id), String(target.id));
    if (next === state) return;
    afterMove();
    setCued(null);
    setMessage(null);
    setState(next);
  }

  function playSeam(row: number, seam: number) {
    if (
      playing?.kind === 'seam' &&
      playing.row === row &&
      playing.seam === seam
    ) {
      return stopAll(true);
    }
    const a = pieceById.get(rows[row][seam]);
    const b = pieceById.get(rows[row][seam + 1]);
    if (!a || !b) return;
    cue('detent');
    listen(seamKey(a.id, b.id));
    if (coach === 1) setCoach(2);
    note(`Hearing ${letterOf(a.id)} into ${letterOf(b.id)}. Does it carry on?`);
    setPlaying({ kind: 'seam', row, seam });
    player.playSeam(a, b, () =>
      setPlaying((p) =>
        p?.kind === 'seam' && p.row === row && p.seam === seam ? null : p
      )
    );
  }

  function playRow(row: number) {
    cue('click');
    if (playing?.kind === 'row' && playing.row === row) return stopAll(true);
    listen(rowPlayKey(rows[row]));
    const seq = rows[row].flatMap((id) => pieceById.get(id) ?? []);
    setPlaying({ kind: 'row', row, id: null });
    player.playSequence(seq, {
      onPiece: (i) => setPlaying({ kind: 'row', row, id: seq[i]?.id ?? null }),
      onEnd: () => setPlaying(null),
    });
  }

  const playSong = useCallback(
    (trackId: string, delay = 0) => {
      const track = tracks[trackIndex.get(trackId) ?? -1];
      if (!track) return;
      setPlaying({ kind: 'song', trackId, id: null });
      player.playSequence(track.pieces, {
        delay,
        onPiece: (i) =>
          setPlaying({
            kind: 'song',
            trackId,
            id: track.pieces[i]?.id ?? null,
          }),
        onEnd: () => setPlaying(null),
      });
    },
    [player, tracks, trackIndex, setPlaying]
  );

  // The win medley: each song's middle clips, in timeline order, crossfaded.
  const playMixtape = useCallback(() => {
    const segments = tracks.map((t) => {
      const mid = Math.max(0, Math.floor(t.pieces.length / 2) - 1);
      return t.pieces.slice(mid, mid + 2);
    });
    const years = def.tracks.map((t, i) => clueLabel(t.clue ?? {}, i));
    player.playMixtape(segments, {
      onSegment: (i) => {
        setPlaying({ kind: 'song', trackId: tracks[i].id, id: null });
        setMessage(
          `MIXTAPE ▸ ${years.map((y, k) => (k === i ? `[${y}]` : y)).join(' ▸ ')}`
        );
      },
      onEnd: () => {
        setPlaying(null);
        setMessage('★ MASTER MIX COMPLETE ★');
      },
    });
  }, [player, tracks, def.tracks, setPlaying]);

  // The results panel's PLAY MIXTAPE key asks for an encore.
  const encoreSeen = useRef(encore);
  useEffect(() => {
    if (encore !== encoreSeen.current) {
      encoreSeen.current = encore;
      playMixtape();
    }
  }, [encore, playMixtape]);

  function toggleSong(trackId: string) {
    cue('click');
    if (playing?.kind === 'song' && playing.trackId === trackId) stopAll(true);
    else playSong(trackId);
  }

  const naming = useRef(false);
  async function answerName(trackId: string, choice: Choice | null) {
    // Keep the quiz mounted (and focused) while another row's completion
    // plays out; just ignore picks until it settles.
    if (naming.current || busy) return;
    naming.current = true;
    let answer: Song | null = null;
    try {
      // The answer is only fetched now, once you've committed to a pick.
      answer = await revealAnswer(trackId);
    } catch {
      setMessage('Couldn’t reach the studio to check that. Try again.');
      return;
    } finally {
      naming.current = false;
    }
    const correct =
      choice != null &&
      choice.title === answer?.title &&
      choice.artist === answer?.artist;
    if (choice) cue(correct ? 'star' : 'buzzer');
    if (correct) vibrate(15);
    if (answer) {
      setMessage(
        correct
          ? `🎵 Named it! ${answer.title} by ${answer.artist}.`
          : `It was ${answer.title} by ${answer.artist}.`
      );
    }
    focusSong.current = trackId;
    setState((s) => nameTrack(s, trackId, correct));
  }

  // ---- the ending -------------------------------------------------------------
  // The result is saved the moment the game ends (onFinish). The results
  // panel waits (onSettled) until the celebration has played and the last
  // quiz is answered or skipped, so the win isn't celebrated off-screen.
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const settled = useRef(false);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  useEffect(() => {
    if (settled.current || !over) return undefined;
    // A board restored already finished: nothing to wait for.
    if (endedAt == null) {
      if (!fresh && initialState && initialState.status !== 'playing') {
        settled.current = true;
        onSettledRef.current?.(state);
      }
      return undefined;
    }
    if (quizPending) return undefined;
    const minWait = state.status === 'won' ? 1600 : 900;
    const id = setTimeout(
      () => {
        settled.current = true;
        onSettledRef.current?.(stateRef.current);
      },
      Math.max(0, endedAt + minWait - Date.now())
    );
    return () => clearTimeout(id);
  }, [over, endedAt, quizPending, state, fresh, initialState]);

  function endGame(next: GameState) {
    clock.finish();
    onFinish?.({ ...next, elapsedMs: elapsedNow() });
    setEndedAt(Date.now());
  }

  function celebrate(next: GameState) {
    setChase(true);
    later(() => setChase(false), 2400);
    onBoardEventRef.current?.('win');
    endGame(next);
    later(playMixtape, 900);
  }

  // SPLICE the join at `seam` (between clips seam and seam+1) on `row`.
  function splice(row: number, seam: number) {
    if (busy || over) return;
    const ids = rows[row];
    const a = ids[seam];
    const b = ids[seam + 1];
    if (!a || !b) return;
    // Hear it first: a splice is a judgement, not a guess.
    if (seamState(a, b) === 'open') return playSeam(row, seam);
    cue('click');
    beginTiming();
    setCued(null);
    const { state: next, outcome } = spliceJoin(
      { ...state, elapsedMs: elapsedNow() },
      def,
      a,
      b
    );
    if (outcome.kind === 'ignored') return;
    stopAll();
    setCoach(3);
    if (outcome.kind === 'repeat') {
      setMessage(
        `${letterOf(a)} and ${letterOf(b)} already proved not to join.`
      );
      return;
    }

    if (outcome.kind === 'fused') {
      vibrate(20);
      setFlash([a, b]);
      later(() => setFlash([]), 420);
      const completed = outcome.completed;
      if (!completed) {
        cue('slide');
        const chain = chainOf(next, def, a);
        const left = def.clipsPerTrack - chain.length;
        tell(
          `Spliced ${letterOf(a)} and ${letterOf(b)}. ${left} more ${left === 1 ? 'join' : 'joins'} finishes this song.`
        );
        setState(next);
        // The reward for a good ear is more music: hear the run you've built.
        const run = chain.flatMap((id) => pieceById.get(id) ?? []);
        setPlaying({ kind: 'row', row, id: null });
        player.playSequence(run, {
          delay: 0.25,
          onPiece: (i) =>
            setPlaying({ kind: 'row', row, id: run[i]?.id ?? null }),
          onEnd: () => setPlaying(null),
        });
        // The SPLICE key is gone (it's tape now): keep focus on the board.
        focusTile(b);
        return;
      }
      cue(outcome.won ? 'win' : 'open');
      if (outcome.won) clock.finish();
      // Stage 1: the whole channel fuses in place…
      setSplicing(row);
      const songsLeft = def.tracks.length - next.solved.length;
      const togo = outcome.won
        ? ''
        : songsLeft === 1
          ? ' Last one!'
          : ` ${songsLeft} to go.`;
      setMessage(
        `${hasQuiz(completed) ? 'A whole song! Name that tune for a bonus 🎵.' : 'A whole song!'}${togo}`
      );
      later(
        () => {
          // …stage 2: commit, open the channel, and take a victory lap.
          setSplicing(null);
          setFreshCard(completed);
          cue('slide');
          // Keep anything that changed during the splice (a quiz answer,
          // a listen) instead of overwriting it with the pre-splice state.
          focusSong.current = completed;
          setState((cur) => ({ ...next, named: cur.named, heard: cur.heard }));
          if (outcome.won) celebrate(next);
          else playSong(completed, 0.15);
        },
        prefersReducedMotion() ? 150 : 720
      );
      return;
    }

    // Not a join.
    cue(outcome.lost ? 'lose' : 'buzzer');
    vibrate([30, 40, 30]);
    setShake({ row, n: Date.now() });
    later(() => setShake(null), 420);
    setLedPop(next.mistakes);
    later(() => setLedPop(null), 700);
    // The SPLICE key goes dark: hand focus to the knob beside it.
    requestAnimationFrame(() =>
      boardRef.current
        ?.querySelector<HTMLElement>(`[data-seam="${row}-${seam}"] .seam`)
        ?.focus()
    );
    const left = def.maxGuesses - next.mistakes;
    if (outcome.lost) {
      setMessage('Tape jam: out of mistakes. Here’s the mix you were hearing.');
    } else {
      const careful = left === 1 ? ' Careful, last mistake!' : '';
      const first =
        state.attempts.length === 0
          ? ' In a true join the phrase carries straight on, as if nothing was cut.'
          : '';
      tell(
        `Not a join: ${letterOf(a)} doesn’t run into ${letterOf(b)}.${first}${careful}`
      );
    }
    setState(next);
    if (outcome.lost) endGame(next);
  }

  // ---- render -----------------------------------------------------------------
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    })
  );

  const activeId =
    playing?.kind === 'clip'
      ? playing.id
      : playing?.kind === 'row' || playing?.kind === 'song'
        ? playing.id
        : null;
  const cuedLetter = cued ? letterOf(cued) : null;
  const cuedIds = cued ? chainOf(state, def, cued) : [];
  const canSwap = (id: string) => cued != null && canMove(state, def, cued, id);

  function clearCue(e: ReactMouseEvent) {
    if (e.target === e.currentTarget) setCued(null);
  }

  const songsLeft = def.tracks.length - state.solved.length;

  // Which channel's VU should be live right now.
  const meterRow =
    playing?.kind === 'row' || playing?.kind === 'seam'
      ? playing.row
      : playing?.kind === 'clip'
        ? rowOfId(playing.id)
        : playing?.kind === 'song'
          ? rows.findIndex(
              (_, r) => rowTrack(state, def, r) === playing.trackId
            )
          : null;
  const left = Math.max(0, maxGuesses - state.mistakes);
  const vfdMessage =
    message ??
    (over
      ? state.status === 'won'
        ? '★ MASTER MIX COMPLETE ★'
        : 'TAPE JAM: EVERY SONG REVEALED'
      : (COACH[coach] ?? ''));
  const heardClip = (id: string) => over || hasHeardClip(state, id);

  const getProgress = (id: string) => progressGetters.get(id) ?? (() => null);

  return (
    <section
      className={[
        'console',
        'puzzle',
        over && 'is-over',
        booting && 'is-booting',
        chase && 'is-chase',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--cols': clipsPerTrack } as CSSProperties}
      aria-label="Mixing console"
    >
      <Display
        label={label}
        spinning={playing != null}
        ghost={!over ? ghost : null}
        listens={!over && takesOf(state) > 0 ? takesOf(state) : null}
        getElapsed={elapsedNow}
        frozen={over}
        message={vfdMessage}
      />

      <div
        className="peak"
        role="img"
        aria-label={`${left} of ${maxGuesses} mistakes left`}
      >
        <span className="peak-label" aria-hidden="true">
          Peak
        </span>
        {Array.from({ length: maxGuesses }, (_, i) => (
          <span
            key={i}
            className={[
              'lamp',
              i < state.mistakes && 'is-on',
              ledPop === i + 1 && 'is-flare',
            ]
              .filter(Boolean)
              .join(' ')}
          />
        ))}
        <span className="peak-left" aria-hidden="true">
          {left} {left === 1 ? 'mistake' : 'mistakes'} left
        </span>
      </div>

      {/* What's on the tape: each song's year and genre, a hint for grouping
          clips by ear. Rows have no song of their own. */}
      <p className="legend mix-hint" aria-label="Songs in this mix">
        <span className="mix-hint-key">On the tape</span>
        {def.tracks.map((t, i) => (
          <span
            key={t.id}
            className={state.solved.includes(t.id) ? 'is-found' : undefined}
          >
            {clueLabel(t.clue ?? {}, i)}
            {t.clue?.genre ? ` ${t.clue.genre}` : ''}
          </span>
        ))}
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => vibrate(8)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => (justDragged.current = Date.now())}
      >
        <SortableContext items={unlockedIds} strategy={rectSwappingStrategy}>
          {/* Clicking empty board space cancels a cued clip. */}
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
          <ol
            className="board"
            ref={boardRef}
            aria-label={`Channels: ${songsLeft} ${songsLeft === 1 ? 'song' : 'songs'} to find`}
            onClick={clearCue}
          >
            {rows.map((ids, r) => {
              const trackId = rowTrack(state, def, r);
              if (trackId != null) {
                const ti = trackIndex.get(trackId) ?? 0;
                const discovered = state.solved.includes(trackId);
                const reveal = reveals[trackId];
                return (
                  <li
                    key={`song-${trackId}`}
                    data-track={trackId}
                    className="strip strip--song"
                    style={{ '--i': r } as CSSProperties}
                  >
                    <SongCard
                      ch={r + 1}
                      answer={reveal?.answer}
                      hue={SONG_HUES[ti % SONG_HUES.length]}
                      discovered={discovered}
                      playing={
                        playing?.kind === 'song' && playing.trackId === trackId
                      }
                      meter={meterRow === r}
                      onPlay={() => toggleSong(trackId)}
                      choices={discovered ? reveal?.choices : undefined}
                      named={state.named?.[trackId]}
                      onName={(c) => answerName(trackId, c)}
                      onRetry={reveal?.stuck ? () => retry(trackId) : undefined}
                      order={r}
                      label={labelOf(trackId)}
                      fresh={freshCard === trackId}
                    />
                  </li>
                );
              }
              return (
                <ChannelStrip
                  key={`row-${r}`}
                  row={r}
                  pieces={ids.flatMap((id) => pieceById.get(id) ?? [])}
                  splicing={splicing === r}
                  last={lastRow === r}
                  shaking={shake?.row === r}
                  meter={meterRow === r}
                  rowPlaying={playing?.kind === 'row' && playing.row === r}
                  seamPlaying={
                    playing?.kind === 'seam' && playing.row === r
                      ? playing.seam
                      : null
                  }
                  activeId={activeId}
                  cuedIds={cuedIds}
                  cuedLetter={cuedLetter}
                  canSwap={canSwap}
                  flash={flash}
                  busy={busy}
                  letterOf={letterOf}
                  heardClip={heardClip}
                  seamState={seamState}
                  getProgress={getProgress}
                  onTapClip={tapClip}
                  onSwap={swapWith}
                  onSeam={(seam) => playSeam(r, seam)}
                  onSplice={(seam) => splice(r, seam)}
                  onPlay={() => playRow(r)}
                />
              );
            })}
          </ol>
        </SortableContext>
      </DndContext>
    </section>
  );
}

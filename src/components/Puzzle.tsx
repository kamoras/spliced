// The mixer board: sort shuffled clips into rows, one song per row, in order.
// All rules live in the pure engine (../game/engine.ts); this component turns
// them into something that feels good — listening tools (clips, seams, whole
// rows), swaps, marks, and the "splice" when a song locks in.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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

import PieceTile from './PieceTile.jsx';
import SongCard from './SongCard.jsx';
import type { Choice } from './SongCard.jsx';
import Icon from './Icon.jsx';
import { Player } from '../audio/player.js';
import { getAudioContext } from '../audio/slicer.js';
import { shufflePieces } from '../audio/puzzle.js';
import { formatDuration } from '../daily/storage.js';
import {
  hasHeard,
  hear,
  rowPlayKey,
  seamKey,
  isRowLocked,
  moveClip,
  nameTrack,
  newGame,
  rowsOf,
  submitRow,
  triedMarks,
  wrongHint,
} from '../game/engine.js';
import type { GameState, Ghost, Mark, PuzzleDef } from '../game/engine.js';
import type { Piece, Track } from '../types.js';

// Song-card label stripes.
export const SONG_HUES = [
  '#7c5cff',
  '#ff4f8b',
  '#14a7bd',
  '#ff7a2f',
  '#3f7bff',
  '#b24dff',
];

type Playing =
  | { kind: 'clip'; id: string }
  | { kind: 'seam'; row: number; seam: number }
  | { kind: 'row'; row: number; id: string | null }
  | { kind: 'song'; trackId: string; id: string | null }
  | null;

const vibrate = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
};

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

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
  // A friend's run to race (daily only).
  ghost?: { ghost: Ghost; name: string } | null;
  onChange?: (state: GameState) => void;
  // Fires once, when a live game ends (not when restoring a finished one).
  onFinish?: (state: GameState) => void;
}

export function puzzleDef(
  tracks: Track[],
  clipsPerTrack: number,
  maxGuesses: number
): PuzzleDef {
  return {
    clipsPerTrack,
    maxGuesses,
    tracks: tracks.map((t) => ({ id: t.id, pieces: t.pieces })),
  };
}

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
  ghost,
  onChange,
  onFinish,
}: PuzzleProps) {
  const def = useMemo(
    () => puzzleDef(tracks, clipsPerTrack, maxGuesses),
    [tracks, clipsPerTrack, maxGuesses]
  );
  const [state, setState] = useState<GameState>(
    () => initialState ?? newGame(def, seed)
  );

  const pieceById = useMemo(() => {
    const map = new Map<string, Piece>();
    tracks.forEach((t) => t.pieces.forEach((p) => map.set(p.id, p)));
    return map;
  }, [tracks]);
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
  const letterOf = (id: string) => letters.get(id) ?? '?';

  // ---- clock: active time only (pauses on blur, hidden tab, dialogs) -------
  const accumulated = useRef(initialState?.elapsedMs ?? 0);
  const runningSince = useRef<number | null>(null);
  const started = useRef(accumulated.current > 0);
  const over = state.status !== 'playing';
  const blockers = useRef({ over, paused, hidden: false });
  blockers.current.over = over;
  blockers.current.paused = paused;

  const elapsedNow = useCallback(
    () =>
      Math.round(
        accumulated.current +
          (runningSince.current != null ? Date.now() - runningSince.current : 0)
      ),
    []
  );
  const bank = useCallback(() => {
    if (runningSince.current != null) {
      accumulated.current += Date.now() - runningSince.current;
      runningSince.current = null;
    }
  }, []);
  const resume = useCallback(() => {
    const b = blockers.current;
    if (started.current && !b.over && !b.paused && !b.hidden) {
      if (runningSince.current == null) runningSince.current = Date.now();
    }
  }, []);
  const beginTiming = useCallback(() => {
    started.current = true;
    resume();
  }, [resume]);

  useEffect(() => {
    if (paused || over) bank();
    else resume();
  }, [paused, over, bank, resume]);

  // ---- persistence ---------------------------------------------------------
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const stateRef = useRef(state);
  stateRef.current = state;
  const persist = useCallback(() => {
    onChangeRef.current?.({ ...stateRef.current, elapsedMs: elapsedNow() });
  }, [elapsedNow]);
  useEffect(() => {
    persist();
  }, [state, persist]);

  useEffect(() => {
    const onHide = () => {
      blockers.current.hidden = true;
      bank();
      persist();
    };
    const onShow = () => {
      blockers.current.hidden = false;
      resume();
    };
    const onVisibility = () => (document.hidden ? onHide() : onShow());
    window.addEventListener('blur', onHide);
    window.addEventListener('focus', onShow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', onHide);
      window.removeEventListener('focus', onShow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [bank, resume, persist]);

  // ---- audio ---------------------------------------------------------------
  const playerRef = useRef<Player | null>(null);
  if (!playerRef.current) playerRef.current = new Player(getAudioContext());
  const player = playerRef.current;
  const sfxOn = useRef(sfx);
  sfxOn.current = sfx;
  const cue = useCallback(
    (kind: Parameters<Player['sfx']>[0]) => {
      if (sfxOn.current) player.sfx(kind);
    },
    [player]
  );
  useEffect(() => () => player.stop(), [player]);
  useEffect(() => player.setVolume(volume), [player, volume]);

  const [playing, setPlaying] = useState<Playing>(null);
  const progressGetters = useMemo(() => {
    const map = new Map<string, () => number | null>();
    pieceById.forEach((_, id) => map.set(id, () => player.getClipProgress(id)));
    return map;
  }, [pieceById, player]);

  function stopAll() {
    player.stop();
    setPlaying(null);
  }

  // Record a new listening "try" (replays of anything heard are free).
  const listen = (key: string) => {
    beginTiming();
    setState((s) => hear(s, key));
  };

  // ---- coach line, feedback, and moment-to-moment animation ----------------
  const fresh = !initialState;
  const [coach, setCoach] = useState(fresh ? 0 : 3);
  const [message, setMessage] = useState<string | null>(null);
  const [cued, setCued] = useState<string | null>(null);
  const [flash, setFlash] = useState<string[]>([]);
  const [splicing, setSplicing] = useState<number | null>(null);
  const [shake, setShake] = useState<{ row: number; n: number } | null>(null);
  const [freshCard, setFreshCard] = useState<string | null>(null);
  const [ledPop, setLedPop] = useState<number | null>(null);
  const justDragged = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) =>
    timers.current.push(setTimeout(fn, ms));

  // Esc cancels a cued clip.
  useEffect(() => {
    if (!cued) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCued(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [cued]);

  // FLIP: glide a freshly locked song card up from where its row was.
  const boardRef = useRef<HTMLOListElement | null>(null);
  const flipFrom = useRef<{ trackId: string; top: number } | null>(null);
  useLayoutEffect(() => {
    const from = flipFrom.current;
    if (!from || !boardRef.current) return;
    flipFrom.current = null;
    const el = boardRef.current.querySelector<HTMLElement>(
      `[data-track="${from.trackId}"]`
    );
    if (!el || reducedMotion()) return;
    const dy = from.top - el.getBoundingClientRect().top;
    if (Math.abs(dy) < 2) return;
    el.animate(
      [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
      { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)' }
    );
  });

  // ---- ghost race ticker -----------------------------------------------------
  const ghostIdx = useRef(0);
  useEffect(() => {
    if (!ghost || over) return undefined;
    const g = ghost.ghost;
    const id = setInterval(() => {
      const now = elapsedNow();
      const next = g.attempts[ghostIdx.current];
      if (next && (next.atMs ?? 0) <= now) {
        ghostIdx.current++;
        const locks = g.attempts
          .slice(0, ghostIdx.current)
          .filter((a) => a.solved).length;
        setMessage(
          next.solved
            ? `👻 ${ghost.name} locked a song (${locks}/${def.tracks.length}).`
            : `👻 ${ghost.name} slipped up!`
        );
      } else if (!next && g.won && now > g.elapsedMs && ghostIdx.current >= 0) {
        ghostIdx.current = -1;
        setMessage(
          `👻 ${ghost.name} finished in ${formatDuration(g.elapsedMs)} — keep going!`
        );
      }
    }, 400);
    return () => clearInterval(id);
  }, [ghost, over, elapsedNow, def.tracks.length]);

  // ---- board derivations -----------------------------------------------------
  const rows = rowsOf(state, def);
  const busy = splicing != null;
  const unlockedIds = over
    ? []
    : rows.flatMap((ids, r) => (isRowLocked(state, r) ? [] : ids));
  const lastRow =
    !over && state.solved.length === def.tracks.length - 1
      ? state.solved.length
      : null;

  // ---- interactions -----------------------------------------------------------
  function tapClip(piece: Piece, fraction: number | null) {
    if (Date.now() - justDragged.current < 250) return;
    if (coach === 0) setCoach(1);
    setCued(over ? null : piece.id);
    beginTiming();
    setPlaying({ kind: 'clip', id: piece.id });
    player.playPiece(
      piece,
      () =>
        setPlaying((p) => (p?.kind === 'clip' && p.id === piece.id ? null : p)),
      fraction ?? 0
    );
  }

  function swapWith(targetId: string) {
    if (!cued || busy) return;
    const next = moveClip(state, def, cued, targetId);
    setCued(null);
    if (next === state) return;
    beginTiming();
    cue('tick');
    if (coach <= 1) setCoach(2);
    setMessage(null);
    if (playing?.kind === 'row' || playing?.kind === 'seam') stopAll();
    setFlash([cued, targetId]);
    later(() => setFlash([]), 260);
    setState(next);
  }

  function handleDragEnd(event: DragEndEvent) {
    justDragged.current = Date.now();
    const { active, over: target } = event;
    if (!target || busy || active.id === target.id) return;
    const next = moveClip(state, def, String(active.id), String(target.id));
    if (next === state) return;
    beginTiming();
    cue('tick');
    setCued(null);
    if (coach <= 1) setCoach(2);
    setMessage(null);
    if (playing?.kind === 'row' || playing?.kind === 'seam') stopAll();
    setState(next);
  }

  function playSeam(row: number, seam: number) {
    if (
      playing?.kind === 'seam' &&
      playing.row === row &&
      playing.seam === seam
    ) {
      return stopAll();
    }
    const a = pieceById.get(rows[row][seam])!;
    const b = pieceById.get(rows[row][seam + 1])!;
    listen(seamKey(a.id, b.id));
    setPlaying({ kind: 'seam', row, seam });
    player.playSeam(a, b, () =>
      setPlaying((p) =>
        p?.kind === 'seam' && p.row === row && p.seam === seam ? null : p
      )
    );
  }

  function playRow(row: number) {
    if (playing?.kind === 'row' && playing.row === row) return stopAll();
    listen(rowPlayKey(rows[row]));
    const seq = rows[row].map((id) => pieceById.get(id)!);
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
    [player, tracks, trackIndex]
  );

  function toggleSong(trackId: string) {
    if (playing?.kind === 'song' && playing.trackId === trackId) stopAll();
    else playSong(trackId);
  }

  function answerName(trackId: string, choice: Choice | null) {
    const answer = tracks[trackIndex.get(trackId)!]?.answer;
    const correct =
      choice != null &&
      choice.title === answer?.title &&
      choice.artist === answer?.artist;
    if (choice) cue(correct ? 'star' : 'wrong');
    if (correct) vibrate(15);
    setMessage(
      correct
        ? `🎵 Named it! ${answer?.title} — ${answer?.artist}.`
        : `It was ${answer?.title} — ${answer?.artist}.`
    );
    setState((s) => nameTrack(s, trackId, correct));
  }

  function lockIn(row: number) {
    if (busy || over) return;
    beginTiming();
    setCued(null);
    const { state: next, outcome } = submitRow(
      { ...state, elapsedMs: elapsedNow() },
      def,
      row
    );
    if (outcome.kind === 'ignored') return;
    stopAll();
    setCoach(3);

    if (outcome.kind === 'repeat') {
      setShake({ row, n: Date.now() });
      setMessage('Already tried that exact mix — no mistake charged.');
      return;
    }

    if (outcome.kind === 'solved') {
      const trackId = outcome.trackId!;
      const hasQuiz = Boolean(
        tracks[trackIndex.get(trackId)!]?.choices?.length
      );
      cue(outcome.won ? 'win' : 'lock');
      vibrate(20);
      // Stage 1: light the marks and splice the tiles together in place…
      setSplicing(row);
      const left = def.tracks.length - next.solved.length;
      const togo = outcome.won
        ? ''
        : left === 1
          ? ' Last one!'
          : ` ${left} to go.`;
      setMessage(
        hasQuiz
          ? `Spliced! Name that tune for a bonus 🎵.${togo}`
          : `Spliced!${togo}`
      );
      later(
        () => {
          // …stage 2: commit, glide the card up, and take a victory lap.
          const li = boardRef.current?.children[row] as HTMLElement | undefined;
          if (li) {
            flipFrom.current = { trackId, top: li.getBoundingClientRect().top };
          }
          setSplicing(null);
          setFreshCard(trackId);
          setState(next);
          if (outcome.won) {
            bank();
            onFinish?.({ ...next, elapsedMs: elapsedNow() });
          }
          playSong(trackId, 0.15);
        },
        reducedMotion() ? 150 : 720
      );
      return;
    }

    // Wrong.
    cue(outcome.lost ? 'lose' : 'wrong');
    vibrate([30, 40, 30]);
    setShake({ row, n: Date.now() });
    setLedPop(next.mistakes);
    later(() => setLedPop(null), 700);
    const left = def.maxGuesses - next.mistakes;
    setMessage(
      outcome.lost
        ? 'Out of takes — here’s the mix you were hearing.'
        : `${wrongHint(outcome, def.clipsPerTrack)}${left === 1 ? ' Careful — last mistake!' : ''}`
    );
    setState(next);
    if (outcome.lost) {
      bank();
      onFinish?.({ ...next, elapsedMs: elapsedNow() });
    }
  }

  // ---- render -----------------------------------------------------------------
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    })
  );

  const coachLine = [
    'Tap any clip to hear it.',
    'Then tap ⇄ on another clip to swap them — or drag one onto another.',
    'Hear a join with ⌇, a whole row with ▶ Play — then Lock it in.',
  ][coach];

  const activeId =
    playing?.kind === 'clip'
      ? playing.id
      : playing?.kind === 'row' || playing?.kind === 'song'
        ? playing.id
        : null;
  const cuedLetter = cued ? letterOf(cued) : null;

  function clearCue(e: ReactMouseEvent) {
    if (e.target === e.currentTarget) setCued(null);
  }

  const songsLeft = def.tracks.length - state.solved.length;

  return (
    <section
      className={`puzzle${over ? ' is-over' : ''}`}
      style={{ '--cols': clipsPerTrack } as CSSProperties}
      aria-label="Puzzle"
    >
      <div className="gamebar">
        <span className="gamebar-label">{label}</span>
        {ghost && (
          <span className="ghost-pill" title={`Racing ${ghost.name}`}>
            👻 {ghost.name}{' '}
            {ghost.ghost.won ? formatDuration(ghost.ghost.elapsedMs) : 'lost'}
          </span>
        )}
        <Clock getElapsed={elapsedNow} frozen={over} />
        <span
          className="leds"
          role="img"
          aria-label={`${Math.max(0, maxGuesses - state.mistakes)} of ${maxGuesses} mistakes left`}
        >
          {Array.from({ length: maxGuesses }, (_, i) => {
            const spentIndex = maxGuesses - i; // rightmost LED goes first
            const spent = spentIndex <= state.mistakes;
            return (
              <span
                key={i}
                className={[
                  'led',
                  spent ? 'is-spent' : 'is-lit',
                  ledPop === spentIndex && 'is-pop',
                ]
                  .filter(Boolean)
                  .join(' ')}
              />
            );
          })}
        </span>
      </div>

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
            aria-label={`Tracks — ${songsLeft} ${songsLeft === 1 ? 'song' : 'songs'} to find`}
            onClick={clearCue}
          >
            {rows.map((ids, r) => {
              if (isRowLocked(state, r)) {
                const trackId =
                  state.solved[r] ?? pieceById.get(ids[0])!.trackId!;
                const ti = trackIndex.get(trackId) ?? 0;
                const discovered = state.solved.includes(trackId);
                return (
                  <li
                    key={`song-${trackId}`}
                    data-track={trackId}
                    className="lane lane--song"
                  >
                    <SongCard
                      answer={tracks[ti]?.answer}
                      hue={SONG_HUES[ti % SONG_HUES.length]}
                      discovered={discovered}
                      playing={
                        playing?.kind === 'song' && playing.trackId === trackId
                      }
                      onPlay={() => toggleSong(trackId)}
                      choices={discovered ? tracks[ti]?.choices : undefined}
                      named={state.named?.[trackId]}
                      onName={(c) => answerName(trackId, c)}
                      order={Math.max(0, r - state.solved.length)}
                      fresh={freshCard === trackId}
                    />
                  </li>
                );
              }
              const tried = triedMarks(state, ids);
              const marks: Mark[] | null =
                splicing === r ? ids.map(() => 'correct') : tried;
              const rowPlaying = playing?.kind === 'row' && playing.row === r;
              const summary = marks ? summarize(marks) : null;
              return (
                <li
                  key={`row-${r}`}
                  className={[
                    'lane',
                    splicing === r && 'is-splicing',
                    lastRow === r && 'is-last',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label={`Track ${r + 1}`}
                >
                  <div
                    className={['lane-tiles', shake?.row === r && 'is-shaking']
                      .filter(Boolean)
                      .join(' ')}
                    key={shake?.row === r ? shake.n : 0}
                  >
                    {ids.map((id, slot) => {
                      const piece = pieceById.get(id)!;
                      return (
                        <PieceTile
                          key={id}
                          piece={piece}
                          slot={slot}
                          row={r}
                          letter={letterOf(id)}
                          mark={marks?.[slot] ?? null}
                          playing={activeId === id}
                          cued={cued === id}
                          swapWith={
                            cued && cued !== id && !busy ? cuedLetter : null
                          }
                          flash={flash.includes(id)}
                          disabled={busy}
                          onTap={(f) => tapClip(piece, f)}
                          onSwap={() => swapWith(id)}
                          getProgress={progressGetters.get(id)!}
                        />
                      );
                    })}
                    {ids.slice(1).map((id, k) => {
                      const active =
                        playing?.kind === 'seam' &&
                        playing.row === r &&
                        playing.seam === k;
                      const heard = hasHeard(state, seamKey(ids[k], id));
                      return (
                        <button
                          type="button"
                          key={`seam-${k}`}
                          className={[
                            'seam',
                            active && 'is-playing',
                            heard && 'is-heard',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          style={{ '--k': k + 1 } as CSSProperties}
                          onClick={() => playSeam(r, k)}
                          disabled={busy}
                          aria-label={`Hear the join between clips ${letterOf(ids[k])} and ${letterOf(id)}${heard ? ' (heard — free replay)' : ''}`}
                        >
                          <span aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                  <div className="lane-foot">
                    <button
                      type="button"
                      className="pill pill--ghost"
                      onClick={() => playRow(r)}
                      disabled={busy}
                      aria-label={`${rowPlaying ? 'Stop' : 'Play'} track ${r + 1}`}
                    >
                      <Icon name={rowPlaying ? 'stop' : 'play'} />
                      {rowPlaying ? 'Stop' : 'Play'}
                    </button>
                    {summary && (
                      <span className="lane-summary" aria-label={summary.label}>
                        {summary.text}
                      </span>
                    )}
                    <button
                      type="button"
                      className={`pill ${tried ? 'pill--tried' : 'pill--primary'}`}
                      onClick={() => lockIn(r)}
                      disabled={busy}
                      aria-label={
                        tried
                          ? `Track ${r + 1}: this exact mix was already tried`
                          : `Lock in track ${r + 1}`
                      }
                    >
                      <Icon name={tried ? 'reset' : 'lock'} />
                      {tried ? 'Tried' : 'Lock in'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </SortableContext>
      </DndContext>

      <p className="hint" role="status" aria-live="polite">
        {message ?? (over ? '' : coachLine)}
      </p>
    </section>
  );
}

function summarize(marks: Mark[]): { text: string; label: string } {
  const c = marks.filter((m) => m === 'correct').length;
  const m = marks.filter((x) => x === 'misplaced').length;
  return {
    text: [`${c} right`, m ? `${m} close` : ''].filter(Boolean).join(' · '),
    label: `${c} in the right slot, ${m} right song but wrong slot`,
  };
}

function Clock({
  getElapsed,
  frozen,
}: {
  getElapsed: () => number;
  frozen: boolean;
}) {
  const [ms, setMs] = useState(() => getElapsed());
  useEffect(() => {
    setMs(getElapsed());
    if (frozen) return undefined;
    const id = setInterval(() => setMs(getElapsed()), 250);
    return () => clearInterval(id);
  }, [getElapsed, frozen]);
  return (
    <span className="lcd" role="timer" aria-label="Time">
      <Icon name="clock" /> {formatDuration(ms)}
    </span>
  );
}

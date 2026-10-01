// The mixer board: sort shuffled clips into rows, one song per row, in order.
// All rules live in the pure engine (../game/engine.ts); this component turns
// them into something that feels good — listening tools (clips, seams, whole
// rows), swaps, marks, and the "splice" when a song locks in.

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

import PieceTile from './PieceTile.jsx';
import SongCard from './SongCard.jsx';
import type { Choice } from './SongCard.jsx';
import VuNeedle from './VuNeedle.jsx';
import SevenSeg from './SevenSeg.jsx';
import { Player } from '../audio/player.js';
import { getAudioContext } from '../audio/slicer.js';
import { getSfx } from '../audio/sfx.js';
import type { SfxKind } from '../audio/sfx.js';
import { prefersReducedMotion, setLevelSource } from '../audio/meter.js';
import { shufflePieces } from '../audio/puzzle.js';
import { formatDuration } from '../daily/storage.js';
import {
  hasHeard,
  hear,
  rowPlayKey,
  seamKey,
  clueFor,
  clueLabel,
  isRowLocked,
  swapRows,
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
    tracks: tracks.map((t) => ({ id: t.id, pieces: t.pieces, clue: t.clue })),
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
  const fx = getSfx(getAudioContext());
  const sfxOn = useRef(sfx);
  sfxOn.current = sfx;
  const cue = useCallback(
    (kind: SfxKind) => {
      if (sfxOn.current) fx.play(kind);
    },
    [fx]
  );
  useEffect(() => () => player.stop(), [player]);
  useEffect(() => {
    player.setVolume(volume);
    fx.setVolume(volume);
  }, [player, fx, volume]);
  // This board's output drives every meter on screen.
  useEffect(() => {
    setLevelSource(() => player.getLevel());
    return () => setLevelSource(null);
  }, [player]);

  // Power-on sweep, once per session; a lamp chase when you win.
  const [booting, setBooting] = useState(() => {
    try {
      if (sessionStorage.getItem('spliced:booted')) return false;
      sessionStorage.setItem('spliced:booted', '1');
    } catch {
      /* storage unavailable */
    }
    return !prefersReducedMotion();
  });
  useEffect(() => {
    if (!booting) return undefined;
    const id = setTimeout(() => setBooting(false), 1300);
    return () => clearTimeout(id);
  }, [booting]);
  const [chase, setChase] = useState(false);

  const [playing, setPlaying] = useState<Playing>(null);
  const progressGetters = useMemo(() => {
    const map = new Map<string, () => number | null>();
    pieceById.forEach((_, id) => map.set(id, () => player.getClipProgress(id)));
    return map;
  }, [pieceById, player]);

  function stopAll(tapeStop = false) {
    player.stop(tapeStop);
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
  // The row you're working on (last changed or played): its Lock in lights up.
  const [activeRow, setActiveRow] = useState<number | null>(null);
  // A row whose year label was tapped, waiting for a second label to swap.
  const [rowCue, setRowCue] = useState<number | null>(null);
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

  const boardRef = useRef<HTMLOListElement | null>(null);

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
    : rows.flatMap((ids, r) => (isRowLocked(state, def, r) ? [] : ids));
  const lastRow =
    !over && state.solved.length === def.tracks.length - 1
      ? def.tracks.findIndex((t) => !state.solved.includes(t.id))
      : null;
  const rowOfId = (id: string) =>
    Math.floor(state.order.indexOf(id) / clipsPerTrack);
  const labelFor = (r: number) => clueLabel(clueFor(state, def, r), r);

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
    cue('swap');
    if (coach <= 1) setCoach(2);
    setMessage(null);
    if (playing?.kind === 'row' || playing?.kind === 'seam') stopAll();
    setActiveRow(rowOfId(targetId));
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
    cue('swap');
    setCued(null);
    if (coach <= 1) setCoach(2);
    setMessage(null);
    if (playing?.kind === 'row' || playing?.kind === 'seam') stopAll();
    setActiveRow(rowOfId(String(target.id)));
    setState(next);
  }

  // Tap one year label, then another, to swap those two rows' clips (free).
  function tapRowLabel(row: number) {
    if (busy || over) return;
    if (rowCue == null) {
      setRowCue(row);
      setMessage(`Tap another year to swap ${labelFor(row)}’s clips with it.`);
      return;
    }
    if (rowCue === row) {
      setRowCue(null);
      setMessage(null);
      return;
    }
    const next = swapRows(state, def, rowCue, row);
    setRowCue(null);
    setMessage(null);
    if (next === state) return;
    beginTiming();
    cue('swap');
    if (playing?.kind === 'row' || playing?.kind === 'seam') stopAll();
    setActiveRow(row);
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
    cue('detent');
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
    cue('click');
    if (playing?.kind === 'row' && playing.row === row) return stopAll(true);
    listen(rowPlayKey(rows[row]));
    setActiveRow(row);
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
    cue('click');
    if (playing?.kind === 'song' && playing.trackId === trackId) stopAll(true);
    else playSong(trackId);
  }

  function answerName(trackId: string, choice: Choice | null) {
    const answer = tracks[trackIndex.get(trackId)!]?.answer;
    const correct =
      choice != null &&
      choice.title === answer?.title &&
      choice.artist === answer?.artist;
    if (choice) cue(correct ? 'star' : 'buzzer');
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
    cue('click');
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
      cue(outcome.won ? 'win' : 'open');
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
          // …stage 2: commit, open the channel, and take a victory lap.
          setSplicing(null);
          setFreshCard(trackId);
          cue('slide');
          setState(next);
          if (outcome.won) {
            bank();
            setChase(true);
            later(() => setChase(false), 2400);
            window.dispatchEvent(new Event('spliced:win'));
            onFinish?.({ ...next, elapsedMs: elapsedNow() });
          }
          playSong(trackId, 0.15);
        },
        reducedMotion() ? 150 : 720
      );
      return;
    }

    // Wrong (possibly a whole song in the wrong year's row).
    cue(outcome.lost ? 'lose' : 'buzzer');
    vibrate([30, 40, 30]);
    setShake({ row, n: Date.now() });
    setLedPop(next.mistakes);
    later(() => setLedPop(null), 700);
    const left = def.maxGuesses - next.mistakes;
    const careful = left === 1 ? ' Careful — last mistake!' : '';
    if (outcome.lost) {
      setMessage('Out of takes — here’s the mix you were hearing.');
    } else if (outcome.kind === 'wrongEra') {
      const home = def.tracks.findIndex((t) => t.id === outcome.trackId);
      setMessage(
        `Right song, wrong year — that’s ${labelFor(home)}. Moved it there.${careful}`
      );
      setFreshCard(outcome.trackId);
      playSong(outcome.trackId!, 0.4);
    } else {
      setMessage(
        `${wrongHint(outcome, def.clipsPerTrack, labelFor(row))}${careful}`
      );
    }
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

  // Which channel's VU should be live right now.
  const meterRow =
    playing?.kind === 'row' || playing?.kind === 'seam'
      ? playing.row
      : playing?.kind === 'clip'
        ? rowOfId(playing.id)
        : playing?.kind === 'song'
          ? def.tracks.findIndex((t) => t.id === playing.trackId)
          : null;
  const left = Math.max(0, maxGuesses - state.mistakes);
  const vfdMessage =
    message ??
    (over
      ? state.status === 'won'
        ? '★ MASTER MIX COMPLETE ★'
        : 'TAPE JAM — EVERY SONG REVEALED'
      : coachLine);

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
      <div className="vfd">
        <div className="vfd-top">
          <span className="vfd-label">{label}</span>
          <Reels spinning={playing != null} />
          {ghost && !over && (
            <span className="vfd-ghost" title={`Racing ${ghost.name}`}>
              👻 {ghost.name}{' '}
              {ghost.ghost.won ? formatDuration(ghost.ghost.elapsedMs) : 'X'}
            </span>
          )}
          <Clock getElapsed={elapsedNow} frozen={over} />
        </div>
        <p className="vfd-msg" role="status" aria-live="polite">
          {vfdMessage}
        </p>
      </div>

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
            aria-label={`Channels — ${songsLeft} ${songsLeft === 1 ? 'song' : 'songs'} to find`}
            onClick={clearCue}
          >
            {rows.map((ids, r) => {
              if (isRowLocked(state, def, r)) {
                const trackId = def.tracks[r].id;
                const ti = trackIndex.get(trackId) ?? 0;
                const discovered = state.solved.includes(trackId);
                return (
                  <li
                    key={`song-${trackId}`}
                    data-track={trackId}
                    className="strip strip--song"
                    style={{ '--i': r } as CSSProperties}
                  >
                    <SongCard
                      ch={r + 1}
                      answer={tracks[ti]?.answer}
                      hue={SONG_HUES[ti % SONG_HUES.length]}
                      discovered={discovered}
                      playing={
                        playing?.kind === 'song' && playing.trackId === trackId
                      }
                      meter={meterRow === r}
                      onPlay={() => toggleSong(trackId)}
                      choices={discovered ? tracks[ti]?.choices : undefined}
                      named={state.named?.[trackId]}
                      onName={(c) => answerName(trackId, c)}
                      order={r}
                      label={labelFor(r)}
                      fresh={freshCard === trackId}
                    />
                  </li>
                );
              }
              const tried = triedMarks(state, ids);
              const marks: Mark[] | null =
                splicing === r ? ids.map(() => 'correct') : tried;
              const rowPlaying = playing?.kind === 'row' && playing.row === r;
              const armed = !tried && (activeRow === r || lastRow === r);
              const clue = clueFor(state, def, r);
              return (
                <li
                  key={`row-${r}`}
                  className={[
                    'strip',
                    splicing === r && 'is-splicing',
                    lastRow === r && 'is-last',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label={`Channel ${r + 1}${clue.year ? `, ${clue.year}` : ''}`}
                >
                  <div className="strip-head">
                    <span className="ch" aria-hidden="true">
                      {r + 1}
                    </span>
                    <span className="tape-wrap">
                      <button
                        type="button"
                        className={`tape${rowCue === r ? ' is-cued' : ''}${rowCue != null && rowCue !== r ? ' is-target' : ''}`}
                        onClick={() => tapRowLabel(r)}
                        disabled={busy}
                        aria-pressed={rowCue === r}
                        aria-label={`Clue: ${[clue.year, clue.genre].filter(Boolean).join(', ') || `channel ${r + 1}`}. ${rowCue != null && rowCue !== r ? 'Press to swap channels.' : 'Press, then press another label, to swap channels.'}`}
                      >
                        <span className="tape-year">{labelFor(r)}</span>
                        {clue.genre && (
                          <span className="tape-genre">{clue.genre}</span>
                        )}
                      </button>
                    </span>
                    <VuNeedle active={meterRow === r} />
                    <button
                      type="button"
                      className={`cbtn${rowPlaying ? ' is-on' : ''}`}
                      onClick={() => playRow(r)}
                      disabled={busy}
                      aria-pressed={rowPlaying}
                      aria-label={`${rowPlaying ? 'Stop' : 'Play'} channel ${r + 1}`}
                    >
                      <span className="lamp" aria-hidden="true" />
                      {rowPlaying ? 'Stop' : 'Play'}
                    </button>
                    <button
                      type="button"
                      className={[
                        'cbtn',
                        'cbtn--rec',
                        armed && 'is-armed',
                        tried && 'is-tried',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => lockIn(r)}
                      disabled={busy}
                      aria-label={
                        tried
                          ? `Channel ${r + 1}: this exact mix was already tried`
                          : `Lock in channel ${r + 1}`
                      }
                    >
                      <span className="lamp" aria-hidden="true" />
                      {tried ? 'Tried' : 'Lock'}
                    </button>
                  </div>
                  <div
                    className={`lane-tiles${shake?.row === r ? ' is-shaking' : ''}`}
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
                          <span className="knob" aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ol>
        </SortableContext>
      </DndContext>
    </section>
  );
}

// Two little tape reels in the display that turn while anything plays.
function Reels({ spinning }: { spinning: boolean }) {
  const reel = (
    <svg viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="6" />
      <circle cx="7" cy="7" r="1.6" className="hub" />
      <path d="M7 1.5v3M11.8 9.8l-2.6-1.5M2.2 9.8l2.6-1.5" />
    </svg>
  );
  return (
    <span
      className={`reels${spinning ? ' is-spinning' : ''}`}
      aria-hidden="true"
    >
      {reel}
      {reel}
    </span>
  );
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
  const text = formatDuration(ms);
  return <SevenSeg value={text.padStart(5, ' ')} label={`Time ${text}`} />;
}

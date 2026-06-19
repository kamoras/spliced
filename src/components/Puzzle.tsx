// Multi-track mixer puzzle: sort random song clips into complete track rows.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import type {
  Announcements,
  DragEndEvent,
  ScreenReaderInstructions,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  rectSwappingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import type { SortingStrategy } from '@dnd-kit/sortable';

import PieceTile from './PieceTile.jsx';
import type { TileState } from './PieceTile.jsx';
import Icon from './Icon.jsx';
import VuMeter from './VuMeter.jsx';
import ListenLinks from './ListenLinks.jsx';
import { Player } from '../audio/player.js';
import { getAudioContext } from '../audio/slicer.js';
import { formatDuration } from '../daily/storage.js';
import {
  buildMixerOrder,
  chunkTracks,
  gradeMixerRow,
  shufflePieces,
} from '../audio/puzzle.js';
import type { GameResult, Piece, Track } from '../types.js';

const DEFAULT_VOLUME = 0.85;
const TOKEN_COLORS = [
  '#d95f02',
  '#1b9e77',
  '#7570b3',
  '#e7298a',
  '#66a61e',
  '#e6ab02',
  '#a6761d',
  '#1f78b4',
  '#b15928',
  '#6a3d9a',
  '#33a02c',
  '#fb9a99',
  '#fdbf6f',
  '#cab2d6',
  '#b2df8a',
  '#a6cee3',
];

function clampVolume(value: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, numeric));
}

function solvedOrder(tracks: Track[]): Piece[] {
  return tracks.flatMap((track) => track.pieces);
}

interface PuzzleProps {
  tracks: Track[];
  clipsPerTrack?: number;
  onNewPuzzle?: () => void;
  newPuzzleLabel?: string;
  seed?: number;
  maxGuesses?: number;
  onResult?: (result: GameResult) => void;
}

export default function Puzzle({
  tracks,
  clipsPerTrack = 4,
  onNewPuzzle,
  newPuzzleLabel = 'New puzzle',
  seed,
  maxGuesses = Infinity,
  onResult,
}: PuzzleProps) {
  const trackCount = tracks.length;
  const initialOrderRef = useRef<Piece[] | null>(null);
  if (!initialOrderRef.current) {
    initialOrderRef.current = buildMixerOrder(tracks, seed);
  }

  const [order, setOrder] = useState<Piece[]>(() => initialOrderRef.current!);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playingRow, setPlayingRow] = useState<number | null>(null);
  const [playingSequence, setPlayingSequence] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [solvedTrackIds, setSolvedTrackIds] = useState<string[]>([]);
  const [lost, setLost] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  // Row index whose per-clip status is lit on the board after a wrong submit.
  // It persists until that row is rearranged, so players can see exactly which
  // clips landed in the right slot. `null` means no row is showing live status.
  const [gradedRow, setGradedRow] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  // Solve timer that pauses when the window/tab loses focus. Active time is
  // banked in `accumulatedRef`; `runningSinceRef` marks the start of the current
  // active stretch (null while paused or before the first move). Refs keep
  // ticking from re-rendering the board.
  const startedRef = useRef(false);
  const accumulatedRef = useRef(0);
  const runningSinceRef = useRef<number | null>(null);
  // Kept in sync with `over` (declared below) so the focus/blur listeners and
  // beginTiming can read the latest value without resubscribing.
  const overRef = useRef(false);

  const elapsedNow = useCallback(
    (): number =>
      accumulatedRef.current +
      (runningSinceRef.current != null
        ? Date.now() - runningSinceRef.current
        : 0),
    []
  );

  function beginTiming() {
    if (overRef.current) return;
    startedRef.current = true;
    if (runningSinceRef.current == null) runningSinceRef.current = Date.now();
  }

  // Pause on blur / hidden tab, resume on focus — but never resume once over.
  useEffect(() => {
    const bank = () => {
      if (runningSinceRef.current != null) {
        accumulatedRef.current += Date.now() - runningSinceRef.current;
        runningSinceRef.current = null;
      }
    };
    const resume = () => {
      if (
        startedRef.current &&
        !overRef.current &&
        runningSinceRef.current == null
      ) {
        runningSinceRef.current = Date.now();
      }
    };
    const onVisibility = () => (document.hidden ? bank() : resume());
    window.addEventListener('blur', bank);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', bank);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const playerRef = useRef<Player | null>(null);
  if (!playerRef.current) {
    playerRef.current = new Player(getAudioContext());
  }
  const player = playerRef.current;
  const getLevel = useCallback(() => player.getLevel(), [player]);
  const getClipProgress = useCallback(
    (id: string) => player.getClipProgress(id),
    [player]
  );
  useEffect(() => () => player.stop(), [player]);

  useEffect(() => {
    player.setVolume(volume);
  }, [player, volume]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const rows = chunkTracks(order, clipsPerTrack);
  // The strip whose VU meter should be live: the row playing as a sequence, or
  // the row that owns the single clip being auditioned.
  const meterRow =
    playingRow != null
      ? playingRow
      : playingId != null
        ? Math.floor(order.findIndex((p) => p.id === playingId) / clipsPerTrack)
        : null;
  const solved = solvedTrackIds.length === trackCount;
  const limited = Number.isFinite(maxGuesses);
  const over = solved || lost || revealed;
  overRef.current = over;
  const remaining = limited ? Math.max(0, maxGuesses - mistakes) : null;

  const identity = useMemo(() => {
    const allPieces = tracks.flatMap((track) => track.pieces);
    const tokenSeed = typeof seed === 'number' ? seed + 1009 : undefined;
    const tokenOrder = shufflePieces(allPieces, tokenSeed);
    const map: Record<string, { letter: string; color: string }> = {};
    tokenOrder.forEach((piece, idx) => {
      map[piece.id] = {
        letter: String.fromCharCode(65 + idx),
        color: TOKEN_COLORS[idx % TOKEN_COLORS.length],
      };
    });
    return map;
  }, [tracks, seed]);
  const letterOf = (id: string | number) => identity[id]?.letter ?? '?';
  const trackName = (trackId: string | null | undefined) =>
    tracks.find((track) => track.id === trackId)?.answer?.title ||
    'Mystery song';

  function rowLocked(rowIndex: number, solvedIds = solvedTrackIds) {
    const trackId = rows[rowIndex]?.[0]?.trackId;
    return trackId != null && solvedIds.includes(trackId);
  }

  const sortableIds = order
    .filter((_, idx) => !over && !rowLocked(Math.floor(idx / clipsPerTrack)))
    .map((piece) => piece.id);

  // Make the drag preview match the drop: a sort/push within a row, a swap
  // across rows (see handleDragEnd). dnd-kit passes indices into `sortableIds`,
  // so map them back to board rows.
  const dragStrategy: SortingStrategy = (args) => {
    const { activeIndex, overIndex } = args;
    const rowOfSortable = (i: number) => {
      const pos = order.findIndex((p) => p.id === sortableIds[i]);
      return pos < 0 ? -1 : Math.floor(pos / clipsPerTrack);
    };
    if (activeIndex < 0 || overIndex < 0) return rectSortingStrategy(args);
    return rowOfSortable(activeIndex) === rowOfSortable(overIndex)
      ? rectSortingStrategy(args)
      : rectSwappingStrategy(args);
  };

  function handleDragEnd(event: DragEndEvent) {
    const { active, over: target } = event;
    if (!target || active.id === target.id) return;
    const from = order.findIndex((p) => p.id === active.id);
    const to = order.findIndex((p) => p.id === target.id);
    if (from < 0 || to < 0) return;
    const fromRow = Math.floor(from / clipsPerTrack);
    const toRow = Math.floor(to / clipsPerTrack);
    if (rowLocked(fromRow) || rowLocked(toRow)) return;
    beginTiming();
    setOrder((cur) => {
      const next = [...cur];
      if (fromRow === toRow) {
        // Same row: shift/push into the slot — the natural reorder, and it
        // can't disturb any other row.
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
      } else {
        // Across rows: swap, so dropping onto a slot never pushes an
        // already-correct clip out into the next row.
        [next[from], next[to]] = [next[to], next[from]];
      }
      return next;
    });
    setFeedback(null);
    // Drop the live status as soon as its row changes; leave it lit when an
    // unrelated row is rearranged, since its grade is still accurate.
    if (gradedRow === fromRow || gradedRow === toRow) setGradedRow(null);
  }

  function handleVolumeChange(value: number) {
    setVolume(clampVolume(value));
  }

  function stopAll() {
    player.stop();
    setPlayingId(null);
    setPlayingRow(null);
    setPlayingSequence(false);
  }

  function playClip(piece: Piece) {
    if (playingSequence && playingId === piece.id && playingRow === null) {
      stopAll();
      return;
    }
    beginTiming();
    stopAll();
    setPlayingId(piece.id);
    setPlayingRow(null);
    setPlayingSequence(true);
    player.playPiece(piece, () => {
      setPlayingId(null);
      setPlayingSequence(false);
    });
  }

  // Scrub: play a clip from a fraction (0..1) of the way in, set by clicking the
  // waveform — so players can jump to and audition a specific part of a clip.
  function seekClip(piece: Piece, fraction: number) {
    beginTiming();
    stopAll();
    setPlayingId(piece.id);
    setPlayingRow(null);
    setPlayingSequence(true);
    player.playPiece(
      piece,
      () => {
        setPlayingId(null);
        setPlayingSequence(false);
      },
      fraction
    );
  }

  function playSequence(rowIndex: number, sequence: Piece[]) {
    setPlayingId(null);
    setPlayingRow(rowIndex);
    setPlayingSequence(true);
    player.playSequence(sequence, {
      onPiece: (idx) => setPlayingId(sequence[idx]?.id ?? null),
      onEnd: () => {
        setPlayingId(null);
        setPlayingRow(null);
        setPlayingSequence(false);
      },
    });
  }

  // One action per track: play the assembled row and grade it. The full-row
  // playback and the submit are intentionally the same button, since clips are
  // auditioned individually.
  function submitRow(rowIndex: number) {
    if (over || rowLocked(rowIndex)) return;
    const row = rows[rowIndex];
    if (!row?.length) return;
    beginTiming();

    const grade = gradeMixerRow(row, solvedTrackIds);
    const nextSolvedTrackIds =
      grade.solved && grade.trackId
        ? [...solvedTrackIds, grade.trackId]
        : solvedTrackIds;
    const allSolved = nextSolvedTrackIds.length === trackCount;
    const nextMistakes =
      grade.solved || grade.alreadySolved ? mistakes : mistakes + 1;
    const out = limited && nextMistakes >= maxGuesses && !allSolved;

    setMistakes(nextMistakes);
    setSolvedTrackIds(nextSolvedTrackIds);
    // A solving submit locks the row (which reveals its status anyway); a wrong
    // submit lights this row so its correct/right-track clips stand out.
    setGradedRow(grade.solved ? null : rowIndex);

    // Hear the row you're checking — including the final solve, so completing
    // every track plays its song. Only a losing submit stays silent.
    if (out) {
      stopAll();
    } else {
      playSequence(rowIndex, row);
    }

    if (grade.solved) {
      setFeedback(
        allSolved
          ? 'Master mix complete.'
          : `Track ${rowIndex + 1} locked: ${trackName(grade.trackId)}.`
      );
    } else if (grade.alreadySolved) {
      setFeedback(
        'That song is already locked on another track. Try a different row.'
      );
    } else if (grade.rightRowCount > 0) {
      setFeedback(
        `${grade.correctPositions}/${clipsPerTrack} clips are placed. ${
          grade.rightRowCount - grade.correctPositions
        } belong with the first clip but need another slot.`
      );
    } else {
      setFeedback(
        'Use the first clip as this row reference, then route matching clips here.'
      );
    }

    if (allSolved) {
      onResult?.(buildResult(true, nextMistakes, nextSolvedTrackIds));
    } else if (out) {
      setLost(true);
      setRevealed(true);
      setOrder(solvedOrder(tracks));
      onResult?.(buildResult(false, nextMistakes, nextSolvedTrackIds));
    }
  }

  function buildResult(
    nextSolved: boolean,
    mistakeCount: number,
    solvedIds: string[]
  ): GameResult {
    // Bank any in-flight time and stop the clock.
    if (runningSinceRef.current != null) {
      accumulatedRef.current += Date.now() - runningSinceRef.current;
      runningSinceRef.current = null;
    }
    const elapsed = accumulatedRef.current;
    setElapsedMs(elapsed);
    return {
      solved: nextSolved,
      mistakes: mistakeCount,
      solvedTracks: solvedIds.length,
      elapsedMs: elapsed,
    };
  }

  function reshuffle() {
    stopAll();
    const next = buildMixerOrder(tracks, seed);
    setOrder(next);
    setRevealed(false);
    setSolvedTrackIds([]);
    setLost(false);
    setFeedback(null);
    setGradedRow(null);
    setMistakes(0);
    setElapsedMs(null);
    startedRef.current = false;
    accumulatedRef.current = 0;
    runningSinceRef.current = null;
  }

  const a11y = {
    screenReaderInstructions: {
      draggable:
        'To move a clip, press Space or Enter to pick it up, use the arrow keys to move it between mixer tracks, then press Space or Enter to drop it.',
    } satisfies ScreenReaderInstructions,
    announcements: {
      onDragStart: ({ active }) => `Picked up clip ${letterOf(active.id)}.`,
      onDragOver: ({ over: o }) =>
        o
          ? `Clip now over slot ${order.findIndex((p) => p.id === o.id) + 1}.`
          : undefined,
      onDragEnd: ({ active, over: o }) =>
        o ? `Clip ${letterOf(active.id)} dropped.` : 'Move cancelled.',
      onDragCancel: () => 'Move cancelled.',
    } satisfies Announcements,
  };

  return (
    <div className="panel mixer-panel">
      <div className="mixer-topbar">
        <div>
          <div className="board-kicker">Mixer puzzle</div>
          <h2 className="mixer-title">Sort four mystery songs into tracks</h2>
        </div>
        {!over && (
          <div className="board-meters">
            <SolveTimer getElapsed={elapsedNow} />
            {limited && (
              <div className="submission-meter">
                <span>{remaining}</span>
                <span>mistakes left</span>
              </div>
            )}
          </div>
        )}
      </div>

      {!over && (
        <VolumeControlPanel
          volume={volume}
          onVolumeChange={handleVolumeChange}
        />
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={a11y}
      >
        <SortableContext items={sortableIds} strategy={dragStrategy}>
          <ol className="track-board" aria-label="Mixer tracks">
            {rows.map((row, rowIndex) => {
              const locked = rowLocked(rowIndex) || over;
              const trackId = row[0]?.trackId;
              // Light per-clip status when a row is locked/revealed, or when it
              // is the row showing live feedback from the last wrong submit.
              const graded = gradedRow === rowIndex && !locked;
              const showGrade = locked || revealed || graded;
              const rowGrade = showGrade ? gradeMixerRow(row) : null;
              const solvedHere =
                trackId != null && solvedTrackIds.includes(trackId);
              // Reveal the song on rows you solved, and on every row once the
              // game is over (the board is in solved order) — so a wrong finish
              // clearly shows the correct mix, track by track.
              const answer =
                solvedHere || over
                  ? tracks.find((track) => track.id === trackId)?.answer
                  : null;
              return (
                <li
                  key={rowIndex}
                  className={[
                    'track-lane',
                    graded && 'track-lane--graded',
                    locked && 'track-lane--locked',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="track-strip">
                    <span className="track-name">Track {rowIndex + 1}</span>
                    <span className="track-led" aria-hidden="true" />
                    <VuMeter
                      getLevel={getLevel}
                      active={meterRow === rowIndex}
                    />
                    {!locked ? (
                      <button
                        type="button"
                        className="btn btn--mini track-submit"
                        onClick={() =>
                          playingRow === rowIndex
                            ? stopAll()
                            : submitRow(rowIndex)
                        }
                      >
                        <Icon
                          name={playingRow === rowIndex ? 'stop' : 'check'}
                        />
                        {playingRow === rowIndex ? 'Stop' : 'Submit'}
                      </button>
                    ) : (
                      // Solved/finished rows stay replayable: hear the whole
                      // track again on demand.
                      <button
                        type="button"
                        className="btn btn--mini track-submit"
                        onClick={() =>
                          playingRow === rowIndex
                            ? stopAll()
                            : playSequence(rowIndex, row)
                        }
                      >
                        <Icon
                          name={playingRow === rowIndex ? 'stop' : 'play'}
                        />
                        {playingRow === rowIndex ? 'Stop' : 'Play track'}
                      </button>
                    )}
                    <span className="track-status">
                      {solvedHere ? 'Locked' : over ? 'Revealed' : 'Route'}
                    </span>
                  </div>
                  <div className="track-main">
                    {answer && (
                      <div className="track-reveal">
                        {answer.artwork && (
                          <img
                            src={answer.artwork}
                            alt=""
                            className="track-reveal-art"
                          />
                        )}
                        <div className="track-reveal-meta">
                          <span className="track-reveal-title">
                            {answer.title}
                          </span>
                          <span className="track-reveal-artist">
                            {answer.artist}
                          </span>
                          <ListenLinks
                            title={answer.title}
                            artist={answer.artist}
                          />
                        </div>
                        <span className="track-reveal-badge">
                          <Icon name={solvedHere ? 'check' : 'eye'} />
                          {solvedHere ? 'Discovered' : 'Answer'}
                        </span>
                      </div>
                    )}
                    <div className="track-slots">
                      {row.map((piece, slotIndex) => {
                        const item = identity[piece.id];
                        const cell = rowGrade?.cells[slotIndex];
                        const tileState: TileState = cell?.correct
                          ? 'correct'
                          : cell?.sameTrack
                            ? 'misplaced'
                            : null;
                        return (
                          <PieceTile
                            key={piece.id}
                            piece={piece}
                            position={slotIndex}
                            letter={item?.letter}
                            color={item?.color}
                            isPlaying={playingId === piece.id}
                            tileState={tileState}
                            gradeVisible={graded}
                            locked={locked}
                            revealed={revealed || locked}
                            onPlay={() => playClip(piece)}
                            onSeek={(f) => seekClip(piece, f)}
                            getClipProgress={getClipProgress}
                          />
                        );
                      })}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </SortableContext>
      </DndContext>

      <div role="status" aria-live="polite">
        {feedback && <p className="feedback">{feedback}</p>}
        {solved && (
          <p className="result-banner is-win">
            <strong>Master mix complete.</strong> Solved with {mistakes}/
            {maxGuesses} mistakes
            {elapsedMs != null && ` in ${formatDuration(elapsedMs)}`}.
          </p>
        )}
        {lost && (
          <p className="result-banner is-loss">
            <strong>Out of mistakes.</strong> The tracks are revealed below.
          </p>
        )}
      </div>

      <div className={over ? 'controls' : 'controls controls--secondary'}>
        {!over ? (
          // Practice only: re-scramble for a fresh round. The daily has no
          // reset/reveal — that would wipe mistakes or skip the challenge.
          typeof seed !== 'number' && (
            <button type="button" className="btn" onClick={reshuffle}>
              <Icon name="shuffle" /> Reshuffle
            </button>
          )
        ) : (
          <>
            {onNewPuzzle && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={onNewPuzzle}
              >
                {newPuzzleLabel}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SolveTimer({ getElapsed }: { getElapsed: () => number }) {
  const [ms, setMs] = useState(() => getElapsed());
  useEffect(() => {
    const id = setInterval(() => setMs(getElapsed()), 250);
    return () => clearInterval(id);
  }, [getElapsed]);
  return (
    <div className="solve-timer" role="timer" aria-label="Time elapsed">
      <Icon name="clock" /> {formatDuration(ms)}
    </div>
  );
}

interface VolumeControlProps {
  volume: number;
  onVolumeChange: (value: number) => void;
}

function VolumeControlPanel({ volume, onVolumeChange }: VolumeControlProps) {
  return (
    <section className="volume-panel" aria-label="Playback volume">
      <VolumeControl volume={volume} onVolumeChange={onVolumeChange} />
    </section>
  );
}

function VolumeControl({ volume, onVolumeChange }: VolumeControlProps) {
  const percent = Math.round(volume * 100);

  return (
    <label className="mixer-slider mixer-slider--volume">
      <span className="mixer-slider-label">
        <Icon name="volume" /> Volume
      </span>
      <input
        className="mixer-range"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        aria-valuetext={`${percent}%`}
        onChange={(event) => onVolumeChange(Number(event.target.value))}
      />
      <span className="mixer-slider-value">{percent}%</span>
    </label>
  );
}

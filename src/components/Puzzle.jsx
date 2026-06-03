// Multi-track mixer puzzle: sort random song clips into complete track rows.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';

import PieceTile from './PieceTile.jsx';
import Icon from './Icon.jsx';
import { Player } from '../audio/player.js';
import { getAudioContext } from '../audio/slicer.js';
import {
  buildMixerOrder,
  chunkTracks,
  gradeMixerRow,
  shufflePieces,
} from '../audio/puzzle.js';

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

function clampVolume(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, numeric));
}

function solvedOrder(tracks) {
  return tracks.flatMap((track) => track.pieces);
}

export default function Puzzle({
  tracks,
  clipsPerTrack = 4,
  onNewPuzzle,
  newPuzzleLabel = 'New puzzle',
  seed,
  maxGuesses = Infinity,
  onResult,
}) {
  const trackCount = tracks.length;
  const initialOrderRef = useRef(null);
  if (!initialOrderRef.current) {
    initialOrderRef.current = buildMixerOrder(tracks, seed);
  }

  const [order, setOrder] = useState(() => initialOrderRef.current);
  const [armedRow, setArmedRow] = useState(0);
  const [playingId, setPlayingId] = useState(null);
  const [playingRow, setPlayingRow] = useState(null);
  const [playingSequence, setPlayingSequence] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [solvedTrackIds, setSolvedTrackIds] = useState([]);
  const [lost, setLost] = useState(false);
  const [feedback, setFeedback] = useState(null);
  // Row index whose per-clip status is lit on the board after a wrong submit.
  // It persists until that row is rearranged, so players can see exactly which
  // clips landed in the right slot. `null` means no row is showing live status.
  const [gradedRow, setGradedRow] = useState(null);
  const [submissions, setSubmissions] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [guessHistory, setGuessHistory] = useState([]);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [trackPlays, setTrackPlays] = useState(0);

  const playerRef = useRef(null);
  if (!playerRef.current) {
    playerRef.current = new Player(getAudioContext());
  }
  const player = playerRef.current;
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
  const solved = solvedTrackIds.length === trackCount;
  const limited = Number.isFinite(maxGuesses);
  const over = solved || lost || revealed;
  const remaining = limited ? Math.max(0, maxGuesses - mistakes) : null;

  const identity = useMemo(() => {
    const allPieces = tracks.flatMap((track) => track.pieces);
    const tokenSeed = typeof seed === 'number' ? seed + 1009 : undefined;
    const tokenOrder = shufflePieces(allPieces, tokenSeed);
    const map = {};
    tokenOrder.forEach((piece, idx) => {
      map[piece.id] = {
        letter: String.fromCharCode(65 + idx),
        color: TOKEN_COLORS[idx % TOKEN_COLORS.length],
      };
    });
    return map;
  }, [tracks, seed]);
  const letterOf = (id) => identity[id]?.letter ?? '?';
  const trackName = (trackId) =>
    tracks.find((track) => track.id === trackId)?.answer?.title ||
    'Mystery song';

  function rowLocked(rowIndex, solvedIds = solvedTrackIds) {
    const trackId = rows[rowIndex]?.[0]?.trackId;
    return Boolean(trackId) && solvedIds.includes(trackId);
  }

  function firstOpenRow(solvedIds) {
    const idx = rows.findIndex(
      (_, rowIndex) => !rowLocked(rowIndex, solvedIds)
    );
    return idx === -1 ? armedRow : idx;
  }

  const sortableIds = order
    .filter((_, idx) => !over && !rowLocked(Math.floor(idx / clipsPerTrack)))
    .map((piece) => piece.id);

  function handleDragEnd(event) {
    const { active, over: target } = event;
    if (!target || active.id === target.id) return;
    const from = order.findIndex((p) => p.id === active.id);
    const to = order.findIndex((p) => p.id === target.id);
    if (from < 0 || to < 0) return;
    const fromRow = Math.floor(from / clipsPerTrack);
    const toRow = Math.floor(to / clipsPerTrack);
    if (rowLocked(fromRow) || rowLocked(toRow)) return;
    setOrder((cur) => arrayMove(cur, from, to));
    setFeedback(null);
    // Drop the live status as soon as its row changes; leave it lit when an
    // unrelated row is rearranged, since its grade is still accurate.
    if (gradedRow === fromRow || gradedRow === toRow) setGradedRow(null);
  }

  function handleVolumeChange(value) {
    setVolume(clampVolume(value));
  }

  function stopAll() {
    player.stop();
    setPlayingId(null);
    setPlayingRow(null);
    setPlayingSequence(false);
  }

  function playClip(piece) {
    if (playingSequence && playingId === piece.id && playingRow === null) {
      stopAll();
      return;
    }
    stopAll();
    setPlayingId(piece.id);
    setPlayingRow(null);
    setPlayingSequence(true);
    player.playPiece(piece, () => {
      setPlayingId(null);
      setPlayingSequence(false);
    });
  }

  function playSequence(rowIndex, sequence) {
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

  function playRow(rowIndex) {
    if (playingSequence && playingRow === rowIndex) {
      stopAll();
      return;
    }
    stopAll();
    setTrackPlays((current) => current + 1);
    playSequence(rowIndex, rows[rowIndex]);
  }

  function submitArmedRow() {
    if (over || rowLocked(armedRow)) return;
    const row = rows[armedRow];
    if (!row?.length) return;

    const submissionNumber = submissions + 1;
    const grade = gradeMixerRow(row, solvedTrackIds);
    const nextSolvedTrackIds = grade.solved
      ? [...solvedTrackIds, grade.trackId]
      : solvedTrackIds;
    const allSolved = nextSolvedTrackIds.length === trackCount;
    const nextMistakes =
      grade.solved || grade.alreadySolved ? mistakes : mistakes + 1;
    const out = limited && nextMistakes >= maxGuesses && !allSolved;
    const nextGuess = {
      number: submissionNumber,
      row: armedRow,
      solved: grade.solved,
      sameTrack: grade.sameTrack,
      correctPositions: grade.correctPositions,
      rightRowCount: grade.rightRowCount,
      tiles: grade.cells.map((cell, idx) => ({
        ...cell,
        letter: letterOf(row[idx].id),
      })),
    };
    const nextGuessHistory = [...guessHistory, nextGuess];

    setSubmissions(submissionNumber);
    setMistakes(nextMistakes);
    setSolvedTrackIds(nextSolvedTrackIds);
    setGuessHistory(nextGuessHistory);
    if (grade.solved && !allSolved)
      setArmedRow(firstOpenRow(nextSolvedTrackIds));
    // A solving submit locks the row (which reveals its status anyway); a wrong
    // submit lights the armed row so its correct/right-track clips stand out.
    setGradedRow(grade.solved ? null : armedRow);
    stopAll();

    if (grade.solved) {
      setFeedback(
        allSolved
          ? 'Master mix complete.'
          : `Track ${armedRow + 1} locked: ${trackName(grade.trackId)}.`
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
      onResult?.(
        buildResult(
          true,
          submissionNumber,
          nextMistakes,
          nextSolvedTrackIds,
          nextGuessHistory
        )
      );
    } else if (out) {
      setLost(true);
      setRevealed(true);
      setOrder(solvedOrder(tracks));
      onResult?.(
        buildResult(
          false,
          submissionNumber,
          nextMistakes,
          nextSolvedTrackIds,
          nextGuessHistory
        )
      );
    }
  }

  function buildResult(nextSolved, tries, mistakeCount, solvedIds, history) {
    return {
      solved: nextSolved,
      attempts: tries,
      mistakes: mistakeCount,
      solvedTracks: solvedIds.length,
      trackPlays,
      fullPlays: trackPlays,
      grid: shareGridFromHistory(history),
    };
  }

  function reveal() {
    setRevealed(true);
    setFeedback(null);
    setGradedRow(null);
    setOrder(solvedOrder(tracks));
    onResult?.(
      buildResult(false, submissions, mistakes, solvedTrackIds, guessHistory)
    );
  }

  function reshuffle() {
    stopAll();
    const next = buildMixerOrder(tracks, seed);
    setOrder(next);
    setArmedRow(0);
    setRevealed(false);
    setSolvedTrackIds([]);
    setLost(false);
    setFeedback(null);
    setGradedRow(null);
    setSubmissions(0);
    setMistakes(0);
    setGuessHistory([]);
    setTrackPlays(0);
  }

  const a11y = {
    screenReaderInstructions: {
      draggable:
        'To move a clip, press Space or Enter to pick it up, use the arrow keys to move it between mixer tracks, then press Space or Enter to drop it.',
    },
    announcements: {
      onDragStart: ({ active }) => `Picked up clip ${letterOf(active.id)}.`,
      onDragOver: ({ over: o }) =>
        o
          ? `Clip now over slot ${order.findIndex((p) => p.id === o.id) + 1}.`
          : undefined,
      onDragEnd: ({ active, over: o }) =>
        o ? `Clip ${letterOf(active.id)} dropped.` : 'Move cancelled.',
      onDragCancel: () => 'Move cancelled.',
    },
  };

  return (
    <div className="panel mixer-panel">
      <div className="mixer-topbar">
        <div>
          <div className="board-kicker">Mixer puzzle</div>
          <h2 className="mixer-title">Sort four mystery songs into tracks</h2>
        </div>
        {limited && !over && (
          <div className="submission-meter">
            <span>{remaining}</span>
            <span>mistakes left</span>
          </div>
        )}
      </div>

      {!over && (
        <>
          <TrackControls
            rows={rows}
            armedRow={armedRow}
            solvedTrackIds={solvedTrackIds}
            playingRow={playingRow}
            onArm={setArmedRow}
            onPlay={playRow}
            onSubmit={submitArmedRow}
          />
          <VolumeControlPanel
            volume={volume}
            onVolumeChange={handleVolumeChange}
          />
        </>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={a11y}
      >
        <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
          <ol className="track-board" aria-label="Mixer tracks">
            {rows.map((row, rowIndex) => {
              const locked = rowLocked(rowIndex) || over;
              const trackId = row[0]?.trackId;
              // Light per-clip status when a row is locked/revealed, or when it
              // is the row showing live feedback from the last wrong submit.
              const graded = gradedRow === rowIndex && !locked;
              const showGrade = locked || revealed || graded;
              const rowGrade = showGrade ? gradeMixerRow(row) : null;
              const solvedHere = solvedTrackIds.includes(trackId);
              const answer = solvedHere
                ? tracks.find((track) => track.id === trackId)?.answer
                : null;
              return (
                <li
                  key={rowIndex}
                  className={[
                    'track-lane',
                    armedRow === rowIndex && !over && 'track-lane--armed',
                    graded && 'track-lane--graded',
                    locked && 'track-lane--locked',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="track-strip">
                    <span className="track-name">Track {rowIndex + 1}</span>
                    <span className="track-led" aria-hidden="true" />
                    <span className="track-status">
                      {solvedHere ? 'Locked' : 'Route'}
                    </span>
                  </div>
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
                      </div>
                      <span className="track-reveal-badge">
                        <Icon name="check" /> Discovered
                      </span>
                    </div>
                  )}
                  <div className="track-slots">
                    {row.map((piece, slotIndex) => {
                      const item = identity[piece.id];
                      const cell = rowGrade?.cells[slotIndex];
                      const tileState = cell?.correct
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
                          onPlay={locked ? undefined : () => playClip(piece)}
                        />
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ol>
        </SortableContext>
      </DndContext>

      <GuessHistory guesses={guessHistory} />

      <div role="status" aria-live="polite">
        {feedback && <p className="feedback">{feedback}</p>}
        {solved && (
          <p className="result-banner is-win">
            <strong>Master mix complete.</strong> Solved with {mistakes}/
            {maxGuesses} mistakes.
          </p>
        )}
        {lost && (
          <p className="result-banner is-loss">
            <strong>Out of mistakes.</strong> The tracks are revealed below.
          </p>
        )}
        {revealed && !solved && !lost && (
          <p className="result-banner is-loss">Tracks revealed.</p>
        )}
      </div>

      {over && <AnswerList tracks={tracks} />}

      <div className={over ? 'controls' : 'controls controls--secondary'}>
        {!over ? (
          <>
            <button type="button" className="btn" onClick={reshuffle}>
              <Icon name={typeof seed === 'number' ? 'reset' : 'shuffle'} />
              {typeof seed === 'number' ? 'Reset mix' : 'Reshuffle'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={reveal}>
              <Icon name="eye" /> Reveal tracks
            </button>
          </>
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

function TrackControls({
  rows,
  armedRow,
  solvedTrackIds,
  playingRow,
  onArm,
  onPlay,
  onSubmit,
}) {
  const armedTrackId = rows[armedRow]?.[0]?.trackId;
  const armedLocked =
    Boolean(armedTrackId) && solvedTrackIds.includes(armedTrackId);
  return (
    <section className="switchboard" aria-label="Track switchboard">
      {rows.map((row, rowIndex) => {
        const trackId = row[0]?.trackId;
        const locked = Boolean(trackId) && solvedTrackIds.includes(trackId);
        const armed = armedRow === rowIndex;
        const playing = playingRow === rowIndex;
        return (
          <div
            key={rowIndex}
            className={[
              'switch-channel',
              armed && 'switch-channel--armed',
              locked && 'switch-channel--locked',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <button
              type="button"
              className="switch-button"
              aria-pressed={armed}
              disabled={locked}
              onClick={() => onArm(rowIndex)}
            >
              <span className="switch-light" />
              Track {rowIndex + 1}
            </button>
            <button
              type="button"
              className="btn btn--mini"
              onClick={() => onPlay(rowIndex)}
            >
              <Icon name={playing ? 'stop' : 'play'} />{' '}
              {playing ? 'Stop' : 'Play row'}
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="btn btn--primary submit-route"
        disabled={armedLocked}
        onClick={onSubmit}
      >
        <Icon name="check" /> Submit armed track
      </button>
    </section>
  );
}

function VolumeControlPanel({ volume, onVolumeChange }) {
  return (
    <section className="volume-panel" aria-label="Playback volume">
      <VolumeControl volume={volume} onVolumeChange={onVolumeChange} />
    </section>
  );
}

function VolumeControl({ volume, onVolumeChange }) {
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

function AnswerList({ tracks }) {
  return (
    <section className="answer-stack" aria-label="Answer tracks">
      {tracks.map((track, idx) => (
        <div className="now-playing answer-row" key={track.id}>
          {track.answer?.artwork && (
            <img src={track.answer.artwork} alt="" className="np-art" />
          )}
          <div>
            <div className="np-title">
              Track {idx + 1}: {track.answer?.title}
            </div>
            <div className="np-artist">{track.answer?.artist}</div>
          </div>
        </div>
      ))}
    </section>
  );
}

function shareGridFromHistory(history) {
  return history.map((guess) =>
    guess.tiles.map((tile) => ({
      correct: tile.correct,
      sameTrack: tile.sameTrack,
    }))
  );
}

function GuessHistory({ guesses }) {
  if (guesses.length === 0) return null;

  return (
    <section className="guess-history" aria-label="Submission history">
      <div className="guess-history-title">Submissions</div>
      <ol className="guess-list">
        {guesses.map((guess) => (
          <li key={guess.number} className="guess-entry guess-entry--mixer">
            <span className="guess-number">#{guess.number}</span>
            <span className="guess-row guess-row--tiles">
              {guess.tiles.map((tile, idx) => (
                <span
                  key={`${guess.number}-${idx}`}
                  className={[
                    'guess-cell',
                    tile.correct && 'guess-cell--correct',
                    tile.sameTrack && 'guess-cell--misplaced',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {tile.letter}
                </span>
              ))}
            </span>
            <span className="guess-note">
              {guess.solved
                ? 'track locked'
                : `${guess.correctPositions}/${guess.tiles.length} placed, ${guess.rightRowCount}/${guess.tiles.length} routed`}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

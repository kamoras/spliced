// The puzzle board: sortable pieces + playback + a Wordle-style guess limit.

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
  buildAnchoredOrder,
  countCorrect,
  gradeOrder,
  guessesLeft,
  isSolved,
  scoreBand,
  scorePuzzle,
  shufflePieces,
} from '../audio/puzzle.js';

const DEFAULT_VOLUME = 0.85;

function clampIndex(value, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(max, Math.max(0, Math.round(numeric)));
}

function clampVolume(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, numeric));
}

export default function Puzzle({
  song,
  buffer,
  pieces,
  onNewPuzzle,
  newPuzzleLabel = 'New puzzle',
  seed,
  maxGuesses = Infinity,
  onResult,
}) {
  const initialOrderRef = useRef(null);
  if (!initialOrderRef.current) {
    initialOrderRef.current = buildAnchoredOrder(pieces, seed);
  }

  const [order, setOrder] = useState(() => initialOrderRef.current);
  const [playingId, setPlayingId] = useState(null);
  const [playingSequence, setPlayingSequence] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [solved, setSolved] = useState(false);
  const [lost, setLost] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [attempts, setAttempts] = useState(0);
  const [guessHistory, setGuessHistory] = useState([]);
  const [playbackStart, setPlaybackStart] = useState(0);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [fullPlays, setFullPlays] = useState(0);
  const [joinChecks, setJoinChecks] = useState(0);
  const [activeJoinIndex, setActiveJoinIndex] = useState(null);

  const playerRef = useRef(null);
  if (!playerRef.current) {
    playerRef.current = new Player(getAudioContext(), buffer);
  }
  const player = playerRef.current;
  const playbackStartMax = Math.max(0, order.length - 1);
  const playbackStartIndex = clampIndex(playbackStart, playbackStartMax);

  useEffect(() => () => player.stop(), [player]);

  useEffect(() => {
    player.setVolume(volume);
  }, [player, volume]);

  useEffect(() => {
    setPlaybackStart((current) => clampIndex(current, playbackStartMax));
  }, [playbackStartMax]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const anchorPiece = order[0];
  const movablePieces = order.slice(1);
  const movableIds = useMemo(() => order.slice(1).map((p) => p.id), [order]);
  const slotOf = (id) => order.findIndex((p) => p.id === id) + 1;

  // Stable identity (letter + colour) per piece, assigned from a scramble so it
  // never correlates with the correct order. Travels with the piece as it moves.
  const identity = useMemo(() => {
    const scrambled = shufflePieces(pieces, seed);
    const map = {};
    scrambled.forEach((p, i) => {
      map[p.id] = {
        letter: String.fromCharCode(65 + i),
        color: `hsl(${Math.round((i * 360) / scrambled.length)} 70% 55%)`,
      };
    });
    return map;
  }, [pieces, seed]);
  const letterOf = (id) => identity[id]?.letter ?? '?';

  const limited = Number.isFinite(maxGuesses);
  const over = solved || lost || revealed;
  const movableTotal = Math.max(0, order.length - 1);
  const scoreStats = { attempts, fullPlays, joinChecks };
  const nextAttempt = attempts + 1;
  const projectedScore = scorePuzzle({
    solved: true,
    attempts: nextAttempt,
    fullPlays,
    joinChecks,
  });
  const finalScore = scorePuzzle({ solved, ...scoreStats });
  const finalScoreLabel = scoreBand(finalScore);

  function handleDragEnd(event) {
    const { active, over: target } = event;
    if (!target || active.id === target.id) return;
    setOrder((cur) => {
      const from = cur.findIndex((p) => p.id === active.id);
      const to = cur.findIndex((p) => p.id === target.id);
      if (from <= 0 || to <= 0) return cur;
      return arrayMove(cur, from, to);
    });
    setFeedback(null);
  }

  function handlePlaybackStartChange(value) {
    if (playingSequence) stopAll();
    setPlaybackStart(clampIndex(value, playbackStartMax));
  }

  function handleVolumeChange(value) {
    setVolume(clampVolume(value));
  }

  function stopAll() {
    player.stop();
    setPlayingId(null);
    setPlayingSequence(false);
    setActiveJoinIndex(null);
  }

  function playSequence(sequence) {
    setPlayingId(null);
    setActiveJoinIndex(null);
    setPlayingSequence(true);
    player.playSequence(sequence, {
      onPiece: (idx) => setPlayingId(sequence[idx]?.id ?? null),
      onEnd: () => {
        setPlayingId(null);
        setPlayingSequence(false);
      },
    });
  }

  function playCurrentOrder() {
    if (playingSequence) {
      stopAll();
      return;
    }
    setFullPlays((current) => current + 1);
    playSequence(order.slice(playbackStartIndex));
  }

  function playJoinAt(index) {
    const left = order[index];
    const right = order[index + 1];
    if (!left || !right) return;

    if (playingSequence) stopAll();
    setJoinChecks((current) => current + 1);
    setPlayingId(null);
    setPlayingSequence(true);
    setActiveJoinIndex(index);
    player.playJoin(left, right, {
      onPiece: (idx) => setPlayingId(idx === 0 ? left.id : right.id),
      onEnd: () => {
        setPlayingId(null);
        setPlayingSequence(false);
        setActiveJoinIndex(null);
      },
    });
  }

  function buildResult(nextSolved, tries, history) {
    const score = scorePuzzle({
      solved: nextSolved,
      attempts: tries,
      fullPlays,
      joinChecks,
    });

    return {
      solved: nextSolved,
      attempts: tries,
      fullPlays,
      joinChecks,
      score,
      scoreLabel: scoreBand(score),
      grid: shareGridFromHistory(history),
    };
  }

  // Play the correct song end-to-end (offered once the game is over).
  function playSong() {
    if (playingSequence) {
      stopAll();
      return;
    }
    playSequence([...pieces].sort((a, b) => a.correctIndex - b.correctIndex));
  }

  function submitGuess() {
    const guess = order;
    const tries = attempts + 1;
    const grades = gradeOrder(guess);
    const won = isSolved(guess);
    const out = limited && tries >= maxGuesses && !won;
    const nextGuess = {
      number: tries,
      tiles: guess.map((piece, idx) => ({
        id: piece.id,
        letter: letterOf(piece.id),
        correct: grades[idx].correct,
        anchor: grades[idx].anchor,
      })),
    };
    const nextGuessHistory = [...guessHistory, nextGuess];

    setAttempts(tries);
    setPlaybackStart(0);
    setPlayingId(null);
    setActiveJoinIndex(null);
    setGuessHistory(nextGuessHistory);

    if (won) {
      setSolved(true);
      setRevealed(true);
      setFeedback(null);
      onResult?.(buildResult(true, tries, nextGuessHistory));
    } else if (out) {
      setLost(true);
      setRevealed(true);
      setFeedback(null);
      onResult?.(buildResult(false, tries, nextGuessHistory));
    } else {
      const right = Math.max(0, countCorrect(guess) - 1);
      const left = limited ? guessesLeft(tries, maxGuesses) : null;
      const tail = limited
        ? ` ${left} ${left === 1 ? 'guess' : 'guesses'} left.`
        : '';
      setFeedback(
        right === 0
          ? `No movable clips in place yet.${tail}`
          : `Close! ${right} of ${movableTotal} movable clips are in the right spot.${tail}`
      );
    }

    stopAll();
  }

  // Give up: reveal the title, keep your order graded, and play the answer.
  function reveal() {
    setPlaybackStart(0);
    setRevealed(true);
    setSolved(false);
    setFeedback(null);
    onResult?.(buildResult(false, attempts, guessHistory));
    playSequence([...pieces].sort((a, b) => a.correctIndex - b.correctIndex));
  }

  // Daily (seeded) -> resets to the shared scramble; practice -> a fresh one.
  function reshuffle() {
    stopAll();
    const next = buildAnchoredOrder(pieces, seed);
    setOrder(next);
    setPlaybackStart(0);
    setRevealed(false);
    setSolved(false);
    setLost(false);
    setFeedback(null);
    setAttempts(0);
    setGuessHistory([]);
    setFullPlays(0);
    setJoinChecks(0);
    setActiveJoinIndex(null);
  }

  const a11y = {
    screenReaderInstructions: {
      draggable:
        'To reorder a movable clip, press Space or Enter to pick it up, use the arrow keys to move it, then press Space or Enter to drop it.',
    },
    announcements: {
      onDragStart: ({ active }) => `Picked up clip ${letterOf(active.id)}.`,
      onDragOver: ({ over: o }) =>
        o ? `Clip now over position ${slotOf(o.id)}.` : undefined,
      onDragEnd: ({ active, over: o }) =>
        o
          ? `Clip ${letterOf(active.id)} dropped into position ${slotOf(o.id)}.`
          : 'Reorder cancelled.',
      onDragCancel: () => 'Reorder cancelled.',
    },
  };

  const playLabel = playingSequence ? 'Stop' : 'Play';

  return (
    <div className="panel">
      <div className="now-playing">
        {over && song.artwork ? (
          <img src={song.artwork} alt="" className="np-art" />
        ) : (
          <div className="np-art" aria-hidden="true" />
        )}
        <div>
          <div className="np-title">{over ? song.title : '???'}</div>
          <div className="np-artist">{over ? song.artist : 'Mystery clip'}</div>
        </div>
        <div className="np-meta">
          {movableTotal} movable
          <br />1 locked clip
        </div>
      </div>

      {limited && !over && (
        <div className="guesses">
          <span className="pips" aria-hidden="true">
            {Array.from({ length: maxGuesses }, (_, i) => (
              <span
                key={i}
                className={`pip ${i < attempts ? 'pip--used' : ''}`}
              />
            ))}
          </span>
          <span className="guesses-text">
            {guessesLeft(attempts, maxGuesses)} of {maxGuesses} guesses left
          </span>
        </div>
      )}

      {!over && (
        <>
          <ScoreTracker
            projectedScore={projectedScore}
            fullPlays={fullPlays}
            joinChecks={joinChecks}
          />
          <PlaybackOrder
            order={order}
            identity={identity}
            playingId={playingId}
            activeJoinIndex={activeJoinIndex}
            startIndex={playbackStartIndex}
            onStartIndexChange={handlePlaybackStartChange}
            onJoinCheck={playJoinAt}
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
        <ol className="board" aria-label="Puzzle pieces in your current order">
          {anchorPiece && (
            <li key={anchorPiece.id} style={{ display: 'contents' }}>
              <PieceTile
                piece={anchorPiece}
                position={0}
                letter={identity[anchorPiece.id]?.letter}
                color={identity[anchorPiece.id]?.color}
                isPlaying={playingId === anchorPiece.id}
                isCorrect={anchorPiece.correctIndex === 0}
                locked
                revealed={revealed}
              />
            </li>
          )}
          <SortableContext items={movableIds} strategy={rectSortingStrategy}>
            {movablePieces.map((piece, offset) => {
              const idx = offset + 1;
              return (
                <li key={piece.id} style={{ display: 'contents' }}>
                  <PieceTile
                    piece={piece}
                    position={idx}
                    letter={identity[piece.id]?.letter}
                    color={identity[piece.id]?.color}
                    isPlaying={playingId === piece.id}
                    isCorrect={piece.correctIndex === idx}
                    revealed={revealed}
                  />
                </li>
              );
            })}
          </SortableContext>
        </ol>
      </DndContext>

      <GuessHistory guesses={guessHistory} />

      <div role="status" aria-live="polite">
        {feedback && !over && <p className="feedback">{feedback}</p>}
        {solved && (
          <p className="result-banner is-win">
            <strong>
              {finalScore} · {finalScoreLabel}.
            </strong>{' '}
            It was {song.title} — {song.artist}.
          </p>
        )}
        {lost && (
          <p className="result-banner is-loss">
            <strong>Out of guesses.</strong> It was {song.title} — {song.artist}
            .
          </p>
        )}
        {revealed && !solved && !lost && (
          <p className="result-banner is-loss">
            Revealed: {song.title} — {song.artist}.
          </p>
        )}
      </div>

      {over && (
        <section
          className="playback-order playback-order--compact"
          aria-label="Playback controls"
        >
          <VolumeControl volume={volume} onVolumeChange={handleVolumeChange} />
        </section>
      )}

      <div className="controls">
        {!over ? (
          <>
            <button type="button" className="btn" onClick={playCurrentOrder}>
              <Icon name={playingSequence ? 'stop' : 'play'} /> {playLabel}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={submitGuess}
            >
              <Icon name="check" /> Submit guess
            </button>
            <button type="button" className="btn" onClick={reshuffle}>
              <Icon name={typeof seed === 'number' ? 'reset' : 'shuffle'} />
              {typeof seed === 'number' ? 'Reset order' : 'Reshuffle'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={reveal}>
              <Icon name="eye" /> Reveal answer
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn--primary"
              onClick={playSong}
            >
              <Icon name={playingSequence ? 'stop' : 'play'} />
              {playingSequence ? 'Stop' : 'Play song'}
            </button>
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

function ScoreTracker({ projectedScore, fullPlays, joinChecks }) {
  return (
    <section className="score-tracker" aria-label="Score tracker">
      <div className="score-tracker-main">
        <span className="score-tracker-value">{projectedScore}</span>
        <span className="score-tracker-label">score if solved now</span>
      </div>
      <div className="score-tracker-stat">
        <span>{fullPlays}</span>
        <span>plays</span>
      </div>
      <div className="score-tracker-stat">
        <span>{joinChecks}</span>
        <span>checks</span>
      </div>
    </section>
  );
}

function PlaybackOrder({
  order,
  identity,
  playingId,
  activeJoinIndex,
  startIndex,
  onStartIndexChange,
  onJoinCheck,
  volume,
  onVolumeChange,
}) {
  const maxStart = Math.max(0, order.length - 1);
  const startPiece = order[startIndex];
  const startLetter = identity[startPiece?.id]?.letter ?? '?';

  return (
    <section className="playback-order" aria-label="Playback order">
      <div className="playback-order-head">
        <div className="playback-order-title">
          <Icon name="play" /> Current mix
        </div>
        <span className="playback-order-readout">Start {startIndex + 1}</span>
      </div>
      <ol className="playback-order-list playback-order-list--joins">
        {order.map((piece, idx) => {
          const item = identity[piece.id];
          const next = order[idx + 1];
          const nextItem = identity[next?.id];
          const active = playingId === piece.id;
          const beforeStart = idx < startIndex;
          const start = idx === startIndex;
          const joinActive = activeJoinIndex === idx;
          return (
            <li key={piece.id} className="playback-order-step">
              <span
                className={[
                  'playback-order-cell',
                  piece.locked && 'playback-order-cell--locked',
                  beforeStart && 'playback-order-cell--before-start',
                  start && 'playback-order-cell--start',
                  active && 'playback-order-cell--active',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-current={active ? 'true' : undefined}
                aria-label={`Position ${idx + 1}: clip ${item?.letter ?? '?'}${
                  start
                    ? ', playback starts here'
                    : beforeStart
                      ? ', skipped by current start point'
                      : ''
                }`}
              >
                <span className="playback-order-index">{idx + 1}</span>
                <span className="playback-order-id">
                  <span
                    className="tile-dot"
                    style={{ background: item?.color }}
                    aria-hidden="true"
                  />
                  {item?.letter ?? '?'}
                </span>
                {piece.locked && (
                  <Icon name="lock" className="playback-order-lock" />
                )}
              </span>
              {next && (
                <button
                  type="button"
                  className={['join-check', joinActive && 'join-check--active']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onJoinCheck(idx)}
                  aria-label={`Check join between clip ${item?.letter ?? '?'} and clip ${nextItem?.letter ?? '?'}`}
                >
                  <Icon name="play" />
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <div className="mixer-sliders">
        <label className="mixer-slider">
          <span className="mixer-slider-label">Start</span>
          <input
            className="mixer-range"
            type="range"
            min="0"
            max={maxStart}
            step="1"
            value={startIndex}
            aria-valuetext={`Position ${startIndex + 1}, clip ${startLetter}`}
            onChange={(event) => onStartIndexChange(Number(event.target.value))}
          />
          <span className="mixer-slider-value">{startIndex + 1}</span>
        </label>
        <VolumeControl volume={volume} onVolumeChange={onVolumeChange} />
      </div>
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

function shareGridFromHistory(history) {
  return history.map((guess) =>
    guess.tiles.map(({ correct, anchor }) => ({ correct, anchor }))
  );
}

function GuessHistory({ guesses }) {
  if (guesses.length === 0) return null;

  return (
    <section className="guess-history" aria-label="Guess history">
      <div className="guess-history-title">Guess history</div>
      <ol className="guess-list">
        {guesses.map((guess) => (
          <li key={guess.number} className="guess-entry">
            <span className="guess-number">#{guess.number}</span>
            <div className="guess-row">
              {guess.tiles.map((tile) => (
                <span
                  key={`${guess.number}-${tile.id}`}
                  className={[
                    'guess-cell',
                    tile.correct ? 'guess-cell--correct' : 'guess-cell--wrong',
                    tile.anchor && 'guess-cell--anchor',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label={`Clip ${tile.letter}: ${
                    tile.anchor
                      ? 'locked clip'
                      : tile.correct
                        ? 'correct spot'
                        : 'wrong spot'
                  }`}
                >
                  <span>{tile.letter}</span>
                  <Icon
                    name={
                      tile.anchor ? 'lock' : tile.correct ? 'check' : 'close'
                    }
                    className="guess-cell-icon"
                  />
                </span>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

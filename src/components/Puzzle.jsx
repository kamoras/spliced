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
  shufflePieces,
} from '../audio/puzzle.js';

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
  const [playbackOrder, setPlaybackOrder] = useState(
    () => initialOrderRef.current
  );
  const [playingId, setPlayingId] = useState(null);
  const [playingSequence, setPlayingSequence] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [solved, setSolved] = useState(false);
  const [lost, setLost] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [attempts, setAttempts] = useState(0);
  const [guessHistory, setGuessHistory] = useState([]);

  const playerRef = useRef(null);
  if (!playerRef.current) {
    playerRef.current = new Player(getAudioContext(), buffer);
  }
  const player = playerRef.current;

  useEffect(() => () => player.stop(), [player]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const movableIds = useMemo(
    () => order.filter((p) => !p.locked).map((p) => p.id),
    [order]
  );
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

  function handleDragEnd(event) {
    const { active, over: target } = event;
    if (!target || active.id === target.id) return;
    setOrder((cur) => {
      const from = cur.findIndex((p) => p.id === active.id);
      const to = cur.findIndex((p) => p.id === target.id);
      if (cur[from]?.locked || cur[to]?.locked) return cur;
      return arrayMove(cur, from, to);
    });
    setFeedback(null);
  }

  function stopAll() {
    player.stop();
    setPlayingId(null);
    setPlayingSequence(false);
  }

  function playSequence(sequence) {
    setPlayingId(null);
    setPlayingSequence(true);
    player.playSequence(sequence, {
      onPiece: (idx) => setPlayingId(sequence[idx]?.id ?? null),
      onEnd: () => {
        setPlayingId(null);
        setPlayingSequence(false);
      },
    });
  }

  function playLastSubmittedOrder() {
    if (playingSequence) {
      stopAll();
      return;
    }
    playSequence(playbackOrder);
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
    setPlaybackOrder(guess);
    setPlayingId(null);
    setGuessHistory(nextGuessHistory);

    if (won) {
      setSolved(true);
      setRevealed(true);
      setFeedback(null);
      onResult?.({
        solved: true,
        attempts: tries,
        grid: shareGridFromHistory(nextGuessHistory),
      });
    } else if (out) {
      setLost(true);
      setRevealed(true);
      setFeedback(null);
      onResult?.({
        solved: false,
        attempts: tries,
        grid: shareGridFromHistory(nextGuessHistory),
      });
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

    // A submitted guess becomes the only playable arrangement.
    playSequence(guess);
  }

  // Give up: reveal the title, keep your order graded, and play the answer.
  function reveal() {
    setRevealed(true);
    setSolved(false);
    setFeedback(null);
    onResult?.({
      solved: false,
      attempts,
      grid: shareGridFromHistory(guessHistory),
    });
    playSequence([...pieces].sort((a, b) => a.correctIndex - b.correctIndex));
  }

  // Daily (seeded) -> resets to the shared scramble; practice -> a fresh one.
  function reshuffle() {
    stopAll();
    const next = buildAnchoredOrder(pieces, seed);
    setOrder(next);
    setPlaybackOrder(next);
    setRevealed(false);
    setSolved(false);
    setLost(false);
    setFeedback(null);
    setAttempts(0);
    setGuessHistory([]);
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

  const playLabel = playingSequence
    ? 'Stop playback'
    : attempts > 0
      ? 'Replay last guess'
      : 'Play starting order';

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

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={a11y}
      >
        <SortableContext items={movableIds} strategy={rectSortingStrategy}>
          <ol
            className="board"
            aria-label="Puzzle pieces in your current order"
          >
            {order.map((piece, idx) => (
              <li key={piece.id} style={{ display: 'contents' }}>
                <PieceTile
                  piece={piece}
                  position={idx}
                  letter={identity[piece.id]?.letter}
                  color={identity[piece.id]?.color}
                  isPlaying={playingId === piece.id}
                  isCorrect={piece.correctIndex === idx}
                  locked={piece.locked}
                  revealed={revealed}
                />
              </li>
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      <GuessHistory guesses={guessHistory} />

      <div role="status" aria-live="polite">
        {feedback && !over && <p className="feedback">{feedback}</p>}
        {solved && (
          <p className="result-banner is-win">
            <strong>Solved it!</strong> It was {song.title} — {song.artist}.
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

      <div className="controls">
        {!over ? (
          <>
            <button
              type="button"
              className="btn"
              onClick={playLastSubmittedOrder}
            >
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
              {playingSequence ? 'Stop playback' : 'Play song'}
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

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
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';

import PieceTile from './PieceTile.jsx';
import Icon from './Icon.jsx';
import { Player } from '../audio/player.js';
import { getAudioContext } from '../audio/slicer.js';
import {
  isSolved,
  countCorrect,
  shufflePieces,
  guessesLeft,
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
  const [order, setOrder] = useState(() => shufflePieces(pieces, seed));
  const [playingId, setPlayingId] = useState(null);
  const [seqIndex, setSeqIndex] = useState(-1);
  const [revealed, setRevealed] = useState(false);
  const [solved, setSolved] = useState(false);
  const [lost, setLost] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [attempts, setAttempts] = useState(0);

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

  const orderedIds = useMemo(() => order.map((p) => p.id), [order]);
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

  function handleDragEnd(event) {
    const { active, over: target } = event;
    if (!target || active.id === target.id) return;
    setOrder((cur) => {
      const from = cur.findIndex((p) => p.id === active.id);
      const to = cur.findIndex((p) => p.id === target.id);
      return arrayMove(cur, from, to);
    });
    setFeedback(null);
  }

  function playPiece(piece) {
    if (playingId === piece.id) {
      player.stop();
      setPlayingId(null);
      return;
    }
    setSeqIndex(-1);
    setPlayingId(piece.id);
    player.playPiece(piece, () => setPlayingId(null));
  }

  function stopAll() {
    player.stop();
    setPlayingId(null);
    setSeqIndex(-1);
  }

  // Play the correct song end-to-end (offered once the game is over).
  function playSong() {
    setPlayingId(null);
    player.playSequence(pieces, {
      onPiece: (idx) => setSeqIndex(idx),
      onEnd: () => setSeqIndex(-1),
    });
  }

  // Submitting a guess plays the arrangement back in your current order, then
  // grades it. Solving — or running out of guesses — ends the game.
  function submitGuess() {
    const tries = attempts + 1;
    setAttempts(tries);
    setPlayingId(null);

    const won = isSolved(order);
    const out = limited && tries >= maxGuesses && !won;

    if (won) {
      setSolved(true);
      setRevealed(true);
      setFeedback(null);
      onResult?.({ solved: true, attempts: tries });
    } else if (out) {
      // Keep the final arrangement so it stays graded tile-by-tile.
      setLost(true);
      setRevealed(true);
      setFeedback(null);
      onResult?.({ solved: false, attempts: tries });
    } else {
      const right = countCorrect(order);
      const left = limited ? guessesLeft(tries, maxGuesses) : null;
      const tail = limited
        ? ` ${left} ${left === 1 ? 'guess' : 'guesses'} left.`
        : '';
      setFeedback(
        right === 0
          ? `Nothing in place yet — trust your ears.${tail}`
          : `Close! ${right} of ${order.length} pieces are in the right spot.${tail}`
      );
    }

    // Hear the order you just submitted.
    player.playSequence(order, {
      onPiece: (idx) => setSeqIndex(idx),
      onEnd: () => setSeqIndex(-1),
    });
  }

  // Give up: reveal the title, keep your order graded, and play the answer.
  function reveal() {
    setRevealed(true);
    setSolved(false);
    setFeedback(null);
    onResult?.({ solved: false, attempts });
    playSong();
  }

  // Daily (seeded) → resets to the shared scramble; practice → a fresh one.
  function reshuffle() {
    stopAll();
    setOrder(shufflePieces(pieces, seed));
    setRevealed(false);
    setSolved(false);
    setLost(false);
    setFeedback(null);
    setAttempts(0);
  }

  const a11y = {
    screenReaderInstructions: {
      draggable:
        'To reorder a piece, press Space or Enter to pick it up, use the arrow keys to move it, then press Space or Enter to drop it.',
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
          {order.length} pieces
          <br />
          {attempts} {attempts === 1 ? 'try' : 'tries'}
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
        <SortableContext
          items={orderedIds}
          strategy={horizontalListSortingStrategy}
        >
          <ol className="board" aria-label="Puzzle pieces in your current order">
            {order.map((piece, idx) => (
              <li key={piece.id} style={{ display: 'contents' }}>
                <PieceTile
                  piece={piece}
                  position={idx}
                  letter={identity[piece.id]?.letter}
                  color={identity[piece.id]?.color}
                  isPlaying={playingId === piece.id || seqIndex === idx}
                  isCorrect={piece.correctIndex === idx}
                  revealed={revealed}
                  onPlay={playPiece}
                />
              </li>
            ))}
          </ol>
        </SortableContext>
      </DndContext>

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
            <button type="button" className="btn btn--primary" onClick={submitGuess}>
              <Icon name="check" /> Submit guess
            </button>
            <button type="button" className="btn" onClick={stopAll}>
              <Icon name="stop" /> Stop
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
            <button type="button" className="btn btn--primary" onClick={playSong}>
              <Icon name="play" /> Play song
            </button>
            <button type="button" className="btn" onClick={stopAll}>
              <Icon name="stop" /> Stop
            </button>
            {onNewPuzzle && (
              <button type="button" className="btn btn--ghost" onClick={onNewPuzzle}>
                {newPuzzleLabel}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

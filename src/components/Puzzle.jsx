// The puzzle board: sortable pieces + playback controls + win state.

import { useMemo, useRef, useState } from 'react';
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
import { Player } from '../audio/player.js';
import { getAudioContext } from '../audio/slicer.js';
import { isSolved, countCorrect, shufflePieces } from '../audio/puzzle.js';

export default function Puzzle({
  song,
  buffer,
  pieces,
  onNewPuzzle,
  newPuzzleLabel = '← New puzzle',
  seed,
  onResult,
}) {
  const [order, setOrder] = useState(() => shufflePieces(pieces, seed));
  const [playingId, setPlayingId] = useState(null);
  const [seqIndex, setSeqIndex] = useState(-1);
  const [revealed, setRevealed] = useState(false);
  const [solved, setSolved] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [attempts, setAttempts] = useState(0);

  const playerRef = useRef(null);
  if (!playerRef.current) {
    playerRef.current = new Player(getAudioContext(), buffer);
  }
  const player = playerRef.current;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const orderedIds = useMemo(() => order.map((p) => p.id), [order]);

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((cur) => {
      const from = cur.findIndex((p) => p.id === active.id);
      const to = cur.findIndex((p) => p.id === over.id);
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

  function playArrangement() {
    setPlayingId(null);
    player.playSequence(order, {
      onPiece: (idx) => setSeqIndex(idx),
      onEnd: () => setSeqIndex(-1),
    });
  }

  function stopAll() {
    player.stop();
    setPlayingId(null);
    setSeqIndex(-1);
  }

  function check() {
    const tries = attempts + 1;
    setAttempts(tries);
    if (isSolved(order)) {
      setSolved(true);
      setRevealed(true);
      stopAll();
      onResult?.({ solved: true, attempts: tries });
      // Reward: play the correctly reassembled clip.
      player.playSequence(order, {
        onPiece: (idx) => setSeqIndex(idx),
        onEnd: () => setSeqIndex(-1),
      });
    } else {
      const right = countCorrect(order);
      setFeedback(
        right === 0
          ? 'Not yet — nothing in place. Trust your ears!'
          : `Close! ${right} of ${order.length} pieces are in the right spot.`
      );
    }
  }

  function reveal() {
    stopAll();
    setOrder([...pieces]);
    setRevealed(true);
    setSolved(false);
    onResult?.({ solved: false, attempts });
    player.playSequence(pieces, {
      onPiece: (idx) => setSeqIndex(idx),
      onEnd: () => setSeqIndex(-1),
    });
  }

  // In daily mode (seeded) this resets to the shared scramble; in practice
  // mode it produces a fresh random one.
  function reshuffle() {
    stopAll();
    setOrder(shufflePieces(pieces, seed));
    setRevealed(false);
    setSolved(false);
    setFeedback(null);
  }

  return (
    <div className="puzzle">
      <div className="now-playing">
        {song.artwork && <img src={song.artwork} alt="" className="np-art" />}
        <div>
          <div className="np-title">{solved || revealed ? song.title : '???'}</div>
          <div className="np-artist">
            {solved || revealed ? song.artist : 'Mystery clip'}
          </div>
        </div>
        <div className="np-meta">
          {order.length} pieces · {attempts} {attempts === 1 ? 'try' : 'tries'}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={orderedIds} strategy={horizontalListSortingStrategy}>
          <div className="board" data-count={order.length}>
            {order.map((piece, idx) => (
              <PieceTile
                key={piece.id}
                piece={piece}
                position={idx}
                isPlaying={playingId === piece.id || seqIndex === idx}
                isCorrect={piece.correctIndex === idx}
                revealed={revealed}
                onPlay={playPiece}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {feedback && !solved && <p className="feedback">{feedback}</p>}

      {solved && (
        <div className="win">
          🎉 <strong>Solved it!</strong> That was{' '}
          <em>
            {song.title} — {song.artist}
          </em>
          .
        </div>
      )}

      <div className="controls">
        <button className="btn btn-primary" onClick={playArrangement}>
          ► Play arrangement
        </button>
        <button className="btn" onClick={stopAll}>
          ■ Stop
        </button>
        {!solved && (
          <button className="btn btn-accent" onClick={check}>
            ✓ Check
          </button>
        )}
        <button className="btn" onClick={reshuffle}>
          {typeof seed === 'number' ? '⟲ Reset order' : '⤮ Reshuffle'}
        </button>
        {!solved && (
          <button className="btn btn-ghost" onClick={reveal}>
            Reveal answer
          </button>
        )}
        {onNewPuzzle && (
          <button className="btn btn-ghost" onClick={onNewPuzzle}>
            {newPuzzleLabel}
          </button>
        )}
      </div>
    </div>
  );
}

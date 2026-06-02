// A single draggable puzzle piece: drag handle + waveform + play button.

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Waveform from './Waveform.jsx';

export default function PieceTile({
  piece,
  position,
  isPlaying,
  isCorrect,
  revealed,
  onPlay,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: piece.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 5 : 1,
  };

  const className = [
    'tile',
    isPlaying && 'tile-playing',
    isDragging && 'tile-dragging',
    revealed && (isCorrect ? 'tile-correct' : 'tile-wrong'),
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={setNodeRef} style={style} className={className}>
      <button
        className="tile-grip"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <span className="slot-no">{position + 1}</span>
        <span className="grip-dots">⠿</span>
      </button>

      <div className="tile-wave">
        <Waveform peaks={piece.peaks} active={isPlaying} />
      </div>

      <button
        className="tile-play"
        aria-label="Play this piece"
        onClick={() => onPlay(piece)}
      >
        {isPlaying ? '❚❚' : '►'}
      </button>
    </div>
  );
}

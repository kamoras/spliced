// A single draggable puzzle piece. Each piece has a stable identity (a colour
// and letter) that travels with it as it's reordered, so a move is visibly the
// same clip in a new spot. When the answer is revealed, correctness is shown
// with an icon AND a word — never colour alone.

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Waveform from './Waveform.jsx';
import Icon from './Icon.jsx';

export default function PieceTile({
  piece,
  position,
  letter,
  color,
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
        type="button"
        className="tile-grip"
        aria-label={`Reorder clip ${letter} (currently position ${position + 1})`}
        {...attributes}
        {...listeners}
      >
        <span className="tile-id">
          <span className="tile-dot" style={{ background: color }} aria-hidden="true" />
          {letter}
        </span>
        <Icon name="grip" className="grip-dots" />
      </button>

      <div className="tile-wave">
        <Waveform peaks={piece.peaks} active={isPlaying} color={color} />
      </div>

      <button
        type="button"
        className="tile-play"
        aria-label={`${isPlaying ? 'Pause' : 'Play'} clip ${letter}`}
        onClick={() => onPlay(piece)}
      >
        <Icon name={isPlaying ? 'pause' : 'play'} />
        {isPlaying ? 'Pause' : 'Play'}
      </button>

      {revealed && (
        <div className={`tile-state ${isCorrect ? 'tile-state--ok' : 'tile-state--no'}`}>
          <Icon name={isCorrect ? 'check' : 'close'} />
          {isCorrect ? 'Correct spot' : 'Wrong spot'}
        </div>
      )}
    </div>
  );
}

// A single draggable puzzle piece: drag handle + waveform + play button.
// When the answer is revealed, each tile shows its correctness with an icon
// AND a word — never colour alone — for colourblind accessibility.

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Waveform from './Waveform.jsx';
import Icon from './Icon.jsx';

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

  const slot = position + 1;

  return (
    <div ref={setNodeRef} style={style} className={className}>
      <button
        type="button"
        className="tile-grip"
        aria-label={`Reorder the piece in slot ${slot}`}
        {...attributes}
        {...listeners}
      >
        <span className="slot-no">{slot}</span>
        <Icon name="grip" className="grip-dots" />
      </button>

      <div className="tile-wave">
        <Waveform peaks={piece.peaks} active={isPlaying} />
      </div>

      <button
        type="button"
        className="tile-play"
        aria-label={`${isPlaying ? 'Pause' : 'Play'} the piece in slot ${slot}`}
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

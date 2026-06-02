// A single puzzle piece. Each piece has a stable identity (a colour and letter)
// that travels with it as it is reordered. The first clip is locked in place;
// movable clips expose only their drag handle because playback is sequence-only.

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
  locked = false,
  revealed,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: piece.id, disabled: locked });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 5 : 1,
  };

  const className = [
    'tile',
    locked && 'tile-locked',
    isPlaying && 'tile-playing',
    isDragging && 'tile-dragging',
    revealed && (isCorrect ? 'tile-correct' : 'tile-wrong'),
  ]
    .filter(Boolean)
    .join(' ');

  const identity = (
    <span className="tile-id">
      <span
        className="tile-dot"
        style={{ background: color }}
        aria-hidden="true"
      />
      {letter}
    </span>
  );

  return (
    <div ref={setNodeRef} style={style} className={className}>
      {locked ? (
        <div
          className="tile-grip tile-grip--locked"
          aria-label={`Locked start clip ${letter} at position ${position + 1}`}
        >
          {identity}
          <span className="tile-locked-label">
            <Icon name="lock" /> Start
          </span>
        </div>
      ) : (
        <button
          type="button"
          className="tile-grip"
          aria-label={`Reorder clip ${letter} (currently position ${position + 1})`}
          {...attributes}
          {...listeners}
        >
          {identity}
          <Icon name="grip" className="grip-dots" />
        </button>
      )}

      <div className="tile-wave">
        <Waveform peaks={piece.peaks} active={isPlaying} color={color} />
      </div>

      {revealed && (
        <div
          className={`tile-state ${isCorrect ? 'tile-state--ok' : 'tile-state--no'}`}
        >
          <Icon name={isCorrect ? 'check' : 'close'} />
          {isCorrect ? 'Correct spot' : 'Wrong spot'}
        </div>
      )}
    </div>
  );
}

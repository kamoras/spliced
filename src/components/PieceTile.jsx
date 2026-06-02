// A single puzzle piece. Each piece has a stable identity (a colour and letter)
// that travels with it as it is reordered. One clip is locked in place;
// movable clips expose only their drag handle because playback is sequence-only.

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Waveform from './Waveform.jsx';
import Icon from './Icon.jsx';

export default function PieceTile(props) {
  return props.locked ? (
    <LockedPieceTile {...props} />
  ) : (
    <SortablePieceTile {...props} />
  );
}

function SortablePieceTile(props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.piece.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 5 : 1,
  };

  return (
    <TileShell
      {...props}
      isDragging={isDragging}
      nodeRef={setNodeRef}
      style={style}
      grip={
        <button
          type="button"
          className="tile-grip"
          aria-label={`Reorder clip ${props.letter} (currently position ${props.position + 1})`}
          {...attributes}
          {...listeners}
        >
          <TileIdentity letter={props.letter} color={props.color} />
          <Icon name="grip" className="grip-dots" />
        </button>
      }
    />
  );
}

function LockedPieceTile(props) {
  return (
    <TileShell
      {...props}
      grip={
        <div
          className="tile-grip tile-grip--locked"
          aria-label={`Locked clip ${props.letter} at position ${props.position + 1}`}
        >
          <TileIdentity letter={props.letter} color={props.color} />
          <span className="tile-locked-label">
            <Icon name="lock" /> Locked
          </span>
        </div>
      }
    />
  );
}

function TileShell({
  piece,
  color,
  isPlaying,
  isCorrect,
  isDragging = false,
  locked = false,
  revealed,
  nodeRef,
  style,
  grip,
}) {
  const className = [
    'tile',
    locked && 'tile-locked',
    isPlaying && 'tile-playing',
    isDragging && 'tile-dragging',
    revealed && (isCorrect ? 'tile-correct' : 'tile-wrong'),
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={nodeRef} style={style} className={className}>
      {grip}

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

function TileIdentity({ letter, color }) {
  return (
    <span className="tile-id">
      <span
        className="tile-dot"
        style={{ background: color }}
        aria-hidden="true"
      />
      {letter}
    </span>
  );
}

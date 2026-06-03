// A single puzzle clip tile. Each clip has a neutral token that travels with it
// as it is reordered; solved tracks become locked.

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
          aria-label={`Reorder clip ${props.letter} currently in slot ${props.position + 1}`}
          {...attributes}
          {...listeners}
        >
          <span className="tile-grip-main">
            <TilePosition position={props.position} />
            <TileIdentity letter={props.letter} color={props.color} />
          </span>
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
          aria-label={`Locked clip ${props.letter} at slot ${props.position + 1}`}
        >
          <span className="tile-grip-main">
            <TilePosition position={props.position} />
            <TileIdentity letter={props.letter} color={props.color} />
          </span>
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
  tileState,
  isDragging = false,
  locked = false,
  revealed,
  gradeVisible = false,
  nodeRef,
  style,
  grip,
  onPlay,
}) {
  // `revealed` lights status on locked/finished rows; `gradeVisible` lights it
  // on an active row right after a wrong submit, while keeping the clip playable.
  const showGrade = revealed || gradeVisible;
  const className = [
    'tile',
    locked && 'tile-locked',
    isPlaying && 'tile-playing',
    isDragging && 'tile-dragging',
    showGrade && tileState === 'correct' && 'tile-correct',
    showGrade && tileState === 'misplaced' && 'tile-misplaced',
  ]
    .filter(Boolean)
    .join(' ');

  const stateLabel = tileState === 'correct' ? 'Correct spot' : 'Right track';

  return (
    <div ref={nodeRef} style={style} className={className}>
      {grip}

      <div className="tile-wave">
        <Waveform peaks={piece.peaks} active={isPlaying} color={color} />
      </div>

      {onPlay && !revealed && (
        <button type="button" className="tile-play" onClick={onPlay}>
          <Icon name={isPlaying ? 'stop' : 'play'} />
          {isPlaying ? 'Stop' : 'Play clip'}
        </button>
      )}

      {showGrade && tileState && (
        <div className={`tile-state tile-state--${tileState}`}>
          <Icon name={tileState === 'correct' ? 'check' : 'shuffle'} />
          {stateLabel}
        </div>
      )}
    </div>
  );
}

function TilePosition({ position }) {
  return <span className="tile-position">{position + 1}</span>;
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

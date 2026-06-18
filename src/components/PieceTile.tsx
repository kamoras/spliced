// A single puzzle clip tile. Each clip has a neutral token that travels with it
// as it is reordered; solved tracks become locked.

import type { CSSProperties, ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Waveform from './Waveform.jsx';
import Icon from './Icon.jsx';
import type { Piece } from '../types.js';

export type TileState = 'correct' | 'misplaced' | null;

export interface PieceTileProps {
  piece: Piece;
  position: number;
  letter?: string;
  color?: string;
  isPlaying: boolean;
  tileState: TileState;
  gradeVisible?: boolean;
  locked?: boolean;
  revealed?: boolean;
  onPlay?: () => void;
  onSeek?: (fraction: number) => void;
  getClipProgress?: (pieceId: string) => number | null;
}

export default function PieceTile(props: PieceTileProps) {
  return props.locked ? (
    <LockedPieceTile {...props} />
  ) : (
    <SortablePieceTile {...props} />
  );
}

function SortablePieceTile(props: PieceTileProps) {
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

function LockedPieceTile(props: PieceTileProps) {
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

interface TileShellProps extends PieceTileProps {
  isDragging?: boolean;
  nodeRef?: (node: HTMLElement | null) => void;
  style?: CSSProperties;
  grip: ReactNode;
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
  onSeek,
  getClipProgress,
}: TileShellProps) {
  // `revealed` lights status on locked/finished rows; `gradeVisible` lights it
  // on an active row right after a wrong submit, while keeping the clip playable.
  const showGrade = revealed || gradeVisible;
  // Playback no longer hinges on `revealed`: solved/finished rows stay
  // auditionable so players can replay a clip after locking it. The caller
  // gates this by passing/withholding onPlay and onSeek.
  const seekable = Boolean(onSeek);
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
        <Waveform
          peaks={piece.peaks}
          active={isPlaying}
          color={color}
          pieceId={piece.id}
          onSeek={seekable ? onSeek : undefined}
          getClipProgress={seekable ? getClipProgress : undefined}
        />
      </div>

      {onPlay && (
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

function TilePosition({ position }: { position: number }) {
  return <span className="tile-position">{position + 1}</span>;
}

function TileIdentity({ letter, color }: { letter?: string; color?: string }) {
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

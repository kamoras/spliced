// One clip on the board. Tap the tile to hear it; that also "cues" it (with
// anything it's spliced to). While a clip is cued, every tile the run can
// land on offers a ⇄ button in its corner: tap it to swap. Tapping the face
// of another tile just plays that one. (Press-and-drag does the same swap
// for a lone clip, as a power move.) Spliced neighbours share a strip of
// tape and lose the gap between them.

import type { CSSProperties, MouseEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Waveform from './Waveform.jsx';
import Icon from './Icon.jsx';
import type { Piece } from '../types.js';

export interface PieceTileProps {
  piece: Piece;
  slot: number;
  row: number;
  letter: string;
  playing: boolean;
  cued: boolean;
  // Spliced to the clip on its left / right.
  fusedLeft?: boolean;
  fusedRight?: boolean;
  // Letter of the cued clip when this tile can swap with it.
  swapWith: string | null;
  flash?: boolean;
  disabled?: boolean;
  // Has this clip been heard yet? Unheard clips show a "tap to hear" scope,
  // so the waveforms can't give away grouping or order at a glance.
  heard?: boolean;
  onTap: (fraction: number | null) => void;
  onSwap: () => void;
  getProgress: () => number | null;
}

export default function PieceTile({
  piece,
  slot,
  row,
  letter,
  playing,
  cued,
  fusedLeft = false,
  fusedRight = false,
  swapWith,
  flash = false,
  disabled = false,
  heard = true,
  onTap,
  onSwap,
  getProgress,
}: PieceTileProps) {
  // A spliced run moves by cue-and-⇄; dragging stays for lone clips, where
  // the sortable preview is honest.
  const { listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({
      id: piece.id,
      disabled: disabled || fusedLeft || fusedRight,
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    '--i': slot,
  } as CSSProperties;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (!playing) return onTap(null);
    const rect = event.currentTarget.getBoundingClientRect();
    // Keyboard "clicks" report clientX 0: treat as a restart.
    const fraction =
      event.clientX > 0 ? (event.clientX - rect.left) / rect.width : 0;
    onTap(Math.min(0.98, Math.max(0, fraction)));
  }

  const className = [
    'tile',
    playing && 'is-playing',
    cued && 'is-cued',
    isDragging && 'is-dragging',
    isOver && !isDragging && 'is-over',
    flash && 'is-flash',
    fusedLeft && 'is-fused-left',
    fusedRight && 'is-fused-right',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={className}
      data-piece={piece.id}
      {...listeners}
    >
      <button
        type="button"
        className="tile-face"
        onClick={handleClick}
        aria-pressed={cued}
        aria-label={`Clip ${letter}, channel ${row + 1} slot ${slot + 1}${
          fusedLeft || fusedRight ? ', spliced' : ''
        }. ${playing ? 'Playing. Press to restart.' : 'Press to play.'}`}
      >
        <span className="tile-chip" aria-hidden="true">
          {playing ? (
            <span className="eq">
              <i />
              <i />
              <i />
            </span>
          ) : (
            letter
          )}
        </span>
        {heard || playing ? (
          <Waveform
            peaks={piece.peaks}
            active={playing}
            getProgress={getProgress}
          />
        ) : (
          <span className="wave wave--blank" aria-hidden="true">
            <span>Tap to hear</span>
          </span>
        )}
      </button>
      {swapWith && (
        <button
          type="button"
          className="tile-swap"
          onClick={onSwap}
          aria-label={`Swap clip ${swapWith} with clip ${letter}`}
        >
          <Icon name="swap" />
        </button>
      )}
    </div>
  );
}

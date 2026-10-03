// One open channel on the board: the year tape, VU, PLAY and LOCK keys, and
// the row of clips with seam knobs between them.

import { Fragment, memo } from 'react';
import type { CSSProperties } from 'react';
import PieceTile from '../PieceTile.jsx';
import VuNeedle from '../VuNeedle.jsx';
import type { Mark } from '../../game/engine.js';
import type { Piece } from '../../types.js';

export interface ChannelStripProps {
  row: number;
  pieces: Piece[];
  clue: { year?: number; genre?: string };
  label: string;
  marks: Mark[] | null;
  tried: boolean;
  splicing: boolean;
  last: boolean;
  shakeKey: number;
  armed: boolean;
  meter: boolean;
  rowPlaying: boolean;
  seamPlaying: number | null;
  activeId: string | null;
  cued: string | null;
  cuedLetter: string | null;
  flash: string[];
  busy: boolean;
  rowCue: number | null;
  letterOf: (id: string) => string;
  heardClip: (id: string) => boolean;
  heardSeam: (a: string, b: string) => boolean;
  getProgress: (id: string) => () => number | null;
  onTapClip: (piece: Piece, fraction: number | null) => void;
  onSwap: (id: string) => void;
  onSeam: (seam: number) => void;
  onPlay: () => void;
  onLock: () => void;
  onTapLabel: () => void;
}

function ChannelStrip({
  row: r,
  pieces,
  clue,
  label,
  marks,
  tried,
  splicing,
  last,
  shakeKey,
  armed,
  meter,
  rowPlaying,
  seamPlaying,
  activeId,
  cued,
  cuedLetter,
  flash,
  busy,
  rowCue,
  letterOf,
  heardClip,
  heardSeam,
  getProgress,
  onTapClip,
  onSwap,
  onSeam,
  onPlay,
  onLock,
  onTapLabel,
}: ChannelStripProps) {
  return (
    <li
      className={['strip', splicing && 'is-splicing', last && 'is-last']
        .filter(Boolean)
        .join(' ')}
      aria-label={`Channel ${r + 1}${clue.year ? `, ${clue.year}` : ''}`}
    >
      <div className="strip-head">
        <span className="ch" aria-hidden="true">
          {r + 1}
        </span>
        <span className="tape-wrap">
          <button
            type="button"
            className={`tape${rowCue === r ? ' is-cued' : ''}${rowCue != null && rowCue !== r ? ' is-target' : ''}`}
            onClick={onTapLabel}
            disabled={busy}
            aria-pressed={rowCue === r}
            aria-label={`Clue: ${[clue.year, clue.genre].filter(Boolean).join(', ') || `channel ${r + 1}`}. ${rowCue != null && rowCue !== r ? 'Press to swap channels.' : 'Press, then press another label, to swap channels.'}`}
          >
            <span className="tape-year">{label}</span>
            {clue.genre && <span className="tape-genre">{clue.genre}</span>}
          </button>
        </span>
        <VuNeedle active={meter} />
        <button
          type="button"
          className={`cbtn${rowPlaying ? ' is-on' : ''}`}
          onClick={onPlay}
          disabled={busy}
          aria-label={`${rowPlaying ? 'Stop' : 'Play'} channel ${r + 1}`}
        >
          <span className="lamp" aria-hidden="true" />
          {rowPlaying ? 'Stop' : 'Play'}
        </button>
        <button
          type="button"
          className={[
            'cbtn',
            'cbtn--rec',
            armed && 'is-armed',
            tried && 'is-tried',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={onLock}
          disabled={busy}
          aria-label={
            tried
              ? `Channel ${r + 1}: this exact mix was already tried`
              : `Lock in channel ${r + 1}`
          }
        >
          <span className="lamp" aria-hidden="true" />
          {tried ? 'Tried' : 'Lock'}
        </button>
      </div>
      <div
        className={`lane-tiles${shakeKey ? ' is-shaking' : ''}`}
        key={shakeKey}
      >
        {pieces.map((piece, slot) => {
          const id = piece.id;
          const next = pieces[slot + 1]?.id;
          const heard = next != null && heardSeam(id, next);
          return (
            <Fragment key={id}>
              <PieceTile
                piece={piece}
                slot={slot}
                row={r}
                letter={letterOf(id)}
                mark={marks?.[slot] ?? null}
                playing={activeId === id}
                cued={cued === id}
                swapWith={cued && cued !== id && !busy ? cuedLetter : null}
                flash={flash.includes(id)}
                disabled={busy}
                heard={heardClip(id)}
                onTap={(f) => onTapClip(piece, f)}
                onSwap={() => onSwap(id)}
                getProgress={getProgress(id)}
              />
              {/* The join to the next clip sits between them in focus order
                  too. */}
              {next != null && (
                <button
                  type="button"
                  className={[
                    'seam',
                    seamPlaying === slot && 'is-playing',
                    heard && 'is-heard',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ '--k': slot + 1 } as CSSProperties}
                  onClick={() => onSeam(slot)}
                  disabled={busy}
                  aria-label={`Hear the join between clips ${letterOf(id)} and ${letterOf(next)}${heard ? ' (heard, free replay)' : ''}`}
                >
                  <span className="knob" aria-hidden="true" />
                </button>
              )}
            </Fragment>
          );
        })}
      </div>
    </li>
  );
}

export default memo(ChannelStrip);

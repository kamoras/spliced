// One open channel on the board: the channel tape, VU and PLAY key, and the
// row of clips with a seam between each pair. A seam has a knob (hear the join)
// and, once the join has been heard, a SPLICE key. A spliced join shows as a
// strip of tape holding the two clips together.

import { Fragment, memo } from 'react';
import type { CSSProperties } from 'react';
import PieceTile from '../PieceTile.jsx';
import VuNeedle from '../VuNeedle.jsx';
import type { Piece } from '../../types.js';

export type SeamState = 'open' | 'heard' | 'linked' | 'bad';

export interface ChannelStripProps {
  row: number;
  pieces: Piece[];
  splicing: boolean;
  last: boolean;
  shaking: boolean;
  meter: boolean;
  rowPlaying: boolean;
  seamPlaying: number | null;
  activeId: string | null;
  // The cued run (the clip you tapped and everything spliced to it).
  cuedIds: string[];
  cuedLetter: string | null;
  // Where the cued run can land.
  canSwap: (id: string) => boolean;
  flash: string[];
  busy: boolean;
  letterOf: (id: string) => string;
  heardClip: (id: string) => boolean;
  seamState: (a: string, b: string) => SeamState;
  getProgress: (id: string) => () => number | null;
  onTapClip: (piece: Piece, fraction: number | null) => void;
  onSwap: (id: string) => void;
  onSeam: (seam: number) => void;
  onSplice: (seam: number) => void;
  onPlay: () => void;
}

function ChannelStrip({
  row: r,
  pieces,
  splicing,
  last,
  shaking,
  meter,
  rowPlaying,
  seamPlaying,
  activeId,
  cuedIds,
  cuedLetter,
  canSwap,
  flash,
  busy,
  letterOf,
  heardClip,
  seamState,
  getProgress,
  onTapClip,
  onSwap,
  onSeam,
  onSplice,
  onPlay,
}: ChannelStripProps) {
  return (
    <li
      className={['strip', splicing && 'is-splicing', last && 'is-last']
        .filter(Boolean)
        .join(' ')}
      aria-label={`Channel ${r + 1}`}
    >
      <div className="strip-head">
        <span className="ch" aria-hidden="true">
          {r + 1}
        </span>
        <span className="tape-wrap" aria-hidden="true">
          {/* A blank scribble strip: the title is written on when the song
              is found. */}
          <span className="tape tape--blank">Untitled</span>
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
      </div>
      <div className={`lane-tiles${shaking ? ' is-shaking' : ''}`}>
        {pieces.map((piece, slot) => {
          const id = piece.id;
          const next = pieces[slot + 1]?.id;
          const seam = next != null ? seamState(id, next) : null;
          const inCue = cuedIds.includes(id);
          const fusedLeft =
            slot > 0 && seamState(pieces[slot - 1].id, id) === 'linked';
          return (
            <Fragment key={id}>
              <PieceTile
                piece={piece}
                slot={slot}
                row={r}
                letter={letterOf(id)}
                playing={activeId === id}
                cued={inCue}
                fusedLeft={fusedLeft}
                fusedRight={seam === 'linked'}
                swapWith={
                  cuedLetter && !inCue && !busy && canSwap(id)
                    ? cuedLetter
                    : null
                }
                flash={flash.includes(id)}
                disabled={busy}
                heard={heardClip(id)}
                onTap={(f) => onTapClip(piece, f)}
                onSwap={() => onSwap(id)}
                getProgress={getProgress(id)}
              />
              {/* The join to the next clip sits between them in focus order
                  too: hear it, then splice it. */}
              {next != null && seam != null && (
                <div
                  className={`seam-col is-${seam}`}
                  data-seam={`${r}-${slot}`}
                  style={{ '--k': slot + 1 } as CSSProperties}
                >
                  {seam === 'linked' ? (
                    <span
                      className="splice-mark"
                      role="img"
                      aria-label={`Clips ${letterOf(id)} and ${letterOf(next)} are spliced`}
                    />
                  ) : (
                    <>
                      <button
                        type="button"
                        className={[
                          'seam',
                          seamPlaying === slot && 'is-playing',
                          seam !== 'open' && 'is-heard',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => onSeam(slot)}
                        disabled={busy}
                        aria-label={`Hear the join between clips ${letterOf(id)} and ${letterOf(next)}${seam === 'bad' ? ' (not a join)' : seam === 'heard' ? ' (heard, free replay)' : ''}`}
                      >
                        <span className="knob" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className={`splice-key${seam === 'heard' ? ' is-ready' : ''}${seam === 'bad' ? ' is-bad' : ''}`}
                        onClick={() => onSplice(slot)}
                        disabled={busy || seam !== 'heard'}
                        aria-label={
                          seam === 'bad'
                            ? `Clips ${letterOf(id)} and ${letterOf(next)}: not a join`
                            : seam === 'heard'
                              ? `Splice clips ${letterOf(id)} and ${letterOf(next)}`
                              : `Splice clips ${letterOf(id)} and ${letterOf(next)}: hear the join first`
                        }
                        title={
                          seam === 'bad'
                            ? 'Not a join'
                            : seam === 'open'
                              ? 'Hear the join first'
                              : undefined
                        }
                      >
                        {seam === 'bad' ? '✗' : 'Splice'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </li>
  );
}

export default memo(ChannelStrip);

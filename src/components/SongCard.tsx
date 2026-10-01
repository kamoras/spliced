// A locked (or revealed) channel: the clips spliced back into one song. The
// title is written onto the channel's masking tape, the fader sits at full,
// and tapping the strip replays the whole passage.
//
// A freshly locked song first asks "Name that tune": pick it from four
// choices (while the rebuilt song plays) for a 🎵 bonus. One try, no penalty.

import type { CSSProperties } from 'react';
import Icon from './Icon.jsx';
import ListenLinks from './ListenLinks.jsx';
import VuNeedle from './VuNeedle.jsx';
import type { Song } from '../types.js';

export interface Choice {
  title: string;
  artist: string;
}

interface SongCardProps {
  ch: number;
  answer?: Song;
  hue: string;
  discovered: boolean;
  playing: boolean;
  meter?: boolean;
  onPlay: () => void;
  // Name-that-tune: `choices` while unanswered; `named` once answered.
  choices?: Choice[];
  named?: boolean;
  onName?: (choice: Choice | null) => void;
  order?: number;
  fresh?: boolean;
  // The row's Timeline label, printed on the tape ("1984").
  label?: string;
}

export default function SongCard({
  ch,
  answer,
  hue,
  discovered,
  playing,
  meter = false,
  onPlay,
  choices,
  named,
  onName,
  order = 0,
  fresh = false,
  label,
}: SongCardProps) {
  const quiz = Boolean(choices?.length && onName && named == null);
  const title = answer?.title ?? 'Mystery song';
  const artist = answer?.artist ?? '';
  const style = { '--hue': hue, '--i': order } as CSSProperties;

  return (
    <div
      className={[
        'song-card',
        playing && 'is-playing',
        fresh && 'is-fresh',
        quiz && 'is-quiz',
        !discovered && 'is-revealed',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      <div className="song-row">
        <span className="ch" aria-hidden="true">
          {ch}
        </span>
        <button
          type="button"
          className="song-play"
          onClick={onPlay}
          aria-label={
            quiz
              ? `${playing ? 'Stop' : 'Play'} the mystery song from ${label ?? `channel ${ch}`}`
              : `${playing ? 'Stop' : 'Play'} ${title}${artist ? ` by ${artist}` : ''}`
          }
        >
          <span className="song-art">
            {!quiz && answer?.artwork ? (
              <img src={answer.artwork} alt="" />
            ) : null}
            <span className="song-art-icon">
              <Icon name={playing ? 'stop' : 'play'} />
            </span>
          </span>
          <span className="tape-wrap song-tape-wrap">
            <span className="tape song-tape">
              {label && <span className="tape-year">{label} ·</span>}
              <span className="song-title">
                {quiz ? 'Name that tune' : title}
              </span>
            </span>
            {!quiz && artist && <span className="song-artist">{artist}</span>}
          </span>
        </button>
        <VuNeedle active={meter} />
        {!quiz && (
          <span
            className={`song-tag ${discovered ? 'is-win' : 'is-miss'}`}
            title={
              named ? 'Named it!' : named === false ? 'Not named' : undefined
            }
          >
            {named && (
              <>
                <span aria-hidden="true">🎵</span>
                <span className="visually-hidden">Named, </span>
              </>
            )}
            <Icon name={discovered ? 'check' : 'eye'} />
            <span className="song-tag-text">
              {discovered ? 'Spliced' : 'Answer'}
            </span>
          </span>
        )}
      </div>

      {quiz ? (
        <div className="quiz" role="group" aria-label="Name that tune">
          {choices!.map((c) => (
            <button
              type="button"
              key={`${c.title}|${c.artist}`}
              className="quiz-choice"
              onClick={() => onName!(c)}
            >
              <span className="quiz-title">{c.title}</span>
              <span className="quiz-artist">{c.artist}</span>
            </button>
          ))}
          <button
            type="button"
            className="quiz-skip"
            onClick={() => onName!(null)}
          >
            Skip
          </button>
        </div>
      ) : (
        answer?.title && (
          <ListenLinks title={answer.title} artist={answer.artist} compact />
        )
      )}
    </div>
  );
}

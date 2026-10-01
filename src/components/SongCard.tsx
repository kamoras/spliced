// A locked (or revealed) track: its clips spliced into one song, styled like a
// cassette J-card. Tapping the card plays the whole passage.
//
// A freshly locked song first asks "Name that tune": pick it from four
// choices (while the rebuilt song plays) for a 🎵 bonus. One try, no penalty.

import type { CSSProperties } from 'react';
import Icon from './Icon.jsx';
import ListenLinks from './ListenLinks.jsx';
import type { Song } from '../types.js';

export interface Choice {
  title: string;
  artist: string;
}

interface SongCardProps {
  answer?: Song;
  hue: string;
  discovered: boolean;
  playing: boolean;
  onPlay: () => void;
  // Name-that-tune: `choices` while unanswered; `named` once answered.
  choices?: Choice[];
  named?: boolean;
  onName?: (choice: Choice | null) => void;
  order?: number;
  fresh?: boolean;
}

export default function SongCard({
  answer,
  hue,
  discovered,
  playing,
  onPlay,
  choices,
  named,
  onName,
  order = 0,
  fresh = false,
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
        <button
          type="button"
          className="song-play"
          onClick={onPlay}
          aria-label={
            quiz
              ? `${playing ? 'Stop' : 'Play'} the mystery song`
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
          <span className="song-meta">
            {quiz ? (
              <>
                <span className="song-title">Name that tune!</span>
                <span className="song-artist">Pick it for a bonus 🎵</span>
              </>
            ) : (
              <>
                <span className="song-title">{title}</span>
                <span className="song-artist">{artist}</span>
              </>
            )}
          </span>
        </button>
        {!quiz && (
          <span
            className={`song-tag ${discovered ? 'is-win' : 'is-miss'}`}
            title={
              named ? 'Named it!' : named === false ? 'Not named' : undefined
            }
          >
            {named && <span aria-label="Named">🎵</span>}
            <Icon name={discovered ? 'check' : 'eye'} />
            {discovered ? 'Spliced' : 'Answer'}
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
        <ListenLinks title={answer?.title} artist={answer?.artist} compact />
      )}
    </div>
  );
}

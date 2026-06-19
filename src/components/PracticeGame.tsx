// Free play: build a one-off puzzle from a random song. Picking a song
// naturally spoils it, so this is kept separate from the daily mystery.

import { useCallback, useEffect, useRef, useState } from 'react';
import Puzzle from './Puzzle.jsx';
import { loadAndSliceTracks } from '../audio/slicer.js';
import { MAX_GUESSES } from '../config.js';
import { shuffle } from '../../api/_prng.js';
import {
  DAILY_CLIPS_PER_TRACK,
  DAILY_TRACKS,
  SONGS,
} from '../../api/_songs.js';
import type { Song, Track } from '../types.js';

type Phase = 'loading' | 'play' | 'error';

function randomCatalogSongs() {
  return shuffle(SONGS).slice(0, DAILY_TRACKS);
}

export default function PracticeGame({ onDaily }: { onDaily: () => void }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState<{ tracks: Track[] } | null>(null);
  const requestRef = useRef(0);

  const startRandomPuzzle = useCallback(async () => {
    const requestId = ++requestRef.current;
    const catalogSongs = randomCatalogSongs();
    setError(null);
    setGame(null);
    setPhase('loading');
    try {
      const resolved = await Promise.all(
        catalogSongs.map(async (catalogSong, idx) => {
          const search = await fetch(
            `/api/search?term=${encodeURIComponent(`${catalogSong.title} ${catalogSong.artist}`)}`
          );
          if (!search.ok) throw new Error('Could not find a practice song.');
          const data = (await search.json()) as { results?: Song[] };
          const song = data.results?.[0];
          if (!song?.previewUrl)
            throw new Error('Could not find a playable preview.');
          return {
            id: `track-${idx}`,
            previewUrl: song.previewUrl,
            answer: song,
          };
        })
      );

      const tracks = await loadAndSliceTracks(resolved, DAILY_CLIPS_PER_TRACK, {
        seed: Date.now(),
      });
      if (requestId !== requestRef.current) return;
      setGame({ tracks });
      setPhase('play');
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong loading that clip.'
      );
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    startRandomPuzzle();
  }, [startRandomPuzzle]);

  return (
    <div>
      <div className="bar">
        <span className="bar-title">Practice mode</span>
        <div className="bar-actions">
          <button className="link" onClick={onDaily}>
            ← Daily puzzle
          </button>
          <button
            className="link"
            onClick={() => startRandomPuzzle()}
            disabled={phase === 'loading'}
          >
            Different mix
          </button>
        </div>
      </div>

      {phase === 'play' && game ? (
        <Puzzle
          tracks={game.tracks}
          clipsPerTrack={DAILY_CLIPS_PER_TRACK}
          maxGuesses={MAX_GUESSES}
          onNewPuzzle={() => startRandomPuzzle()}
          newPuzzleLabel="Different mix"
        />
      ) : (
        <section className="panel center">
          {phase === 'loading' && (
            <p className="muted">Picking a practice song…</p>
          )}
          {phase === 'error' && (
            <>
              <p className="error">{error}</p>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => startRandomPuzzle()}
              >
                Try another song
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}

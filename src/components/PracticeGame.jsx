// Free play: build a one-off puzzle from a random song. Picking a song
// naturally spoils it, so this is kept separate from the daily mystery.

import { useCallback, useEffect, useRef, useState } from 'react';
import Puzzle from './Puzzle.jsx';
import { loadAndSlice } from '../audio/slicer.js';
import { MAX_GUESSES } from '../config.js';
import { DAILY_PIECES, SONGS } from '../../api/_songs.js';

function randomCatalogSong() {
  return SONGS[Math.floor(Math.random() * SONGS.length)];
}

export default function PracticeGame({ onDaily }) {
  const [phase, setPhase] = useState('loading'); // loading | play | error
  const [error, setError] = useState(null);
  const [game, setGame] = useState(null);
  const requestRef = useRef(0);

  const startRandomPuzzle = useCallback(async () => {
    const requestId = ++requestRef.current;
    const catalogSong = randomCatalogSong();
    setError(null);
    setGame(null);
    setPhase('loading');
    try {
      const search = await fetch(
        `/api/search?term=${encodeURIComponent(`${catalogSong.title} ${catalogSong.artist}`)}`
      );
      if (!search.ok) throw new Error('Could not find a practice song.');
      const data = await search.json();
      const song = data.results?.[0];
      if (!song) throw new Error('Could not find a playable preview.');

      const { buffer, pieces } = await loadAndSlice(
        song.previewUrl,
        DAILY_PIECES
      );
      if (requestId !== requestRef.current) return;
      setGame({ song, buffer, pieces });
      setPhase('play');
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setError(err.message || 'Something went wrong loading that clip.');
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
            Different song
          </button>
        </div>
      </div>

      {phase === 'play' && game ? (
        <Puzzle
          song={game.song}
          buffer={game.buffer}
          pieces={game.pieces}
          maxGuesses={MAX_GUESSES}
          onNewPuzzle={() => startRandomPuzzle()}
          newPuzzleLabel="Different song"
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

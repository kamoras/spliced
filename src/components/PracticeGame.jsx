// Free play: search any song and build a one-off puzzle. Picking a song
// naturally spoils it, so this is kept separate from the daily mystery.

import { useState } from 'react';
import SongSearch from './SongSearch.jsx';
import Puzzle from './Puzzle.jsx';
import { loadAndSlice, unlockAudio } from '../audio/slicer.js';
import { MAX_GUESSES } from '../config.js';

const DIFFICULTIES = [
  { label: 'Easy', pieces: 5 },
  { label: 'Medium', pieces: 7 },
  { label: 'Hard', pieces: 9 },
];

export default function PracticeGame({ onDaily }) {
  const [difficulty, setDifficulty] = useState(DIFFICULTIES[1]);
  const [phase, setPhase] = useState('pick'); // pick | loading | play
  const [error, setError] = useState(null);
  const [game, setGame] = useState(null);

  async function startPuzzle(song) {
    setError(null);
    setPhase('loading');
    try {
      await unlockAudio();
      const { buffer, pieces } = await loadAndSlice(
        song.previewUrl,
        difficulty.pieces
      );
      setGame({ song, buffer, pieces });
      setPhase('play');
    } catch (err) {
      setError(err.message || 'Something went wrong loading that clip.');
      setPhase('pick');
    }
  }

  function newPuzzle() {
    setGame(null);
    setPhase('pick');
    setError(null);
  }

  if (phase === 'play' && game) {
    return (
      <Puzzle
        song={game.song}
        buffer={game.buffer}
        pieces={game.pieces}
        maxGuesses={MAX_GUESSES}
        onNewPuzzle={newPuzzle}
        newPuzzleLabel="Pick another song"
      />
    );
  }

  return (
    <section className="panel">
      <div className="bar">
        <span className="bar-title">Practice mode</span>
        <button className="link" onClick={onDaily}>
          ← Back to daily
        </button>
      </div>

      <div className="difficulty" role="group" aria-label="Difficulty">
        <span className="difficulty-label">Difficulty</span>
        {DIFFICULTIES.map((d) => (
          <button
            key={d.label}
            type="button"
            className="chip"
            aria-pressed={difficulty.label === d.label}
            onClick={() => setDifficulty(d)}
            disabled={phase === 'loading'}
          >
            {d.label}
            <span className="chip-sub">{d.pieces - 1} movable</span>
          </button>
        ))}
      </div>

      <SongSearch onPick={startPuzzle} disabled={phase === 'loading'} />

      {phase === 'loading' && (
        <p className="muted center">Slicing up the clip…</p>
      )}
      {error && <p className="error center">{error}</p>}
    </section>
  );
}

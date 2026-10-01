// Free play: build a one-off puzzle from a random song. Picking a song
// naturally spoils it, so this is kept separate from the daily mystery.

import { useCallback, useEffect, useRef, useState } from 'react';
import Puzzle from './Puzzle.jsx';
import { loadAndSliceTracks } from '../audio/slicer.js';
import { MAX_GUESSES } from '../config.js';
import { DAILY_CLIPS_PER_TRACK, DAILY_TRACKS } from '../../api/_songs.js';
import type { Track, TrackDef } from '../types.js';

type Phase = 'loading' | 'play' | 'error';

export default function PracticeGame({ onDaily }: { onDaily: () => void }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState<{ tracks: Track[] } | null>(null);
  const requestRef = useRef(0);

  const startRandomPuzzle = useCallback(async () => {
    const requestId = ++requestRef.current;
    setError(null);
    setGame(null);
    setPhase('loading');
    try {
      const r = await fetch(`/api/practice?count=${DAILY_TRACKS}`);
      if (!r.ok) throw new Error('Could not pick practice songs.');
      const { tracks: resolved } = (await r.json()) as { tracks: TrackDef[] };

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

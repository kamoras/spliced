// Free play: random songs from past dailies (no spoilers), at three sizes.
// No stats, no streak — just more mixes.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Puzzle, { puzzleDef, requestBoardFocus } from './Puzzle.jsx';
import Results from './Results.jsx';
import Loading from './Loading.jsx';
import { loadAndSliceTracks } from '../audio/slicer.js';
import { MAX_GUESSES } from '../config.js';
import { addToCrate } from '../daily/storage.js';
import type { GameState } from '../game/engine.js';
import type { Song, Track, TrackDef } from '../types.js';

export const LEVELS = [
  { id: 'easy', label: 'Easy', songs: 3, clips: 3 },
  { id: 'classic', label: 'Classic', songs: 3, clips: 4 },
  { id: 'hard', label: 'Hard', songs: 4, clips: 4 },
] as const;
type Level = (typeof LEVELS)[number];

type Phase = 'loading' | 'play' | 'error';

export default function PracticeGame({
  onDaily,
  sfx,
  volume,
  paused,
}: {
  onDaily: () => void;
  sfx: boolean;
  volume: number;
  paused: boolean;
}) {
  const [level, setLevel] = useState<Level>(LEVELS[1]);
  const [phase, setPhase] = useState<Phase>('loading');
  const [loaded, setLoaded] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState<{
    tracks: Track[];
    level: Level;
    n: number;
  } | null>(null);
  const [live, setLive] = useState<GameState | null>(null);
  const [answers, setAnswers] = useState<Record<string, Song>>({});

  // Finished mixes add their spliced songs to the crate as titles arrive
  // (answers are only revealed at the end). Idempotent.
  const finished = live != null && live.status !== 'playing';
  const namedKey = JSON.stringify(live?.named ?? {});
  useEffect(() => {
    if (!finished || !game || !live) return;
    const known = game.tracks.filter(
      (t) => live.solved.includes(t.id) && answers[t.id]
    );
    if (!known.length) return;
    addToCrate(
      known.map((t) => ({
        title: answers[t.id].title,
        artist: answers[t.id].artist,
        artwork: answers[t.id].artwork,
        previewUrl: t.previewUrl,
        solved: true,
        named: Boolean(live.named?.[t.id]),
        practice: true,
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, namedKey, game, answers]);
  const requestRef = useRef(0);

  const start = useCallback(async (lvl: Level, focusBoard = false) => {
    const requestId = ++requestRef.current;
    setError(null);
    setLive(null);
    setAnswers({});
    setLoaded(0);
    setPhase('loading');
    try {
      const r = await fetch(`/api/practice?count=${lvl.songs}`);
      if (!r.ok) throw new Error('Could not pick practice songs.');
      const { tracks: defs } = (await r.json()) as { tracks: TrackDef[] };
      const tracks = await loadAndSliceTracks(defs, lvl.clips, {
        seed: Date.now() % 1e9,
        onProgress: (n) => requestId === requestRef.current && setLoaded(n),
      });
      if (requestId !== requestRef.current) return;
      if (focusBoard) requestBoardFocus();
      setGame({ tracks, level: lvl, n: requestId });
      setPhase('play');
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    start(LEVELS[1]);
  }, [start]);

  const def = useMemo(
    () => (game ? puzzleDef(game.tracks, game.level.clips, MAX_GUESSES) : null),
    [game]
  );

  function pick(lvl: Level) {
    setLevel(lvl);
    start(lvl);
  }

  return (
    <div className="game">
      <div className="levels" role="group" aria-label="Difficulty">
        {LEVELS.map((l) => (
          <button
            key={l.id}
            type="button"
            aria-pressed={level.id === l.id}
            className={`level${level.id === l.id ? ' is-on' : ''}`}
            // aria-disabled (not disabled) so the pressed button keeps focus.
            onClick={() => phase !== 'loading' && pick(l)}
            aria-disabled={phase === 'loading'}
          >
            <strong>{l.label}</strong>
            <span>
              {l.songs} songs × {l.clips}
            </span>
          </button>
        ))}
      </div>

      {phase === 'loading' && (
        <Loading
          loaded={loaded}
          total={level.songs}
          rows={level.songs}
          cols={level.clips}
        />
      )}
      {phase === 'error' && (
        <section className="panel center">
          <p className="error">The tape snapped. {error}</p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => start(level)}
          >
            Try again
          </button>
        </section>
      )}
      {phase === 'play' && game && def && (
        <>
          {live && live.status !== 'playing' && (
            <Results
              state={live}
              def={def}
              title={`Spliced Practice (${game.level.label})`}
              onNewMix={() => start(level, true)}
            />
          )}
          <Puzzle
            key={game.n}
            tracks={game.tracks}
            clipsPerTrack={game.level.clips}
            maxGuesses={MAX_GUESSES}
            label={`Practice · ${game.level.label}`}
            sfx={sfx}
            volume={volume}
            paused={paused}
            onChange={setLive}
            onAnswers={setAnswers}
            onFinish={(s) => {
              // Bring keyboard and screen-reader users to the results.
              setTimeout(
                () =>
                  document.querySelector<HTMLElement>('.results-head')?.focus(),
                s.status === 'won' ? 1400 : 900
              );
            }}
          />
        </>
      )}

      <p className="center">
        <button type="button" className="link" onClick={onDaily}>
          ← Back to today’s daily
        </button>
      </p>
    </div>
  );
}

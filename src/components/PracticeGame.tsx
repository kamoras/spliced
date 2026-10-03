// Free play: random songs from past dailies (no spoilers), at three sizes.
// No stats, no streak, just more mixes. Easy and Hard get an extra lamp:
// fewer clips makes ordering easier, but a 4x4 board is a lot of sorting.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Puzzle from './Puzzle.jsx';
import type { BoardEvent } from './Puzzle.jsx';
import Results from './Results.jsx';
import Loading from './Loading.jsx';
import { loadAndSliceTracks } from '../audio/slicer.js';
import { puzzleDef } from '../game/def.js';
import { parseTracks } from '../game/parse.js';
import type { GameState } from '../game/engine.js';
import { useCrateSync } from '../hooks/useCrateSync.js';
import { DAILY_GUESSES } from '../../shared/game.js';
import type { Song, Track } from '../types.js';

export const LEVELS = [
  // Easy also shows every genre up front.
  { id: 'easy', label: 'Easy', songs: 3, clips: 3, lamps: 5, genre: true },
  { id: 'classic', label: 'Classic', songs: 3, clips: 4, lamps: DAILY_GUESSES },
  // Twelve joins to find: lamps scale with the daily's five for nine.
  { id: 'hard', label: 'Hard', songs: 4, clips: 4, lamps: 6 },
] as const;
type Level = (typeof LEVELS)[number];

type Phase = 'loading' | 'play' | 'error';

export default function PracticeGame({
  onDaily,
  sfx,
  volume,
  paused,
  focusOnMount = false,
  onBoardEvent,
}: {
  onDaily: () => void;
  sfx: boolean;
  volume: number;
  paused: boolean;
  focusOnMount?: boolean;
  onBoardEvent?: (event: BoardEvent) => void;
}) {
  const [level, setLevel] = useState<Level>(LEVELS[1]);
  const [phase, setPhase] = useState<Phase>('loading');
  const [loaded, setLoaded] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState<{
    tracks: Track[];
    level: Level;
    n: number;
    focus: boolean;
  } | null>(null);
  const [live, setLive] = useState<GameState | null>(null);
  const [settled, setSettled] = useState(false);
  const [encore, setEncore] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Song>>({});
  const requestRef = useRef(0);

  useCrateSync({
    tracks: game?.tracks ?? null,
    state: live,
    answers,
    practice: true,
  });

  const start = useCallback(async (lvl: Level, focusBoard = false) => {
    const requestId = ++requestRef.current;
    setError(null);
    setLive(null);
    setSettled(false);
    setAnswers({});
    setLoaded(0);
    setPhase('loading');
    try {
      const r = await fetch(
        `/api/practice?count=${lvl.songs}&clips=${lvl.clips}`
      );
      if (!r.ok) throw new Error('Could not pick practice songs.');
      const body = (await r.json()) as { tracks?: unknown; seed?: unknown };
      const defs = parseTracks(body.tracks);
      if (!defs)
        throw new Error('The practice API responded in an unexpected format.');
      const seed = typeof body.seed === 'number' ? body.seed : Date.now() % 1e9;
      const tracks = await loadAndSliceTracks(
        'genre' in lvl && lvl.genre
          ? defs.map((t) => ({ ...t, clue: { ...t.clue, showGenre: true } }))
          : defs,
        lvl.clips,
        {
          seed,
          onProgress: (n) => requestId === requestRef.current && setLoaded(n),
        }
      );
      if (requestId !== requestRef.current) return;
      setGame({ tracks, level: lvl, n: requestId, focus: focusBoard });
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
    () =>
      game ? puzzleDef(game.tracks, game.level.clips, game.level.lamps) : null,
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
              {l.songs} songs × {l.clips} · {l.lamps} lamps
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
          {live && live.status !== 'playing' && settled && (
            <Results
              state={live}
              def={def}
              title={`Spliced Practice (${game.level.label})`}
              onNewMix={() => start(level, true)}
              onEncore={() => setEncore((n) => n + 1)}
            />
          )}
          <Puzzle
            key={game.n}
            tracks={game.tracks}
            clipsPerTrack={game.level.clips}
            maxGuesses={game.level.lamps}
            label={`Practice · ${game.level.label}`}
            sfx={sfx}
            volume={volume}
            paused={paused}
            focusOnMount={focusOnMount || game.focus}
            encore={encore}
            onBoardEvent={onBoardEvent}
            onChange={setLive}
            onAnswers={setAnswers}
            onSettled={() => {
              setSettled(true);
              // Bring keyboard and screen-reader users to the results.
              setTimeout(
                () =>
                  document.querySelector<HTMLElement>('.results-head')?.focus(),
                50
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

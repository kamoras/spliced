// A dated puzzle: today's by default, or one from the archive. Loads and
// slices the day's songs, restores any game in progress, races a friend's
// ghost if you arrived via their link, and records the result, stats and
// crate when you finish.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Puzzle from './Puzzle.jsx';
import type { BoardEvent } from './Puzzle.jsx';
import Results from './Results.jsx';
import Loading from './Loading.jsx';
import {
  DAILY_CLIPS_PER_TRACK,
  DAILY_GUESSES,
  DAILY_TRACKS,
  HARD_GUESSES,
  puzzleDate,
} from '../../shared/game.js';
import { loadAndSliceTracks } from '../audio/slicer.js';
import {
  getProgress,
  getResult,
  getGhost,
  saveGhost,
  saveProgress,
  saveResult,
} from '../daily/storage.js';
import { prefersReducedMotion } from '../audio/meter.js';
import { puzzleDef } from '../game/def.js';
import { parseDaily } from '../game/parse.js';
import {
  revealAll,
  decodeGhost,
  finishedFromResult,
  isValidState,
} from '../game/engine.js';
import type { GameState, Ghost } from '../game/engine.js';
import { useCrateSync } from '../hooks/useCrateSync.js';
import type { DailyResponse, Song, Track } from '../types.js';
import { track as trackEvent } from '../analytics.js';

type Status = 'loading' | 'ready' | 'error';

interface GhostParam {
  ghost: Ghost;
  name: string;
  code: string;
  saved?: boolean;
}

// Read (once per page load, even under React's dev double render) a ghost
// from ?g=…&n=… and clean the URL. Without one, fall back to the ghost saved
// from an earlier visit (a reload mid-race).
let ghostParamCache: GhostParam | null | undefined;
function readGhostParam(): GhostParam | null {
  if (ghostParamCache === undefined) ghostParamCache = parseGhostParam();
  return ghostParamCache;
}

function parseGhostParam(): GhostParam | null {
  if (typeof location === 'undefined') return null;
  const params = new URLSearchParams(location.search);
  if (!params.has('g')) {
    const saved = getGhost();
    const ghost = decodeGhost(saved?.code);
    return saved && ghost
      ? { ghost, name: saved.name, code: saved.code, saved: true }
      : null;
  }
  const code = params.get('g');
  const ghost = decodeGhost(code);
  history.replaceState(null, '', location.pathname + location.hash);
  if (!ghost || !code) return null;
  const name =
    (params.get('n') || 'A friend')
      .replace(/[^\p{L}\p{N} '._-]/gu, '')
      .slice(0, 16) || 'A friend';
  return { ghost, name, code };
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function DailyGame({
  date,
  onPractice,
  onArchive,
  sfx,
  volume,
  paused,
  hard,
  focusOnMount = false,
  onBoardEvent,
}: {
  // A past day (YYYY-MM-DD) from the archive; today when omitted.
  date?: string | null;
  onPractice: () => void;
  onArchive: (date: string | null) => void;
  sfx: boolean;
  volume: number;
  paused: boolean;
  // Hard mode for a game that starts now (a game in progress keeps its own).
  hard: boolean;
  focusOnMount?: boolean;
  onBoardEvent?: (event: BoardEvent) => void;
}) {
  const [status, setStatus] = useState<Status>('loading');
  const [loaded, setLoaded] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [daily, setDaily] = useState<DailyResponse | null>(null);
  // The mistake cap this game started with (hard mode halves the API's). A
  // replay uses the normal cap.
  const [cap, setCap] = useState(DAILY_GUESSES);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [initial, setInitial] = useState<GameState | null>(null);
  const [live, setLive] = useState<GameState | null>(null);
  const [settled, setSettled] = useState(false);
  const [answers, setAnswers] = useState<Record<string, Song>>({});
  const [replay, setReplay] = useState(0);
  const [encore, setEncore] = useState(0);
  const [ghostParam] = useState(readGhostParam);
  const [ghost, setGhost] = useState<{ ghost: Ghost; name: string } | null>(
    null
  );
  const [staleGhost, setStaleGhost] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const isToday = !date || date === todayStr();

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    setLoaded(0);
    setSettled(false);
    setGhost(null);
    setStaleGhost(null);
    try {
      // Ask for the UTC date explicitly: each day is its own cache entry.
      let r = await fetch(`/api/daily?date=${date || todayStr()}`);
      // A device clock running ahead of the server at midnight: fall back to
      // the server's own "today".
      if (r.status === 404 && !date) r = await fetch('/api/daily');
      if (!r.ok) throw new Error('Could not load the puzzle.');
      const d = parseDaily(await r.json());
      if (!d) {
        throw new Error(
          'The puzzle API responded in an unexpected format. Redeploy the app and API together.'
        );
      }
      const sliced = await loadAndSliceTracks(d.tracks, d.clipsPerTrack, {
        seed: d.puzzleNumber,
        onProgress: setLoaded,
      });
      const saved = getProgress(d.puzzleNumber);
      const result = getResult(d.puzzleNumber);
      // A game already under way keeps the cap it started with (a saved
      // normal game has no `hard` flag at all, so don't fall through to the
      // current preference).
      const hardGame = saved
        ? Boolean(saved.hard)
        : result
          ? Boolean(result.hard)
          : hard;
      const cap = hardGame ? HARD_GUESSES : d.maxGuesses;
      const def = puzzleDef(sliced, d.clipsPerTrack, cap);
      let start: GameState | null = null;
      if (saved && isValidState(saved, def)) {
        // A finished result is final, even if another tab kept playing.
        start =
          result && saved.status === 'playing'
            ? revealAll(saved, def, result.solved ? 'won' : 'lost')
            : saved;
      } else if (result) {
        start = {
          ...finishedFromResult(def, result),
          ...(result.hard ? { hard: true } : {}),
        };
      }

      if (ghostParam && isToday) {
        if (ghostParam.ghost.puzzle !== d.puzzleNumber) {
          // A saved ghost from another day is just stale: ignore it quietly.
          if (!ghostParam.saved)
            setStaleGhost(
              `${ghostParam.name}’s link was for Spliced #${ghostParam.ghost.puzzle}. Here’s today’s mix instead.`
            );
        } else if (!start || start.status === 'playing') {
          // Only today's ghost is kept, so a stale link can't replace it.
          saveGhost({ code: ghostParam.code, name: ghostParam.name });
          setGhost(ghostParam);
        } else {
          if (!ghostParam.saved) {
            setStaleGhost(
              `You’ve already played today. Compare with ${ghostParam.name} below.`
            );
          }
          setGhost(ghostParam);
        }
      }

      setDaily(d);
      setCap(cap);
      setTracks(sliced);
      setInitial(start);
      setLive(start);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setStatus('error');
    }
    // `hard` only matters for a game that starts now; don't reload on toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghostParam, date, isToday]);

  useEffect(() => {
    load();
  }, [load]);

  const def = useMemo(
    () =>
      daily && tracks ? puzzleDef(tracks, daily.clipsPerTrack, cap) : null,
    [daily, tracks, cap]
  );

  useCrateSync({
    tracks,
    state: live,
    answers,
    puzzle: daily?.puzzleNumber,
    enabled: !replay,
  });

  if (status === 'loading') {
    return (
      <Loading
        loaded={loaded}
        total={DAILY_TRACKS}
        rows={DAILY_TRACKS}
        cols={DAILY_CLIPS_PER_TRACK}
      />
    );
  }

  if (status === 'error') {
    return (
      <section className="panel center">
        <p className="error">The tape snapped. {error}</p>
        <button className="btn btn--primary" onClick={load}>
          Try again
        </button>
        {date && (
          <button className="btn" onClick={() => onArchive(null)}>
            Back to today
          </button>
        )}
      </section>
    );
  }

  if (!daily || !tracks || !def) return null;

  const hardGame = !replay && cap === HARD_GUESSES;
  const num = daily.puzzleNumber;
  const label = replay ? `#${num} · Replay` : `Spliced #${num}`;
  const title = `Spliced #${num}${hardGame ? ' ✦' : ''}${replay ? ' (replay)' : ''}`;
  const showResults = live && live.status !== 'playing' && settled;

  return (
    <div className="game">
      {!isToday && (
        <p className="notice">
          From the archive: Spliced #{num},{' '}
          {puzzleDate(num).toLocaleDateString(undefined, {
            dateStyle: 'medium',
            timeZone: 'UTC',
          })}
          .{' '}
          <button
            type="button"
            className="link"
            onClick={() => onArchive(null)}
          >
            Back to today
          </button>
        </p>
      )}
      {staleGhost && <p className="notice">{staleGhost}</p>}
      {replay > 0 && (
        <p className="notice">
          Replaying for fun. Your official result is saved.
        </p>
      )}
      <div ref={resultsRef}>
        {showResults && (
          <Results
            state={live}
            def={def}
            puzzleNumber={replay ? undefined : num}
            archive={!isToday}
            title={title}
            ghost={replay ? null : ghost}
            onPractice={onPractice}
            onArchive={onArchive}
            onEncore={() => setEncore((n) => n + 1)}
            onReplay={() => {
              setReplay((n) => n + 1);
              setSettled(false);
              setLive(null);
            }}
          />
        )}
      </div>
      <Puzzle
        key={replay ? `replay-${replay}` : `daily-${num}`}
        tracks={tracks}
        clipsPerTrack={daily.clipsPerTrack}
        maxGuesses={replay ? daily.maxGuesses : cap}
        seed={num}
        label={label}
        initialState={replay ? null : initial}
        sfx={sfx}
        volume={volume}
        paused={paused}
        hard={hardGame}
        focusOnMount={focusOnMount || replay > 0}
        encore={encore}
        onBoardEvent={onBoardEvent}
        ghost={
          replay
            ? null
            : ghost && live?.status !== 'won' && live?.status !== 'lost'
              ? ghost
              : null
        }
        onAnswers={replay ? undefined : setAnswers}
        onChange={(s) => {
          setLive(s);
          if (!replay) saveProgress(num, s);
        }}
        onFinish={(s) => {
          if (replay) return;
          saveResult(num, {
            solved: s.status === 'won',
            mistakes: s.mistakes,
            solvedTracks: s.solved.length,
            elapsedMs: s.elapsedMs,
            ...(s.hard ? { hard: true } : {}),
            ...(isToday ? {} : { late: true }),
          });
          trackEvent('daily-finish', {
            outcome: s.status,
            mistakes: s.mistakes,
            hard: Boolean(s.hard),
            archive: !isToday,
            ghost: Boolean(ghost),
          });
        }}
        onSettled={() => {
          setSettled(true);
          // Bring the results into view once they mount.
          setTimeout(() => {
            resultsRef.current?.scrollIntoView({
              behavior: prefersReducedMotion() ? 'auto' : 'smooth',
              block: 'start',
            });
            resultsRef.current
              ?.querySelector<HTMLElement>('.results-head')
              ?.focus({ preventScroll: true });
          }, 50);
        }}
      />
    </div>
  );
}

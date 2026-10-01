// Today's shared puzzle: load + slice the day's songs, restore any game in
// progress, race a friend's ghost if you arrived via their link, and record
// the result, stats, and crate when you finish.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Puzzle, { puzzleDef } from './Puzzle.jsx';
import Results from './Results.jsx';
import Loading from './Loading.jsx';
import { DAILY_CLIPS_PER_TRACK, DAILY_TRACKS } from '../../api/_songs.js';
import { loadAndSliceTracks } from '../audio/slicer.js';
import {
  addToCrate,
  getProgress,
  getResult,
  saveProgress,
  saveResult,
} from '../daily/storage.js';
import {
  decodeGhost,
  finishedFromResult,
  isValidState,
} from '../game/engine.js';
import type { GameState, Ghost } from '../game/engine.js';
import type { DailyResponse, Track } from '../types.js';
import { track as trackEvent } from '../analytics.js';

type Status = 'loading' | 'ready' | 'error';

// Read (once) a ghost from ?g=…&n=… and clean the URL.
function readGhostParam(): { ghost: Ghost; name: string } | null {
  if (typeof location === 'undefined') return null;
  const params = new URLSearchParams(location.search);
  const ghost = decodeGhost(params.get('g'));
  if (params.has('g')) {
    history.replaceState(null, '', location.pathname + location.hash);
  }
  if (!ghost) return null;
  const name =
    (params.get('n') || 'A friend')
      .replace(/[^\p{L}\p{N} '._-]/gu, '')
      .slice(0, 16) || 'A friend';
  return { ghost, name };
}

export default function DailyGame({
  onPractice,
  sfx,
  volume,
  paused,
}: {
  onPractice: () => void;
  sfx: boolean;
  volume: number;
  paused: boolean;
}) {
  const [status, setStatus] = useState<Status>('loading');
  const [loaded, setLoaded] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [daily, setDaily] = useState<DailyResponse | null>(null);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [initial, setInitial] = useState<GameState | null>(null);
  const [live, setLive] = useState<GameState | null>(null);
  const [replay, setReplay] = useState(0);
  const [ghostParam] = useState(readGhostParam);
  const [ghost, setGhost] = useState<{ ghost: Ghost; name: string } | null>(
    null
  );
  const [staleGhost, setStaleGhost] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    setLoaded(0);
    try {
      const r = await fetch('/api/daily');
      if (!r.ok) throw new Error('Could not load today’s puzzle.');
      const d = (await r.json()) as DailyResponse;
      if (!Array.isArray(d.tracks)) {
        throw new Error(
          'The puzzle API responded in an old format. Redeploy the app and API together.'
        );
      }
      const sliced = await loadAndSliceTracks(d.tracks, d.clipsPerTrack, {
        seed: d.puzzleNumber,
        onProgress: setLoaded,
      });
      const def = puzzleDef(sliced, d.clipsPerTrack, d.maxGuesses);
      const saved = getProgress(d.puzzleNumber);
      const result = getResult(d.puzzleNumber);
      let start: GameState | null = null;
      if (saved && isValidState(saved, def)) start = saved;
      else if (result) start = finishedFromResult(def, result);

      if (ghostParam) {
        if (ghostParam.ghost.puzzle !== d.puzzleNumber) {
          setStaleGhost(
            `${ghostParam.name}’s link was for Spliced #${ghostParam.ghost.puzzle}. Here’s today’s mix instead.`
          );
        } else if (!start || start.status === 'playing') {
          setGhost(ghostParam);
        } else {
          setStaleGhost(
            `You’ve already played today. Compare with ${ghostParam.name} below.`
          );
          setGhost(ghostParam);
        }
      }

      setDaily(d);
      setTracks(sliced);
      setInitial(start);
      setLive(start);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setStatus('error');
    }
  }, [ghostParam]);

  useEffect(() => {
    load();
  }, [load]);

  const def = useMemo(
    () =>
      daily && tracks
        ? puzzleDef(tracks, daily.clipsPerTrack, daily.maxGuesses)
        : null,
    [daily, tracks]
  );

  // Every finished (or newly named) game updates the crate. Idempotent.
  const finished = live && live.status !== 'playing' && !replay;
  const namedKey = JSON.stringify(live?.named ?? {});
  useEffect(() => {
    if (!finished || !tracks || !daily || !live) return;
    addToCrate(
      tracks.map((t) => ({
        title: t.answer?.title ?? '',
        artist: t.answer?.artist ?? '',
        artwork: t.answer?.artwork,
        previewUrl: t.previewUrl,
        puzzle: daily.puzzleNumber,
        solved: live.solved.includes(t.id),
        named: Boolean(live.named?.[t.id]),
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, namedKey, tracks, daily]);

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
      </section>
    );
  }

  if (!daily || !tracks || !def) return null;

  const label = replay
    ? `#${daily.puzzleNumber} · Replay`
    : `Spliced #${daily.puzzleNumber}`;

  return (
    <div className="game">
      {staleGhost && <p className="notice">{staleGhost}</p>}
      {replay > 0 && (
        <p className="notice">
          Replaying for fun. Your official result is saved.
        </p>
      )}
      <div ref={resultsRef}>
        {live && live.status !== 'playing' && (
          <Results
            state={live}
            def={def}
            puzzleNumber={replay ? undefined : daily.puzzleNumber}
            title={`Spliced #${daily.puzzleNumber}`}
            ghost={replay ? null : ghost}
            onPractice={onPractice}
            onReplay={() => {
              setReplay((n) => n + 1);
              setLive(null);
            }}
          />
        )}
      </div>
      <Puzzle
        key={replay ? `replay-${replay}` : `daily-${daily.puzzleNumber}`}
        tracks={tracks}
        clipsPerTrack={daily.clipsPerTrack}
        maxGuesses={daily.maxGuesses}
        seed={daily.puzzleNumber}
        label={label}
        initialState={replay ? null : initial}
        sfx={sfx}
        volume={volume}
        paused={paused}
        ghost={
          replay
            ? null
            : ghost && live?.status !== 'won' && live?.status !== 'lost'
              ? ghost
              : null
        }
        onChange={(s) => {
          setLive(s);
          if (!replay) saveProgress(daily.puzzleNumber, s);
        }}
        onFinish={(s) => {
          if (!replay) {
            saveResult(daily.puzzleNumber, {
              solved: s.status === 'won',
              mistakes: s.mistakes,
              solvedTracks: s.solved.length,
              elapsedMs: s.elapsedMs,
            });
            trackEvent('daily-finish', {
              outcome: s.status,
              mistakes: s.mistakes,
              ghost: Boolean(ghost),
            });
          }
          setTimeout(
            () =>
              resultsRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
              }),
            s.status === 'won' ? 1400 : 900
          );
        }}
      />
    </div>
  );
}

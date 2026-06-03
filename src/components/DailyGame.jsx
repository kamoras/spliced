// Today's shared puzzle. The songs stay hidden until you solve, run out of
// mistakes, or reveal them.

import { useCallback, useEffect, useRef, useState } from 'react';
import Puzzle from './Puzzle.jsx';
import Icon from './Icon.jsx';
import { loadAndSliceTracks } from '../audio/slicer.js';
import {
  getResult,
  saveResult,
  msUntilNextPuzzle,
  formatCountdown,
  formatGuessGrid,
} from '../daily/storage.js';

export default function DailyGame({ onPractice }) {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [daily, setDaily] = useState(null);
  const [game, setGame] = useState(null);
  const [result, setResult] = useState(null);
  const [playedBefore, setPlayedBefore] = useState(false);
  const [replay, setReplay] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const r = await fetch('/api/daily');
      if (!r.ok) throw new Error('Could not load today’s puzzle.');
      const d = await r.json();
      const tracks = await loadAndSliceTracks(d.tracks, d.clipsPerTrack, {
        seed: d.puzzleNumber,
      });
      const existing = getResult(d.puzzleNumber);
      setDaily(d);
      setGame({ tracks });
      setResult(existing);
      setPlayedBefore(!!existing);
      setStatus('ready');
    } catch (e) {
      setError(e.message || 'Something went wrong.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (status === 'loading') {
    return (
      <section className="panel center">
        <p className="muted">Loading today’s puzzle…</p>
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section className="panel center">
        <p className="error">{error}</p>
        <button className="btn btn--primary" onClick={load}>
          Try again
        </button>
      </section>
    );
  }

  const alreadyPlayed = playedBefore && !replay;

  return (
    <div>
      <div className="bar">
        <span className="bar-title">Daily Puzzle #{daily.puzzleNumber}</span>
        <button className="link" onClick={onPractice}>
          Practice mode →
        </button>
      </div>

      {alreadyPlayed ? (
        <CompletedPanel
          daily={daily}
          result={result}
          onReplay={() => setReplay(true)}
        />
      ) : (
        <>
          <Puzzle
            key={`daily-${daily.puzzleNumber}`}
            tracks={game.tracks}
            clipsPerTrack={daily.clipsPerTrack}
            seed={daily.puzzleNumber}
            maxGuesses={daily.maxGuesses}
            onResult={
              replay
                ? undefined // a replay shouldn't overwrite your official result
                : (r) => setResult(saveResult(daily.puzzleNumber, r))
            }
          />
          {result && <ShareBar daily={daily} result={result} />}
        </>
      )}
    </div>
  );
}

function outcome(daily, result) {
  if (result.solved) return 'solved';
  if ((result.mistakes ?? result.attempts ?? 0) >= daily.maxGuesses)
    return 'lost';
  return 'revealed';
}

function CompletedPanel({ daily, result, onReplay }) {
  const kind = outcome(daily, result);
  const message =
    kind === 'solved'
      ? `Solved with ${result.mistakes ?? 0}/${daily.maxGuesses} mistakes.`
      : kind === 'lost'
        ? 'Out of mistakes today.'
        : 'You revealed today’s answer.';

  return (
    <section className="panel">
      <div className="answer-stack">
        {daily.answers.map((answer) => (
          <div
            className="now-playing answer-row"
            key={`${answer.title}-${answer.artist}`}
          >
            {answer.artwork && (
              <img src={answer.artwork} alt="" className="np-art" />
            )}
            <div>
              <div className="np-title">{answer.title}</div>
              <div className="np-artist">{answer.artist}</div>
            </div>
          </div>
        ))}
      </div>

      <p
        className={`result-banner ${kind === 'solved' ? 'is-win' : 'is-loss'}`}
      >
        {message}
      </p>

      <ShareBar daily={daily} result={result} />
      <Countdown />

      <div className="controls">
        <button className="btn" onClick={onReplay}>
          <Icon name="reset" /> Replay this mix
        </button>
      </div>
    </section>
  );
}

function ShareBar({ daily, result }) {
  const [copied, setCopied] = useState(false);
  const kind = outcome(daily, result);
  const summary =
    kind === 'solved'
      ? `${result.mistakes ?? 0}/${daily.maxGuesses} mistakes`
      : kind === 'lost'
        ? `X/${daily.maxGuesses}`
        : 'revealed';
  const detail =
    kind === 'solved'
      ? `${result.attempts ?? 0} submissions · ${result.fullPlays ?? 0} track plays`
      : '';

  const grid = formatGuessGrid(result.grid);
  const origin = typeof location !== 'undefined' ? location.origin : '';
  const text = [
    `Spliced #${daily.puzzleNumber} — ${summary}`,
    detail,
    grid,
    origin,
  ]
    .filter(Boolean)
    .join('\n');

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      /* user dismissed the share sheet */
    }
  }

  return (
    <button className="btn btn--primary share-btn" onClick={share}>
      <Icon name="share" /> {copied ? 'Copied result' : 'Share result'}
    </button>
  );
}

function Countdown() {
  const [ms, setMs] = useState(msUntilNextPuzzle());
  const ref = useRef();

  useEffect(() => {
    ref.current = setInterval(() => setMs(msUntilNextPuzzle()), 1000);
    return () => clearInterval(ref.current);
  }, []);

  return (
    <p className="muted center countdown">
      Next puzzle in <strong>{formatCountdown(ms)}</strong>
    </p>
  );
}

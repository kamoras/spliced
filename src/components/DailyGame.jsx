// Today's shared puzzle. The song is a mystery until you solve, run out of
// guesses, or reveal it.

import { useCallback, useEffect, useRef, useState } from 'react';
import Puzzle from './Puzzle.jsx';
import Icon from './Icon.jsx';
import { loadAndSlice } from '../audio/slicer.js';
import {
  getResult,
  saveResult,
  msUntilNextPuzzle,
  formatCountdown,
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
      const { buffer, pieces } = await loadAndSlice(d.previewUrl, d.numPieces);
      const existing = getResult(d.puzzleNumber);
      setDaily(d);
      setGame({ buffer, pieces });
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
            song={daily.answer}
            buffer={game.buffer}
            pieces={game.pieces}
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
  if (result.attempts >= daily.maxGuesses) return 'lost';
  return 'revealed';
}

function CompletedPanel({ daily, result, onReplay }) {
  const kind = outcome(daily, result);
  const message =
    kind === 'solved'
      ? `Solved in ${result.attempts}/${daily.maxGuesses}.`
      : kind === 'lost'
        ? 'Out of guesses today.'
        : 'You revealed today’s answer.';

  return (
    <section className="panel">
      <div className="now-playing">
        {daily.answer.artwork && (
          <img src={daily.answer.artwork} alt="" className="np-art" />
        )}
        <div>
          <div className="np-title">{daily.answer.title}</div>
          <div className="np-artist">{daily.answer.artist}</div>
        </div>
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
          <Icon name="reset" /> Replay this clip
        </button>
      </div>
    </section>
  );
}

function ShareBar({ daily, result }) {
  const [copied, setCopied] = useState(false);
  const kind = outcome(daily, result);
  const score =
    kind === 'solved'
      ? `${result.attempts}/${daily.maxGuesses}`
      : kind === 'lost'
        ? `X/${daily.maxGuesses}`
        : 'revealed';

  const text =
    `Spliced #${daily.puzzleNumber} — ${score}\n` +
    `${typeof location !== 'undefined' ? location.origin : ''}`;

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

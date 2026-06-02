// Today's shared puzzle. The song is a mystery until you solve (or reveal) it.

import { useCallback, useEffect, useRef, useState } from 'react';
import Puzzle from './Puzzle.jsx';
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
  const [daily, setDaily] = useState(null); // { puzzleNumber, numPieces, answer }
  const [game, setGame] = useState(null); // { buffer, pieces }
  const [result, setResult] = useState(null); // { solved, attempts } | null
  const [replay, setReplay] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const r = await fetch('/api/daily');
      if (!r.ok) throw new Error('Could not load today’s puzzle.');
      const d = await r.json();
      const { buffer, pieces } = await loadAndSlice(d.previewUrl, d.numPieces);
      setDaily(d);
      setGame({ buffer, pieces });
      setResult(getResult(d.puzzleNumber));
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
      <section className="setup center">
        <p className="muted">Loading today’s puzzle…</p>
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section className="setup center">
        <p className="error">{error}</p>
        <button className="btn btn-primary" onClick={load}>
          Try again
        </button>
      </section>
    );
  }

  const alreadyPlayed = result && !replay;

  return (
    <div>
      <div className="daily-bar">
        <span className="daily-no">Daily Puzzle #{daily.puzzleNumber}</span>
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
            onNewPuzzle={null}
            onResult={
              replay
                ? undefined // a replay shouldn't overwrite your official result
                : (r) => setResult(saveResult(daily.puzzleNumber, r))
            }
          />
          {result && (
            <ShareBar daily={daily} result={result} />
          )}
        </>
      )}
    </div>
  );
}

function CompletedPanel({ daily, result, onReplay }) {
  return (
    <section className="setup completed">
      <div className="completed-head">
        {daily.answer.artwork && (
          <img src={daily.answer.artwork} alt="" className="np-art" />
        )}
        <div>
          <div className="np-title">{daily.answer.title}</div>
          <div className="np-artist">{daily.answer.artist}</div>
        </div>
      </div>

      <p className="completed-msg">
        {result.solved
          ? `🎉 You solved it in ${result.attempts} ${
              result.attempts === 1 ? 'try' : 'tries'
            }!`
          : '👀 You revealed today’s answer.'}
      </p>

      <ShareBar daily={daily} result={result} />

      <Countdown />

      <div className="controls">
        <button className="btn" onClick={onReplay}>
          ⟲ Replay this clip
        </button>
      </div>
    </section>
  );
}

function ShareBar({ daily, result }) {
  const [copied, setCopied] = useState(false);

  const text =
    `🎚️ Spliced #${daily.puzzleNumber}\n` +
    (result.solved
      ? `Reassembled in ${result.attempts} ${
          result.attempts === 1 ? 'try' : 'tries'
        } 🎶`
      : 'Revealed 👀') +
    `\n${typeof location !== 'undefined' ? location.origin : ''}`;

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
      /* user dismissed share sheet */
    }
  }

  return (
    <button className="btn btn-accent share-btn" onClick={share}>
      {copied ? '✓ Copied result' : '↗ Share result'}
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

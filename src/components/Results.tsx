// End-of-game card: headline, score, the emoji grid, sharing (with a ghost
// link friends can race), and — for the daily — stats and the countdown.

import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import Stats from './Stats.jsx';
import {
  formatCountdown,
  formatDuration,
  getPrefs,
  liveStreak,
  msUntilNextPuzzle,
  setPrefs,
} from '../daily/storage.js';
import {
  encodeGhost,
  headline,
  namedCount,
  raceResult,
  shareText,
} from '../game/engine.js';
import type { GameState, Ghost, Mark, PuzzleDef } from '../game/engine.js';

interface ResultsProps {
  state: GameState;
  def: PuzzleDef;
  // Daily puzzle number; omitted in Practice.
  puzzleNumber?: number;
  title: string;
  ghost?: { ghost: Ghost; name: string } | null;
  onReplay?: () => void;
  onPractice?: () => void;
  onNewMix?: () => void;
}

const GLYPH: Record<Mark, string> = { correct: '✓', misplaced: '~', miss: '' };

export default function Results({
  state,
  def,
  puzzleNumber,
  title,
  ghost,
  onReplay,
  onPractice,
  onNewMix,
}: ResultsProps) {
  const daily = typeof puzzleNumber === 'number';
  const { title: head, sub } = headline(state);
  const won = state.status === 'won';
  const [name, setName] = useState(() => getPrefs().name ?? '');
  const [copied, setCopied] = useState(false);

  const streak = daily ? liveStreak(puzzleNumber) : 0;
  const tags: string[] = [];
  if (won && state.elapsedMs > 0 && state.elapsedMs < 60_000) {
    tags.push('⚡ Speed splicer');
  }
  if (won && [3, 7, 14, 30, 50, 100].includes(streak)) {
    tags.push(`🔥 ${streak}-day streak`);
  }
  const named = namedCount(state);
  if (named === def.tracks.length) tags.push('🎵 Perfect ear');

  const race = ghost ? raceResult(state, ghost.ghost) : 0;
  const raceLine = ghost
    ? race > 0
      ? `⚔️ Beat ${ghost.name}'s ghost`
      : `👻 ${ghost.name}'s ghost won this one`
    : undefined;

  function shareUrl(): string {
    const origin = typeof location !== 'undefined' ? location.origin : '';
    if (!daily) return origin;
    const q = new URLSearchParams({ g: encodeGhost(state, puzzleNumber) });
    if (name.trim()) q.set('n', name.trim().slice(0, 16));
    return `${origin}/?${q}`;
  }

  async function share() {
    const text = shareText(title, state, def, shareUrl(), raceLine);
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      /* dismissed */
    }
  }

  return (
    <section
      className={`results ${won ? 'is-win' : 'is-loss'}`}
      aria-label="Results"
    >
      <h2 className="results-head">{head}</h2>
      <p className="results-sub">{sub}</p>

      <div className="results-score">
        {won && <span>⏱ {formatDuration(state.elapsedMs)}</span>}
        <span>
          {state.mistakes} {state.mistakes === 1 ? 'mistake' : 'mistakes'}
        </span>
        <span>
          🎵 {named}/{def.tracks.length} named
        </span>
        {state.listens ? (
          <span>
            🎧 {state.listens} {state.listens === 1 ? 'listen' : 'listens'}
          </span>
        ) : null}
      </div>

      {tags.length > 0 && (
        <p className="results-tags">
          {tags.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </p>
      )}

      {ghost && (
        <div className={`race ${race > 0 ? 'is-win' : 'is-loss'}`}>
          <strong>
            {race > 0
              ? `You beat ${ghost.name}!`
              : `${ghost.name} wins this round`}
          </strong>
          <span>
            You: {won ? formatDuration(state.elapsedMs) : 'lost'} ·{' '}
            {state.mistakes}✗ — {ghost.name}:{' '}
            {ghost.ghost.won ? formatDuration(ghost.ghost.elapsedMs) : 'lost'} ·{' '}
            {ghost.ghost.mistakes}✗
          </span>
        </div>
      )}

      {state.attempts.length > 0 && (
        <div className="attempt-grid" aria-label="Your lock-ins">
          {state.attempts.map((a, i) => (
            <div className="attempt-row" key={i}>
              {a.marks.map((m, j) => (
                <span key={j} className={`attempt-cell is-${m}`}>
                  {GLYPH[m]}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {daily && (
        <label className="sign">
          <span>Sign your mix</span>
          <input
            type="text"
            value={name}
            maxLength={16}
            placeholder="Your name (for the ghost race)"
            onChange={(e) => {
              setName(e.target.value);
              setPrefs({ name: e.target.value.trim() || undefined });
            }}
          />
        </label>
      )}

      <button
        type="button"
        className="btn btn--primary btn--wide"
        onClick={share}
      >
        <Icon name="share" />{' '}
        {copied
          ? 'Copied — paste it to a friend!'
          : daily
            ? 'Share & challenge friends'
            : 'Share'}
      </button>

      {daily && (
        <>
          <Stats
            puzzleNumber={puzzleNumber}
            maxGuesses={def.maxGuesses}
            today={state}
          />
          <Countdown />
        </>
      )}

      <div className="results-actions">
        {onNewMix && (
          <button type="button" className="btn" onClick={onNewMix}>
            <Icon name="shuffle" /> New mix
          </button>
        )}
        {onPractice && (
          <button type="button" className="btn" onClick={onPractice}>
            <Icon name="shuffle" /> Practice
          </button>
        )}
        {onReplay && (
          <button type="button" className="btn btn--ghost" onClick={onReplay}>
            <Icon name="reset" /> Replay this mix
          </button>
        )}
      </div>
    </section>
  );
}

export function Countdown() {
  const [ms, setMs] = useState(msUntilNextPuzzle());
  useEffect(() => {
    const id = setInterval(() => setMs(msUntilNextPuzzle()), 1000);
    return () => clearInterval(id);
  }, []);
  // Crossed midnight while the page was open: offer the new puzzle.
  const [startDay] = useState(() => Math.floor(Date.now() / 86400000));
  if (Math.floor(Date.now() / 86400000) !== startDay) {
    return (
      <button
        type="button"
        className="btn btn--primary btn--wide"
        onClick={() => location.reload()}
      >
        A new mix is ready — play it
      </button>
    );
  }
  return (
    <p className="countdown">
      Next mix in <strong>{formatCountdown(ms)}</strong>
    </p>
  );
}

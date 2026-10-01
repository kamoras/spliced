// End-of-game card: headline, score, the emoji grid, sharing (with a ghost
// link friends can race), and — for the daily — stats and the countdown.

import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { LAUNCH_UTC } from '../../api/_songs.js';
import Stats from './Stats.jsx';
import {
  computeStats,
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
  hasTakes,
  namedCount,
  parFor,
  relToPar,
  takesOf,
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

// Same glyphs as the board: ✓ right slot, ⤨ right song (wrong slot).
const GLYPH: Record<Mark, string> = { correct: '✓', misplaced: '⤨', miss: '' };

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
  // Show the name prompt after the first share (unless a name is already set).
  const [shared, setShared] = useState(false);
  const playedCount = daily
    ? computeStats(puzzleNumber, def.maxGuesses).played
    : 0;

  const streak = daily ? liveStreak(puzzleNumber) : 0;
  const named = namedCount(state);
  const takes = takesOf(state);
  const par = parFor(def);
  const showTakes = won && hasTakes(state);
  // One featured badge, most impressive first.
  const tags: string[] = [];
  if (showTakes && takes <= par - 8) tags.push('🎯 Golden ear');
  else if (named === def.tracks.length) tags.push('🎵 Perfect ear');
  else if (showTakes && takes <= par - 4) tags.push('👂 Sharp ear');
  else if (won && [3, 7, 14, 30, 50, 100].includes(streak)) {
    tags.push(`🔥 ${streak}-day streak`);
  } else if (showTakes && takes <= par) tags.push('⛳ Under par');

  const race = ghost ? raceResult(state, ghost.ghost) : 0;
  const raceLine = ghost
    ? race > 0
      ? `⚔️ Beat ${ghost.name}'s ghost`
      : race === 0
        ? `🤝 Tied ${ghost.name}'s ghost`
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
      if (!getPrefs().name) setShared(true);
    } catch {
      /* dismissed */
    }
  }

  return (
    <section
      className={`results console ${won ? 'is-win' : 'is-loss'}`}
      aria-label="Results"
    >
      <span className="results-label" aria-hidden="true">
        Mixdown
      </span>
      <div className="vfd results-vfd">
        <h2 className="results-head" tabIndex={-1}>
          {head}
        </h2>
        <p className="results-sub">{sub}</p>
      </div>

      <div className="results-score">
        {won && <span>⏱ {formatDuration(state.elapsedMs)}</span>}
        <span>
          {state.mistakes} {state.mistakes === 1 ? 'mistake' : 'mistakes'}
        </span>
        <span>
          🎵 {named}/{def.tracks.length} named
        </span>
        {showTakes && (
          <span
            title={`Takes: every clip, join and channel order you heard for the first time, plus each LOCK. Par is ${par}.`}
          >
            🎧 {takes} takes · {relToPar(takes, par)}
          </span>
        )}
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
              : race === 0
                ? `Dead heat with ${ghost.name}!`
                : `${ghost.name} wins this round`}
          </strong>
          <span className="race-rule">
            Ranked by win, then fewest mistakes, then takes, then time.
          </span>
          <span>
            You: {won ? formatDuration(state.elapsedMs) : 'lost'} ·{' '}
            {state.mistakes}✗ · 🎧{takes} vs. {ghost.name}:{' '}
            {ghost.ghost.won ? formatDuration(ghost.ghost.elapsedMs) : 'lost'} ·{' '}
            {ghost.ghost.mistakes}✗ · 🎧{ghost.ghost.takes}
          </span>
        </div>
      )}

      {state.attempts.length > 0 && (
        <div
          className="attempt-grid"
          role="img"
          aria-label={`Your lock-ins: ${state.attempts
            .map((a) =>
              a.era
                ? 'right song, wrong year'
                : a.solved
                  ? 'locked'
                  : `${a.marks.filter((m) => m === 'correct').length} in place, ${a.marks.filter((m) => m === 'misplaced').length} close`
            )
            .join('; ')}`}
        >
          {state.attempts.map((a, i) => (
            <div className="attempt-row" key={i}>
              {a.marks.map((m, j) => (
                <span
                  key={j}
                  className={`attempt-cell is-${a.era ? 'era' : m}`}
                >
                  {a.era ? '↪' : GLYPH[m]}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="cbtn cbtn--rec is-armed results-share"
        onClick={share}
      >
        <span className="lamp" aria-hidden="true" />
        {copied
          ? 'Copied! Paste it to a friend.'
          : daily
            ? 'Share & challenge friends'
            : 'Share'}
      </button>
      <span className="visually-hidden" role="status">
        {copied ? 'Copied! Paste it to a friend.' : ''}
      </span>

      {won && (
        <button
          type="button"
          className="cbtn results-mixtape"
          onClick={() => window.dispatchEvent(new Event('spliced:mixtape'))}
        >
          <span className="lamp" aria-hidden="true" />
          Play mixtape
        </button>
      )}

      {/* Asked once, after the first share: who friends will be racing. */}
      {daily && shared && (
        <label className="sign">
          <span>Sign your mix so friends know whose ghost they’re racing</span>
          <input
            type="text"
            value={name}
            maxLength={16}
            placeholder="Your name"
            onChange={(e) => {
              setName(e.target.value);
              setPrefs({ name: e.target.value.trim() || undefined });
            }}
          />
        </label>
      )}

      {daily && <Countdown puzzleNumber={puzzleNumber} />}

      {daily && (
        <details className="stats-details" open={playedCount >= 3}>
          <summary>Your stats</summary>
          <Stats
            puzzleNumber={puzzleNumber}
            maxGuesses={def.maxGuesses}
            today={state}
          />
        </details>
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

// Time until the next puzzle after `puzzleNumber` (or after today's, when
// omitted). Once that puzzle is out, offer it.
export function Countdown({ puzzleNumber }: { puzzleNumber?: number }) {
  const nextAt =
    typeof puzzleNumber === 'number'
      ? LAUNCH_UTC + (puzzleNumber + 1) * 86400000
      : null;
  const left = () =>
    nextAt != null ? nextAt - Date.now() : msUntilNextPuzzle();
  const [ms, setMs] = useState(left);
  useEffect(() => {
    const id = setInterval(() => setMs(left()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextAt]);
  if (ms <= 0) {
    return (
      <button
        type="button"
        className="btn btn--primary btn--wide"
        onClick={() => location.reload()}
      >
        A new mix is ready. Play it!
      </button>
    );
  }
  return (
    <p className="countdown">
      Next mix in <strong>{formatCountdown(ms)}</strong>
    </p>
  );
}

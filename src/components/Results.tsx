// End-of-game card: headline, score, the emoji grid, sharing (with a ghost
// link friends can race), and, for the daily, stats, the countdown and the
// archive.

import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import Stats from './Stats.jsx';
import {
  LAUNCH_UTC,
  DAY_MS,
  DAILY_GUESSES,
  puzzleNumberFor,
} from '../../shared/game.js';
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
  // A past day played from the archive (no countdown, no ghost link).
  archive?: boolean;
  title: string;
  ghost?: { ghost: Ghost; name: string } | null;
  onReplay?: () => void;
  onPractice?: () => void;
  onNewMix?: () => void;
  onEncore?: () => void;
  onArchive?: (date: string | null) => void;
}

// One cell per splice: ✓ a true join, ✗ a wrong one.
const GLYPH: Record<Mark, string> = { correct: '✓', misplaced: '⤨', miss: '✗' };

// The splices grouped into lines, one per finished song (plus any left over).
function spliceLines(attempts: GameState['attempts']) {
  const lines: GameState['attempts'][] = [];
  let line: GameState['attempts'] = [];
  attempts.forEach((a) => {
    line.push(a);
    if (a.solved) {
      lines.push(line);
      line = [];
    }
  });
  if (line.length) lines.push(line);
  return lines;
}

export default function Results({
  state,
  def,
  puzzleNumber,
  archive = false,
  title,
  ghost,
  onReplay,
  onPractice,
  onNewMix,
  onEncore,
  onArchive,
}: ResultsProps) {
  const daily = typeof puzzleNumber === 'number';
  const { title: head, sub: dailySub } = headline(state);
  // "Back tomorrow" only fits today's official daily.
  const sub =
    state.status === 'lost' && (!daily || archive)
      ? onNewMix
        ? 'Here’s what you were hearing. Spin up a new mix!'
        : 'Here’s what you were hearing.'
      : dailySub;
  const won = state.status === 'won';
  const [name, setName] = useState(() => getPrefs().name ?? '');
  const [copied, setCopied] = useState(false);
  // Show the name prompt after the first share (unless a name is already set).
  const [shared, setShared] = useState(false);
  const playedCount =
    daily && !archive ? computeStats(puzzleNumber, DAILY_GUESSES).played : 0;

  const streak = daily && !archive ? liveStreak(puzzleNumber) : 0;
  const named = namedCount(state);
  const takes = takesOf(state);
  const par = parFor(def);
  const showTakes = won && hasTakes(state);
  // One featured badge, most impressive first.
  const tags: string[] = [];
  if (won && state.mistakes === 0 && showTakes && takes <= par - 4) {
    tags.push('🎯 Golden ear');
  } else if (named === def.tracks.length) tags.push('🎵 Named them all');
  else if (won && [3, 7, 14, 30, 50, 100].includes(streak)) {
    tags.push(`🔥 ${streak}-day streak`);
  }

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
    if (!daily || archive) return origin;
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
        {won ? (
          <span>⏱ {formatDuration(state.elapsedMs)}</span>
        ) : (
          <span>
            {state.solved.length}/{def.tracks.length} songs found
          </span>
        )}
        <span>
          {state.mistakes} {state.mistakes === 1 ? 'mistake' : 'mistakes'}
          {state.hard ? ' ✦ hard' : ''}
        </span>
        <span>
          🎵 {named}/{def.tracks.length} named
        </span>
      </div>
      {showTakes && (
        <p
          className="results-pro"
          title="Listens: every clip, join and channel order you heard for the first time, plus each lock. Par is what a careful listen takes."
        >
          🎧 {takes} listens · {relToPar(takes, par)}
        </p>
      )}

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
            Ranked by win, then fewest mistakes, then songs named, then time.
          </span>
          <span>
            You: {won ? formatDuration(state.elapsedMs) : 'lost'} ·{' '}
            {state.mistakes}✗ · 🎵{named} vs. {ghost.name}:{' '}
            {ghost.ghost.won ? formatDuration(ghost.ghost.elapsedMs) : 'lost'} ·{' '}
            {ghost.ghost.mistakes}✗ · 🎵{ghost.ghost.named}
          </span>
        </div>
      )}

      {state.attempts.length > 0 && (
        <div
          className="attempt-grid"
          role="img"
          aria-label={`Your splices: ${state.attempts
            .map((a) =>
              a.solved
                ? 'finished a song'
                : a.marks[0] === 'correct'
                  ? 'a true join'
                  : 'not a join'
            )
            .join('; ')}`}
        >
          {spliceLines(state.attempts).map((line, i) => (
            <div className="attempt-row" key={i}>
              {line.map((a, j) => (
                <span key={j} className={`attempt-cell is-${a.marks[0]}`}>
                  {GLYPH[a.marks[0]]}
                </span>
              ))}
              {line[line.length - 1]?.trackId &&
                state.named?.[line[line.length - 1].trackId!] && (
                  <span className="attempt-cell is-named" aria-hidden="true">
                    🎵
                  </span>
                )}
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
          : daily && !archive
            ? 'Share & challenge friends'
            : 'Share'}
      </button>
      <span className="visually-hidden" role="status">
        {copied ? 'Copied! Paste it to a friend.' : ''}
      </span>

      {won && onEncore && (
        <button
          type="button"
          className="cbtn results-mixtape"
          onClick={onEncore}
        >
          <span className="lamp" aria-hidden="true" />
          Play mixtape
        </button>
      )}

      {/* Asked once, after the first share: who friends will be racing. */}
      {daily && !archive && shared && (
        <label className="sign">
          <span>Sign your mix so friends know whose ghost they’re racing</span>
          <input
            type="text"
            value={name}
            maxLength={16}
            placeholder="Your name"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setPrefs({ name: name.trim() || undefined })}
          />
        </label>
      )}

      {daily && !archive && <Countdown puzzleNumber={puzzleNumber} />}

      {daily && (
        <details className="stats-details" open={playedCount >= 3}>
          <summary>Your stats</summary>
          <Stats
            puzzleNumber={puzzleNumberFor(Date.now())}
            maxGuesses={DAILY_GUESSES}
            today={archive ? null : state}
          />
        </details>
      )}

      {daily && onArchive && <ArchivePicker onPick={onArchive} />}

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
      ? LAUNCH_UTC + (puzzleNumber + 1) * DAY_MS
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

// Pick a past day to play. Archive results count in your stats, not your
// streak.
export function ArchivePicker({
  onPick,
}: {
  onPick: (date: string | null) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const first = new Date(LAUNCH_UTC).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
  if (yesterday < first) return null;
  return (
    <form
      className="archive"
      onSubmit={(e) => {
        e.preventDefault();
        const date = new FormData(e.currentTarget).get('date');
        if (typeof date === 'string' && date >= first && date < today) {
          onPick(date);
        }
      }}
    >
      <label>
        <span>Play a past mix</span>
        <input type="date" name="date" min={first} max={yesterday} required />
      </label>
      <button type="submit" className="btn">
        Open
      </button>
    </form>
  );
}

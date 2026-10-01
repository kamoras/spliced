// Daily stats: headline numbers plus a Wordle-style histogram of wins by
// mistake count (with losses as the last bar).

import { computeStats } from '../daily/storage.js';
import type { GameState } from '../game/engine.js';

export default function Stats({
  puzzleNumber,
  maxGuesses,
  today,
}: {
  puzzleNumber: number;
  maxGuesses: number;
  today?: GameState | null;
}) {
  const stats = computeStats(puzzleNumber, maxGuesses);
  const cells = [
    { label: 'Played', value: stats.played },
    { label: 'Win %', value: stats.winPct },
    { label: 'Streak', value: stats.currentStreak },
    { label: 'Best', value: stats.maxStreak },
  ];
  const bars = [
    ...stats.distribution.map((count, k) => ({ label: String(k), count })),
    { label: 'X', count: stats.losses },
  ];
  const max = Math.max(1, ...bars.map((b) => b.count));
  const todayBar =
    today && today.status !== 'playing'
      ? today.status === 'won'
        ? String(Math.min(maxGuesses - 1, today.mistakes))
        : 'X'
      : null;

  return (
    <div className="stats">
      <div className="stat-cells">
        {cells.map((c) => (
          <div className="stat-cell" key={c.label}>
            <span className="stat-value">{c.value}</span>
            <span className="stat-label">{c.label}</span>
          </div>
        ))}
      </div>
      <figure className="histo">
        <figcaption>Mistakes per solve</figcaption>
        {bars.map((b) => (
          <div className="histo-row" key={b.label}>
            <span className="histo-label">{b.label}</span>
            <span className="histo-track">
              <span
                className={`histo-bar${todayBar === b.label ? ' is-today' : ''}`}
                style={{ width: `${Math.max(8, (b.count / max) * 100)}%` }}
              >
                {b.count}
              </span>
            </span>
          </div>
        ))}
      </figure>
    </div>
  );
}

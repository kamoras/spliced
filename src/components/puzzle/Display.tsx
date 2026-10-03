// The console's VFD readout: label, tape reels, ghost chip, listens counter,
// the 7-segment clock and the message line.

import { useEffect, useState } from 'react';
import SevenSeg from '../SevenSeg.jsx';
import { formatDuration } from '../../daily/storage.js';
import type { Ghost } from '../../game/engine.js';

export function Display({
  label,
  spinning,
  ghost,
  listens,
  getElapsed,
  frozen,
  message,
}: {
  label: string;
  spinning: boolean;
  ghost?: { ghost: Ghost; name: string } | null;
  listens: number | null;
  getElapsed: () => number;
  frozen: boolean;
  message: string;
}) {
  return (
    <div className="vfd">
      <div className="vfd-top">
        <span className="vfd-label">{label}</span>
        <Reels spinning={spinning} />
        {ghost && (
          <span className="vfd-ghost" title={`Racing ${ghost.name}`}>
            👻 {ghost.name}{' '}
            {ghost.ghost.won ? formatDuration(ghost.ghost.elapsedMs) : 'X'}
          </span>
        )}
        {listens != null && (
          <span
            className="vfd-listens"
            title="Listens: each clip, join and channel order heard for the first time, plus each lock. Fewer is sharper."
            aria-label={`${listens} listens`}
          >
            🎧 {listens}
          </span>
        )}
        <Clock getElapsed={getElapsed} frozen={frozen} />
      </div>
      <p className="vfd-msg" role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}

// Two little tape reels in the display that turn while anything plays.
function Reels({ spinning }: { spinning: boolean }) {
  const reel = (
    <svg viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="6" />
      <circle cx="7" cy="7" r="1.6" className="hub" />
      <path d="M7 1.5v3M11.8 9.8l-2.6-1.5M2.2 9.8l2.6-1.5" />
    </svg>
  );
  return (
    <span
      className={`reels${spinning ? ' is-spinning' : ''}`}
      aria-hidden="true"
    >
      {reel}
      {reel}
    </span>
  );
}

function Clock({
  getElapsed,
  frozen,
}: {
  getElapsed: () => number;
  frozen: boolean;
}) {
  const [ms, setMs] = useState(() => getElapsed());
  useEffect(() => {
    setMs(getElapsed());
    if (frozen) return undefined;
    const id = setInterval(() => setMs(getElapsed()), 250);
    return () => clearInterval(id);
  }, [getElapsed, frozen]);
  const text = formatDuration(ms);
  return <SevenSeg value={text.padStart(5, ' ')} label={`Time ${text}`} />;
}

// Live commentary while racing a friend's ghost: as the clock passes each of
// their lock-ins, a line on the display says what they did. Starts past any
// events that already happened (a reload mid-race).

import { useEffect, useRef } from 'react';
import { formatDuration } from '../../daily/storage.js';
import type { Ghost } from '../../game/engine.js';

export function useGhostTicker({
  ghost,
  over,
  startMs,
  elapsedNow,
  say,
}: {
  ghost: { ghost: Ghost; name: string } | null | undefined;
  over: boolean;
  startMs: number;
  elapsedNow: () => number;
  say: (message: string) => void;
}) {
  const idx = useRef(
    (() => {
      if (!ghost) return 0;
      const atts = ghost.ghost.attempts;
      const i = atts.findIndex((a) => (a.atMs ?? 0) > startMs);
      return i < 0 ? atts.length : i;
    })()
  );
  const sayRef = useRef(say);
  sayRef.current = say;
  useEffect(() => {
    if (!ghost || over) return undefined;
    const g = ghost.ghost;
    const id = setInterval(() => {
      const now = elapsedNow();
      const next = g.attempts[idx.current];
      if (next && (next.atMs ?? 0) <= now) {
        idx.current++;
        sayRef.current(
          next.solved
            ? `👻 ${ghost.name} finished a song.`
            : next.marks[0] === 'correct'
              ? `👻 ${ghost.name} spliced a join.`
              : `👻 ${ghost.name} slipped up!`
        );
      } else if (!next && g.won && now > g.elapsedMs && idx.current >= 0) {
        idx.current = -1;
        sayRef.current(
          `👻 ${ghost.name} finished in ${formatDuration(g.elapsedMs)}. Keep going!`
        );
      }
    }, 400);
    return () => clearInterval(id);
  }, [ghost, over, elapsedNow]);
}

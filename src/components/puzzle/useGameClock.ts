// The board's clock: active play time only. It runs from the first tap until
// the game ends, and pauses while the tab is hidden, the window is blurred,
// or a dialog is open. Everything lives in refs so a render never restarts
// it; `elapsedNow()` reads it on demand.

import { useCallback, useEffect, useRef } from 'react';

export interface GameClock {
  elapsedNow: () => number;
  // Freeze the clock (banking the time so far).
  bank: () => void;
  // Run again, unless something blocks it.
  resume: () => void;
  // The first interaction starts the clock.
  beginTiming: () => void;
  // Call at the winning lock, before the splice animation commits the win,
  // so a re-render in between can't restart the clock.
  finish: () => void;
}

export function useGameClock({
  initialMs,
  over,
  paused,
  onHide,
}: {
  initialMs: number;
  over: boolean;
  paused: boolean;
  // Runs when the page hides (a good moment to persist).
  onHide?: () => void;
}): GameClock {
  const accumulated = useRef(initialMs);
  const runningSince = useRef<number | null>(null);
  const started = useRef(initialMs > 0);
  const finishing = useRef(false);
  const blockers = useRef({ over, paused, hidden: false });
  blockers.current.over = over || finishing.current;
  blockers.current.paused = paused;
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;

  const elapsedNow = useCallback(
    () =>
      Math.round(
        accumulated.current +
          (runningSince.current != null ? Date.now() - runningSince.current : 0)
      ),
    []
  );
  const bank = useCallback(() => {
    if (runningSince.current != null) {
      accumulated.current += Date.now() - runningSince.current;
      runningSince.current = null;
    }
  }, []);
  const resume = useCallback(() => {
    const b = blockers.current;
    if (started.current && !b.over && !b.paused && !b.hidden) {
      if (runningSince.current == null) runningSince.current = Date.now();
    }
  }, []);
  const beginTiming = useCallback(() => {
    started.current = true;
    resume();
  }, [resume]);
  const finish = useCallback(() => {
    finishing.current = true;
    blockers.current.over = true;
    bank();
  }, [bank]);

  useEffect(() => {
    if (paused || over) bank();
    else resume();
  }, [paused, over, bank, resume]);

  useEffect(() => {
    const hide = () => {
      blockers.current.hidden = true;
      bank();
      onHideRef.current?.();
    };
    const show = () => {
      blockers.current.hidden = false;
      resume();
    };
    const onVisibility = () => (document.hidden ? hide() : show());
    window.addEventListener('blur', hide);
    window.addEventListener('focus', show);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', hide);
      window.removeEventListener('focus', show);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [bank, resume]);

  return { elapsedNow, bank, resume, beginTiming, finish };
}

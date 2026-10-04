import { Suspense, lazy, useState } from 'react';
import DailyGame from './components/DailyGame.jsx';
import PracticeGame from './components/PracticeGame.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import HowToPlay from './components/HowToPlay.jsx';
import Modal from './components/Modal.jsx';
import { ArchivePicker, Countdown } from './components/Results.jsx';
import type { BoardEvent } from './components/Puzzle.jsx';
import Icon from './components/Icon.jsx';
import Logo from './components/Logo.jsx';
import { useObservance } from './theme/useObservance.js';
import { getSfx } from './audio/sfx.js';
import { getAudioContext } from './audio/slicer.js';
import SoundControl from './components/SoundControl.jsx';
import {
  getPrefs,
  getProgress,
  liveStreak,
  setPrefs,
} from './daily/storage.js';
import { DAILY_GUESSES, puzzleNumberFor } from '../shared/game.js';

// The sheets nobody opens on the first visit load on demand.
const Stats = lazy(() => import('./components/Stats.jsx'));
const Crate = lazy(() => import('./components/Crate.jsx'));

type Mode = 'daily' | 'practice';
type Sheet = 'help' | 'stats' | 'crate' | null;

const todayNumber = () => puzzleNumberFor(Date.now());

export default function App() {
  const [mode, setMode] = useState<Mode>('daily');
  // A past day from the archive (YYYY-MM-DD), or today.
  const [archive, setArchive] = useState<string | null>(null);
  const [prefs, setPrefsState] = useState(getPrefs);
  const [sheet, setSheet] = useState<Sheet>(() =>
    getPrefs().seenHelp ? null : 'help'
  );
  // Set when a control that removed itself hands the next board focus.
  const [focusBoard, setFocusBoard] = useState(false);
  // The logo's fader cap: up after a win, back down for a new board.
  const [spliced, setSpliced] = useState(false);
  const streak = liveStreak(todayNumber());
  const obs = useObservance();
  const showBanner = obs && prefs.obsDismissed !== obs.id;

  // The console's power-on thunk: on the first "Let's play" (a user gesture,
  // so audio is allowed) and whenever sound is switched back on.
  function powerOn(p = prefs) {
    if (p.sfx && !p.muted) {
      const fx = getSfx(getAudioContext());
      fx.setVolume(p.volume);
      fx.play('thunk');
    }
  }

  function closeSheet() {
    if (sheet === 'help' && !prefs.seenHelp) {
      setPrefsState(setPrefs({ seenHelp: true }));
      powerOn();
    }
    setSheet(null);
  }

  function switchMode(next: Mode) {
    setFocusBoard(true);
    setMode(next);
  }

  function openArchive(date: string | null) {
    setFocusBoard(true);
    setArchive(date);
    setMode('daily');
    setSheet(null);
  }

  const onBoardEvent = (e: BoardEvent) => setSpliced(e === 'win');
  const volume = prefs.muted ? 0 : prefs.volume;

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to puzzle
      </a>

      <header className="site-header">
        <Logo obs={obs} spliced={spliced} />
        <div className="header-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setSheet('crate')}
            aria-label="Record crate"
            title="Record crate"
          >
            <span aria-hidden="true" className="icon-emoji">
              💿
            </span>
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setSheet('stats')}
            aria-label={`Stats${streak ? `, ${streak}-day streak` : ''}`}
            title="Stats"
          >
            <Icon name="chart" />
            {streak > 0 && (
              <span className="streak-badge" aria-hidden="true">
                🔥{streak}
              </span>
            )}
          </button>
          <SoundControl
            prefs={prefs}
            onChange={(patch) => {
              const next = setPrefs(patch);
              if (
                (patch.muted === false && prefs.muted) ||
                (patch.sfx === true && !prefs.sfx)
              ) {
                powerOn(next);
              }
              setPrefsState(next);
            }}
          />
          <button
            type="button"
            className="icon-btn"
            onClick={() => setSheet('help')}
            aria-label="How to play"
            title="How to play"
          >
            <Icon name="help" />
          </button>
          <ThemeToggle />
        </div>
      </header>

      {showBanner && (
        <aside className="obs-banner" aria-label="Theme">
          <span className="obs-flag" aria-hidden="true" />
          <span>{obs.label}</span>
          {obs.href && (
            <a href={obs.href} target="_blank" rel="noopener noreferrer">
              Learn more
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          )}
          <button
            type="button"
            className="icon-btn obs-close"
            aria-label="Hide this banner"
            onClick={() => setPrefsState(setPrefs({ obsDismissed: obs.id }))}
          >
            <Icon name="close" />
          </button>
        </aside>
      )}

      <nav className="modes" aria-label="Game mode">
        <button
          type="button"
          className={mode === 'daily' ? 'is-on' : ''}
          aria-pressed={mode === 'daily'}
          onClick={() => {
            setArchive(null);
            switchMode('daily');
          }}
        >
          Daily
        </button>
        <button
          type="button"
          className={mode === 'practice' ? 'is-on' : ''}
          aria-pressed={mode === 'practice'}
          onClick={() => switchMode('practice')}
        >
          Practice
        </button>
      </nav>

      <main id="main">
        {mode === 'daily' ? (
          <DailyGame
            key={archive ?? 'today'}
            date={archive}
            onPractice={() => switchMode('practice')}
            onArchive={openArchive}
            sfx={prefs.sfx}
            volume={volume}
            paused={sheet != null}
            hard={prefs.hard}
            focusOnMount={focusBoard}
            onBoardEvent={onBoardEvent}
          />
        ) : (
          <PracticeGame
            onDaily={() => switchMode('daily')}
            sfx={prefs.sfx}
            volume={volume}
            paused={sheet != null}
            focusOnMount={focusBoard}
            onBoardEvent={onBoardEvent}
          />
        )}
      </main>

      <footer className="footer">
        Previews via the iTunes Search API ·{' '}
        <a
          href="https://github.com/kamoras/spliced"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open source on GitHub
        </a>
      </footer>

      {sheet === 'help' && <HowToPlay onClose={closeSheet} />}
      <Suspense fallback={null}>
        {sheet === 'crate' && <Crate onClose={closeSheet} volume={volume} />}
        {sheet === 'stats' && (
          <Modal title="Your stats" onClose={closeSheet}>
            <Stats
              puzzleNumber={todayNumber()}
              maxGuesses={DAILY_GUESSES}
              today={getProgress(todayNumber())}
            />
            <Countdown puzzleNumber={todayNumber()} />
            <ArchivePicker onPick={openArchive} />
          </Modal>
        )}
      </Suspense>
    </div>
  );
}

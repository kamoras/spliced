import { useState } from 'react';
import DailyGame from './components/DailyGame.jsx';
import PracticeGame from './components/PracticeGame.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import HowToPlay from './components/HowToPlay.jsx';
import Modal from './components/Modal.jsx';
import Stats from './components/Stats.jsx';
import Crate from './components/Crate.jsx';
import { Countdown } from './components/Results.jsx';
import { requestBoardFocus } from './components/Puzzle.jsx';
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
import { DAILY_GUESSES, LAUNCH_UTC } from '../api/_songs.js';

type Mode = 'daily' | 'practice';
type Sheet = 'help' | 'stats' | 'crate' | null;

const todayNumber = () =>
  Math.max(0, Math.floor((Date.now() - LAUNCH_UTC) / 86400000));

export default function App() {
  const [mode, setMode] = useState<Mode>('daily');
  const [prefs, setPrefsState] = useState(getPrefs);
  const [sheet, setSheet] = useState<Sheet>(() =>
    getPrefs().seenHelp ? null : 'help'
  );
  const streak = liveStreak(todayNumber());
  const obs = useObservance();

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

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to puzzle
      </a>

      <header className="site-header">
        <Logo obs={obs} />
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

      {obs && (
        <aside className="obs-banner" aria-label="Theme">
          <span className="obs-flag" aria-hidden="true" />
          <span>{obs.label}</span>
          {obs.href && (
            <a href={obs.href} target="_blank" rel="noopener noreferrer">
              Learn more
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          )}
        </aside>
      )}

      <nav className="modes" aria-label="Game mode">
        <button
          type="button"
          className={mode === 'daily' ? 'is-on' : ''}
          aria-pressed={mode === 'daily'}
          onClick={() => setMode('daily')}
        >
          Daily
        </button>
        <button
          type="button"
          className={mode === 'practice' ? 'is-on' : ''}
          aria-pressed={mode === 'practice'}
          onClick={() => setMode('practice')}
        >
          Practice
        </button>
      </nav>

      <main id="main">
        {mode === 'daily' ? (
          <DailyGame
            onPractice={() => {
              requestBoardFocus();
              setMode('practice');
            }}
            sfx={prefs.sfx}
            volume={prefs.muted ? 0 : prefs.volume}
            paused={sheet != null}
          />
        ) : (
          <PracticeGame
            onDaily={() => {
              requestBoardFocus();
              setMode('daily');
            }}
            sfx={prefs.sfx}
            volume={prefs.muted ? 0 : prefs.volume}
            paused={sheet != null}
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
      {sheet === 'crate' && (
        <Crate onClose={closeSheet} volume={prefs.muted ? 0 : prefs.volume} />
      )}
      {sheet === 'stats' && (
        <Modal title="Your stats" onClose={closeSheet}>
          <Stats
            puzzleNumber={todayNumber()}
            maxGuesses={DAILY_GUESSES}
            today={getProgress(todayNumber())}
          />
          <Countdown puzzleNumber={todayNumber()} />
        </Modal>
      )}
    </div>
  );
}

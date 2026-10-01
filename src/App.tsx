import { useState } from 'react';
import DailyGame from './components/DailyGame.jsx';
import PracticeGame from './components/PracticeGame.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import HowToPlay from './components/HowToPlay.jsx';
import Modal from './components/Modal.jsx';
import Stats from './components/Stats.jsx';
import Crate from './components/Crate.jsx';
import { Countdown } from './components/Results.jsx';
import Icon from './components/Icon.jsx';
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

  function closeSheet() {
    if (sheet === 'help' && !prefs.seenHelp) {
      setPrefsState(setPrefs({ seenHelp: true }));
    }
    setSheet(null);
  }

  function toggleSfx() {
    setPrefsState(setPrefs({ sfx: !prefs.sfx }));
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to puzzle
      </a>

      <header className="site-header">
        <h1 className="wordmark" aria-label="Spliced">
          SPLI
          <span className="wordmark-cut" aria-hidden="true">
            |
          </span>
          CED
        </h1>
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
            aria-label={`Stats${streak ? ` — ${streak}-day streak` : ''}`}
            title="Stats"
          >
            <Icon name="chart" />
            {streak > 0 && (
              <span className="streak-badge" aria-hidden="true">
                🔥{streak}
              </span>
            )}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={toggleSfx}
            aria-pressed={prefs.sfx}
            aria-label="Sound effects"
            title={prefs.sfx ? 'Sound effects on' : 'Sound effects off'}
          >
            <Icon name={prefs.sfx ? 'volume' : 'mute'} />
          </button>
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

      <nav className="modes" aria-label="Game mode">
        <button
          type="button"
          className={mode === 'daily' ? 'is-on' : ''}
          aria-current={mode === 'daily' ? 'page' : undefined}
          onClick={() => setMode('daily')}
        >
          Daily
        </button>
        <button
          type="button"
          className={mode === 'practice' ? 'is-on' : ''}
          aria-current={mode === 'practice' ? 'page' : undefined}
          onClick={() => setMode('practice')}
        >
          Practice
        </button>
      </nav>

      <main id="main">
        {mode === 'daily' ? (
          <DailyGame
            onPractice={() => setMode('practice')}
            sfx={prefs.sfx}
            paused={sheet != null}
          />
        ) : (
          <PracticeGame
            onDaily={() => setMode('daily')}
            sfx={prefs.sfx}
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
      {sheet === 'crate' && <Crate onClose={closeSheet} />}
      {sheet === 'stats' && (
        <Modal title="Your stats" onClose={closeSheet}>
          <Stats
            puzzleNumber={todayNumber()}
            maxGuesses={DAILY_GUESSES}
            today={getProgress(todayNumber())}
          />
          <Countdown />
        </Modal>
      )}
    </div>
  );
}

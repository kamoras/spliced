import { useState } from 'react';
import DailyGame from './components/DailyGame.jsx';
import PracticeGame from './components/PracticeGame.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import HowToPlay from './components/HowToPlay.jsx';
import Icon from './components/Icon.jsx';

export default function App() {
  const [mode, setMode] = useState('daily'); // daily | practice
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to puzzle
      </a>

      <header className="site-header">
        <div className="brand">
          <h1 className="wordmark" aria-label="Spliced">
            SPLI
            <span className="wordmark-cut" aria-hidden="true">
              |
            </span>
            CED
          </h1>
          <span className="brand-sub">Daily music puzzle</span>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setShowHelp(true)}
            aria-label="How to play"
          >
            <Icon name="help" />
          </button>
          <ThemeToggle />
        </div>
      </header>

      <main id="main">
        <p className="tagline">
          Four mystery songs are split into mixer clips. Route each row into one
          complete track and lock the songs by ear.
        </p>
        {mode === 'daily' ? (
          <DailyGame onPractice={() => setMode('practice')} />
        ) : (
          <PracticeGame onDaily={() => setMode('daily')} />
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

      {showHelp && <HowToPlay onClose={() => setShowHelp(false)} />}
    </div>
  );
}

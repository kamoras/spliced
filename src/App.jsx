import { useState } from 'react';
import DailyGame from './components/DailyGame.jsx';
import PracticeGame from './components/PracticeGame.jsx';

export default function App() {
  const [mode, setMode] = useState('daily'); // daily | practice

  return (
    <div className="app">
      <header className="header">
        <h1 className="logo">
          SPLI<span className="logo-cut">|</span>CED
        </h1>
        <p className="tagline">
          Today’s mystery clip got chopped up and shuffled. Drag the pieces back
          into order and rebuild the song — by ear.
        </p>
      </header>

      {mode === 'daily' ? (
        <DailyGame onPractice={() => setMode('practice')} />
      ) : (
        <PracticeGame onDaily={() => setMode('daily')} />
      )}

      <footer className="footer">
        Previews via the iTunes Search API · a daily warm-up puzzle
      </footer>
    </div>
  );
}

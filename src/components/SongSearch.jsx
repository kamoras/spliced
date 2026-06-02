// Search box + results grid backed by the /api/search proxy.

import { useEffect, useRef, useState } from 'react';

export default function SongSearch({ onPick, disabled }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | loading | error | done
  const debounceRef = useRef(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    const q = term.trim();
    if (!q) {
      setResults([]);
      setStatus('idle');
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const myId = ++reqIdRef.current;
      setStatus('loading');
      try {
        const r = await fetch(`/api/search?term=${encodeURIComponent(q)}`);
        const data = await r.json();
        if (myId !== reqIdRef.current) return; // a newer search superseded us
        setResults(data.results || []);
        setStatus('done');
      } catch {
        if (myId !== reqIdRef.current) return;
        setStatus('error');
      }
    }, 350);

    return () => clearTimeout(debounceRef.current);
  }, [term]);

  return (
    <div className="search">
      <input
        className="search-input"
        type="search"
        placeholder="Search a song or artist…"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        autoFocus
      />

      {status === 'loading' && <p className="muted">Searching…</p>}
      {status === 'error' && (
        <p className="error">Couldn’t reach the music search. Try again.</p>
      )}
      {status === 'done' && results.length === 0 && (
        <p className="muted">No previews found for “{term}”.</p>
      )}

      <ul className="results">
        {results.map((song) => (
          <li key={song.id}>
            <button
              className="result"
              disabled={disabled}
              onClick={() => onPick(song)}
            >
              {song.artwork ? (
                <img src={song.artwork} alt="" className="art" />
              ) : (
                <div className="art art-placeholder">♪</div>
              )}
              <span className="result-text">
                <span className="result-title">{song.title}</span>
                <span className="result-artist">{song.artist}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

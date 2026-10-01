// The Record Crate: every song you've uncovered, as a wall of sleeves. Tap a
// sleeve to hear its preview and find it on your streaming service.

import { useEffect, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import ListenLinks from './ListenLinks.jsx';
import { getCrate } from '../daily/storage.js';
import type { CrateEntry } from '../daily/storage.js';

export default function Crate({ onClose }: { onClose: () => void }) {
  const [crate] = useState<CrateEntry[]>(() => getCrate());
  const [open, setOpen] = useState<number | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => audioRef.current?.pause(), []);

  function toggle(i: number, url?: string) {
    const audio = audioRef.current;
    if (!audio || !url) return;
    if (playing === i) {
      audio.pause();
      setPlaying(null);
      return;
    }
    audio.src = url;
    audio.currentTime = 0;
    audio.play().then(
      () => setPlaying(i),
      () => setPlaying(null)
    );
  }

  const solved = crate.filter((e) => e.solved).length;
  const named = crate.filter((e) => e.named).length;
  const entry = open != null ? crate[open] : null;

  return (
    <Modal title="Record crate" onClose={onClose} className="crate">
      {/* Short previews only; no captions exist for them. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} onEnded={() => setPlaying(null)} preload="none" />
      {crate.length === 0 ? (
        <p className="muted">
          Every song you uncover lands here. Finish a puzzle to start your
          collection!
        </p>
      ) : (
        <>
          <p className="crate-count">
            <strong>{crate.length}</strong> songs · {solved} spliced · {named}{' '}
            named 🎵
          </p>
          {entry && (
            <div className="crate-detail">
              <button
                type="button"
                className="btn"
                onClick={() => toggle(open!, entry.previewUrl)}
                disabled={!entry.previewUrl}
              >
                <Icon name={playing === open ? 'stop' : 'play'} />
                {playing === open ? 'Stop' : 'Preview'}
              </button>
              <div className="crate-detail-meta">
                <strong>{entry.title}</strong>
                <span>
                  {entry.artist}
                  {entry.puzzle != null && !entry.practice
                    ? ` · Daily #${entry.puzzle}`
                    : ' · Practice'}
                </span>
                <ListenLinks
                  title={entry.title}
                  artist={entry.artist}
                  compact
                />
              </div>
            </div>
          )}
          <ul className="crate-grid">
            {crate.map((e, i) => (
              <li key={`${e.title}|${e.artist}`}>
                <button
                  type="button"
                  className={[
                    'sleeve',
                    !e.solved && 'is-missed',
                    open === i && 'is-open',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setOpen(open === i ? null : i)}
                  aria-label={`${e.title} by ${e.artist}${e.solved ? '' : ' (missed)'}${e.named ? ', named' : ''}`}
                  aria-expanded={open === i}
                >
                  {e.artwork ? (
                    <img src={e.artwork} alt="" loading="lazy" />
                  ) : (
                    <span className="sleeve-blank">♪</span>
                  )}
                  {e.named && (
                    <span className="sleeve-star" aria-hidden="true">
                      🎵
                    </span>
                  )}
                  {!e.solved && (
                    <span className="sleeve-sticker" aria-hidden="true">
                      missed
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

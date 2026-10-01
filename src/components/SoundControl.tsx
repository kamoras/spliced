// Header sound menu: one tap opens it; inside are a real mute (silences
// everything), the volume slider, and a sound-effects toggle.

import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import type { Prefs } from '../daily/storage.js';

interface SoundControlProps {
  prefs: Prefs;
  onChange: (patch: Partial<Prefs>) => void;
}

export default function SoundControl({ prefs, onChange }: SoundControlProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const silent = prefs.muted || prefs.volume === 0;
  const percent = Math.round(prefs.volume * 100);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="sound" ref={rootRef}>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="sound-panel"
        aria-label={`Sound${silent ? ' (muted)' : ''}`}
        title="Sound"
      >
        <Icon name={silent ? 'mute' : 'volume'} />
      </button>
      {open && (
        <div
          className="sound-panel"
          id="sound-panel"
          role="group"
          aria-label="Sound"
        >
          <button
            type="button"
            className={`btn sound-mute${prefs.muted ? ' is-on' : ''}`}
            aria-pressed={prefs.muted}
            aria-label="Mute all"
            onClick={() => onChange({ muted: !prefs.muted })}
          >
            <Icon name={prefs.muted ? 'mute' : 'volume'} />
            {prefs.muted ? 'Muted (tap to unmute)' : 'Mute all'}
          </button>
          <label className="sound-row">
            <span>Volume</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={prefs.volume}
              aria-valuetext={`${percent}%`}
              onChange={(e) =>
                onChange({ volume: Number(e.target.value), muted: false })
              }
            />
            <span className="sound-value">{percent}%</span>
          </label>
          <label className="sound-row sound-check">
            <input
              type="checkbox"
              checked={prefs.sfx}
              onChange={(e) => onChange({ sfx: e.target.checked })}
            />
            <span>Sound effects</span>
          </label>
        </div>
      )}
    </div>
  );
}

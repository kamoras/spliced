import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';

export default function HowToPlay({ onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-layer">
      <button
        type="button"
        className="modal-backdrop"
        aria-label="Close how to play"
        onClick={onClose}
      />
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="howto-title"
      >
        <div className="modal-head">
          <h2 id="howto-title">How to play</h2>
          <button
            ref={closeRef}
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
        </div>
        <ol>
          <li>
            The first slice is fixed as the starting anchor for today’s mystery
            clip.
          </li>
          <li>
            Drag the movable tiles to reorder them — or focus a tile’s handle
            and use the arrow keys.
          </li>
          <li>
            Press <strong>Play</strong> to hear your current mix, or use a Join
            button under a tile to check its transition into the next clip.
          </li>
          <li>
            Press <strong>Submit guess</strong> to score the current order and
            see which positions were right.
          </li>
          <li>
            You get three guesses. Your score rewards fewer guesses, plays, and
            join checks.
          </li>
        </ol>
      </div>
    </div>
  );
}

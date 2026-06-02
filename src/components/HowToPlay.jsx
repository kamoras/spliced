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
            The first slice is locked as the start of today’s mystery clip.
          </li>
          <li>
            Drag the movable tiles to reorder them — or focus a tile’s handle
            and use the arrow keys.
          </li>
          <li>
            Press <strong>Play</strong> to hear the starting order or your
            latest submitted guess in full.
          </li>
          <li>
            Press <strong>Submit guess</strong> to lock in the current order,
            hear it played back, and see which positions were right.
          </li>
          <li>
            You get a limited number of guesses — solve it before they run out
            to reveal the song and share your result.
          </li>
        </ol>
      </div>
    </div>
  );
}

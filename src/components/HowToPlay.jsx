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
          <li>Four mystery songs are mixed together as sixteen clip tiles.</li>
          <li>
            Play any clip, or play a whole row, then drag clips between mixer
            tracks until each row sounds like one song.
          </li>
          <li>
            Pick the row you want to check with the switchboard button, then
            submit the armed track.
          </li>
          <li>
            The first clip in the submitted row sets the song being checked.
            Green means correct song and slot; yellow means correct song in the
            wrong slot; uncolored clips belong with another song.
          </li>
          <li>
            Correct rows lock in place. Wrong submissions use one mistake; you
            have four mistakes before the tracks are revealed.
          </li>
        </ol>
      </div>
    </div>
  );
}

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
          <li>Four mystery songs are sliced into clips and mixed together.</li>
          <li>
            Play a clip to hear it — click along its waveform to start from any
            point — then drag clips between tracks until each row is one song in
            order.
          </li>
          <li>
            Each track has a Submit button that plays that row and checks it.
          </li>
          <li>
            The first clip in a checked row sets the song. Green means correct
            song and slot; yellow means correct song in the wrong slot;
            uncolored clips belong with another song.
          </li>
          <li>
            Correct rows lock in place. A wrong check uses one mistake; you have
            four mistakes before the tracks are revealed.
          </li>
        </ol>
      </div>
    </div>
  );
}

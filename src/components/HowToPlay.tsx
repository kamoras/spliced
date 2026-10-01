// Three illustrated steps (pure CSS mini-tiles), shown automatically on a
// first visit and from the header "?" any time.

import Modal from './Modal.jsx';
import Icon from './Icon.jsx';

function Mini({
  letter,
  mark,
  cued,
}: {
  letter: string;
  mark?: 'correct' | 'misplaced';
  cued?: boolean;
}) {
  return (
    <span
      className={['mini', mark && `mark-${mark}`, cued && 'is-cued']
        .filter(Boolean)
        .join(' ')}
    >
      <b>{letter}</b>
      {mark && (
        <i className={`tile-badge tile-badge--${mark}`}>
          <Icon name={mark === 'correct' ? 'check' : 'shuffle'} />
        </i>
      )}
    </span>
  );
}

export default function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How to play" onClose={onClose} className="howto">
      <p className="howto-lede">
        Four mystery songs were cut into clips and shuffled together. Rebuild
        every song — one per track, in order.
      </p>
      <ol className="howto-steps">
        <li>
          <div className="howto-art">
            <Mini letter="F" cued />
            <Mini letter="B" />
            <span className="howto-swap" aria-hidden="true">
              <Icon name="swap" />
            </span>
          </div>
          <div>
            <strong>Tap a clip to hear it.</strong> Then tap{' '}
            <Icon name="swap" /> on another clip to swap the two — or just drag
            one onto the other.
          </div>
        </li>
        <li>
          <div className="howto-art">
            <Mini letter="K" />
            <span className="howto-seam" aria-hidden="true" />
            <Mini letter="C" />
          </div>
          <div>
            <strong>Listen for the seams.</strong> Clips were cut back-to-back,
            so the right neighbours flow seamlessly. Tap the ⌇ between two clips
            to hear their join, or ▶ Play to hear the whole track — free.
          </div>
        </li>
        <li>
          <div className="howto-art">
            <Mini letter="A" mark="correct" />
            <Mini letter="H" mark="misplaced" />
            <Mini letter="M" />
          </div>
          <div>
            <strong>Lock in a track.</strong> <Icon name="check" /> right song,
            right slot · <Icon name="shuffle" /> right song, wrong slot · blank:
            another song. A wrong lock-in costs one of <b>4 mistakes</b>.
          </div>
        </li>
      </ol>
      <p className="howto-bonus">
        🎵 Name each song you lock for a bonus, then share your mix — friends
        who open your link race your ghost.
      </p>
      <button
        type="button"
        className="btn btn--primary btn--wide"
        onClick={onClose}
      >
        Let’s play
      </button>
    </Modal>
  );
}

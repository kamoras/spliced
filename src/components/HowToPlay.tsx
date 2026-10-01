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
        Three mystery songs were cut into clips and shuffled across the mixing
        desk. Each channel belongs to one song, and its tape shows the year it
        came out. Rebuild every song on its channel, in order.
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
            <Icon name="swap" /> on another clip to swap the two, or just drag
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
            so the right neighbours flow seamlessly. Turn the knob between two
            clips to hear their join, or press PLAY to hear the whole channel.
            Replays are always free.
          </div>
        </li>
        <li>
          <div className="howto-art">
            <Mini letter="A" mark="correct" />
            <Mini letter="H" mark="misplaced" />
            <Mini letter="M" />
          </div>
          <div>
            <strong>LOCK a channel.</strong> <Icon name="check" /> right song,
            right slot · <Icon name="shuffle" /> right song, wrong slot · blank:
            another song. A wrong lock-in lights one of <b>4 PEAK lamps</b>;
            light them all and the tape jams.
          </div>
        </li>
      </ol>
      <p className="howto-bonus">
        Tap two year tapes to swap those channels. Fewer <b>takes</b> (new seams
        and plays you try, plus lock-ins) beats par. 🎵 Name each song you lock
        for a bonus, then share your mix. Friends who open your link race your
        ghost.
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

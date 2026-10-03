// Three illustrated steps (pure CSS mini-tiles), shown automatically on a
// first visit and from the header "?" any time. Kept short: the board's own
// coach line teaches the rest as you go.

import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import { HARD_GUESSES } from '../../shared/game.js';

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
        Three mystery songs were cut into clips and shuffled across the desk.
        Each channel is one song, its tape shows the year it came out. Put every
        song back together on its channel, in order.
      </p>
      <ol className="howto-steps">
        <li>
          <div className="howto-art" aria-hidden="true">
            <Mini letter="F" cued />
            <Mini letter="B" />
            <span className="howto-swap" aria-hidden="true">
              <Icon name="swap" />
            </span>
          </div>
          <div>
            <strong>Tap a clip to hear it.</strong> Tap <Icon name="swap" />
            <span className="visually-hidden">the swap button</span> on another
            clip to swap the two, or drag one onto the other.
          </div>
        </li>
        <li>
          <div className="howto-art" aria-hidden="true">
            <Mini letter="K" />
            <span className="howto-seam" aria-hidden="true" />
            <Mini letter="C" />
          </div>
          <div>
            <strong>Listen for the seams.</strong> Clips were cut back-to-back,
            so the right neighbours flow into each other. Turn the knob between
            two clips to hear their join. Listening is always free.
          </div>
        </li>
        <li>
          <div className="howto-art" aria-hidden="true">
            <Mini letter="A" mark="correct" />
            <Mini letter="H" mark="misplaced" />
            <Mini letter="M" />
          </div>
          <div>
            <strong>LOCK rolls the tape.</strong> The channel plays through,
            then it grades. Hear a bad join? Press STOP before the end and
            nothing is charged. A wrong lock lights a PEAK lamp; four lamps and
            the tape jams.
          </div>
        </li>
      </ol>
      <details className="howto-more">
        <summary>More rules</summary>
        <ul>
          <li>
            <Icon name="check" />
            <span className="visually-hidden">Check mark:</span> right song,
            right slot · <Icon name="shuffle" />
            <span className="visually-hidden">Shuffle mark:</span> right song,
            wrong slot · blank: another song.
          </li>
          <li>
            Lock a whole song on the wrong year and it slides home for free. Tap
            two year tapes to swap those channels.
          </li>
          <li>
            🎵 Name each song you lock for a bonus. Share your mix and friends
            who open your link race your ghost.
          </li>
          <li>
            Fewest mistakes wins. Sharp ears can also chase fewer <b>listens</b>{' '}
            (the 🎧 count on the display).
          </li>
          <li>
            <b>Hard mode</b> (in the sound menu) allows {HARD_GUESSES} mistakes.
            Past days are in the archive, under your stats.
          </li>
        </ul>
      </details>
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

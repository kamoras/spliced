// Three illustrated steps (pure CSS mini-tiles), shown automatically on a
// first visit and from the header "?" any time. Kept short: the board's own
// coach line teaches the rest as you go.

import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import { HARD_GUESSES } from '../../shared/game.js';

function Mini({ letter, cued }: { letter: string; cued?: boolean }) {
  return (
    <span className={['mini', cued && 'is-cued'].filter(Boolean).join(' ')}>
      <b>{letter}</b>
    </span>
  );
}

export default function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How to play" onClose={onClose} className="howto">
      <p className="howto-lede">
        Three mystery songs were cut into clips and shuffled across the desk.
        Each channel is one song, its tape shows the year it came out. Splice
        every song back together, join by join.
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
            clip to swap the two, or drag one onto the other, until clips that
            belong together sit side by side.
          </div>
        </li>
        <li>
          <div className="howto-art" aria-hidden="true">
            <Mini letter="K" />
            <span className="howto-seam" aria-hidden="true" />
            <Mini letter="C" />
          </div>
          <div>
            <strong>Turn the knob between two clips to hear their join.</strong>{' '}
            Clips were cut back-to-back, so true neighbours flow into each
            other. Listening is always free.
          </div>
        </li>
        <li>
          <div className="howto-art" aria-hidden="true">
            <Mini letter="K" />
            <span className="howto-splice" aria-hidden="true">
              Splice
            </span>
            <Mini letter="C" />
          </div>
          <div>
            <strong>Sounds right? Press SPLICE.</strong> A true join tapes the
            clips together; a wrong one lights a PEAK lamp. Light them all and
            the tape jams. Four clips spliced is a whole song: it locks onto its
            year (the year is a hint, not a test). Three clips are song endings:
            nothing follows them.
          </div>
        </li>
      </ol>
      <details className="howto-more">
        <summary>More rules</summary>
        <ul>
          <li>
            The year and genre on each tape help you group clips. Finish a song
            on the wrong year and it slides home for free. Tap two year tapes to
            swap those channels.
          </li>
          <li>
            🎵 Name each song you finish for a bonus. Share your mix and friends
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

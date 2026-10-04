// Keep the Record Crate in step with a finished game: as each song's title
// arrives, it lands in the crate with whether it was found and named.
// Idempotent, so it can run on every change.

import { useEffect } from 'react';
import { addToCrate } from '../daily/storage.js';
import { namedCount } from '../game/engine.js';
import type { GameState } from '../game/engine.js';
import type { Song, Track } from '../types.js';

export function useCrateSync({
  tracks,
  state,
  answers,
  puzzle,
  practice = false,
  enabled = true,
}: {
  tracks: Track[] | null;
  state: GameState | null;
  answers: Record<string, Song>;
  puzzle?: number;
  practice?: boolean;
  enabled?: boolean;
}) {
  const finished = enabled && state != null && state.status !== 'playing';
  const named = state ? namedCount(state) : 0;
  const known = Object.keys(answers).length;
  useEffect(() => {
    if (!finished || !tracks || !state) return;
    const entries = tracks
      .filter(
        (t) => answers[t.id] && (!practice || state.solved.includes(t.id))
      )
      .map((t) => ({
        title: answers[t.id].title,
        artist: answers[t.id].artist,
        artwork: answers[t.id].artwork,
        previewUrl: t.previewUrl,
        puzzle,
        solved: state.solved.includes(t.id),
        named: Boolean(state.named?.[t.id]),
        practice,
      }));
    if (entries.length) addToCrate(entries);
    // Re-run when the game finishes, a title arrives, or a song gets named.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, known, named, tracks, puzzle, practice]);
}

// Client side of /api/reveal: a row's quiz choices and its answer are fetched
// only when the game is ready to show them. Successful lookups are shared
// (and never change for a given ref); failures can be retried.

import type { Song } from '../types.js';

export interface Choice {
  title: string;
  artist: string;
}

const cache = new Map<string, Promise<unknown>>();

function get<T>(ref: string, part: 'choices' | 'answer'): Promise<T> {
  const key = `${part}:${ref}`;
  let p = cache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = fetch(`/api/reveal?ref=${encodeURIComponent(ref)}&part=${part}`).then(
      (r) => {
        if (!r.ok) throw new Error(`reveal ${r.status}`);
        return r.json() as Promise<T>;
      }
    );
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

export async function fetchChoices(ref: string): Promise<Choice[]> {
  const { choices } = await get<{ choices: Choice[] }>(ref, 'choices');
  return Array.isArray(choices) ? choices : [];
}

export function fetchAnswer(ref: string): Promise<Song> {
  return get<Song>(ref, 'answer');
}

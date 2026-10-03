// Client side of /api/reveal: a row's quiz choices and its answer are fetched
// only when the game is ready to show them. Successful lookups are shared
// (and never change for a given ref); failures can be retried.

import type { Choice, Song } from '../types.js';

const cache = new Map<string, Promise<unknown>>();

// `order`: the row's clip ids, in order, as proof the row is solved.
function get<T>(
  ref: string,
  part: 'choices' | 'answer',
  order: string[]
): Promise<T> {
  const key = `${part}:${ref}`;
  let p = cache.get(key) as Promise<T> | undefined;
  if (!p) {
    const q = new URLSearchParams({ ref, part, order: order.join(',') });
    p = fetch(`/api/reveal?${q}`).then((r) => {
      if (!r.ok) throw new Error(`reveal ${r.status}`);
      return r.json() as Promise<T>;
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

export async function fetchChoices(
  ref: string,
  order: string[]
): Promise<Choice[]> {
  const { choices } = await get<{ choices: Choice[] }>(ref, 'choices', order);
  return Array.isArray(choices) ? choices : [];
}

export function fetchAnswer(ref: string, order: string[]): Promise<Song> {
  return get<Song>(ref, 'answer', order);
}

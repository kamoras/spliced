// How two catalog records count as the same song: the title stripped of
// "(feat. …)", "- 2011 Remaster" and the like, plus the artist. Used by the
// catalog build (dedupe) and the tests that check it.
//
// Files prefixed with "_" are NOT treated as routes by Vercel.

import { norm } from './daily.js';

export const baseTitle = (title?: string | null): string =>
  norm((title ?? '').replace(/\s*[([].*?[)\]]/g, '').replace(/\s+-\s+.*$/, ''));

export const dedupeKey = (song: { title?: string; artist?: string }): string =>
  `${baseTitle(song.title)}|${norm(song.artist)}`;

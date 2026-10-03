// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import dailyHandler, {
  CATALOG,
  practiceRef,
  selectDaily,
  sortTimeline,
} from './daily.js';
import handler, { resolveRef } from './reveal.js';
import {
  DAILY_CLIPS_PER_TRACK,
  DAILY_TRACKS,
  LAUNCH_UTC,
} from '../shared/game.js';
import { clipIds } from '../shared/clips.js';

const DAY = 86400000;

function call(h: typeof handler, url: string) {
  const res = {
    statusCode: 0,
    body: '',
    setHeader() {},
    end(b: string) {
      this.body = b;
    },
  };
  h({ url } as IncomingMessage, res as unknown as ServerResponse);
  return { status: res.statusCode, body: JSON.parse(res.body) };
}

afterEach(() => vi.useRealTimers());

describe('/api/reveal', () => {
  it('gives each daily row its choices, then its answer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(LAUNCH_UTC + 40 * DAY + 5000);
    const daily = call(dailyHandler, '/api/daily');
    const expected = sortTimeline(selectDaily(Date.now()).songs);
    const n = daily.body.puzzleNumber as number;
    const ids = clipIds(DAILY_TRACKS * DAILY_CLIPS_PER_TRACK, n);
    daily.body.tracks.forEach((t: { ref: string }, i: number) => {
      const order = ids
        .slice(i * DAILY_CLIPS_PER_TRACK, (i + 1) * DAILY_CLIPS_PER_TRACK)
        .join(',');
      // No proof of the row's order, no answer.
      expect(call(handler, `/api/reveal?ref=${t.ref}&part=answer`).status).toBe(
        403
      );
      const answer = call(
        handler,
        `/api/reveal?ref=${t.ref}&part=answer&order=${order}`
      );
      expect(answer.body).toMatchObject({
        title: expected[i].title,
        artist: expected[i].artist,
      });
      const { choices } = call(
        handler,
        `/api/reveal?ref=${t.ref}&part=choices&order=${order}`
      ).body;
      expect(choices).toHaveLength(4);
      expect(choices).toContainEqual({
        title: expected[i].title,
        artist: expected[i].artist,
      });
    });
  });

  it('keeps the daily response free of answers', () => {
    vi.useFakeTimers();
    vi.setSystemTime(LAUNCH_UTC + 40 * DAY);
    const text = JSON.stringify(call(dailyHandler, '/api/daily').body);
    selectDaily(Date.now()).songs.forEach((s) => {
      expect(text).not.toContain(JSON.stringify(s.title));
    });
  });

  it('refuses future dailies and junk', () => {
    const now = LAUNCH_UTC + 10 * DAY;
    expect(resolveRef('da.0', now)).not.toBeNull(); // #10 is today
    expect(resolveRef('db.0', now)).toBeNull(); // #11 is tomorrow
    expect(resolveRef('da.7', now)).toBeNull();
    expect(resolveRef('hello', now)).toBeNull();
    expect(call(handler, '/api/reveal?ref=d0.0&part=secrets').status).toBe(404);
  });

  it('resolves practice refs from catalog ids only', () => {
    const ids = CATALOG.slice(0, 3).map((s) => s.trackId);
    const row = resolveRef(practiceRef(ids, 42, 3, 1), Date.now());
    expect(row?.songs[row.idx].trackId).toBe(ids[1]);
    expect(row?.order).toEqual(clipIds(9, 42).slice(3, 6));
    expect(resolveRef(practiceRef([1, 2], 42, 4, 0), Date.now())).toBeNull();
  });
});

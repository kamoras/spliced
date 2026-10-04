// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import handler from './daily.js';

function call(url: string) {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 0,
    body: '',
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = v;
    },
    end(b: string) {
      this.body = b;
    },
  };
  handler({ url } as IncomingMessage, res as unknown as ServerResponse);
  return { status: res.statusCode, headers, body: JSON.parse(res.body) };
}

afterEach(() => vi.useRealTimers());

describe('GET /api/daily', () => {
  it('caches a dated request forever and an undated one until midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-03-10T23:59:30Z'));
    const dated = call('/api/daily?date=2026-03-10');
    expect(dated.status).toBe(200);
    expect(dated.headers['cache-control']).toContain('immutable');
    const today = call('/api/daily');
    expect(today.headers['cache-control']).toBe(
      'public, max-age=30, s-maxage=30'
    );
    expect(today.body.puzzleNumber).toBe(dated.body.puzzleNumber);
  });

  it('refuses future dates and bad dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-03-10T23:59:59Z'));
    expect(call('/api/daily?date=2026-03-11').status).toBe(404);
    expect(call('/api/daily?date=nope').status).toBe(400);
    // One spelling per day, so the CDN caches a day under one key.
    expect(call('/api/daily?date=2026-03-10T00:00:00Z').status).toBe(400);
    expect(call('/api/daily?date=Mar%2010%202026').status).toBe(400);
  });

  it('does not send a duplicate answers list', () => {
    expect(call('/api/daily').body.answers).toBeUndefined();
  });
});

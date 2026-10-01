// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import handler from './audio.js';
import catalog from './_catalog.json';

function call(url: string) {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = v;
    },
    end(b?: unknown) {
      this.body = b;
    },
  };
  return handler(
    { url } as IncomingMessage,
    res as unknown as ServerResponse
  ).then(() => ({ res, headers }));
}
const q = (u: string) => `/api/audio?url=${encodeURIComponent(u)}`;
const preview = catalog[0].previewUrl;

afterEach(() => vi.unstubAllGlobals());

describe('audio proxy', () => {
  it('only serves catalog previews', async () => {
    expect((await call('/api/audio')).res.statusCode).toBe(400);
    expect((await call(q('https://www.apple.com/'))).res.statusCode).toBe(403);
    expect(
      (await call(q('https://audio-ssl.itunes.apple.com/evil.m4a'))).res
        .statusCode
    ).toBe(403);
  });

  it('refuses non-audio and passes audio through with nosniff', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<script>', { headers: { 'content-type': 'text/html' } })
      )
    );
    expect((await call(q(preview))).res.statusCode).toBe(502);

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array([1, 2, 3]), {
            headers: { 'content-type': 'audio/mp4' },
          })
      )
    );
    const { res, headers } = await call(q(preview));
    expect(res.statusCode).toBe(200);
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['content-type']).toBe('audio/mp4');
  });
});

// Proxies an Apple preview clip so the browser can fetch + decode it.
//
// Web Audio's decodeAudioData requires the audio bytes to be readable by
// JS, which means the response must be CORS-enabled. Apple's preview hosts
// are inconsistent about this, so we re-serve the bytes from our own origin
// with permissive CORS headers.
//
// To avoid running an open proxy, only preview URLs that are in the pinned
// catalog are served (no redirects followed, audio only, size-capped).

import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CatalogEntry } from './_types.js';

const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

const ALLOWED = loadAllowed();
function loadAllowed(): Set<string> {
  try {
    const catalog = JSON.parse(
      readFileSync(new URL('./_catalog.json', import.meta.url), 'utf8')
    ) as CatalogEntry[];
    return new Set(catalog.map((c) => c.previewUrl));
  } catch (err) {
    console.error('audio: could not load _catalog.json', err);
    return new Set();
  }
}

function fail(res: ServerResponse, status: number, msg: string) {
  res.statusCode = status;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(msg);
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const target = url.searchParams.get('url');

  res.setHeader('access-control-allow-origin', '*');

  if (!target) return fail(res, 400, 'missing url parameter');
  if (!ALLOWED.has(target)) return fail(res, 403, 'not a catalog preview');

  try {
    const upstream = await fetch(target, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!upstream.ok) return fail(res, 502, 'upstream error');
    const type = upstream.headers.get('content-type') || 'audio/mp4';
    if (!/^audio\//i.test(type)) return fail(res, 502, 'not audio');
    const declared = Number(upstream.headers.get('content-length'));
    if (declared > MAX_BYTES) return fail(res, 502, 'too large');
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_BYTES) return fail(res, 502, 'too large');
    res.statusCode = 200;
    res.setHeader('content-type', type);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('content-length', String(buf.length));
    res.setHeader('cache-control', 'public, max-age=86400, s-maxage=604800');
    res.end(buf);
  } catch {
    fail(res, 502, 'fetch failed');
  }
}

// Proxies an Apple preview clip so the browser can fetch + decode it.
//
// Web Audio's decodeAudioData requires the audio bytes to be readable by
// JS, which means the response must be CORS-enabled. Apple's preview hosts
// are inconsistent about this, so we re-serve the bytes from our own origin
// with permissive CORS headers.
//
// To avoid running an open proxy, the target URL is restricted to Apple's
// media hosts over https.

const ALLOWED_HOST = /(^|\.)(mzstatic\.com|apple\.com)$/i;

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const target = url.searchParams.get('url');

  res.setHeader('access-control-allow-origin', '*');

  if (!target) {
    res.statusCode = 400;
    return res.end('missing url parameter');
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    res.statusCode = 400;
    return res.end('invalid url');
  }

  if (parsed.protocol !== 'https:' || !ALLOWED_HOST.test(parsed.hostname)) {
    res.statusCode = 403;
    return res.end('host not allowed');
  }

  try {
    const upstream = await fetch(target);
    if (!upstream.ok) {
      res.statusCode = 502;
      return res.end('upstream error');
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.statusCode = 200;
    res.setHeader('content-type', upstream.headers.get('content-type') || 'audio/mp4');
    res.setHeader('content-length', String(buf.length));
    res.setHeader('cache-control', 'public, max-age=86400');
    res.end(buf);
  } catch {
    res.statusCode = 502;
    res.end('fetch failed');
  }
}

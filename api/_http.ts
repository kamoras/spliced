// Tiny response helpers shared by the JSON API handlers. Written against raw
// Node req/res so the same code runs as a Vercel serverless function in
// production and as Connect middleware in `vite dev` (see vite.config.ts).
//
// Files prefixed with "_" are NOT treated as routes by Vercel.

import type { ServerResponse } from 'node:http';

// Send a JSON response with permissive CORS and an optional cache-control value.
export function json(
  res: ServerResponse,
  status: number,
  body: unknown,
  cache?: string
) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('access-control-allow-origin', '*');
  if (cache) res.setHeader('cache-control', cache);
  res.end(JSON.stringify(body));
}

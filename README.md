# 🎚️ Spliced

A **daily music puzzle** for stream warm-ups. Each day a short, *mystery* song
clip gets **chopped into equal pieces and shuffled** — you drag the pieces back
into the right order and rebuild the song by ear, without being told what it is.
Solve it and the answer is revealed.

Everyone gets the **same puzzle and the same scramble each day** (it flips at
UTC midnight), so it's shareable — perfect for kicking off a Twitch stream and
comparing with chat.

## How it works

1. `/api/daily` deterministically picks **today's song** from a curated list
   (by UTC date, identical for everyone) and resolves a free 30-second
   `previewUrl` from the public
   [iTunes Search API](https://performance-partners.apple.com/search-api)
   (no API key). The title stays hidden in the UI until you finish.
2. The preview is **decoded with the Web Audio API** and sliced into N equal
   pieces.
3. Pieces are **shuffled with a seed derived from the puzzle number**, so the
   scramble is identical for every player. Each tile has its own waveform
   thumbnail and a play button so you can audition it.
4. Drag to reorder, **Play arrangement** to hear your current order, then
   **Check**. Solve it and the reassembled clip plays, the song is revealed,
   and you can **share your result**. 🎉
5. Your result is saved locally, with a countdown to the next puzzle. A
   separate **Practice mode** lets you search any song and build a one-off
   puzzle (this naturally spoils the song, so it's kept apart from the daily).

### Adding / changing songs

The daily rotation lives in [`api/_songs.js`](./api/_songs.js) as a simple list
of `{ title, artist }`. The server resolves a fresh preview at request time, so
there are no track IDs or preview URLs to maintain. Use widely recognizable
songs so the top search result is reliably the real recording.

### Why the serverless proxies?

Three tiny functions live in [`api/`](./api):

- **`/api/daily`** – resolves today's mystery song and its preview.
- **`/api/search`** – proxies the iTunes Search API (used by Practice mode).
  That endpoint doesn't send reliable CORS headers, so calling it from the
  browser is flaky; the proxy makes it deterministic and trims the payload
  down to what the puzzle needs.
- **`/api/audio`** – re-serves an Apple preview clip with permissive CORS
  headers, because `decodeAudioData` requires the audio bytes to be
  cross-origin readable. The target URL is **locked to Apple's media hosts**
  so it can't be used as an open proxy.

The same handlers are mounted as Vite dev middleware (see
[`vite.config.js`](./vite.config.js)), so `npm run dev` gives you full
functionality without `vercel dev`.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
```

## Build

```bash
npm run build    # outputs to dist/
npm run preview  # serve the production build (note: /api functions need Vercel)
```

## Deploy (Vercel)

This is a zero-config Vercel project:

- Framework preset: **Vite** (auto-detected) → builds to `dist/`.
- The `api/` directory is deployed automatically as serverless functions.

Just import the repo in Vercel and deploy — no environment variables required.

## Notes

- Previews are 30 seconds, so even Hard pieces are ~3–4 seconds each — long
  enough to recognize.
- Audio playback requires a user gesture (clicking a song), which is when the
  `AudioContext` is unlocked.
- iTunes previews are intended for preview/discovery use. Keep it to
  warm-up-sized clips.

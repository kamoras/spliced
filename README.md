# Spliced

A **daily music puzzle** built like a tiny audio mixer. Each day, four mystery
songs are sampled into four non-adjacent clips each. Route the sixteen clips into
track rows, order each row by ear, and lock all four songs before you run out of
mistakes.

Everyone gets the **same puzzle, samples, and scramble each day** (it flips at
UTC midnight), so results are shareable.

<p align="center">
  <a href="https://github.com/kamoras/spliced/actions/workflows/ci.yml">
    <img alt="CI" src="https://github.com/kamoras/spliced/actions/workflows/ci.yml/badge.svg" />
  </a>
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg" />
  <img alt="Node >= 18" src="https://img.shields.io/badge/node-%3E%3D18-339933.svg" />
</p>

<p align="center">
  <img src="docs/screenshot-light.png" alt="Spliced in light mode" width="49%" />
  <img src="docs/screenshot-dark.png" alt="Spliced in dark mode" width="49%" />
</p>

## How to play

1. The board starts with **4 mixer tracks** and **16 shuffled clips**.
2. **Play any clip** or **play a whole row**, then drag clips between rows until
   each row sounds like one complete song.
3. Use the switchboard to arm the row you want to check, then press **Submit
   armed track**.
4. The first clip in the submitted row sets the song being checked. Green means
   correct song and slot; yellow means correct song in the wrong slot; uncolored
   clips belong with another song.
5. A correct row locks in place. A wrong row submission spends one mistake.
6. You have **4 mistakes** before the answer is revealed.

A separate **Practice mode** picks four random catalog songs and builds a
one-off mixer puzzle with the same rules as the daily.

## How it works

- **`/api/daily`** deterministically picks todays four songs by UTC date
  (identical for everyone) and resolves free 30-second previews from the public
  [iTunes Search API](https://performance-partners.apple.com/search-api) - no
  API key. Titles stay hidden in the UI until you finish.
- Each preview is decoded with the **Web Audio API** and sampled into four short
  clips with deliberate gaps between them, so the puzzle is about recognizing
  and ordering songs rather than brute-forcing adjacent seams.
- The daily puzzle uses the puzzle number as a seed for both clip sampling and
  the initial scramble, so every player gets the same board.
- Results share as a compact grid: green for correct slot, yellow for correct
  song in the wrong slot, and black for a clip from another song.

Three tiny serverless functions live in [`api/`](./api): `daily` (todays mystery
songs), `search` (Practice search proxy), and `audio` (re-serves an Apple
preview with permissive CORS so `decodeAudioData` can read it, locked to Apple
media hosts so it cannot be used as an open proxy). The same handlers are
mounted as Vite dev middleware (see [`vite.config.js`](./vite.config.js)), so
`npm run dev` gives full functionality without `vercel dev`.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run lint       # ESLint (incl. jsx-a11y accessibility rules)
npm test           # Vitest unit tests
npm run build      # production build -> dist/
npm run format     # Prettier
```

## Deploy (Vercel)

This is a zero-config Vercel project:

- Framework preset **Vite** (auto-detected) -> builds to `dist/`.
- The `api/` directory is deployed automatically as serverless functions.

Import the repo in Vercel and deploy. No environment variables are required.
Vercel also gives you a **preview deployment for every pull request** and
**production deploys from `main`** automatically.

## Accessibility

Spliced targets **WCAG 2.1 AA**:

- Full keyboard play, including reordering pieces via the keyboard (dnd-kit
  keyboard sensor) with screen-reader announcements.
- Tile correctness is shown with an **icon and a word**, never color alone.
- Visible focus styles, semantic landmarks, labelled controls, and an
  `aria-live` region for guess feedback.
- Light and dark themes with AA contrast, and `prefers-reduced-motion` support.

Accessibility is checked in review with [axe](https://github.com/dequelabs/axe-core)
and the `eslint-plugin-jsx-a11y` lint rules.

## Contributing

Issues and PRs are welcome - see [CONTRIBUTING.md](./CONTRIBUTING.md). The daily
song rotation lives in [`api/_songs.js`](./api/_songs.js); you can also open a
**Song suggestion** issue. Dependencies are kept current by Dependabot, with
patch/minor/security updates merged automatically once CI passes.

## License

[MIT](./LICENSE) © 2026 Ryan Mack. Previews are provided by the iTunes Search
API and are intended for preview/discovery use; keep clips warm-up-sized.

# Contributing to Spliced

Thanks for your interest in improving Spliced! This is a small, friendly
project — issues, fixes, and ideas are all welcome.

## Getting started

```bash
git clone https://github.com/kamoras/spliced.git
cd spliced
npm install
npm run dev      # http://localhost:5173
```

`npm run dev` runs the full app, including the `/api` functions (they're mounted
as Vite dev middleware — see `vite.config.js`), so no extra setup is needed.

## Before you open a pull request

Please make sure the checks that CI runs also pass locally:

```bash
npm run lint        # ESLint (incl. jsx-a11y accessibility rules)
npm test            # Vitest unit tests
npm run build       # production build
npm run format      # Prettier (auto-format)
```

CI runs `lint`, `test`, and `build` on Node 18 and 20 for every pull request.

## Guidelines

- **Keep accessibility intact.** This project targets WCAG 2.1 AA: keyboard
  operability, screen-reader labels, no color-only signals, and adequate
  contrast in both light and dark themes. The `jsx-a11y` lint rules and the
  axe checks in review help, but please test new UI with the keyboard.
- **Add tests** for new pure logic (see `src/audio/puzzle.js`, `api/daily.js`).
- Keep PRs focused and describe the change.

## Adding or changing songs

The daily rotation lives in [`api/_songs.js`](./api/_songs.js) as a simple list
of `{ title, artist }`. The server resolves a fresh preview from the iTunes
Search API at request time, so there are no track IDs or URLs to maintain. Pick
**widely recognizable** songs so the top search result is reliably the real
recording. You can also open a "Song suggestion" issue instead of a PR.

## Code of Conduct

By participating you agree to abide by our
[Code of Conduct](./CODE_OF_CONDUCT.md).

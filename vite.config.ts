/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import type { Connect, PluginOption } from 'vite';
import type { ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';
import searchHandler from './api/search.js';
import audioHandler from './api/audio.js';
import dailyHandler from './api/daily.js';

// In production these live as Vercel serverless functions under /api.
// Vite's dev server doesn't know about them, so we mount the same handlers
// as middleware here — giving `npm run dev` full search + audio without
// needing `vercel dev`.
function devApi(): PluginOption {
  return {
    name: 'spliced-dev-api',
    configureServer(server) {
      server.middlewares.use(
        (req: Connect.IncomingMessage, res: ServerResponse, next) => {
          const url = req.url ?? '';
          if (url.startsWith('/api/daily')) return dailyHandler(req, res);
          if (url.startsWith('/api/search')) return searchHandler(req, res);
          if (url.startsWith('/api/audio')) return audioHandler(req, res);
          next();
        }
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['**/*.test.{js,jsx,ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
  },
});

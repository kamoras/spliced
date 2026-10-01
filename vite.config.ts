/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import type { Connect, PluginOption } from 'vite';
import type { ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';
import practiceHandler from './api/practice.js';
import audioHandler from './api/audio.js';
import dailyHandler from './api/daily.js';
import revealHandler from './api/reveal.js';

// In production these live as Vercel serverless functions under /api.
// Vite's dev server doesn't know about them, so we mount the same handlers
// as middleware here — giving `npm run dev` full practice + audio without
// needing `vercel dev`.
function devApi(): PluginOption {
  return {
    name: 'spliced-dev-api',
    configureServer(server) {
      server.middlewares.use(
        (req: Connect.IncomingMessage, res: ServerResponse, next) => {
          const url = req.url ?? '';
          if (url.startsWith('/api/daily')) return dailyHandler(req, res);
          if (url.startsWith('/api/practice')) return practiceHandler(req, res);
          if (url.startsWith('/api/reveal')) return revealHandler(req, res);
          if (url.startsWith('/api/audio')) return audioHandler(req, res);
          next();
        }
      );
    },
  };
}

// The public site URL, for absolute links (canonical, og:image, sitemap).
// On Vercel the production domain is provided automatically; set SITE_URL to
// override (e.g. a custom domain). Without either, links stay root-relative.
function siteUrl(): string {
  const explicit = process.env.SITE_URL;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const url = (explicit || (vercel ? `https://${vercel}` : '')).replace(
    /\/+$/,
    ''
  );
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error('scheme');
  } catch {
    throw new Error(`SITE_URL must be an absolute http(s) URL, got "${url}"`);
  }
  return url;
}

// Fills %SITE_URL% in index.html and emits robots.txt + sitemap.xml.
function seo(): PluginOption {
  const url = siteUrl();
  return {
    name: 'spliced-seo',
    buildStart() {
      if (!url) {
        this.warn(
          'SITE_URL not set: og:image, twitter:image and JSON-LD will use relative URLs that link previews ignore.'
        );
      }
    },
    transformIndexHtml(html) {
      if (!url) {
        // No public URL: drop tags that need an absolute address rather than
        // emit relative ones that scrapers ignore.
        html = html
          .replace(/\s*<link rel="canonical"[^>]*>/, '')
          .replace(/\s*<meta property="og:url"[^>]*>/, '');
      }
      return html.replaceAll('%SITE_URL%', url);
    },
    generateBundle() {
      const robots = [
        'User-agent: *',
        'Allow: /',
        'Disallow: /api/',
        url ? `Sitemap: ${url}/sitemap.xml` : '',
      ]
        .filter(Boolean)
        .join('\n');
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `${robots}\n`,
      });
      if (!url) {
        this.warn(
          'SITE_URL not set: skipping sitemap.xml (needs absolute URLs).'
        );
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${url}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: sitemap,
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi(), seo()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['**/*.test.{js,jsx,ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
  },
});

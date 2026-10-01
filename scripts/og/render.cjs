// Renders the social share image (public/og.png, 1200×630) from og.html and
// the favicon PNG sizes from public/favicon.svg.
// Run: npm run build:art   (needs Playwright with Chromium available)
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.goto('file://' + path.join(__dirname, 'og.html'));
  await p.screenshot({ path: path.join(__dirname, '../../public/og.png') });
  await b.close();
  console.log('og.png written');
  require('./icons.cjs');
})();

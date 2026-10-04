// Renders public/favicon.svg to the PNG sizes browsers and home screens want.
// Run: node scripts/og/icons.cjs (needs Playwright + Chromium available).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const pub = path.join(__dirname, '../../public');
const svg = fs.readFileSync(path.join(pub, 'favicon.svg'), 'utf8');

(async () => {
  const b = await chromium.launch();
  const sizes = [
    ['favicon-32.png', 32, 0],
    ['apple-touch-icon.png', 180, 0],
    ['icon-192.png', 192, 0],
    ['icon-512.png', 512, 0],
    // Maskable: the mark inset into a safe zone on a full-bleed background.
    ['icon-maskable-512.png', 512, 0.14],
  ];
  for (const [name, size, pad] of sizes) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    const inset = Math.round(size * pad);
    await p.setContent(
      `<html><body style="margin:0;background:${pad ? '#1b1d20' : 'transparent'}">
       <div style="position:absolute;inset:${inset}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
       </body></html>`
    );
    await p.screenshot({ path: path.join(pub, name), omitBackground: !pad });
    await p.close();
  }
  await b.close();
  console.log('icons written');
})();

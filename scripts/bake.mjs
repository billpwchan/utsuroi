// Renders a downloaded model unlit (its scan already holds the light), orthographic and on transparent black:
// the source images for foliage stamps. usage: node scripts/bake.mjs <model> <top|front|side> <px> <out.png>
import { launch } from './browser.mjs';
import { writeFileSync } from 'node:fs';
const [m, dir = 'top', px = '2048', out, f = 'model.glb'] = process.argv.slice(2);
const browser = await launch();
try {
  const page = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`http://127.0.0.1:5195/scripts/bake.html?m=${m}&f=${f}&dir=${dir}&px=${px}`);
  await page.waitForFunction(() => window.__bake, null, { timeout: 120000 });
  const b = await page.evaluate(() => window.__bake);
  writeFileSync(out, Buffer.from(b.png.split(',')[1], 'base64'));
  writeFileSync(out.replace(/\.png$/, '_n.png'), Buffer.from(b.npng.split(',')[1], 'base64'));
  console.log('baked', m, dir, b.size.map((v) => v.toFixed(3)).join(' x '), 'half', b.half.toFixed(3));
} finally { await browser.close(); }

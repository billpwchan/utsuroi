// Builds the foliage atlases (scripts/twigs.html) from the scan renders in .cache/twig/v and encodes them to KTX2.
// usage: node scripts/twigs.mjs [species,...]   (dev server on 5195; renders from scripts/bake.mjs)
import { launch } from './browser.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ktx2File } from './ktx.mjs';

const only = process.argv[2] || '';
const OUT = new URL('../public/assets/foliage/', import.meta.url).pathname;
const TMP = new URL('../.cache/twig/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await launch();
let res;
try {
  const page = await (await browser.newContext({ viewport: { width: 400, height: 300 } })).newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`http://127.0.0.1:5195/scripts/twigs.html?only=${only}`);
  await page.waitForFunction(() => window.__twigs, null, { timeout: 600000, polling: 1000 });
  res = await page.evaluate(() => window.__twigs);
} finally { await browser.close(); }
for (const r of res) {
  const c = join(TMP, `${r.key}_atlas.png`), n = join(TMP, `${r.key}_atlas_n.png`);
  writeFileSync(c, Buffer.from(r.c.split(',')[1], 'base64'));
  writeFileSync(n, Buffer.from(r.nm.split(',')[1], 'base64'));
  const bc = await ktx2File(c, join(OUT, `${r.key}_c.ktx2`), { kind: 'c', size: r.size, alpha: true, codec: 'uastc', lambda: 8 });
  const bn = await ktx2File(n, join(OUT, `${r.key}_n.ktx2`), { kind: 'n', size: r.size / 2 });
  console.log(r.key, r.n, 'sprites', (bc / 1048576).toFixed(2), 'MB +', (bn / 1048576).toFixed(2), 'MB');
}

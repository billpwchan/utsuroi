// node scripts/lightmap/export.mjs [url]: load the dev page, run __ut.bakeExport(), write .cache/lm/scene.glb + meta.json
import { launch } from '../browser.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const url = process.argv[2] || 'http://127.0.0.1:5195/?skip&clean';
const out = join(process.cwd(), '.cache', 'lm');
mkdirSync(out, { recursive: true });
const browser = await launch(['--window-size=800,540'], { system: true });
try {
  const page = await (await browser.newContext({ viewport: { width: 800, height: 450 } })).newPage();
  page.on('console', (m) => { if (/\[ut\]|rror/.test(m.text())) console.log(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ut && window.__ut.bakeExport, null, { timeout: 120000 });
  await page.waitForTimeout(3000);
  const info = await page.evaluate(async () => {
    const { glb, meta } = await window.__ut.bakeExport();
    window.__lmGlb = new Uint8Array(glb);
    return { bytes: glb.byteLength, meta: JSON.stringify(meta) };
  });
  writeFileSync(join(out, 'meta.json'), info.meta);
  const parts = [];
  const CH = 8 << 20;
  for (let o = 0; o < info.bytes; o += CH) {
    const b64 = await page.evaluate(([o, CH]) => {
      const a = window.__lmGlb.subarray(o, o + CH);
      let s = '';
      for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
      return btoa(s);
    }, [o, CH]);
    parts.push(Buffer.from(b64, 'base64'));
  }
  writeFileSync(join(out, 'scene.glb'), Buffer.concat(parts));
  const meta = JSON.parse(info.meta);
  console.log('glb', (info.bytes / 1048576).toFixed(1), 'MB; receivers', meta.receivers.length, 'occluders', meta.occluders.length, 'lamps', meta.lamps.length);
  console.log(meta.occluders.map((o) => `${o.name}:${o.tris}`).join(' '));
} finally { await browser.close(); }

// Quick headed screenshots for iteration.
// usage: node scripts/shot.mjs '{"url":"...","w":1600,"h":900,"dpr":1,"wait":4,"shots":[{"eval":"js","sleep":1,"name":"a.png"}]}'
import { launch } from './browser.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const cfg = JSON.parse(process.argv[2] || '{}');
const out = cfg.out || join(process.cwd(), '.cache', 'shots');
mkdirSync(out, { recursive: true });
// chrome: the installed stable Chrome on a throwaway profile, out of reach of a `pkill -f "Google Chrome for Testing"` elsewhere
const browser = await launch(['--enable-gpu-rasterization', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--window-size=${cfg.w || 1600},${(cfg.h || 900) + 90}`], { system: !!cfg.chrome });
const ctx = await browser.newContext({ viewport: { width: cfg.w || 1600, height: cfg.h || 900 }, deviceScaleFactor: cfg.dpr || 1 });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { const t = m.text(); if (/\[ut\]|rror|warn|WARN|GL_|INVALID/i.test(t)) logs.push(`${m.type()}: ${t}`.slice(0, 600)); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
// init: a script run in the page before its own (e.g. to wrap the GL context)
if (cfg.init) await page.addInitScript(cfg.init);
try {
await page.goto(cfg.url || 'http://127.0.0.1:5195/', { waitUntil: 'load' });
try { await page.waitForFunction(() => window.__ut, null, { timeout: 60000 }); } catch (e) { logs.push('no __ut'); }
await page.waitForTimeout((cfg.wait ?? 4) * 1000);
for (const s of cfg.shots || [{ name: 'shot.png' }]) {
  if (s.eval) {
    try {
      const r = await page.evaluate(s.eval);
      // {"save": "name.png"} writes an eval that returned a data URL
      if (s.save && typeof r === 'string') writeFileSync(join(out, s.save), Buffer.from(r.split(',')[1], 'base64'));
      else if (r !== undefined) logs.push('eval: ' + JSON.stringify(r).slice(0, s.full ? 100000 : 800));
    } catch (e) { logs.push('evalerr: ' + e.message); }
  }
  if (s.sleep) await page.waitForTimeout(s.sleep * 1000);
  if (s.name) await page.screenshot({ path: join(out, s.name) });
}
console.log(logs.slice(process.env.ALLLOGS ? 0 : -30).join('\n'));
} finally {
  await browser.close();
}

// Headed frame-time measurement at the real display setup (1920x1080 @2x by default).
// usage: node scripts/perf.mjs '<json>'
//   { "url": "...", "w": 1920, "h": 1080, "dpr": 2, "wait": 8,
//     "steps": [ { "eval": "js", "measure": 4, "scroll": [from, to, seconds], "shot": "name.png", "sleep": 2, "label": "" } ] }
// scroll moves the page from one stop to another (in stops) at a steady pace while measuring, the way a wheel does.
import { launch } from './browser.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const cfg = JSON.parse(process.argv[2] || '{}');
const out = cfg.out || join(process.cwd(), '.cache', 'shots');
mkdirSync(out, { recursive: true });
const browser = await launch(['--enable-gpu-rasterization', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--window-size=${cfg.w || 1920},${(cfg.h || 1080) + 90}`]);
try {
  const ctx = await browser.newContext({ viewport: { width: cfg.w || 1920, height: cfg.h || 1080 }, deviceScaleFactor: cfg.dpr || 2 });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { const t = m.text(); if (/rror|WARN|warn/.test(t)) logs.push(`${m.type()}: ${t}`.slice(0, 400)); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.goto(cfg.url || 'http://127.0.0.1:5195/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ut, null, { timeout: 120000 });
  await page.waitForTimeout((cfg.wait ?? 6) * 1000);

  const results = [];
  for (const s of cfg.steps || [{ measure: 5 }]) {
    if (s.eval) await page.evaluate(s.eval);
    if (s.key) await page.keyboard.press(s.key);
    if (s.sleep) await page.waitForTimeout(s.sleep * 1000);
    if (s.measure || s.scroll) {
      const r = await page.evaluate(async ({ sec, scroll }) => {
        const ut = window.__ut;
        const max = () => document.documentElement.scrollHeight - innerHeight;
        const toY = (st) => (st / (ut.STOPS.length - 1)) * max();
        const dur = scroll ? scroll[2] : sec;
        const t = [], at = [];
        let tris = 0, calls = 0, peakTris = 0;
        let last = performance.now();
        const t0 = last, end = last + dur * 1000;
        await new Promise((res) => {
          const f = (n) => {
            t.push(n - last); at.push(ut.journey.progress);
            last = n;
            const info = ut.pipe.renderer.info.render;
            tris += info.triangles; calls += info.calls; peakTris = Math.max(peakTris, info.triangles);
            if (scroll) scrollTo(0, toY(scroll[0] + (scroll[1] - scroll[0]) * Math.min(1, (n - t0) / (dur * 1000))));
            if (n < end) requestAnimationFrame(f); else res();
          };
          requestAnimationFrame(f);
        });
        const q = (arr, p) => +arr[Math.min(arr.length - 1, Math.floor(p * arr.length))].toFixed(1);
        const sorted = [...t].sort((a, b) => a - b);
        // the worst stretches of a scroll, by the stop the camera was nearest
        const byStop = {};
        if (scroll) {
          t.forEach((x, i) => { const k = Math.round(at[i]); (byStop[k] ||= []).push(x); });
          for (const k in byStop) { const a = byStop[k].sort((x, y) => x - y); byStop[k] = { n: a.length, p95: q(a, 0.95), over20: +((a.filter((x) => x > 20).length / a.length) * 100).toFixed(0) }; }
        }
        return { n: t.length, p50: q(sorted, 0.5), p95: q(sorted, 0.95), p99: q(sorted, 0.99), max: q(sorted, 1), over20: +((t.filter((x) => x > 20).length / t.length) * 100).toFixed(1), scale: +ut.pipe.scale.toFixed(2), W: ut.pipe.W, H: ut.pipe.H, calls: Math.round(calls / t.length), trisM: +(tris / t.length / 1e6).toFixed(2), peakTrisM: +(peakTris / 1e6).toFixed(2), ...(scroll ? { byStop } : {}) };
      }, { sec: s.measure, scroll: s.scroll });
      results.push({ step: s.label || s.eval || 'measure', ...r });
    }
    if (s.shot) await page.screenshot({ path: join(out, s.shot) });
  }
  console.log(JSON.stringify({ results, logs: logs.slice(-15) }, null, 1));
} finally {
  await browser.close();
}

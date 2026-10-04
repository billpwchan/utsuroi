// Cuts foliage stamps out of the orthographic scan renders from scripts/bake.mjs: single maple leaves (the
// petioles eroded through so each leaf is its own island) and whole sakura clusters. Maple leaves are written
// as neutral luminance (the leaf material tints them per season); blossoms keep their colour.
// usage: node scripts/stamps.mjs   (reads .cache/bake/*.png, writes public/assets/stamps/*.webp + stamps.json)
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BAKE = new URL('../.cache/bake/', import.meta.url).pathname;
const OUT = new URL('../public/assets/stamps/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

// [render, prefix, erode px, min island area px, max stamp edge, grade: 'grey' | 'blossom']
const JOBS = [
  ['maple_top.png', 'maple', 5, 6000, 192, 'grey'],
  // clusters seen from above and obliquely, where the long pedicel stalk hides under the flowers
  ...['el90az0', 'el60az0', 'el60az120', 'el60az240', 'el45az60', 'el45az300'].map((v) => [`sakura_${v}.png`, 'sakura', 0, 40000, 256, 'blossom']),
];

function islands(mask, W, H, minArea) {
  const lab = new Int32Array(W * H).fill(-1);
  const out = [];
  const q = new Int32Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || lab[s] >= 0) continue;
    const id = out.length;
    let h = 0, t = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
    q[t++] = s; lab[s] = id;
    while (h < t) {
      const p = q[h++], x = p % W, y = (p / W) | 0;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const n of [p - 1, p + 1, p - W, p + W]) {
        if (n < 0 || n >= W * H || lab[n] >= 0 || !mask[n]) continue;
        if ((n % W === 0 && p % W === W - 1) || (p % W === 0 && n % W === W - 1)) continue;
        lab[n] = id; q[t++] = n;
      }
    }
    out.push({ id, area: t, x0, y0, x1, y1 });
  }
  return { lab, list: out.filter((o) => o.area >= minArea) };
}

const manifest = {};
for (const [file, prefix, erode, minArea, edge, grade] of JOBS) {
  const { data, info } = await sharp(join(BAKE, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const solid = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) solid[i] = data[i * 4 + 3] > 127 ? 1 : 0;
  // erode: a pixel survives only if its whole (2e+1)^2 neighbourhood is solid (separable min)
  let core = solid;
  if (erode) {
    const tmp = new Uint8Array(W * H), er = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = 1;
      for (let k = -erode; k <= erode && v; k++) { const xx = x + k; v = xx >= 0 && xx < W ? solid[y * W + xx] : 0; }
      tmp[y * W + x] = v;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = 1;
      for (let k = -erode; k <= erode && v; k++) { const yy = y + k; v = yy >= 0 && yy < H ? tmp[yy * W + x] : 0; }
      er[y * W + x] = v;
    }
    core = er;
  }
  const { lab, list } = islands(core, W, H, minArea);
  // grow each island back out over the solid pixels it eroded away (nearest island wins)
  if (erode) {
    let front = [];
    for (let i = 0; i < W * H; i++) if (lab[i] >= 0) front.push(i);
    for (let r = 0; r < erode + 2; r++) {
      const next = [];
      for (const p of front) for (const n of [p - 1, p + 1, p - W, p + W]) {
        if (n < 0 || n >= W * H || !solid[n] || lab[n] >= 0) continue;
        lab[n] = lab[p]; next.push(n);
      }
      front = next;
    }
  }
  // the colour chart in the scans is a separate island; keep only shapes that are not near-square solid blocks
  const keep = list.filter((o) => {
    const bw = o.x1 - o.x0 + 1, bh = o.y1 - o.y0 + 1;
    return o.area / (bw * bh) < 0.85;
  });
  manifest[prefix] ||= [];
  for (const o of keep) {
    const pad = erode + 4;
    const x0 = Math.max(0, o.x0 - pad), y0 = Math.max(0, o.y0 - pad), x1 = Math.min(W - 1, o.x1 + pad), y1 = Math.min(H - 1, o.y1 + pad);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const buf = Buffer.alloc(w * h * 4);
    let lumSum = 0, n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const si = (y0 + y) * W + (x0 + x), di = (y * w + x) * 4;
      if (lab[si] !== o.id) continue;
      buf[di] = data[si * 4]; buf[di + 1] = data[si * 4 + 1]; buf[di + 2] = data[si * 4 + 2]; buf[di + 3] = data[si * 4 + 3];
      lumSum += 0.3 * data[si * 4] + 0.59 * data[si * 4 + 1] + 0.11 * data[si * 4 + 2]; n++;
    }
    // the scans' texture islands are edged in black: pull the alpha in by two pixels
    const a0 = Uint8Array.from({ length: w * h }, (_, i) => buf[i * 4 + 3]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let m = 255;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        m = Math.min(m, xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : a0[yy * w + xx]);
      }
      buf[(y * w + x) * 4 + 3] = m;
    }
    if (grade === 'blossom') {
      // the scan was shot under flat light, so its whites sit at a grey ~0.8: lift the bright petals to paper white,
      // and turn the olive-brown calyces and bud scales toward the rose they read as in a crown
      const lums = [];
      for (let i = 0; i < w * h; i++) if (buf[i * 4 + 3] > 200) lums.push(0.3 * buf[i * 4] + 0.59 * buf[i * 4 + 1] + 0.11 * buf[i * 4 + 2]);
      lums.sort((p, q) => p - q);
      const k = 247 / lums[Math.floor(lums.length * 0.9)];
      for (let i = 0; i < w * h; i++) {
        const r = buf[i * 4] * k, g = buf[i * 4 + 1] * k, b = buf[i * 4 + 2] * k;
        const l = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
        const t = Math.min(1, Math.max(0, (0.62 - l) / 0.4));
        const rose = [l * 255 * 1.3, l * 255 * 0.72, l * 255 * 0.84];
        buf[i * 4] = Math.min(255, r + (rose[0] - r) * t * 0.8);
        buf[i * 4 + 1] = Math.min(255, g + (rose[1] - g) * t * 0.8);
        buf[i * 4 + 2] = Math.min(255, b + (rose[2] - b) * t * 0.8);
      }
    }
    if (grade === 'grey') {
      // neutral luminance, the leaf's mean lifted to ~0.72 so the season tint has the range the painted cards had
      const k = (0.72 * 255) / (lumSum / n);
      for (let i = 0; i < w * h; i++) {
        const l = Math.min(255, (0.3 * buf[i * 4] + 0.59 * buf[i * 4 + 1] + 0.11 * buf[i * 4 + 2]) * k);
        buf[i * 4] = buf[i * 4 + 1] = buf[i * 4 + 2] = l;
      }
    }
    const s = Math.min(1, edge / Math.max(w, h));
    const name = `${prefix}_${manifest[prefix].length}`;
    await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).resize(Math.round(w * s), Math.round(h * s)).webp({ quality: 88, alphaQuality: 95 }).toFile(join(OUT, `${name}.webp`));
    manifest[prefix].push({ name, w: Math.round(w * s), h: Math.round(h * s), area: o.area });
  }
  console.log(file, '->', keep.length, prefix, 'stamps');
}
writeFileSync(join(OUT, 'stamps.json'), JSON.stringify(manifest));

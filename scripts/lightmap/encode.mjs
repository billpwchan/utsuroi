// node scripts/lightmap/encode.mjs [bake dir]: denoised float bakes -> log2-encoded 8-bit -> KTX2 (UASTC) in
// public/assets/lm, plus lm.json with each map's range, the baked sun hours and the receivers' signature.
// Light inside a room is a hundredth of the light outside; log2 spreads the 8 bits evenly over the stops.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import sharp from 'sharp';

const dir = process.argv[2] || '.cache/lm/full';
const out = 'public/assets/lm';
const tmp = '.cache/lm/enc';
mkdirSync(out, { recursive: true });
mkdirSync(tmp, { recursive: true });
const meta = JSON.parse(readFileSync('.cache/lm/meta.json', 'utf8'));
const LO = -12;

// every receiver's texel sees some sky, if only by a bounce: the sky map's zeros are the atlas outside the charts
const skyF = new Float32Array(readFileSync(join(dir, 'sky.f32')).buffer.slice(0));
const SKY_S = Math.round(Math.sqrt(skyF.length / 3));
function chartMask(S) {
  const k = SKY_S / S, m = new Uint8Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let any = 0;
    for (let dy = 0; dy < k && !any; dy++) for (let dx = 0; dx < k && !any; dx++) {
      const i = ((y * k + dy) * SKY_S + x * k + dx) * 3;
      any = skyF[i] > 0 || skyF[i + 1] > 0 || skyF[i + 2] > 0 ? 1 : 0;
    }
    m[y * S + x] = any;
  }
  return m;
}

// The mips are box filters of the log-encoded texels. Left at zero, the space around a chart (-12 stops) is averaged
// into small charts a few texels wide, a tub's board or a hoop, darkening them by stops and, in log space, turning
// the channels' small differences into red and yellow blocks. Push-pull: each empty texel takes the average of the
// charts' texels in the smallest enclosing cell that has any.
function fill(v, w, S) {
  const lv = [{ v, w, S }];
  while (lv.at(-1).S > 1) {
    const { v: pv, w: pw, S: ps } = lv.at(-1), n = ps >> 1;
    const nv = new Float32Array(n * n * 3), nw = new Uint8Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let sw = 0, r = 0, g = 0, b = 0;
      for (let d = 0; d < 4; d++) {
        const i = (2 * y + (d >> 1)) * ps + 2 * x + (d & 1);
        if (!pw[i]) continue;
        sw++; r += pv[i * 3]; g += pv[i * 3 + 1]; b += pv[i * 3 + 2];
      }
      if (!sw) continue;
      const j = y * n + x;
      nv[j * 3] = r / sw; nv[j * 3 + 1] = g / sw; nv[j * 3 + 2] = b / sw; nw[j] = 1;
    }
    lv.push({ v: nv, w: nw, S: n });
  }
  for (let l = lv.length - 2; l >= 0; l--) {
    const { v: cv, w: cw, S: cs } = lv[l], pv = lv[l + 1].v, n = cs >> 1;
    for (let y = 0; y < cs; y++) for (let x = 0; x < cs; x++) {
      const i = y * cs + x;
      if (cw[i]) continue;
      const j = (y >> 1) * n + (x >> 1);
      cv[i * 3] = pv[j * 3]; cv[i * 3 + 1] = pv[j * 3 + 1]; cv[i * 3 + 2] = pv[j * 3 + 2];
    }
  }
}

function encode(name) {
  const f = new Float32Array(readFileSync(join(dir, name + '.f32')).buffer.slice(0));
  const S = Math.round(Math.sqrt(f.length / 3));
  // the top of the range: just above the brightest texels that matter
  const lum = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) lum[i] = Math.max(f[i * 3], f[i * 3 + 1], f[i * 3 + 2]);
  const sorted = Float32Array.from(lum).sort();
  const top = sorted[Math.floor(sorted.length * 0.99995)];
  const hi = Math.max(0, Math.ceil(Math.log2(Math.max(top, 1e-3)) * 2) / 2);
  const enc = new Float32Array(S * S * 3), mask = chartMask(S), w = new Uint8Array(S * S);
  const base = 2 ** LO;
  // Blender's glTF import turned v into 1 - v and its pixels run bottom-up, so its top row is v = 0; a compressed
  // texture is not flipped on upload, so that row goes first
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) w[y * S + x] = mask[(S - 1 - y) * S + x];
    for (let i = 0; i < S * 3; i++) enc[y * S * 3 + i] = (Math.log2(Math.max(0, f[(S - 1 - y) * S * 3 + i]) + base) - LO) / (hi - LO);
  }
  fill(enc, w, S);
  const o = Buffer.alloc(S * S * 3);
  for (let i = 0; i < S * S * 3; i++) o[i] = Math.max(0, Math.min(255, Math.round(enc[i] * 255)));
  return { S, hi, o };
}

const info = { signature: meta.signature, range: {}, sun: [] };
// the maps only: the probes' .f32 files are packed below, and the denoiser's .f32.exr intermediates are not maps
const names = readdirSync(dir).map((n) => n.match(/^(sky|lamp|sun_[\d.]+)\.f32$/)?.[1]).filter(Boolean);
const sunHours = names.filter((n) => n.startsWith('sun_')).map((n) => +n.slice(4)).sort((a, b) => a - b);
for (const name of names) {
  const { S, hi, o } = encode(name);
  const png = join(tmp, name + '.png'), ktx = join(out, name + '.ktx2');
  await sharp(o, { raw: { width: S, height: S, channels: 3 } }).png({ compressionLevel: 1 }).toFile(png);
  execFileSync('basisu', ['-ktx2', '-uastc', '-uastc_level', '2', '-uastc_rdo_l', '0.5', '-ktx2_zstandard_level', '18', '-mipmap', '-mip_linear', '-linear', png, '-output_file', ktx], { stdio: 'ignore' });
  const bytes = readFileSync(ktx).length;
  console.log(name, S, 'range', LO, hi, (bytes / 1048576).toFixed(2) + ' MB');
  if (name.startsWith('sun_')) continue;
  info.range[name] = [LO, hi];
  info[name] = true;
}
for (const h of sunHours) {
  const { hi } = encode('sun_' + h);
  info.sun.push([h, [LO, hi]]);
}
// probes: each basis's six faces fitted with E(n) = a (1 + r.n), the least-squares a + b.n; probes buried in walls
// take their valid neighbours' light, so nothing interpolates toward black. One RGBA8 3D texture per colour
// channel, the bases stacked along z, and the three written one after another: a as log2 over the range, r as 0.5 + 0.5 r
const pj = JSON.parse(readFileSync(join(dir, 'probes.json'), 'utf8'));
const [nx, ny, nz] = pj.n, NP = nx * ny * nz;
const PLO = -16;
const bases = ['sky', 'lamp', ...sunHours.map((h) => 'sun_' + h)];
const pdata = [0, 1, 2].map(() => new Uint8Array(NP * 4 * bases.length));
const phi = [];
bases.forEach((b, bi) => {
  const f = new Float32Array(readFileSync(join(dir, `probes_${b}.f32`)).buffer.slice(0));
  let ok = Uint8Array.from(pj.valid);
  for (let pass = 0; pass < 12; pass++) {
    const next = ok.slice();
    for (let p = 0; p < NP; p++) {
      if (ok[p]) continue;
      const i = p % nx, j = Math.floor(p / nx) % ny, k = Math.floor(p / (nx * ny));
      const acc = new Float32Array(18);
      let n = 0;
      for (const [di, dj, dk] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const a = i + di, b2 = j + dj, c = k + dk;
        if (a < 0 || b2 < 0 || c < 0 || a >= nx || b2 >= ny || c >= nz) continue;
        const q = (c * ny + b2) * nx + a;
        if (!ok[q]) continue;
        for (let e = 0; e < 18; e++) acc[e] += f[q * 18 + e];
        n++;
      }
      if (!n) continue;
      for (let e = 0; e < 18; e++) f[p * 18 + e] = acc[e] / n;
      next[p] = 1;
    }
    ok = next;
  }
  let top = 1e-6;
  for (let p = 0; p < NP * 18; p++) top = Math.max(top, f[p]);
  const hi = Math.ceil(Math.log2(top));
  phi.push(hi);
  for (let p = 0; p < NP; p++) {
    for (let c = 0; c < 3; c++) {
      const F = (fi) => Math.max(0, f[p * 18 + fi * 3 + c]);
      const a = (F(0) + F(1) + F(2) + F(3) + F(4) + F(5)) / 6;
      const r = [(F(0) - F(1)) / 2, (F(2) - F(3)) / 2, (F(4) - F(5)) / 2].map((v) => Math.max(-1, Math.min(1, v / Math.max(a, 1e-9))));
      const o = (bi * NP + p) * 4, d = pdata[c];
      d[o] = Math.max(0, Math.min(255, Math.round(((Math.log2(a + 2 ** PLO) - PLO) / (hi - PLO)) * 255)));
      for (let e = 0; e < 3; e++) d[o + 1 + e] = Math.round((0.5 + 0.5 * r[e]) * 255);
    }
  }
});
writeFileSync(join(out, 'probes.bin'), Buffer.concat(pdata.map((d) => Buffer.from(d.buffer))));
info.probes = { min: pj.min, step: pj.step, n: pj.n, lo: PLO, hi: phi, bases };
console.log('probes', NP, 'x', bases.length, 'bases, hi', phi.join(' '));
writeFileSync(join(out, 'lm.json'), JSON.stringify(info));
console.log(JSON.stringify(info));

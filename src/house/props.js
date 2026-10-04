// What the rooms hold: paper lamps that light the evening, cushions round a low table, the alcoves' hanging
// scrolls and seasonal arrangements, two folding screens, a tea set, the kitchen's ceramics, the bath's water. The
// scrolls and screens are photographs of real works (The Met's open access; a CC-BY scan of Tōhaku's Pine Trees).
import * as THREE from 'three';
import { Kit, vec } from './kit.js';
import { patch } from '../core/shared.js';
import { tex } from '../core/assets.js';
import { rng, smoothstep } from '../lib/math.js';
import { FL } from './house.js';

// ---- builders ----

// a scanned zabuton (tufted, piped edges), dyed by its look; placed with the house's other scans
function zabuton(scans, x, z, y, rot = 0, look = 'cushion') {
  scans.push({ model: 'zabuton', look, x, y, z, yaw: rot });
}

function lowTable(k, x, z, y, w, d, h = 0.33) {
  const t = k.g('lacquer');
  t.boxMM(x - w / 2, y + h - 0.035, z - d / 2, x + w / 2, y + h, z + d / 2, { grain: 'x', chamfer: 0.008 });
  t.boxMM(x - w / 2 + 0.03, y + h - 0.09, z - d / 2 + 0.03, x + w / 2 - 0.03, y + h - 0.035, z + d / 2 - 0.03, { grain: 'x' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) t.box(vec(x + sx * (w / 2 - 0.07), y + (h - 0.09) / 2, z + sz * (d / 2 - 0.07)), vec(0.06, h - 0.09, 0.06), { grain: 'y', chamfer: 0.006 });
}

function vessel(k, mat, x, y, z, prof, sides = 20) { k.g(mat).lathe(vec(x, y, z), prof, sides); }

// a kakejiku from a photograph of its whole mounting. The paper hangs from its rod a few millimetres off the wall
// and leans out to the roller at the foot, with the faint swells of a scroll kept rolled for years; the foot of the
// mounting wraps round the roller, whose knobs stand clear at either side, and a silk cord runs up to the hook
function kakejiku(k, mat, x, zw, yTop, w, h) {
  const g = k.g(mat), y0 = yTop - h, R = 0.0135, zr = zw + R + 0.003, cols = 6, rows = 40;
  const zAt = (u, v) => {
    const lean = zw + 0.007 + (zr + R - zw - 0.007) * Math.pow(Math.max(0, 1 - v), 1.4);
    const swell = 0.0016 * Math.sin(v * 31 + 1.3) * Math.sin(v * 7.7) + 0.0022 * Math.exp(-(Math.max(0, 1 - v) * 40));
    return lean + swell - 0.0025 * Math.pow(2 * u - 1, 4);
  };
  const P = (u, v) => vec(x + (u - 0.5) * w, y0 + v * h, zAt(u, v));
  const base = g.vc;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const u = i / cols, v = j / rows, e = 1e-3;
      const n = P(u + e, v).sub(P(u - e, v)).cross(P(u, v + e).sub(P(u, v - e))).normalize();
      g.vert(P(u, v), n, u, v);
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = base + j * (cols + 1) + i, b = a + cols + 1;
    g.idx.push(a, a + 1, b + 1, a, b + 1, b);
  }
  // round the roller: the mounting's last few millimetres of cloth
  const seg = 10, rb = g.vc;
  for (let s = 0; s <= seg; s++) {
    const a = -(s / seg) * Math.PI;
    const n = vec(0, Math.sin(a), Math.cos(a));
    for (let i = 0; i <= 1; i++) g.vert(vec(x + (i - 0.5) * w, y0 + R * n.y, zr + R * n.z), n, i, 0.002);
  }
  for (let s = 0; s < seg; s++) { const a = rb + s * 2; g.idx.push(a + 2, a + 3, a + 1, a + 2, a + 1, a); }
  // knobs
  for (const sgn of [-1, 1]) {
    const xa = x + sgn * (w / 2 - 0.002), xb = x + sgn * (w / 2 + 0.026);
    const kg = k.g('ceramicPale'), r = 0.0165, nn = vec(sgn, 0, 0);
    kg.tube([vec(xa, y0, zr), vec(xb, y0, zr)], [r, r], 18, 1);
    const c0 = kg.vert(vec(xb, y0, zr), nn, 0, 0);
    for (let s = 0; s <= 18; s++) { const a = (s / 18) * Math.PI * 2; kg.vert(vec(xb, y0 + Math.cos(a) * r, zr + Math.sin(a) * r), nn, 0, 0); }
    for (let s = 0; s < 18; s++) kg.idx.push(...(sgn > 0 ? [c0, c0 + 1 + s, c0 + 2 + s] : [c0, c0 + 2 + s, c0 + 1 + s]));
  }
  // cord and hook
  const hy = yTop + 0.075, hz = zw + 0.012;
  for (const sgn of [-1, 1]) k.g('darkwood').tube([vec(x + sgn * w * 0.32, yTop - 0.004, zw + 0.011), vec(x, hy, hz)], [0.0016, 0.0016], 5, 1);
  k.g('brass').box(vec(x, hy + 0.006, zw + 0.006), vec(0.006, 0.016, 0.012), { grain: 'y' });
}

function teaSet(k, x, y, z) {
  // kyusu with a side handle, two cups, a tray
  k.g('darkwood').boxMM(x - 0.2, y, z - 0.13, x + 0.2, y + 0.015, z + 0.13, { grain: 'x', chamfer: 0.004 });
  vessel(k, 'ceramicDark', x - 0.07, y + 0.015, z, [[0.035, 0], [0.06, 0.02], [0.065, 0.05], [0.05, 0.08], [0.03, 0.085], [0.0, 0.095]]);
  k.g('ceramicDark').tube([vec(x - 0.01, y + 0.06, z), vec(x + 0.06, y + 0.07, z + 0.01)], [0.012, 0.01], 8, 0.2);
  k.g('ceramicDark').tube([vec(x - 0.12, y + 0.06, z), vec(x - 0.2, y + 0.08, z - 0.02)], [0.009, 0.006], 6, 0.2);
  for (const dz of [-0.06, 0.06]) vessel(k, 'ceramicPale', x + 0.1, y + 0.015, z + dz, [[0.022, 0], [0.03, 0.005], [0.034, 0.05], [0.031, 0.052], [0.026, 0.01], [0.0, 0.012]], 16);
}

function ikebana(k, x, y, z, s = 1) {
  // a tall stoneware vase; the branch is built separately as foliage cards (seasonal)
  vessel(k, 'ceramicDark', x, y, z, [[0.07 * s, 0], [0.1 * s, 0.05 * s], [0.09 * s, 0.25 * s], [0.05 * s, 0.33 * s], [0.055 * s, 0.38 * s], [0.045 * s, 0.38 * s], [0.0, 0.3 * s]]);
}

// a soft slab of bedding: a rounded rectangle (half-width hw across x, h0..h1 along z, about cx, cz) whose top follows
// top(x, z) and whose edges roll over with radius R and hang down. The edge is laid out unrolled: a point a distance e
// past the flat part has gone e round the roll and down the drop, so the cloth's texture runs on over the edge
function slab(g, { cx, cz, hw, h0, h1, top, R: R0, drop, tuck = 0.02, step = 0.035 }) {
  // R, like drop, may differ by edge: a function of the edge direction's z
  const Rf = typeof R0 === 'function' ? R0 : () => R0;
  const L = (dz) => (Math.PI * Rf(dz)) / 2 + drop(dz) + tuck;
  const axis = (a, b, Le) => {
    const out = [];
    for (let i = 0; i <= 10; i++) out.push(a - Le * (1 - i / 10) ** 1.5);
    const n = Math.max(2, Math.round((b - a) / step));
    for (let i = 1; i < n; i++) out.push(a + ((b - a) * i) / n);
    for (let i = 0; i <= 10; i++) out.push(b + Le * (i / 10) ** 1.5);
    return out;
  };
  const Lx = L(0), us = axis(-hw, hw, Lx), vs = axis(h0, h1, Math.max(L(-1), L(1)));
  const P = (p, q) => {
    const sx = p < 0 ? -1 : 1, sz = q < h0 ? -1 : 1;
    const ex = Math.max(0, Math.abs(p) - hw), ez = Math.max(0, h0 - q, q - h1);
    const fx = sx * Math.min(Math.abs(p), hw), fz = Math.min(Math.max(q, h0), h1);
    const y0 = top(cx + fx, cz + fz);
    const e = Math.hypot(ex, ez);
    if (e < 1e-7) return vec(cx + fx, y0, cz + fz);
    const dx = (sx * ex) / e, dz = (sz * ez) / e, dr = drop(dz), R = Rf(dz), roll = (Math.PI * R) / 2;
    // past its own run along this edge the cloth has nowhere to go: clamp to the tuck's end
    const ee = Math.min(e, roll + dr + tuck);
    let o, dy;
    if (ee <= roll) { const t = ee / R; o = R * Math.sin(t); dy = R * (1 - Math.cos(t)); }
    else if (ee <= roll + dr) { o = R; dy = R + (ee - roll); }
    else { o = R - (ee - roll - dr); dy = R + dr; }
    return vec(cx + fx + dx * o, y0 - dy, cz + fz + dz * o);
  };
  const base = g.vc, e = 1e-3;
  for (const q of vs) for (const p of us) {
    const n = P(p, q + e).sub(P(p, q - e)).cross(P(p + e, q).sub(P(p - e, q))).normalize();
    g.vert(P(p, q), n, p, q);
  }
  const W = us.length;
  for (let j = 0; j < vs.length - 1; j++) for (let i = 0; i < W - 1; i++) {
    const a = base + j * W + i, b = a + W;
    g.idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
}

// a buckwheat-hull pillow: a squashed superellipsoid, soft at the corners, a little slumped
function pillow(g, c, a, b, h, yaw) {
  const ns = 28, nt = 14, cs = Math.cos(yaw), sn = Math.sin(yaw);
  const sp = (w, e) => Math.sign(w) * Math.abs(w) ** e;
  const P = (s, t) => {
    const ct = Math.cos(t), st = Math.sin(t), cps = Math.cos(s), sps = Math.sin(s);
    let x = a * sp(ct, 0.55) * sp(cps, 0.35), z = b * sp(ct, 0.55) * sp(sps, 0.35), y = h * sp(st, 0.8);
    // the hulls settle: flatter on top toward the ends, the underside flat on the mattress
    y *= 1 - 0.25 * (x / a) ** 2;
    if (y < 0) y *= 0.35;
    return vec(c.x + x * cs + z * sn, c.y + y, c.z - x * sn + z * cs);
  };
  const base = g.vc, e = 1e-3;
  for (let j = 0; j <= nt; j++) for (let i = 0; i <= ns; i++) {
    const s = (i / ns) * Math.PI * 2, t = -Math.PI / 2 + (j / nt) * Math.PI;
    const n = P(s, t + e).sub(P(s, t - e)).cross(P(s + e, t).sub(P(s - e, t))).normalize();
    g.vert(P(s, t), n.lengthSq() > 0.5 ? n : vec(0, Math.sign(t) || 1, 0), (i / ns) * 2 * (a + b), (j / nt) * (h * 2 + b));
  }
  for (let j = 0; j < nt; j++) for (let i = 0; i < ns; i++) {
    const p0 = base + j * (ns + 1) + i, p1 = p0 + ns + 1;
    g.idx.push(p0, p1, p0 + 1, p0 + 1, p1, p1 + 1);
  }
}

export function createProps(house, materials) {
  const mats = {
    ...materials,
    ceramicDark: (() => { const m = new THREE.MeshStandardMaterial({ color: 0x2a2421, roughness: 0.32 }); patch(m, { key: 'ceramicDark' }); return m; })(),
    ceramicPale: (() => { const m = new THREE.MeshStandardMaterial({ color: 0xd9d2c4, roughness: 0.28 }); patch(m, { key: 'ceramicPale' }); return m; })(),
    celadon: (() => { const m = new THREE.MeshStandardMaterial({ color: 0x8fa596, roughness: 0.22 }); patch(m, { key: 'celadon' }); return m; })(),
    // the scrolls, photographed in their mountings (The Met, open access): paper and silk, matt
    scroll: (() => { const m = new THREE.MeshStandardMaterial({ map: tex('./assets/tex/scroll_morikage_c.ktx2', true, false), roughness: 0.78 }); patch(m, { key: 'scroll' }); return m; })(),
    scrollTea: (() => { const m = new THREE.MeshStandardMaterial({ map: tex('./assets/tex/scroll_ikkyu_c.ktx2', true, false), roughness: 0.78 }); patch(m, { key: 'scrollTea' }); return m; })(),
    // Ogata Kōrin's Irises at Yatsuhashi (after 1709), photographed: only the leaf is metal; the malachite and
    // azurite on top of it are matt
    screen: (() => {
      const m = new THREE.MeshStandardMaterial({ map: tex('./assets/tex/byobu_korin_c.ktx2', true, false), roughness: 0.5, metalness: 1.0 });
      patch(m, { key: 'byobu', hooks: { normal: /* glsl */ `
        {
          vec3 c = diffuseColor.rgb;
          float gold = smoothstep(0.1, 0.2, c.r - c.b) * smoothstep(0.16, 0.28, c.g) * step(c.g, c.r * 1.05);
          metalnessFactor = 0.8 * gold;
          roughnessFactor = mix(0.85, 0.38, gold);
        }` } });
      return m;
    })(),
    // the painting on its paper: ink is matt, the sized paper has a faint sheen
    byobuPine: (() => { const m = new THREE.MeshStandardMaterial({ map: tex('./assets/tex/byobu_pine_c.ktx2', true, false), roughness: 0.82 }); patch(m, { key: 'byobuPine' }); return m; })(),
    lampPaper: (() => {
      const m = new THREE.MeshStandardMaterial({ color: 0xe2d6bd, roughness: 0.9, emissive: 0xffb466, emissiveIntensity: 0, side: THREE.DoubleSide });
      patch(m, { key: 'lampPaper', trans: 0.5 });
      return m;
    })(),
    // binchotan: black, grey-skinned with ash where it has burnt; it glows where the sticks meet over the fire's
    // core, along thin fissures, and on the face pressed into the ash
    ember: (() => {
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, emissive: 0xff4a10, emissiveIntensity: 3.2 });
      const pts = (house.emberPoints || []).slice(0, 4).map(([x, y, z]) => new THREE.Vector3(x, y, z));
      while (pts.length < 4) pts.push(new THREE.Vector3(0, -99, 0));
      patch(m, {
        key: 'ember',
        uniforms: { uEmber: { value: pts } },
        fragHead: 'uniform vec3 uEmber[4];',
        hooks: {
          map: /* glsl */ `
            {
              // a skin of grey ash broken into plates; the glow shows along the fissures between them, strongest
              // under the stack where the sticks meet over the fire's core. Fissures finer than a pixel become
              // their average glow instead of sparkling.
              vec3 wN = normalize((vec4(vNormal, 0.0) * viewMatrix).xyz);
              vec2 p = vec2(vSfWP.x + vSfWP.z * 0.6, vSfWP.y * 1.6 + vSfWP.z * 0.8) * 95.0;
              vec2 ip = floor(p), fp = fract(p);
              float d1 = 8.0, d2 = 8.0;
              for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
                vec2 g = vec2(float(x), float(y));
                vec2 o = fract(sin(vec2(dot(ip + g, vec2(127.1, 311.7)), dot(ip + g, vec2(269.5, 183.3)))) * 43758.5453);
                float d = length(g + o - fp);
                if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
              }
              float fine = smoothstep(0.35, 1.0, length(fwidth(p)));
              float fissure = mix(smoothstep(0.12, 0.02, d2 - d1), 0.1, fine);
              float n = sfNoise(vSfWP.xz * 23.0 + vSfWP.y * 9.0), n2 = sfNoise(vSfWP.zx * 41.0 + 3.0);
              float core = 0.0;
              for (int i = 0; i < 4; i++) core = max(core, smoothstep(0.07, 0.0, length(vSfWP.xz - uEmber[i].xz)));
              // ash settles on what faces up and on the burnt ends; the undersides stay black
              float skin = smoothstep(-0.75, 0.4, wN.y) * (0.6 + 0.4 * smoothstep(0.3, 0.7, n)) * (1.0 - fissure);
              diffuseColor.rgb = mix(vec3(0.028, 0.026, 0.025), vec3(0.34, 0.33, 0.32) * (0.85 + 0.3 * n2), skin * 0.9);
              float under = smoothstep(${(FL + 0.04).toFixed(3)}, ${(FL + 0.026).toFixed(3)}, vSfWP.y) + smoothstep(-0.2, -0.8, wN.y) * 0.6;
              float breathe = 0.72 + 0.28 * sin(uTime * 1.3 + n * 9.0) * sin(uTime * 0.7 + n2 * 5.0);
              float glow = fissure * (0.05 + 0.75 * core * core) + core * core * 0.06 + under * 0.4 * core;
              totalEmissiveRadiance *= clamp(glow, 0.0, 1.0) * breathe;
            }`,
        },
      });
      return m;
    })(),
  };
  // the quilt's face: aizome kasuri, small igeta crosses whose edges blur where the resist-tied threads slipped. Where a
  // cross is finer than a pixel it becomes its share of white instead of shimmering
  {
    const L = materials.indigo;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: L.map, normalMap: L.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.9, side: THREE.DoubleSide });
    patch(m, { key: 'futon', hooks: { map: /* glsl */ `
      {
        vec3 tx = texture2D(map, vMapUv).rgb / vec3(0.2836, 0.4096, 0.6111);
        float l = dot(tx, vec3(0.2126, 0.7152, 0.0722));
        vec2 mm = vMapUv * 0.45;
        vec2 cell = vec2(0.072, 0.06);
        vec2 g = mm / cell;
        g.x += mod(floor(g.y), 2.0) * 0.5;
        vec2 a = abs(fract(g) - 0.5) * cell;
        // the resist slips along the weft, more on some crosses than others; a few barely took the dye at all
        float slip = (sfNoise(mm * vec2(24.0, 300.0)) - 0.5) * 0.004;
        float took = smoothstep(0.12, 0.35, sfNoise(floor(g) * 1.37 + 0.5));
        float bar = 0.0019;
        float cross = max(smoothstep(bar, bar * 0.35, abs(a.x - 0.0065 + slip)) * smoothstep(0.0145, 0.012, a.y),
                          smoothstep(bar, bar * 0.35, abs(a.y - 0.0065 + slip)) * smoothstep(0.0145, 0.012, a.x)) * took;
        float fine = smoothstep(0.25, 0.8, length(fwidth(g)));
        float white = mix(cross * (0.65 + 0.35 * sfNoise(mm * 70.0)), 0.06, fine);
        vec3 indigo = vec3(0.03, 0.045, 0.1) * (0.9 + 0.2 * sfNoise(mm * 4.0));
        diffuseColor.rgb = mix(indigo, vec3(0.36, 0.4, 0.47), white) * l;
      }` } });
    mats.futon = m;
  }
  const k = new Kit(mats);
  const R = rng(5150);

  // ---- lamps: fixtures where the house placed its lights
  for (const l of house.lamps) {
    const [x, y, z] = l.p;
    if (l.kind === 'pendant') {
      // a paper globe on a cord
      k.g('lampPaper').lathe(vec(x, y - 0.22, z), Array.from({ length: 13 }, (_, i) => {
        const a = -Math.PI / 2 + (i / 12) * Math.PI;
        return [Math.max(0.015, Math.cos(a) * 0.24), Math.sin(a) * 0.22 + 0.22];
      }), 24);
      for (let r = 1; r < 8; r++) {
        const a = -Math.PI / 2 + (r / 8) * Math.PI;
        k.g('darkwood').lathe(vec(x, y - 0.22 + Math.sin(a) * 0.22 + 0.22, z), [[Math.cos(a) * 0.243, -0.002], [Math.cos(a) * 0.243, 0.002]], 24);
      }
      k.g('dark').tube([vec(x, y + 0.22, z), vec(x, y + 1.6, z)], [0.004, 0.004], 4, 1);
    } else if (l.kind === 'andon') {
      // a scanned andon: lacquered frame, its paper sleeve the lamp paper that glows in the evening
      house.scans.push({ model: 'andon', x, y: FL, z, yaw: R() * Math.PI, mats: { paper: mats.lampPaper } });
      l.p = [x, FL + 0.5, z];
    } else if (l.kind === 'lantern') {
      // the bath's hanging lantern: a cylinder of paper in a cedar frame
      k.g('lampPaper').lathe(vec(x, y - 0.18, z), [[0.12, 0], [0.13, 0.18], [0.12, 0.36]], 16);
      k.g('darkwood').lathe(vec(x, y - 0.2, z), [[0.13, 0], [0.13, 0.03], [0.0, 0.03]], 16);
      k.g('darkwood').lathe(vec(x, y + 0.16, z), [[0.13, 0], [0.13, 0.03], [0.0, 0.035]], 16);
      k.g('dark').tube([vec(x, y + 0.19, z), vec(x, 2.75, z)], [0.004, 0.004], 4, 1);
    }
  }

  // ---- genkan: a pair of geta left on the earth floor beside the step stone, turned to face the door
  house.scans.push({ model: 'geta', x: -22.32, y: 0.08, z: -0.3, yaw: -Math.PI / 2 + 0.06 });
  house.scans.push({ model: 'geta', x: -22.18, y: 0.08, z: -0.28, yaw: -Math.PI / 2 - 0.05 });
  // ---- genkan: an arrangement on the hall's board; to one side of the step a two-fold screen carrying two panels of
  // Hasegawa Tōhaku's Pine Trees (Shōrin-zu byōbu, c. 1595) at the painting's own size, folded back into the hall
  ikebana(k, -21.2, FL + 0.08, -2.48, 1.0);
  {
    const w = 0.59, h = 1.568, y0 = FL + 0.012, th = Math.PI / 9;
    const pts = [vec(-22.62, y0, -1.0), vec(-22.62 + w * Math.cos(th), y0, -1.0 - w * Math.sin(th)), vec(-22.62 + 2 * w * Math.cos(th), y0, -1.0)];
    const face = k.g('byobuPine'), back = k.g('fusuma'), lq = k.g('lacquer'), br = k.g('brass');
    for (let i = 0; i < 2; i++) {
      const a = pts[i], b = pts[i + 1];
      const d = b.clone().sub(a).normalize(), n = vec(d.z, 0, -d.x);
      const off = n.clone().multiplyScalar(0.008);
      const A = a.clone().add(off), B = b.clone().add(off), A2 = a.clone().sub(off), B2 = b.clone().sub(off);
      const up = vec(0, h, 0);
      // the painting on the side toward the door, the paper backing behind it, each facing out (a quad faces
      // (b - a) x (d - a)); turned inward, each was lit only from the gap between the two and baked black
      face.quad(A2, B2, B2.clone().add(up), A2.clone().add(up), [i / 2, 0, (i + 1) / 2, 0, (i + 1) / 2, 1, i / 2, 1]);
      back.quad(B, A, A.clone().add(up), B.clone().add(up), [0, 0, w, 0, w, h, 0, h]);
      // lacquered rails round each leaf, a little proud of the paper; brass caps on the corners
      const ry = Math.atan2(-d.z, d.x);
      const mid = a.clone().lerp(b, 0.5);
      lq.box(mid.clone().setY(y0 + h + 0.009), vec(w + 0.02, 0.018, 0.024), { grain: 'x', ry, chamfer: 0.003 });
      lq.box(mid.clone().setY(y0 - 0.002), vec(w + 0.02, 0.018, 0.024), { grain: 'x', ry, chamfer: 0.003 });
      for (const e of [a, b]) {
        lq.box(e.clone().setY(y0 + h / 2), vec(0.02, h + 0.02, 0.024), { grain: 'y', ry, chamfer: 0.003 });
        for (const y of [y0 - 0.004, y0 + h + 0.006]) br.box(e.clone().setY(y), vec(0.026, 0.026, 0.028), { grain: 'y', ry, chamfer: 0.004 });
      }
    }
  }

  // ---- zashiki: low table, cushions, tea; the alcove's scroll and arrangement
  lowTable(k, -13.2, -1.35, FL, 1.5, 0.9);
  teaSet(k, -13.0, FL + 0.33, -1.4);
  zabuton(house.scans, -14.3, -1.35, FL, Math.PI / 2);
  zabuton(house.scans, -12.1, -1.35, FL, -Math.PI / 2);
  zabuton(house.scans, -13.2, -0.35, FL, 0);
  {
    // Kusumi Morikage's Landscape (17th c.) in its mounting, 0.69 x 2.08 m: hung from a hook behind the otoshigake,
    // so its heaven passes up out of sight and its roller clears the board by a hand
    kakejiku(k, 'scroll', -14.105, -4.05, FL + 2.3, 0.69, 2.078);
    ikebana(k, -13.35, FL + 0.12, -3.65, 1.05);
    // incense burner
    vessel(k, 'celadon', -14.85, FL + 0.12, -3.7, [[0.05, 0], [0.07, 0.02], [0.065, 0.07], [0.055, 0.08], [0.0, 0.07]]);
  }
  // chigaidana: a few objects on the shelves
  vessel(k, 'ceramicPale', -12.3, FL + 0.98, -3.85, [[0.04, 0], [0.06, 0.06], [0.05, 0.14], [0.02, 0.17], [0.025, 0.2], [0.0, 0.19]]);
  vessel(k, 'celadon', -11.4, FL + 1.15, -3.85, [[0.05, 0], [0.08, 0.04], [0.08, 0.06], [0.0, 0.05]]);

  // ---- tsugi-no-ma: the folding screen standing in a zigzag against the north fusuma; each leaf takes its own panel
  // of the photograph, cut at the painting's hinges
  {
    const seams = [0, 635, 1266, 1896, 2526, 3147, 3780].map((v) => v / 3780);
    const n = 6, pw = 0.587, h = 1.635, y0 = FL + 0.02;
    const x0 = -10.62, z0 = -2.95;
    const sc = k.g('screen'), lq = k.g('lacquer'), br = k.g('brass');
    let px = x0;
    const corners = [];
    for (let i = 0; i < n; i++) {
      const a = vec(px, y0, z0 + (i % 2 ? 0.13 : 0)), b = vec(px + pw * 0.97, y0, z0 + (i % 2 ? 0 : 0.13));
      const u0 = seams[i], u1 = seams[i + 1];
      sc.quad(a, b, b.clone().setY(y0 + h), a.clone().setY(y0 + h), [u0, 0, u1, 0, u1, 1, u0, 1]);
      const ry = Math.atan2(-(b.z - a.z), b.x - a.x), mid = a.clone().lerp(b, 0.5);
      lq.box(mid.clone().setY(y0 + h + 0.008), vec(pw * 0.97 + 0.012, 0.016, 0.022), { grain: 'x', ry, chamfer: 0.003 });
      lq.box(mid.clone().setY(y0 - 0.004), vec(pw * 0.97 + 0.012, 0.016, 0.022), { grain: 'x', ry, chamfer: 0.003 });
      corners.push(a);
      if (i === n - 1) corners.push(b);
      px += pw * 0.97;
    }
    for (const c of corners) {
      lq.box(vec(c.x, y0 + h / 2, c.z), vec(0.02, h + 0.03, 0.022), { grain: 'y', chamfer: 0.003 });
      for (const y of [y0 - 0.006, y0 + h + 0.009]) br.box(vec(c.x, y, c.z), vec(0.026, 0.024, 0.028), { grain: 'y', chamfer: 0.004 });
    }
  }

  // ---- tea room: utensils by the hearth, a single flower in the alcove
  house.scans.push({ model: 'chawan', x: -6.85, y: FL, z: -1.45, yaw: 2.2 });
  vessel(k, 'lacquer', -6.95, FL, -1.2, [[0.035, 0], [0.037, 0.06], [0.03, 0.075], [0.0, 0.078]], 16); // natsume
  vessel(k, 'ceramicPale', -5.8, FL, -1.8, [[0.1, 0], [0.12, 0.08], [0.11, 0.18], [0.1, 0.19], [0.0, 0.2]], 20); // mizusashi
  vessel(k, 'bamboo', -4.95, FL + 0.08, -2.95, [[0.04, 0], [0.04, 0.32], [0.0, 0.32]], 10);
  // Ikkyū Sōjun's naming certificate "Tagaku" (15th c.), 0.43 x 1.34 m: the tea room's scroll
  kakejiku(k, 'scrollTea', -5.005, -3.14, FL + 1.91, 0.43, 1.343);

  // ---- hearth room: cushions round the irori, the kitchen's ceramics
  for (const [dx, dz, r] of [[-0.95, 0, Math.PI / 2], [0.95, 0, -Math.PI / 2], [0, 0.95, 0]]) zabuton(house.scans, 2.275 + dx, -1.82 + dz, FL, r, 'cushionB');
  for (let i = 0; i < 9; i++) {
    const x = 5.8 + (i % 5) * 0.42, y = FL + (i < 5 ? 1.48 : 1.88), z = -3.95;
    const mat = R() < 0.5 ? 'ceramicPale' : R() < 0.5 ? 'celadon' : 'ceramicDark';
    if (R() < 0.5) vessel(k, mat, x, y, z, [[0.04, 0], [0.07, 0.03], [0.08, 0.07], [0.0, 0.06]], 16);
    else vessel(k, mat, x, y, z, [[0.035, 0], [0.05, 0.05], [0.045, 0.13], [0.02, 0.16], [0.0, 0.15]], 16);
  }
  vessel(k, 'iron', 7.5, FL + 0.87, -3.6, [[0.1, 0], [0.16, 0.08], [0.15, 0.17], [0.12, 0.2], [0.0, 0.22]], 18);
  lowTable(k, 6.8, -1.6, FL, 1.4, 0.8, 0.33);
  zabuton(house.scans, 6.8, -0.75, FL, 0, 'cushionB');
  zabuton(house.scans, 6.8, -2.45, FL, Math.PI, 'cushionB');

  // ---- bedroom: the bedding, made up on the hinoki platform. It replaces the house's own (a slab and a sheet that read
  // as one dark box) on the same footprint, so the baked shade round the platform still belongs to it. It is built
  // apart from the house and its props: everything under the house is a lightmap receiver, and new geometry there
  // would void the bake. It takes its light from the probes instead
  for (const o of house.group.children) if (o.isMesh && (o.name === 'indigo' || o.name === 'linen' || o.name === 'linenWhite')) o.visible = false;
  const bk = new Kit(mats);
  {
    const k = bk;
    const cx = 10.47, cz = -5.2, mt = FL + 0.3;
    // shikibuton in a white cotton sheet, its edges rounded by the filling
    slab(k.g('linen'), { cx, cz, hw: 0.94, h0: -1.04, h1: 0.89, top: (x, z) => mt - 0.004 - 0.006 * Math.cos((x - cx) * 1.6) * Math.cos((z - cz) * 1.4), R: 0.04, drop: () => 0.08, tuck: 0 });
    // the kakebuton: thick, tied every 36 cm, its sides and foot rolled over the mattress's edge and hanging free
    const qt = (x, z) => {
      const tx = (x - cx) / 0.36 + 0.5, tz = (z - cz + 0.05) / 0.36;
      const dx = (tx - Math.round(tx)) * 0.36, dz = (tz - Math.round(tz)) * 0.36;
      // the ties are sewn in from the edge, which stays full
      const edge = smoothstep(0.02, 0.16, Math.min(0.98 - Math.abs(x - cx), z - cz + 0.6, 0.93 - (z - cz)));
      return mt + 0.07 - 0.024 * edge * Math.exp(-(dx * dx + dz * dz) / 0.006) + 0.005 * edge * Math.sin((x - cx) * 7.0 + (z - cz) * 2.3) * Math.sin((z - cz) * 4.1);
    };
    slab(k.g('futon'), { cx, cz, hw: 0.98, h0: -0.6, h1: 0.93, top: qt, R: 0.065, drop: () => 0.06 });
    // an eri: the white cotton collar buttoned round the quilt's head edge, wrapping the edge and the sides as the
    // quilt's own cover does; its inner edge only a hem lying on the quilt, a few soft creases across it
    const inner = (dz) => smoothstep(0.0, 0.7, dz);
    slab(k.g('linenWhite'), {
      cx, cz, hw: 0.984, h0: -0.6, h1: -0.37,
      top: (x, z) => qt(x, z) + 0.004 + 0.0018 * Math.sin((x - cx) * 9.0 + Math.sin((z - cz) * 13.0) * 1.5) * Math.sin((z - cz + 0.6) * 13.5),
      R: (dz) => 0.068 + (0.004 - 0.068) * inner(dz), drop: (dz) => 0.062 * (1 - inner(dz)) + 0.006 * inner(dz), tuck: 0.004,
    });
    for (const [s, yaw] of [[-0.48, 0.03], [0.48, -0.05]]) pillow(k.g('linenWhite'), vec(cx + s, mt + 0.002, cz - 0.86), 0.28, 0.17, 0.065, yaw);
  }
  // ---- bedroom: a low tray of things by the bed
  k.g('lacquer').boxMM(11.75, FL, -5.95, 12.15, FL + 0.03, -5.65, { grain: 'x', chamfer: 0.004 });
  vessel(k, 'ceramicPale', 11.95, FL + 0.03, -5.8, [[0.04, 0], [0.05, 0.08], [0.03, 0.15], [0.0, 0.15]], 14);

  // ---- bath: a pail and a ladle
  vessel(k, 'hinokiPale', 14.15, FL - 0.15 + 0.25, -3.85, [[0.13, 0], [0.15, 0.17], [0.135, 0.17], [0.115, 0.02], [0.0, 0.02]], 20);

  // ---- irori embers and the irori light
  // charcoal stacked igeta-fashion, two sticks across two, a broken piece or two at the side
  const em = house.emberPoints || [];
  for (const [x, , z] of em) {
    const base = FL + 0.024;
    const yaw0 = R() * Math.PI;
    const stick = (ox, oz, yaw, len, rad, y) => {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const px = x + ox * Math.cos(yaw0) - oz * Math.sin(yaw0), pz = z + ox * Math.sin(yaw0) + oz * Math.cos(yaw0);
      const tilt = (R() - 0.5) * 0.012;
      k.g('ember').tube([vec(px - c * len / 2, y + tilt, pz - s * len / 2), vec(px + c * len / 2, y - tilt, pz + s * len / 2)], [rad, rad * (0.85 + R() * 0.15)], 7, 1);
    };
    const r0 = 0.027, r1 = 0.024;
    for (const sg of [-1, 1]) stick(0, sg * (0.06 + R() * 0.012), yaw0 + (R() - 0.5) * 0.2, 0.21 + R() * 0.04, r0, base + r0 - 0.008);
    for (const sg of [-1, 1]) stick(sg * (0.056 + R() * 0.012), 0, yaw0 + Math.PI / 2 + (R() - 0.5) * 0.25, 0.2 + R() * 0.04, r1, base + 2 * r0 + r1 - 0.02);
    stick(0.15, 0.09, yaw0 + 0.7, 0.07, 0.02, base + 0.012);
    stick(-0.14, -0.11, yaw0 + 2.1, 0.06, 0.018, base + 0.01);
    stick(0.04, -0.16, yaw0 + 1.2, 0.05, 0.016, base + 0.009);
  }
  // hibashi: a pair of iron fire tongs pushed into the ash at the corner of each irori
  for (const [x, , z, r] of em) {
    if (r < 0.3) continue;
    for (const d of [0, 0.018]) k.g('iron').tube([vec(x + 0.3 + d, FL + 0.0, z + 0.3), vec(x + 0.24 + d * 1.6, FL + 0.32, z + 0.22)], [0.004, 0.0035], 5, 1);
  }

  const group = new THREE.Group();
  group.name = 'props';
  k.build(group);
  group.traverse((o) => { if (o.isMesh && o.material === mats.lampPaper) o.castShadow = false; });
  const bedding = bk.build(new THREE.Group());
  bedding.name = 'bedding';
  return { group, mats, bedding };
}

// the bath's water: still and clear over the hinoki, so it takes the wood's colour, darkened by its depth
export function createBathWater(house) {
  const t = house.tub;
  if (!t) return null;
  // the house's lamps lead the scene's lamp list, so their index there is their index here
  const lantern = house.lamps.findIndex((l) => l.kind === 'lantern');
  const r = t.room;
  const m = new THREE.MeshStandardMaterial({ color: 0x2e251b, roughness: 0.06, metalness: 0 });
  patch(m, {
    key: 'bathwater',
    hooks: {
      // it mirrors a room, not the sky: three's image-based reflection here is of the garden panorama, which a still
      // surface swept across its horizon as grey-green blotches, and the room's average light alone read as frosted
      // glass. The reflected ray is traced to the room's box instead: clay and plaster lit by the room's light and the
      // lantern, the dark ceiling, and through the open east side the garden, from the panorama
      light: /* glsl */ `
        {
          vec3 V = normalize(cameraPosition - vSfWP);
          float F = 0.02 + 0.98 * pow(1.0 - max(dot(sfNW, V), 0.0), 5.0);
          vec3 Rr = reflect(-V, sfNW);
          Rr.y = max(Rr.y, 0.02);
          vec3 Rm = vec3(${r[0].toFixed(3)}, 0.0, ${r[1].toFixed(3)}), RM = vec3(${r[2].toFixed(3)}, ${r[4].toFixed(3)}, ${r[3].toFixed(3)});
          vec3 tt = ((mix(Rm, RM, step(0.0, Rr)) - vSfWP) / Rr);
          float th = min(min(tt.x, tt.z), tt.y);
          vec3 h = vSfWP + Rr * th;
          vec3 alb;
          if (th == tt.y) alb = vec3(0.13, 0.085, 0.055);
          else if (th == tt.z && Rr.z > 0.0) alb = vec3(0.78, 0.74, 0.66);
          else alb = vec3(0.46, 0.37, 0.24);
          // a cedar wainscot below the clay, darker posts at the corners
          if (th != tt.y) {
            if (h.y < ${(t.y + 0.75).toFixed(3)}) alb = vec3(0.24, 0.15, 0.09);
            float edge = th == tt.x ? min(abs(h.z - Rm.z), abs(h.z - RM.z)) : min(abs(h.x - Rm.x), abs(h.x - RM.x));
            alb = mix(vec3(0.1, 0.065, 0.04), alb, smoothstep(0.1, 0.12, edge));
          }
          vec3 room = alb * iblIrradiance / PI * 1.15;
          ${lantern < 0 ? '' : /* glsl */ `{
            float dl = length(uLampPos[${lantern}].xyz - h);
            room += alb * uLampCol[${lantern}] * 0.22 / (0.25 + dl * dl);
          }`}
          // out of the open side is the bamboo grove, not the panorama's sky (as clouds on the water, it read as a pool
          // or a stain): drawn by direction, only its brightness the sky's, blurred so no cloud shows
          float lg = dot(getIBLRadiance(geometryViewDir, normal, 0.85), vec3(0.2126, 0.7152, 0.0722));
          // still water mirrors culms nearly straight: the swell bends them only a little
          vec3 Rc = reflect(-V, normalize(mix(sfNW, vec3(0.0, 1.0, 0.0), 0.7)));
          float az = atan(Rc.z, Rc.x), el = Rr.y / max(length(Rr.xz), 1e-3);
          // the grove's dim olive depth, the cream wall glimpsed between culms at eye height, litter below, canopy above
          float wallSeen = smoothstep(0.04, 0.08, el) * (1.0 - smoothstep(0.22, 0.3, el)) * (0.3 + 0.4 * sfNoise(vec2(az * 23.0, 2.0)));
          vec3 garden = mix(vec3(0.16, 0.17, 0.1), vec3(0.6, 0.57, 0.48), wallSeen);
          garden = mix(vec3(0.26, 0.23, 0.16), garden, smoothstep(0.0, 0.05, el));
          garden = mix(garden, vec3(0.11, 0.15, 0.07), smoothstep(0.28, 0.45, el));
          // culms thin and soft-edged, the near ones olive, the far ones darker
          garden = mix(garden, vec3(0.2, 0.25, 0.11), smoothstep(0.5, 0.8, sfNoise(vec2(az * 70.0, 1.3))) * 0.45);
          garden = mix(garden, vec3(0.13, 0.16, 0.08), smoothstep(0.55, 0.85, sfNoise(vec2(az * 140.0, 5.7))) * 0.35);
          garden *= lg * 1.1;
          float open = th == tt.x && Rr.x > 0.0 ? smoothstep(Rm.z, Rm.z + 0.1, h.z) * smoothstep(RM.z, RM.z - 0.1, h.z) * smoothstep(${t.ey1.toFixed(3)}, ${(t.ey1 - 0.12).toFixed(3)}, h.y) : 0.0;
          reflectedLight.indirectSpecular = F * mix(room, garden, open);
          ${lantern < 0 ? '' : /* glsl */ `{
            vec3 L = uLampPos[${lantern}].xyz - vSfWP;
            float d = length(L);
            vec3 H = normalize(L / d + V);
            reflectedLight.indirectSpecular += uLampCol[${lantern}] * F * pow(max(dot(sfNW, H), 0.0), 160.0) * 1.5 / (1.0 + d * d);
          }`}
        }`,
      // clear water: near the sides the wood shows through a few centimetres of it; further in, the depth darkens it
      map: /* glsl */ `
        {
          float dw = min(min(vSfWP.x - ${t.x0.toFixed(3)}, ${t.x1.toFixed(3)} - vSfWP.x), min(vSfWP.z - ${t.z0.toFixed(3)}, ${t.z1.toFixed(3)} - vSfWP.z));
          diffuseColor.rgb = mix(vec3(0.3, 0.21, 0.12), diffuseColor.rgb, smoothstep(0.0, 0.22, dw));
        }`,
      normal: /* glsl */ `
        {
          // still water: slow, shallow swells with no repeat to them, from the overflow at the rim
          vec2 p = vSfWP.xz;
          float e = 0.01;
          vec2 d1 = vec2(uTime * 0.05, -uTime * 0.035), d2 = vec2(-uTime * 0.06, uTime * 0.025);
          float h0 = sfNoise(p * 2.4 + d1) + 0.45 * sfNoise(p * 6.1 + d2);
          float hx = sfNoise((p + vec2(e, 0.0)) * 2.4 + d1) + 0.45 * sfNoise((p + vec2(e, 0.0)) * 6.1 + d2);
          float hz = sfNoise((p + vec2(0.0, e)) * 2.4 + d1) + 0.45 * sfNoise((p + vec2(0.0, e)) * 6.1 + d2);
          vec3 wn = normalize(vec3((h0 - hx) / e * 0.006, 1.0, (h0 - hz) / e * 0.006));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }`,
    },
  });
  const g = new THREE.PlaneGeometry(t.x1 - t.x0, t.z1 - t.z0).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set((t.x0 + t.x1) / 2, t.y, (t.z0 + t.z1) / 2);
  mesh.receiveShadow = true;
  mesh.name = 'bath-water';
  mesh.userData.bake = { skip: true };
  return mesh;
}

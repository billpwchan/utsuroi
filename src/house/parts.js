// Joinery: sliding panels (shoji, fusuma, glass), tatami layouts, ceilings, and the irimoya tile roof.
// Dimensions follow the kyoma module: a ken of 1.82 m, openings 1.76 m high, posts 12 cm.
import * as THREE from 'three';
import { Kit, Geo, vec } from './kit.js';
import { rng } from '../lib/math.js';

export const M = 0.91;
export const OPEN_H = 1.76;

const R = rng(77);
const tint = (k = 0.06) => {
  const v = 1 + (R() - 0.5) * 2 * k;
  return [v, v * (1 + (R() - 0.5) * 0.02), v * (1 + (R() - 0.5) * 0.03)];
};

// ---- sliding panels, built in a panel-local frame: x along the track (0..w), y up (0..h), z thickness ----
// each returns a Kit so a door can be its own animated mesh or be merged into a static kit via a transform.

export function shojiPanel(k, w, h, opts = {}) {
  const fw = 0.03, fd = 0.03; // frame
  const koshi = opts.koshi ?? 0.0; // wooden kickboard height
  const fr = k.g(opts.frame || 'frame'), pa = k.g('paper');
  const col = tint(0.04);
  // stiles and rails
  fr.box(vec(fw / 2, h / 2, 0), vec(fw, h, fd), { grain: 'y', col, chamfer: 0.003 });
  fr.box(vec(w - fw / 2, h / 2, 0), vec(fw, h, fd), { grain: 'y', col, chamfer: 0.003 });
  fr.box(vec(w / 2, h - fw / 2, 0), vec(w - fw * 2, fw, fd), { grain: 'x', col });
  const bot = Math.max(fw, koshi);
  fr.box(vec(w / 2, bot / 2, 0), vec(w - fw * 2, bot, fd * (koshi ? 0.9 : 1)), { grain: 'x', col });
  // kumiko: thin bars, glued to the room side of the paper
  const iw = w - fw * 2, ih = h - fw - bot;
  const cols = opts.cols ?? Math.max(2, Math.round(iw / 0.29));
  const rows = opts.rows ?? Math.max(4, Math.round(ih / 0.25));
  const kw = 0.009, kd = 0.016, kz = -fd / 2 + kd / 2 + 0.003;
  for (let i = 1; i < cols; i++) fr.box(vec(fw + (iw * i) / cols, bot + ih / 2, kz), vec(kw, ih, kd), { grain: 'y', col, noEnds: true });
  for (let j = 1; j < rows; j++) fr.box(vec(fw + iw / 2, bot + (ih * j) / rows, kz), vec(iw, kw, kd), { grain: 'x', col, noEnds: true });
  // paper on the outer face of the lattice
  pa.rect(vec(fw, bot, kz - kd / 2 - 0.001), vec(iw, 0, 0), vec(0, ih, 0), null, R() * 3, R() * 3);
  return k;
}

export function fusumaPanel(k, w, h, opts = {}) {
  const t = 0.022;
  const face = k.g(opts.face || 'fusuma'), fr = k.g('lacquer');
  const b = 0.018;
  // paper faces both sides
  face.rect(vec(b, b, t / 2 + 0.0005), vec(w - 2 * b, 0, 0), vec(0, h - 2 * b, 0), null, opts.uo || 0, 0);
  face.rect(vec(w - b, b, -t / 2 - 0.0005), vec(-(w - 2 * b), 0, 0), vec(0, h - 2 * b, 0), null, (opts.uo || 0) + 0.5, 0);
  // lacquered frame
  fr.box(vec(b / 2, h / 2, 0), vec(b, h, t + 0.004), { grain: 'y' });
  fr.box(vec(w - b / 2, h / 2, 0), vec(b, h, t + 0.004), { grain: 'y' });
  fr.box(vec(w / 2, h - b / 2, 0), vec(w - 2 * b, b, t + 0.004), { grain: 'x' });
  fr.box(vec(w / 2, b / 2, 0), vec(w - 2 * b, b, t + 0.004), { grain: 'x' });
  // hikite pulls
  const hx = opts.pullLeft ? 0.09 : w - 0.09;
  for (const s of [1, -1]) k.g('brass').box(vec(hx, 0.85, s * (t / 2 + 0.002)), vec(0.05, 0.075, 0.004), { grain: 'y' });
  return k;
}

export function glassPanel(k, w, h, opts = {}) {
  const fw = 0.035, fd = 0.032;
  const fr = k.g(opts.frame || 'frame'), gl = k.g('glass');
  const col = tint(0.04);
  fr.box(vec(fw / 2, h / 2, 0), vec(fw, h, fd), { grain: 'y', col, chamfer: 0.003 });
  fr.box(vec(w - fw / 2, h / 2, 0), vec(fw, h, fd), { grain: 'y', col, chamfer: 0.003 });
  fr.box(vec(w / 2, h - fw / 2, 0), vec(w - fw * 2, fw, fd), { grain: 'x', col });
  const kick = opts.kick ?? 0.16;
  fr.box(vec(w / 2, kick / 2, 0), vec(w - fw * 2, kick, fd * 0.9), { grain: 'x', col });
  // two thin muntins: the quiet horizontal lines of sukiya glazing
  for (const f of opts.bars || [0.42, 0.58]) fr.box(vec(w / 2, kick + (h - kick - fw) * f, 0), vec(w - fw * 2, 0.012, 0.016), { grain: 'x', col, noEnds: true });
  gl.rect(vec(fw, kick, 0), vec(w - fw * 2, 0, 0), vec(0, h - kick - fw, 0));
  return k;
}

// lattice door (koshi-do) of the entrance: dense vertical slats over a back board
export function koshiPanel(k, w, h) {
  const fr = k.g('darkwood');
  const fw = 0.04, fd = 0.035;
  fr.box(vec(fw / 2, h / 2, 0), vec(fw, h, fd), { grain: 'y', chamfer: 0.004 });
  fr.box(vec(w - fw / 2, h / 2, 0), vec(fw, h, fd), { grain: 'y', chamfer: 0.004 });
  fr.box(vec(w / 2, h - fw / 2, 0), vec(w - fw * 2, fw, fd), { grain: 'x' });
  fr.box(vec(w / 2, 0.11, 0), vec(w - fw * 2, 0.22, fd), { grain: 'x' });
  const n = Math.round((w - fw * 2) / 0.034);
  for (let i = 0; i < n; i++) fr.box(vec(fw + ((i + 0.5) * (w - fw * 2)) / n, 0.22 + (h - 0.22 - fw) / 2, 0.006), vec(0.016, h - 0.22 - fw, 0.022), { grain: 'y', noEnds: true });
  // rails behind the slats
  for (const f of [0.33, 0.66]) fr.box(vec(w / 2, 0.22 + (h - 0.26) * f, -0.008), vec(w - fw * 2, 0.02, 0.012), { grain: 'x' });
  // paper behind, so light glows through the slats from the doma at night
  k.g('paper').rect(vec(fw, 0.22, -0.016), vec(w - fw * 2, 0, 0), vec(0, h - 0.22 - fw, 0));
  return k;
}

// merge one kit's geometry into another through a matrix
export function mergeKit(dst, src, mat4) {
  const nmat = new THREE.Matrix3().getNormalMatrix(mat4);
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (const [name, g] of src.geos) {
    const d = dst.g(name);
    const base = d.vc;
    for (let i = 0; i < g.vc; i++) {
      p.fromArray(g.p, i * 3).applyMatrix4(mat4);
      n.fromArray(g.n, i * 3).applyMatrix3(nmat).normalize();
      d.p.push(p.x, p.y, p.z);
      d.n.push(n.x, n.y, n.z);
      d.uv.push(g.uv[i * 2], g.uv[i * 2 + 1]);
      d.c.push(g.c[i * 3], g.c[i * 3 + 1], g.c[i * 3 + 2]);
    }
    d.vc += g.vc;
    for (const i of g.idx) d.idx.push(i + base);
  }
}

// ---- tatami ----
// layout: list of [x, z, rotated] in mat units (a mat is 1 x 2 units of 0.91 m; rotated = long side along z)
export function tatami(k, x0, z0, y, layout, mat = 'tatami') {
  const g = k.g(mat);
  for (const [mx, mz, rot, kind] of layout) {
    const hm = kind === 'half';
    const w = hm ? M : rot ? M : 2 * M, d = hm ? M : rot ? 2 * M : M;
    const cx = x0 + mx * M + w / 2, cz = z0 + mz * M + d / 2;
    const t = 0.05;
    const half = R() < 0.5 ? 0 : 0.5;
    // the texture holds two mats stacked; each mat is the full width and half the height
    const top = (u0, v0, u1, v1) => [u0, v0, u1, v0, u1, v1, u0, v1];
    const col = tint(0.035);
    const a = vec(cx - w / 2 + 0.002, y, cz + d / 2 - 0.002), b = vec(cx + w / 2 - 0.002, y, cz + d / 2 - 0.002);
    const c = vec(cx + w / 2 - 0.002, y, cz - d / 2 + 0.002), e = vec(cx - w / 2 + 0.002, y, cz - d / 2 + 0.002);
    // u along the long side in metres (texture repeat is 1/1.82), v across
    if (hm) g.quad(a, b, c, e, top(0.3, half * 1.82, 1.21, half * 1.82 + 0.91), col, vec(0, 1, 0));
    else if (!rot) g.quad(a, b, c, e, top(0, half * 1.82, 1.82, half * 1.82 + 0.91), col, vec(0, 1, 0));
    else g.quad(a, b, c, e, [1.82, half * 1.82, 1.82, half * 1.82 + 0.91, 0, half * 1.82 + 0.91, 0, half * 1.82], col, vec(0, 1, 0));
    // sides
    const s = k.g('tatami');
    s.box(vec(cx, y - t / 2 - 0.003, cz), vec(w - 0.004, t, d - 0.004), { grain: rot ? 'z' : 'x', noEnds: false, col: [0.8, 0.8, 0.72] });
  }
}

// standard layouts in mat units for rooms of the given size
export const LAYOUTS = {
  // 4.5 mats, 3 x 3 units, half mat in the centre (for the hearth)
  4.5: [[0, 0, 0], [2, 0, 1], [1, 2, 0], [0, 1, 1], [1, 1, 0, 'half']],
  6: [[0, 0, 0], [2, 0, 0], [0, 1, 1], [1, 1, 1], [2, 1, 0], [2, 2, 0]], // 4 x 3
  8: [[0, 0, 1], [1, 0, 0], [1, 1, 0], [3, 0, 1], [0, 2, 0], [2, 2, 1], [3, 2, 1], [0, 3, 0]], // 4 x 4
  10: [[0, 0, 0], [2, 0, 0], [4, 0, 1], [0, 1, 1], [1, 1, 0], [3, 1, 1], [1, 2, 0], [0, 3, 0], [2, 3, 0], [4, 2, 1]], // 5 x 4
};

// ---- ceilings ----
// sao-buchi: thin boards over battens at ~45 cm, rim moulding round the walls
export function saoCeiling(k, x0, z0, x1, z1, y, dir = 'x') {
  const b = k.g('ceiling');
  b.quad(vec(x0, y, z0), vec(x1, y, z0), vec(x1, y, z1), vec(x0, y, z1), dir === 'x' ? [x0, z0, x1, z0, x1, z1, x0, z1] : [z0, x0, z0, x1, z1, x1, z1, x0], tint(0.03), vec(0, -1, 0));
  const w = k.g('hinoki');
  const span = dir === 'x' ? z1 - z0 : x1 - x0;
  const n = Math.max(2, Math.round(span / 0.45));
  for (let i = 1; i < n; i++) {
    const f = i / n;
    if (dir === 'x') w.boxMM(x0, y - 0.026, z0 + span * f - 0.012, x1, y, z0 + span * f + 0.012, { grain: 'x', noEnds: true });
    else w.boxMM(x0 + span * f - 0.012, y - 0.026, z0, x0 + span * f + 0.012, y, z1, { grain: 'z', noEnds: true });
  }
  // mawaribuchi
  w.boxMM(x0, y - 0.045, z0, x1, y, z0 + 0.045, { grain: 'x' });
  w.boxMM(x0, y - 0.045, z1 - 0.045, x1, y, z1, { grain: 'x' });
  w.boxMM(x0, y - 0.045, z0, x0 + 0.045, y, z1, { grain: 'z' });
  w.boxMM(x1 - 0.045, y - 0.045, z0, x1, y, z1, { grain: 'z' });
}

// ---- irimoya roof with real tile relief ----
// footprint: wall line rectangle; o: eave overhang; ye: eave height at the outer edge; pitch: rise per run;
// axis: ridge direction 'x' or 'z'; gable: fraction of the half depth at which the hips stop and the gable begins
export function irimoyaRoof(k, opt) {
  const { x0, x1, z0, z1, o, ye, pitch, axis = 'x', gable = 0.55, wallY } = opt;
  // work in a frame where the ridge runs along local u; local w across (front +w)
  const swap = axis === 'z';
  const U0 = (swap ? z0 : x0) - o, U1 = (swap ? z1 : x1) + o;
  const W0 = (swap ? x0 : z0) - o, W1 = (swap ? x1 : z1) + o;
  const Dh = (W1 - W0) / 2, Wm = (W0 + W1) / 2;
  const H = ye + Dh * pitch;
  const wk = gable * Dh; // hip inset where the gable starts
  const Hk = ye + wk * pitch;
  const ov = 0.35; // upper gable overhang beyond the gable face
  const P = (u, y, w) => (swap ? vec(w, y, u) : vec(u, y, w));
  const tile = k.g('tile');

  // tile relief on a sloping face. Local coords: s along the eave (metres), t up-slope (metres along the slope).
  // width at t: from sL(t) to sR(t). Displacement along the face normal.
  const slopeLen = Math.hypot(Dh, Dh * pitch);
  const cosA = 1 / Math.hypot(1, pitch);
  const relief = (s, t) => {
    // S-pan tiles: rounded rolls every 0.29 m; courses every 0.235 m overlap with a lip
    const ph = (s / 0.29) * Math.PI * 2;
    const roll = Math.pow(Math.max(0, Math.cos(ph)), 0.6) * 0.045 - 0.012;
    const ct = t / 0.235;
    const f = ct - Math.floor(ct);
    const lip = (1 - f) * 0.022;
    return roll + lip;
  };
  const face = (origin, sDir, tDir, nrm, sL, sR, tMax, flipU) => {
    // origin: point at s=0,t=0 on the eave line; sDir along eave, tDir up the slope (unit vectors)
    const rows = Math.ceil(tMax / 0.059);
    const smax = Math.max(sR(0) - sL(0), sR(tMax) - sL(tMax));
    const cols = Math.ceil(smax / 0.048);
    const base = tile.vc;
    const eps = 0.01;
    for (let j = 0; j <= rows; j++) {
      const t = (j / rows) * tMax;
      const a = sL(t), b = sR(t);
      for (let i = 0; i <= cols; i++) {
        const s = a + ((b - a) * i) / cols;
        const d = relief(s, t);
        const ds = (relief(s + eps, t) - d) / eps, dt = (relief(s, t + eps) - d) / eps;
        const p = origin.clone().addScaledVector(sDir, s).addScaledVector(tDir, t).addScaledVector(nrm, d + 0.02);
        const n = nrm.clone().addScaledVector(sDir, -ds).addScaledVector(tDir, -dt).normalize();
        tile.vert(p, n, flipU ? -s : s, t, null);
      }
    }
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const a = base + j * (cols + 1) + i, b = a + cols + 1;
        if (flipU) tile.idx.push(a, a + 1, b, a + 1, b + 1, b);
        else tile.idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    // its shadow stand-in: the same outline, flat, just under the lowest tile
    const sh = k.g('tileShadow'), sb = sh.vc, srows = Math.ceil(tMax / 0.1);
    for (let j = 0; j <= srows; j++) {
      const t = (j / srows) * tMax;
      for (const s of [sL(t), sR(t)]) sh.vert(origin.clone().addScaledVector(sDir, s).addScaledVector(tDir, t), nrm, 0, 0, null);
    }
    for (let j = 0; j < srows; j++) sh.idx.push(sb + j * 2, sb + j * 2 + 2, sb + j * 2 + 1, sb + j * 2 + 1, sb + j * 2 + 2, sb + j * 2 + 3);
  };
  const lenU = U1 - U0;
  // front (+w) and back main planes
  for (const side of [1, -1]) {
    const eaveW = side > 0 ? W1 : W0;
    const origin = P(U0, ye, eaveW);
    const sDir = swap ? vec(0, 0, 1) : vec(1, 0, 0);
    const up = P(0, Dh * pitch, -side * Dh).sub(P(0, 0, 0)).normalize(); // up-slope direction
    const nrm = new THREE.Vector3().crossVectors(sDir, up).normalize();
    if (nrm.y < 0) nrm.negate();
    const tk = wk / cosA; // slope length to the gable line
    const sL = (t) => (t < tk ? t * cosA : wk - ov * Math.min(1, (t - tk) / 0.4));
    const sR = (t) => lenU - sL(t);
    const flip = (side > 0) === swap;
    face(origin, sDir, up, nrm, sL, sR, slopeLen, !flip);
  }
  // hip ends: trapezoids rising from the end eaves to the gable line
  for (const end of [-1, 1]) {
    const eaveU = end < 0 ? U0 : U1;
    const origin = P(eaveU, ye, W0);
    const sDir = swap ? vec(1, 0, 0) : vec(0, 0, 1);
    const up = P(-end * wk, wk * pitch, 0).sub(P(0, 0, 0)).normalize();
    const nrm = new THREE.Vector3().crossVectors(sDir, up).normalize();
    if (nrm.y < 0) nrm.negate();
    const tMax = wk / cosA;
    const span = W1 - W0;
    const sL = (t) => t * cosA;
    const sR = (t) => span - t * cosA;
    const flip = (end < 0) !== swap;
    face(origin, sDir, up, nrm, sL, sR, tMax, flip);
  }
  // gable faces: plastered triangle with a lattice and barge boards
  for (const end of [-1, 1]) {
    const gu = end < 0 ? U0 + wk : U1 - wk;
    const zf = W1 - wk, zb = W0 + wk;
    const pl = k.g('plaster');
    const a = P(gu, Hk, zf), b = P(gu, Hk, zb), c = P(gu, H - 0.05, Wm);
    if ((end < 0) !== swap) pl.tri(a, c, b, [0, 0, 1, 1, 2, 0]); else pl.tri(a, b, c, [0, 0, 2, 0, 1, 1]);
    // barge boards (hafu) following the upper gable edge, slightly proud of the tiles
    const hafu = k.g('weathered');
    for (const s of [1, -1]) {
      const from = P(gu + end * ov, Hk - 0.05, s > 0 ? zf + 0.2 : zb - 0.2);
      const to = P(gu + end * ov, H + 0.08, Wm);
      const mid = from.clone().add(to).multiplyScalar(0.5);
      const len = from.distanceTo(to);
      const dir = to.clone().sub(from).normalize();
      const g = new Geo();
      g.box(vec(0, 0, 0), vec(len, 0.24, 0.05), { grain: 'x', chamfer: 0.006 });
      const m = new THREE.Matrix4();
      const xAxis = dir, zAxis = swap ? vec(0, 0, 1) : vec(1, 0, 0);
      const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
      m.makeBasis(xAxis, yAxis, zAxis.clone().crossVectors(xAxis, yAxis).normalize());
      m.setPosition(mid);
      const kk = new Kit({});
      kk.geos.set('weathered', g);
      mergeKit(k, kk, m);
    }
    // gegyo ornament at the apex
    k.g('weathered').box(P(gu + end * (ov + 0.03), H - 0.25, Wm), vec(0.05, 0.36, 0.42), { grain: 'y' });
  }
  // ridges: stacked noshi tiles under a round cap; onigawara at the ends
  const ridge = k.g('tileRidge');
  const rU0 = U0 + wk - ov - 0.1, rU1 = U1 - wk + ov + 0.1;
  const ridgeBox = (u0, u1, y, w, h) => {
    const c = P((u0 + u1) / 2, y, Wm);
    ridge.box(c, swap ? vec(w, h, u1 - u0) : vec(u1 - u0, h, w), { grain: swap ? 'z' : 'x', chamfer: 0.01 });
  };
  ridgeBox(rU0, rU1, H + 0.06, 0.34, 0.12);
  ridgeBox(rU0 + 0.03, rU1 - 0.03, H + 0.17, 0.3, 0.1);
  ridgeBox(rU0 + 0.06, rU1 - 0.06, H + 0.26, 0.26, 0.08);
  {
    const pts = [P(rU0 + 0.04, H + 0.33, Wm), P(rU1 - 0.04, H + 0.33, Wm)];
    ridge.tube(pts, [0.11, 0.11], 10, 0.6);
  }
  for (const u of [rU0, rU1]) {
    const c = P(u, H + 0.3, Wm);
    ridge.box(c, swap ? vec(0.5, 0.62, 0.14) : vec(0.14, 0.62, 0.5), { grain: 'y', chamfer: 0.03 });
  }
  // hip ridges from the eave corners to the gable base
  for (const end of [-1, 1])
    for (const side of [-1, 1]) {
      const a = P(end < 0 ? U0 : U1, ye + 0.06, side > 0 ? W1 : W0);
      const b = P(end < 0 ? U0 + wk : U1 - wk, Hk + 0.08, side > 0 ? W1 - wk : W0 + wk);
      ridge.tube([a, b], [0.085, 0.085], 8, 0.5);
      // and the short descending ridge down the gable edge
      const c = P(end < 0 ? U0 + wk - ov * 0.2 : U1 - wk + ov * 0.2, Hk + 0.1, side > 0 ? W1 - wk : W0 + wk);
      const d = P(end < 0 ? U0 + wk - ov * 0.2 : U1 - wk + ov * 0.2, H + 0.05, Wm);
      ridge.tube([c, d], [0.075, 0.075], 8, 0.5);
    }
  // eave fascia and rafters underneath (seen from the engawa)
  const fas = k.g('weathered');
  const ft = 0.05;
  const wy = wallY ?? ye - 0.35;
  const eaveRun = o;
  for (const side of [1, -1]) {
    const eaveW = side > 0 ? W1 : W0;
    fas.box(P((U0 + U1) / 2, ye - 0.06, eaveW + side * 0.005), swap ? vec(ft, 0.13, lenU) : vec(lenU, 0.13, ft), { grain: swap ? 'z' : 'x' });
    // soffit boards
    const soff = k.g('ceiling');
    const wallW = eaveW - side * eaveRun;
    const ys = ye - 0.13, yw = wy;
    const a = P(U0 + 0.05, ys, eaveW), b = P(U1 - 0.05, ys, eaveW), c = P(U1 - 0.05, yw + 0.02, wallW), d = P(U0 + 0.05, yw + 0.02, wallW);
    if ((side > 0) !== swap) soff.quad(a, d, c, b, [0, 0, 0, 1, 4, 1, 4, 0], [0.75, 0.72, 0.68]);
    else soff.quad(a, b, c, d, [0, 0, 4, 0, 4, 1, 0, 1], [0.75, 0.72, 0.68]);
    // taruki
    const n = Math.floor(lenU / 0.42);
    for (let i = 1; i < n; i++) {
      const u = U0 + (lenU * i) / n;
      const from = P(u, ys - 0.05, eaveW - side * 0.02), to = P(u, yw - 0.02, wallW);
      const g = new Geo();
      g.box(vec(0, 0, 0), vec(from.distanceTo(to), 0.07, 0.055), { grain: 'x', chamfer: 0.004 });
      const dir = to.clone().sub(from).normalize();
      const zAxis = swap ? vec(0, 0, 1) : vec(1, 0, 0);
      const yAxis = new THREE.Vector3().crossVectors(zAxis, dir).normalize();
      const m = new THREE.Matrix4().makeBasis(dir, yAxis, new THREE.Vector3().crossVectors(dir, yAxis));
      m.setPosition(from.clone().add(to).multiplyScalar(0.5));
      const kk = new Kit({});
      kk.geos.set('weathered', g);
      mergeKit(k, kk, m);
    }
  }
  for (const end of [-1, 1]) {
    const eaveU = end < 0 ? U0 : U1;
    fas.box(P(eaveU + end * 0.005, ye - 0.06, Wm), swap ? vec(W1 - W0, 0.13, ft) : vec(ft, 0.13, W1 - W0), { grain: swap ? 'x' : 'z' });
    const soff = k.g('ceiling');
    const ys = ye - 0.13;
    const wallU = eaveU - end * eaveRun;
    const a = P(eaveU, ys, W0 + 0.05), b = P(eaveU, ys, W1 - 0.05), c = P(wallU, wy + 0.02, W1 - 0.05), d = P(wallU, wy + 0.02, W0 + 0.05);
    if ((end > 0) === swap) soff.quad(a, b, c, d, [0, 0, 4, 0, 4, 1, 0, 1], [0.75, 0.72, 0.68]);
    else soff.quad(a, d, c, b, [0, 0, 0, 1, 4, 1, 4, 0], [0.75, 0.72, 0.68]);
  }
  return { H, Hk, wk, U0, U1, W0, W1 };
}

// simple gable roof (kirizuma) for the bridge corridor and gate
export function gableRoof(k, opt) {
  const { x0, x1, z0, z1, o, ye, pitch, axis = 'x' } = opt;
  const swap = axis === 'z';
  const U0 = (swap ? z0 : x0) - o * 0.6, U1 = (swap ? z1 : x1) + o * 0.6;
  const W0 = (swap ? x0 : z0) - o, W1 = (swap ? x1 : z1) + o;
  const Dh = (W1 - W0) / 2, Wm = (W0 + W1) / 2, H = ye + Dh * pitch;
  const P = (u, y, w) => (swap ? vec(w, y, u) : vec(u, y, w));
  const t = k.g('copper');
  const th = 0.06;
  for (const side of [1, -1]) {
    const e = side > 0 ? W1 : W0;
    const a = P(U0, ye, e), b = P(U1, ye, e), c = P(U1, H, Wm), d = P(U0, H, Wm);
    const slope = Math.hypot(Dh, Dh * pitch);
    if ((side > 0) !== swap) t.quad(a, b, c, d, [0, 0, U1 - U0, 0, U1 - U0, slope, 0, slope]);
    else t.quad(a, d, c, b, [0, 0, 0, slope, U1 - U0, slope, U1 - U0, 0]);
    // underside
    const s = k.g('ceiling');
    const a2 = a.clone().setY(ye - th), b2 = b.clone().setY(ye - th), c2 = c.clone().setY(H - th), d2 = d.clone().setY(H - th);
    if ((side > 0) !== swap) s.quad(a2, d2, c2, b2, [0, 0, 0, 1, 3, 1, 3, 0], [0.7, 0.68, 0.64]);
    else s.quad(a2, b2, c2, d2, [0, 0, 3, 0, 3, 1, 0, 1], [0.7, 0.68, 0.64]);
    k.g('weathered').box(P((U0 + U1) / 2, ye - th / 2, e), swap ? vec(0.04, th + 0.04, U1 - U0) : vec(U1 - U0, th + 0.04, 0.04), { grain: swap ? 'z' : 'x' });
  }
  k.g('copper').box(P((U0 + U1) / 2, H + 0.04, Wm), swap ? vec(0.14, 0.1, U1 - U0 + 0.1) : vec(U1 - U0 + 0.1, 0.1, 0.14), { grain: swap ? 'z' : 'x', chamfer: 0.02 });
  return { H };
}

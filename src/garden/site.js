// The site plan: one place that knows where the pond, the stream, the mounds, the paths and the walls are,
// so the terrain, the ground shader, the water, the rocks and the planting all agree.
// +x east, +z south. The house faces south over the garden; the gate is in the south wall below the genkan.
import { clamp, smoothstep, fbm, vnoise } from '../lib/math.js';

export const WATER_Y = -0.16;
export const WALL = { x0: -32, x1: 27, z0: -15, z1: 17.5, gate: [-23.4, -19.6] };
export const GATE = { x: -21.5, z: 17.5 };

// the pond as a union of ellipses with a smooth minimum, so its outline has bays and a narrow neck
const POND = [
  [-3.2, 6.6, 4.4, 2.5, 0.25],
  [1.8, 8.4, 3.8, 2.9, -0.2],
  [-7.6, 9.4, 2.6, 1.8, 0.5],
  [5.2, 6.4, 1.8, 1.4, 0.3],
];
// the stream: from the spring in the courtyard, under the bridge, into the pond
export const STREAM = [
  [-2.6, -4.6], [-2.85, -3.2], [-2.55, -1.6], [-2.75, 0.0], [-2.6, 1.4], [-3.0, 2.6], [-3.3, 4.0],
];
const STREAM_W = 0.42;

function ellipseD(x, z, e) {
  const [cx, cz, rx, rz, rot] = e;
  const c = Math.cos(rot), s = Math.sin(rot);
  const dx = x - cx, dz = z - cz;
  const u = (dx * c + dz * s) / rx, v = (-dx * s + dz * c) / rz;
  return (Math.sqrt(u * u + v * v) - 1) * Math.min(rx, rz);
}
function smin(a, b, k) {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
}
function segD(x, z, a, b) {
  const px = x - a[0], pz = z - a[1], bx = b[0] - a[0], bz = b[1] - a[1];
  const t = clamp((px * bx + pz * bz) / (bx * bx + bz * bz), 0, 1);
  return Math.hypot(px - bx * t, pz - bz * t);
}

// signed distance to the water's edge (negative inside), with a ragged shoreline
export function pondD(x, z) {
  let d = 1e9;
  for (const e of POND) d = smin(d, ellipseD(x, z, e), 1.6);
  return d + fbm(x * 0.35, z * 0.35, 3) * 0.35;
}
export function streamD(x, z) {
  let d = 1e9;
  for (let i = 0; i < STREAM.length - 1; i++) d = Math.min(d, segD(x, z, STREAM[i], STREAM[i + 1]));
  return d - STREAM_W * (0.85 + 0.3 * vnoise(x * 1.3, z * 1.3));
}
export const waterD = (x, z) => Math.min(pondD(x, z), streamD(x, z));
// a box around all open water, with room for the smooth union's bulge: the mirror confines itself to it
export function waterBounds(pad = 0.6) {
  const b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  const grow = (x, z, r) => { b.x0 = Math.min(b.x0, x - r); b.x1 = Math.max(b.x1, x + r); b.z0 = Math.min(b.z0, z - r); b.z1 = Math.max(b.z1, z + r); };
  for (const [cx, cz, rx, rz] of POND) grow(cx, cz, Math.max(rx, rz) + pad);
  for (const [x, z] of STREAM) grow(x, z, STREAM_W * 1.3 + pad);
  return b;
}

// the house footprints with their engawa, for drip lines and for keeping planting off the floor
export const FOOT = [
  { x0: -22.75, x1: -15.47, z0: -3.64, z1: 1.82, o: 1.05 },
  { x0: -15.47, x1: -4.55, z0: -5.46, z1: 1.82, o: 1.3 },
  { x0: -4.55, x1: -0.91, z0: 0.455, z1: 1.82, o: 0.45 },
  { x0: -0.91, x1: 9.1, z0: -6.37, z1: 1.82, o: 1.15 },
  { x0: 9.4, x1: 16.38, z0: -8.19, z1: -1.82, o: 1.05 },
  { x0: 16.38, x1: 17.78, z0: -7.28, z1: -2.73, o: 0.3 },
];
// the courtyard between the shoin and the living wing is open to the sky
export const COURT = { x0: -4.55, x1: -0.91, z0: -5.46, z1: 0.455 };

function rectD(x, z, r) {
  const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1);
  const out = Math.hypot(dx, dz);
  if (out > 0) return out;
  return -Math.min(x - r.x0, r.x1 - x, z - r.z0, r.z1 - z);
}
// distance to the nearest roofed footprint, and how far its eave reaches
export function houseD(x, z) {
  let best = 1e9, o = 1;
  for (const f of FOOT) {
    const d = rectD(x, z, f);
    if (d < best) { best = d; o = f.o; }
  }
  return { d: best, o };
}
const inCourt = (x, z) => x > COURT.x0 && x < COURT.x1 && z > COURT.z0 && z < COURT.z1;

// gravel courts: the dry garden before the private wing and a strip of sand before the shoin
export const KARE = { x0: 9.6, x1: 21.5, z0: 0.2, z1: 10.5 };
export function kareD(x, z) {
  // a rectangle with one corner eaten by the moss mound
  const r = rectD(x, z, KARE);
  const mound = Math.hypot(x - 19.5, z - 9.2) - 3.4;
  return Math.max(r, -mound);
}

// rocks in the gravel: [x, z, rock id, size (m, longest horizontal), yaw, sink fraction] — a 7-5-3 group and an island
export const KARE_ROCKS = [
  [13.2, 4.6, 'b2', 2.3, 0.6, 0.22],
  [14.75, 5.5, 'r7', 1.25, 2.1, 0.12],
  [12.2, 5.85, 'r9', 0.95, 4.2, 0.15],
  [18.0, 3.2, 'b5', 1.6, 1.3, 0.2],
  [17.0, 3.95, 'r9', 0.7, 0.4, 0.15],
];

// paths: stepping stones from the gate to the genkan, and around the pond to the engawa
export const PATHS = [
  { pts: [[-21.5, 17.0], [-21.3, 14.2], [-21.9, 11.0], [-21.2, 7.6], [-21.0, 4.6], [-20.5, 2.6]], w: 1.15, kind: 'nobedan' },
  { pts: [[-21.0, 9.0], [-18.0, 8.2], [-14.6, 7.0], [-11.4, 5.4], [-9.6, 4.0]], w: 0.5, kind: 'tobi' },
  { pts: [[6.4, 2.5], [7.6, 4.6], [9.0, 6.4]], w: 0.5, kind: 'tobi' },
];
function pathD(x, z, p) {
  let d = 1e9;
  for (let i = 0; i < p.pts.length - 1; i++) d = Math.min(d, segD(x, z, p.pts[i], p.pts[i + 1]));
  return d;
}
export const pathsD = (x, z) => Math.min(...PATHS.map((p) => pathD(x, z, p) - p.w * 0.5));
// the paved walk alone (the stepping stones are their own path: moss runs up to them)
export const pavedD = (x, z) => Math.min(...PATHS.filter((p) => p.kind === 'nobedan').map((p) => pathD(x, z, p) - p.w * 0.5));
// the approach outside the gate: fitted stone out into the woods, bending away so the gate is come upon rather than
// seen from afar
export const APPROACH = { pts: [[-21.5, 17.6], [-21.4, 25.0], [-20.4, 33.0], [-18.2, 41.0], [-16.8, 50.0], [-16.4, 62.0]], w: 1.7 };
export const approachD = (x, z) => pathD(x, z, APPROACH) - APPROACH.w * 0.5;
// metres outside the wall's centre line (Chebyshev), negative inside
export const wallOut = (x, z) => Math.max(WALL.x0 - x, x - WALL.x1, WALL.z0 - z, z - WALL.z1);

// mounds of moss (tsukiyama)
const MOUNDS = [
  [-14.2, 11.6, 4.2, 1.15],
  [-9.0, 14.0, 3.0, 0.7],
  [19.5, 9.4, 3.4, 0.75],
  [4.5, 13.6, 4.5, 0.95],
  [-27.5, 4.0, 3.2, 0.6],
  [-27.0, -9.0, 4.0, 0.5],
  [22.5, -11.5, 4.0, 0.45],
];

function moundsAt(x, z) {
  let h = 0;
  for (const [mx, mz, r, a] of MOUNDS) {
    const d2 = ((x - mx) ** 2 + (z - mz) ** 2) / (r * r);
    if (d2 < 4) h += a * Math.exp(-d2 * 1.6);
  }
  return h;
}

// the roji's tsukubai stands in its umi, a shallow hollow of pebbles cut level into the foot of the mound
export const ROJI = { x: -17.9, z: 10.2 };
const ROJI_Y = moundsAt(ROJI.x, ROJI.z);
const rojiD = (x, z) => Math.hypot(x - ROJI.x, z - ROJI.z);

// far land: Higashiyama-like ridges east and north, gentle beyond the south wall
function farLand(x, z) {
  const r = Math.hypot(x, z);
  const k = smoothstep(55, 260, r);
  if (k <= 0) return 0;
  const a = Math.atan2(z, x);
  // ranges highest to the north-east, a low saddle to the south-west where the pagoda stands
  const dir = 0.55 + 0.45 * Math.cos(a + 1.1);
  const ridges = 0.55 + 0.45 * fbm(x * 0.0035 + 3.1, z * 0.0035 - 1.7, 5);
  const fine = fbm(x * 0.02, z * 0.02, 3) * 0.08;
  return k * (6 + Math.pow(smoothstep(80, 900, r), 0.8) * 240 * dir * ridges) * (1 + fine);
}

export function heightAt(x, z) {
  let h = moundsAt(x, z);
  // the ground undulates a little everywhere outside the gravel and away from the house
  const hd = houseD(x, z).d;
  const rd = rojiD(x, z);
  const flat = smoothstep(0.5, 4.0, hd) * smoothstep(-0.2, 1.4, kareD(x, z)) * smoothstep(0.9, 1.8, rd);
  h += fbm(x * 0.18, z * 0.18, 3) * 0.12 * flat;
  // the gravel is dead level out to its kerb; the moss mound rises only behind the kerb
  const kd = kareD(x, z);
  if (kd < 0.6) h *= smoothstep(0.08, 0.6, kd);
  if (rd < 1.8) h += (ROJI_Y - h) * smoothstep(1.8, 0.95, rd) - 0.05 * smoothstep(0.8, 0.5, rd);
  // water: a bank down to the surface, then a bowl
  const pd = pondD(x, z), sd = streamD(x, z);
  const bank = (d, depth, slope) => (d < 0.9 ? WATER_Y + 0.05 - depth * smoothstep(-0.05, -slope, d) + (h - WATER_Y - 0.05) * smoothstep(0.0, 0.9, d) : null);
  const bp = bank(pd, 0.7, 1.8);
  const bs = bank(sd, 0.22, 0.35);
  if (bp !== null) h = bp;
  if (bs !== null) h = Math.min(h, bs);
  // the courtyard stays level (the spring basin is its own object)
  if (inCourt(x, z) && sd > 0.05) h = Math.max(h, 0.0);
  h += farLand(x, z);
  return h;
}

// what covers the ground: moss, gravel, pebbles (drip lines), packed earth, cut stone path
export function coverAt(x, z) {
  const { d: hd, o } = houseD(x, z);
  const n = vnoise(x * 0.9, z * 0.9), n2 = vnoise(x * 3.1 + 7, z * 3.1);
  const wd = waterD(x, z);
  let moss = 1, gravel = 0, pebble = 0, earth = 0, path = 0;
  // the drip line: a band of dark river pebbles where the eave water falls, a stone kerb on its garden side
  const drip = Math.abs(hd - o + 0.05);
  if (hd > -0.1 && drip < 0.32) pebble = 1;
  // under the eaves and the engawa: dry, bare earth
  if (hd < o - 0.37) earth = 1;
  // gravel courts with a ragged moss edge
  const kd = kareD(x, z);
  if (kd < -0.02) gravel = 1;
  // white sand in the courtyard
  if (inCourt(x, z)) gravel = 1;
  // the tsukubai's umi
  if (rojiD(x, z) < 0.72 + (n - 0.5) * 0.12) pebble = 1;
  // paths
  const pd = pathsD(x, z), pv = pavedD(x, z);
  if (pv < 0.05) path = 1;
  else if (pv < 0.5) earth = Math.max(earth, smoothstep(0.5, 0.1, pv + (n - 0.5) * 0.3) * 0.7);
  // between stepping stones the moss is only worn thin, darker where the soil shows
  else if (pd < 0.45) earth = Math.max(earth, smoothstep(0.45, 0.0, pd + (n - 0.5) * 0.3) * 0.35);
  // the banks: stones and wet earth, moss right to the water elsewhere
  if (wd < 0.25) earth = Math.max(earth, smoothstep(0.25, -0.2, wd));
  // outside the walls: forest floor
  const outside = x < WALL.x0 + 0.6 || x > WALL.x1 - 0.6 || z < WALL.z0 + 0.6 || z > WALL.z1 - 0.6;
  if (outside) { earth = 1; moss = 0.35 + n * 0.3; }
  // moss thins where it is trampled or dry, with patchy edges
  moss *= smoothstep(0.18, 0.5, n * 0.6 + n2 * 0.4 + 0.25);
  return { moss, gravel, pebble, earth, path };
}

export const SITE_TEX = { x0: -36, x1: 30, z0: -18, z1: 22 };

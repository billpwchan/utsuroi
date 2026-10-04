// Garden trees: weeping cherry, momiji and black pine (modelled wood, scanned leaves), broadleaf, sugi cedar, bamboo, plus cheap far-hill forms.
// Each species has a few variants built once and instanced; the garden's specimens are placed by hand.
import * as THREE from 'three';
import { patch, WIND_GLSL, U } from '../core/shared.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Builder } from '../lib/geo.js';
import { loadGLB, meshesOf } from '../core/assets.js';
import { LAYER_NOREFL, LAYER_LO } from '../core/pipeline.js';
import { rng, clamp, smoothstep } from '../lib/math.js';
import { FOOT } from './site.js';

// crowns are pruned at the house: nothing of a tree may show inside the walls, whatever the wind does
const f3 = (v) => v.toFixed(3);
const HOUSE_CLIP = /* glsl */ `
bool sfInHouse(vec3 p){
  if (p.y > 7.0) return false;
  ${FOOT.map((f) => `if (p.x > ${f3(f.x0)} && p.x < ${f3(f.x1)} && p.z > ${f3(f.z0)} && p.z < ${f3(f.z1)}) return true;`).join('\n  ')}
  return false;
}`;

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

function randUnit(R) {
  const u = R.range(-1, 1), a = R.next() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return V(Math.cos(a) * s, u, Math.sin(a) * s);
}

// a branch that wanders from p0 along dir, bending by 'pull' each step
function limb(R, p0, dir, len, steps, pull, wander) {
  const pts = [p0.clone()];
  const d = dir.clone();
  const p = p0.clone();
  for (let i = 0; i < steps; i++) {
    d.add(pull.clone().multiplyScalar(1 / steps)).add(randUnit(R).multiplyScalar(wander)).normalize();
    p.addScaledVector(d, len / steps);
    pts.push(p.clone());
  }
  return { pts, dir: d };
}

// trees modelled elsewhere, loaded before the garden is built: their wood, and anchors for their leaves
const SCANNED = {};
export async function loadTreeScans() {
  const scan = async (name) => {
    const [root, lo, cards] = await Promise.all([loadGLB(name), loadGLB(name + '_lo'), fetch(`./assets/glb/${name}_cards.bin`).then((r) => r.arrayBuffer())]);
    return { wood: meshesOf(root)[0].geometry, lo: meshesOf(lo)[0].geometry, cards: new Float32Array(cards) };
  };
  const trunk = async (name) => {
    const [root, lo, tips] = await Promise.all([loadGLB(name), loadGLB(name + '_lo'), fetch(`./assets/glb/${name}_tips.bin`).then((r) => r.arrayBuffer())]);
    const los = meshesOf(lo);
    return { parts: meshesOf(root).map((p, i) => ({ ...p, lo: los[i].geometry })), tips: new Float32Array(tips) };
  };
  [SCANNED.maple, SCANNED.pine, SCANNED.sakura, SCANNED.sacred] = await Promise.all([
    Promise.all([scan('maple_tree'), scan('maple_tree_b')]), scan('pine_tree'), scan('sakura_tree'), trunk('sacred_trunk'),
  ]);
}

// a limb as a smooth curve rather than straight segments: subdivided through its points, given sides for its
// girth, an uneven section on the thick wood (and buttresses at the foot of a trunk), a collar where a branch
// leaves its parent
function branch(wood, pts, radii, sides, vScale, { trunk = false, seed = 0, cap = 99 } = {}) {
  let P = pts, Rr = radii;
  if (pts.length > 2) {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const n = (pts.length - 1) * 3;
    P = []; Rr = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, f = t * (pts.length - 1), k = Math.min(Math.floor(f), pts.length - 2);
      P.push(curve.getPoint(t));
      Rr.push(radii[k] + (radii[k + 1] - radii[k]) * (f - k));
    }
  } else Rr = radii.slice();
  const r0 = Rr[0];
  const s = Math.min(cap, Math.max(sides, r0 > 0.2 ? 16 : r0 > 0.12 ? 12 : r0 > 0.07 ? 9 : r0 > 0.035 ? 7 : r0 > 0.018 ? 5 : sides));
  if (!trunk) {
    Rr[0] *= 1.25;
    if (Rr.length > 2) Rr[1] *= 1.08;
  }
  const ph = (seed * 0.618) % 6.283;
  const shape = r0 > 0.05
    ? (i, a) => (1 + 0.07 * Math.sin(3 * a + i * 0.45 + ph) + 0.035 * Math.sin(7 * a - i * 0.8 + ph * 1.7)) * (trunk ? 1 + 0.3 * Math.max(0, 1 - i / 3) * (0.5 + 0.5 * Math.sin(5 * a + ph)) : 1)
    : null;
  wood.tube(P, Rr, s, vScale, null, false, shape);
}

function emitCards(leaf, R, cards, centre, radius, split = 1) {
  const T = V(), B = V();
  if (split > 1) {
    const out = [];
    for (const c of cards) for (let k = 0; k < split; k++) out.push({ p: c.p.clone().add(randUnit(R).multiplyScalar(c.h * 0.7)), h: c.h * 0.5 });
    cards = out;
  }
  for (const c of cards) {
    const out = c.p.clone().sub(centre);
    const dist = out.length();
    out.normalize();
    // card plane faces roughly outward, randomly twisted
    const nrm = out.clone().multiplyScalar(0.6).add(randUnit(R).multiplyScalar(0.8)).normalize();
    T.crossVectors(nrm, Math.abs(nrm.y) > 0.9 ? V(1, 0, 0) : UP).normalize();
    B.crossVectors(nrm, T).normalize();
    const shade = out.clone().multiplyScalar(0.8).add(UP.clone().multiplyScalar(0.45)).normalize();
    const shell = clamp(dist / radius, 0, 1);
    leaf.card(c.p, T, B, c.h, shade, [shell, R.next()]);
  }
}

function crownOf(cards) {
  const c = V();
  for (const k of cards) c.add(k.p);
  c.multiplyScalar(1 / Math.max(1, cards.length));
  let r = 0;
  for (const k of cards) r = Math.max(r, k.p.distanceTo(c));
  return { c, r };
}

// sakura: a cherry modelled branch by branch (scripts/models.mjs 'sakura_tree'), blossom clouds on the anchors its own
// flowers left; variants differ in how the clusters fall
function sakura(seed) {
  const R = rng(seed);
  const leaf = new Builder(2);
  const { wood, lo, cards: a } = SCANNED.sakura;
  const cards = [];
  for (let i = 0; i < a.length; i += 6) {
    const n = R.next() < 0.5 ? 3 : 2;
    for (let k = 0; k < n; k++) cards.push({ p: V(a[i] + R.range(-0.16, 0.16), a[i + 1] + R.range(-0.12, 0.12), a[i + 2] + R.range(-0.16, 0.16)), h: R.range(0.26, 0.34) });
  }
  const cr = crownOf(cards);
  emitCards(leaf, R, cards, cr.c, cr.r);
  return { wood, lo, leaf: leaf.build() };
}

// the sacred tree: an ancient weeping cherry. Its trunk is a scan (scripts/models.mjs 'sacred_trunk'); from the ends
// of its broken limbs new ones arch up and out, and from those hang the long thin shoots a shidare-zakura is named for,
// flowering along their length
function sacred(seed) {
  const R = rng(seed);
  const wood = new Builder(), fine = new Builder(), leaf = new Builder(2);
  const t = SCANNED.sacred.tips;
  const cards = [];
  const shoot = (p, out) => {
    // a shoot: a short lift outward, then hanging nearly straight, swaying a little out of line
    const len = clamp(p.y - R.range(0.8, 1.6), 0.6, 4.2);
    const n = Math.max(4, Math.round(len / 0.3));
    const pts = [p.clone()];
    const side = V(-out.z, 0, out.x).multiplyScalar(R.range(-0.25, 0.25));
    const reach = R.range(0.15, 0.4);
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      pts.push(p.clone().addScaledVector(out, reach * Math.sqrt(u)).addScaledVector(side, u * u).add(V(0, 0.12 * Math.sin(Math.min(u * 6, Math.PI)) - len * Math.pow(u, 1.15), 0)));
    }
    branch(fine, pts, pts.map((_, i) => 0.003 * (1 - (i / pts.length) * 0.5)), 3, 1.4, { seed });
    // flowers all down the shoot in small bunches, turned every way round it, thinning toward the tip
    let d = R.range(0.02, 0.08);
    for (let i = 1; i < pts.length; i++) {
      const seg = pts[i].distanceTo(pts[i - 1]);
      for (; d < seg; d += R.range(0.06, 0.1)) {
        if (R.next() < 0.25 * (i / pts.length)) continue;
        cards.push({ p: pts[i - 1].clone().lerp(pts[i], d / seg).add(randUnit(R).multiplyScalar(0.025)), h: R.range(0.09, 0.115), out, hang: true });
      }
      d -= seg;
    }
  };
  const grow = (p, dir, len, r, depth) => {
    const out = V(dir.x, 0, dir.z);
    if (out.lengthSq() < 1e-4) out.set(1, 0, 0);
    out.normalize();
    const pull = out.clone().multiplyScalar(0.35).add(V(0, depth === 0 ? -0.08 : -0.35 - depth * 0.1, 0));
    const b = limb(R, p, dir, len, depth === 0 ? 6 : 4, pull, 0.1);
    branch(wood, b.pts, b.pts.map((_, i) => r * (1 - (i / b.pts.length) * 0.55)), depth === 0 ? 7 : depth === 1 ? 5 : 4, 1.4, { seed });
    if (depth < 2) {
      const n = depth === 0 ? 3 : 2;
      for (let k = 0; k < n; k++) {
        const at = b.pts[Math.min(b.pts.length - 1, Math.round(R.range(0.4, 1) * (b.pts.length - 1)))];
        const nd = b.dir.clone().add(randUnit(R).multiplyScalar(0.8)).add(V(0, depth === 0 ? 0.25 : 0, 0)).normalize();
        grow(at, nd, len * R.range(0.5, 0.7), r * 0.55, depth + 1);
      }
    }
    if (depth >= 1) {
      for (let i = 1; i < b.pts.length; i++) {
        cards.push({ p: b.pts[i].clone().add(randUnit(R).multiplyScalar(0.12)), h: R.range(0.24, 0.32) });
        if (R.next() < (depth === 2 ? 0.8 : 0.45)) shoot(b.pts[i], out);
      }
      shoot(b.pts[b.pts.length - 1], out);
    }
  };
  for (let i = 0; i < t.length; i += 7) {
    const p = V(t[i], t[i + 1], t[i + 2]), d = V(t[i + 3], t[i + 4], t[i + 5]), r = t[i + 6];
    const fromAxis = Math.hypot(p.x, p.z);
    // low ends and those against the trunk are burls, not limbs
    if (p.y < 2.5 || (fromAxis < 0.4 && p.y < 4.8)) continue;
    const out = fromAxis > 0.2 ? V(p.x, 0, p.z).normalize() : V(d.x, 0, d.z).normalize();
    if (d.y < -0.5) {
      // an end already hanging: let it weep where it is
      for (let k = 0; k < 4; k++) shoot(p.clone().add(randUnit(R).multiplyScalar(0.1)), out);
      continue;
    }
    // a broken stem top sends up several limbs; a limb end carries on
    const n = r > 0.12 ? 3 : 1;
    for (let k = 0; k < n; k++) {
      const o = n > 1 ? out.clone().applyAxisAngle(UP, (k / n) * Math.PI * 2 + R.range(-0.4, 0.4)) : out;
      const dir = (n > 1 ? o.clone().multiplyScalar(0.7) : d.clone().multiplyScalar(0.6).addScaledVector(o, 0.6)).add(V(0, 0.55, 0)).normalize();
      grow(p, dir, R.range(1.6, 2.6), Math.min(r * 0.9, n > 1 ? 0.08 : 0.07), 0);
    }
  }
  const cr = crownOf(cards);
  const T = V(), B = V();
  const hang = new Builder(2);
  for (const c of cards) {
    const o = c.p.clone().sub(cr.c);
    const shell = clamp(Math.hypot(o.x, o.z) / cr.r * 0.8 + 0.2, 0, 1);
    const shade = V(o.x / cr.r * 0.6, 1, o.z / cr.r * 0.6).normalize();
    // blossom along a hanging shoot faces any way round it; on the limbs it faces outward and up, twisted at random
    const yaw = R.range(0, Math.PI * 2);
    const nrm = c.hang ? V(Math.cos(yaw), R.range(-0.3, 0.35), Math.sin(yaw)).normalize() : o.normalize().multiplyScalar(0.6).add(randUnit(R).multiplyScalar(0.8)).add(V(0, 0.3, 0)).normalize();
    T.crossVectors(nrm, Math.abs(nrm.y) > 0.9 ? V(1, 0, 0) : UP).normalize();
    B.crossVectors(nrm, T).normalize();
    (c.hang ? hang : leaf).card(c.p, T, B, c.h, shade, [shell, R.next()]);
  }
  return { wood: wood.build(), fine: fine.build(), leaf: leaf.build(), hang: hang.build(), extra: SCANNED.sacred.parts };
}

// maple leaves: cards lie flat in layers, tilted a little, so the crown reads as stacked tiers with light between
function layerCards(leaf, R, cards) {
  const T = V(), B = V();
  const cr = crownOf(cards);
  // leaves: cards lie in the tier, tilted a little, so the crown reads as stacked layers with light between
  for (const c of cards) {
    const nrm = V(R.range(-0.45, 0.45), 1, R.range(-0.45, 0.45)).normalize();
    T.crossVectors(nrm, V(1, 0, 0)).normalize();
    B.crossVectors(nrm, T).normalize();
    const out = c.p.clone().sub(cr.c);
    const shell = clamp(Math.hypot(out.x, out.z) / cr.r * 0.7 + clamp((c.p.y - cr.c.y) / cr.r, -0.5, 0.5) * 0.6 + 0.2, 0, 1);
    const shade = V(out.x / cr.r * 0.5, 1, out.z / cr.r * 0.5).normalize();
    leaf.card(c.p, T, B, c.h, shade, [shell, R.next()]);
    // and a second card standing more upright, so the layer has some thickness seen from the side
    if (R.next() < 0.35) {
      const n2 = V(R.range(-1, 1), R.range(0.2, 0.6), R.range(-1, 1)).normalize();
      T.crossVectors(n2, UP).normalize();
      B.crossVectors(n2, T).normalize();
      leaf.card(c.p.clone().add(V(0, -0.03, 0)), T, B, c.h * 0.85, shade, [shell * 0.9, R.next()]);
    }
  }
}

// momiji: two Japanese maples modelled twig by twig (scripts/models.mjs 'maple_tree', 'maple_tree_b'), their leaves
// laid as scanned sprays on the anchors their own leaves left; odd and even seeds take the two shapes
function maple(seed) {
  const R = rng(seed);
  const leaf = new Builder(2);
  const { wood, lo, cards: a } = SCANNED.maple[seed % 2];
  const cards = [];
  for (let i = 0; i < a.length; i += 6) {
    const n = R.next() < 0.55 ? 2 : 1;
    for (let k = 0; k < n; k++) cards.push({ p: V(a[i] + R.range(-0.13, 0.13), a[i + 1] + R.range(-0.05, 0.08), a[i + 2] + R.range(-0.13, 0.13)), h: R.range(0.15, 0.22) });
  }
  layerCards(leaf, R, cards);
  return { wood, lo, leaf: leaf.build() };
}

// keyaki-like broadleaf: tall vase of upright limbs, rounded crown
function broad(seed, lod = 0, sides = 5) {
  const R = rng(seed);
  const wood = new Builder(), fine = new Builder(), leaf = new Builder(2);
  const tr = limb(R, V(), V(R.range(-0.1, 0.1), 1, R.range(-0.1, 0.1)).normalize(), R.range(3.0, 4.2), 5, V(), 0.05);
  const r0 = R.range(0.22, 0.3);
  const trR = tr.pts.map((_, i) => r0 * (i === 0 ? 1.3 : 1 - i * 0.05));
  if (lod) wood.tube(tr.pts, trR, sides, 1.4);
  else branch(wood, tr.pts, trR, 7, 1.4, { trunk: true, seed });
  const top = tr.pts[tr.pts.length - 1];
  const cards = [];
  const grow = (p, dir, len, r, depth) => {
    const b = limb(R, p, dir, len, 4, V(dir.x, 0, dir.z).normalize().multiplyScalar(0.25), 0.12);
    // beyond the wall: no one comes within fifteen metres of these, so the outer branches keep few sides
    const bR = b.pts.map((_, i) => r * (1 - (i / b.pts.length) * 0.55));
    if (!lod) branch(depth ? fine : wood, b.pts, bR, 3, 1.4, { seed, cap: depth ? 4 : 9 });
    else if (!depth) wood.tube(b.pts, bR, sides > 5 ? 6 : 4, 1.4);
    if (depth < 2) {
      for (let k = 0; k < 3; k++) {
        const at = b.pts[R.int(2, b.pts.length - 1)];
        grow(at, b.dir.clone().add(randUnit(R).multiplyScalar(0.7)).normalize(), len * 0.62, r * 0.58, depth + 1);
      }
    } else for (let i = 1; i < b.pts.length; i++) cards.push({ p: b.pts[i].clone().add(randUnit(R).multiplyScalar(0.9)), h: R.range(0.9, 1.25) });
  };
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + R.range(-0.3, 0.3);
    const elev = R.range(0.9, 1.25);
    grow(top, V(Math.cos(a) * Math.cos(elev), Math.sin(elev), Math.sin(a) * Math.cos(elev)), R.range(3.4, 4.6), r0 * 0.6, 0);
  }
  const cr = crownOf(cards);
  for (let i = 0; i < 30; i++) cards.push({ p: cr.c.clone().addScaledVector(randUnit(R), cr.r * R.range(0.3, 0.8)), h: R.range(1.0, 1.3) });
  // each spray split in three, so a crown of small evergreen leaves is not a pile of metre-wide cards (on the far
  // hills, where a card is a few pixels, whole)
  emitCards(leaf, R, cards, cr.c, cr.r, lod ? 1 : 3);
  return { wood: wood.build(), fine: lod ? null : fine.build(), leaf: leaf.build() };
}

// kuromatsu: a modelled black pine trained in tiers (scripts/models.mjs 'pine_tree'), clouds of scanned needles on its pads
function pine(seed) {
  const R = rng(seed);
  const leaf = new Builder(2);
  const { wood, lo, cards: a } = SCANNED.pine;
  const anchors = [];
  for (let i = 0; i < a.length; i += 6) anchors.push({ p: V(a[i], a[i + 1], a[i + 2]), o: V(a[i + 3], a[i + 4], a[i + 5]) });
  const cr = crownOf(anchors);
  const T = V(), B = V();
  // pads: needle cards laid nearly flat over the anchors the model's own needles left, a third of them with a card
  // turned outward so a pad's rim has thickness
  for (const { p, o } of anchors) {
    const out = p.clone().sub(cr.c);
    const shell = clamp(Math.hypot(out.x, out.z) / cr.r * 0.8 + 0.25, 0, 1);
    const shade = V(o.x * 0.5, 1, o.z * 0.5).normalize();
    for (let k = 0; k < 2; k++) {
      const q = p.clone().add(V(R.range(-0.08, 0.08), R.range(-0.03, 0.05), R.range(-0.08, 0.08)));
      const n = V(R.range(-0.35, 0.35), 1, R.range(-0.35, 0.35)).normalize();
      T.crossVectors(n, V(1, 0, 0)).normalize();
      B.crossVectors(n, T).normalize();
      leaf.card(q, T, B, R.range(0.24, 0.34), shade, [shell, R.next()]);
    }
    if (R.next() < 0.33) {
      const n = V(o.x, o.y * 0.3, o.z).normalize();
      T.crossVectors(n, UP).normalize();
      B.crossVectors(n, T).normalize();
      leaf.card(p.clone().add(V(0, -0.05, 0)), T, B, 0.26, n, [1, R.next()]);
    }
  }
  return { wood, lo, leaf: leaf.build() };
}

// sugi as it grows in a Kyoto wood: a straight trunk of 17 to 22 m, bare to nearly half its height but for the
// stubs of branches it has shed; above, whorls of thin branches that droop below and lift toward the top, and the green
// held in tufts at their outer ends, each tuft a little dome of scanned sprays, so the crown reads as the clumps a
// sugi is known by and not as one cone. lod 1: the same tree for the far hills, a few large tufts per branch
function cedar(seed, lod = 0, sides = 5) {
  const R = rng(seed);
  const wood = new Builder(), fine = new Builder(), leaf = new Builder(2);
  const H = R.range(17, 22);
  const tr = limb(R, V(), V(R.range(-0.025, 0.025), 1, R.range(-0.025, 0.025)).normalize(), H, 8, V(), 0.015);
  const trR = tr.pts.map((_, i) => 0.38 * (1 - i / 9) + 0.03);
  if (lod) wood.tube(tr.pts, trR, sides, 2.0);
  else branch(wood, tr.pts, trR, 8, 2.0, { trunk: true, seed });
  const onTrunk = (y) => {
    const f = clamp(y / H, 0, 1) * (tr.pts.length - 1), i = Math.min(tr.pts.length - 2, Math.floor(f));
    return tr.pts[i].clone().lerp(tr.pts[i + 1], f - i);
  };
  const T = V(), B = V(), X = V(1, 0, 0);
  const crownBase = H * R.range(0.4, 0.5);
  if (!lod) {
    for (let y = 2.2; y < crownBase - 0.5; y += R.range(0.5, 1.1)) {
      const a = R.next() * Math.PI * 2;
      const b = limb(R, onTrunk(y), V(Math.cos(a), R.range(-0.3, 0.1), Math.sin(a)).normalize(), R.range(0.15, 0.5), 2, V(0, -0.2, 0), 0.1);
      branch(fine, b.pts, [0.022, 0.014, 0.008], 3, 1.4, { seed, cap: 4 });
    }
  }
  const tuft = (c, out, size, shell) => {
    const n = lod ? 3 : R.int(4, 7);
    for (let k = 0; k < n; k++) {
      const d = randUnit(R);
      if (d.dot(out) < -0.2) d.addScaledVector(out, 0.9).normalize();
      if (d.y < -0.5) d.y *= 0.4, d.normalize();
      const p = c.clone().addScaledVector(d, size * 0.32);
      const nrm = d.clone().multiplyScalar(0.75).add(randUnit(R).multiplyScalar(0.45)).normalize();
      T.crossVectors(nrm, Math.abs(nrm.y) > 0.9 ? X : UP).normalize();
      B.crossVectors(nrm, T).normalize();
      // shading: each tuft is its own small dome, on the crown's cone
      const shade = d.clone().multiplyScalar(0.7).add(out.clone().multiplyScalar(0.45)).add(V(0, 0.3, 0)).normalize();
      leaf.card(p, T, B, size * R.range(0.85, 1.1), shade, [shell * (0.72 + 0.28 * Math.max(0, d.dot(out) + d.y * 0.5)), R.next()]);
    }
  };
  for (let y = crownBase; y < H - 0.35; y += R.range(0.38, 0.55) * (lod ? 1.6 : 1)) {
    const t = (y - crownBase) / (H - crownBase);
    // a cone whose top rounds off
    const reach = Math.pow(1 - t, 0.8) * R.range(2.0, 2.7) + 0.3;
    const n = Math.max(3, Math.round(5 * (1 - t) + 2));
    const a0 = R.next() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI * 2 + R.range(-0.4, 0.4);
      const d = V(Math.cos(a), -0.2 + 0.55 * t + R.range(-0.1, 0.1), Math.sin(a)).normalize();
      const b = limb(R, onTrunk(y), d, reach * R.range(0.75, 1.05), 4, V(0, -0.35 * (1 - t), 0), 0.08);
      const r0 = 0.014 + 0.032 * (1 - t);
      if (!lod) branch(fine, b.pts, b.pts.map((_, i) => r0 * (1 - (i / b.pts.length) * 0.7)), 3, 1.4, { seed, cap: 4 });
      const out = V(d.x, 0, d.z).normalize();
      const L = b.pts.length;
      for (let i = 2; i < L; i += lod ? 2 : 1) {
        const along = i / (L - 1);
        const size = (lod ? 0.62 : R.range(0.24, 0.32)) * (1 - t * 0.2) * Math.min(1, 0.6 + reach / 4);
        const c = b.pts[i].clone().add(V(0, size * 0.25, 0)).add(randUnit(R).multiplyScalar(0.06));
        tuft(c, out, size, 0.42 + 0.58 * along);
        if (!lod) tuft(b.pts[i - 1].clone().lerp(b.pts[i], 0.5).add(V(0, size * 0.2, 0)), out, size * 0.9, 0.36 + 0.5 * along);
      }
    }
  }
  // the leader: a tight spire of small tufts
  for (let k = 0; k < (lod ? 3 : 7); k++) {
    const c = onTrunk(H - 0.35 + k * 0.13).add(randUnit(R).multiplyScalar(0.05));
    tuft(c, randUnit(R).setY(0).normalize(), lod ? 0.4 : 0.22, 1);
  }
  return { wood: wood.build(), fine: lod ? null : fine.build(), leaf: leaf.build() };
}

// bamboo: a tall thin culm leaning slightly, leaf sprays on its upper half
function bamboo(seed) {
  const R = rng(seed);
  const wood = new Builder(1), leaf = new Builder(2);
  const H = R.range(10, 14);
  const lean = V(R.range(-0.08, 0.08), 1, R.range(-0.08, 0.08)).normalize();
  const tr = limb(R, V(), lean, H, 10, V(lean.x * 0.4, 0, lean.z * 0.4), 0.01);
  wood.tube(tr.pts, tr.pts.map((_, i) => 0.065 * (1 - i / 14)), 6, 1.0, (i) => [i / 10]);
  const T = V(), B = V();
  for (let i = 4; i < tr.pts.length; i++) {
    const n = R.int(2, 4);
    for (let k = 0; k < n; k++) {
      const a = R.next() * Math.PI * 2;
      const d = V(Math.cos(a), R.range(-0.4, 0.1), Math.sin(a)).normalize();
      const p = tr.pts[i].clone().addScaledVector(d, R.range(0.5, 1.0));
      T.crossVectors(d, UP).normalize();
      B.crossVectors(d, T).normalize();
      leaf.card(p, T, B, R.range(0.55, 0.8), V(d.x, 0.5, d.z).normalize(), [0.5 + 0.5 * (i / 10), R.next()]);
    }
  }
  return { wood: wood.build(), leaf: leaf.build() };
}

// far forms (unit height). Sugi: a narrow spire of drooping, saw-edged skirts, light on the tips and dark
// underneath, so a hillside of them reads as thousands of separate points against the haze.
function farConifer(seed) {
  const R = rng(seed);
  const b = new Builder();
  b.withColor = true;
  const T = 5, N = 10;
  const spire = (y0, h, r, droop, cTop, cRim) => {
    const top = b.count;
    b.vert(V(R.range(-0.004, 0.004), y0 + h, 0), V(0, 1, 0), 0.5, 1, null, [cTop, cTop, cTop]);
    const rim = b.count;
    const a0 = R.next() * Math.PI;
    for (let s = 0; s < N; s++) {
      const a = a0 + (s / N) * Math.PI * 2 + R.range(-0.12, 0.12);
      const long = s % 2 === 0;
      const rr = r * (long ? R.range(0.92, 1.12) : R.range(0.55, 0.7));
      const y = y0 - (long ? droop * R.range(0.7, 1.2) : 0);
      const c = cRim * (long ? R.range(0.95, 1.15) : 0.7);
      b.vert(V(Math.cos(a) * rr, y, Math.sin(a) * rr), V(Math.cos(a), 0.55, Math.sin(a)).normalize(), s / N, 0, null, [c, c, c]);
    }
    const under = b.count;
    b.vert(V(0, y0 + h * 0.28, 0), V(0, -1, 0), 0.5, 0, null, [cRim * 0.35, cRim * 0.35, cRim * 0.35]);
    for (let s = 0; s < N; s++) {
      const i0 = rim + s, i1 = rim + ((s + 1) % N);
      b.tri(top, i1, i0);
      b.tri(under, i0, i1);
    }
  };
  for (let t = 0; t < T; t++) {
    const k = t / (T - 1);
    spire(0.14 + t * 0.15, 0.3 - k * 0.06, 0.19 * (1 - k * 0.72) * R.range(0.9, 1.1), 0.05 * (1 - k * 0.5), 0.95 + k * 0.1, 0.5 + k * 0.15);
  }
  spire(0.86, 0.15, 0.035, 0.0, 1.05, 0.8);
  // trunk stub
  const base = b.count;
  for (let s = 0; s <= 4; s++) {
    const a = (s / 4) * Math.PI * 2;
    const n = V(Math.cos(a), 0, Math.sin(a));
    b.vert(V(Math.cos(a) * 0.018, 0, Math.sin(a) * 0.018), n, 0, 0, null, [0.25, 0.2, 0.17]);
    b.vert(V(Math.cos(a) * 0.014, 0.2, Math.sin(a) * 0.014), n, 0, 1, null, [0.25, 0.2, 0.17]);
  }
  for (let s = 0; s < 4; s++) b.quad(base + s * 2, base + s * 2 + 2, base + s * 2 + 3, base + s * 2 + 1);
  return b.build();
}

// broadleaf: a cauliflower crown of small lumps, so the canopy edge is bumpy rather than a ball
function farBroad(seed) {
  const R = rng(seed);
  const b = new Builder();
  b.withColor = true;
  const ico = mergeVertices((() => { const g = new THREE.IcosahedronGeometry(1, 0); g.deleteAttribute('normal'); g.deleteAttribute('uv'); return g; })());
  const lumps = [[0, 0.66, 0, 0.26]];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + R.range(-0.3, 0.3);
    const up = i % 3 === 0 ? 0.2 : 0;
    lumps.push([Math.cos(a) * R.range(0.17, 0.26), R.range(0.46, 0.62) + up, Math.sin(a) * R.range(0.17, 0.26), R.range(0.13, 0.19)]);
  }
  for (const [lx, ly, lz, lr] of lumps) {
    const p = ico.attributes.position;
    const base = b.count;
    for (let i = 0; i < p.count; i++) {
      const v = V(p.getX(i), p.getY(i), p.getZ(i)).multiplyScalar(lr * R.range(0.88, 1.12));
      v.y *= 0.85;
      const n = V(p.getX(i), p.getY(i) + 0.3, p.getZ(i)).normalize();
      const y = v.y + ly;
      const c = (0.4 + 0.6 * smoothstep(0.35, 0.95, y)) * R.range(0.85, 1.1);
      b.vert(V(v.x + lx, y, v.z + lz), n, 0, 0, null, [c, c, c]);
    }
    for (let i = 0; i < ico.index.count; i++) b.idx.push(base + ico.index.getX(i));
  }
  return b.build();
}

// ---------------------------------------------------------------- materials

export const LEAF_VERT = /* glsl */ `
  {
    #ifdef USE_INSTANCING
      vec3 root = instanceMatrix[3].xyz;
      mat3 im = mat3(instanceMatrix);
      float s2 = dot(im[0], im[0]);
    #else
      vec3 root = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      mat3 im = mat3(1.0); float s2 = 1.0;
    #endif
    float hW = position.y * sqrt(s2);
    vec3 off = sfWindOffset(root, hW, SF_STIFF);
    #ifdef SF_LEAF
      float ph = aAux.y * 6.2831;
      off += vec3(sin(uTime * 3.1 + ph), sin(uTime * 2.3 + ph * 1.7) * 0.6, cos(uTime * 2.7 + ph)) * 0.035 * (0.4 + uWind.z) * aAux.x;
      vLeaf = aAux;
      vSeed = fract(sin(dot(root.xz, vec2(12.9898, 78.233))) * 43758.5453);
      #if defined(SF_ATLAS) && defined(USE_MAP)
        #ifdef SF_UMBEL
          // a hanging shoot flowers one bunch at a time: one of the sixteen in its own atlas
          vBloomUv = vMapUv * 0.25 + floor(vec2(fract(aAux.y * 61.7 + 0.2), fract(aAux.y * 83.9 + 0.6)) * 4.0) * 0.25;
        #endif
        // each card takes one of the atlas's four branchlets
        vMapUv = vMapUv * 0.5 + vec2(step(0.5, fract(aAux.y * 23.17 + 0.37)), step(0.5, fract(aAux.y * 41.73 + 0.71))) * 0.5;
      #endif
    #endif
    transformed += (transpose(im) * off) / s2;
  }
`;

const leafHead = /* glsl */ `
  attribute vec2 aAux; varying vec2 vLeaf; varying float vSeed;
  #ifdef SF_UMBEL
    varying vec2 vBloomUv;
  #endif
  ${WIND_GLSL}
`;

export function leafMaterial(opts) {
  const m = new THREE.MeshLambertMaterial({ map: opts.map, side: THREE.DoubleSide, alphaTest: 0.5, alphaToCoverage: true });
  const uniforms = {
    uLeafSp: { value: new THREE.Vector3(...opts.colors[0]) },
    uLeafSu: { value: new THREE.Vector3(...opts.colors[1]) },
    uLeafAu: { value: new THREE.Vector3(...opts.colors[2]) },
    uLeafAu2: { value: new THREE.Vector3(...(opts.colors[4] || opts.colors[2])) },
    uLeafWi: { value: new THREE.Vector3(...opts.colors[3]) },
    uPresence: { value: new THREE.Vector4(...opts.presence) },
    tBlossom: { value: opts.blossom || opts.marginMap || opts.map },
    tLeafN: { value: opts.normal || null },
    uBloomFrac: { value: opts.bloomFrac ?? 1 },
    tBlossomN: { value: opts.blossomNormal || opts.normal || null },
    uTransl: { value: opts.transl ?? 0.6 },
  };
  const defs = `#define SF_LEAF\n#define SF_STIFF ${opts.stiff.toFixed(3)}\n${opts.blossom ? '#define SF_BLOSSOM\n' : ''}${opts.hearts ? '#define SF_HEARTS\n' : ''}${opts.gradient ? '#define SF_GRADIENT\n' : ''}${opts.normal ? '#define SF_ATLAS\n' : ''}${opts.bloomFrac ? '#define SF_BLOOM_PART\n' : ''}${opts.umbel ? '#define SF_UMBEL\n' : ''}${opts.marginMap ? '#define SF_MARGIN\n' : ''}`;
  patch(m, {
    key: 'leaf-' + opts.key,
    snow: opts.snow ?? 0.7,
    wet: 0.25,
    wrap: 0.6,
    uniforms,
    vertexHead: defs + leafHead,
    fragHead: /* glsl */ `${defs}${HOUSE_CLIP}
      varying vec2 vLeaf; varying float vSeed;
      #ifdef SF_UMBEL
        varying vec2 vBloomUv;
        #define SF_BUV vBloomUv
      #else
        #define SF_BUV vMapUv
      #endif
      uniform vec3 uLeafSp, uLeafSu, uLeafAu, uLeafAu2, uLeafWi;
      uniform vec4 uPresence; uniform sampler2D tBlossom; uniform float uTransl;
      uniform sampler2D tLeafN, tBlossomN; uniform float uBloomFrac;
      float sfBloom = 0.0;
    `,
    hooks: {
      vertex: LEAF_VERT,
      map: /* glsl */ `
        {
          float lum = diffuseColor.r;
          float var = fract(vLeaf.y * 13.7 + vSeed * 7.1);
          #ifdef SF_GRADIENT
            // momiji turn from the outside in: crimson on the sunlit shell, orange and gold deeper in
            float gk = smoothstep(0.2, 0.85, vLeaf.x + (fract(vSeed * 3.7) - 0.5) * 0.45 + (vLeaf.y - 0.5) * 0.3);
            vec3 au = mix(uLeafAu2, uLeafAu, gk);
          #else
            vec3 au = mix(uLeafAu, uLeafAu2, smoothstep(0.2, 0.8, fract(vSeed * 3.7 + vLeaf.y * 0.6)));
          #endif
          vec3 lc = uLeafSp * uSeason.x + uLeafSu * uSeason.y + au * uSeason.z + uLeafWi * uSeason.w;
          lc *= 0.82 + 0.36 * var;
          vec3 col = lum * lum * lc * 3.2;
          #ifdef SF_MARGIN
          {
            // kumazasa: each leaf's margin withers to a cream band through autumn and winter and stays so into the
            // spring, until the new leaves; in summer the leaf is green to its edge
            vec3 mc = texture2D(tBlossom, vMapUv).rgb;
            float edge = smoothstep(0.015, 0.09, mc.r - mc.g);
            float wither = clamp(uSeason.z * 0.6 + uSeason.w * 0.9 + uSeason.x * 0.12, 0.0, 1.0);
            // a margin that has not withered is leaf like the rest, not the scan's pale rim
            col = mix(col, 0.16 * lc * 3.2, edge * (1.0 - wither) * 0.85);
            col = mix(col, mc * 0.45, edge * wither);
          }
          #endif
          // footprint of one pixel in texels: far cards read their outline from a softer mip so they resolve as
          // clumps instead of single-pixel specks
          // (measured against 512 texels a card, the density the softening was tuned for)
          #ifdef SF_ATLAS
            vec2 sz = vec2(textureSize(map, 0)) * 0.25;
          #else
            vec2 sz = vec2(512.0);
          #endif
          vec2 du = dFdx(vMapUv * sz), dv = dFdy(vMapUv * sz);
          float lod = 0.5 * log2(max(dot(du, du), dot(dv, dv)));
          float soft = clamp(lod * 0.6 - 0.3, 0.0, 1.1);
          float a = texture2D(map, vMapUv, soft).a;
          #ifdef SF_BLOSSOM
            vec4 b = texture2D(tBlossom, SF_BUV);
            b.a = texture2D(tBlossom, SF_BUV, soft).a;
            #ifdef SF_HEARTS
            // cherry calyces and buds photograph near-black red; past a few metres a crown's flowers mix into one pale
            // pink, so the darkest hearts come up toward rose, more so with distance
            {
              float bl = dot(b.rgb, vec3(0.2126, 0.7152, 0.0722));
              b.rgb = mix(b.rgb, max(b.rgb, vec3(0.6, 0.46, 0.47)), (1.0 - smoothstep(0.04, 0.16, bl)) * (0.6 + 0.3 * smoothstep(0.0, 1.5, lod)));
            }
            #endif
            #ifdef SF_ETERNAL
              float bw = 1.0;
            #else
              float bw = uSeason.x;
            #endif
            #ifdef SF_BLOOM_PART
              // only some of the plant flowers, in patches, and some bushes far more than others
              float bf = uBloomFrac * mix(0.45, 1.45, sfNoise(vSfWP.xz * 0.27 + 9.1));
              float bn = sfNoise(vSfWP.xz * 0.8 + 11.3) * 0.75 + fract(vLeaf.y * 5.71) * 0.25;
              bw *= smoothstep(0.92 - bf, 1.08 - bf, bn);
              // a garden's satsuki are of several kinds, each bush its own: white, shell pink, the scan's own rose,
              // salmon, crimson. Only the petals change, keeping the scan's veins and shading
              {
                float kind = fract(sfNoise(vSfWP.xz * 0.19 + 4.7) * 5.3);
                float petal = smoothstep(0.06, 0.25, b.r - b.g);
                float bl = dot(b.rgb, vec3(0.2126, 0.7152, 0.0722));
                vec3 chroma = b.rgb - bl;
                // white flowers are three times the luminance of the scan's rose; salmon turns the hue toward orange
                vec3 k = kind < 0.2 ? vec3(bl * 2.4) + chroma * 0.12
                  : kind < 0.4 ? vec3(bl * 1.6) + chroma * 0.5
                  : kind < 0.6 ? vec3(bl) + chroma * 0.82
                  : kind < 0.8 ? vec3(bl * 1.15) + chroma.rgb * vec3(1.0, 0.55, -0.2) * 0.8
                  : vec3(bl * 0.8) + chroma * 0.92;
                b.rgb = mix(b.rgb, max(k, vec3(0.0)), petal);
              }
            #endif
            // whole sprays vary between near-white and a deeper pink, the way a real crown does
            float pk = smoothstep(0.35, 0.95, fract(vSeed * 5.3 + vLeaf.y * 2.9));
            col = mix(col, b.rgb * mix(vec3(1.0, 0.93, 0.95), vec3(1.0, 0.8, 0.86), pk) * (0.82 + 0.22 * var), bw);
            a = mix(a, b.a, bw);
            sfBloom = bw;
          #endif
          // inner leaves sit in the crown's own shade
          #ifdef SF_BLOSSOM
            // in blossom the crown's shade stays rose, warm rather than mauve: petals pass light on to the ones behind
            col *= mix(mix(vec3(0.38), vec3(0.6, 0.53, 0.52), uSeason.x), vec3(1.0), smoothstep(0.15, 0.95, vLeaf.x));
          #else
            col *= mix(0.38, 1.0, smoothstep(0.1, 0.95, vLeaf.x));
          #endif
          // far crowns: the card's own leaves blur away in the mips, so put back clumps and the shade between them
          {
            vec3 cp = vSfWP * 2.2;
            float clump = sfNoise(cp.xz + cp.y * 1.4) * 0.55 + sfNoise(cp.zy * 1.9 + cp.x * 1.3) * 0.45;
            float cdepth = 0.58;
            #ifdef SF_BLOSSOM
              // a crown in flower still has its masses: softer than leaves, but each with a shaded underside
              cdepth = mix(0.58, 0.3, sfBloom);
            #endif
            col *= mix(1.0, 1.0 - cdepth + cdepth * 1.65 * smoothstep(0.28, 0.72, clump), smoothstep(0.8, 2.6, lod));
          }
          diffuseColor.rgb = col;
          // fewer leaves out of season: whole cards drop out by their seed
          float pres = dot(uSeason, uPresence);
          #ifdef SF_ETERNAL
            pres = 1.0;
          #endif
          if (fract(vLeaf.y * 7.31 + 0.13) > pres + 0.001) discard;
          // keep thin cards from dissolving in the mip chain
          a *= 1.0 + max(lod, 0.0) * 0.16;
          // a card seen edge-on is a hairline streak: let it go before it gets there
          // (the shading normals are bent toward the crown, so take the card's own plane from the derivatives)
          vec3 gN = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
          float facing = abs(dot(gN, normalize(vViewPosition)));
          a *= smoothstep(0.12, 0.42, facing);
          diffuseColor.a = a;
        }`,
      normal: /* glsl */ `
        normal = normalize(vNormal);
        #ifdef SF_ATLAS
        {
          // each leaf's own tilt from the scan, laid over the crown normal so the crown keeps its overall shading;
          // the card's frame comes from screen derivatives
          vec3 tn = texture2D(tLeafN, vMapUv).xyz * 2.0 - 1.0;
          #ifdef SF_BLOSSOM
            tn = mix(tn, texture2D(tBlossomN, SF_BUV).xyz * 2.0 - 1.0, sfBloom);
          #endif
          vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition);
          vec2 st0 = dFdx(vMapUv), st1 = dFdy(vMapUv);
          vec3 q1p = cross(q1, normal), q0p = cross(normal, q0);
          vec3 T = q1p * st0.x + q0p * st1.x, B = q1p * st0.y + q0p * st1.y;
          float det = max(dot(T, T), dot(B, B));
          float k = det == 0.0 ? 0.0 : inversesqrt(det);
          normal = normalize((T * tn.x + B * tn.y) * k * 0.85 + normal * max(tn.z, 0.25));
        }
        #endif`,
      alpha: 'if (sfInHouse(vSfWP)) discard;',
      light: /* glsl */ `
        {
          // sun through the leaves when they are backlit
          vec3 Vv = normalize(cameraPosition - vSfWP);
          float back = pow(max(dot(-Vv, uSunDir), 0.0), 2.5);
          float sfShadow = 1.0;
          #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
            sfShadow = sfSunShadow(0.002);
          #endif
          float tr = uTransl * (0.25 + 0.75 * vLeaf.x) * (0.25 + 0.75 * sfShadow);
          reflectedLight.directDiffuse += diffuseColor.rgb * uSunCol * back * tr * 0.45;
          reflectedLight.directDiffuse += diffuseColor.rgb * uSunCol * 0.08 * tr * max(uSunDir.y, 0.0);
          #ifdef SF_BLOSSOM
          {
            // a crown in flower lights its own shade: what reaches the inner petals has bounced off other petals,
            // so the shade stays pink instead of taking the sky's blue (which reads as lilac)
            float pl = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            vec3 tint = clamp(diffuseColor.rgb / max(pl, 1e-3), 0.0, 1.6);
            reflectedLight.indirectDiffuse *= mix(vec3(1.0), tint * vec3(1.04, 1.0, 0.9), sfBloom * 0.6);
          }
          #endif
        }`,
    },
  });
  // shadows sway and thin with the leaves
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: opts.map, alphaTest: 0.5, side: THREE.DoubleSide });
  depth.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms, { uTime: U.uTime, uWind: U.uWind, uSeason: U.uSeason });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${defs}\nuniform float uTime; uniform vec4 uWind;\nvarying vec3 vClipWP;\n${leafHead}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${LEAF_VERT}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n{ vec4 cw = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\ncw = instanceMatrix * cw;\n#endif\nvClipWP = (modelMatrix * cw).xyz; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vLeaf; varying vec3 vClipWP; uniform vec4 uSeason; uniform vec4 uPresence;\n${HOUSE_CLIP}`)
      .replace('#include <alphatest_fragment>', `if (fract(vLeaf.y * 7.31 + 0.13) > dot(uSeason, uPresence) + 0.001 || sfInHouse(vClipWP)) discard;\n#include <alphatest_fragment>`);
  };
  depth.customProgramCacheKey = () => 'leafdepth-' + opts.key;
  return { material: m, depth, uniforms };
}

// tri: bark projected in object space every `tri` metres instead of along the model's uvs (a modelled tree unwrapped
// branch by branch, its stretch differing from limb to limb); grey: how far the bark's own colour is taken out
function woodMaterial(tex, id, tint, stiff, key, { tri = 0, grey = 0, inst = false } = {}) {
  const m = new THREE.MeshStandardMaterial({ map: tex[id + '_c'], normalMap: tex[id + '_n'], roughness: 0.93, color: new THREE.Color(...tint) });
  let defs = `#define SF_STIFF ${stiff.toFixed(3)}\n`;
  // inst: trees instanced at several sizes keep the bark at its own scale instead of stretching it with the tree
  // bark's furrows and fibres hide most of a dielectric's sheen: at full strength the sky's reflection outweighs a
  // dark bark's own colour and every trunk reads as the same pale grey
  const hooks = {
    vertex: LEAF_VERT + (inst ? '\n#ifdef USE_INSTANCING\n{ float sfK = length(instanceMatrix[0].xyz); vMapUv *= sfK; vNormalMapUv *= sfK; }\n#endif' : ''),
    alpha: 'if (sfInHouse(vSfWP)) discard;',
    light: 'reflectedLight.directSpecular *= 0.3; reflectedLight.indirectSpecular *= 0.3;',
  };
  let fragHead = HOUSE_CLIP;
  if (tri) {
    defs += `#define SF_TRI ${tri.toFixed(3)}\nvarying vec3 vTriP; varying vec3 vTriN; varying mat3 vTriM;\n`;
    fragHead += `\n#define SF_TRI ${tri.toFixed(3)}\n` + TRI_FRAG;
    hooks.vertex = TRI_VERT + LEAF_VERT;
    hooks.map = `diffuseColor.rgb = diffuse * triSample(map, vTriP / SF_TRI, triWeights(vTriN)).rgb;`;
    hooks.normal = TRI_NORMAL;
  }
  if (grey) hooks.map = (hooks.map || '') + `{ float gl = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(gl), ${grey.toFixed(2)}); }`;
  patch(m, { key: 'wood-' + key, snow: 0.9, wet: 0.8, vertexHead: defs + WIND_GLSL, fragHead, hooks });
  return m;
}

const TRI_VERT = /* glsl */ `
  vTriP = position;
  vTriN = objectNormal;
  #ifdef USE_INSTANCING
    vTriM = normalMatrix * mat3(instanceMatrix);
  #else
    vTriM = normalMatrix;
  #endif
`;
const TRI_FRAG = /* glsl */ `
varying vec3 vTriP; varying vec3 vTriN; varying mat3 vTriM;
vec3 triWeights(vec3 n) { vec3 w = pow(abs(normalize(n)), vec3(4.0)); return w / (w.x + w.y + w.z); }
vec4 triSample(sampler2D t, vec3 p, vec3 w) { return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z; }
`;
// whiteout-blended triplanar normal (Golus), in object space, then into view space by the instance's normal matrix
const TRI_NORMAL = /* glsl */ `
  {
    vec3 n = normalize(vTriN), w = triWeights(n), tp = vTriP / SF_TRI;
    vec3 tx = texture2D(normalMap, tp.zy).xyz * 2.0 - 1.0, ty = texture2D(normalMap, tp.xz).xyz * 2.0 - 1.0, tz = texture2D(normalMap, tp.xy).xyz * 2.0 - 1.0;
    tx.xy *= normalScale; ty.xy *= normalScale; tz.xy *= normalScale;
    tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x);
    ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y);
    tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
    normal = normalize(vTriM * normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z)) * faceDirection;
  }
`;

function bambooWoodMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.56 });
  const defs = `#define SF_STIFF 0.9\n`;
  patch(m, {
    key: 'bamboo-culm', snow: 0.5, wet: 0.5,
    vertexHead: defs + WIND_GLSL + 'attribute float aAux; varying float vCulm;',
    fragHead: 'varying float vCulm;',
    hooks: {
      vertex: LEAF_VERT + 'vCulm = position.y;',
      map: /* glsl */ `
        {
          // moso culms: internodes a hand long at the foot lengthening to forty centimetres up the culm; a dark
          // ridge at each node with a band of white waxy bloom just below it. Young culms a clear yellow-green,
          // older ones olive and greying, blotched with lichen low down
          float seed = sfNoise(floor(vSfWP.xz * 3.0) + 0.5);
          float f = fract((vCulm + 1.4 * (1.0 - exp(-vCulm / 1.4))) / 0.4 + seed * 7.0);
          float node = smoothstep(0.955, 0.985, f) * smoothstep(1.0, 0.985, f);
          float bloom = smoothstep(0.74, 0.94, f) * (1.0 - node);
          float age = smoothstep(0.5, 0.8, seed);
          // this year's culms deep green, the old ones gone yellow-olive, most between
    float young = smoothstep(0.32, 0.12, seed);
    vec3 c = mix(mix(vec3(0.12, 0.19, 0.045), vec3(0.06, 0.13, 0.03), young), vec3(0.22, 0.2, 0.085), age);
          c *= 0.85 + 0.3 * sfNoise(vec2(vCulm * 0.7, vSfWP.x * 4.0 + vSfWP.z * 4.0));
          float lichen = smoothstep(0.62, 0.8, sfNoise(vec2(vCulm * 3.1, (vSfWP.x + vSfWP.z) * 9.0))) * smoothstep(3.5, 0.5, vCulm) * (0.35 + 0.65 * age);
          c = mix(c, vec3(0.3, 0.3, 0.26), lichen * 0.6);
          c = mix(c, vec3(0.3, 0.32, 0.26), bloom * 0.35);
          c *= 1.0 - node * 0.5;
          c = mix(c, vec3(0.26, 0.23, 0.12), uSeason.w * 0.35);
          diffuseColor.rgb = c;
        }`,
      // in a grove the culm mirrors the green round it far more than the sky
      light: 'reflectedLight.indirectSpecular *= 0.35; reflectedLight.directSpecular *= 0.6;',
    },
  });
  return m;
}

function farMaterial(key, colors, presenceWinter) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  const uniforms = {
    uFarSp: { value: new THREE.Vector3(...colors[0]) },
    uFarSu: { value: new THREE.Vector3(...colors[1]) },
    uFarAu: { value: new THREE.Vector3(...colors[2]) },
    uFarAu2: { value: new THREE.Vector3(...(colors[4] || colors[2])) },
    uFarWi: { value: new THREE.Vector3(...colors[3]) },
  };
  const defs = `#define SF_STIFF 0.08\n`;
  patch(m, {
    key: 'far-' + key, snow: 0.95, wet: 0.2, wrap: 0.4, uniforms,
    vertexHead: defs + WIND_GLSL + 'varying float vSeedF;',
    fragHead: 'uniform vec3 uFarSp, uFarSu, uFarAu, uFarAu2, uFarWi; varying float vSeedF;',
    hooks: {
      vertex: LEAF_VERT + `
        #ifdef USE_INSTANCING
          vSeedF = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
        #endif`,
      map: /* glsl */ `
        {
          vec3 au = mix(uFarAu, uFarAu2, smoothstep(0.3, 0.7, vSeedF));
          vec3 c = uFarSp * uSeason.x + uFarSu * uSeason.y + au * uSeason.z + uFarWi * uSeason.w;
          // foliage clumps with dark gaps between them, so a crown reads as leaves and not as a faceted solid
          vec3 fp = vSfWP * 1.5;
          float cl = sfNoise(fp.xz + fp.y * 1.3) * 0.5 + sfNoise(fp.zy * 2.7 + fp.x * 2.1) * 0.5;
          diffuseColor.rgb *= c * (0.8 + 0.4 * vSeedF) * (0.35 + 0.9 * smoothstep(0.32, 0.68, cl));
          // ragged silhouettes: where the surface turns away, let the sky through between clumps
          vec3 fN = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
          float rim = 1.0 - abs(dot(fN, normalize(vViewPosition)));
          if (cl < smoothstep(0.55, 0.95, rim) * 0.75) discard;
        }`,
      normal: /* glsl */ `
        {
          vec3 fp = vSfWP * 1.5;
          float h = sfNoise(fp.xz + fp.y * 1.3) * 0.5 + sfNoise(fp.zy * 2.7 + fp.x * 2.1) * 0.5;
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
          normal = normalize(abs(det) * normal - grad * 0.5);
        }`,
    },
  });
  return m;
}

// ---------------------------------------------------------------- placement

const BUILDERS = { sakura, sacred, maple, broad, pine, cedar, bamboo };

/**
 * specimens: [{ sp, x, y, z, s, yaw, v }] — species, position (y = ground), scale, yaw, variant index.
 * Species with several variants are instanced per variant; leaves cast shadows with their cut-outs.
 */
export function createGardenTrees(tex, ftex, specimens) {
  const group = new THREE.Group();
  group.name = 'trees';
  const L = (o) => leafMaterial(o);
  const species = {
    // each: the garden's own trees, culled one by one; the woods beyond the wall stay batched
    sacred: {
      each: true,
      seeds: [4242],
      wood: woodMaterial(tex, 'sakura_bark', [0.38, 0.36, 0.42], 0.5, 'shidare'),
      // the scanned trunk keeps its own photographed bark; the same stiffness keeps the new limbs on it in the wind
      extra: SCANNED.sacred.parts.map((pt, i) => Object.assign(woodMaterial({ s_c: pt.maps.map, s_n: pt.maps.normalMap }, 's', [1, 1, 1], 0.5, 'shidare-scan' + i), { vertexColors: true })),
      leaf: L({ key: 'shidare', hearts: true, map: ftex.leaves, normal: ftex.leavesN, blossom: ftex.blossom, blossomNormal: ftex.blossomN, stiff: 0.5, colors: [[0.12, 0.22, 0.05], [0.07, 0.16, 0.035], [0.42, 0.12, 0.035], [0.1, 0.08, 0.06], [0.5, 0.25, 0.05]], presence: [1, 1, 0.8, 0], transl: 0.55 }),
      hang: L({ key: 'shidare-hang', umbel: true, hearts: true, map: ftex.leaves, normal: ftex.leavesN, blossom: ftex.umbel, blossomNormal: ftex.umbelN, stiff: 0.5, colors: [[0.12, 0.22, 0.05], [0.07, 0.16, 0.035], [0.42, 0.12, 0.035], [0.1, 0.08, 0.06], [0.5, 0.25, 0.05]], presence: [1, 1, 0.8, 0], transl: 0.55 }),
    },
    sakura: {
      each: true,
      seeds: [101, 202],
      wood: woodMaterial(tex, 'sakura_bark', [0.5, 0.46, 0.52], 0.22, 'sakura'),
      leaf: L({ key: 'sakura', hearts: true, map: ftex.leaves, normal: ftex.leavesN, blossom: ftex.blossom, blossomNormal: ftex.blossomN, stiff: 0.32, colors: [[0.12, 0.22, 0.05], [0.07, 0.16, 0.035], [0.42, 0.12, 0.035], [0.1, 0.08, 0.06], [0.5, 0.25, 0.05]], presence: [1, 1, 0.85, 0], transl: 0.45 }),
    },
    maple: {
      each: true,
      seeds: [11, 22, 33, 44],
      wood: woodMaterial(tex, 'trident_maple_bark', [1.45, 1.8, 2.4], 0.25, 'maple'),
      leaf: L({ key: 'maple', map: ftex.maple, normal: ftex.mapleN, gradient: true, stiff: 0.4, colors: [[0.2, 0.36, 0.05], [0.07, 0.17, 0.03], [0.62, 0.03, 0.015], [0.12, 0.06, 0.04], [0.7, 0.22, 0.02]], presence: [0.95, 1, 0.92, 0], transl: 0.95 }),
    },
    broad: {
      seeds: [5, 6],
      wood: woodMaterial(tex, 'trident_maple_bark', [1.25, 1.45, 1.5], 0.18, 'broad'),
      // shii and kashi in the woods: dark grey bark, greened by algae on the shaded side
      forest: woodMaterial(tex, 'trident_maple_bark', [1.1, 1.25, 1.3], 0.18, 'broad-f', { inst: true }),
      leaf: L({ key: 'broad', map: ftex.leaves, normal: ftex.leavesN, stiff: 0.3, colors: [[0.13, 0.27, 0.05], [0.055, 0.13, 0.03], [0.48, 0.28, 0.03], [0.1, 0.08, 0.05], [0.5, 0.12, 0.03]], presence: [0.85, 1, 0.8, 0], transl: 0.6 }),
    },
    pine: {
      each: true,
      seeds: [7, 8, 9],
      // kuromatsu bark: the pine's plates, taken to grey-black
      wood: woodMaterial(tex, 'pine_bark', [0.8, 0.85, 0.95], 0.14, 'pine', { tri: 0.8, grey: 0.8 }),
      leaf: L({ key: 'pine', map: ftex.pine, normal: ftex.pineN, stiff: 0.2, colors: [[0.07, 0.13, 0.045], [0.055, 0.115, 0.04], [0.07, 0.11, 0.04], [0.05, 0.09, 0.045]], presence: [1, 1, 1, 1], transl: 0.5, snow: 1 }),
    },
    cedar: {
      seeds: [9, 10],
      wood: woodMaterial(tex, 'japanese_cedar_bark', [2.0, 2.5, 3.6], 0.06, 'cedar'),
      forest: woodMaterial(tex, 'japanese_cedar_bark', [1.7, 2.15, 3.1], 0.06, 'cedar-f', { inst: true }),
      leaf: L({ key: 'cedar', map: ftex.sugi, normal: ftex.sugiN, stiff: 0.07, colors: [[0.07, 0.115, 0.04], [0.055, 0.1, 0.034], [0.065, 0.09, 0.034], [0.08, 0.075, 0.04]], presence: [1, 1, 1, 1], transl: 0.35, snow: 1 }),
    },
    bamboo: {
      seeds: [12, 13, 14],
      wood: bambooWoodMaterial(),
      leaf: L({ key: 'bamboo', map: ftex.bamboo, stiff: 0.9, colors: [[0.095, 0.17, 0.035], [0.07, 0.145, 0.03], [0.09, 0.145, 0.035], [0.12, 0.14, 0.055]], presence: [1, 1, 1, 1], transl: 0.6 }),
    },
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  const stats = { meshes: 0, instances: 0 };
  // the sugi beyond the wall reach the pond's mirror only as a few rippled pixels: there they are cheap cones
  const cedarEye = new THREE.Group(), cedarMirror = new THREE.Group();
  cedarMirror.visible = false;
  group.add(cedarEye, cedarMirror);
  // a tree's full wood is for the eye close to; past LOD_D its stand-in, already drawn for the mirror and shadows,
  // takes its place
  const lods = [];
  for (const [name, sp] of Object.entries(species)) {
    const list = specimens.filter((t) => t.sp === name);
    if (!list.length) continue;
    const variants = sp.seeds.map((sd) => BUILDERS[name](sd));
    for (let vi = 0; vi < variants.length; vi++) {
      const mine = list.filter((t, i) => (t.v ?? i) % variants.length === vi);
      if (!mine.length) continue;
      const batches = sp.each ? mine.map((t) => [t]) : [mine];
      const add = (geo, mat, depth, layer) => {
        const made = [];
        for (const batch of batches) {
          const im = new THREE.InstancedMesh(geo, mat, batch.length);
          batch.forEach((t, i) => {
            q.setFromAxisAngle(UP, t.yaw ?? 0);
            im.setMatrixAt(i, m4.compose(ps.set(t.x, t.y, t.z), q, sc.setScalar(t.s ?? 1)));
          });
          im.instanceMatrix.needsUpdate = true;
          im.computeBoundingSphere();
          im.castShadow = layer === undefined || layer === LAYER_LO;
          im.receiveShadow = true;
          if (layer !== undefined) im.layers.set(layer);
          if (depth) im.customDepthMaterial = depth;
          im.userData.bake = depth ? { coverage: 0.55 } : {};
          (name === 'cedar' ? cedarEye : group).add(im);
          made.push(im);
          stats.meshes++;
          stats.instances += batch.length;
        }
        return made;
      };
      // a modelled tree's full wood is for the eye only; the mirror, the shadow and the sky bake take its stand-in,
      // and fine twigs (the weeping cherry's shoots, the outer branches of the trees beyond the wall) go to none of them
      const wood = (geo, lo, mat) => {
        if (!lo) return add(geo, mat);
        const full = add(geo, mat, null, LAYER_NOREFL), stand = add(lo, mat, null, LAYER_LO);
        if (sp.each) batches.forEach(([t], i) => lods.push({ full: full[i], stand: stand[i], p: new THREE.Vector3(t.x, t.y + 3, t.z) }));
      };
      wood(variants[vi].wood, variants[vi].lo, sp.wood);
      if (variants[vi].fine) add(variants[vi].fine, sp.wood, null, LAYER_NOREFL);
      add(variants[vi].leaf, sp.leaf.material, sp.leaf.depth);
      if (variants[vi].hang) add(variants[vi].hang, sp.hang.material, sp.hang.depth);
      (variants[vi].extra || []).forEach((pt, i) => wood(pt.geometry, pt.lo, sp.extra[i]));
    }
  }
  {
    const list = specimens.filter((t) => t.sp === 'cedar');
    const v = BUILDERS.cedar(species.cedar.seeds[0]);
    v.leaf.computeBoundingBox();
    const h = v.leaf.boundingBox.max.y;
    const im = new THREE.InstancedMesh(farConifer(1), farMaterial('con', [[0.05, 0.095, 0.04], [0.04, 0.085, 0.035], [0.05, 0.08, 0.035], [0.04, 0.07, 0.045]]), list.length);
    list.forEach((t, i) => {
      q.setFromAxisAngle(UP, t.yaw ?? 0);
      const H = h * (t.s ?? 1);
      im.setMatrixAt(i, m4.compose(ps.set(t.x, t.y, t.z), q, sc.setScalar(H)));
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.userData.bake = { skip: true };
    cedarMirror.add(im);
  }
  group.userData.stats = stats;
  group.userData.species = species;
  group.userData.mirrorSwap = [cedarEye, cedarMirror];
  const LOD_D = 32;
  group.userData.updateLod = (cam) => {
    for (const l of lods) {
      const far = l.p.distanceTo(cam) > LOD_D;
      if (l.full.visible === !far) continue;
      l.full.visible = !far;
      l.stand.layers.mask = far ? (1 << LAYER_LO) | (1 << LAYER_NOREFL) : 1 << LAYER_LO;
    }
  };
  return group;
}

// far forest on the hills: instanced low forms, no shadows
// species: the garden's own (createGardenTrees' userData.species). Out to NEAR_FAR metres the hills carry the woods'
// own sugi and broadleaves at their far detail, lit and coloured by the same leaf materials, so the skyline above
// the wall is one forest; beyond, where a tree is a few dozen pixels, the cheap forms
const NEAR_FAR = 330;
export function createFarForest(points, species) {
  const group = new THREE.Group();
  group.name = 'far-forest';
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  const near = (p) => Math.hypot(p.x + 2, p.z - 2) < NEAR_FAR;
  // the woods round the wall in 40 m tiles, so the view and the shadow maps cull them; the pond's mirror, which
  // shows them a few pixels high through its ripples, takes the hills' cheap forms at the same places instead
  const nearWoods = new THREE.Group(), mirrorWoods = new THREE.Group();
  nearWoods.name = 'near-woods';
  mirrorWoods.name = 'mirror-woods';
  mirrorWoods.visible = false;
  group.add(nearWoods, mirrorWoods);
  const instanced = (geo, mat, list, height, depth) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    // within the far sun's map the woods cast their shade; past it, nothing is there to take it
    im.castShadow = height !== 1;
    im.receiveShadow = true;
    if (depth) im.customDepthMaterial = depth;
    list.forEach((p, i) => {
      q.setFromAxisAngle(UP, p.yaw);
      const k = p.s / height;
      im.setMatrixAt(i, m4.compose(ps.set(p.x, p.y, p.z), q, height === 1 ? sc.set(p.s * p.w, p.s, p.s * p.w) : sc.setScalar(k)));
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    // the woods round the wall shade their own floor in the outer visibility volume; the hills are past it
    if (height === 1) im.userData.bake = { skip: true };
    return im;
  };
  const place = (geo, mat, list, height, depth, parent = group) => {
    if (parent !== nearWoods) return parent.add(instanced(geo, mat, list, height, depth));
    const tiles = new Map();
    for (const p of list) {
      const k = Math.floor(p.x / 40) + ',' + Math.floor(p.z / 40);
      if (!tiles.has(k)) tiles.set(k, []);
      tiles.get(k).push(p);
    }
    for (const tl of tiles.values()) nearWoods.add(instanced(geo, mat, tl, height, depth));
  };
  // the woods round the wall are seen from a few metres: rounder trunks, and the bark at its own scale
  for (const fill of [true, false]) {
    for (const [k, name, seeds] of [[0, 'cedar', [9, 10]], [1, 'broad', [5, 6]]]) {
      const sp = species[name];
      seeds.forEach((sd, vi) => {
        const list = points.filter((p) => p.k === k && near(p) && !!p.fill === fill && p.v % seeds.length === vi);
        if (!list.length) return;
        const t = BUILDERS[name](sd, 1, fill ? 10 : 5);
        t.leaf.computeBoundingBox();
        const height = t.leaf.boundingBox.max.y;
        place(t.wood, fill ? sp.forest : sp.wood, list, height, null, nearWoods);
        place(t.leaf, sp.leaf.material, list, height, sp.leaf.depth, nearWoods);
      });
    }
  }
  const sets = [
    { geos: [farConifer(1), farConifer(2), farConifer(3)], mat: farMaterial('con', [[0.05, 0.095, 0.04], [0.04, 0.085, 0.035], [0.05, 0.08, 0.035], [0.04, 0.07, 0.045]]) },
    { geos: [farBroad(3), farBroad(4)], mat: farMaterial('broad', [[0.1, 0.18, 0.05], [0.05, 0.12, 0.03], [0.4, 0.12, 0.03], [0.08, 0.07, 0.06], [0.42, 0.26, 0.04]]) },
  ];
  for (let k = 0; k < 2; k++) {
    const set = sets[k];
    for (let vi = 0; vi < set.geos.length; vi++) {
      const mine = points.filter((p) => p.k === k && !near(p) && p.v % set.geos.length === vi);
      if (mine.length) place(set.geos[vi], set.mat, mine, 1);
      const stand = points.filter((p) => p.k === k && near(p) && p.v % set.geos.length === vi);
      if (stand.length) place(set.geos[vi], set.mat, stand, 1, null, mirrorWoods);
    }
  }
  mirrorWoods.traverse((o) => { o.castShadow = false; });
  group.userData.mirrorSwap = [nearWoods, mirrorWoods];
  return group;
}

// Garden structures: the earthen boundary wall with its tiled coping, the yakui-mon gate, four scanned stone lanterns
// (the Miyajima kasuga on the roji, a square one on the far shore, a yukimi at the water, a mossy kasuga at the
// basin), the tsukubai with its bamboo spout, a long natural slab over the stream, and the five-storey pagoda on the
// far slope that the garden borrows.
import * as THREE from 'three';
import { Kit, Geo, vec } from '../house/kit.js';
import { mergeKit } from '../house/parts.js';
import { patch } from '../core/shared.js';
import { pbr, loadGLB, meshesOf } from '../core/assets.js';
import { heightAt, WALL, GATE, ROJI, KARE } from './site.js';
import { rng } from '../lib/math.js';
import { LAYER_NOREFL, LAYER_LO } from '../core/pipeline.js';

// a tiled slope between an eave line and a ridge, with the same S-pan relief as the house roofs
function tileSlope(g, origin, sDir, tDir, len, slope) {
  const relief = (s, t) => {
    const ph = (s / 0.27) * Math.PI * 2;
    const roll = Math.pow(Math.max(0, Math.cos(ph)), 0.6) * 0.04 - 0.01;
    const f = t / 0.22 - Math.floor(t / 0.22);
    return roll + (1 - f) * 0.02;
  };
  const nrm = new THREE.Vector3().crossVectors(sDir, tDir).normalize();
  if (nrm.y < 0) nrm.negate();
  const rows = Math.max(2, Math.ceil(slope / 0.055)), cols = Math.max(2, Math.ceil(len / 0.045));
  const base = g.vc, eps = 0.01;
  for (let j = 0; j <= rows; j++) {
    const t = (j / rows) * slope;
    for (let i = 0; i <= cols; i++) {
      const s = (i / cols) * len;
      const d = relief(s, t);
      const ds = (relief(s + eps, t) - d) / eps, dt = (relief(s, t + eps) - d) / eps;
      const p = origin.clone().addScaledVector(sDir, s).addScaledVector(tDir, t).addScaledVector(nrm, d + 0.015);
      g.vert(p, nrm.clone().addScaledVector(sDir, -ds).addScaledVector(tDir, -dt).normalize(), s, t, null);
    }
  }
  // wound so the tiles face the sky whichever way the slope runs
  const skyward = new THREE.Vector3().crossVectors(tDir, sDir).y > 0;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const a = base + j * (cols + 1) + i, b = a + cols + 1;
      if (skyward) g.idx.push(a, b, a + 1, a + 1, b, b + 1);
      else g.idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  // the eave: the tiles' own thickness along the front edge, and the round end tile (manju) closing each roll
  const out = tDir.clone().negate().setY(0).normalize();
  const down = new THREE.Vector3(0, -0.028, 0);
  const sb = g.vc;
  for (let i = 0; i <= cols; i++) {
    const sv = (i / cols) * len;
    const p = origin.clone().addScaledVector(sDir, sv).addScaledVector(nrm, relief(sv, 0) + 0.015);
    g.vert(p, out, sv, 0, null);
    g.vert(p.clone().add(down), out, sv, 0.028, null);
  }
  const e1 = down.clone(), e2 = sDir.clone();
  const fwd = new THREE.Vector3().crossVectors(e1, e2).dot(out) > 0;
  for (let i = 0; i < cols; i++) {
    const a = sb + i * 2;
    if (fwd) g.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    else g.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const SEG = 12, rC = 0.036;
  const u = sDir.clone(), v = new THREE.Vector3().crossVectors(out, sDir).normalize();
  if (v.y < 0) v.negate();
  for (let sc = 0.27; sc < len - 0.1; sc += 0.27) {
    const c = origin.clone().addScaledVector(sDir, sc).addScaledVector(nrm, relief(sc, 0) + 0.015 - rC + 0.006).addScaledVector(out, 0.01);
    const c0 = g.vert(c, out, 0, 0, null);
    for (let k2 = 0; k2 <= SEG; k2++) {
      const a = (k2 / SEG) * Math.PI * 2;
      g.vert(c.clone().addScaledVector(u, Math.cos(a) * rC).addScaledVector(v, Math.sin(a) * rC), out, 0, 0, null);
    }
    const ccw = new THREE.Vector3().crossVectors(u, v).dot(out) > 0;
    for (let k2 = 0; k2 < SEG; k2++) g.idx.push(...(ccw ? [c0, c0 + 1 + k2, c0 + 2 + k2] : [c0, c0 + 2 + k2, c0 + 1 + k2]));
    // the disc's rim, back to the roll
    const rb = g.vc;
    for (let k2 = 0; k2 <= SEG; k2++) {
      const a = (k2 / SEG) * Math.PI * 2, n = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
      const q = c.clone().addScaledVector(n, rC);
      g.vert(q, n, 0, 0, null);
      g.vert(q.clone().addScaledVector(out, -0.03), n, 0, 0, null);
    }
    for (let k2 = 0; k2 < SEG; k2++) {
      const a = rb + k2 * 2;
      g.idx.push(...(ccw ? [a, a + 1, a + 2, a + 1, a + 3, a + 2] : [a, a + 2, a + 1, a + 1, a + 2, a + 3]));
    }
  }
}

// a small kawara gable over a run (wall coping, gate roof): eave at ye, half depth dh, pitch
function tiledGable(k, a, b, ye, dh, pitch, overhang = 0.12) {
  const along = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
  const len = along.length() + overhang * 2;
  along.normalize();
  const across = new THREE.Vector3(-along.z, 0, along.x);
  const start = new THREE.Vector3(a.x, ye, a.z).addScaledVector(along, -overhang);
  const H = dh * pitch;
  const slope = Math.hypot(dh, H);
  const tile = k.g('tile');
  for (const side of [1, -1]) {
    const eave = start.clone().addScaledVector(across, side * dh);
    const up = across.clone().multiplyScalar(-side * dh).add(new THREE.Vector3(0, H, 0)).normalize();
    tileSlope(tile, eave, along, up, len, slope);
    k.g('tileShadow').quad(eave, eave.clone().addScaledVector(along, len), eave.clone().addScaledVector(along, len).addScaledVector(up, slope), eave.clone().addScaledVector(up, slope), [0, 0, 1, 0, 1, 1, 0, 1]);
    // the underside, a plain board
    const und = k.g('weathered');
    const p0 = eave.clone().add(new THREE.Vector3(0, -0.03, 0)), p1 = p0.clone().addScaledVector(along, len);
    const top = start.clone().add(new THREE.Vector3(0, H - 0.03, 0));
    const p2 = top.clone().addScaledVector(along, len), p3 = top.clone();
    if (side > 0) und.quad(p0, p3, p2, p1, [0, 0, 0, 1, len, 1, len, 0], [0.6, 0.58, 0.55]);
    else und.quad(p0, p1, p2, p3, [0, 0, len, 0, len, 1, 0, 1], [0.6, 0.58, 0.55]);
  }
  // ridge: two courses of noshi tiles, each laid on its own so its joints show and the upper course breaks joint,
  // under a round cap in sections, each lapping the next with a collar; a disc closes the cap at both ends
  const ridge = k.g('tileRidge');
  const ry = Math.atan2(-along.z, along.x);
  const nT = Math.max(1, Math.round(len / 0.27)), tl = len / nT;
  const at = (sv, y) => start.clone().addScaledVector(along, sv).add(new THREE.Vector3(0, y, 0));
  for (let i = 0; i < nT; i++) ridge.box(at((i + 0.5) * tl, H + 0.015), vec(tl - 0.005, 0.035, 0.22), { ry, grain: 'x', chamfer: 0.005 });
  for (let i = 0; i <= nT; i++) {
    const s0 = Math.max(0.01, (i - 0.5) * tl), s1 = Math.min(len - 0.01, (i + 0.5) * tl);
    ridge.box(at((s0 + s1) / 2, H + 0.049), vec(s1 - s0 - 0.005, 0.03, 0.19), { ry, grain: 'x', chamfer: 0.005 });
  }
  const yc = H + 0.104, rc = 0.058;
  for (let i = 0; i < nT; i++) {
    ridge.tube([at(i * tl, yc), at((i + 1) * tl, yc)], [rc + 0.002, rc], 10, 0.5);
    if (i > 0) ridge.tube([at(i * tl - 0.004, yc), at(i * tl + 0.03, yc)], [rc + 0.007, rc + 0.007], 10, 0.5);
  }
  for (const [sv, dir] of [[0, -1], [len, 1]]) {
    const c = at(sv, yc), nrm = along.clone().multiplyScalar(dir);
    const u = across, v = new THREE.Vector3(0, 1, 0);
    const c0 = ridge.vert(c, nrm, 0, 0, null);
    for (let q = 0; q <= 10; q++) {
      const a = (q / 10) * Math.PI * 2;
      ridge.vert(c.clone().addScaledVector(u, Math.cos(a) * (rc + 0.002)).addScaledVector(v, Math.sin(a) * (rc + 0.002)), nrm, 0, 0, null);
    }
    const ccw = new THREE.Vector3().crossVectors(u, v).dot(nrm) > 0;
    for (let q = 0; q < 10; q++) ridge.idx.push(...(ccw ? [c0, c0 + 1 + q, c0 + 2 + q] : [c0, c0 + 2 + q, c0 + 1 + q]));
  }
  return H;
}

function earthWall() {
  const clay = pbr('clay_plaster', 'cn');
  const map = clay.map.clone(); map.repeat.set(1 / 1.6, 1 / 1.6); map.needsUpdate = true;
  const nm = clay.normalMap.clone(); nm.repeat.set(1 / 1.6, 1 / 1.6); nm.needsUpdate = true;
  // a muted ochre earth; the scan supplies light and shade only (its own colour is a strong orange)
  const m = new THREE.MeshStandardMaterial({ map, normalMap: nm, color: 0xb59a74, roughness: 0.96, vertexColors: true });
  patch(m, {
    key: 'earthwall', snow: 0.5,
    uniforms: { tWeather: { value: pbr('worn_mossy_plasterwall', 'c').map } },
    fragHead: 'uniform sampler2D tWeather;',
    hooks: {
      map: /* glsl */ `
        {
          {
            vec4 tx = texture2D(map, vMapUv);
            vec3 d = tx.rgb / vec3(0.1695, 0.1031, 0.0452);
            diffuseColor.rgb = diffuse * mix(vec3(dot(d, vec3(0.2126, 0.7152, 0.0722))), d, 0.15);
          }
          // the weather, from a scanned worn wall (1.8 m square, mean luminance 0.225): its grime and rain-wash as
          // light and shade over the clay
          // only where the finish coat has worn (sparse, wall-sized patches); elsewhere a sound trowelled skin
          float along = vSfWP.x + vSfWP.z;
          float wl = dot(texture2D(tWeather, vec2(along, vSfWP.y) / 1.8).rgb, vec3(0.2126, 0.7152, 0.0722)) / 0.225;
          float worn = smoothstep(0.58, 0.78, sfNoise(vec2(along * 0.23 + 3.1, vSfWP.y * 0.45)));
          diffuseColor.rgb *= mix(1.0, clamp(wl, 0.55, 1.3), 0.08 + 0.5 * worn);
          // the coping drips: narrow grey runs from under the tiles, most of them short, a few down to the foot where
          // a tile joint leaks
          float top = smoothstep(1.55, 2.15, vSfWP.y);
          float leak = smoothstep(0.55, 0.85, sfNoise(vec2(along * 0.9, 7.3)));
          float fine = smoothstep(0.5, 0.82, sfNoise(vec2(along * 9.0, vSfWP.y * 0.35)));
          float reach = mix(1.7, 0.2, leak);
          float runs = fine * smoothstep(reach - 0.4, reach + 0.3, vSfWP.y);
          float stain = clamp(top * 0.22 + runs * 0.7, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))) * 0.62, stain * 0.55);
          // the foot: rain splash darkens it, and moss climbs out of the garden onto it in patches
          float foot = smoothstep(0.6, 0.0, vSfWP.y);
          diffuseColor.rgb *= 1.0 - foot * 0.3;
          float moss = foot * smoothstep(0.38, 0.62, sfNoise(vec2(along * 1.7, vSfWP.y * 3.0)) + 0.25 * (wl - 1.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.075, 0.025) * (0.7 + 0.5 * wl), moss * 0.8);
        }`,
    },
  });
  return m;
}

// how each scan sits in this light: albedo trim against the garden's other stone, and how much snow it holds
const SCAN_LOOK = {
  toro: { tint: 0xd8d4cc, rough: 0.92, snow: 0.9 },
  kasuga: { tint: 0xd0ccc4, rough: 0.9, snow: 0.9 },
  kaku: { tint: 0xd0ccc4, rough: 0.9, snow: 0.9 },
  yukimi: { tint: 0xc4c2bc, rough: 0.88, snow: 1 },
  tsukubai: { tint: 0xc0bdb6, rough: 0.85, snow: 0.6 },
  flagstone: { tint: 0xc8c4bc, rough: 0.85, snow: 0.9 },
  bridge: { tint: 0xd0ccc4, rough: 0.88, snow: 0.9 },
  kutsunugi: { tint: 0xf4efe8, rough: 0.7, snow: 0, sat: 0.12 },
  tetsubin: { tint: 0xffffff, rough: 0.42, snow: 0 },
  // zabuton looks: persimmon-brown and a deep indigo, dyed over the scan's white cotton
  cushion: { tint: 0x7a4a36, rough: 0.95, snow: 0 },
  cushionB: { tint: 0x30384a, rough: 0.95, snow: 0 },
  andon: { tint: 0x2b1f18, rough: 0.55, snow: 0 },
  chawan: { tint: 0xffffff, rough: 0.32, snow: 0 },
  geta: { tint: 0xf2f0ec, rough: 0.6, snow: 0 },
};

export function createStructures(M, lamps) {
  const mats = { ...M, earthwall: earthWall() };
  const k = new Kit(mats);
  const R = rng(99);

  // ---- boundary wall: stone footing, earthen body, a tiled coping
  const wallRuns = [];
  const { x0, x1, z0, z1, gate } = WALL;
  wallRuns.push([[x0, z1], [gate[0], z1]], [[gate[1], z1], [x1, z1]], [[x1, z1], [x1, z0]], [[x1, z0], [x0, z0]], [[x0, z0], [x0, z1]]);
  const WH = 2.05, WT = 0.5;
  for (const [a, b] of wallRuns) {
    const ax = a[0], az = a[1], bx = b[0], bz = b[1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(len / 2.0);
    // the coping runs level; the body rises from each stepped footing to meet it, so no gap opens where the ground dips
    const yTop = WH + Math.min(heightAt(ax, az), heightAt(bx, bz));
    for (let i = 0; i < n; i++) {
      // follow the ground in steps, the way a real wall's courses step on a slope
      const f0 = i / n, f1 = (i + 1) / n;
      const sx = ax + (bx - ax) * f0, sz = az + (bz - az) * f0, ex = ax + (bx - ax) * f1, ez = az + (bz - az) * f1;
      const y = Math.min(heightAt(sx, sz), heightAt(ex, ez), heightAt((sx + ex) / 2, (sz + ez) / 2));
      const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
      const cx = (sx + ex) / 2, cz = (sz + ez) / 2, L = len / n + 0.002;
      const size = (w, h) => (alongX ? vec(L, h, w) : vec(w, h, L));
      k.g('stone').box(vec(cx, y + 0.15 - 0.2, cz), size(WT + 0.12, 0.7), { grain: alongX ? 'x' : 'z', uo: R() * 9, vo: R() * 9 });
      const bh = yTop + 0.02 - (y + 0.15);
      k.g('earthwall').box(vec(cx, y + 0.15 + bh / 2, cz), size(WT, bh), { grain: alongX ? 'x' : 'z', noEnds: true, uo: (alongX ? cx : cz), vo: 0 });
    }
    tiledGable(k, vec(ax, 0, az), vec(bx, 0, bz), yTop + 0.05, WT / 2 + 0.28, 0.5, 0.15);
  }
  // ---- the kare garden's kerb: dressed granite setts round the gravel, a few centimetres proud of the moss and the
  // drip line, following the arc where the moss mound takes the corner
  {
    const { x0: kx0, x1: kx1, z0: kz0, z1: kz1 } = KARE;
    const mc = [19.5, 9.2], mr = 3.4;
    const xs = mc[0] - Math.sqrt(mr * mr - (kz1 - mc[1]) ** 2), ze = mc[1] - Math.sqrt(mr * mr - (kx1 - mc[0]) ** 2);
    const a0 = Math.atan2(kz1 - mc[1], xs - mc[0]), a1 = Math.atan2(ze - mc[1], kx1 - mc[0]) + Math.PI * 2;
    const arc = [];
    // from 1: the arc's first point is [xs, kz1], already the straight run's end
    for (let i = 1; i <= 24; i++) { const a = a0 + (a1 - a0) * (i / 24); arc.push([mc[0] + Math.cos(a) * mr, mc[1] + Math.sin(a) * mr]); }
    const line = [[kx1, ze], [kx1, kz0], [kx0, kz0], [kx0, kz1], [xs, kz1], ...arc];
    const KR = rng(717);
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / KR.range(0.42, 0.56)));
      for (let j = 0; j < n; j++) {
        const f = (j + 0.5) / n, L = len / n - 0.008;
        // the sett's centre sits just outside the gravel's edge
        const tx = (bx - ax) / len, tz = (bz - az) / len, ox = -tz * 0.055, oz = tx * 0.055;
        const cx = ax + (bx - ax) * f + ox, cz = az + (bz - az) * f + oz;
        const y = heightAt(cx, cz);
        k.g('stone').box(vec(cx, y - 0.05 + KR.range(-0.004, 0.006), cz), vec(L, 0.18, KR.range(0.095, 0.11)), { grain: 'x', ry: Math.atan2(-tz, tx) + KR.range(-0.02, 0.02), chamfer: 0.01, uo: KR() * 9, vo: KR() * 9 });
      }
    }
  }
  // corners: fill the cap gaps with a square post of earth
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    // no higher than the lower of the copings meeting here
    const tops = wallRuns.filter(([a, b]) => (a[0] === x && a[1] === z) || (b[0] === x && b[1] === z)).map(([a, b]) => WH + Math.min(heightAt(a[0], a[1]), heightAt(b[0], b[1])));
    const y0 = heightAt(x, z) - 0.2, y1 = Math.min(...tops) + 0.02;
    k.g('earthwall').box(vec(x, (y0 + y1) / 2, z), vec(WT, y1 - y0, WT), { grain: 'y' });
  }

  // ---- yakui-mon: two main posts, two rear posts, a beam, a gable roof, doors folded inward
  {
    const gx = GATE.x, gz = GATE.z, w = gate[1] - gate[0], gy = heightAt(gx, gz);
    const hw = w / 2 - 0.1;
    for (const s of [-1, 1]) {
      k.g('weathered').box(vec(gx + s * hw, gy + 1.65, gz), vec(0.3, 3.3, 0.26), { grain: 'y', chamfer: 0.02 });
      k.g('weathered').box(vec(gx + s * hw, gy + 1.35, gz - 1.0), vec(0.18, 2.7, 0.18), { grain: 'y', chamfer: 0.015 });
      k.g('weathered').box(vec(gx + s * hw, gy + 2.55, gz - 0.5), vec(0.14, 0.18, 1.1), { grain: 'z', chamfer: 0.01 });
      k.g('stone').box(vec(gx + s * hw, gy + 0.05, gz), vec(0.5, 0.25, 0.5), { grain: 'y', chamfer: 0.04 });
      // a door, swung open against the inside of the wall
      const door = new Geo();
      for (let i = 0; i < 5; i++) door.box(vec(0.06 + i * 0.27, 0, 0), vec(0.26, 2.45, 0.045), { grain: 'y', chamfer: 0.004 });
      door.box(vec(0.6, 0.75, -0.04), vec(1.3, 0.12, 0.05), { grain: 'x' });
      door.box(vec(0.6, -0.75, -0.04), vec(1.3, 0.12, 0.05), { grain: 'x' });
      const kk = new Kit({});
      kk.geos.set('darkwood', door);
      const m = new THREE.Matrix4().makeRotationY(s < 0 ? -Math.PI / 2 + 0.25 : Math.PI / 2 - 0.25);
      if (s > 0) m.multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
      m.setPosition(gx + s * (hw - 0.15), gy + 1.37, gz - 0.12);
      mergeKit(k, kk, m);
    }
    k.g('weathered').boxMM(gx - hw - 0.4, gy + 3.2, gz - 0.12, gx + hw + 0.4, gy + 3.5, gz + 0.12, { grain: 'x', chamfer: 0.015 });
    k.g('weathered').boxMM(gx - hw - 0.2, gy + 2.62, gz - 0.1, gx + hw + 0.2, gy + 2.82, gz + 0.1, { grain: 'x', chamfer: 0.01 });
    k.g('weathered').boxMM(gx - hw, gy + 3.5, gz - 1.1, gx + hw, gy + 3.62, gz + 0.2, { grain: 'x' });
    k.g('stone').boxMM(gx - hw - 0.3, gy - 0.1, gz - 1.25, gx + hw + 0.3, gy + 0.08, gz + 0.35, { grain: 'x' });
    // the roof: ridge along x over the gate, eaves front and back
    const H = tiledGable(k, vec(gx - hw - 0.2, 0, gz - 0.45), vec(gx + hw + 0.2, 0, gz - 0.45), gy + 3.62, 1.55, 0.62, 0.45);
    void H;
  }

  // ---- lanterns: scanned stone, placed once their models load (see placeScans); their lights are known now
  const scans = [];
  const lantern = (model, x, z, h, yaw, fire, y = heightAt(x, z), r = 3.0, i = 0.85) => {
    scans.push({ model, x, y, z, h, yaw });
    lamps.push({ p: [x, y + h * fire, z], c: [1.0, 0.6, 0.28], r, i, kind: 'toro' });
  };
  // the Miyajima kasuga beside the roji path, a square lantern on the far shore, the yukimi at the water, a mossy
  // kasuga by the stream's basin
  lantern('toro', -19.9, 10.6, 2.0, 0.5, 0.76, undefined, 3.2, 0.9);
  lantern('kaku', 8.7, 3.4, 1.33, 2.2, 0.72);
  lantern('yukimi', 0.9, 5.05, 1.05, 0.3, 0.6, -0.02, 3.0, 0.8);
  lantern('kasuga', -4.15, -2.3, 1.75, 4.0, 0.7, heightAt(-4.15, -2.3) - 0.04, 2.4, 0.7);

  // ---- tsukubai: a scanned basin standing in its gravel, brimming, fed by a bamboo spout. One at the head of the
  // stream, one in the roji where the path to the house passes the lantern: the old composition of basin, lantern
  // and the stones you crouch on
  const spouts = [];
  const basin = (bx, bz, yaw, sx, sz) => {
    const by = heightAt(bx, bz);
    // the scan's gravel skirt sits a centimetre under the moss so its rim never shows
    scans.push({ model: 'tsukubai', x: bx, y: by - 0.045, z: bz, yaw });
    // the scan's water has a hole where the camera saw through it; a still surface at its level covers it
    k.g('lacquer').lathe(vec(bx, by - 0.045, bz), [[0.155, 0.482], [0.0, 0.482]], 20);
    // the kakei: a bamboo post and a split pipe reaching over the basin from (sx, sz)
    const b = k.g('bamboo');
    const px = bx + sx, pz = bz + sz;
    b.tube([vec(px, by - 0.05, pz), vec(px, by + 0.8, pz)], [0.035, 0.035], 10, 0.3);
    const tip = vec(bx + sx * 0.11, by + 0.65, bz + sz * 0.17);
    b.tube([vec(px + sx * 0.09, by + 0.74, pz + sz * 0.06), tip], [0.022, 0.022], 10, 0.3);
    spouts.push([tip.x, tip.y, tip.z]);
  };
  basin(-3.15, -4.05, 0.6, 0.9, -0.35);
  basin(ROJI.x, ROJI.z, 2.4, 0.85, 0.1);
  // the front stone to crouch on, toward the path; the flanking stones for a hand lantern and a bucket of warm water
  for (const [x, z, s, r] of [[ROJI.x - 0.05, ROJI.z - 0.78, 0.95, 0.4], [ROJI.x - 0.85, ROJI.z - 0.3, 0.7, 1.9], [ROJI.x + 0.75, ROJI.z - 0.55, 0.62, 3.1]]) scans.push({ model: 'flagstone', x, y: heightAt(x, z) - 0.03, z, yaw: r, h: 0.12 * s });
  const spout = spouts[0];

  // ---- a long field stone laid across the stream where the path from the moss garden crosses it: the scan lies
  // along z, its broken foot (-z) sunk in the west bank
  scans.push({ model: 'bridge', x: -3.05, y: -0.45, z: 3.15, yaw: Math.PI / 2 + 0.12, lo: true });
  const group = new THREE.Group();
  group.name = 'structures';
  k.build(group);
  return { group, mats, spout, spouts, scans };
}

// scanned lanterns and the basin, with the world's material on the scan's maps
// the square lantern is under the Sketchfab Standard licence, which keeps it out of the public repository; a clone
// without it stands the Miyajima scan in its place
const STAND_IN = { kaku: 'toro' };
const PRESENT = { kaku: __KAKU__ };

export async function placeScans(st) {
  st.missing = [...new Set(st.scans.map((s) => s.model).filter((n) => PRESENT[n] === false))];
  for (const s of st.scans) if (st.missing.includes(s.model)) s.model = STAND_IN[s.model];
  const names = [...new Set(st.scans.map((s) => s.model))];
  const models = Object.fromEntries(await Promise.all(names.map(async (n) => {
    try {
      return [n, meshesOf(await loadGLB(n))];
    } catch (e) {
      if (!STAND_IN[n]) throw e;
      console.warn('[ut] no', n, 'model, standing in', STAND_IN[n]);
      st.missing.push(n);
      return [n, null];
    }
  })));
  for (const s of st.scans) if (!models[s.model]) s.model = STAND_IN[s.model];
  for (const n of new Set(st.scans.map((s) => s.model))) models[n] ??= meshesOf(await loadGLB(n));
  const loNames = [...new Set(st.scans.filter((s) => s.lo).map((s) => s.model))];
  const los = Object.fromEntries(await Promise.all(loNames.map(async (n) => [n, meshesOf(await loadGLB(n + '_lo'))])));
  const mats = {};
  for (const s of st.scans) {
    const parts = models[s.model];
    for (const [i, part] of parts.entries()) {
      const look = s.look || s.model;
      const key = look + '-' + s.model + '-' + part.name;
      const own = s.mats?.[part.name];
      if (own) mats[key] = own;
      else if (!mats[key]) {
        const cfg = SCAN_LOOK[look];
        const m = new THREE.MeshStandardMaterial({ ...part.maps, color: cfg.tint, roughness: cfg.rough });
        // sat: how much of the scan's own colour to keep (the step stone indoors loses the moss it grew outside)
        const hooks = cfg.sat === undefined ? undefined : { map: /* glsl */ `
          {
            diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), diffuseColor.rgb, ${cfg.sat.toFixed(2)});
          }` };
        patch(m, { key: 'scan-' + key, snow: cfg.snow, hooks });
        mats[key] = m;
      }
      const place = (geo) => {
        const g = geo.clone();
        if (s.h) { g.computeBoundingBox(); const k = s.h / g.boundingBox.max.y; g.scale(k, k, k); }
        g.rotateY(s.yaw);
        g.translate(s.x, s.y, s.z);
        g.computeBoundingSphere();
        return g;
      };
      const mesh = new THREE.Mesh(place(part.geometry), mats[key]);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.name = 'scan-' + s.model;
      st.group.add(mesh);
      if (s.lo) {
        // walked over at the scan's full detail; the mirror and the shadow take its stand-in
        mesh.castShadow = false;
        mesh.layers.set(LAYER_NOREFL);
        const lo = new THREE.Mesh(place(los[s.model][i].geometry), mats[key]);
        lo.castShadow = lo.receiveShadow = true;
        lo.layers.set(LAYER_LO);
        lo.name = 'scan-' + s.model + '-lo';
        st.group.add(lo);
      }
    }
  }
}

// the five-storey pagoda on the far slope; built at its own origin and placed by the caller
export function createPagoda(M) {
  const k = new Kit(M);
  const g = k.g('lacquerRed'), t = k.g('tile'), w = k.g('plaster');
  const base = 6.2, storey = 4.6;
  k.g('stone').box(vec(0, 0.6, 0), vec(base + 2.4, 1.2, base + 2.4), { grain: 'x' });
  for (let i = 0; i < 5; i++) {
    const s = base * (1 - i * 0.075), y = 1.2 + i * storey;
    g.box(vec(0, y + storey * 0.32, 0), vec(s, storey * 0.64, s), { grain: 'y' });
    w.box(vec(0, y + storey * 0.36, 0), vec(s * 0.82, storey * 0.5, s * 1.002), { grain: 'y' });
    w.box(vec(0, y + storey * 0.36, 0), vec(s * 1.002, storey * 0.5, s * 0.82), { grain: 'y' });
    // the deep eaves, curving up at the corners
    const e = s * 0.5 + 2.1;
    for (const geo of [t, k.g('tileShadow')]) geo.lathe(vec(0, y + storey * 0.64, 0), [[e, 0.25], [e - 0.1, 0.55], [e * 0.55, 1.15], [s * 0.42, 1.45], [0, 1.5]], 4, { facet: true, a0: Math.PI / 4 });
    g.lathe(vec(0, y + storey * 0.64, 0), [[s * 0.5, 0.0], [e, 0.25]], 4, { facet: true, a0: Math.PI / 4 });
  }
  // sorin: the bronze spire with nine rings
  const top = 1.2 + 5 * storey + 0.2;
  const sp = k.g('iron');
  sp.lathe(vec(0, top, 0), [[0.32, 0], [0.32, 0.8], [0.12, 0.9]], 10);
  for (let r = 0; r < 9; r++) sp.lathe(vec(0, top + 1.0 + r * 0.62, 0), [[0.08, 0], [0.42, 0.08], [0.42, 0.16], [0.08, 0.24]], 10);
  sp.lathe(vec(0, top, 0), [[0.08, 0.9], [0.08, 7.2], [0.22, 7.5], [0.0, 8.1]], 8);
  const group = new THREE.Group();
  group.name = 'pagoda';
  k.build(group);
  group.traverse((o) => { if (o.isMesh) o.userData.bake = { skip: true }; });
  return group;
}

// Scanned stones: the dry garden's groups, revetment stones along the pond, the stream's cobbles, half-buried
// rocks on the moss mounds, stepping stones and shoe-stones, and the stones of the tsukubai.
// Every placement is merged into one mesh per scan, so the garden's rocks and stepping stones are seven draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patch } from '../core/shared.js';
import { LAYER_NOREFL } from '../core/pipeline.js';
import { loadModel, loadGLB, meshesOf } from '../core/assets.js';
import { heightAt, pondD, pavedD, KARE_ROCKS, PATHS, STREAM } from './site.js';
import { rng } from '../lib/math.js';

const SCANS = {
  namaqualand_boulder_02: { tint: 0x9a9a96, rough: 0.9 },
  namaqualand_boulder_05: { tint: 0x9c9a95, rough: 0.9 },
  rock_07: { tint: 0xb4b0a8, rough: 0.85 },
  rock_09: { tint: 0xaaa8a2, rough: 0.85 },
  rock_moss_set_01: { tint: 0xffffff, rough: 1 },
  rock_moss_set_02: { tint: 0xffffff, rough: 1 },
  flagstone: { tint: 0xd0ccc4, rough: 0.9, glb: true },
};

// each part re-centred on its footprint, its base at y = 0, with its own size
function catalogue(models) {
  const cat = {};
  const add = (id, scan, part) => {
    const g = models[scan].parts[part].clone();
    g.computeBoundingBox();
    const b = g.boundingBox;
    g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    g.computeBoundingBox();
    const s = g.boundingBox.getSize(new THREE.Vector3());
    cat[id] = { scan, g, w: Math.max(s.x, s.z), h: s.y };
  };
  add('b2', 'namaqualand_boulder_02', 0);
  add('b5', 'namaqualand_boulder_05', 0);
  add('r7', 'rock_07', 0);
  add('r9', 'rock_09', 0);
  for (let i = 0; i < 6; i++) add('m1_' + i, 'rock_moss_set_01', i);
  for (let i = 0; i < 7; i++) add('m2_' + i, 'rock_moss_set_02', i);
  add('fs', 'flagstone', 0);
  return cat;
}

export async function createRocks() {
  const names = Object.keys(SCANS);
  const glb = async (n) => {
    const [p] = meshesOf(await loadGLB(n));
    return { parts: [p.geometry], map: p.maps.map, normalMap: p.maps.normalMap };
  };
  const models = Object.fromEntries(await Promise.all(names.map(async (n) => [n, SCANS[n].glb ? await glb(n) : await loadModel(n)])));
  const cat = catalogue(models);
  const R = rng(4711);
  const placed = []; // { id, x, z, size, yaw, sink, flat, y }
  const put = (id, x, z, size, yaw, sink, extra = {}) => placed.push({ id, x, z, size, yaw, sink, ...extra });

  for (const [x, z, id, size, yaw, sink] of KARE_ROCKS) put(id, x, z, size, yaw, sink);

  // revetment: walk the shoreline, set a stone every metre or so, larger ones at the points
  const mossy = Array.from({ length: 13 }, (_, i) => (i < 6 ? 'm1_' + i : 'm2_' + (i - 6)));
  {
    const pts = [];
    for (let a = 0; a < 720; a++) {
      const t = (a / 720) * Math.PI * 2;
      // march out from the pond's middle to its edge
      const cx = -1.5, cz = 7.8;
      let r = 0.5;
      while (r < 16 && pondD(cx + Math.cos(t) * r, cz + Math.sin(t) * r * 0.7) < 0) r += 0.05;
      pts.push([cx + Math.cos(t) * r, cz + Math.sin(t) * r * 0.7]);
    }
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc < 0.95 + R() * 0.7) continue;
      acc = 0;
      const [x, z] = pts[i];
      // leave the stream mouth open and a beach of pebbles on the north shore near the engawa
      if (Math.hypot(x + 3.3, z - 4.0) < 1.3) continue;
      if (x > 0.5 && x < 4.5 && z < 6.4) continue;
      const big = R() < 0.25;
      put(R.pick(mossy), x, z, big ? R.range(1.1, 1.6) : R.range(0.55, 0.95), R() * 6.283, big ? 0.35 : 0.45);
    }
  }
  // the stream: cobbles on alternate banks, a taller stone where it falls into the pond
  for (let i = 0; i < STREAM.length - 1; i++) {
    const [ax, az] = STREAM[i], [bx, bz] = STREAM[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    for (let t = 0.2; t < len; t += R.range(0.55, 0.9)) {
      const f = t / len, x = ax + (bx - ax) * f, z = az + (bz - az) * f;
      // under the bridge and the house the stream is a cut channel, no stones
      if (z > 0.2 && z < 2.0) continue;
      const side = R() < 0.5 ? -1 : 1;
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      put(R.pick(['r7', 'r9', 'b5']), x + nx * side * R.range(0.5, 0.7), z + nz * side * R.range(0.5, 0.7), R.range(0.3, 0.55), R() * 6.283, 0.3);
    }
  }
  put('m2_5', -4.15, 4.05, 1.25, 0.9, 0.2);
  put('m1_3', -2.4, 4.4, 0.9, 2.4, 0.3);
  // on the mounds
  put('m1_3', -13.4, 10.3, 1.7, 0.4, 0.3);
  put('m2_5', -15.7, 12.4, 1.2, 2.2, 0.35);
  put('m2_3', -9.4, 13.4, 1.35, 4.0, 0.3);
  put('m1_1', 3.9, 12.9, 1.5, 1.2, 0.3);
  put('m2_6', 5.8, 13.8, 1.0, 5.1, 0.3);
  put('m1_4', -24.0, 12.5, 1.3, 0.2, 0.35);
  put('m2_1', 20.5, 8.6, 1.1, 1.0, 0.3);
  // stepping stones along the paths: flat tops, a hand's width apart, stride ~62 cm
  for (const p of PATHS) {
    if (p.kind !== 'tobi') continue;
    let carry = 0;
    for (let i = 0; i < p.pts.length - 1; i++) {
      const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      for (let t = carry; t < len; t += 0.62) {
        const f = t / len;
        const nx = -(bz - az) / len, nz = (bx - ax) / len, o = (Math.round(t / 0.62) % 2 ? 1 : -1) * 0.06;
        const sx = ax + (bx - ax) * f + nx * o, sz = az + (bz - az) * f + nz * o;
        // natural granite, flat-topped, its face two fingers above the moss; none set on the paved walk
        if (pavedD(sx, sz) > 0.3) put(R() < 0.5 ? 'b2' : 'b5', sx, sz, R.range(0.5, 0.62), R() * 6.283, 0, { flat: 0.15, lift: 0.05, high: true, stretch: R.range(0.85, 1.1) });
        carry = t + 0.62 - len;
      }
    }
  }
  // shoe-stones at the engawa steps
  put('b2', 3.0, 2.45, 1.15, 0.05, 0, { flat: 0.24, lift: 0.26 });
  put('b2', 11.0, -1.15, 1.05, 3.2, 0, { flat: 0.22, lift: 0.24 });
  put('b2', -10.2, 2.55, 1.0, 1.55, 0, { flat: 0.22, lift: 0.24 });
  // tsukubai in the courtyard: the basin stands among a front stone, a lantern stone and a pail stone
  put('fs', -3.25, -3.3, 0.62, 0.3, 0, { lift: 0.08 });
  put('r7', -2.0, -4.1, 0.55, 1.0, 0.1);
  put('r9', -3.95, -4.5, 0.5, 2.0, 0.1);

  // build: one merged geometry per scan
  const buckets = {};
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const r of placed) {
    const c = cat[r.id];
    const s = r.size / c.w;
    // seat on the lowest ground under the stone's footprint; a stepping stone on the highest, so its face stands clear
    // of the soil all round on uneven ground
    const pick = r.high ? Math.max : Math.min;
    let y = r.high ? -1e9 : 1e9;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      y = pick(y, heightAt(r.x + Math.cos(a) * r.size * 0.35, r.z + Math.sin(a) * r.size * 0.35));
    }
    y = pick(y, heightAt(r.x, r.z));
    const hy = r.flat ? r.flat / c.h : s;
    y += (r.lift || 0) - (r.flat ? r.flat : c.h * s) * (r.lift !== undefined ? 1 : r.sink);
    q.setFromAxisAngle(up, r.yaw);
    m.compose(ps.set(r.x, y, r.z), q, sc.set(s * (r.stretch || 1), hy, s / (r.stretch || 1)));
    const g = c.g.clone().applyMatrix4(m);
    (buckets[c.scan] ||= []).push(g);
    r.y = y;
    r.top = y + c.h * hy;
  }
  const group = new THREE.Group();
  group.name = 'rocks';
  for (const [scan, geos] of Object.entries(buckets)) {
    const md = models[scan];
    const g = mergeGeometries(geos, false);
    g.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({ map: md.map, normalMap: md.normalMap, color: SCANS[scan].tint, roughness: SCANS[scan].rough });
    patch(mat, { key: 'rock-' + scan, snow: 0.9 });
    const mesh = new THREE.Mesh(g, mat);
    // flagstones lie flush with the ground: no shadow to speak of, nothing the pond would show
    const flush = scan === 'flagstone';
    mesh.castShadow = !flush;
    mesh.receiveShadow = true;
    if (flush) mesh.layers.set(LAYER_NOREFL);
    mesh.name = 'rock-' + scan;
    group.add(mesh);
  }
  group.userData.placed = placed;
  return group;
}

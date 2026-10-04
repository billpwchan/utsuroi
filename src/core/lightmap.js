// Baked light for the house. The procedural house gets a second UV set (uv1) laid out the same way on every load:
// each near-planar patch of connected triangles becomes a chart, flattened onto its own plane at one texel density
// and shelf-packed into a shared atlas. Blender bakes into that atlas offline (scripts/lightmap/); the page decodes
// the maps and uses them in place of the visibility volume on those surfaces.
import * as THREE from 'three';

export const LM_SKIP = new Set(['tile', 'tileShadow', 'tileRidge', 'glass', 'dark', 'ember', 'lampPaper']);
export const LM_W = 4096, LM_H = 4096;
const GUTTER = 2;
const COS_CHART = Math.cos((40 * Math.PI) / 180);

// receivers: the house's kit-built meshes, in a fixed order
export function lightmapMeshes(root) {
  const out = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || LM_SKIP.has(o.name) || !o.geometry.attributes.color || !o.geometry.index) return;
    out.push(o);
  });
  return out;
}

// split a mesh's triangles into charts and give every chart its own vertices
function charts(mesh) {
  const g = mesh.geometry;
  const pos = g.attributes.position, idx = g.index.array;
  const T = idx.length / 3, Nv = pos.count;
  const P = new Float32Array(Nv * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < Nv; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
  }
  const FN = new Float32Array(T * 3), FA = new Float32Array(T);
  for (let t = 0; t < T; t++) {
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz);
    FA[t] = l / 2;
    FN[t * 3] = l ? nx / l : 0; FN[t * 3 + 1] = l ? ny / l : 1; FN[t * 3 + 2] = l ? nz / l : 0;
  }
  // vertex -> triangles
  const cnt = new Uint32Array(Nv + 1);
  for (let k = 0; k < idx.length; k++) cnt[idx[k] + 1]++;
  for (let i = 0; i < Nv; i++) cnt[i + 1] += cnt[i];
  const vt = new Uint32Array(idx.length), fill = cnt.slice(0, Nv);
  for (let k = 0; k < idx.length; k++) vt[fill[idx[k]]++] = (k / 3) | 0;

  const chartOf = new Int32Array(T).fill(-1);
  const list = [];
  const stack = [];
  for (let s = 0; s < T; s++) {
    if (chartOf[s] >= 0) continue;
    const id = list.length;
    const tris = [];
    chartOf[s] = id;
    stack.push(s);
    const sx = FN[s * 3], sy = FN[s * 3 + 1], sz = FN[s * 3 + 2];
    while (stack.length) {
      const t = stack.pop();
      tris.push(t);
      for (let k = 0; k < 3; k++) {
        const vi = idx[t * 3 + k];
        for (let j = cnt[vi]; j < cnt[vi + 1]; j++) {
          const u = vt[j];
          if (chartOf[u] >= 0) continue;
          if (FN[u * 3] * sx + FN[u * 3 + 1] * sy + FN[u * 3 + 2] * sz < COS_CHART) continue;
          chartOf[u] = id;
          stack.push(u);
        }
      }
    }
    tris.sort((a, b) => a - b);
    // plane: area-weighted normal; in-plane axes from the edge direction that gives the smallest bounding rectangle
    let nx = 0, ny = 0, nz = 0;
    for (const t of tris) { nx += FN[t * 3] * FA[t]; ny += FN[t * 3 + 1] * FA[t]; nz += FN[t * 3 + 2] * FA[t]; }
    const n = new THREE.Vector3(nx, ny, nz);
    if (n.lengthSq() < 1e-12) n.set(FN[s * 3], FN[s * 3 + 1], FN[s * 3 + 2]);
    n.normalize();
    const verts = [];
    const seen = new Map();
    for (const t of tris) for (let k = 0; k < 3; k++) { const vi = idx[t * 3 + k]; if (!seen.has(vi)) { seen.set(vi, verts.length); verts.push(vi); } }
    let best = null;
    const tA = new THREE.Vector3(), bA = new THREE.Vector3();
    const tries = Math.min(tris.length, 8);
    for (let q = 0; q < tries; q++) {
      const t = tris[q];
      for (let k = 0; k < 3; k++) {
        const a = idx[t * 3 + k] * 3, b = idx[t * 3 + ((k + 1) % 3)] * 3;
        tA.set(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]);
        tA.addScaledVector(n, -tA.dot(n));
        if (tA.lengthSq() < 1e-12) continue;
        tA.normalize();
        bA.crossVectors(n, tA);
        let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
        for (const vi of verts) {
          const x = P[vi * 3], y = P[vi * 3 + 1], z = P[vi * 3 + 2];
          const u = x * tA.x + y * tA.y + z * tA.z, w = x * bA.x + y * bA.y + z * bA.z;
          if (u < u0) u0 = u; if (u > u1) u1 = u; if (w < v0) v0 = w; if (w > v1) v1 = w;
        }
        const area = (u1 - u0) * (v1 - v0);
        if (!best || area < best.area - 1e-9) best = { area, t: tA.clone(), b: bA.clone(), u0, u1, v0, v1 };
      }
    }
    if (!best) {
      const t0 = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(n).normalize() : new THREE.Vector3(1, 0, 0).cross(n).normalize();
      best = { area: 0, t: t0, b: new THREE.Vector3().crossVectors(n, t0), u0: 0, u1: 0, v0: 0, v1: 0 };
    }
    list.push({ tris, verts, ...best });
  }
  return { P, list, chartOf };
}

// lay out uv1 for all receivers at the largest density that fits the atlas
export function layoutLightmap(meshes) {
  const all = [];
  const per = meshes.map((m) => {
    const c = charts(m);
    for (const ch of c.list) all.push(ch);
    return c;
  });
  const dims = (d) => all.map((ch) => [Math.max(2, Math.ceil((ch.u1 - ch.u0) * d)), Math.max(2, Math.ceil((ch.v1 - ch.v0) * d))]);
  const pack = (d) => {
    const ds = dims(d);
    // tallest first; ties keep their order so the layout is the same on every load
    const order = ds.map((_, i) => i).sort((a, b) => ds[b][1] - ds[a][1] || a - b);
    const at = new Array(all.length);
    let x = 0, y = 0, rowH = 0;
    for (const i of order) {
      const w = ds[i][0] + GUTTER * 2, h = ds[i][1] + GUTTER * 2;
      if (w > LM_W) return null;
      if (x + w > LM_W) { y += rowH; x = 0; rowH = 0; }
      if (y + h > LM_H) return null;
      at[i] = [x + GUTTER, y + GUTTER, ds[i][0], ds[i][1]];
      x += w; rowH = Math.max(rowH, h);
    }
    return { at, used: y + rowH };
  };
  let d = 64, res = null;
  while (!(res = pack(d))) d *= 0.94;
  // rebuild each mesh with per-chart vertices and the atlas coordinates
  let ci = 0;
  meshes.forEach((m, mi) => {
    const { list } = per[mi];
    const g = m.geometry;
    const idx = g.index.array;
    const names = Object.keys(g.attributes);
    const remap = [];
    const src = [];
    const uv1 = [];
    const newIdx = new Uint32Array(idx.length);
    const chartIds = [];
    for (const ch of list) {
      const cid = ci;
      const [ax, ay, w, h] = res.at[ci++];
      const local = new Map();
      const du = ch.u1 - ch.u0 || 1, dv = ch.v1 - ch.v0 || 1;
      for (const vi of ch.verts) {
        local.set(vi, src.length);
        src.push(vi);
        chartIds.push(cid);
        const pp = per[mi].P;
        const x = pp[vi * 3], y = pp[vi * 3 + 1], z = pp[vi * 3 + 2];
        const u = (x * ch.t.x + y * ch.t.y + z * ch.t.z - ch.u0) / du, v = (x * ch.b.x + y * ch.b.y + z * ch.b.z - ch.v0) / dv;
        uv1.push((ax + u * w) / LM_W, (ay + v * h) / LM_H);
      }
      for (const t of ch.tris) for (let k = 0; k < 3; k++) newIdx[t * 3 + k] = local.get(idx[t * 3 + k]);
      remap.push(local);
    }
    const out = new THREE.BufferGeometry();
    for (const name of names) {
      const a = g.attributes[name], s = a.itemSize;
      const arr = new a.array.constructor(src.length * s);
      for (let i = 0; i < src.length; i++) for (let k = 0; k < s; k++) arr[i * s + k] = a.array[src[i] * s + k];
      out.setAttribute(name, new THREE.BufferAttribute(arr, s, a.normalized));
    }
    out.setAttribute('uv1', new THREE.Float32BufferAttribute(uv1, 2));
    out.setIndex(new THREE.BufferAttribute(src.length > 65535 ? newIdx : Uint16Array.from(newIdx), 1));
    out.boundingBox = g.boundingBox; out.boundingSphere = g.boundingSphere;
    g.dispose();
    m.geometry = out;
    // which chart each vertex belongs to: the bake uses it to keep the denoiser from blurring across charts
    m.userData.lmChart = Uint32Array.from(chartIds);
  });
  return { W: LM_W, H: LM_H, density: d, charts: all.length, used: res.used, signature: signature(meshes) };
}

// a fingerprint of the receivers, so a bake made from another build of the house is refused rather than misread
export function signature(meshes) {
  let h = 2166136261 >>> 0;
  const mix = (x) => { h ^= x; h = Math.imul(h, 16777619) >>> 0; };
  for (const m of meshes) {
    const p = m.geometry.attributes.position.array;
    mix(p.length);
    for (let i = 0; i < p.length; i += 97) mix(Math.round(p[i] * 1000) | 0);
    for (const c of m.name) mix(c.charCodeAt(0));
  }
  return h.toString(16);
}

// swap each receiver onto a lightmapped twin of its material and load the bake; a bake made from another build of
// the house is refused, and those surfaces keep the visibility volume
export async function applyLightmap(meshes, layout, { U, tex, lightmapVariant }) {
  let info;
  try {
    info = await (await fetch('./assets/lm/lm.json')).json();
  } catch (e) {
    console.warn('[ut] no lightmap');
    return null;
  }
  if (info.signature !== layout.signature) {
    console.warn('[ut] lightmap is from another build of the house', info.signature, layout.signature);
    return null;
  }
  const load = (name) => {
    const t = tex(`./assets/lm/${name}.ktx2`, false, false, false, 2);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  };
  const maps = { sky: load('sky'), lamp: load('lamp'), sun: info.sun.map(([h]) => load(`sun_${h}`)) };
  U.tLmSky.value = maps.sky;
  U.tLmLamp.value = maps.lamp;
  U.uLmR.value.set(info.range.sky[0], info.range.sky[1], info.range.lamp[0], info.range.lamp[1]);
  let probes = null;
  if (info.probes) {
    const P = info.probes, [nx, ny, nz] = P.n, nb = P.bases.length, len = nx * ny * nz * nb * 4;
    // the file holds the red, green and blue blocks in turn, each its bases in turn: one texture, three times as deep
    const buf = await (await fetch('./assets/lm/probes.bin')).arrayBuffer();
    const t = new THREE.Data3DTexture(new Uint8Array(buf, 0, len * 3), nx, ny, nz * nb * 3);
    t.format = THREE.RGBAFormat;
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
    t.unpackAlignment = 1;
    t.needsUpdate = true;
    U.tPrb.value = t;
    U.uPrbMin.value.set(...P.min);
    U.uPrbStep.value = P.step;
    U.uPrbN.value.set(nx, ny, nz, nb);
    U.uPrbOn.value = 1;
    probes = { hi: P.hi, slab: new Map(P.bases.map((b, i) => [b, i])) };
  }
  const twins = new Map();
  for (const m of meshes) {
    // washi is one sheet lit from both faces; it keeps its own translucent lighting
    if (m.name === 'paper') continue;
    if (!twins.has(m.material)) twins.set(m.material, lightmapVariant(m.material));
    const t = twins.get(m.material);
    if (t) m.material = t;
  }
  return { info, maps, probes };
}

// pick the two baked sun hours either side of now
export function updateLightmap(lm, U, hours, sunCol, keyIsSun) {
  if (!lm) return;
  const s = lm.info.sun;
  let i = 0;
  while (i < s.length - 2 && hours > s[i + 1][0]) i++;
  const [ha, ra] = s[i], [hb, rb] = s[i + 1];
  const t = Math.min(1, Math.max(0, (hours - ha) / (hb - ha)));
  U.tLmSunA.value = lm.maps.sun[i];
  U.tLmSunB.value = lm.maps.sun[i + 1];
  U.uLmSunT.value = t;
  U.uLmRS.value.set(ra[0], ra[1], rb[0], rb[1]);
  if (lm.probes) {
    const { hi, slab } = lm.probes, sa = slab.get(`sun_${ha}`), sb = slab.get(`sun_${hb}`);
    U.uPrbSun.value.set(sa, sb);
    U.uPrbHi.value.set(hi[0], hi[1], hi[sa], hi[sb]);
  }
  if (keyIsSun) U.uLmSun.value.copy(sunCol);
  else U.uLmSun.value.set(0, 0, 0);
}

// Dev only: hand the house and everything that shades it to the offline bake (scripts/lightmap/bake.py).
// Receivers carry their lightmap UVs as their only UV set; occluders are flattened to world space with a plain
// albedo. A JSON sidecar lists the receivers' albedo, the lamps and the sun's path.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { coverAt } from '../garden/site.js';
import { sunDirAt } from '../env/environment.js';
import { LAYER_NOREFL, LAYER_LO } from '../core/pipeline.js';

const lin = (c) => [c.r, c.g, c.b];

function mapMean(map) {
  const img = map && map.image;
  if (!img || !(img instanceof HTMLCanvasElement)) return null;
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, 32, 32);
  const d = g.getImageData(0, 0, 32, 32).data;
  const s = [0, 0, 0];
  const toLin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) s[k] += toLin(d[i + k]);
  return s.map((v) => v / 1024);
}

// diffuse albedo the bake bounces light with: the material colour times what its map averages to (the scanned
// maps are normalised to their mean by the materials' own shaders)
function albedo(mat, name = '') {
  if (!mat || !mat.color) return [0.3, 0.3, 0.3];
  const c = lin(mat.color);
  const m = mapMean(mat.map);
  const k = m || (mat.map ? (/stone|slate|rock|scan/.test(name) ? [0.45, 0.45, 0.45] : [1, 1, 1]) : [1, 1, 1]);
  const metal = mat.metalness || 0;
  return c.map((v, i) => Math.min(0.9, v * k[i] * (1 - metal * 0.7)));
}

function flatten(src, matrix, withUv) {
  const g = src.index ? src : src;
  const out = new THREE.BufferGeometry();
  const p = g.attributes.position.clone().applyMatrix4(matrix);
  out.setAttribute('position', p);
  if (g.attributes.normal) out.setAttribute('normal', g.attributes.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(matrix)));
  if (withUv) out.setAttribute('uv', g.attributes.uv1.clone());
  if (g.index) out.setIndex(g.index.clone());
  return out;
}

function merge(geos) {
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), I = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of geos) {
    const c = g.attributes.position.count;
    P.set(g.attributes.position.array, ov * 3);
    if (g.attributes.normal) N.set(g.attributes.normal.array, ov * 3);
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) I[oi++] = a[i] + ov; }
    else for (let i = 0; i < c; i++) I[oi++] = ov + i;
    ov += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setIndex(new THREE.BufferAttribute(I, 1));
  return out;
}

export async function exportBake({ house, garden, lmMeshes, layout, lamps }) {
  // doors stand open, the way they are seen from inside
  for (const d of house.doors) d.obj.position.copy(d.base).addScaledVector(d.dir, d.dist);
  house.group.updateMatrixWorld(true);
  garden.group.updateMatrixWorld(true);

  const out = new THREE.Scene();
  const meta = { signature: layout.signature, W: layout.W, H: layout.H, receivers: [], occluders: [], lamps, suns: [] };
  const recv = new Set(lmMeshes);
  const mat = (name, a, extra = {}) => { const m = new THREE.MeshStandardMaterial({ name, roughness: 1, ...extra }); m.color.setRGB(a[0], a[1], a[2]); return m; };

  lmMeshes.forEach((m, i) => {
    const name = `R${String(i).padStart(3, '0')}_${m.name}`;
    const a = albedo(m.material, m.name);
    const geo = flatten(m.geometry, m.matrixWorld, true);
    const ids = m.userData.lmChart, col = new Float32Array(ids.length * 3);
    for (let k = 0; k < ids.length; k++) {
      let h = Math.imul(ids[k] + 1, 2654435761) >>> 0;
      for (let j = 0; j < 3; j++) { col[k * 3 + j] = 0.1 + 0.8 * ((h & 255) / 255); h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, mat(name, a));
    mesh.name = name;
    out.add(mesh);
    meta.receivers.push({ name, material: m.name, albedo: a, paper: m.name === 'paper' || m.name === 'fusuma' ? (m.name === 'paper' ? 0.55 : 0.0) : 0 });
  });

  // occluders: one merged mesh per kind of surface
  const groups = new Map();
  const add = (key, a, geo, opts = {}) => {
    if (!groups.has(key)) groups.set(key, { a, geos: [], ...opts });
    groups.get(key).geos.push(geo);
  };
  const near = (m) => { const s = new THREE.Sphere(); if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere(); s.copy(m.geometry.boundingSphere).applyMatrix4(m.matrixWorld); return s.center.distanceTo(new THREE.Vector3(-3, 0, -2)) - s.radius < 34; };
  house.group.traverse((m) => {
    if (!m.isMesh || recv.has(m) || m.name === 'tile' || m.name === 'glass') return;
    if (m.name === 'tileShadow') return add('roof', [0.06, 0.06, 0.065], flatten(m.geometry, m.matrixWorld));
    add('h_' + m.name, albedo(m.material, m.name), flatten(m.geometry, m.matrixWorld));
  });
  const mat4 = new THREE.Matrix4();
  const matIds = new Map();
  garden.group.traverse((m) => {
    if (!m.isMesh || m.name === 'far-land' || m.name === 'water' || m.name === 'tile') return;
    const mask = m.layers.mask;
    if (!(mask & (1 | (1 << LAYER_LO)))) return; // full-detail wood (NOREFL), koi, shadow-only casters
    if (mask === (1 << LAYER_NOREFL)) return;
    if (m.name === 'ground') {
      const g = flatten(m.geometry, m.matrixWorld);
      const p = g.attributes.position, col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const c = coverAt(p.getX(i), p.getZ(i));
        const w = { moss: c.moss * (1 - c.gravel) * (1 - c.path) * (1 - c.pebble), gravel: c.gravel, pebble: c.pebble * (1 - c.gravel), earth: c.earth * (1 - c.gravel), path: c.path };
        const base = [0.16, 0.13, 0.09];
        const mix = [base[0], base[1], base[2]];
        const blend = (k, rgb) => { for (let j = 0; j < 3; j++) mix[j] += (rgb[j] - mix[j]) * Math.min(1, k); };
        blend(w.earth, [0.17, 0.13, 0.09]);
        blend(w.moss, [0.055, 0.085, 0.03]);
        blend(w.pebble, [0.1, 0.1, 0.1]);
        blend(w.path, [0.22, 0.21, 0.2]);
        blend(w.gravel, [0.5, 0.49, 0.46]);
        col.set(mix, i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mesh = new THREE.Mesh(g, mat('G_ground', [1, 1, 1], { vertexColors: true }));
      mesh.name = 'G_ground';
      out.add(mesh);
      return;
    }
    const leaf = m.material && m.material.alphaTest > 0;
    const a = leaf ? [0.06, 0.09, 0.035] : albedo(m.material, m.name);
    if (!matIds.has(m.material)) matIds.set(m.material, matIds.size);
    const key = (leaf ? 'leaf_' : 'g_') + (m.name || 'm') + matIds.get(m.material);
    if (m.isInstancedMesh) {
      for (let i = 0; i < m.count; i++) {
        m.getMatrixAt(i, mat4);
        mat4.premultiply(m.matrixWorld);
        const s = new THREE.Sphere();
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        s.copy(m.geometry.boundingSphere).applyMatrix4(mat4);
        if (s.center.distanceTo(new THREE.Vector3(-3, 0, -2)) - s.radius > 34) continue;
        add(key, a, flatten(m.geometry, mat4), { leaf });
      }
    } else if (near(m)) add(key, a, flatten(m.geometry, m.matrixWorld), { leaf });
  });
  for (const [key, g] of groups) {
    const name = 'O_' + key.replace(/[^A-Za-z0-9_-]/g, '');
    const mesh = new THREE.Mesh(merge(g.geos), mat(name, g.a));
    mesh.name = name;
    out.add(mesh);
    meta.occluders.push({ name, albedo: g.a, leaf: !!g.leaf, tris: mesh.geometry.index.count / 3 });
  }
  for (let h = 4.5; h <= 20.01; h += 0.25) meta.suns.push([h, ...sunDirAt(h).toArray()]);

  const glb = await new GLTFExporter().parseAsync(out, { binary: true });
  return { glb, meta };
}

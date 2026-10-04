// Converts downloaded models in .cache/src-assets (Sketchfab via scripts/sketchfab.sh, Poly Haven) into
// web glbs in public/assets/glb: node transforms baked, grounded and centred, scaled to metres, cropped,
// simplified with meshoptimizer, textures as KTX2 (UASTC) at up to cfg.tex, geometry meshopt-compressed.
// usage: node scripts/models.mjs [name ...]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import { flatten, join, weld, simplify, meshopt, prune, dedup, clearNodeTransform, transformMesh, getBounds, normals, cloneDocument, compactPrimitive } from '@gltf-transform/functions';
import { ktx2 } from './ktx.mjs';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join as pjoin } from 'node:path';

const SRC = new URL('../.cache/src-assets/', import.meta.url).pathname;
const OUT = new URL('../public/assets/glb/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

// height: metres from base to top; tris: target after simplification; tex: max texture edge;
// sat/gain: colour-map grading; crop(a, b, c, size): keep a triangle given its corners in metres
export const MODELS = {
  // the roji's lantern, beside the path: a kasuga-dōrō from Miyajima, raw photogrammetry, its sand patch cut away
  toro: {
    src: 'sf/toro_miyajima/scene.gltf', scale: 1, tris: 120000, tex: 4096,
    crop: (a, b, c) => Math.max(a[1], b[1], c[1]) > 0.045 || Math.max(...[a, b, c].map((p) => Math.max(Math.abs(p[0]), Math.abs(p[2])))) < 0.5,
  },
  // a mossy kasuga from a stroll garden, ivy at its foot: beside the basin
  kasuga: { src: 'sf/kasuga_moss/scene.gltf', height: 1.75, tris: 17856, tex: 2048, ntex: 1024 },
  // a yukimi-dōrō on its own flat rock, for the water's edge
  yukimi: { src: 'sf/yukimi_hd/scene.gltf', height: 1.05, tris: 90000, tex: 2048 },
  // a square lantern with a mossed roof on its bed of gravel: the far shore
  kaku: { src: 'sf/lantern_sq/scene.gltf', scale: 1, tris: 60000, tex: 2048, ntex: 1024 },
  // an iPhone scan of a basin among its stones; the scan's ragged rim is cut away, stones are kept whole wherever
  // they reach. Two of them: the roji's (seen from the path) and the one at the head of the stream
  tsukubai: {
    src: 'sf/tsukubai_scan/scene.gltf', scale: 0.28, tris: 90000, tex: 4096, faceted: true, centreAbove: 0.42,
    crop: (a, b, c) => {
      const x = (a[0] + b[0] + c[0]) / 3, z = (a[2] + b[2] + c[2]) / 3, r = Math.hypot(x, z);
      return r < 0.36 || (r < 0.6 && Math.max(a[1], b[1], c[1]) < 0.075);
    },
  },
  // a natural flagstone, mossy at the edges: stepping stones and the basin's front stone
  flagstone: { src: 'sf/flag_nordic_hd/scene.gltf', scale: 1, tris: 14000, tex: 2048, ntex: 1024 },
  // a Cornish granite monolith (Men Scryfa; .cache/blender/stone_lay.py cut it from its ground and laid it on
  // its uninscribed face): the stream's bridge, walked over, so it keeps the whole scan
  bridge: { src: 'sf/menscryfa/stone_f.glb', fitLong: 2.1, tris: 242893, tex: 4096, lo: 0.1 },
  tetsubin: { src: 'sf/tetsubin_hd/scene.gltf', height: 0.24, tris: 2608, tex: 2048, ntex: 1024, rtex: 512 },
  zabuton: { src: 'sf/zabuton_hd/scene.gltf', fit: [0.56, 0.1, 0.6], tris: 30000, tex: 1024 },
  // a raku-like tea bowl, 12 cm across
  chawan: { src: 'sf/chawan/scene.gltf', height: 0.075, tris: 40000, tex: 1024, codec: 'uastc' },
  // one geta, scanned standing on its side: laid flat, 23 cm long
  geta: { src: 'sf/geta/scene.gltf', rotX: -90, fitLong: 0.235, tris: 30000, tex: 2048 },
  // a common carp scanned whole (ffish.asia, CC0): the koi's body, its own scales and eye as a detail map under the
  // varieties' colours; head turned to +z, tail tip at z -0.66 and nose at 0.5 like the swimming shader expects
  // a Japanese maple modelled twig by twig (CHEI – UC San Diego, CC-BY): its wood, cut from 7.5M to 140K
  // triangles in Blender (.cache/blender/tree_split.py), under the world's own bark; its leaves become anchors
  // for the scanned maple atlas
  maple_tree: { src: 'sf/maple_hd/bark.glb', height: 4.8, centreBelow: 0.25, stripTex: true, lo: 0.15, cards: { src: 'sf/maple_hd/leaves.bin', cell: 0.3 } },
  // a second momiji, vase-shaped and finer in the twig (stickbone, CC-BY), cut from 1.67M to 140K
  maple_tree_b: { src: 'sf/tree_d7/bark.glb', height: 4.6, centreBelow: 0.25, stripTex: true, lo: 0.15, cards: { src: 'sf/tree_d7/leaves.bin', cell: 0.3 } },
  // a leaning black pine trained in tiers (Sketchfab f0cb4705, CC-BY), its whole 133K-triangle wood; its needle
  // cards become anchors for the scanned pine atlas
  pine_tree: { src: 'sf/pine_a/bark.glb', height: 5.5, centreBelow: 0.25, stripTex: true, lo: 0.15, cards: { src: 'sf/pine_a/leaves.bin', cell: 0.2 } },
  // the trunk of an old cherry, scanned whole (matousekfoto, CC-BY; 148K triangles, 8K maps): the sacred weeping cherry
  // grows on from its broken limbs; the square of ground it was scanned on is cut away
  sacred_trunk: {
    src: 'sf/cherry_old/scene.gltf', height: 5.2, tex: 4096, centreBelow: 0.25,
    crop: (a, b, c) => Math.max(a[1], b[1], c[1]) > 0.12 || Math.max(...[a, b, c].map((p) => Math.hypot(p[0], p[2]))) < 0.42,
    tips: { cell: 0.06, min: 1.5, merge: 0.35, maxR: 0.12 }, shadeAbove: [3.4, 4.6, 0.55], lo: 0.12,
  },
  // a someiyoshino-like cherry, its wood modelled branch by branch (Nice2meetU2, CC-BY); blossom anchors from its own
  sakura_tree: { src: 'sf/cherry_c/bark.glb', height: 6.5, centreBelow: 0.25, stripTex: true, lo: 0.2, cards: { src: 'sf/cherry_c/leaves.bin', cell: 0.32 } },
  koi: { src: 'sf/carp/carp_40k.glb', rotY: 90, spine: [-0.66, 0.5], tex: 2048, codec: 'etc1s', detail: true, lo: 0.08 },
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;

const count = (doc) => {
  let n = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) n += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
  return Math.round(n);
};

async function grade(doc, sat, gain) {
  for (const mat of doc.getRoot().listMaterials()) {
    const t = mat.getBaseColorTexture();
    if (!t || t.__graded) continue;
    const png = await sharp(Buffer.from(t.getImage())).modulate({ saturation: sat, brightness: gain }).png().toBuffer();
    t.setImage(new Uint8Array(png)).setMimeType('image/png');
    t.__graded = true;
  }
}

function crop(doc, keep) {
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const idx = prim.getIndices();
      const src = idx ? idx.getArray() : Uint32Array.from({ length: pos.getCount() }, (_, i) => i);
      const out = [];
      const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
      for (let i = 0; i < src.length; i += 3) {
        pos.getElement(src[i], a); pos.getElement(src[i + 1], b); pos.getElement(src[i + 2], c);
        if (keep(a, b, c)) out.push(src[i], src[i + 1], src[i + 2]);
      }
      const acc = doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from(out)).setBuffer(doc.getRoot().listBuffers()[0]);
      prim.setIndices(acc);
    }
}

// every map to KTX2, never larger than its source; what a map is for decides how it is encoded and how large it
// may be (max: colour edge; normals default to the same, data maps to half)
async function compressMaps(doc, max, nmax = max, rmax = Math.max(512, max / 2), codec = 'etc1s') {
  const root = doc.getRoot();
  const kind = new Map(), alpha = new Set();
  for (const m of root.listMaterials()) {
    const set = (t, k) => t && !kind.has(t) && kind.set(t, k);
    set(m.getBaseColorTexture(), 'c');
    set(m.getEmissiveTexture(), 'c');
    set(m.getNormalTexture(), 'n');
    set(m.getMetallicRoughnessTexture(), 'r');
    set(m.getOcclusionTexture(), 'r');
    if (m.getBaseColorTexture() && m.getAlphaMode() !== 'OPAQUE') alpha.add(m.getBaseColorTexture());
  }
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  for (const t of root.listTextures()) {
    const k = kind.get(t) || 'c';
    const [w] = t.getSize() || [max];
    const size = Math.min(k === 'c' ? max : k === 'n' ? nmax : rmax, w);
    t.setImage(await ktx2(Buffer.from(t.getImage()), { kind: k, size, alpha: alpha.has(t), codec: k === 'c' ? codec : 'uastc' })).setMimeType('image/ktx2');
    if (t.getURI()) t.setURI(t.getURI().replace(/\.[a-z]+$/i, '.ktx2'));
  }
}

// the colour map replaced by its fine detail alone (scales, eye, lips): luminance over its blurred self, stored so
// that 0.5 (linear) is no change; the material lays its own colours under it
// _AUX (spine 0 tail..1 head, part 0 body / 1 fin / 2 tail) for a swimming creature. A fin is wherever the
// surface facing the other way lies within a couple of centimetres: fins are skin-thin, the body never is
function spineAux(doc, [z0, z1]) {
  const R = 0.025, cell = (x) => Math.floor(x / R);
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute('POSITION').getArray(), N = prim.getAttribute('NORMAL').getArray();
    const n = P.length / 3, grid = new Map();
    for (let i = 0; i < n; i++) {
      const k = `${cell(P[i * 3])},${cell(P[i * 3 + 1])},${cell(P[i * 3 + 2])}`;
      (grid.get(k) || grid.set(k, []).get(k)).push(i);
    }
    const aux = new Float32Array(n * 2);
    let fins = 0;
    for (let i = 0; i < n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      let thin = false;
      for (let a = -1; a <= 1 && !thin; a++) for (let b = -1; b <= 1 && !thin; b++) for (let c = -1; c <= 1 && !thin; c++) {
        for (const j of grid.get(`${cell(x) + a},${cell(y) + b},${cell(z) + c}`) || []) {
          const dx = P[j * 3] - x, dy = P[j * 3 + 1] - y, dz = P[j * 3 + 2] - z;
          if (dx * dx + dy * dy + dz * dz < R * R && N[i * 3] * N[j * 3] + N[i * 3 + 1] * N[j * 3 + 1] + N[i * 3 + 2] * N[j * 3 + 2] < -0.6) { thin = true; break; }
        }
      }
      const t = Math.min(1, Math.max(0, (z - (z0 + 0.16)) / (z1 - z0 - 0.16)));
      aux[i * 2] = t;
      aux[i * 2 + 1] = thin ? (z < z0 + 0.22 ? 2 : 1) : 0;
      if (thin) fins++;
    }
    prim.setAttribute('_AUX', doc.createAccessor().setType('VEC2').setArray(aux).setBuffer(doc.getRoot().listBuffers()[0]));
    console.log(`spine aux: ${fins} of ${n} verts are fin`);
  }
}

// a tree's leaves as card anchors for the world's own leaf atlas: the source's leaf faces (x, y, z, nx, ny, nz
// floats, from .cache/blender/tree_split.py) placed like the model, gathered cell by cell into one card each.
// Out: [x, y, z, ox, oy, oz] per card, o the outward direction the card faces before its twist
function cards(name, { src, cell }, place) {
  const raw = new Float32Array(readFileSync(pjoin(SRC, src)).buffer.slice(0));
  const n = raw.length / 6, cellOf = new Map();
  let cx = 0, cy = 0, cz = 0;
  const P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = raw[i * 6] * place.k + place.ox, y = raw[i * 6 + 1] * place.k + place.oy, z = raw[i * 6 + 2] * place.k + place.oz;
    P.set([x, y, z], i * 3);
    cx += x; cy += y; cz += z;
  }
  cx /= n; cy /= n; cz /= n;
  for (let i = 0; i < n; i++) {
    const k = `${Math.floor(P[i * 3] / cell)},${Math.floor(P[i * 3 + 1] / cell)},${Math.floor(P[i * 3 + 2] / cell)}`;
    const c = cellOf.get(k) || cellOf.set(k, [0, 0, 0, 0]).get(k);
    c[0] += P[i * 3]; c[1] += P[i * 3 + 1]; c[2] += P[i * 3 + 2]; c[3]++;
  }
  const out = [];
  for (const [x, y, z, m] of cellOf.values()) {
    const px = x / m, py = y / m, pz = z / m;
    // outward from the crown's heart, lifted: a leaf spray turns to the open sky
    let ox = px - cx, oy = (py - cy) * 0.6 + 0.8, oz = pz - cz;
    const l = Math.hypot(ox, oy, oz);
    out.push(px, py, pz, ox / l, oy / l, oz / l);
  }
  writeFileSync(pjoin(OUT, `${name}_cards.bin`), Buffer.from(new Float32Array(out).buffer));
  console.log(`${name}: ${n} leaf samples -> ${out.length / 6} cards (cell ${cell} m)`);
}

// lo: a stand-in at this share of the triangles for the passes that never see detail (mirror, shadow, sky bake). It
// keeps the full model's vertices, so it sits exactly on it; sloppy, so uv seams cannot hold it up; and it carries no
// maps, wearing the full model's material at run time
async function writeLo(name, doc, ratio) {
  const lo = cloneDocument(doc);
  for (const mesh of lo.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices(), pos = prim.getAttribute('POSITION');
    const src = Uint32Array.from(idx.getArray());
    const [out] = MeshoptSimplifier.simplifySloppy(src, Float32Array.from(pos.getArray()), 3, null, Math.floor((src.length * ratio) / 3) * 3, 1);
    idx.setArray(out);
    compactPrimitive(prim);
  }
  for (const mat of lo.getRoot().listMaterials()) mat.setBaseColorTexture(null).setNormalTexture(null).setMetallicRoughnessTexture(null);
  await lo.transform(prune({ keepAttributes: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const file = pjoin(OUT, `${name}_lo.glb`);
  await io.write(file, lo);
  console.log(`${name}_lo tris ${count(lo)}  ${(statSync(file).size / 1024).toFixed(0)} KB`);
}

// where a scanned tree's limbs end, for growing on from them: its surface in cells, walked out from the foot; a
// tip is a cell no neighbour lies further out from, its direction taken back along the walk and its radius from
// the surface around that line. Thicker ends are bumps on the trunk, not limbs, except where a stem was broken off
// (the highest cell of each stem). Out: [x, y, z, dx, dy, dz, r] per tip, furthest-reaching first
function tips(name, doc, { cell, min, merge, maxR }) {
  const P = [];
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray(), e = [0, 0, 0];
    const used = new Uint8Array(pos.getCount());
    for (const i of idx) used[i] = 1;
    for (let i = 0; i < used.length; i++) if (used[i]) { pos.getElement(i, e); P.push(e[0], e[1], e[2]); }
  }
  const cells = new Map(), key = (x, y, z) => `${x},${y},${z}`;
  for (let i = 0; i < P.length; i += 3) {
    const g = [P[i], P[i + 1], P[i + 2]].map((v) => Math.floor(v / cell));
    const k = key(...g);
    const c = cells.get(k) || cells.set(k, { g, s: [0, 0, 0], n: 0, d: -1, from: null }).get(k);
    c.s[0] += P[i]; c.s[1] += P[i + 1]; c.s[2] += P[i + 2]; c.n++;
  }
  const at = (c) => c.s.map((v) => v / c.n);
  const queue = [...cells.values()].filter((c) => c.g[1] * cell < 0.3 && Math.hypot(...at(c).filter((_, j) => j !== 1)) < 0.6);
  for (const c of queue) c.d = 0;
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const nb = cells.get(key(c.g[0] + dx, c.g[1] + dy, c.g[2] + dz));
      if (nb && nb.d < 0) { nb.d = c.d + 1; nb.from = c; queue.push(nb); }
    }
  }
  const ends = queue.filter((c) => {
    if (c.d * cell < min) return false;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const nb = cells.get(key(c.g[0] + dx, c.g[1] + dy, c.g[2] + dz));
      if (nb && nb.d > c.d) return false;
    }
    return true;
  }).sort((a, b) => b.d - a.d);
  const out = [], kept = [];
  const top = Math.max(...ends.map((c) => at(c)[1]));
  for (const c of ends) {
    const p = at(c);
    if (kept.some((t) => Math.hypot(t[0] - p[0], t[1] - p[1], t[2] - p[2]) < merge)) continue;
    let back = c;
    for (let k = 0; k < 4 && back.from; k++) back = back.from;
    const b = at(back), d = p.map((v, j) => v - b[j]), l = Math.hypot(...d) || 1;
    for (let j = 0; j < 3; j++) d[j] /= l;
    // radius: the surface around the limb's axis a little way in from the tip
    const mid = p.map((v, j) => (v + b[j]) / 2);
    let rs = 0, rn = 0;
    for (let i = 0; i < P.length; i += 3) {
      const v = [P[i] - mid[0], P[i + 1] - mid[1], P[i + 2] - mid[2]];
      const along = v[0] * d[0] + v[1] * d[1] + v[2] * d[2];
      if (Math.abs(along) > cell) continue;
      const perp = Math.hypot(v[0] - along * d[0], v[1] - along * d[1], v[2] - along * d[2]);
      if (perp < cell * 4) { rs += perp; rn++; }
    }
    const r = rn ? rs / rn : cell * 0.5;
    if (r > maxR && p[1] < top - 0.3) continue;
    kept.push(p);
    out.push(p[0], p[1], p[2], d[0], d[1], d[2], r);
  }
  writeFileSync(pjoin(OUT, `${name}_tips.bin`), Buffer.from(new Float32Array(out).buffer));
  console.log(`${name}: ${out.length / 7} limb tips`, Array.from({ length: out.length / 7 }, (_, i) => out.slice(i * 7, i * 7 + 7).map((v) => +v.toFixed(2)).join(' ')).join(' | '));
}

async function detail(doc, size) {
  for (const m of doc.getRoot().listMaterials()) {
    const t = m.getBaseColorTexture();
    if (!t) continue;
    const src = sharp(Buffer.from(t.getImage())).resize(size, size).removeAlpha().greyscale();
    const l = await src.clone().raw().toBuffer();
    const bl = await src.clone().blur(size / 170).raw().toBuffer();
    const out = Buffer.alloc(size * size);
    for (let i = 0; i < out.length; i++) {
      const lin = (v) => Math.pow(v / 255, 2.2);
      const v = Math.min(1, 0.5 * lin(l[i]) / Math.max(lin(bl[i]), 0.004));
      out[i] = Math.round(Math.pow(v, 1 / 2.2) * 255);
    }
    t.setImage(await sharp(out, { raw: { width: size, height: size, channels: 1 } }).png().toBuffer()).setMimeType('image/png');
  }
}

async function convert(name, cfg) {
  const doc = await io.read(pjoin(SRC, cfg.src));
  const root = doc.getRoot();
  const before = count(doc);
  for (const ext of root.listExtensionsUsed()) if (/unlit|specular|ior|clearcoat|sheen|transmission|volume|emissive_strength/.test(ext.extensionName)) ext.dispose();
  // dropMat: a stray part to leave out (a marker cube beside a scan)
  if (cfg.dropMat) for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) if (prim.getMaterial()?.getName() === cfg.dropMat) prim.dispose();
  await doc.transform(flatten());
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    if (mesh.listParents().filter((p) => p.propertyType === 'Node').length > 1) node.setMesh(mesh.clone());
    clearNodeTransform(node);
  }
  // parts(prim): name a material per primitive, so join keeps them apart (an andon's paper from its frame)
  if (cfg.parts) {
    const made = {};
    for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
      const n = cfg.parts(prim);
      made[n] ||= prim.getMaterial().clone().setName(n);
      prim.setMaterial(made[n]);
    }
  }
  await doc.transform(join());
  const scene = root.listScenes()[0];
  if (cfg.rotX) {
    const r = (cfg.rotX * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    for (const mesh of root.listMeshes()) transformMesh(mesh, [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
  }
  if (cfg.rotY) {
    const r = (cfg.rotY * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    for (const mesh of root.listMeshes()) transformMesh(mesh, [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
  }
  // spine: [tail z, head z] for a creature that is animated along z; centred on its axis, not stood on the ground
  if (cfg.spine) {
    const b = getBounds(scene), [z0, z1] = cfg.spine;
    const k = (z1 - z0) / (b.max[2] - b.min[2]);
    const T = [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, -(b.min[0] + b.max[0]) / 2 * k, -(b.min[1] + b.max[1]) / 2 * k, z0 - b.min[2] * k, 1];
    for (const mesh of root.listMeshes()) transformMesh(mesh, T);
  }
  const bb = getBounds(scene);
  const k = cfg.spine ? 1 : cfg.scale ?? (cfg.fitLong ? cfg.fitLong / Math.max(bb.max[0] - bb.min[0], bb.max[2] - bb.min[2]) : cfg.height / (bb.max[1] - bb.min[1]));
  // fit: [width, height, depth] in metres, each axis on its own (a cushion scanned flatter than ours)
  const [kx, ky, kz] = cfg.fit ? cfg.fit.map((v, i) => v / (bb.max[i] - bb.min[i])) : [k, k, k];
  const cx = (bb.min[0] + bb.max[0]) / 2, cz = (bb.min[2] + bb.max[2]) / 2;
  const M = [kx, 0, 0, 0, 0, ky, 0, 0, 0, 0, kz, 0, -cx * kx, -bb.min[1] * ky, -cz * kz, 1];
  if (!cfg.spine) for (const mesh of root.listMeshes()) transformMesh(mesh, M);
  // the same placement for anything that travels with the model (a tree's leaf samples)
  const place = { k: kx, ox: -cx * kx, oy: -bb.min[1] * ky, oz: -cz * kz };
  // re-centre on the top of the model (a basin among lower stones) rather than on its bounding box
  if (cfg.centreAbove !== undefined) {
    let sx = 0, sz = 0, n = 0;
    for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
      const a = prim.getAttribute('POSITION').getArray();
      for (let i = 0; i < a.length; i += 3) if (a[i + 1] > cfg.centreAbove) { sx += a[i]; sz += a[i + 2]; n++; }
    }
    const T = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -sx / n, 0, -sz / n, 1];
    for (const mesh of root.listMeshes()) transformMesh(mesh, T);
    console.log(`${name} centred on ${n} verts above ${cfg.centreAbove} m, shift ${(-sx / n).toFixed(3)}, ${(-sz / n).toFixed(3)}`);
  }
  // re-centre on the foot of the model (a tree on its trunk rather than on its lopsided crown)
  if (cfg.centreBelow !== undefined) {
    let sx = 0, sz = 0, n = 0;
    for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
      const a = prim.getAttribute('POSITION').getArray();
      for (let i = 0; i < a.length; i += 3) if (a[i + 1] < cfg.centreBelow) { sx += a[i]; sz += a[i + 2]; n++; }
    }
    const T = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -sx / n, 0, -sz / n, 1];
    for (const mesh of root.listMeshes()) transformMesh(mesh, T);
    place.ox -= sx / n; place.oz -= sz / n;
  }
  if (cfg.cards) cards(name, cfg.cards, place);
  if (cfg.crop) crop(doc, cfg.crop);
  if (cfg.tips) tips(name, doc, cfg.tips);
  // shadeAbove [y0, y1, k]: a scan's photographed light taken down with height (dead limbs bleached under an
  // overcast sky), written as vertex colour
  if (cfg.shadeAbove) {
    const [y0, y1, k] = cfg.shadeAbove;
    for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'), n = pos.getCount(), col = new Float32Array(n * 3), e = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        pos.getElement(i, e);
        const t = Math.min(1, Math.max(0, (e[1] - y0) / (y1 - y0)));
        col.fill(1 - (1 - k) * t * t * (3 - 2 * t), i * 3, i * 3 + 3);
      }
      prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(col).setBuffer(root.listBuffers()[0]));
    }
  }
  // scans exported with a normal per face cannot weld; drop them and rebuild smooth ones after simplifying
  if (cfg.faceted) for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) prim.setAttribute('NORMAL', null);
  await doc.transform(weld(), dedup({ keepUniqueNames: true }));
  const mid = count(doc);
  if (cfg.tris && mid > cfg.tris) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: cfg.tris / mid, error: cfg.error ?? 0.01, lockBorder: false }));
  if (cfg.faceted) await doc.transform(normals({ overwrite: true }));
  if (cfg.spine) spineAux(doc, cfg.spine);
  if (cfg.sat !== undefined || cfg.gain !== undefined) await grade(doc, cfg.sat ?? 1, cfg.gain ?? 1);
  for (const mat of root.listMaterials()) mat.setMetallicFactor(0).setEmissiveTexture(null).setOcclusionTexture(null);
  // stripTex: the world lays its own material on this (a tree's scanned bark tiled along the model's uvs)
  if (cfg.stripTex) for (const mat of root.listMaterials()) mat.setBaseColorTexture(null).setNormalTexture(null).setMetallicRoughnessTexture(null);
  await doc.transform(prune({ keepAttributes: !!cfg.stripTex }));
  if (cfg.lo) await writeLo(name, doc, cfg.lo);
  if (cfg.detail) await detail(doc, cfg.tex);
  await compressMaps(doc, cfg.tex, cfg.ntex ?? Math.min(cfg.tex, 2048), cfg.rtex, cfg.codec);
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const file = pjoin(OUT, `${name}.glb`);
  await io.write(file, doc);
  const b2 = getBounds(doc.getRoot().listScenes()[0]);
  const size = b2.max.map((v, i) => (v - b2.min[i]).toFixed(2)).join(' x ');
  console.log(`${name.padEnd(10)} tris ${before} -> ${mid} -> ${count(doc)}  ${size} m  ${(statSync(file).size / 1024).toFixed(0)} KB`);
}

// maps lifted out of downloaded models for the world's own materials: [source, texture index, out, size, kind]
// kind: 'rgb' colour, 'n' normal, 'a' colour with alpha, 'rgb+ao' colour with another texture's red as alpha
export const MAPS = [
  // a photographed clipped hedge, seamless: the karikomi's surface
  ['sf/hedge01/model.glb', [0, 1], 'hedge_c', 1024, 'rgb+ao'],
  ['sf/hedge01/model.glb', 2, 'hedge_n', 1024, 'n'],
];

async function extractMaps() {
  const TEX = new URL('../public/assets/tex/', import.meta.url).pathname;
  for (const [src, idx, out, size, kind] of MAPS) {
    const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(pjoin(SRC, src));
    const tx = doc.getRoot().listTextures();
    const img = (i) => sharp(Buffer.from(tx[i].getImage())).resize(size, size);
    let pipe;
    if (kind === 'rgb+ao') {
      // interleaved by hand: sharp's joinChannel band is not taken as alpha by the webp encoder
      const rgb = await img(idx[0]).removeAlpha().raw().toBuffer();
      const ao = await img(idx[1]).extractChannel(0).raw().toBuffer();
      const rgba = Buffer.alloc(size * size * 4);
      for (let i = 0; i < size * size; i++) {
        rgba[i * 4] = rgb[i * 3]; rgba[i * 4 + 1] = rgb[i * 3 + 1]; rgba[i * 4 + 2] = rgb[i * 3 + 2]; rgba[i * 4 + 3] = ao[i];
      }
      pipe = sharp(rgba, { raw: { width: size, height: size, channels: 4 } });
    } else if (kind === 'a') pipe = img(idx).ensureAlpha();
    else pipe = img(idx).removeAlpha();
    await pipe.webp({ quality: kind === 'n' ? 90 : 84, alphaQuality: 90 }).toFile(pjoin(TEX, `${out}.webp`));
    console.log('map', out, kind);
  }
}

const only = process.argv.slice(2);
if (!only.length || only.includes('maps')) await extractMaps();
for (const [name, cfg] of Object.entries(MODELS)) if (!only.length || only.includes(name)) await convert(name, cfg);

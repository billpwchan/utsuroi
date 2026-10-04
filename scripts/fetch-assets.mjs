// Downloads CC0 textures and scanned models from Poly Haven (and a few ambientCG scans) into public/assets.
// Textures become KTX2 (c = colour, n = GL normal, r = roughness): the surfaces the camera comes close to (the
// floor boards, which span 2.4 m) carry 4K colour, the rest 2K; roughness is low-frequency and stays 1K. Models are welded,
// simplified with meshoptimizer and written as plain position/normal/uv binaries plus KTX2 maps, so the page needs
// no glTF loader for them.
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { weld, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { ktx2File } from './ktx.mjs';
import sharp from 'sharp';

const ROOT = new URL('../public/assets/', import.meta.url).pathname;
const TEX = join(ROOT, 'tex');
const MOD = join(ROOT, 'models');
const TMP = new URL('../.cache/dl/', import.meta.url).pathname;
for (const d of [TEX, MOD, TMP]) mkdirSync(d, { recursive: true });

// [asset, colour size, maps, normal size, colour codec]
const TEXTURES = [
  ['tatami_mat', 2048, 'cnr', 2048, 'uastc'],
  ['hinoki_planks', 4096, 'cnr', 2048, 'etc1s'],
  ['clay_plaster', 2048, 'cn', 1024, 'uastc'],
  // the weather on the earthen wall: grime, rain-wash and moss over the clay
  ['worn_mossy_plasterwall', 2048, 'c', 0, 'etc1s'],
  ['japanese_cedar_planks', 2048, 'cnr', 1024, 'etc1s'],
  ['japanese_stone_wall', 2048, 'cn', 1024, 'etc1s'],
  ['gravel_floor_02', 2048, 'c', 0, 'etc1s'],
  ['clay_floor_001', 2048, 'cn', 1024, 'etc1s'],
  ['slate_floor_03', 2048, 'cnr', 1024, 'etc1s'],
  ['pine_bark', 2048, 'cn', 1024, 'etc1s'],
  ['trident_maple_bark', 2048, 'cn', 1024, 'etc1s'],
  ['japanese_cedar_bark', 2048, 'cn', 1024, 'etc1s'],
  ['rough_linen', 1024, 'cn', 1024, 'uastc'],
  ['bamboo_veneer', 0, 'n', 1024, 'uastc'],
  ['forrest_ground_01', 2048, 'cn', 1024, 'etc1s'],
  ['ganges_river_pebbles', 2048, 'cn', 1024, 'etc1s'],
  ['forest_leaves_04', 2048, 'c', 0, 'etc1s'],
];
const KEY = { c: 'Diffuse', n: 'nor_gl', r: 'Rough' };
// ambientCG (CC0) scans Poly Haven has no match for: [asset, out name, colour size, maps, normal size]
const ACG = [
  // sugigoke with the needles and grit of a real garden floor in it, 45 cm across
  ['Moss001', 'sugigoke', 2048, 'c', 0],
];
const ACG_KEY = { c: 'Color', n: 'NormalGL', r: 'Roughness' };
const res = (px) => (px > 2048 ? '4k' : px > 1024 ? '2k' : '1k');

// [asset, target triangles, map size, cut-out: the alpha map goes into the colour map's alpha]
const MODELS = [
  // a sword fern's clump, four plants: the wall's foot, the approach's verges, the shade by stones and the basin
  ['fern_02', 6300, 2048, true],
  ['rock_moss_set_01', 36000, 2048],
  ['rock_moss_set_02', 36000, 2048],
  ['rock_07', 24000, 2048],
  ['rock_09', 24000, 2048],
  ['namaqualand_boulder_02', 30000, 2048],
  ['namaqualand_boulder_05', 30000, 2048],
];

const get = async (url) => Buffer.from(await (await fetch(url)).arrayBuffer());
const meta = async (id) => (await fetch(`https://api.polyhaven.com/files/${id}`)).json();

for (const [id, size, maps, nsize, codec] of TEXTURES) {
  const m = await meta(id);
  for (const k of maps) {
    const dst = join(TEX, `${id}_${k}.ktx2`);
    if (existsSync(dst)) continue;
    const px = k === 'c' ? size : k === 'n' ? nsize : 1024;
    const bytes = await ktx2File(await get(m[KEY[k]][res(px)].jpg.url), dst, { kind: k, size: px, flip: true, codec: k === 'c' ? codec : 'uastc' });
    console.log('tex', dst.split('/').pop(), px, (bytes / 1048576).toFixed(2) + ' MB');
  }
}

for (const [id, out, size, maps, nsize] of ACG) {
  const dir = join(TMP, id);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'src.zip'), await get(`https://ambientcg.com/get?file=${id}_2K-JPG.zip`));
    execFileSync('unzip', ['-oq', join(dir, 'src.zip'), '-d', dir]);
  }
  for (const k of maps) {
    const dst = join(TEX, `${out}_${k}.ktx2`);
    if (existsSync(dst)) continue;
    const px = k === 'c' ? size : k === 'n' ? nsize : 1024;
    const bytes = await ktx2File(join(dir, `${id}_2K-JPG_${ACG_KEY[k]}.jpg`), dst, { kind: k, size: px, flip: true, codec: k === 'c' ? 'etc1s' : 'uastc' });
    console.log('tex', dst.split('/').pop(), px, (bytes / 1048576).toFixed(2) + ' MB');
  }
}

await MeshoptSimplifier.ready;
const io = new NodeIO();
for (const [id, tris, msize, cut] of MODELS) {
  const dst = join(MOD, `${id}.bin`);
  if (existsSync(dst)) continue;
  const m = await meta(id);
  const g = m.gltf[res(msize)].gltf;
  const dir = join(TMP, id);
  mkdirSync(join(dir, 'textures'), { recursive: true });
  writeFileSync(join(dir, `${id}.gltf`), await get(g.url));
  for (const [p, f] of Object.entries(g.include)) writeFileSync(join(dir, p), await get(f.url));
  const doc = await io.read(join(dir, `${id}.gltf`));
  // a set holds several rocks as separate meshes; keep each as its own part
  const parts = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const mat = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) parts.push({ prim, mat, name: node.getName() });
  }
  const total = parts.reduce((s, p) => s + p.prim.getIndices().getCount() / 3, 0);
  await doc.transform(dedup(), weld());
  const out = [];
  for (const { prim, mat, name } of parts) {
    const pos = prim.getAttribute('POSITION').getArray();
    const nrm = prim.getAttribute('NORMAL').getArray();
    const uv = prim.getAttribute('TEXCOORD_0').getArray();
    const idx = Uint32Array.from(prim.getIndices().getArray());
    const n = idx.length / 3;
    const target = Math.min(n, Math.max(300, Math.round((tris * n) / total)));
    const [simp] = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, uv, 2, [0.5, 0.5], null, Math.round(target * 3), 0.02, ['LockBorder']);
    // bake the node transform into positions and normals
    const P = new Float32Array(pos.length), N = new Float32Array(nrm.length);
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      P[i] = mat[0] * x + mat[4] * y + mat[8] * z + mat[12];
      P[i + 1] = mat[1] * x + mat[5] * y + mat[9] * z + mat[13];
      P[i + 2] = mat[2] * x + mat[6] * y + mat[10] * z + mat[14];
      const a = nrm[i], b = nrm[i + 1], c = nrm[i + 2];
      let nx = mat[0] * a + mat[4] * b + mat[8] * c, ny = mat[1] * a + mat[5] * b + mat[9] * c, nz = mat[2] * a + mat[6] * b + mat[10] * c;
      const l = Math.hypot(nx, ny, nz) || 1;
      N[i] = nx / l; N[i + 1] = ny / l; N[i + 2] = nz / l;
    }
    // compact to used vertices
    const remap = new Int32Array(pos.length / 3).fill(-1);
    let vc = 0;
    for (const i of simp) if (remap[i] < 0) remap[i] = vc++;
    const p2 = new Float32Array(vc * 3), n2 = new Float32Array(vc * 3), u2 = new Float32Array(vc * 2);
    for (let i = 0; i < remap.length; i++) {
      const r = remap[i];
      if (r < 0) continue;
      p2.set(P.subarray(i * 3, i * 3 + 3), r * 3);
      n2.set(N.subarray(i * 3, i * 3 + 3), r * 3);
      u2.set(uv.subarray(i * 2, i * 2 + 2), r * 2);
    }
    const i2 = new Uint32Array(simp.length);
    for (let i = 0; i < simp.length; i++) i2[i] = remap[simp[i]];
    out.push({ name, p2, n2, u2, i2 });
  }
  // layout: [u32 parts] then per part [u32 vcount, u32 icount, f32 pos*3, f32 nrm*3, f32 uv*2, u32 idx]
  const chunks = [Buffer.from(new Uint32Array([out.length]).buffer)];
  for (const o of out) {
    chunks.push(Buffer.from(new Uint32Array([o.p2.length / 3, o.i2.length]).buffer));
    chunks.push(Buffer.from(o.p2.buffer), Buffer.from(o.n2.buffer), Buffer.from(o.u2.buffer), Buffer.from(o.i2.buffer));
  }
  writeFileSync(dst, Buffer.concat(chunks));
  for (const [p] of Object.entries(g.include)) {
    if (!/\.(jpg|png)$/.test(p)) continue;
    const k = /diff/.test(p) ? 'c' : /nor_gl/.test(p) ? 'n' : /rough/.test(p) ? 'r' : null;
    if (!k) continue;
    if (k === 'r') continue;
    let src = join(dir, p);
    if (k === 'c' && cut) {
      const a = await sharp(await get(m.Alpha[res(msize)].png.url)).greyscale().resize(msize, msize).raw().toBuffer();
      src = await sharp(src).resize(msize, msize).removeAlpha().joinChannel(a, { raw: { width: msize, height: msize, channels: 1 } }).png().toBuffer();
    }
    await ktx2File(src, join(MOD, `${id}_${k}.ktx2`), { kind: k, size: k === 'n' ? msize / 2 : msize, alpha: k === 'c' && cut, codec: k === 'c' && cut ? 'uastc' : undefined });
  }
  rmSync(dir, { recursive: true });
  console.log('model', id, out.length, 'parts', out.map((o) => o.i2.length / 3).join('/'), 'tris');
}

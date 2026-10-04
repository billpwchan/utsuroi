// Texture loading: colour maps in sRGB, data maps linear; all repeat with full anisotropy.
// .ktx2 maps (UASTC, transcoded to BC7 or ASTC) keep 2K-4K detail at a quarter of the memory of decoded images;
// they are flipped when encoded, since a compressed texture cannot be flipped on upload.
import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

const loader = new THREE.TextureLoader();
let ktx2 = null;
const cache = new Map();
let aniso = 8;
let pending = 0, done = 0;
let settle = null;
const tick = () => { done++; if (done >= pending && settle) { settle(); settle = null; } };
export const progress = { get value() { return pending ? done / pending : 1; } };
export const loaded = () => (done >= pending ? Promise.resolve() : new Promise((r) => { settle = r; }));

export function setAnisotropy(a) { aniso = a; }
export function setRenderer(r) { ktx2 = new KTX2Loader().setTranscoderPath('./basis/').detectSupport(r); }

export function tex(path, srgb = false, repeat = true, flipY = true, levels = 0) {
  const key = path + srgb + flipY + levels;
  if (cache.has(key)) return cache.get(key);
  pending++;
  let t;
  if (path.endsWith('.ktx2')) {
    // a stand-in the materials can hold now; it is not uploaded until the transcoded levels arrive. Levels live on
    // the texture, not its shared source, so copies made before then (a material's own repeat) are filled too
    t = new THREE.CompressedTexture([], 0, 0);
    const copies = [t];
    const clone = function () { const c = new THREE.CompressedTexture([], 0, 0).copy(this); c.clone = clone; copies.push(c); return c; };
    t.clone = clone;
    ktx2.load(path, (k) => {
      // levels: keep only the first few mips (lightmap charts would bleed into each other further down)
      const mips = levels ? k.mipmaps.slice(0, levels) : k.mipmaps;
      for (const c of copies) {
        c.mipmaps = mips; c.image = k.image; c.format = k.format; c.type = k.type;
        c.minFilter = mips.length > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
        c.generateMipmaps = false;
        c.needsUpdate = true;
      }
      tick();
    }, undefined, () => { tick(); console.warn('[ut] missing', path); });
    t.flipY = false;
  } else {
    t = loader.load(path, tick, undefined, () => { tick(); console.warn('[ut] missing', path); });
    t.flipY = flipY;
  }
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  cache.set(key, t);
  return t;
}

// a Poly Haven set: colour (sRGB), GL normal, optional roughness
export function pbr(name, maps = 'cn') {
  const base = `./assets/tex/${name}_`;
  return {
    map: maps.includes('c') ? tex(base + 'c.ktx2', true) : null,
    normalMap: maps.includes('n') ? tex(base + 'n.ktx2') : null,
    roughnessMap: maps.includes('r') ? tex(base + 'r.ktx2') : null,
  };
}

export async function loadModel(name) {
  pending++;
  const buf = await (await fetch(`./assets/models/${name}.bin`)).arrayBuffer();
  tick();
  const u32 = new Uint32Array(buf);
  const parts = [];
  let o = 1;
  for (let p = 0; p < u32[0]; p++) {
    const vc = u32[o], ic = u32[o + 1];
    o += 2;
    const pos = new Float32Array(buf, o * 4, vc * 3); o += vc * 3;
    const nrm = new Float32Array(buf, o * 4, vc * 3); o += vc * 3;
    const uv = new Float32Array(buf, o * 4, vc * 2); o += vc * 2;
    const idx = new Uint32Array(buf, o * 4, ic); o += ic;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    parts.push(g);
  }
  return {
    parts,
    // the scans keep glTF's convention: v runs down the image
    map: tex(`./assets/models/${name}_c.ktx2`, true, false, false),
    normalMap: tex(`./assets/models/${name}_n.ktx2`, false, false, false),
  };
}

// web glbs from scripts/models.mjs: meshopt geometry, webp maps
let gltfLoader = null;
export async function loadGLB(name) {
  if (!gltfLoader) {
    const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js')]);
    gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2);
  }
  pending++;
  try {
    const g = await gltfLoader.loadAsync(`./assets/glb/${name}.glb`);
    g.scene.updateMatrixWorld(true);
    return g.scene;
  } finally {
    tick();
  }
}

// every mesh of a loaded model as one geometry per material, in the model's own frame, with the maps it came with
export function meshesOf(root) {
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    // meshopt stores quantized, normalized integers; transforming them in place would clamp to [-1, 1]
    const g = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(o.geometry.attributes)) {
      const n = a.itemSize, f = new Float32Array(a.count * n);
      const get = [a.getX, a.getY, a.getZ, a.getW];
      for (let i = 0; i < a.count; i++) for (let j = 0; j < n; j++) f[i * n + j] = get[j].call(a, i);
      g.setAttribute(k, new THREE.BufferAttribute(f, n));
    }
    g.setIndex(o.geometry.index);
    g.applyMatrix4(o.matrixWorld);
    const m = o.material;
    out.push({ geometry: g, maps: { map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, normalScale: m.normalScale.clone() }, name: m.name });
  });
  return out;
}

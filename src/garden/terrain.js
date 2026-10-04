// Ground: a fine grid over the walled site, stitched to a polar ring of far land that reaches the ridges.
// The ground shader reads two cover masks baked from the site plan: moss, raked gravel (lines along the house,
// rings around the rocks, a border line at every edge), dark pebbles under the drip lines, packed earth, and
// the cut-stone path from the gate.
import * as THREE from 'three';
import { patch } from '../core/shared.js';
import { pbr, tex } from '../core/assets.js';
import { heightAt, coverAt, kareD, pathsD, waterD, KARE_ROCKS, SITE_TEX, COURT, WATER_Y, WALL, APPROACH } from './site.js';
import { smoothstep, vnoise } from '../lib/math.js';

const CX = -2.5, CZ = 2.0, HX = 44, HZ = 34, STEP = 0.25;

function masks() {
  const { x0, x1, z0, z1 } = SITE_TEX;
  const W = 768, H = Math.round((W * (z1 - z0)) / (x1 - x0));
  const a = new Uint8Array(W * H * 4), b = new Uint8Array(W * H * 4);
  // ring centres for the rake: rocks plus a little margin for their footprint
  const rings = KARE_ROCKS.map(([x, z, , s]) => [x, z, 0.42 * s + 0.3]);
  for (let j = 0; j < H; j++) {
    const z = z0 + ((j + 0.5) / H) * (z1 - z0);
    for (let i = 0; i < W; i++) {
      const x = x0 + ((i + 0.5) / W) * (x1 - x0);
      const c = coverAt(x, z);
      const o = (j * W + i) * 4;
      a[o] = c.moss * 255;
      a[o + 1] = c.gravel * 255;
      a[o + 2] = c.pebble * 255;
      a[o + 3] = c.earth * 255;
      // rake fields: distance to the nearest rock edge, distance to the gravel's border
      let rd = 9;
      for (const [rx, rz, rr] of rings) rd = Math.min(rd, Math.hypot(x - rx, z - rz) - rr);
      let ed = -kareD(x, z);
      if (x > COURT.x0 && x < COURT.x1 && z > COURT.z0 && z < COURT.z1) ed = Math.min(x - COURT.x0, COURT.x1 - x, z - COURT.z0, COURT.z1 - z);
      b[o] = c.path * 255;
      b[o + 1] = Math.max(0, Math.min(255, (rd / 4) * 255));
      b[o + 2] = Math.max(0, Math.min(255, (ed / 2) * 255));
      b[o + 3] = 255;
    }
  }
  const mk = (d) => {
    const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat);
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  };
  return { cover: mk(a), rake: mk(b) };
}

// where the garden's trees hang over the ground: their leaf cards' footprint, spread by the wind to the reach of what
// they drop; 0 in the open, toward 1 under a full crown. It goes in the rake mask's spare alpha (the ground shader
// has no texture unit left)
function canopyMask(trees, rake) {
  const { x0, x1, z0, z1 } = SITE_TEX;
  const C = 0.25, W = Math.round((x1 - x0) / C), H = Math.round((z1 - z0) / C);
  let g = new Float32Array(W * H);
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  trees.traverse((o) => {
    if (!o.isInstancedMesh || !o.customDepthMaterial) return;
    const pos = o.geometry.attributes.position;
    for (let k = 0; k < o.count; k++) {
      o.getMatrixAt(k, m);
      for (let i = 0; i < pos.count; i += 4) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        const gi = Math.floor((v.x - x0) / C), gj = Math.floor((v.z - z0) / C);
        if (gi >= 0 && gj >= 0 && gi < W && gj < H) g[gj * W + gi] += 1;
      }
    }
  });
  const blur = (r) => {
    const t = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      let a = 0;
      for (let d = -r; d <= r; d++) a += g[j * W + Math.min(W - 1, Math.max(0, i + d))];
      t[j * W + i] = a / (2 * r + 1);
    }
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      let a = 0;
      for (let d = -r; d <= r; d++) a += t[Math.min(H - 1, Math.max(0, j + d)) * W + i];
      g[j * W + i] = a / (2 * r + 1);
    }
  };
  blur(3);
  blur(3);
  const { data: d, width: RW, height: RH } = rake.image;
  for (let j = 0; j < RH; j++) {
    const fj = Math.min(H - 1.001, Math.max(0, ((j + 0.5) / RH) * H - 0.5)), j0 = Math.floor(fj), tj = fj - j0;
    for (let i = 0; i < RW; i++) {
      const fi = Math.min(W - 1.001, Math.max(0, ((i + 0.5) / RW) * W - 0.5)), i0 = Math.floor(fi), ti = fi - i0;
      const a = g[j0 * W + i0] * (1 - ti) + g[j0 * W + i0 + 1] * ti, b = g[(j0 + 1) * W + i0] * (1 - ti) + g[(j0 + 1) * W + i0 + 1] * ti;
      d[(j * RW + i) * 4 + 3] = Math.round((1 - Math.exp(-(a * (1 - tj) + b * tj) / 6)) * 255);
    }
  }
  rake.needsUpdate = true;
}

// how thickly bamboo stands over the ground, 0 to 1: a grove floor is its own fallen leaves, not moss. It goes in the
// rake mask's blue, which only the gravel reads (its border distance); everywhere off the gravel that channel is free
function groveMask(culms, rake, cover) {
  const { x0, x1, z0, z1 } = SITE_TEX;
  const C = 0.25, W = Math.round((x1 - x0) / C), H = Math.round((z1 - z0) / C), r = 10;
  const g = new Float32Array(W * H);
  for (const { x, z } of culms) {
    const ci = Math.floor((x - x0) / C), cj = Math.floor((z - z0) / C);
    for (let j = Math.max(0, cj - r); j <= Math.min(H - 1, cj + r); j++)
      for (let i = Math.max(0, ci - r); i <= Math.min(W - 1, ci + r); i++) {
        const dx = x0 + (i + 0.5) * C - x, dz = z0 + (j + 0.5) * C - z;
        g[j * W + i] += Math.exp(-(dx * dx + dz * dz) / 1.2);
      }
  }
  const { data: d, width: RW, height: RH } = rake.image;
  const cv = cover.image.data;
  for (let j = 0; j < RH; j++) {
    const fj = Math.min(H - 1.001, Math.max(0, ((j + 0.5) / RH) * H - 0.5)), j0 = Math.floor(fj), tj = fj - j0;
    for (let i = 0; i < RW; i++) {
      const o = (j * RW + i) * 4;
      if (cv[o + 1] > 0 || d[o + 2] > 0) continue;
      const fi = Math.min(W - 1.001, Math.max(0, ((i + 0.5) / RW) * W - 0.5)), i0 = Math.floor(fi), ti = fi - i0;
      const a = g[j0 * W + i0] * (1 - ti) + g[j0 * W + i0 + 1] * ti, b = g[(j0 + 1) * W + i0] * (1 - ti) + g[(j0 + 1) * W + i0 + 1] * ti;
      d[o + 2] = Math.round((1 - Math.exp(-(a * (1 - tj) + b * tj) * 0.9)) * 255);
    }
  }
  rake.needsUpdate = true;
}

// moss stands a few centimetres proud of gravel, path and pebbles, in soft cushions
export function mossLift(x, z) {
  const c = coverAt(x, z);
  const w = c.moss * (1 - c.gravel) * (1 - c.path) * (1 - c.pebble) * (1 - c.earth * 0.85);
  const n = Math.sin(x * 2.3 + Math.sin(z * 1.7)) * Math.sin(z * 2.9 + Math.sin(x * 1.3));
  // and the carpet itself rolls: a moss garden is never a level lawn. Low domes a stride or two across, a hand
  // high, that catch the light on one shoulder; settled flat by the stepping stones and the banks. Never below the
  // plain ground, so nothing set on it floats
  const roll = smoothstep(0.32, 0.85, vnoise(x * 0.42 + 3.1, z * 0.42 + 11.7)) * 0.1 + vnoise(x * 1.25 + 5.0, z * 1.25 - 2.0) * 0.03;
  const keep = smoothstep(0.25, 1.1, pathsD(x, z)) * smoothstep(0.15, 1.0, waterD(x, z));
  // pressed down against the gravel's kerb, which stands 4 cm proud of the sand
  const kerb = smoothstep(0.05, 0.45, kareD(x, z));
  // trodden flat along the stepping stones, which stand 5 cm above the soil
  const tread = smoothstep(-0.05, 0.35, pathsD(x, z));
  return w * tread * ((0.035 + 0.025 * n) * (0.4 + 0.6 * kerb) + roll * keep * kerb);
}

function innerGrid() {
  const nx = Math.round((2 * HX) / STEP), nz = Math.round((2 * HZ) / STEP);
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const x = CX - HX + i * STEP, z = CZ - HZ + j * STEP;
      const o = (j * (nx + 1) + i) * 3;
      pos[o] = x; pos[o + 1] = heightAt(x, z) + mossLift(x, z); pos[o + 2] = z;
    }
  const idx = new Uint32Array(nx * nz * 6);
  let k = 0;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      // split along the shorter diagonal of the actual surface
      const hA = pos[a * 3 + 1], hB = pos[b * 3 + 1], hC = pos[c * 3 + 1], hD = pos[d * 3 + 1];
      if (Math.abs(hA - hD) < Math.abs(hB - hC)) { idx[k++] = a; idx[k++] = c; idx[k++] = d; idx[k++] = a; idx[k++] = d; idx[k++] = b; }
      else { idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d; }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  // the perimeter, counter-clockwise from the south-west corner, for the ring to start from
  const per = [];
  for (let i = 0; i < nx; i++) per.push([CX - HX + i * STEP, CZ + HZ]);
  for (let j = nz; j > 0; j--) per.push([CX + HX, CZ - HZ + j * STEP]);
  for (let i = nx; i > 0; i--) per.push([CX - HX + i * STEP, CZ - HZ]);
  for (let j = 0; j < nz; j++) per.push([CX - HX, CZ - HZ + j * STEP]);
  return { g, per };
}

// rings scaled out from the site centre; the first ring is the grid's own perimeter, so there is no seam
function outerRing(per) {
  const NR = 96, R1 = 6000;
  const n = per.length;
  const keep = per;
  const m = n;
  const pos = new Float32Array(m * (NR + 1) * 3);
  const base = Math.hypot(HX, HZ);
  const grow = Math.pow(R1 / base, 1 / NR);
  for (let r = 0; r <= NR; r++) {
    const s = Math.pow(grow, r);
    for (let i = 0; i < m; i++) {
      const [px, pz] = keep[i];
      const x = CX + (px - CX) * s, z = CZ + (pz - CZ) * s;
      const o = (r * m + i) * 3;
      pos[o] = x; pos[o + 1] = heightAt(x, z); pos[o + 2] = z;
    }
  }
  const idx = new Uint32Array(m * NR * 6);
  let k = 0;
  for (let r = 0; r < NR; r++)
    for (let i = 0; i < m; i++) {
      const a = r * m + i, b = r * m + ((i + 1) % m), c = a + m, d = b + m;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

const GROUND_FRAG = /* glsl */ `
  uniform sampler2D tCover, tRake, tEarth, tGroundN, tPeb, tGrav, tStone, tLitter, tMossA, tSugi;
  // the second moss is laid rotated so the two tilings never line up
  const mat2 MROT = mat2(0.8, -0.6, 0.6, 0.8);
  uniform vec4 uSite;
  varying vec3 vGN;
  // moss polsters: domed cushions crowding edge to edge, a dark seam between each pair. x: height 0..1 over the
  // cushion, yz: its slope in cell units, w: how far from the seam
  vec4 sfPolster(vec2 p){
    vec2 ip = floor(p), fp = fract(p);
    float d1 = 9.0, d2 = 9.0, k1 = 1.0;
    vec2 r1 = vec2(0.0);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 h = fract(sin(vec2(dot(ip + o, vec2(127.1, 311.7)), dot(ip + o, vec2(269.5, 183.3)))) * 43758.5453);
      vec2 r = o + 0.1 + 0.8 * h - fp;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; r1 = r; k1 = 0.35 + 0.65 * fract(h.x * 17.3 + h.y * 3.1); } else if (d < d2) { d2 = d; }
    }
    // each cushion its own height; their shoulders round off into the next
    float dome = max(0.0, 1.0 - d1 / 0.5);
    return vec4(dome * k1, (d1 < 0.5 ? 2.0 * k1 / 0.5 : 0.0) * r1, sqrt(d2) - sqrt(d1));
  }
  vec2 siteUv(vec3 p){ return (p.xz - uSite.xy) / uSite.zw; }
  // the ground's xz across one pixel, taken before any branch: a layer's textures are read inside the branch that
  // skips it, where the GPU's own derivatives are undefined, so each read is given its gradient (uv = k xz + c)
  vec2 sfDwx, sfDwy;
  #define SFG(t, uv, k) textureGrad(t, uv, (k) * sfDwx, (k) * sfDwy)
  // cells: x the nearest cell's hash, y the next nearest's, z the distance to the border between them (cell units)
  vec3 sfCells(vec2 p){
    vec2 ip = floor(p), fp = fract(p);
    float d1 = 9.0, d2 = 9.0, h1 = 0.0, h2 = 0.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = g + vec2(sfHash12(ip + g), sfHash12(ip + g + 17.1)) * 0.85 + 0.075 - fp;
      float d = dot(o, o), h = sfHash12(ip + g + 5.3);
      if (d < d1) { d2 = d1; h2 = h1; d1 = d; h1 = h; } else if (d < d2) { d2 = d; h2 = h; }
    }
    return vec3(h1, h2, 0.5 * (sqrt(d2) - sqrt(d1)));
  }
  float sfSegD(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
  float rakePhase(vec2 p){
    vec4 rk = textureGrad(tRake, (p - uSite.xy) / uSite.zw, sfDwx / uSite.zw, sfDwy / uSite.zw);
    float ringD = rk.g * 4.0, edgeD = rk.b * 2.0;
    float wR = smoothstep(1.3, 1.1, ringD);
    float wE = smoothstep(0.33, 0.27, edgeD) * (1.0 - wR);
    float ph = mix(mix(p.y / 0.095, edgeD / 0.095, wE), ringD / 0.095, wR);
    return ph + (sfNoise(p * 0.7) - 0.5) * 0.6;
  }
  // sunlight focused by a rippled surface: the iterated-warp caustic, tiling every 1/0.45 m
  float sfCaustic(vec2 p, float t){
    vec2 q = mod(p * 6.2831, 6.2831) - 250.0;
    vec2 i = q; float c = 1.0;
    for (int n = 0; n < 5; n++){
      float tt = t * (1.0 - 3.5 / float(n + 1));
      i = q + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1.0 / length(vec2(q.x / (sin(i.x + tt) / 0.005), q.y / (cos(i.y + tt) / 0.005)));
    }
    c /= 5.0;
    c = 1.17 - pow(c, 1.4);
    return pow(abs(c), 8.0);
  }
  // a rounded ridge with a sharper trough, the profile a wooden rake leaves
  float rakeRidge(float ph){ float s = 0.5 + 0.5 * sin(ph * 6.2831); return sqrt(s); }
`;

export async function createTerrain() {
  const t0 = performance.now();
  const { cover, rake } = masks();
  const tm = performance.now();
  const { g: gin, per } = innerGrid();
  const gout = outerRing(per);
  console.log('[ut] terrain masks', (tm - t0).toFixed(0), 'ms, mesh', (performance.now() - tm).toFixed(0), 'ms');

  const earth = pbr('forrest_ground_01', 'c');
  const peb = pbr('ganges_river_pebbles', 'c');
  const grav = pbr('gravel_floor_02', 'c');
  const stone = pbr('japanese_stone_wall', 'c');
  const mossA = pbr('moss_a', 'c'), sugi = pbr('sugigoke', 'c');
  const uniforms = {
    tCover: { value: cover }, tRake: { value: rake },
    tEarth: { value: earth.map }, tPeb: { value: peb.map },
    // the earth's normal in rg, the pebbles' in ba
    tGroundN: { value: tex('./assets/tex/ground_np_r.ktx2') },
    tGrav: { value: grav.map },
    tStone: { value: stone.map }, tLitter: { value: tex('./assets/tex/forest_leaves_04_c.ktx2', true) },
    tMossA: { value: mossA.map }, tSugi: { value: sugi.map },
    uSite: { value: new THREE.Vector4(SITE_TEX.x0, SITE_TEX.z0, SITE_TEX.x1 - SITE_TEX.x0, SITE_TEX.z1 - SITE_TEX.z0) },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  patch(mat, {
    key: 'ground', snow: 1, uniforms, probes: false, gvis: false,
    vertexHead: 'varying vec3 vGN;',
    fragHead: `const float WATER_Y = ${WATER_Y.toFixed(3)};\nconst vec4 WALLR = vec4(${[WALL.x0, WALL.z0, WALL.x1, WALL.z1].map((v) => v.toFixed(2)).join(', ')});\n` + GROUND_FRAG +
      `float sfApproachD(vec2 p){ float d = 1e9;\n${APPROACH.pts.slice(1).map((b, i) => { const a = APPROACH.pts[i]; return `d = min(d, sfSegD(p, vec2(${a[0].toFixed(2)}, ${a[1].toFixed(2)}), vec2(${b[0].toFixed(2)}, ${b[1].toFixed(2)})));`; }).join('\n')}\nreturn d - ${(APPROACH.w / 2).toFixed(3)}; }`,
    hooks: {
      vertexPost: 'vGN = normal;',
      map: /* glsl */ `
        vec4 cv = texture2D(tCover, siteUv(vSfWP));
        vec4 rk = texture2D(tRake, siteUv(vSfWP));
        vec2 wxz = vSfWP.xz;
        sfDwx = dFdx(wxz); sfDwy = dFdy(wxz);
        float inSite = step(0.0, siteUv(vSfWP).x) * step(siteUv(vSfWP).x, 1.0) * step(0.0, siteUv(vSfWP).y) * step(siteUv(vSfWP).y, 1.0);
        cv = mix(vec4(0.45, 0.0, 0.0, 1.0), cv, inSite);
        rk = mix(vec4(0.0, 1.0, 0.0, 1.0), rk, inSite);
        float dist = length(vSfWP - cameraPosition);
        float mn1 = sfFbm(wxz * 1.3), mn2 = sfNoise(wxz * 7.0);
        // each layer's weight comes first, so a layer with none is skipped. The hummocks' height stays outside the
        // branches: its slope is taken from screen derivatives
        float wMoss = cv.r, wGrav = cv.g, wPeb = cv.b, wEarth = cv.a, wPath = rk.r;
        // moss edges break up along the noise rather than the mask's bilinear ramp
        float mEdge = smoothstep(0.3, 0.7, wMoss + (mn2 - 0.5) * 0.5);
        float sGrav = smoothstep(0.4, 0.6, wGrav), sPath = smoothstep(0.4, 0.6, wPath);
        // ---- beyond the wall: the floor of the woods. Litter of cedar needles, twigs and leaves, dark and damp under the
        // canopy; moss in drifts, thickest along the wall's shaded foot; river pebbles where the coping drips; the
        // approach in fitted stone from the gate out into the trees, a trodden verge either side
        vec2 wq = vec2(max(WALLR.x - wxz.x, wxz.x - WALLR.z), max(WALLR.y - wxz.y, wxz.y - WALLR.w));
        float wOutD = max(wq.x, wq.y);
        float wOut = smoothstep(0.24, 0.3, wOutD);
        float wMo = 0.0, wDrip = 0.0, wAp = 0.0;
        if (wOut > 0.0) wMo = smoothstep(0.5, 0.74, sfFbm(wxz * 0.33 + 5.0) * 0.85 + smoothstep(3.5, 0.6, wOutD) * 0.3 + (mn2 - 0.5) * 0.12);
        bool needMoss = mEdge * (1.0 - wEarth * 0.85) > 0.002 || wOut * wMo > 0.002;
        // hummocks a few centimetres high: drier and lighter on top, deeper green in the hollows
        float hum = sfFbm(wxz * 0.9 + 21.0) * 0.06 + sfNoise(wxz * 3.1) * 0.012;
        // the scan is an orange autumn litter (linear mean 0.24, 0.13, 0.056); a wet temple wood's is darker and browner
        const vec3 LIT = vec3(0.48, 0.56, 0.72);
        vec2 uL = wxz / 1.7;
        vec3 litC = vec3(0.0);
        if (needMoss || wOut > 0.0) {
          litC = SFG(tLitter, uL, 1.0 / 1.7).rgb * LIT;
          litC = mix(litC, SFG(tLitter, MROT * wxz / 4.1 + 3.3, MROT / 4.1).rgb * LIT, smoothstep(0.35, 0.65, sfNoise(wxz * 0.4 + 11.0)) * 0.55);
        }
        // ---- moss: two scanned carpets in drifts over low hummocks: bright cushion moss, and sugigoke with the
        // needles and grit of a real floor in it, which takes over where the moss thins toward bare earth
        vec2 uMA = wxz / 0.42, uMC = MROT * wxz / 0.45 + 1.3;
        // the scan is a grey-olive in daylight; pulled toward the green of a living carpet
        const vec3 SUGI = vec3(0.27, 0.33, 0.15);
        vec4 mA0 = vec4(0.0), pol1 = vec4(0.0), pol2 = vec4(0.0);
        vec3 mC = vec3(0.0), moss = vec3(0.0);
        float mwB = 0.0, mHt = 0.0, polK = 0.0;
        if (needMoss) {
          mA0 = SFG(tMossA, uMA, 1.0 / 0.42);
          vec4 mA = mA0;
          // a second lay of the cushion carpet, turned and shifted, mixed in by noise so its clumps never line up
          // in rows
          mA = mix(mA, SFG(tMossA, MROT * MROT * wxz / 0.47 + 7.9, MROT * MROT / 0.47), smoothstep(0.35, 0.65, sfNoise(wxz * 1.7 + 3.1)));
          mC = SFG(tSugi, uMC, MROT / 0.45).rgb * SUGI;
          // a few metres off the fine tiles blur to one flat green, so the same carpets laid five times larger
          // carry the clumps out into the distance
          float far = smoothstep(3.0, 14.0, dist);
          mA = mix(mA, (mA + SFG(tMossA, MROT * wxz / 2.2 + 0.4, MROT / 2.2)) * 0.5, far);
          mC = mix(mC, (mC + SFG(tSugi, wxz / 2.4 + 5.1, 1.0 / 2.4).rgb * SUGI) * 0.5, far);
          // the carpet is a patchwork of colonies of four kinds, each of its own colour, meeting the others along a
          // seam; cells of one kind run together, so colonies come in every size and shape. Sugigoke leans toward
          // the paths and banks
          vec2 cq = wxz / 1.5 + (vec2(sfNoise(wxz * 0.8 + 2.0), sfNoise(wxz * 0.8 + 9.0)) - 0.5) * 1.1
            + (vec2(sfNoise(wxz * 3.3 + 4.0), sfNoise(wxz * 3.3 + 12.0)) - 0.5) * 0.42 + (mn2 - 0.5) * 0.1;
          vec3 cell = sfCells(cq);
          float kind = floor(cell.x * 4.0), kind2 = floor(cell.y * 4.0);
          // a colony's edge is a hand-wide fringe where the two mosses grow into each other
          float fringe = (1.0 - smoothstep(0.0, 0.1, cell.z + (sfNoise(wxz * 9.0 + 3.0) - 0.5) * 0.06)) * 0.5 * (kind == kind2 ? 0.0 : 1.0);
          vec4 kA = vec4(step(2.5, kind), step(0.5, kind) * step(kind, 1.5), step(1.5, kind) * step(kind, 2.5), kind / 3.0);
          vec4 kB = vec4(step(2.5, kind2), step(0.5, kind2) * step(kind2, 1.5), step(1.5, kind2) * step(kind2, 2.5), kind2 / 3.0);
          vec4 kM = mix(kA, kB, fringe);
          vec2 colony = vec2(kM.w, kind == kind2 ? 1.0 : cell.z);
          mwB = clamp(kM.x + cv.a * 0.4 + (sfFbm(wxz * 0.32 + 9.0) - 0.5) * 0.3, 0.0, 1.0);
          // the cushion scan's green carries almost no blue, which reads as lawn; keep its light and dark and pull the
          // hue toward the olive and yellow-greens of a moss garden, drifting from patch to patch, with dry olive spots
          vec3 cushion = mA.rgb * vec3(1.1, 1.14, 1.12);
          float ml = dot(cushion, vec3(0.2126, 0.7152, 0.0722));
          vec3 hue = mix(vec3(0.62, 1.0, 0.32), vec3(0.8, 1.0, 0.27), kM.y);
          hue = mix(hue, vec3(0.86, 0.95, 0.46), kM.z * 0.3);
          cushion = mix(cushion, hue * ml / dot(hue, vec3(0.2126, 0.7152, 0.0722)), 0.62);
          moss = mix(cushion, mC, mwB);
          mHt = mix(mA.a, clamp(dot(mC, vec3(0.333)) / 0.07 * 0.5, 0.0, 1.0), mwB);
          // and patch to patch, a metre or two across: some cushions thick and lit, some thin and dark over damp soil
          float patchK = colony.x * 0.5 + sfFbm(wxz * 0.6 + 41.0) * 0.5;
          moss *= mix(0.7, 1.08, smoothstep(0.012, 0.05, hum)) * (0.6 + 0.62 * mn1) * mix(0.88, 1.06, smoothstep(0.2, 0.8, patchK));
          // where two colonies meet the carpet dips and thins, here and there: a dark seam, older brown stems in it
          float cseam = smoothstep(0.0, 0.035, colony.y + (mn2 - 0.5) * 0.03);
          moss *= mix(vec3(1.0), mix(vec3(0.66, 0.6, 0.48), vec3(1.0), cseam), smoothstep(0.4, 0.7, sfNoise(wxz * 1.9 + 6.0)));
          // cushions a hand across within clumps a forearm across; their seams hold shade and old brown stems
          polK = smoothstep(26.0, 6.0, dist);
          pol1 = sfPolster(wxz / 0.075);
          pol2 = sfPolster(MROT * wxz / 0.3 + 3.7);
          // only here and there does a seam open far enough to show shade
          float seam = mix(1.0, smoothstep(0.0, 0.3, pol2.w), 0.35 * smoothstep(0.45, 0.75, sfNoise(wxz * 2.3 + 8.0)));
          // the light the hollows between cushions never see, which shows in shade where no slope does
          moss *= mix(vec3(1.0), vec3(seam * (0.66 + 0.4 * sqrt(pol1.x)) * (0.8 + 0.26 * pol2.x)), polK * (1.0 - mwB * 0.5));
          // autumn leaves fallen on the moss, a frost-browned winter
          moss = mix(moss, moss * vec3(1.15, 0.95, 0.75), uSeason.z * 0.35);
          moss = mix(moss, vec3(0.13, 0.13, 0.07), uSeason.w * 0.4);
          // ---- under the garden's trees: the moss in their shade is deeper and cooler and thinner, the tree's litter
          // lying in it (needles under the pines, last year's leaves under the maples); in spring the weeping cherry
          // drops its petals round it
          float canopy = smoothstep(0.15, 0.75, rk.a) * inSite;
          moss *= mix(vec3(1.0), vec3(0.7, 0.8, 0.8), canopy);
          float litIn = canopy * smoothstep(0.42, 0.72, sfFbm(wxz * 0.9 + 31.0) + (mn2 - 0.5) * 0.25);
          moss = mix(moss, litC * vec3(0.85, 0.82, 0.78), litIn * 0.75);
        }
        if (uSeason.x > 0.0) {
          float pr = length(wxz - vec2(-15.4, 13.0));
          float fall = uSeason.x * smoothstep(6.0, 1.5, pr + (sfNoise(wxz * 0.9) - 0.5) * 2.0);
          // single petals near to, each a small notched oval at its own angle in a cell of its own; further off
          // only their share of the ground as a pink cast
          // the wind lays them in drifts: thick in streaks and hollows, a few strays between
          float dens = fall * (0.12 + 0.88 * smoothstep(0.5, 0.78, sfFbm(wxz * 0.8 + 1.0) + (sfNoise(wxz * 4.5) - 0.5) * 0.18));
          vec2 pc = wxz / 0.032, pid = floor(pc), pf = fract(pc) - 0.5;
          float ph = sfHash12(pid);
          vec2 po = (vec2(sfHash12(pid + 3.1), sfHash12(pid + 7.7)) - 0.5) * 0.45;
          float pa = ph * 40.0;
          vec2 pq = mat2(cos(pa), sin(pa), -sin(pa), cos(pa)) * (pf - po);
          float pe = length(pq * vec2(1.0, 1.5)) - 0.2 + 0.06 * smoothstep(0.1, 0.0, abs(pq.x)) * step(0.0, pq.y);
          float paa = fwidth(pe) + 1e-4;
          float petal = (1.0 - smoothstep(-paa, paa, pe)) * step(ph, dens * 0.7);
          float near = smoothstep(10.0, 4.0, dist);
          float cover = mix(dens * 0.07, petal, near);
          moss = mix(moss, vec3(0.56, 0.4, 0.43) * (0.8 + 0.3 * sfHash12(pid + 1.3)), cover * 0.85);
        }
        // ---- under the bamboo: a mat of its own fallen leaves, straw and khaki, darker where it lies damp; moss
        // only in patches between the culms. (Off the gravel, the rake mask's blue is the grove's density)
        float grove = smoothstep(0.15, 0.7, rk.b) * (1.0 - smoothstep(0.05, 0.3, wGrav));
        if (needMoss && grove > 0.0) {
          vec3 bamC = SFG(tLitter, MROT * wxz / 0.75 + 1.7, MROT / 0.75).rgb * LIT * vec3(1.45, 1.3, 0.9);
          bamC = mix(bamC, SFG(tLitter, wxz / 1.9 + 5.1, 1.0 / 1.9).rgb * LIT * vec3(1.2, 1.1, 0.8), 0.4);
          // bamboo leaves dry to a grey khaki, far less orange than broadleaf litter
          bamC = mix(vec3(dot(bamC, vec3(0.2126, 0.7152, 0.0722))), bamC, 0.45) * vec3(1.0, 0.97, 0.84) * 0.9;
          bamC *= mix(1.0, 0.62, smoothstep(0.42, 0.7, sfFbm(wxz * 0.7 + 2.0)));
          float keepMoss = smoothstep(0.58, 0.82, sfFbm(wxz * 0.45 + 17.0) + (mn2 - 0.5) * 0.2);
          moss = mix(moss, mix(bamC, moss * 0.75, keepMoss), grove);
        }
        // ---- earth and pebbles: scanned
        vec3 earthC = texture2D(tEarth, wxz / 2.2).rgb * vec3(0.72, 0.66, 0.58);
        vec3 pebC = texture2D(tPeb, wxz / 1.1).rgb * vec3(0.5, 0.5, 0.52);
        // bare soil: dry and pale under the eaves and by the paths, dark and damp where it shows through the moss
        vec3 col = earthC * mix(vec3(1.0), vec3(0.8, 0.95, 0.7), 0.3 * mn1) * mix(vec3(0.42, 0.38, 0.33), vec3(1.0), smoothstep(0.2, 0.7, wEarth));
        col = mix(col, moss, mEdge * (1.0 - wEarth * 0.85));
        col = mix(col, pebC, smoothstep(0.35, 0.65, wPeb));
        if (sGrav > 0.0) {
          // ---- gravel: shirakawa-suna, crushed granite: pale grey with warm feldspar and dark mica specks, about half
          // the light it receives (paper white would be twice that)
          vec3 gravC = SFG(tGrav, wxz / 0.9, 1.0 / 0.9).rgb;
          gravC = mix(vec3(dot(gravC, vec3(0.333))), gravC, 0.4) * vec3(0.8, 0.77, 0.71) + 0.012;
          col = mix(col, gravC, sGrav);
        }
        // ---- path
        vec3 stoneC = vec3(0.0);
        if (sPath > 0.0 || wOut > 0.0) stoneC = SFG(tStone, wxz / 2.6, 1.0 / 2.6).rgb * vec3(0.8, 0.78, 0.74);
        col = mix(col, stoneC, sPath);
        if (wOut > 0.0) {
          float hk = sfFbm(wxz * 0.21 + 23.0);
          litC *= mix(vec3(0.6, 0.58, 0.6), vec3(1.1, 1.0, 0.9), smoothstep(0.3, 0.75, hk));
          vec3 woods = mix(litC, moss * vec3(0.78, 0.8, 0.72), wMo);
          wDrip = smoothstep(0.27, 0.33, wOutD) * smoothstep(0.86, 0.76, wOutD + (sfNoise(wxz * 5.0) - 0.5) * 0.08);
          woods = mix(woods, pebC * vec3(0.85, 0.85, 0.82), wDrip);
          float apD = sfApproachD(wxz);
          wAp = smoothstep(0.04, -0.04, apD + (sfNoise(wxz * 2.7) - 0.5) * 0.1);
          woods = mix(woods, earthC * vec3(0.5, 0.46, 0.42), smoothstep(0.45, 0.05, apD) * (1.0 - wAp) * 0.75);
          woods = mix(woods, stoneC, wAp);
          col = mix(col, woods, wOut);
        }
        // the pond floor: river pebbles under a film of silt, wet dark earth at the waterline; nothing green
        // grows under the water
        float uwFloor = smoothstep(WATER_Y - 0.06, WATER_Y - 0.22, vSfWP.y);
        float wetBand = smoothstep(WATER_Y + 0.06, WATER_Y - 0.01, vSfWP.y);
        // the pond's low shores are a suhama, a beach of river pebbles running down into the water: dark and wet at
        // the waterline, drying grey above it
        float inPond = step(-12.5, wxz.x) * step(wxz.x, 9.5) * step(-6.0, wxz.y) * step(wxz.y, 13.5);
        float suhama = inPond * smoothstep(WATER_Y + 0.13, WATER_Y + 0.07, vSfWP.y + (sfNoise(wxz * 3.0) - 0.5) * 0.05) * (1.0 - smoothstep(0.4, 0.6, wPath));
        col = mix(col, pebC * mix(vec3(0.95, 0.93, 0.88), vec3(0.5, 0.48, 0.42), wetBand), suhama);
        col = mix(col, earthC * vec3(0.55, 0.52, 0.46), wetBand * (1.0 - suhama));
        // under the water the stones are filmed with silt
        col = mix(col, pebC * vec3(0.42, 0.42, 0.32), uwFloor);
        diffuseColor.rgb *= col;
        vec4 sfMix = vec4(mEdge * (1.0 - wEarth * 0.85), smoothstep(0.4, 0.6, wGrav), smoothstep(0.35, 0.65, wPeb), smoothstep(0.4, 0.6, wPath));
        sfMix = mix(sfMix, vec4(0.0, 0.0, 1.0, 0.0), max(uwFloor, suhama));
        sfMix = mix(sfMix, vec4(wMo * (1.0 - wAp), 0.0, wDrip * (1.0 - wAp), wAp), wOut);
      `,
      normal: /* glsl */ `
        {
          float r0 = 1.0;
          vec2 gR = vec2(0.0), nG = vec2(0.0);
          if (sfMix.y > 0.0) {
            // the rake: lines along the house, rings round the rocks, a line following the border; ridges ~9.5 cm
            float e = 0.025;
            float p0 = rakePhase(vSfWP.xz), px = rakePhase(vSfWP.xz + vec2(e, 0.0)), pz = rakePhase(vSfWP.xz + vec2(0.0, e));
            r0 = rakeRidge(p0);
            float amp = 0.02 * smoothstep(30.0, 5.0, dist);
            gR = vec2(rakeRidge(px) - r0, rakeRidge(pz) - r0) / e * amp;
            // gravel grain: brightness of the scan read as height (lit stones stand proud)
            const float EG = 1.5 / 1024.0;
            vec2 uG = vSfWP.xz / 0.9;
            float lG = dot(SFG(tGrav, uG, 1.0 / 0.9).rgb, vec3(0.333));
            nG = -vec2(dot(SFG(tGrav, uG + vec2(EG, 0.0), 1.0 / 0.9).rgb, vec3(0.333)) - lG, dot(SFG(tGrav, uG + vec2(0.0, EG), 1.0 / 0.9).rgb, vec3(0.333)) - lG) / (EG * 0.9) * 0.004;
          }
          vec2 gMoss = vec2(0.0);
          // the hummocks' slope from screen derivatives: x and z of the surface against the change of height
          {
            vec3 dpx = dFdx(vSfWP), dpy = dFdy(vSfWP);
            float hx = dFdx(hum), hy = dFdy(hum);
            float det = dpx.x * dpy.z - dpx.z * dpy.x;
            vec2 gH = abs(det) > 1e-9 ? vec2(hx * dpy.z - hy * dpx.z, hy * dpx.x - hx * dpy.x) / det : vec2(0.0);
            gMoss -= gH;
          }
          if (needMoss) {
            // moss: tilt from the carpets' height channel (the unit budget has no room for their normal maps);
            // the rotated carpet's gradient is turned back into world axes
            const float EU = 2.0 / 1024.0;
            vec2 gA = vec2(SFG(tMossA, uMA + vec2(EU, 0.0), 1.0 / 0.42).a - mA0.a, SFG(tMossA, uMA + vec2(0.0, EU), 1.0 / 0.42).a - mA0.a) / (EU * 0.42);
            // the sugigoke has no height map, and no unit is left for its normal map: its brightness is read as
            // height, the tips catching the light
            float lC = dot(mC, vec3(0.333));
            vec2 nC = -vec2(dot(SFG(tSugi, uMC + vec2(EU, 0.0), MROT / 0.45).rgb * SUGI, vec3(0.333)) - lC, dot(SFG(tSugi, uMC + vec2(0.0, EU), MROT / 0.45).rgb * SUGI, vec3(0.333)) - lC) / (EU * 0.45) * 0.01;
            gMoss += mix(-gA * 0.0075, nC * MROT, mwB);
            // the cushions' domes: up to 7 mm over a 7.5 cm cell, 2.2 cm over a 30 cm clump
            gMoss -= (pol1.yz * (0.007 / 0.075) + pol2.yz * MROT * (0.022 / 0.3)) * polK * (1.0 - mwB * 0.5);
          }
          // scanned normal maps for the rest, laid in world xz (tangent y is world -z)
          // earth and litter: their brightness read as height (no unit is left for their normal maps)
          const float EE = 1.5 / 2048.0;
          vec2 uE = vSfWP.xz / 2.2;
          float lE = dot(texture2D(tEarth, uE).rgb, vec3(0.333));
          vec2 nE = -vec2(dot(texture2D(tEarth, uE + vec2(EE, 0.0)).rgb, vec3(0.333)) - lE, dot(texture2D(tEarth, uE + vec2(0.0, EE)).rgb, vec3(0.333)) - lE) / (EE * 2.2) * 0.005;
          if (wOut > 0.0) {
            float lL = dot(SFG(tLitter, uL, 1.0 / 1.7).rgb, vec3(0.333));
            vec2 nL = -vec2(dot(SFG(tLitter, uL + vec2(EE, 0.0), 1.0 / 1.7).rgb, vec3(0.333)) - lL, dot(SFG(tLitter, uL + vec2(0.0, EE), 1.0 / 1.7).rgb, vec3(0.333)) - lL) / (EE * 1.7) * 0.007;
            nE = mix(nE, nL, wOut);
          }
          vec2 nP = vec2(0.0), nS = vec2(0.0);
          if (sfMix.z > 0.0) nP = (SFG(tGroundN, vSfWP.xz / 1.1, 1.0 / 1.1).zw * 2.0 - 1.0) * 1.1;
          if (sfMix.w > 0.0) nS = (SFG(tGroundN, vSfWP.xz / 2.6, 1.0 / 2.6).xy * 2.0 - 1.0) * 0.9;
          vec2 slope = nE;
          slope = mix(slope, gMoss, sfMix.x);
          slope = mix(slope, nP, sfMix.z);
          slope = mix(slope, nS, sfMix.w);
          slope = mix(slope, -gR + nG, sfMix.y);
          vec3 Ng = normalize(vGN);
          vec3 world = normalize(Ng + vec3(slope.x, 0.0, slope.y));
          normal = normalize((viewMatrix * vec4(world, 0.0)).xyz);
          roughnessFactor = mix(0.95, 0.88, sfMix.y);
          roughnessFactor = mix(roughnessFactor, 0.6, sfMix.z);
          roughnessFactor = mix(roughnessFactor, 0.8, sfMix.w);
          // the troughs of the rake hold a little shade
          diffuseColor.rgb *= mix(1.0, 0.78 + 0.22 * r0, sfMix.y * smoothstep(25.0, 5.0, dist));
          // moss is velvet: the tips catch light at grazing angles, the hollows between cushions stay dark
          float mNV = abs(dot(normalize(vNormal), normalize(vViewPosition)));
          diffuseColor.rgb *= mix(1.0, (0.7 + 0.45 * mHt) * (1.0 + 0.5 * pow(1.0 - mNV, 3.0)), sfMix.x);
        }
      `,
      light: /* glsl */ `
        {
          // the woods' floor past the reach of the shadow maps: only flecks of sun get down through the canopy
          {
            float deep = wOut * smoothstep(3.0, 9.0, wOutD) * smoothstep(24.0, 34.0, length(vSfWP - cameraPosition));
            if (deep > 0.0) {
              float fleck = smoothstep(0.55, 0.8, sfNoise(vSfWP.xz * 0.9 + 7.0) * 0.6 + sfNoise(vSfWP.xz * 3.7) * 0.4);
              reflectedLight.directDiffuse *= mix(1.0, 0.12 + 0.6 * fleck, deep);
            }
          }
          // under the pond the sun arrives as caustics, cast down along the refracted light
          float uw = smoothstep(WATER_Y - 0.01, WATER_Y - 0.1, vSfWP.y);
          if (uw > 0.0) {
            float dep = max(WATER_Y - vSfWP.y, 0.0);
            vec2 cp = vSfWP.xz + uSunDir.xz / max(uSunDir.y, 0.25) * dep * 0.75;
            float c = smoothstep(0.12, 0.7, sfCaustic(cp * 0.45, uTime * 0.5)) + 0.5 * smoothstep(0.15, 0.7, sfCaustic(cp * 0.29 + 0.37, uTime * 0.37));
            reflectedLight.directDiffuse *= mix(1.0, 0.4 + 2.2 * c, uw * exp(-dep * 2.5));
            // and is spent on the way down through the green water
            reflectedLight.directDiffuse *= mix(vec3(1.0), exp(-dep * vec3(2.3, 1.75, 3.0) / max(uSunDir.y, 0.3)), uw);
          }
        }`,
    },
  });
  const inner = new THREE.Mesh(gin, mat);
  inner.receiveShadow = true;
  inner.castShadow = false;
  inner.name = 'ground';
  inner.userData.bake = { skip: true };
  const outer = new THREE.Mesh(gout, mat);
  outer.receiveShadow = true;
  outer.name = 'far-land';
  outer.userData.bake = { skip: true };
  outer.frustumCulled = false;
  const group = new THREE.Group();
  group.add(inner, outer);
  const setCanopy = (trees, culms) => {
    const t0 = performance.now();
    canopyMask(trees, rake);
    groveMask(culms, rake, cover);
    console.log('[ut] canopy mask', (performance.now() - t0).toFixed(0), 'ms');
  };
  return { group, material: mat, uniforms, inner, outer, setCanopy };
}

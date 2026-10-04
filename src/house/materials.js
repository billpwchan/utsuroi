// Architectural materials. Every surface is a patched MeshStandardMaterial so it shares the world's light.
// Scanned Poly Haven maps where a real material matters (tatami, hinoki, clay plaster, stone), canvas-painted
// maps for what has to be made by hand (washi, karakami fusuma, the scroll, gold leaf).
import * as THREE from 'three';
import { patch } from '../core/shared.js';
import { pbr, tex } from '../core/assets.js';
import { LAYER_FX, LAYER_SHADOW } from '../core/pipeline.js';
import { rng } from '../lib/math.js';

function scaled(set, metres, extra = {}) {
  const out = {};
  for (const k of ['map', 'normalMap', 'roughnessMap']) {
    if (!set[k]) continue;
    const t = set[k].clone();
    t.repeat.set(1 / metres, 1 / metres);
    t.needsUpdate = true;
    out[k] = t;
  }
  return { ...out, ...extra };
}

function canvasTex(w, h, draw, srgb = true, repeat = true) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// cut and dried madake, as a kakei or a vase is made from: straw-olive skin weathered toward grey, fine fibres along
// the culm, and the nodes (a raised dark ring with a pale waxy band below it) every 25-35 cm. Kit tubes give u round
// the culm and v in metres along it, so the canvas covers one metre of culm.
function bambooTex() {
  return canvasTex(256, 1024, (g, W, H) => {
    const R = rng(17);
    const img = g.createImageData(W, H);
    const nodes = [];
    for (let y = 0.08; y < 1; y += 0.25 + R() * 0.1) nodes.push(y);
    const fib = Float32Array.from({ length: W }, () => R());
    for (let y = 0; y < H; y++) {
      const v = y / H;
      let node = 0, band = 0;
      for (const n of nodes) {
        const d = v - n;
        node = Math.max(node, Math.exp(-(d * d) / 0.000012));
        if (d > 0.004 && d < 0.035) band = Math.max(band, 1 - d / 0.035);
      }
      for (let x = 0; x < W; x++) {
        const f = (fib[x] * 0.6 + fib[(x + 1) % W] * 0.4) - 0.5;
        const weather = 0.5 + 0.5 * Math.sin(v * 9.1 + x * 0.05) * Math.sin(v * 3.7 - x * 0.021 + 1.3);
        let r = 0.62 + f * 0.1, gr = 0.55 + f * 0.09, b = 0.33 + f * 0.06;
        // olive-straw toward weathered grey
        r = r * (1 - weather * 0.35) + 0.5 * weather * 0.35; gr = gr * (1 - weather * 0.35) + 0.49 * weather * 0.35; b = b * (1 - weather * 0.35) + 0.42 * weather * 0.35;
        r += band * 0.08; gr += band * 0.08; b += band * 0.07;
        r *= 1 - node * 0.55; gr *= 1 - node * 0.58; b *= 1 - node * 0.6;
        const i = (y * W + x) * 4;
        img.data[i] = Math.min(255, r * 255); img.data[i + 1] = Math.min(255, gr * 255); img.data[i + 2] = Math.min(255, b * 255); img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  });
}

// straight-grained sugi / hinoki, as planed timber shows it: fine latewood lines along the length, a few wider
// bands where the saw crossed the rings, faint pores. Painted neutral and tinted by each material's colour.
// The canvas spans 2 m along the grain (u) and 0.5 m across (v).
export function grainTex(seed = 1, contrast = 1) {
  const W = 1024, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const R = rng(seed);
  // a 1-D ring profile across the board, wrapped so the texture tiles
  const prof = new Float32Array(H * 4);
  let ph = 0;
  for (let i = 0; i < prof.length; i++) {
    ph += 0.35 + R() * 0.9;
    const late = Math.pow(0.5 + 0.5 * Math.sin(ph), 6);
    prof[i] = late;
  }
  const band = (y) => {
    const t = ((y % H) + H) % H * 4;
    const i = Math.floor(t), f = t - i;
    return prof[i % prof.length] * (1 - f) + prof[(i + 1) % prof.length] * f;
  };
  const waves = Array.from({ length: 4 }, () => [R() * 6.283, 1 + Math.floor(R() * 3), (R() - 0.5) * 6]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let wv = 0;
      for (const [p0, k, a] of waves) wv += Math.sin((x / W) * 6.283 * k + p0) * a;
      const yy = y + wv;
      const l = band(yy) * 0.55 + band(yy * 0.37 + 40) * 0.25;
      const broad = 0.5 + 0.5 * Math.sin((yy / H) * 6.283 * 2 + Math.sin((x / W) * 6.283) * 0.6);
      let v = 0.78 - l * 0.32 * contrast - broad * 0.06 * contrast;
      // pores: short dark dashes along the grain
      if (R() < 0.004) v -= 0.12;
      const o = (y * W + x) * 4;
      const c = Math.max(0, Math.min(255, v * 255));
      img.data[o] = c; img.data[o + 1] = c * 0.97; img.data[o + 2] = c * 0.93; img.data[o + 3] = 255;
    }
  // dashes smeared along x
  g.putImageData(img, 0, 0);
  g.globalAlpha = 0.5;
  g.drawImage(cv, 1, 0);
  g.drawImage(cv, -1, 0);
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.repeat.set(1 / 2, 1 / 0.5);
  return t;
}

// washi: long kozo fibres in a warm white sheet, a few inclusions
export function washiTex() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#efe9dc';
    g.fillRect(0, 0, w, h);
    const R = rng(11);
    for (let i = 0; i < 2600; i++) {
      const x = R() * w, y = R() * h, l = 6 + R() * 40, a = R() * Math.PI;
      g.strokeStyle = `rgba(${R() < 0.5 ? '255,252,244' : '214,204,186'},${0.08 + R() * 0.16})`;
      g.lineWidth = 0.4 + R() * 1.1;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (R() - 0.5) * 8, y + Math.sin(a) * l * 0.5 + (R() - 0.5) * 8, x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(150,130,100,${0.05 + R() * 0.1})`;
      g.beginPath();
      g.ellipse(R() * w, R() * h, 0.6 + R() * 1.6, 0.4 + R() * 0.8, R() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
}

// karakami: woodblock-printed paper, a kiri (paulownia) crest in mica on a soft ground
export function karakamiTex(ground = '#d9d2c1', ink = 'rgba(255,250,236,0.55)') {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = ground;
    g.fillRect(0, 0, w, h);
    const R = rng(5);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(255,255,255,${R() * 0.05})`;
      g.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2);
    }
    const crest = (cx, cy, s) => {
      g.save();
      g.translate(cx, cy);
      g.scale(s, s);
      g.fillStyle = ink;
      // three leaves
      for (const [dx, rot] of [[-22, -0.5], [0, 0], [22, 0.5]]) {
        g.save();
        g.translate(dx, 14);
        g.rotate(rot);
        g.beginPath();
        g.moveTo(0, 18);
        g.bezierCurveTo(-16, 6, -14, -12, 0, -20);
        g.bezierCurveTo(14, -12, 16, 6, 0, 18);
        g.fill();
        g.restore();
      }
      // flower stalks: 3-5-3
      for (const [dx, n] of [[-22, 3], [0, 5], [22, 3]]) {
        for (let k = 0; k < n; k++) {
          g.beginPath();
          g.arc(dx + (k - (n - 1) / 2) * 0, -14 - k * 7, 3.2, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.restore();
    };
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) crest((x + (y % 2) * 0.5 + 0.25) * w / 4, (y + 0.5) * h / 4, 0.85);
  });
}

// gold leaf: squares of kinpaku laid edge to edge, each slightly different, with faint overlaps
export function goldLeafTex() {
  return canvasTex(512, 512, (g, w, h) => {
    const R = rng(3);
    const n = 8, s = w / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const v = 0.86 + R() * 0.2;
        g.fillStyle = `rgb(${Math.round(222 * v)},${Math.round(178 * v)},${Math.round(96 * v)})`;
        g.fillRect(x * s, y * s, s, s);
        g.strokeStyle = `rgba(120,80,30,${0.12 + R() * 0.1})`;
        g.lineWidth = 1;
        g.strokeRect(x * s + 0.5, y * s + 0.5, s, s);
      }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${R() < 0.5 ? '255,236,180' : '120,80,30'},${R() * 0.08})`;
      g.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 3);
    }
  }, true, true);
}

export function makeMaterials() {
  const M = {};
  const std = (params, opts = {}) => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...params });
    // walls are 7.5 cm boxes. With the default back-face shadow, the occluder depth sits on the room side of the
    // wall, and the sun map's bias (5-6 cm) lets a bright line through along the foot of every sunlit wall.
    // Both faces put the occluder on the outer face, a wall's thickness away.
    m.shadowSide = THREE.DoubleSide;
    patch(m, opts);
    return m;
  };

  // the scans come with their own strong colour (the cedar is nearly orange); keep their light and shade, a little
  // of their hue, and take the albedo from the material colour so the palette is set in one place
  const neutral = (mean, keep, extra = '') => ({
    map: /* glsl */ `
      {
        vec4 tx = texture2D(map, vMapUv);
        vec3 d = tx.rgb / max(vec3(${mean.map((v) => v.toFixed(4)).join(', ')}), vec3(0.02));
        float l = dot(d, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb = diffuse * max(mix(vec3(l), d, ${keep.toFixed(2)}), 0.0);
        ${extra}
      }`,
  });
  const CLAY = [0.1695, 0.1031, 0.0452], CEDAR = [0.4204, 0.125, 0.0037], TATAMI = [0.278, 0.2282, 0.1186], PLANKS = [0.3206, 0.1858, 0.0863], LINEN = [0.2836, 0.4096, 0.6111];
  const hinoki = pbr('bamboo_veneer', 'n');
  const grain = grainTex(3, 1), grainSoft = grainTex(9, 0.6), grainHard = grainTex(5, 0.9);
  const planks = pbr('hinoki_planks', 'cnr');
  const cedar = pbr('japanese_cedar_planks', 'cnr');
  const tatami = pbr('tatami_mat', 'cnr');
  const clay = pbr('clay_plaster', 'cn');
  const stoneWall = pbr('japanese_stone_wall', 'cn');
  const doma = pbr('clay_floor_001', 'cn');
  const slate = pbr('slate_floor_03', 'cnr');

  // pale planed hinoki: posts, rails, frames
  M.hinoki = std({ map: grain, color: 0x8e6e52, roughness: 0.58 }, { key: 'hinoki' });
  // shoji and glazing frames: the same timber, a shade lighter from being planed thin
  M.frame = std({ map: grainSoft, color: 0xa88a6a, roughness: 0.6 }, { key: 'frame' });
  // new pale hinoki: the bath, the bed platform, the kitchen counter
  // the bath tub (bounds set by the house) is built of this wood as plain boxes: its boards, box-jointed corners and
  // water marks are drawn here, which leaves the lightmapped geometry as it is
  const tubA = { value: new THREE.Vector4(1e4, 1e4, 1e4, 1e4) }, tubY = { value: new THREE.Vector2(1e4, 1e4) };
  M.hinokiPale = std({ map: grainSoft, color: 0xe2cfb0, roughness: 0.5 }, {
    key: 'hinokiPale',
    uniforms: { uTubA: tubA, uTubY: tubY },
    fragHead: 'uniform vec4 uTubA; uniform vec2 uTubY;',
    hooks: {
      map: /* glsl */ `
        {
          vec3 p = vSfWP;
          // derivatives outside the branch: inside it they are undefined
          float r = (p.y - uTubY.x) / (uTubY.y - uTubY.x) * 3.0, aw = fwidth(r);
          if (p.x > uTubA.x - 0.01 && p.x < uTubA.z + 0.01 && p.z > uTubA.y - 0.01 && p.z < uTubA.w + 0.01 && p.y > uTubY.x - 0.01 && p.y < uTubY.y + 0.01) {
            float H = uTubY.y - uTubY.x, hy = (p.y - uTubY.x) / H;
            float dx = min(p.x - uTubA.x, uTubA.z - p.x), dz = min(p.z - uTubA.y, uTubA.w - p.z);
            bool xFace = dx < 0.004, zFace = dz < 0.004, top = p.y > uTubY.y - 0.003;
            // three wide boards a side
            float row = floor(clamp(r, 0.0, 2.999));
            float seam = (xFace || zFace) && !top ? 1.0 - smoothstep(0.0, max(aw * 1.2, 0.009), min(fract(r), 1.0 - fract(r))) : 0.0;
            float face = xFace ? 0.0 : 1.0;
            float bh = fract(sin(dot(vec2(row, face + (p.x + p.z > 0.0 ? 2.0 : 0.0)), vec2(12.99, 78.23))) * 43758.5);
            vec3 c = diffuseColor.rgb * vec3(0.84, 0.74, 0.58) * (0.92 + 0.14 * bh);
            // box joints: in the corner block each row alternately shows a board's end grain on one face or the other
            bool corner = (xFace && dz < 0.06) || (zFace && dx < 0.06) || (top && dx < 0.06 && dz < 0.06);
            bool endg = corner && (top || mod(row + face, 2.0) < 0.5);
            if (endg) {
              vec2 q = xFace ? vec2(p.z, p.y) : zFace ? vec2(p.x, p.y) : p.xz;
              float ring = 0.5 + 0.5 * sin(length(q - floor(q / 0.06) * 0.06 - vec2(-0.08, 0.03)) * 260.0);
              c = diffuseColor.rgb * vec3(0.62, 0.48, 0.32) * (0.85 + 0.15 * ring);
            }
            if (corner && !endg && !top) {
              // the joint's own line where the next board's end meets this face
              float jl = xFace ? dz : dx;
              c *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, 0.0035, abs(jl - 0.06)));
            }
            c *= 1.0 - 0.6 * seam;
            // splashed and soaked along the rim, darker and greyer where it stands in the floor's wet
            float rim = smoothstep(0.86, 1.0, hy) * (0.7 + 0.3 * sfNoise(p.xz * 9.0 + p.y * 4.0));
            float foot = 1.0 - smoothstep(0.0, 0.12 + 0.08 * sfNoise(vec2(p.x + p.z, 0.0) * 6.0), hy);
            c = mix(c, c * vec3(0.66, 0.6, 0.52), max(rim, top ? 0.85 : 0.0));
            c = mix(c, vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))) * vec3(0.8, 0.78, 0.74), foot * 0.55);
            diffuseColor.rgb = c;
          }
        }`,
    },
  });
  M.hinokiPale.userData.tub = { a: tubA.value, y: tubY.value };
  // weathered exterior timber: silver-brown
  M.weathered = std({ map: grainHard, normalMap: scaled(hinoki, 1.6).normalMap, color: 0x7d7368, roughness: 0.8, normalScale: new THREE.Vector2(0.3, 0.3) }, { key: 'weathered', snow: 0.6 });
  // dark aged timber: beams of the living room, engawa edge
  M.darkwood = std({ map: grain, color: 0x4a3627, roughness: 0.55, normalScale: new THREE.Vector2(0.5, 0.5) }, { key: 'darkwood' });
  // floor boards: polished by feet and cloth
  M.boards = std({ ...scaled(planks, 2.4), color: 0x8a6a4c, roughness: 0.38, roughnessMap: scaled(planks, 2.4).roughnessMap, envMapIntensity: 1.2 }, { key: 'boards', hooks: neutral(PLANKS, 0.2) });
  M.engawa = std({ ...scaled(planks, 2.4), color: 0x8c7660, roughness: 0.42, envMapIntensity: 1.3 }, { key: 'engawa', snow: 0.4, hooks: neutral(PLANKS, 0.15) });
  // ceiling boards: cedar, quieter colour
  M.ceiling = std({ ...scaled(cedar, 1.8), color: 0x8b7058, roughness: 0.7 }, { key: 'ceiling', hooks: neutral(CEDAR, 0.0) });
  // the scan's green cloth borders become dark linen heri
  const heri = neutral(TATAMI, 0.3, `
        float heri = smoothstep(0.0, 0.05, tx.g - tx.r * 0.98);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.04, 0.035) * (0.8 + 0.4 * tx.g), heri);`);
  M.tatami = std({ ...scaled(tatami, 1.82), color: 0xc4b07a, roughness: 0.85 }, { key: 'tatami', hooks: heri });
  M.tatamiOld = std({ ...scaled(tatami, 1.82), color: 0xb9a46f, roughness: 0.85 }, { key: 'tatamiOld', hooks: heri });
  // juraku clay walls inside, white shikkui outside
  M.clay = std({ ...scaled(clay, 1.2), color: 0xb9a582, roughness: 0.95, normalScale: new THREE.Vector2(0.6, 0.6) }, { key: 'clay', hooks: neutral(CLAY, 0.2) });
  M.plaster = std({ ...scaled(clay, 1.4), color: 0xe8e2d6, roughness: 0.92, normalScale: new THREE.Vector2(0.35, 0.35) }, { key: 'plaster', snow: 0.2, hooks: neutral(CLAY, 0.05) });
  M.stone = std({ ...scaled(stoneWall, 2.0), color: 0xb4ada2, roughness: 0.85 }, { key: 'stone', snow: 0.8 });
  M.doma = std({ ...scaled(doma, 1.6), color: 0x6c6359, roughness: 0.82 }, { key: 'doma', hooks: neutral([0.1953, 0.116, 0.0481], 0.2) });
  M.slate = std({ ...scaled(slate, 1.2), color: 0x6d6862, roughness: 0.55 }, { key: 'slate' });

  // washi: lets light through from whichever side is brighter
  M.paper = std({ map: washiTex(), color: 0xf2ecdf, roughness: 0.92, side: THREE.DoubleSide }, { key: 'paper', trans: 0.62 });
  M.paper.userData.bake = { coverage: 0.45 };
  M.paper.userData.castShadow = true;
  M.fusuma = std({ map: karakamiTex(), color: 0xffffff, roughness: 0.8 }, { key: 'fusuma' });
  M.fusumaGold = std({ map: goldLeafTex(), color: 0xffffff, roughness: 0.38, metalness: 0.75, envMapIntensity: 0.9 }, { key: 'gold' });
  M.lacquer = std({ color: 0x120c09, roughness: 0.24, envMapIntensity: 1.2 }, { key: 'lacquer' });
  M.lacquerRed = std({ color: 0x5a140c, roughness: 0.26, envMapIntensity: 1.1 }, { key: 'lacquerRed' });
  // the tub's hoops are copper gone dark brown
  M.iron = std({ color: 0x232120, roughness: 0.55, metalness: 0.6 }, {
    key: 'iron',
    uniforms: { uTubA: tubA, uTubY: tubY },
    fragHead: 'uniform vec4 uTubA; uniform vec2 uTubY;',
    hooks: {
      map: /* glsl */ `
        if (vSfWP.x > uTubA.x - 0.02 && vSfWP.x < uTubA.z + 0.02 && vSfWP.z > uTubA.y - 0.02 && vSfWP.z < uTubA.w + 0.02 && vSfWP.y > uTubY.x && vSfWP.y < uTubY.y)
          diffuseColor.rgb = mix(vec3(0.13, 0.075, 0.045), vec3(0.08, 0.1, 0.075), 0.35 * sfNoise(vSfWP.xz * 23.0 + vSfWP.y * 31.0));`,
    },
  });
  M.brass = std({ color: 0xa88449, roughness: 0.35, metalness: 1.0 }, { key: 'brass' });
  // kawara: smoked clay tiles with a silver bloom
  M.tile = std({ color: 0x4a4c50, roughness: 0.5, metalness: 0.25, envMapIntensity: 1.0 }, { key: 'tile', snow: 1 });
  // the kawara's relief is far finer than a shadow texel: the tiled faces cast through a flat stand-in under them
  M.tile.userData.castShadow = false;
  M.tileShadow = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  M.tileShadow.userData.layer = LAYER_SHADOW;
  M.tileRidge = std({ color: 0x45474b, roughness: 0.5, metalness: 0.25 }, { key: 'tileRidge', snow: 1 });
  M.dark = std({ color: 0x0c0a09, roughness: 0.95 }, { key: 'dark' });
  M.copper = std({ color: 0x5f7a66, roughness: 0.6, metalness: 0.4 }, { key: 'copper', snow: 1 });
  M.bamboo = std({ map: bambooTex(), color: 0xffffff, roughness: 0.45 }, { key: 'bamboo' });
  M.straw = std({ color: 0x9c8a5a, roughness: 0.95 }, { key: 'straw' });
  M.reed = std({ map: grainSoft, color: 0x7a6a50, roughness: 0.8 }, { key: 'reed' });
  // the hearth sets uAshC to its centre; charcoal dust darkens the ash round the fire
  const ashC = { value: new THREE.Vector2(0, -99) };
  M.ash = std({ ...scaled(clay, 0.6), color: 0x67625c, roughness: 1.0, normalScale: new THREE.Vector2(0.15, 0.15) }, { key: 'ash', uniforms: { uAshC: ashC }, fragHead: 'uniform vec2 uAshC;', hooks: neutral(CLAY, 0.0, `
    // the ash smoothed with a spatula: faint parallel strokes (faded out before they alias), a little lumpy
    float ak = sfNoise(vSfWP.xz * 7.0), ak2 = sfNoise(vSfWP.xz * 31.0 + 4.0);
    float sp = vSfWP.x * 260.0 + ak * 5.0;
    float stroke = (0.5 + 0.5 * sin(sp)) * (1.0 - smoothstep(0.4, 1.2, fwidth(sp)));
    diffuseColor.rgb *= (0.88 + 0.18 * ak) * (0.94 + 0.08 * ak2) * (1.0 - 0.06 * stroke);
    float soot = smoothstep(0.26, 0.1, length(vSfWP.xz - uAshC) + (ak - 0.5) * 0.08);
    diffuseColor.rgb *= mix(1.0, 0.4, soot);` ) });
  M.ash.userData.centre = ashC.value;

  const linen = pbr('rough_linen', 'cn');
  M.linen = std({ ...scaled(linen, 0.5), color: 0xd5d2ca, roughness: 0.95 }, { key: 'linen', hooks: neutral(LINEN, 0.0) });
  M.linenWhite = std({ ...scaled(linen, 0.5), color: 0xe4e1da, roughness: 0.95 }, { key: 'linenW', hooks: neutral(LINEN, 0.0) });
  M.indigo = std({ ...scaled(linen, 0.45), color: 0x3b4150, roughness: 0.92, side: THREE.DoubleSide }, { key: 'indigo', hooks: neutral(LINEN, 0.0) });

  // glass: drawn after the opaque copy, reflects the sky it can see
  M.glass = new THREE.MeshStandardMaterial({ color: 0x9fb0b4, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.12, envMapIntensity: 1.6, depthWrite: false });
  patch(M.glass, { key: 'glass' });
  M.glass.userData.layer = LAYER_FX;
  M.glass.userData.castShadow = false;
  M.glass.userData.bake = { skip: true };
  return M;
}

export { canvasTex, tex };

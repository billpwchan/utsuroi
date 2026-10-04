// Foliage cards. Sakura blossom, broad leaves, maple, pine, sugi and the clipped satsuki are 2x2 atlases of branchlets built from CC0
// specimen scans at their true size, with the leaves' own normals (scripts/twigs.mjs). The bamboo's leaves and the
// meadow florets are still painted here on a canvas. Leaf cards are neutral greys (the
// material tints them per season); blossoms keep their colour.
import * as THREE from 'three';
import { rng } from '../lib/math.js';
import { tex } from '../core/assets.js';

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

// transparent texels take the mean leaf colour, so mipmaps do not darken the silhouettes
function toTexture(c) {
  const g = c.getContext('2d');
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
  if (n) { r /= n; gg /= n; b /= n; }
  // a soft round mask so no card ever shows a straight cut edge
  const W = c.width, Hh = c.height;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const dx = (x + 0.5) / W - 0.5, dy = (y + 0.5) / Hh - 0.5;
    const rr = Math.sqrt(dx * dx + dy * dy);
    const m = Math.min(1, Math.max(0, (0.5 - rr) / 0.12));
    d[i + 3] = d[i + 3] * m;
  }
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] < 8) { d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 0; }
  const t = new THREE.DataTexture(new Uint8Array(d.buffer.slice(0)), c.width, c.height, THREE.RGBAFormat);
  t.flipY = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.premultiplyAlpha = false;
  return t;
}

// a twig that wanders from (x,y) with a given direction, returns points
function twig(R, x, y, ang, len, steps) {
  const pts = [[x, y]];
  for (let i = 0; i < steps; i++) {
    ang += R.range(-0.25, 0.25);
    x += Math.cos(ang) * (len / steps);
    y += Math.sin(ang) * (len / steps);
    pts.push([x, y]);
  }
  return pts;
}

function strokeTwig(g, pts, w0, w1, col) {
  g.strokeStyle = col;
  g.lineCap = 'round';
  for (let i = 1; i < pts.length; i++) {
    g.lineWidth = w0 + (w1 - w0) * (i / pts.length);
    g.beginPath();
    g.moveTo(pts[i - 1][0], pts[i - 1][1]);
    g.lineTo(pts[i][0], pts[i][1]);
    g.stroke();
  }
}

// small florets for meadow flowers, painted grey and tinted per season in the grass shader
function florets(size = 128) {
  const [c, g] = canvas(size);
  const R = rng(61);
  const S = size / 128;
  for (let i = 0; i < 26; i++) {
    const rr = Math.pow(R.next(), 0.7) * 44 * S, a = R.next() * 6.283;
    const x = 64 * S + Math.cos(a) * rr, y = 64 * S + Math.sin(a) * rr;
    const r = R.range(5, 8) * S;
    const v = R.range(170, 250) | 0;
    g.fillStyle = `rgb(${v},${v},${v})`;
    for (let p = 0; p < 4; p++) {
      const pa = (p / 4) * 6.283 + a;
      g.beginPath();
      g.ellipse(x + Math.cos(pa) * r * 0.45, y + Math.sin(pa) * r * 0.45, r * 0.42, r * 0.3, pa, 0, 6.283);
      g.fill();
    }
  }
  return toTexture(c);
}

function leafShape(g, len, wid) {
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(wid, -len * 0.25, wid * 0.8, -len * 0.75, 0, -len);
  g.bezierCurveTo(-wid * 0.8, -len * 0.75, -wid, -len * 0.25, 0, 0);
  g.fill();
}

function bambooLeaves(size = 512) {
  const [c, g] = canvas(size);
  const R = rng(55);
  const S = size / 512;
  for (let k = 0; k < 8; k++) {
    const pts = twig(R, R.range(80, 430) * S, R.range(80, 460) * S, R.range(0, 6.28), R.range(80, 160) * S, 5);
    strokeTwig(g, pts, 2.2 * S, 1 * S, '#3c3c3c');
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i];
      const n = R.int(2, 4);
      for (let j = 0; j < n; j++) {
        const v = R.range(120, 215) | 0;
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.save();
        g.translate(x, y);
        g.rotate(R.range(-3.1, 3.1));
        leafShape(g, R.range(55, 85) * S, R.range(6, 9) * S);
        g.restore();
      }
    }
  }
  return toTexture(c);
}

export async function createFoliageTextures() {
  const atlas = (k) => [tex(`./assets/foliage/${k}_c.ktx2`, true, false), tex(`./assets/foliage/${k}_n.ktx2`, false, false)];
  const [blossom, blossomN] = atlas('blossom'), [leaves, leavesN] = atlas('leaves'), [maple, mapleN] = atlas('maple'), [pine, pineN] = atlas('pine');
  const [karikomi, karikomiN] = atlas('karikomi'), [karikomiBloom, karikomiBloomN] = atlas('karikomiBloom'), [sugi, sugiN] = atlas('sugi');
  const [umbel, umbelN] = atlas('umbel'), [sasa, sasaN] = atlas('sasa');
  const sasaC = tex('./assets/foliage/sasaC_c.ktx2', true, false);
  return {
    blossom, blossomN, umbel, umbelN, leaves, leavesN, maple, mapleN, pine, pineN, karikomi, karikomiN, karikomiBloom, karikomiBloomN, sugi, sugiN,
    sasa, sasaN, sasaC,
    bamboo: bambooLeaves(512),
    florets: florets(128),
  };
}

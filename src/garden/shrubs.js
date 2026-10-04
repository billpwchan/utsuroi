// Karikomi: azaleas clipped into soft mounds that echo the hills beyond the wall. The clipped face is a mat of
// leaf cards (scanned satsuki rosettes) laid along the surface two or three deep; the lumpy core under them is the
// bush's dark interior, seen only in the gaps. Satsuki bloom in patches in spring; the dodan among them turn
// scarlet in autumn.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patch } from '../core/shared.js';
import { tex } from '../core/assets.js';
import { Builder } from '../lib/geo.js';
import { leafMaterial } from './trees.js';
import { heightAt } from './site.js';
import { rng, fbm } from '../lib/math.js';

export const SHRUBS = [
  // [x, z, radius, height, lobes]
  [1.4, 3.5, 1.1, 0.75, 3], [4.7, 4.3, 0.9, 0.6, 2], [-6.4, 4.7, 1.0, 0.7, 3], [-0.9, 3.6, 0.6, 0.45, 1],
  [-12.2, 8.5, 1.3, 0.85, 4], [-16.4, 9.7, 1.0, 0.7, 3], [-10.6, 11.7, 0.9, 0.6, 2], [-17.6, 13.0, 1.4, 0.9, 4],
  [-24.4, 14.9, 1.1, 0.75, 3], [-18.4, 16.1, 0.9, 0.6, 2], [-26.6, 10.2, 1.2, 0.8, 3],
  [-6.0, 15.9, 1.3, 0.8, 4], [-1.0, 15.7, 1.0, 0.65, 3], [7.6, 15.7, 1.4, 0.85, 4], [13.6, 13.4, 1.1, 0.7, 3],
  [9.1, 9.8, 0.8, 0.55, 2], [21.6, 1.2, 0.9, 0.6, 2], [22.6, 12.5, 1.2, 0.75, 3],
  [-14.0, 3.3, 0.7, 0.5, 2], [-7.9, 2.9, 0.55, 0.42, 1], [-1.55, -4.9, 0.55, 0.45, 2],
  [-27.5, -4.5, 1.2, 0.8, 3], [-28.5, -11.0, 1.1, 0.75, 3], [3.0, -10.5, 1.1, 0.7, 3], [-10.5, -9.6, 1.2, 0.8, 3],
];

export function createShrubs(ftex) {
  const R = rng(2024);
  const cores = [];
  const cards = new Builder(2);
  const T = new THREE.Vector3(), B = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  for (const [x, z, r, h, lobes] of SHRUBS) {
    const y = heightAt(x, z) - 0.05;
    const blobs = [[0, 0, 1, 1]];
    for (let i = 1; i < lobes; i++) {
      const a = R() * Math.PI * 2;
      blobs.push([Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, R.range(0.55, 0.8), R.range(0.6, 0.85)]);
    }
    for (const [ox, oz, sr, sh] of blobs) {
      const g = new THREE.IcosahedronGeometry(1, 3);
      const p = g.attributes.position;
      const rr = r * sr, hh = h * sh;
      for (let i = 0; i < p.count; i++) {
        let vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
        // a clipped dome: flattened base, slightly squared shoulders, lumps where the shears missed
        // clipped in cushions: broad swells where each year's growth was sheared back, finer lumps on them
        const lump = 1 + fbm(vx * 1.3 + x, vz * 1.3 + vy * 1.1 + z, 3) * 0.12 + fbm(vx * 4.2 + z, vz * 4.2 + vy * 3.1 + x, 2) * 0.035;
        vy = vy < 0 ? vy * 0.15 : Math.pow(vy, 0.85);
        p.setXYZ(i, x + ox + vx * rr * lump, y + vy * hh * lump, z + oz + vz * rr * lump);
      }
      g.deleteAttribute('uv');
      g.computeVertexNormals();
      cores.push(g);
      // the clipped face: cards about 0.18 m across, nearly tangent to the surface, covering it ~2.5 deep
      const n = Math.round(2 * Math.PI * rr * hh * 2.5 / 0.016);
      for (let i = 0; i < n; i++) {
        const u = R.range(-0.15, 1), a = R() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        const d = new THREE.Vector3(Math.cos(a) * s, u, Math.sin(a) * s);
        const lump = 1 + fbm(d.x * 1.3 + x, d.z * 1.3 + d.y * 1.1 + z, 3) * 0.12 + fbm(d.x * 4.2 + z, d.z * 4.2 + d.y * 3.1 + x, 2) * 0.035;
        const out = lump * R.range(0.99, 1.045);
        const c = new THREE.Vector3(x + ox + d.x * rr * out, y + Math.pow(Math.max(0, d.y), 0.85) * hh * out, z + oz + d.z * rr * out);
        const nrm = d.clone().add(new THREE.Vector3(R.range(-0.35, 0.35), R.range(-0.25, 0.35), R.range(-0.35, 0.35))).normalize();
        T.crossVectors(nrm, Math.abs(nrm.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
        B.crossVectors(nrm, T).normalize();
        cards.card(c, T, B, R.range(0.08, 0.1), d.clone().add(UP.clone().multiplyScalar(0.4)).normalize(), [0.85 + 0.15 * R(), R()]);
      }
    }
  }
  const core = mergeGeometries(cores, false);
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  patch(coreMat, {
    key: 'karikomi', snow: 1, wrap: 0.3,
    uniforms: { tHedge: { value: tex('./assets/tex/hedge_c.ktx2', true) }, tHedgeN: { value: tex('./assets/tex/hedge_n.ktx2') } },
    fragHead: 'uniform sampler2D tHedge, tHedgeN;',
    hooks: {
      map: /* glsl */ `
        // a photographed clipped hedge, projected from the three axes and blended by the mound's normal
        vec3 sfTw = pow(abs(inverseTransformDirection(normalize(vNormal), viewMatrix)), vec3(4.0));
        sfTw /= sfTw.x + sfTw.y + sfTw.z;
        vec3 sfTp = vSfWP / 0.5;
        {
          vec4 h = texture2D(tHedge, sfTp.zy) * sfTw.x + texture2D(tHedge, sfTp.xz) * sfTw.y + texture2D(tHedge, sfTp.xy) * sfTw.z;
          float lum = dot(h.rgb, vec3(0.3, 0.55, 0.15));
          float patchN = sfNoise(vSfWP.xz * 1.1 + vSfWP.y) * 0.6 + sfNoise(vSfWP.xz * 3.7) * 0.4;
          // the photo is privet in full sun: deepen and cool it to clipped satsuki
          vec3 g = h.rgb * vec3(0.27, 0.36, 0.22) * (0.78 + 0.44 * patchN);
          // spring: new shoots on the sunlit top, lighter and yellower
          float shoot = smoothstep(0.55, 0.85, lum) * smoothstep(0.2, 0.8, sfTw.y);
          g = mix(g, h.rgb * vec3(0.5, 0.58, 0.26), shoot * (0.45 * uSeason.x + 0.12 * uSeason.y));
          // the dodan among them turn scarlet in autumn; winter browns the exposed leaves
          float dodan = smoothstep(0.45, 0.6, sfNoise(vSfWP.xz * 0.6 + 3.3));
          g = mix(g, lum * vec3(0.95, 0.16, 0.05), uSeason.z * dodan * 0.85);
          g = mix(g, lum * vec3(0.3, 0.27, 0.12), uSeason.w * 0.45);
          // the scan's occlusion: gaps between the leaves fall into the bush's own dark; the core is the interior
          // under the leaf mat, so all of it sits in shade
          g *= mix(0.3, 1.0, h.a) * 0.55;
          diffuseColor.rgb = g;
        }`,
      normal: /* glsl */ `
        {
          vec3 wn = inverseTransformDirection(normal, viewMatrix);
          vec3 nx = texture2D(tHedgeN, sfTp.zy).xyz * 2.0 - 1.0, ny = texture2D(tHedgeN, sfTp.xz).xyz * 2.0 - 1.0, nz = texture2D(tHedgeN, sfTp.xy).xyz * 2.0 - 1.0;
          // whiteout blend: each projection's tangent normal swizzled into world axes
          nx = vec3(nx.xy * 0.9 + wn.zy, abs(nx.z) * wn.x);
          ny = vec3(ny.xy * 0.9 + wn.xz, abs(ny.z) * wn.y);
          nz = vec3(nz.xy * 0.9 + wn.xy, abs(nz.z) * wn.z);
          wn = normalize(nx.zyx * sfTw.x + ny.xzy * sfTw.y + nz.xyz * sfTw.z);
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }`,
    },
  });
  const coreMesh = new THREE.Mesh(core, coreMat);
  coreMesh.castShadow = true;
  coreMesh.receiveShadow = true;
  coreMesh.name = 'karikomi';
  const lm = leafMaterial({ key: 'karikomi-leaf', map: ftex.karikomi, normal: ftex.karikomiN, blossom: ftex.karikomiBloom, blossomNormal: ftex.karikomiBloomN, bloomFrac: 0.27, stiff: 0.08, colors: [[0.13, 0.22, 0.05], [0.095, 0.18, 0.045], [0.36, 0.07, 0.02], [0.085, 0.095, 0.045], [0.145, 0.17, 0.045]], presence: [1, 1, 1, 1], transl: 0.4, snow: 1 });
  const cardMesh = new THREE.Mesh(cards.build(), lm.material);
  // the sprigs sit a few centimetres proud of the clipped surface: their shadows would print on it as dark
  // stamps, so the mound alone casts
  cardMesh.castShadow = false;
  cardMesh.receiveShadow = true;
  cardMesh.userData.bake = { coverage: 0.4 };
  cardMesh.name = 'karikomi-leaves';
  const group = new THREE.Group();
  group.name = 'shrubs';
  group.add(coreMesh, cardMesh);
  return group;
}

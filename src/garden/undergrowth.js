// The floor of the woods round the wall: kumazasa in broad drifts, knee to waist high, the way it carpets the
// shade under Kyoto's sugi. Each culm holds its fan of leaves at the top, a little tilted, and often an older fan
// lower down turned out to the side: one card each, a scanned shoot (scripts/twigs.html 'sasa'), so the drift is
// shoots at different heights a few layers deep, lower and sparser at its edges. Kept off the approach, the gate's forecourt and the trunks. Cut into tiles so
// the view culls what it cannot see.
import * as THREE from 'three';
import { Builder } from '../lib/geo.js';
import { patch } from '../core/shared.js';
import { leafMaterial } from './trees.js';
import { LAYER_NOREFL } from '../core/pipeline.js';
import { heightAt, wallOut, approachD, houseD, pathsD, waterD, kareD, ROJI, GATE } from './site.js';
import { SHRUBS } from './shrubs.js';
import { rng, vnoise } from '../lib/math.js';

const TILE = 20;

// inside the wall, a tended bed of it along the wall's foot where the garden leaves room: not behind the house
// (the bamboo has that), nor at the gate, the paths, the water, the gravel or the clipped azaleas
function bedDensity(x, z, out) {
  if (out < -3.2 || out > -0.45) return 0;
  const bed = Math.min(1, (-0.45 - out) / 0.5) * Math.min(1, (out + 3.2) / 1.2);
  if (z < -10.5 || (x > 18 && z < 0.5) || Math.hypot(x - GATE.x, z - GATE.z) < 3.4) return 0;
  if (houseD(x, z).d < 1.6 || pathsD(x, z) < 0.7 || waterD(x, z) < 0.8 || kareD(x, z) < 0.9) return 0;
  if (SHRUBS.some(([sx, sz, r]) => Math.hypot(sx - x, sz - z) < r + 0.5)) return 0;
  const n = vnoise(x * 0.11 + 5.3, z * 0.11 - 1.9) * 0.75 + vnoise(x * 0.4, z * 0.4 + 2.2) * 0.25;
  return bed * Math.min(1, Math.max(0, (n - 0.36) / 0.16));
}

export function sasaDensity(x, z) {
  const out = wallOut(x, z);
  if (out < 0.7) return bedDensity(x, z, out);
  const band = Math.min(1, (out - 0.7) / 1.2) * (1 - Math.min(1, Math.max(0, (out - 14) / 10)));
  const ap = Math.min(1, Math.max(0, (approachD(x, z) - 0.3) / 1.4));
  const gate = Math.min(1, Math.max(0, (Math.hypot(x + 21.5, (z - 19.5) * 0.8) - 2.6) / 1.5));
  const n = vnoise(x * 0.055 + 1.7, z * 0.055 - 2.3) * 0.7 + vnoise(x * 0.19 - 4.1, z * 0.19 + 0.6) * 0.3;
  const drift = Math.min(1, Math.max(0, (n - 0.24) / 0.2));
  return band * ap * gate * drift;
}

export function createUndergrowth(ftex, trunks) {
  const R = rng(4242);
  const UP = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
  const T = new THREE.Vector3(), B = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Vector3(), sh = new THREE.Vector3();
  // trunks: a coarse hash so each shoot checks only its neighbours
  const cell = new Map();
  const key = (i, j) => i * 4096 + j;
  for (const t of trunks) {
    const k = key(Math.floor(t.x / 4), Math.floor(t.z / 4));
    if (!cell.has(k)) cell.set(k, []);
    cell.get(k).push(t);
  }
  const nearTrunk = (x, z) => {
    const i = Math.floor(x / 4), j = Math.floor(z / 4);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      for (const t of cell.get(key(i + di, j + dj)) || []) if (Math.hypot(t.x - x, t.z - z) < t.r) return true;
    }
    return false;
  };
  const tiles = new Map();
  const SP = 0.2;
  const T0 = new THREE.Vector3(), B0 = new THREE.Vector3();
  // a card on the plane facing n, turned by a about it
  const frame = (a) => {
    T0.crossVectors(n, Math.abs(n.y) > 0.9 ? X : UP).normalize();
    B0.crossVectors(n, T0);
    T.copy(T0).multiplyScalar(Math.cos(a)).addScaledVector(B0, Math.sin(a));
    B.crossVectors(n, T);
  };
  for (let x = -80; x < 76; x += SP) {
    for (let z = -62; z < 58; z += SP) {
      const px = x + R.range(-0.45, 0.45) * SP, pz = z + R.range(-0.45, 0.45) * SP;
      const d = sasaDensity(px, pz);
      // a clone's edge is fairly clean: few strays out on the bare floor
      if (d < 0.12 || R() > 0.5 + 0.5 * d) continue;
      if (nearTrunk(px, pz)) continue;
      const tk = key(Math.floor(px / TILE), Math.floor(pz / TILE));
      if (!tiles.has(tk)) tiles.set(tk, new Builder(2));
      const b = tiles.get(tk);
      const y0 = heightAt(px, pz);
      // the garden's beds are cut back to knee height
      const h = (0.3 + 0.55 * d) * (0.8 + 0.4 * vnoise(px * 0.9, pz * 0.9)) * R.range(0.85, 1.12) * (wallOut(px, pz) < 0 ? 0.68 : 1);
      // the top fan: held near level, tipped toward wherever the culm leans
      n.set(R.range(-0.45, 0.45), 1, R.range(-0.45, 0.45)).normalize();
      frame(R() * Math.PI * 2);
      c.set(px, y0 + h, pz);
      sh.set(n.x * 0.5, 1, n.z * 0.5).normalize();
      b.card(c, T, B, 0.3 * R.range(0.85, 1.15), sh, [0.72 + 0.28 * R(), R()]);
      // last year's fan lower on the culm, turned out and down, in the drift's shade
      if (R() < 0.25 + 0.4 * d) {
        const a = R() * Math.PI * 2, f = R.range(0.5, 0.8);
        n.set(Math.cos(a), R.range(0.6, 1.4), Math.sin(a)).normalize();
        frame(R() * Math.PI * 2);
        c.set(px + Math.cos(a) * 0.06, y0 + h * f, pz + Math.sin(a) * 0.06);
        sh.set(n.x * 0.6, 0.8, n.z * 0.6).normalize();
        b.card(c, T, B, 0.27 * R.range(0.85, 1.1), sh, [0.2 + 0.45 * f, R()]);
      }
    }
  }
  const lm = leafMaterial({
    key: 'sasa', map: ftex.sasa, normal: ftex.sasaN, marginMap: ftex.sasaC, stiff: 0.6,
    colors: [[0.085, 0.17, 0.05], [0.065, 0.135, 0.042], [0.07, 0.12, 0.042], [0.06, 0.1, 0.04]],
    presence: [1, 1, 1, 1], transl: 0.5, snow: 1,
  });
  const group = new THREE.Group();
  group.name = 'undergrowth';
  for (const b of tiles.values()) {
    const m = new THREE.Mesh(b.build(), lm.material);
    m.geometry.computeBoundingSphere();
    // the fans are a few centimetres apart: their shadows on each other would be specks; the trees above shade them
    m.castShadow = false;
    m.receiveShadow = true;
    m.userData.bake = { skip: true };
    m.name = 'sasa';
    group.add(m);
  }
  return group;
}

// Ferns: a scanned sword fern's clump (Poly Haven fern_02, four plants), instanced. Where a garden puts them: at the
// foot of the roji's basin and its lantern, against the stones on the mounds, in the shade inside the north wall;
// beyond the wall, along its foot, the approach's verges and between the sasa drifts.
const ROCK_FEET = [[-13.4, 10.3, 1.7], [-15.7, 12.4, 1.2], [-9.4, 13.4, 1.35], [3.9, 12.9, 1.5], [5.8, 13.8, 1.0], [-24.0, 12.5, 1.3], [8.7, 3.4, 0.9], [-19.9, 10.6, 0.8]];

export function fernSpots() {
  const R = rng(3131);
  const spots = [];
  const inside = (x, z) => wallOut(x, z) < -0.7 && houseD(x, z).d > 1.0 && pathsD(x, z) > 0.4 && waterD(x, z) > 0.35 && kareD(x, z) > 0.5 && Math.hypot(x - ROJI.x, z - ROJI.z) > 0.85;
  const outside = (x, z) => wallOut(x, z) > 0.45 && approachD(x, z) > 0.25 && Math.hypot(x + 21.5, (z - 19.5) * 0.8) > 2.2;
  const ok = (x, z) => !spots.some((s) => Math.hypot(s.x - x, s.z - z) < 0.75);
  const add = (x, z, s) => { if (ok(x, z)) spots.push({ x, z, s, yaw: R() * Math.PI * 2, v: R.int(0, 3) }); };
  const around = (cx, cz, r0, r1, n, test, s0 = 0.85, s1 = 1.25) => {
    for (let i = 0, tries = 0; i < n && tries < n * 12; tries++) {
      const a = R() * Math.PI * 2, r = R.range(r0, r1), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (!test(x, z)) continue;
      add(x, z, R.range(s0, s1));
      i++;
    }
  };
  // the roji: its basin among ferns, as the old tea gardens have it
  around(ROJI.x, ROJI.z, 0.95, 1.6, 4, inside);
  for (const [x, z, size] of ROCK_FEET) around(x, z, size * 0.45, size * 0.85, size > 1.2 ? 3 : 2, inside, 0.75, 1.1);
  // inside the north wall, behind the house, where the sun hardly comes
  for (let x = -31; x < 26; x += R.range(1.2, 2.6)) {
    const z = -14.3 + R.range(0, 1.1);
    if (vnoise(x * 0.3, 4.2) < 0.4) continue;
    if (inside(x, z)) add(x, z, R.range(0.8, 1.2));
  }
  // beyond the wall
  for (let i = 0; i < 9000; i++) {
    const x = R.range(-75, 70), z = R.range(-58, 54);
    const out = wallOut(x, z);
    if (out < 0.45 || out > 26 || !outside(x, z)) continue;
    const foot = Math.max(0, 1 - Math.abs(out - 1.0) / 1.2), verge = Math.max(0, 1 - Math.abs(approachD(x, z) - 0.7) / 0.8);
    const between = 1 - Math.min(1, sasaDensity(x, z) * 2.5);
    const p = Math.max(foot * 0.7, verge * 0.8, between * 0.12) * (out > 14 ? 0.5 : 1);
    if (R() < p) add(x, z, R.range(0.9, 1.45));
  }
  return spots;
}

export function createFerns(model) {
  // the clump's plants were laid out side by side: each to its own origin, its base at 0
  const parts = model.parts.map((g) => {
    g = g.clone();
    g.computeBoundingBox();
    const b = g.boundingBox;
    g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    g.computeBoundingSphere();
    return g;
  });
  const m = new THREE.MeshStandardMaterial({ map: model.map, normalMap: model.normalMap, roughness: 0.72, side: THREE.DoubleSide, alphaTest: 0.5, alphaToCoverage: true });
  patch(m, {
    key: 'fern', snow: 0.8, wet: 0.7,
    hooks: {
      // fronds stir from the tips; the phase follows the angle round the crown so a frond moves as one
      vertex: /* glsl */ `
        {
          #ifdef USE_INSTANCING
            vec3 fRoot = instanceMatrix[3].xyz;
          #else
            vec3 fRoot = vec3(0.0);
          #endif
          float tip = clamp(length(position.xz) / 0.45, 0.0, 1.0) * clamp(position.y / 0.3, 0.2, 1.0);
          float ph = atan(position.z, position.x) * 2.0 + fRoot.x * 1.7 + fRoot.z * 2.3;
          transformed += vec3(sin(uTime * 2.1 + ph), sin(uTime * 1.7 + ph * 1.3) * 0.5, cos(uTime * 1.9 + ph)) * 0.025 * (0.35 + uWind.z) * tip * tip;
        }`,
      map: /* glsl */ `
        // evergreen: the fronds dull and brown a little through winter, the new ones bright in spring
        {
          float l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 1.12, 0.8), uSeason.x * 0.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(l) * vec3(1.1, 0.95, 0.6), uSeason.w * 0.35);
          diffuseColor.rgb *= 0.85;
        }`,
      light: /* glsl */ `
        {
          vec3 Vv = normalize(cameraPosition - vSfWP);
          float back = pow(max(dot(-Vv, uSunDir), 0.0), 2.5);
          float sh = 1.0;
          #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
            sh = sfSunShadow(0.002);
          #endif
          reflectedLight.directDiffuse += diffuseColor.rgb * uSunCol * back * 0.3 * sh;
        }`,
    },
  });
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: model.map, alphaTest: 0.5, side: THREE.DoubleSide });
  const spots = fernSpots();
  const group = new THREE.Group();
  group.name = 'ferns';
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  parts.forEach((g, vi) => {
    const mine = spots.filter((s) => s.v === vi);
    if (!mine.length) return;
    const im = new THREE.InstancedMesh(g, m, mine.length);
    mine.forEach((s, i) => {
      // seated a few centimetres in, leaning with the ground's fall and a little at random
      const gx = heightAt(s.x + 0.3, s.z) - heightAt(s.x - 0.3, s.z), gz = heightAt(s.x, s.z + 0.3) - heightAt(s.x, s.z - 0.3);
      q.setFromEuler(e.set(Math.atan2(gz, 0.6) * 0.6, s.yaw, -Math.atan2(gx, 0.6) * 0.6, 'YXZ'));
      im.setMatrixAt(i, m4.compose(ps.set(s.x, heightAt(s.x, s.z) - 0.03, s.z), q, sc.set(s.s, s.s * (0.9 + 0.2 * ((i * 0.618) % 1)), s.s)));
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = true;
    im.receiveShadow = true;
    im.customDepthMaterial = depth;
    im.userData.bake = { skip: true };
    // too low and too fine to tell in the pond's rippled mirror
    im.layers.set(LAYER_NOREFL);
    im.name = 'fern';
    group.add(im);
  });
  group.userData.count = spots.length;
  return group;
}

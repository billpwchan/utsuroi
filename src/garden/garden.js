// The garden, assembled: ground, water, stone, planting, structures, koi, and the borrowed landscape beyond.
import * as THREE from 'three';
import { createTerrain } from './terrain.js';
import { Reflection, createWater } from './water.js';
import { createRocks } from './rocks.js';
import { createGardenTrees, createFarForest, loadTreeScans } from './trees.js';
import { createFoliageTextures } from './foliage-tex.js';
import { createShrubs } from './shrubs.js';
import { createUndergrowth, createFerns } from './undergrowth.js';
import { createStructures, createPagoda, placeScans } from './structures.js';
import { createKoi } from './koi.js';
import { tex, loadModel } from '../core/assets.js';
import { heightAt, pondD, houseD, WALL, wallOut, approachD, COURT } from './site.js';
import { rng, vnoise } from '../lib/math.js';

export const PAGODA = { x: -265, z: 345 };

function specimens() {
  const T = [];
  const at = (sp, x, z, s = 1, yaw = 0, v) => T.push({ sp, x, y: heightAt(x, z) - 0.05, z, s, yaw, v });
  // a weeping cherry inside the gate, hanging over the path
  at('sacred', -15.4, 13.0, 1.0, 0.0);
  // momiji: over the water, on the mounds, framing the irigawa and the hearth room, one alone in the courtyard
  at('maple', -7.6, 4.4, 0.85, 0.3, 0);
  at('maple', -11.6, 9.1, 1.0, 1.9, 1);
  at('maple', -6.6, 12.6, 1.1, 4.0, 2);
  at('maple', 2.4, 12.4, 0.95, 2.6, 3);
  at('maple', 7.0, 10.2, 0.85, 5.1, 0);
  at('maple', -17.4, 6.0, 0.8, 0.9, 1);
  at('maple', -24.8, 8.2, 0.95, 3.3, 2);
  at('maple', 8.3, 3.9, 0.62, 1.4, 3);
  at('maple', -2.73, -2.6, 0.4, 0.7, 2);
  at('maple', 16.2, 11.8, 0.9, 2.0, 1);
  at('maple', -28.5, 15.0, 1.0, 1.0, 0);
  // cloud-pruned black pines: leaning over the pond, by the gate, in the corner of the dry garden
  at('pine', -0.6, 4.4, 0.62, 2.6, 0);
  at('pine', -24.6, 15.6, 0.72, 0.4, 1);
  at('pine', 20.6, 6.6, 0.66, 4.1, 2);
  at('pine', -28.0, -1.5, 0.8, 1.2, 0);
  // bamboo behind the bath and along the north boundary
  const R = rng(77);
  for (let i = 0; i < 70; i++) {
    const x = R.range(18.6, 26.4), z = R.range(-14.4, -0.5);
    at('bamboo', x, z, R.range(0.75, 1.05), R() * 6.28);
  }
  for (let i = 0; i < 45; i++) {
    const x = R.range(-31.4, 26), z = R.range(-14.5, -11.2);
    if (x > -6 && x < 2) continue;
    at('bamboo', x, z, R.range(0.7, 1.0), R() * 6.28);
  }
  // a grove closes overhead: the north strip planted as thick as the east (its own sequence, so the trees placed
  // after keep their places)
  const B = rng(7070);
  for (let i = 0; i < 55; i++) {
    const x = B.range(-31.4, 26), z = B.range(-14.5, -11.2);
    if (x > -6 && x < 2) continue;
    at('bamboo', x, z, B.range(0.7, 1.0), B() * 6.28);
  }
  // beyond the wall: tall sugi to the north, broadleaf to the east and south-east, a few keyaki to the west
  for (let i = 0; i < 46; i++) {
    const x = R.range(-48, 44), z = R.range(-34, -17);
    at('cedar', x, z, R.range(0.85, 1.25), R() * 6.28);
  }
  for (let i = 0; i < 14; i++) at('broad', R.range(29, 44), R.range(-12, 24), R.range(0.9, 1.3), R() * 6.28);
  for (let i = 0; i < 12; i++) at('broad', R.range(-50, -34), R.range(-12, 22), R.range(0.9, 1.3), R() * 6.28);
  // the lane outside the gate stays open: nothing within reach of the approach
  const lane = (x, z) => Math.abs(x + 21.5) < 7.5 && z < 30;
  for (let i = 0; i < 10; i++) { const x = R.range(-30, 30), z = R.range(21, 32), s = R.range(0.8, 1.1), y = R() * 6.28; if (!lane(x, z)) at('cedar', x, z, s, y); }
  for (let i = 0; i < 8; i++) { const x = R.range(-28, 20), z = R.range(19.5, 26), s = R.range(0.9, 1.2), y = R() * 6.28; if (!lane(x, z)) at('sakura', x, z, s, y); }
  // the woods around the property: real trees out to where the far forest takes over, so the skyline above the
  // wall is leaves and needles rather than the far forest's simplified crowns
  const W = rng(4040);
  const ring = (sp, n, x0, x1, z0, z1, s0, s1) => {
    for (let i = 0; i < n; i++) {
      const x = W.range(x0, x1), z = W.range(z0, z1), s = W.range(s0, s1), y = W() * 6.28;
      if (!lane(x, z)) at(sp, x, z, s, y);
    }
  };
  ring('broad', 14, -62, 56, 27, 50, 0.95, 1.4);
  ring('cedar', 12, -62, 56, 30, 55, 0.9, 1.3);
  ring('broad', 10, 45, 68, -42, 52, 0.95, 1.4);
  ring('cedar', 6, 48, 70, -45, 55, 0.9, 1.3);
  ring('broad', 10, -78, -50, -42, 52, 0.95, 1.4);
  ring('cedar', 6, -80, -52, -45, 55, 0.9, 1.3);
  ring('cedar', 16, -70, 66, -58, -36, 0.9, 1.3);
  return T;
}

function farPoints(specs) {
  const R = rng(9);
  const pts = [];
  // the woods close round the wall: a jittered grid out to where the far forest begins, sugi in the north and mixed
  // with evergreen broadleaf elsewhere, so the canopy closes over the floor (seen from the bath walk and from above).
  // The approach keeps its verges and the gate a small forecourt; nothing stands where a specimen already does.
  const F = rng(515), SP = 5.2;
  for (let x = WALL.x0 - 45; x < WALL.x1 + 45; x += SP) {
    for (let z = WALL.z0 - 45; z < WALL.z1 + 40; z += SP) {
      const px = x + F.range(-0.42, 0.42) * SP, pz = z + F.range(-0.42, 0.42) * SP;
      const out = wallOut(px, pz);
      if (out < 6 + F() * 3) continue;
      if (approachD(px, pz) < 2.6 || (Math.abs(px + 21.5) < 6.5 && pz < 27)) continue;
      if (specs.some((t) => Math.hypot(t.x - px, t.z - pz) < 3.6)) continue;
      // glades: here and there the canopy opens
      if (vnoise(px * 0.045 + 3.1, pz * 0.045) < 0.24) continue;
      const north = pz < WALL.z0 - 4;
      const conifer = F() < (north ? 0.88 : 0.62);
      if (!conifer && F() < 0.4) continue;
      // broadleaves stand under the sugi, not level with them
      pts.push({ x: px, y: heightAt(px, pz) - 0.6, z: pz, k: conifer ? 0 : 1, v: pts.length + 20000, s: conifer ? F.range(17, 25) : F.range(9, 14), w: F.range(0.85, 1.15), yaw: F() * 6.28, fill: true });
    }
  }
  // the understorey: young evergreens between the trunks, so the eye does not run through the wood to its far side
  const G = rng(717), fill = pts.slice();
  for (let x = WALL.x0 - 40; x < WALL.x1 + 40; x += SP) {
    for (let z = WALL.z0 - 40; z < WALL.z1 + 36; z += SP) {
      const px = x + SP * 0.5 + G.range(-0.35, 0.35) * SP, pz = z + SP * 0.5 + G.range(-0.35, 0.35) * SP;
      if (G() < 0.45) continue;
      if (wallOut(px, pz) < 4.5 + G() * 2) continue;
      if (approachD(px, pz) < 2.2 || (Math.abs(px + 21.5) < 5.5 && pz < 26)) continue;
      if (specs.some((t) => Math.hypot(t.x - px, t.z - pz) < 3.2) || fill.some((t) => Math.hypot(t.x - px, t.z - pz) < 2.2)) continue;
      pts.push({ x: px, y: heightAt(px, pz) - 0.3, z: pz, k: 1, v: pts.length + 30000, s: G.range(4.5, 8), w: G.range(0.85, 1.15), yaw: G() * 6.28, fill: true });
    }
  }
  for (let i = 0; i < 9000; i++) {
    const r = 60 + Math.pow(R(), 1.6) * 1500;
    const a = R() * Math.PI * 2;
    const x = Math.cos(a) * r - 2, z = Math.sin(a) * r + 2;
    if (x > WALL.x0 - 45 && x < WALL.x1 + 45 && z > WALL.z0 - 45 && z < WALL.z1 + 40) continue;
    // leave a clearing round the pagoda
    if (Math.hypot(x - PAGODA.x, z - PAGODA.z) < 26) continue;
    const y = heightAt(x, z);
    const conifer = R() < 0.35 + Math.min(0.5, y / 300);
    pts.push({ x, y: y - 1, z, k: conifer ? 0 : 1, v: i, s: R.range(13, 22) * (conifer ? 1.25 : 1), w: R.range(0.8, 1.2), yaw: R() * 6.28 });
  }
  return pts;
}

export async function createGarden(materials, sky, lamps) {
  const group = new THREE.Group();
  group.name = 'garden';
  const terrain = await createTerrain();
  group.add(terrain.group);
  const reflection = new Reflection(sky);
  const water = createWater(reflection, { x0: -11.5, x1: 8.5, z0: -5.0, z1: 12.5 });
  group.add(water.mesh);
  const rocks = await createRocks();
  group.add(rocks);
  const barkIds = ['sakura_bark', 'pine_bark', 'japanese_cedar_bark', 'trident_maple_bark'];
  const barks = {};
  for (const id of barkIds) {
    barks[id + '_c'] = tex(`./assets/tex/${id}_c.ktx2`, true);
    barks[id + '_n'] = tex(`./assets/tex/${id}_n.ktx2`);
  }
  const ftex = await createFoliageTextures();
  await loadTreeScans();
  const specs = specimens();
  const trees = createGardenTrees(barks, ftex, specs);
  group.add(trees);
  terrain.setCanopy(trees, specs.filter((t) => t.sp === 'bamboo'));
  const farPts = farPoints(specs);
  const far = createFarForest(farPts, trees.userData.species);
  group.add(far);
  reflection.swap.push(far.userData.mirrorSwap, trees.userData.mirrorSwap);
  const under = createUndergrowth(ftex, [...farPts.filter((p) => p.fill).map((p) => ({ x: p.x, z: p.z, r: p.k ? 0.35 : 0.65 })), ...specs.map((t) => ({ x: t.x, z: t.z, r: t.sp === 'bamboo' ? 0.15 : 0.5 }))]);
  group.add(under);
  const ferns = createFerns(await loadModel('fern_02'));
  group.add(ferns);
  const shrubs = createShrubs(ftex);
  group.add(shrubs);
  const st = createStructures(materials, lamps);
  // the pond shows a lamp's highlight only for the stone lanterns out in the garden. The rooms' lamps and the
  // courtyard's lantern are hidden from it by walls and paper; their light reaches the water as the lit shoji in the
  // mirror, and adding them again as bare points put five glaring blobs on the night pond
  lamps.forEach((l, i) => {
    const inCourt = l.p[0] > COURT.x0 && l.p[0] < COURT.x1 && l.p[2] > COURT.z0 && l.p[2] < COURT.z1;
    water.uniforms.uLampSeen.value[i] = l.kind === 'toro' && !inCourt ? 1 : 0;
  });
  await placeScans(st);
  group.add(st.group);
  const pagoda = createPagoda(materials);
  pagoda.position.set(PAGODA.x, heightAt(PAGODA.x, PAGODA.z) - 1, PAGODA.z);
  pagoda.rotation.y = 0.3;
  group.add(pagoda);
  const koi = await createKoi(water.uniforms);
  group.add(koi.mesh);
  return { group, terrain, water, reflection, rocks, trees, far, under, ferns, shrubs, structures: st, pagoda, koi, ftex };
}

export { pondD, houseD };

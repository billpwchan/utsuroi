// Utsuroi — boot, world assembly and the frame loop.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Pipeline } from './core/pipeline.js';
import { U, lightmapVariant } from './core/shared.js';
import { setAnisotropy, setRenderer, progress, loaded, tex } from './core/assets.js';
import { bakeVisibility } from './core/bake.js';
import { lightmapMeshes, layoutLightmap, applyLightmap, updateLightmap } from './core/lightmap.js';
import { Environment } from './env/environment.js';
import { Sky, makeSkyFx } from './env/sky.js';
import { makeMaterials } from './house/materials.js';
import { House } from './house/house.js';
import { createProps, createBathWater } from './house/props.js';
import { placeScans } from './garden/structures.js';
import { createGarden } from './garden/garden.js';
import { Journey, STOPS } from './journey/journey.js';
import { createParticles } from './fx/particles.js';
import { Sound } from './audio/sound.js';
import { UI } from './ui/ui.js';

const params = new URLSearchParams(location.search);
// tools and deep links go straight in; everyone else sees the plan draw itself while the world loads
const direct = params.has('skip') || params.has('orbit') || params.has('stop');
const ui = new UI();
if (direct) ui.skip();
// bare frames for asset reviews
if (params.has('clean')) document.documentElement.classList.add('clean');
const loading = setInterval(() => ui.progress(0.04 + 0.86 * progress.value), 120);

const canvas = document.getElementById('c');
const pipe = new Pipeline(canvas);
const renderer = pipe.renderer;
setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
setRenderer(renderer);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.08, 4000);
camera.position.set(-6, 3.5, 22);

const env = new Environment();
const sky = new Sky();
pipe.setSky(sky, makeSkyFx());

// sun light: one shadow map fitted around what the camera looks at
const pondFrustum = new THREE.Frustum(), pondPV = new THREE.Matrix4();
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 1.6;
scene.add(sun, sun.target);
// the far sun: no light of its own, only a shadow map over the site and the woods round it, so the woods stand in
// their own shade past the near map's edge; drawn again only when the sun has moved by about a texel's worth
const sunFar = new THREE.DirectionalLight(0xffffff, 0);
sunFar.userData.far = true;
sunFar.castShadow = true;
sunFar.shadow.mapSize.set(4096, 4096);
sunFar.shadow.bias = -0.0006;
sunFar.shadow.normalBias = 0.12;
sunFar.shadow.radius = 1.6;
sunFar.shadow.autoUpdate = false;
scene.add(sunFar, sunFar.target);
const farSunDir = new THREE.Vector3(0, -1, 0);
function fitFarShadow() {
  const d = U.uSunDir.value;
  sunFar.target.position.set(-2, 0, 2);
  sunFar.position.set(-2, 0, 2).addScaledVector(d, 450);
  const c = sunFar.shadow.camera;
  c.left = -260; c.right = 260; c.top = 260; c.bottom = -260;
  c.near = 1; c.far = 950;
  c.updateProjectionMatrix();
  sunFar.updateMatrixWorld();
  sunFar.target.updateMatrixWorld();
  sunFar.shadow.needsUpdate = true;
  farSunDir.copy(d);
}
// drawn before the first frame: until its map exists, every lit shader would sample nothing through a shadow sampler
fitFarShadow();

const mats = makeMaterials();
const house = new House(mats).build();
scene.add(house.group);
const props = createProps(house, mats);
house.group.add(props.group);
scene.add(props.bedding);
await placeScans(house);
const lmT0 = performance.now();
const lmMeshes = lightmapMeshes(house.group);
const lmLayout = layoutLightmap(lmMeshes);
console.log('[ut] lightmap layout', (performance.now() - lmT0).toFixed(0), 'ms', lmMeshes.length, 'meshes', JSON.stringify(lmLayout));
const bathWater = createBathWater(house);
if (bathWater) scene.add(bathWater);

const lamps = [...house.lamps];
{
  const rooms = [[-22.75, -3.64, -15.47, 1.82], [-15.47, -5.46, -4.55, 1.82], [-0.91, -6.37, 8.19, 0.455], [8.19, -8.19, 16.38, -2.73], [-4.55, 0.455, -0.91, 1.82], [13.65, -7.28, 16.38, -2.73]];
  rooms.forEach((r, i) => pipe.vol.march.uniforms.uRooms.value[i].set(...r));
}
const garden = await createGarden(mats, sky, lamps);
ui.uncredit([...house.missing, ...garden.structures.missing]);
pipe.farCasters = garden.far;
scene.add(garden.group);
const particles = createParticles(house);
scene.add(particles.group);
const sound = new Sound();
pipe.reflection = garden.reflection;
pipe.resize();
console.log('[ut] lamps', lamps.length);
function setLamps(on) {
  for (let i = 0; i < 16; i++) {
    const l = lamps[i];
    if (!l) { U.uLampPos.value[i].set(0, -999, 0, 0.01); U.uLampCol.value[i].set(0, 0, 0); continue; }
    U.uLampPos.value[i].set(l.p[0], l.p[1], l.p[2], l.r);
    U.uLampCol.value[i].set(l.c[0], l.c[1], l.c[2]).multiplyScalar(l.i * on * 2.2);
  }
  props.mats.lampPaper.emissiveIntensity = on * 2.4;
}

// bake visibility
const t0 = performance.now();
const vis = bakeVisibility(renderer, [house.group, garden.rocks, garden.trees, garden.shrubs, garden.structures.group], { min: new THREE.Vector3(-34, -1.0, -17), max: new THREE.Vector3(28, 10.0, 22), voxel: 0.25, dirs: 128 });
console.log('[ut] bake', (performance.now() - t0).toFixed(0), 'ms', vis.dims);
U.tVisSky.value = vis.sky;
U.tVisGnd.value = vis.gnd;
U.uVolMin.value.copy(vis.min);
U.uVolInv.value.set(1 / vis.size.x, 1 / vis.size.y, 1 / vis.size.z);
// the woods round the property, coarser: their trunks stand in their own canopy's shade
const t1 = performance.now();
const visOut = bakeVisibility(renderer, [house.group, garden.trees, garden.far, garden.structures.group], { min: new THREE.Vector3(-110, -2, -95), max: new THREE.Vector3(100, 32, 110), voxel: 1.25, dirs: 96, packed: true });
console.log('[ut] bake outer', (performance.now() - t1).toFixed(0), 'ms', visOut.dims);
U.tVisOut.value = visOut.sky;
U.uVolOutMin.value.set(visOut.min.x, visOut.min.y, visOut.min.z, visOut.dims[2]);
U.uVolOutInv.value.set(1 / visOut.size.x, 1 / visOut.size.y, 1 / visOut.size.z);
const lm = params.has('nolm') ? null : await applyLightmap(lmMeshes, lmLayout, { U, tex, lightmapVariant });
// the sheet stays up until every map has arrived, so nothing is revealed half-textured
await loaded();
clearInterval(loading);
ui.progress(1);

const controls = (window.__ctl = new OrbitControls(camera, canvas));
controls.target.set(-6, 1.5, 0);
controls.enableDamping = true;
const journey = new Journey(camera, house);
const scrollEl = document.getElementById('scroll');
const scrollStops = () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  return max > 0 ? (scrollY / max) * (STOPS.length - 1) : 0;
};

const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null, lastEnvHour = -99;

function fitShadow(center, radius) {
  const d = U.uSunDir.value;
  sun.position.copy(center).addScaledVector(d, 60);
  sun.target.position.copy(center);
  const c = sun.shadow.camera;
  c.left = -radius; c.right = radius; c.top = radius; c.bottom = -radius;
  c.near = 1; c.far = 140;
  c.updateProjectionMatrix();
}

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  pipe.resize();
}
addEventListener('resize', resize);
resize();

const dbg = (window.__dbg = { vol: !params.has('novol'), adapt: !params.has('noadapt'), shaft: true, orbit: params.has('orbit'), stop: params.has('stop') ? +params.get('stop') : null });
controls.enabled = dbg.orbit;
if (params.has('season')) env.setSeason(+params.get('season'));
env.update(0, true);
let hours = +(params.get('h') || 9);
env.setHours(hours, true);
addEventListener('keydown', (e) => {
  if (e.key === '[' || e.key === ']') {
    hours = env.hours + (e.key === '[' ? -0.25 : 0.25);
    dbg.fixedHours = true;
    env.setHours(hours);
  }
});

// a postcard: the next frame as it leaves the renderer, before the page's own chrome
let captureReq = null;
ui.attach({ env, journey, camera, STOPS, sound, capture: () => new Promise((res) => { captureReq = res; }) });

let last = performance.now();
const clock = { t: 0 };
const _c = new THREE.Vector3(), _c2 = new THREE.Vector3();
function frame(now) {
  // freeze: time stands still, for comparing two renders of one moment
  const dt = dbg.freeze ? 0 : Math.min(0.1, (now - last) / 1000);
  last = now;
  clock.t += dt;
  U.uTime.value = clock.t;
  if (dbg.orbit) controls.update();
  else {
    journey.update(dt, dbg.stop !== null ? dbg.stop : scrollStops());
    if (!dbg.fixedHours) env.setHours(journey.hours, dbg.stop !== null);
  }
  env.update(dt);
  setLamps(env.lampOn);
  updateLightmap(lm, U, env.hours, U.uSunCol.value, env.keyIsSun);
  U.uLmLamp.value = env.lampOn;
  garden.koi.update(dt, clock.t, U.uSeason.value.w);
  garden.trees.userData.updateLod(camera.position);
  particles.update(U.uSeason.value, env.night);
  // environment map follows the time of day
  if (Math.abs(env.hours - lastEnvHour) > 0.08) {
    sky.renderPano(renderer, pipe.post.fs);
    if (envRT) envRT.dispose();
    envRT = pmrem.fromEquirectangular(sky.pano.texture);
    scene.environment = envRT.texture;
    lastEnvHour = env.hours;
  }
  sun.color.setRGB(1, 1, 1);
  sun.intensity = 0;
  // the patched materials light with uSunCol; the three light only provides the shadow map
  if (dbg.orbit) _c.copy(controls.target);
  else _c.copy(camera.position).addScaledVector(camera.getWorldDirection(_c2), 9);
  fitShadow(_c, 22);
  if (farSunDir.angleTo(U.uSunDir.value) > 0.004) fitFarShadow();
  sun.intensity = 1;
  sun.color.setRGB(U.uSunCol.value.x, U.uSunCol.value.y, U.uSunCol.value.z);
  pipe.post.composite.uniforms.uExposure.value = env.exposure;
  pipe.post.composite.uniforms.uAdapt.value = dbg.adapt ? 1 : 0;
  pipe.post.composite.uniforms.uTime.value = clock.t;
  pipe.post.composite.uniforms.uNightK.value = env.night;
  // white balance pulls hardest in plain daylight; dawn, dusk and moonlight keep their colour
  pipe.post.expMat.uniforms.uAWB.value = 0.08 + 0.22 * Math.min(1, Math.max(0, (env.sunY - 0.04) / 0.3));
  pipe.post.expMat.uniforms.uEyeMax.value = 2.5 + 37.5 * Math.min(1, Math.max(0, (env.sunY + 0.04) / 0.14));
  // the mirror pass costs as much as the view itself; skip it whenever the pond is out of frame
  camera.updateMatrixWorld();
  pondFrustum.setFromProjectionMatrix(pondPV.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  pipe.render(scene, camera, {
    shadow: true,
    reflect: pondFrustum.intersectsObject(garden.water.mesh),
    water: [garden.water],
    moving: true,
    dt,
    light: sun,
    sunDir: U.uTrueSun.value,
    shaftK: params.has("noshaft") ? 0 : 0.4 * (1 - env.night),
    vol: { on: dbg.vol, density: 0.00025 + 0.0005 * env.mist, dust: 0.01, moving: true },
  });
  if (captureReq) {
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    c.getContext('2d').drawImage(canvas, 0, 0);
    captureReq(c);
    captureReq = null;
  }
  pipe.govern(dt * 1000);
  if (sound.on) {
    camera.getWorldDirection(_c2);
    soundState.x = camera.position.x; soundState.z = camera.position.z;
    soundState.yaw = Math.atan2(_c2.x, -_c2.z);
    soundState.hours = env.hours; soundState.season = U.uSeason.value; soundState.night = env.night;
    soundState.moving = Math.abs(journey.vel) > 0.04;
    sound.update(dt, soundState);
  }
  ui.update();
  requestAnimationFrame(frame);
}
const soundState = { x: 0, z: 0, yaw: 0, hours: 6, season: U.uSeason.value, night: 0, moving: false };
window.__ut = { props, pipe, scene, camera, env, house, garden, controls, sky, U, THREE, journey, STOPS, ui, sound, particles, lm, lmMeshes };
// dev: the offline light bake's input (scripts/lightmap/export.mjs)
if (import.meta.env.DEV) window.__ut.bakeExport = async () => (await import('./dev/lmexport.js')).exportBake({ house, garden, lmMeshes, layout: lmLayout, lamps });
// the world renders behind the sheet from here on, so every shader is warm before it is revealed
requestAnimationFrame(frame);
if (!direct) {
  if (await ui.ready()) sound.start();
  ui.syncSound();
  await ui.open();
}

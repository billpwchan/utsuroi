// The pond and its stream: planar reflection (with the sky panorama behind the mirrored garden), refraction
// through the opaque scene, absorption by optical path, wind ripples, flow in the stream, rings where the koi
// rise, sun glitter and the columns of light under each lantern.
import * as THREE from 'three';
import { U, UNIFORMS_GLSL, NOISE, ATMOS, MAX_LAMPS } from '../core/shared.js';
import { LAYER_WATER, LAYER_FX, LAYER_LO } from '../core/pipeline.js';
import { WATER_Y, waterBounds } from './site.js';

function rippleTexture(size = 256, seed = 7) {
  const h = new Float32Array(size * size);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const waves = [];
  for (let i = 0; i < 56; i++) {
    const k = 1 + Math.floor(Math.pow(rnd(), 1.6) * 22);
    const a = rnd() * Math.PI * 2;
    const kx = Math.round(Math.cos(a) * k), ky = Math.round(Math.sin(a) * k);
    if (kx === 0 && ky === 0) continue;
    waves.push([kx, ky, rnd() * Math.PI * 2, Math.pow(Math.hypot(kx, ky), -1.25)]);
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 0;
      const u = (x / size) * Math.PI * 2, w = (y / size) * Math.PI * 2;
      for (const [kx, ky, ph, am] of waves) {
        const p = Math.sin(kx * u + ky * w + ph);
        v += am * (p - 0.35 * p * p * p);
      }
      h[y * size + x] = v;
    }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
      const d = h[((y - 1 + size) % size) * size + x], u = h[((y + 1) % size) * size + x];
      let nx = (l - r) * 1.6, ny = (d - u) * 1.6, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      data[i + 2] = (nz / len) * 255;
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

export class Reflection {
  constructor(sky) {
    this.sky = sky;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true, samples: 0 });
    this.cam = new THREE.PerspectiveCamera();
    this.textureMatrix = new THREE.Matrix4();
    this.planeY = WATER_Y;
    U.uWaterY.value = WATER_Y;
    this.active = true;
    this._n = new THREE.Vector3(0, 1, 0);
    this._v = new THREE.Vector3(); this._o = new THREE.Vector3(); this._r = new THREE.Matrix4(); this._l = new THREE.Vector3(); this._tg = new THREE.Vector3();
    this._plane = new THREE.Plane(); this._clip = new THREE.Vector4(); this._q = new THREE.Vector4();
    this._pv = new THREE.Matrix4(); this._p = new THREE.Vector4(); this._s = new THREE.Matrix4();
    this.bounds = waterBounds();
    this.whole = false; // debug: the whole image, to compare
    // [shown to the eye, shown to the mirror] pairs: detail the mirror cannot resolve, and its cheap stand-in
    this.swap = [];
  }
  // the water's box on the mirror's image in pixels, padded for the ripples' sway (up to 0.03 of the image), or null
  // for the whole image when a corner is behind the camera; an empty box means no water is in the picture
  region(cam) {
    const b = this.bounds, pv = this._pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    let x0 = 1, x1 = -1, y0 = 1, y1 = -1;
    for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) {
      const p = this._p.set(x, this.planeY, z, 1).applyMatrix4(pv);
      if (p.w < 0.01) return null;
      x0 = Math.min(x0, p.x / p.w); x1 = Math.max(x1, p.x / p.w);
      y0 = Math.min(y0, p.y / p.w); y1 = Math.max(y1, p.y / p.w);
    }
    const W = this.rt.width, H = this.rt.height, pad = 0.07;
    const px0 = Math.max(0, Math.floor(((x0 - pad) * 0.5 + 0.5) * W)), px1 = Math.min(W, Math.ceil(((x1 + pad) * 0.5 + 0.5) * W));
    const py0 = Math.max(0, Math.floor(((y0 - pad) * 0.5 + 0.5) * H)), py1 = Math.min(H, Math.ceil(((y1 + pad) * 0.5 + 0.5) * H));
    return { x: px0, y: py0, w: Math.max(0, px1 - px0), h: Math.max(0, py1 - py0) };
  }
  setSize(w, h) { this.rt.setSize(Math.max(1, w), Math.max(1, h)); }
  render(renderer, scene, camera) {
    if (!this.active) return;
    const cam = this.cam, n = this._n;
    const camPos = this._v.setFromMatrixPosition(camera.matrixWorld);
    const origin = this._o.set(0, this.planeY, 0);
    const view = camPos.clone().sub(origin).reflect(n).add(origin);
    view.y = 2 * this.planeY - camPos.y;
    this._r.extractRotation(camera.matrixWorld);
    const look = this._l.set(0, 0, -1).applyMatrix4(this._r).add(camPos);
    const target = this._tg.copy(look);
    target.y = 2 * this.planeY - look.y;
    cam.position.set(camPos.x, 2 * this.planeY - camPos.y, camPos.z);
    cam.up.set(0, 1, 0).applyMatrix4(this._r).reflect(n);
    cam.lookAt(target);
    cam.near = camera.near; cam.far = camera.far;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    // render only where the water can sample: the same projection narrowed to that box, drawn into it, so every
    // pixel inside comes out as it would from the whole image (and the culling narrows with it)
    const W = this.rt.width, H = this.rt.height;
    const reg = (!this.whole && this.region(cam)) || { x: 0, y: 0, w: W, h: H };
    if (!reg.w || !reg.h) return;
    const nx0 = (reg.x / W) * 2 - 1, nx1 = ((reg.x + reg.w) / W) * 2 - 1, ny0 = (reg.y / H) * 2 - 1, ny1 = ((reg.y + reg.h) / H) * 2 - 1;
    this._s.set(2 / (nx1 - nx0), 0, 0, -(nx1 + nx0) / (nx1 - nx0), 0, 2 / (ny1 - ny0), 0, -(ny1 + ny0) / (ny1 - ny0), 0, 0, 1, 0, 0, 0, 0, 1);
    cam.projectionMatrix.premultiply(this._s);
    // oblique near plane at the surface: nothing below the water is reflected
    this._plane.setFromNormalAndCoplanarPoint(n, origin.set(0, this.planeY - 0.03, 0));
    this._plane.applyMatrix4(cam.matrixWorldInverse);
    const clip = this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
    const pm = cam.projectionMatrix.elements;
    const q = this._q;
    q.x = (Math.sign(clip.x) + pm[8]) / pm[0];
    q.y = (Math.sign(clip.y) + pm[9]) / pm[5];
    q.z = -1.0;
    q.w = (1.0 + pm[10]) / pm[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    pm[2] = clip.x; pm[6] = clip.y; pm[10] = clip.z + 1.0; pm[14] = clip.w;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    cam.layers.mask = 1 | (1 << LAYER_LO);
    const bg = scene.background;
    scene.background = this.sky.pano.texture;
    scene.backgroundIntensity = 1;
    this.rt.viewport.set(reg.x, reg.y, reg.w, reg.h);
    this.rt.scissor.set(reg.x, reg.y, reg.w, reg.h);
    this.rt.scissorTest = true;
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    for (const [eye, mirror] of this.swap) { eye.visible = false; mirror.visible = true; }
    renderer.render(scene, cam);
    for (const [eye, mirror] of this.swap) { eye.visible = true; mirror.visible = false; }
    scene.background = bg;
  }
}

export function createWater(reflection, bounds) {
  const uniforms = {
    ...U,
    tReflect: { value: reflection.rt.texture },
    tScene: { value: null },
    tDepth: { value: null },
    tRipple: { value: rippleTexture() },
    uReflMat: { value: reflection.textureMatrix },
    uRes: { value: new THREE.Vector2(1, 1) },
    uNearFar: { value: new THREE.Vector2(0.1, 5000) },
    uRise: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -9, 0)) }, // x, z, start time, strength
    // which lamps the water may show as a highlight: those in the open (see garden.js)
    uLampSeen: { value: new Array(MAX_LAMPS).fill(0) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform mat4 uReflMat;
      varying vec3 vWP; varying vec4 vRefl; varying float vViewZ;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWP = wp.xyz;
        vRefl = uReflMat * wp;
        vec4 mv = viewMatrix * wp;
        vViewZ = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vWP; varying vec4 vRefl; varying float vViewZ;
      ${UNIFORMS_GLSL}
      ${NOISE}
      ${ATMOS}
      uniform sampler2D tReflect, tScene, tDepth, tRipple;
      uniform vec2 uRes, uNearFar;
      uniform vec4 uRise[6];
      uniform float uLampSeen[${MAX_LAMPS}];

      float linDepth(float d){
        float n = uNearFar.x, f = uNearFar.y;
        return 2.0 * n * f / (f + n - (d * 2.0 - 1.0) * (f - n));
      }
      vec2 rip(vec2 uv){ return texture2D(tRipple, uv).xy * 2.0 - 1.0; }

      void main(){
        vec3 wp = vWP;
        vec2 suv = gl_FragCoord.xy / uRes;
        float sceneZ = linDepth(texture2D(tDepth, suv).x);
        float thick = sceneZ - vViewZ;
        if (thick < 0.0) discard;

        // the stream runs south toward the pond; the pond itself is still but for the wind
        float inStream = smoothstep(4.6, 3.6, wp.z) * smoothstep(-1.2, -1.9, wp.x) * smoothstep(-4.4, -3.7, wp.x);
        vec2 flow = vec2(0.0, 1.0) * 0.55 * inStream;
        float T = uTime * 0.25;
        float p0 = fract(T), p1 = fract(T + 0.5);
        float bw = abs(p0 - 0.5) * 2.0;
        vec2 nA = rip((wp.xz - flow * p0 * 3.0) / 1.6) + rip((wp.xz - flow * p0 * 3.0) / 0.7 + 0.2) * 0.5;
        vec2 nB = rip((wp.xz - flow * p1 * 3.0) / 1.6 + 0.43) + rip((wp.xz - flow * p1 * 3.0) / 0.7 + 0.7) * 0.5;
        vec2 n = mix(nA, nB, bw) * inStream * 1.4;
        vec2 wdir = normalize(uWind.xy);
        vec2 wuv = wp.xz / 3.2 + wdir * uTime * 0.05;
        // catspaws: wind touches the pond in patches that drift across it
        float gust = smoothstep(0.35, 0.8, sfNoise(wp.xz * 0.18 - wdir * uTime * 0.25));
        n += (rip(wuv) * 0.35 + rip(wuv * 3.1 - wdir * uTime * 0.11) * 0.25) * (0.25 + uWind.z * (0.4 + 1.4 * gust));
        // rings where a koi rose
        for (int i = 0; i < 6; i++){
          vec4 r = uRise[i];
          float age = uTime - r.z;
          if (age < 0.0 || age > 4.0) continue;
          vec2 d = wp.xz - r.xy;
          float dl = length(d);
          float front = age * 0.32;
          float ring = sin((dl - front) * 38.0) * exp(-pow((dl - front) * 7.0, 2.0)) * (1.0 - age / 4.0) * r.w;
          n += d / max(dl, 1e-3) * ring * 1.3;
        }

        float dist = length(wp - cameraPosition);
        float strength = mix(0.35, 0.12, smoothstep(4.0, 40.0, dist));
        vec3 N = normalize(vec3(n.x * strength, 1.0, n.y * strength));
        vec3 V = normalize(cameraPosition - wp);
        float NdV = max(dot(N, V), 0.0);
        float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);

        vec2 ruv = vRefl.xy / vRefl.w + N.xz * 0.03 * smoothstep(0.0, 0.4, thick);
        vec2 rtx = 1.0 / vec2(textureSize(tReflect, 0));
        // still water is a mirror: the taps only smooth the half-resolution target's stair-steps (a wider blur
        // read as a milky film over the banks at a low angle)
        vec3 refl = texture2D(tReflect, ruv).rgb * 0.6
          + (texture2D(tReflect, ruv + rtx * vec2(0.5, 0.28)).rgb + texture2D(tReflect, ruv + rtx * vec2(-0.28, 0.5)).rgb
           + texture2D(tReflect, ruv + rtx * vec2(-0.5, -0.28)).rgb + texture2D(tReflect, ruv + rtx * vec2(0.28, -0.5)).rgb) * 0.1;

        vec2 off = N.xz * 0.04 * clamp(thick / 1.5, 0.0, 1.0);
        vec2 suv2 = suv + off;
        if (linDepth(texture2D(tDepth, suv2).x) < vViewZ) suv2 = suv;
        vec3 under = texture2D(tScene, suv2).rgb;
        float thick2 = max(linDepth(texture2D(tDepth, suv2).x) - vViewZ, 0.0);
        float path = thick2 * 1.2 + thick2 * max(V.y, 0.05) * 2.0;
        // a koi pond's water: green-brown with algae and tannin, the floor gone within a forearm's depth, the fish
        // showing near the top; never a pool's cyan or a jewel's emerald. Clearer in winter
        vec3 absorb = exp(-path * mix(vec3(3.1, 2.35, 4.0), vec3(2.0, 1.6, 2.6), uSeason.w));
        vec3 body = vec3(0.012, 0.0145, 0.008) * (uSkyL * 1.4 + uSunCol * 0.06 * max(uSunDir.y, 0.0)) * 2.0;
        vec3 water = under * absorb + body * (1.0 - exp(-path * 1.6));
        // over a bright shallow floor the bottom outshines the mirror; a full-strength reflection there reads as a
        // milky film along the banks
        vec3 col = mix(water, refl, F * mix(0.45, 1.0, smoothstep(0.03, 0.3, thick2)));

        vec3 L = uSunDir;
        vec3 H = normalize(L + V);
        float nh = max(dot(N, H), 0.0);
        col += uSunCol * (pow(nh, 900.0) * 22.0 + pow(nh, 260.0) * 0.07) * smoothstep(-0.02, 0.05, L.y);

        for (int i = 0; i < ${MAX_LAMPS}; i++){
          if (uLampSeen[i] < 0.5) continue;
          vec4 lp = uLampPos[i];
          vec3 Ld = lp.xyz - wp;
          float ld = length(Ld);
          if (ld > 30.0) continue;
          vec3 Hl = normalize(Ld / ld + V);
          col += uLampCol[i] * pow(max(dot(N, Hl), 0.0), 380.0) * 3.0 / (1.0 + ld * ld * 0.02);
        }
        // a thin bright line where the water meets stone, softening into the bank
        col = mix(under, col, smoothstep(0.0, 0.06, thick));
        col = sfAtmos(col, wp);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const { x0, x1, z0, z1 } = bounds;
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 1, 1).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((x0 + x1) / 2, WATER_Y, (z0 + z1) / 2);
  mesh.layers.set(LAYER_WATER);
  mesh.name = 'water';
  return { mesh, material: mat, uniforms };
}
export { LAYER_FX };

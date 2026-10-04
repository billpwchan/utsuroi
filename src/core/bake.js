// Sky / ground visibility volume, baked on the GPU at load.
// For each of N directions the occluders are rendered as an orthographic depth map looking back along it; every
// voxel then tests itself against those maps. Directions above the horizon that escape count toward sky visibility,
// those below it toward the open ground. Each volume stores the mean (x) and mean direction (yzw) of what is seen.
// Paper and foliage are partial occluders: they are dithered at their coverage so voxels average the right amount.
import * as THREE from 'three';
import { FullScreen } from './post.js';
import { LAYER_LO } from './pipeline.js';

const DEPTH_VERT = /* glsl */ `
  #include <common>
  #include <batching_pars_vertex>
  varying float vD;
  varying vec2 vUv;
  void main(){
    vUv = uv;
    #include <batching_vertex>
    #include <begin_vertex>
    #include <project_vertex>
    vD = -mvPosition.z;
  }`;
const DEPTH_FRAG = /* glsl */ `
  precision highp float;
  varying float vD;
  varying vec2 vUv;
  uniform float uCoverage;
  uniform sampler2D tAlpha;
  uniform float uUseAlpha;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main(){
    if (uUseAlpha > 0.5 && texture2D(tAlpha, vUv).a < 0.5) discard;
    if (h(gl_FragCoord.xy) > uCoverage) discard;
    gl_FragColor = vec4(vD, 0.0, 0.0, 1.0);
  }`;

export function bakeVisibility(renderer, roots, opts) {
  // packed: sky and ground in one texture, sky in the lower half of its depth, for a volume that must cost one sampler
  const { min, max, voxel = 0.25, dirs = 128, batch = 16, mapSize = 1024, packed = false } = opts;
  const size = new THREE.Vector3().subVectors(max, min);
  const nx = Math.ceil(size.x / voxel), ny = Math.ceil(size.y / voxel), nz = Math.ceil(size.z / voxel);
  const centre = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
  const radius = size.length() * 0.5 + 2;

  // directions: fibonacci sphere
  const D = [];
  for (let i = 0; i < dirs; i++) {
    const y = 1 - ((i + 0.5) / dirs) * 2;
    const r = Math.sqrt(1 - y * y);
    const a = i * Math.PI * (3 - Math.sqrt(5));
    D.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }

  // per-mesh depth materials (alpha-tested foliage keeps its cut-outs)
  const swaps = [];
  const shared = new THREE.ShaderMaterial({ vertexShader: DEPTH_VERT, fragmentShader: DEPTH_FRAG, uniforms: { uCoverage: { value: 1 }, tAlpha: { value: null }, uUseAlpha: { value: 0 } }, side: THREE.DoubleSide });
  const variants = new Map();
  const scene = new THREE.Scene();
  const parents = [];
  for (const root of roots) {
    parents.push([root, root.parent]);
    scene.add(root);
  }
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const b = o.userData.bake || {};
    swaps.push([o, o.material, o.visible]);
    if (b.skip) { o.visible = false; return; }
    const cov = b.coverage ?? 1;
    const am = o.material && o.material.alphaTest > 0 ? (o.material.alphaMap || o.material.map) : null;
    const key = cov + ':' + (am ? am.uuid : '-');
    let m = variants.get(key);
    if (!m) {
      m = shared.clone();
      m.uniforms.uCoverage.value = cov;
      m.uniforms.tAlpha.value = am;
      m.uniforms.uUseAlpha.value = am ? 1 : 0;
      variants.set(key, m);
    }
    o.material = m;
  });

  const depthRT = new THREE.WebGLArrayRenderTarget(mapSize, mapSize, batch, { type: THREE.FloatType, format: THREE.RedFormat, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const volOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  const skyRT = new THREE.WebGL3DRenderTarget(nx, ny, packed ? nz * 2 : nz, volOpts);
  const gndRT = packed ? skyRT : new THREE.WebGL3DRenderTarget(nx, ny, nz, volOpts);
  const zOff = packed ? nz : 0;
  for (const t of [skyRT, gndRT]) {
    t.texture.wrapS = t.texture.wrapT = t.texture.wrapR = THREE.ClampToEdgeWrapping;
  }

  const cam = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.1, radius * 2 + 4);
  cam.layers.enable(LAYER_LO);
  const mats = Array.from({ length: batch }, () => new THREE.Matrix4());
  const dirU = Array.from({ length: batch }, () => new THREE.Vector3());
  const posU = Array.from({ length: batch }, () => new THREE.Vector3());

  const acc = new THREE.ShaderMaterial({
    vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      precision highp sampler2DArray;
      uniform sampler2DArray tDepth;
      uniform mat4 uVP[${batch}];
      uniform vec3 uDir[${batch}], uPos[${batch}];
      uniform int uCount;
      uniform float uLayer, uVoxel, uInvN, uGround;
      uniform vec3 uMin;
      void main(){
        vec3 p = uMin + vec3(gl_FragCoord.xy, uLayer + 0.5) * uVoxel;
        vec4 acc = vec4(0.0);
        for (int k = 0; k < ${batch}; k++){
          if (k >= uCount) break;
          vec3 w = uDir[k];
          bool sky = w.y > 0.0;
          if (sky == (uGround > 0.5)) continue;
          vec4 c = uVP[k] * vec4(p, 1.0);
          vec2 uv = c.xy * 0.5 + 0.5;
          float stored = texture(tDepth, vec3(uv, float(k))).r;
          float dp = dot(uPos[k] - p, w);
          // empty texels clear to 0: nothing in the way
          bool vis = stored <= 0.0 || dp < stored + uVoxel * 0.35;
          if (vis) acc += vec4(1.0, w) * uInvN;
        }
        gl_FragColor = acc;
      }`,
    uniforms: {
      tDepth: { value: depthRT.texture },
      uVP: { value: mats }, uDir: { value: dirU }, uPos: { value: posU },
      uCount: { value: 0 }, uLayer: { value: 0 }, uVoxel: { value: voxel }, uInvN: { value: 1 / dirs }, uGround: { value: 0 },
      uMin: { value: min.clone() },
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    transparent: true,
  });
  const fs = new FullScreen();

  const prevRT = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevAuto = renderer.autoClear;
  const prevShadow = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = false;
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);
  for (let z = 0; z < (packed ? nz * 2 : nz); z++) { renderer.setRenderTarget(skyRT, z); renderer.clear(true, false, false); }
  if (!packed) for (let z = 0; z < nz; z++) { renderer.setRenderTarget(gndRT, z); renderer.clear(true, false, false); }

  for (let b0 = 0; b0 < dirs; b0 += batch) {
    const count = Math.min(batch, dirs - b0);
    for (let k = 0; k < count; k++) {
      const w = D[b0 + k];
      cam.position.copy(centre).addScaledVector(w, radius + 2);
      cam.up.set(Math.abs(w.y) > 0.95 ? 1 : 0, Math.abs(w.y) > 0.95 ? 0 : 1, 0);
      cam.lookAt(centre);
      cam.updateMatrixWorld(true);
      cam.updateProjectionMatrix();
      mats[k].multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      dirU[k].copy(w);
      posU[k].copy(cam.position);
      renderer.setRenderTarget(depthRT, k);
      renderer.clear(true, true, false);
      renderer.render(scene, cam);
    }
    acc.uniforms.uCount.value = count;
    for (const [t, g] of [[skyRT, 0], [gndRT, 1]]) {
      acc.uniforms.uGround.value = g;
      for (let z = 0; z < nz; z++) {
        acc.uniforms.uLayer.value = z;
        fs.mesh.material = acc;
        renderer.setRenderTarget(t, z + g * zOff);
        renderer.render(fs.mesh, fs.camera);
      }
    }
  }

  renderer.setRenderTarget(prevRT);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.autoClear = prevAuto;
  renderer.shadowMap.enabled = prevShadow;
  for (const [o, m, v] of swaps) { o.material = m; o.visible = v; }
  for (const [root, parent] of parents) { if (parent) parent.add(root); else scene.remove(root); }
  depthRT.dispose();
  for (const m of variants.values()) m.dispose();
  return { sky: skyRT.texture, gnd: gndRT.texture, min: min.clone(), size: new THREE.Vector3(nx * voxel, ny * voxel, nz * voxel), dims: [nx, ny, nz], targets: packed ? [skyRT] : [skyRT, gndRT] };
}

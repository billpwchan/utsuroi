// Frame orchestration: shadow -> mirror -> opaque (MSAA) -> sky (half res, behind geometry) -> copy with sky fill
// -> water and effects -> volumetric light -> bloom/adaptation -> composite. Owns the render scale governor.
import * as THREE from 'three';
import { Post, mk } from './post.js';
import { Volumetric } from '../fx/volumetric.js';
import { SSAO } from '../fx/ssao.js';

export const LAYER_FX = 2; // transparent effects, drawn after the opaque copy
export const LAYER_WATER = 1;
export const LAYER_NOREFL = 3; // opaque but skipped by the mirror pass
export const LAYER_LO = 4; // low-detail stand-ins, drawn only by the mirror, shadow and sky-bake passes
export const LAYER_SHADOW = 5; // casters drawn by nothing but the shadow pass

export class Pipeline {
  constructor(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true, alpha: false, preserveDrawingBuffer: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    // three picks shadow casters by the layers of whichever view camera happens to trigger the update (the mirror's
    // or the main one), so the casters are fixed here: everything solid, low-detail stand-ins included
    // The far sun's map is drawn only when it asks, and the far forest casts into it alone: in the near map it would
    // be drawn whole for a few metres of shade.
    const shadowRender = renderer.shadowMap.render.bind(renderer.shadowMap);
    this.farCasters = null;
    renderer.shadowMap.render = (lights, scene, camera) => {
      const sm = renderer.shadowMap, mask = camera.layers.mask;
      camera.layers.mask = (1 << 0) | (1 << LAYER_NOREFL) | (1 << LAYER_LO) | (1 << LAYER_SHADOW);
      // a map that does not exist yet is drawn at once: a lit shader would otherwise read an empty texture through
      // its shadow sampler (the mirror renders before the first frame asks for shadows)
      const near = lights.filter((l) => !l.userData.far), far = lights.filter((l) => l.userData.far && (l.shadow.needsUpdate || !l.shadow.map));
      if ((sm.needsUpdate || near.some((l) => !l.shadow.map)) && near.length) {
        if (this.farCasters) this.farCasters.visible = false;
        shadowRender(near, scene, camera);
        if (this.farCasters) this.farCasters.visible = true;
      }
      if (far.length) {
        sm.needsUpdate = true;
        shadowRender(far, scene, camera);
      }
      sm.needsUpdate = false;
      camera.layers.mask = mask;
    };
    renderer.autoClear = false;
    renderer.info.autoReset = false;
    renderer.setPixelRatio(1);
    this.renderer = renderer;
    this.canvas = canvas;

    const depthA = new THREE.DepthTexture(4, 4);
    depthA.type = THREE.UnsignedIntType;
    this.rtOpaque = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true, depthTexture: depthA, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    const depthB = new THREE.DepthTexture(4, 4);
    depthB.type = THREE.UnsignedIntType;
    this.rtMain = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true, depthTexture: depthB, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    this.post = new Post(renderer);
    this.vol = new Volumetric();
    this.ssao = new SSAO();
    this.aoOn = true;

    this.copyMat = mk(
      /* glsl */ `
      precision highp float;
      uniform sampler2D tColor, tDepth, tSky, tSkyFx, tAO;
      uniform float uAOK;
      varying vec2 vUv;
      void main(){
        float d = texture2D(tDepth, vUv).x;
        vec3 c = texture2D(tColor, vUv).rgb;
        // contact occlusion weighs on the dim, ambient-lit parts more than on surfaces in the sun
        float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float ao = texture2D(tAO, vUv).r;
        c *= mix(1.0, ao, uAOK * (1.0 - 0.55 * smoothstep(0.25, 1.6, lum)));
        if (d >= 0.99999) {
          vec4 s = texture2D(tSky, vUv);
          // sun disc, moon and stars come from the full-res dome, dimmed by cloud transmittance
          c = s.rgb + texture2D(tSkyFx, vUv).rgb * clamp(s.a - 1.0, 0.0, 1.0);
        }
        gl_FragColor = vec4(c, 1.0);
        gl_FragDepth = d;
      }`,
      { tColor: { value: null }, tDepth: { value: null }, tSky: { value: null }, tSkyFx: { value: null }, tAO: { value: null }, uAOK: { value: 0.9 } },
      { depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth }
    );

    this.scale = 1;
    this.maxScale = 1;
    this.minScale = 0.5;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.frameTimes = new Float32Array(90);
    this.ftIdx = 0;
    this.ftCount = 0;
    this.cooldown = 2;
    this.lockScale = false;
    this.probeWait = 2;
    this.clean = 0;
    this.lastProbe = -1e9;
    this.lastEase = -1e9;
    this.probing = false;
    this.preProbe = 1;
    this.step = 1.1;
    this.settle = 0;
    this.settleRun = 0;
    this.clock = 0;
    this._sorted = new Float32Array(90);
    this.frame = 0;
    this.sunUv = new THREE.Vector2();
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this.offUv = new THREE.Vector2(-9, -9);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.cssW = w; this.cssH = h;
    this.renderer.setSize(Math.round(w * this.dpr), Math.round(h * this.dpr), false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.applyScale();
  }

  applyScale() {
    const W = Math.max(2, Math.round(this.cssW * this.dpr * this.scale));
    const H = Math.max(2, Math.round(this.cssH * this.dpr * this.scale));
    this.W = W; this.H = H;
    this.rtOpaque.setSize(W, H);
    this.rtMain.setSize(W, H);
    this.post.setSize(W, H);
    this.vol.setSize(W, H);
    this.ssao.setSize(W, H);
    if (this.sky) this.sky.setSize(W, H);
    if (this.reflection) this.reflection.setSize(Math.round(W * 0.5), Math.round(H * 0.5));
    if (this.skyFx) this.skyFxRT.setSize(W, H);
  }

  // frame-time governor. Under vsync every frame reads as the refresh interval however much headroom the GPU has,
  // so the scale steps down on missed frames and, after a run of clean ones, probes back up; a probe that
  // costs frames doubles the wait before the next one and reaches half as far.
  govern(dtMs) {
    if (this.lockScale) return;
    this.clock += dtMs / 1000;
    // reallocating the targets stalls a few frames; those say nothing about the new scale, so they are not counted.
    // Counting starts after a run of clean frames. A probe that cannot produce that run within its settle time has
    // already failed; any other change just starts counting when the time runs out
    if (this.settle > 0) {
      this.settle -= dtMs / 1000;
      this.settleRun = dtMs < 19.5 ? this.settleRun + 1 : 0;
      if (this.settleRun < 15) {
        if (this.settle <= 0 && this.probing) this.probeFailed();
        return;
      }
      this.settle = 0;
    }
    this.frameTimes[this.ftIdx] = dtMs;
    this.ftIdx = (this.ftIdx + 1) % this.frameTimes.length;
    this.ftCount = Math.min(this.ftCount + 1, this.frameTimes.length);
    this.cooldown -= dtMs / 1000;
    if (this.ftCount < 45) return;
    const n = this.ftCount;
    // the unfilled tail sorts to the end, so the first n are the window in order
    const arr = this._sorted;
    for (let i = 0; i < arr.length; i++) arr[i] = i < n ? this.frameTimes[i] : Infinity;
    arr.sort();
    const p90 = arr[Math.floor(n * 0.9)];
    // a steady trickle of dropped frames reads as stutter even when most frames are on time
    let misses = 0;
    for (let i = n - 1; i >= 0 && arr[i] > 21; i--) misses++;
    // the target is 60 fps whatever the display; rAF timestamps jitter by a couple of ms around 16.7
    const over = p90 > 19.5 || misses > n * 0.03;
    this.clean = dtMs > 21 ? 0 : this.clean + dtMs / 1000;
    if (this.cooldown > 0) return;
    if (this.probing) {
      // the first full window after a probe decides it
      if (over) return this.probeFailed();
      this.probing = false;
      this.step = 1.1;
    } else if (over) {
      this.setScale(this.scale * 0.88);
    } else if (this.scale < this.maxScale && this.clean > this.probeWait && this.step > 1.015) {
      this.preProbe = this.scale;
      if (this.setScale(this.scale * this.step)) {
        this.probing = true;
        this.lastProbe = this.clock;
      }
    } else if (this.clock - this.lastProbe > 30 && this.clock - this.lastEase > 15) {
      // long enough at this scale that conditions may have changed: ease the wait, then allow full-size probes again
      this.lastEase = this.clock;
      this.probeWait = Math.max(2, this.probeWait * 0.7);
      if (this.step < 1.1 && this.clock - this.lastProbe > 60) { this.step = 1.1; this.lastProbe = this.clock; }
    }
  }

  // back to where the probe came from
  probeFailed() {
    this.probing = false;
    this.probeWait = Math.min(60, this.probeWait * 2);
    this.step = 1 + (this.step - 1) * 0.5;
    this.setScale(this.preProbe);
  }

  setScale(s) {
    const next = Math.min(this.maxScale, Math.max(this.minScale, s));
    if (Math.abs(next - this.scale) <= 0.005) return false;
    const down = next < this.scale;
    this.scale = next;
    this.applyScale();
    this.ftCount = 0;
    this.ftIdx = 0;
    this.clean = 0;
    this.settleRun = 0;
    this.settle = down ? 2.5 : 1.0;
    this.cooldown = down ? 1.0 : 1.5;
    return true;
  }

  setSky(sky, skyFxScene) {
    this.sky = sky;
    this.skyFxScene = skyFxScene;
    this.skyFxRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.skyFx = true;
    this.applyScale();
  }

  render(scene, camera, opts) {
    const r = this.renderer;
    r.info.reset();
    this.frame++;
    if (opts.shadow) r.shadowMap.needsUpdate = true;

    // not on the first frame: the mirror would draw with programs built before the shadow maps existed, which bind
    // a plain texture to their shadow sampler; the main pass rebuilds them first
    if (this.reflection && opts.reflect && this.frame > 1) this.reflection.render(r, scene, camera, opts);

    camera.layers.mask = (1 << 0) | (1 << LAYER_NOREFL);
    r.setRenderTarget(this.rtOpaque);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, false);
    r.render(scene, camera);
    camera.layers.mask = 1;

    // sky behind the geometry, and its sharp details (sun disc, moon, stars) at full resolution
    const skyTex = this.sky.render(r, this.post.fs, camera, this.rtOpaque.depthTexture, opts.moving);
    r.setRenderTarget(this.skyFxRT);
    r.clear(true, false, false);
    r.render(this.skyFxScene, camera);

    const aoTex = this.ssao.render(r, this.post.fs, camera, this.rtOpaque.depthTexture);
    const cm = this.copyMat.uniforms;
    cm.tAO.value = aoTex;
    cm.uAOK.value = this.aoOn ? 0.9 : 0;
    cm.tColor.value = this.rtOpaque.texture;
    cm.tDepth.value = this.rtOpaque.depthTexture;
    cm.tSky.value = skyTex;
    cm.tSkyFx.value = this.skyFxRT.texture;
    r.setRenderTarget(this.rtMain);
    r.clear(true, true, false);
    this.post.fs.render(r, this.copyMat, this.rtMain);

    if (opts.water) {
      for (const w of opts.water) {
        const u = w.uniforms;
        u.tScene.value = this.rtOpaque.texture;
        u.tDepth.value = this.rtOpaque.depthTexture;
        u.uRes.value.set(this.W, this.H);
        u.uNearFar.value.set(camera.near, camera.far);
      }
    }
    camera.layers.mask = (1 << LAYER_WATER) | (1 << LAYER_FX);
    r.setRenderTarget(this.rtMain);
    r.render(scene, camera);
    camera.layers.mask = 1;

    const volTex = this.vol.render(r, this.post.fs, camera, this.rtMain.depthTexture, opts.light, opts.vol);

    const post = this.post;
    post.dt = opts.dt;
    const bloom = post.bloom(this.rtMain);
    const sp = this._v.copy(opts.sunDir).multiplyScalar(1000).add(camera.position).project(camera);
    const sunUv = this.sunUv.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
    const facing = sp.z < 1 && opts.sunDir.dot(camera.getWorldDirection(this._v2)) > 0;
    let shaftTex = post.mips[post.levels - 1].texture;
    const cu = post.composite.uniforms;
    if (facing && opts.shaftK > 0.01) {
      shaftTex = post.shafts(this.rtMain.texture, this.rtMain.depthTexture, sunUv, this.W / this.H);
      cu.uShaft.value = opts.shaftK;
    } else cu.uShaft.value = 0;
    cu.uSunUv.value.copy(facing ? sunUv : this.offUv);
    cu.uAspect.value = this.W / this.H;
    post.final(this.rtMain.texture, bloom, shaftTex, volTex);
  }
}

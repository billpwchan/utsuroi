// HDR post chain: bloom (13-tap down / tent up), eye adaptation on the GPU, screen-space sun shafts when the sun
// is in frame, then one composite pass to the canvas: volumetric light, exposure, AgX tone map, grade, vignette,
// grain and a sharpening upscale.
import * as THREE from 'three';

const FS_VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class FullScreen {
  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.mesh = new THREE.Mesh(geo, null);
    this.mesh.frustumCulled = false;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  render(renderer, material, target) {
    this.mesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.mesh, this.camera);
  }
}

export const mk = (frag, uniforms, extra = {}) =>
  new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, ...extra });

const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.fs = new FullScreen();
    this.mips = [];
    this.levels = 6;
    for (let i = 0; i < this.levels; i++) this.mips.push(new THREE.WebGLRenderTarget(4, 4, rtOpts));
    this.shaftA = new THREE.WebGLRenderTarget(4, 4, rtOpts);
    this.shaftB = new THREE.WebGLRenderTarget(4, 4, rtOpts);
    this.expA = new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.expB = this.expA.clone();
    this.expPrimed = false;

    this.down = mk(
      /* glsl */ `
      precision highp float;
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uFirst;
      varying vec2 vUv;
      vec3 s(vec2 o){ return texture2D(tSrc, vUv + o * uTexel).rgb; }
      float lw(vec3 c){ return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722)) * 0.25); }
      void main(){
        vec3 a = s(vec2(-2, 2)), b = s(vec2(0, 2)), c = s(vec2(2, 2));
        vec3 d = s(vec2(-2, 0)), e = s(vec2(0, 0)), f = s(vec2(2, 0));
        vec3 g = s(vec2(-2, -2)), h = s(vec2(0, -2)), i = s(vec2(2, -2));
        vec3 j = s(vec2(-1, 1)), k = s(vec2(1, 1)), l = s(vec2(-1, -1)), m = s(vec2(1, -1));
        vec3 r;
        if (uFirst > 0.5) {
          vec3 g0 = (a + b + d + e) * 0.25, g1 = (b + c + e + f) * 0.25, g2 = (d + e + g + h) * 0.25, g3 = (e + f + h + i) * 0.25, g4 = (j + k + l + m) * 0.25;
          float w0 = lw(g0), w1 = lw(g1), w2 = lw(g2), w3 = lw(g3), w4 = lw(g4);
          r = (g0 * w0 * 0.125 + g1 * w1 * 0.125 + g2 * w2 * 0.125 + g3 * w3 * 0.125 + g4 * w4 * 0.5) / (w0 * 0.125 + w1 * 0.125 + w2 * 0.125 + w3 * 0.125 + w4 * 0.5);
        } else {
          r = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
        }
        gl_FragColor = vec4(max(r, 0.0), 1.0);
      }`,
      { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 } }
    );
    this.up = mk(
      /* glsl */ `
      precision highp float;
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uRadius;
      varying vec2 vUv;
      void main(){
        vec2 o = uTexel * uRadius;
        vec3 r = texture2D(tSrc, vUv).rgb * 4.0;
        r += (texture2D(tSrc, vUv + vec2(-o.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(o.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(0.0, -o.y)).rgb + texture2D(tSrc, vUv + vec2(0.0, o.y)).rgb) * 2.0;
        r += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb;
        gl_FragColor = vec4(r / 16.0, 1.0);
      }`,
      { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } },
      { blending: THREE.AdditiveBlending, transparent: true }
    );

    // eye adaptation: centre-weighted log-average of the smallest bloom mip, eased toward over time
    this.expMat = mk(
      /* glsl */ `
      precision highp float;
      uniform sampler2D tSrc, tPrev; uniform vec2 uSize; uniform float uDt, uPrimed, uKey, uAWB, uEyeMax;
      varying vec2 vUv;
      void main(){
        float acc = 0.0, wsum = 0.0;
        vec3 accC = vec3(0.0);
        for (int y = 0; y < 12; y++) for (int x = 0; x < 16; x++){
          vec2 uv = (vec2(float(x), float(y)) + 0.5) / vec2(16.0, 12.0);
          vec2 c = uv - 0.5;
          // centre-weighted, gently: a bright doorway in the middle of a room must not set the room's exposure
          float w = exp(-dot(c, c) * 3.5);
          float l = dot(texture2D(tSrc, uv).rgb, vec3(0.2126, 0.7152, 0.0722));
          acc += log(max(l, 1e-4)) * w; wsum += w;
          accC += log(max(texture2D(tSrc, uv).rgb, vec3(1e-4))) * w;
        }
        float avg = exp(acc / wsum);
        // white balance as a camera does it, part of the way: neutralise the scene's average cast so a room lit
        // by its own golden tatami and warm bounce reads cream rather than olive
        vec3 avgC = exp(accC / wsum);
        vec3 chroma = avgC / max(dot(avgC, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
        vec3 gain = clamp(pow(1.0 / max(chroma, vec3(1e-3)), vec3(uAWB)), vec3(0.8), vec3(1.25));
        // map the scene key to middle grey, but only partly: dark rooms stay darker than the garden. By day a room
        // gets a hundredth of the garden's light and the eye opens a long way for it; at night it opens less
        float target = clamp(pow(uKey / avg, 0.8), 0.45, uEyeMax);
        vec4 prevT = texture2D(tPrev, vec2(0.5));
        float prev = prevT.r;
        float k = uPrimed > 0.5 ? 1.0 - exp(-uDt * (target > prev ? 1.1 : 1.8)) : 1.0;
        float kc = uPrimed > 0.5 ? 1.0 - exp(-uDt * 1.2) : 1.0;
        gl_FragColor = vec4(mix(prev, target, k), avg, mix(prevT.b, gain.r, kc), mix(prevT.a, gain.b, kc));
      }`,
      { tSrc: { value: null }, tPrev: { value: null }, uSize: { value: new THREE.Vector2() }, uDt: { value: 0.016 }, uPrimed: { value: 0 }, uKey: { value: 0.16 }, uAWB: { value: 0.5 }, uEyeMax: { value: 2.5 } }
    );

    this.shaftMask = mk(
      /* glsl */ `
      precision highp float;
      uniform sampler2D tScene; uniform sampler2D tDepth; uniform vec2 uSun; uniform float uAspect;
      varying vec2 vUv;
      void main(){
        float sky = step(0.99999, texture2D(tDepth, vUv).x);
        vec2 dv = vUv - uSun; dv.x *= uAspect;
        vec3 c = texture2D(tScene, vUv).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        gl_FragColor = vec4(c * sky * smoothstep(0.6, 0.0, length(dv)) / (1.0 + l * 0.2), 1.0);
      }`,
      { tScene: { value: null }, tDepth: { value: null }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 } }
    );
    this.shaftBlur = mk(
      /* glsl */ `
      precision highp float;
      uniform sampler2D tSrc; uniform vec2 uSun; uniform float uStep;
      varying vec2 vUv;
      void main(){
        vec2 dir = (uSun - vUv) * uStep;
        vec3 acc = vec3(0.0); float w = 1.0, tw = 0.0;
        vec2 uv = vUv;
        float j = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
        uv += dir * j;
        for (int i = 0; i < 12; i++){ acc += texture2D(tSrc, uv).rgb * w; tw += w; w *= 0.93; uv += dir; }
        gl_FragColor = vec4(acc / tw, 1.0);
      }`,
      { tSrc: { value: null }, uSun: { value: new THREE.Vector2() }, uStep: { value: 0.04 } }
    );

    this.composite = mk(
      /* glsl */ `
      precision highp float;
      uniform sampler2D tScene, tBloom, tShaft, tVol, tExp;
      uniform vec2 uSrcTexel;
      uniform float uExposure, uBloom, uShaft, uTime, uSharpen, uVignette, uSat, uFade, uChroma, uVolK, uAdapt;
      uniform vec3 uWB, uFadeCol, uShaftCol, uLift;
      uniform vec2 uSunUv; uniform float uSunVeil, uAspect, uNightK, uContrast;
      uniform vec2 uLook;
      varying vec2 vUv;

      // AgX (Troy Sobotka / Blender), with a gentle punchy look
      vec3 agxCurve(vec3 x){
        vec3 x2 = x * x; vec3 x4 = x2 * x2;
        return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
      }
      vec3 agx(vec3 c){
        const mat3 inMat = mat3(0.842479062253094, 0.0423282422610123, 0.0423756549057051,
                                0.0784335999999992, 0.878468636469772, 0.0784336,
                                0.0792237451477643, 0.0791661274605434, 0.879142973793104);
        const mat3 outMat = mat3(1.19687900512017, -0.0528968517574562, -0.0529716355144438,
                                 -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
                                 -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
        const float minEv = -12.47393, maxEv = 4.026069;
        c = inMat * max(c, 1e-10);
        c = clamp(log2(c), minEv, maxEv);
        c = (c - minEv) / (maxEv - minEv);
        c = agxCurve(c);
        // the look, in AgX's own space: power deepens the toe (the base curve alone reads milky), then saturation
        c = pow(max(c, 0.0), vec3(uLook.x));
        float lk2 = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = lk2 + uLook.y * (c - lk2);
        c = outMat * c;
        c = pow(max(c, 0.0), vec3(2.2));
        return c;
      }
      vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

      void main(){
        vec3 c = texture2D(tScene, vUv).rgb;
        vec2 cuv = vUv - 0.5;
        if (uChroma > 0.0) {
          vec2 off = cuv * dot(cuv, cuv) * uChroma;
          c.r = texture2D(tScene, vUv - off).r;
          c.b = texture2D(tScene, vUv + off).b;
        }
        vec3 n = texture2D(tScene, vUv + vec2(0.0, uSrcTexel.y)).rgb + texture2D(tScene, vUv - vec2(0.0, uSrcTexel.y)).rgb
               + texture2D(tScene, vUv + vec2(uSrcTexel.x, 0.0)).rgb + texture2D(tScene, vUv - vec2(uSrcTexel.x, 0.0)).rgb;
        vec3 hp = c - n * 0.25;
        float lc = dot(c, vec3(0.3, 0.59, 0.11));
        c += hp * uSharpen / (1.0 + lc * 2.0);
        c = max(c, 0.0);

        c += texture2D(tVol, vUv).rgb * uVolK;
        vec3 bloom = texture2D(tBloom, vUv).rgb;
        c = mix(c, bloom, uBloom);
        c += texture2D(tShaft, vUv).rgb * uShaftCol * uShaft;
        vec2 sv = vUv - uSunUv; sv.x *= uAspect;
        c += uShaftCol * uSunVeil * exp(-length(sv) * 4.0) * 0.1;

        vec4 ex = texture2D(tExp, vec2(0.5));
        float eye = mix(1.0, ex.r, uAdapt);
        vec3 awb = vec3(ex.b, (1.0 - 0.2126 * ex.b - 0.0722 * ex.a) / 0.7152, ex.a);
        c *= uExposure * eye * uWB * mix(vec3(1.0), awb, uAdapt);
        float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float scot = uNightK * smoothstep(0.2, 0.0, lum);
        c = mix(c, vec3(lum * 0.72, lum * 0.88, lum * 1.3), scot * 0.55);

        vec3 t = agx(c);
        float l = dot(t, vec3(0.2126, 0.7152, 0.0722));
        // contrast around mid grey and a quiet split tone: cool shade, warm light
        t = mix(vec3(l), t, uSat);
        // yellow-greens are where a render oversells saturation; film holds them back
        t = mix(t, mix(vec3(l), t, 0.88), smoothstep(0.01, 0.1, t.g - max(t.r, t.b)));
        t = clamp((t - 0.18) * uContrast + 0.18, 0.0, 1.0) * 0.5 + t * 0.5;
        t *= mix(vec3(0.96, 1.0, 1.035), vec3(1.035, 1.0, 0.955), smoothstep(0.08, 0.7, l));
        t = t + uLift * (1.0 - t);
        float v = 1.0 - dot(cuv * vec2(1.0, 0.8), cuv * vec2(1.0, 0.8)) * uVignette;
        t *= v;
        t = mix(t, uFadeCol, uFade);
        vec3 o = toSRGB(clamp(t, 0.0, 1.0));
        float g = fract(sin(dot(vUv * 1000.0 + uTime * 7.13, vec2(12.9898, 78.233))) * 43758.5453);
        float g2 = fract(sin(dot(vUv * 1000.0 - uTime * 3.71, vec2(39.346, 11.135))) * 24634.6345);
        o += (g + g2 - 1.0) * (0.014 + uNightK * 0.01);
        gl_FragColor = vec4(o, 1.0);
      }`,
      {
        tScene: { value: null }, tBloom: { value: null }, tShaft: { value: null }, tVol: { value: null }, tExp: { value: null },
        uSrcTexel: { value: new THREE.Vector2() },
        uExposure: { value: 1 }, uBloom: { value: 0.04 }, uShaft: { value: 0 }, uTime: { value: 0 },
        uSharpen: { value: 0.18 }, uVignette: { value: 0.42 }, uSat: { value: 1.0 }, uFade: { value: 0 }, uChroma: { value: 0.0012 },
        uVolK: { value: 1 }, uAdapt: { value: 1 }, uContrast: { value: 1.12 },
        uWB: { value: new THREE.Vector3(1, 1, 1) }, uFadeCol: { value: new THREE.Vector3(0, 0, 0) },
        uShaftCol: { value: new THREE.Vector3(1, 0.7, 0.4) }, uLift: { value: new THREE.Vector3(0.006, 0.007, 0.01) },
        uSunUv: { value: new THREE.Vector2(-9, -9) }, uSunVeil: { value: 0 }, uAspect: { value: 1 }, uNightK: { value: 0 },
        uLook: { value: new THREE.Vector2(1.22, 1.12) },
      }
    );
  }

  setSize(w, h) {
    let mw = Math.max(1, w >> 1), mh = Math.max(1, h >> 1);
    for (let i = 0; i < this.levels; i++) {
      this.mips[i].setSize(mw, mh);
      mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1);
    }
    this.shaftA.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.shaftB.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.srcW = w; this.srcH = h;
  }

  bloom(src) {
    const r = this.renderer;
    let input = src;
    for (let i = 0; i < this.levels; i++) {
      const t = this.mips[i];
      this.down.uniforms.tSrc.value = input.texture;
      this.down.uniforms.uTexel.value.set(1 / input.width, 1 / input.height);
      this.down.uniforms.uFirst.value = i === 0 ? 1 : 0;
      this.fs.render(r, this.down, t);
      input = t;
    }
    // adapt on the smallest mip before the upsample adds into it
    this.adapt();
    for (let i = this.levels - 1; i > 0; i--) {
      const s = this.mips[i], t = this.mips[i - 1];
      this.up.uniforms.tSrc.value = s.texture;
      this.up.uniforms.uTexel.value.set(1 / s.width, 1 / s.height);
      this.fs.render(r, this.up, t);
    }
    return this.mips[0].texture;
  }

  adapt() {
    const u = this.expMat.uniforms;
    u.tSrc.value = this.mips[this.levels - 1].texture;
    u.tPrev.value = this.expB.texture;
    u.uDt.value = this.dt || 0.016;
    u.uPrimed.value = this.expPrimed ? 1 : 0;
    this.fs.render(this.renderer, this.expMat, this.expA);
    this.expPrimed = true;
    const t = this.expA; this.expA = this.expB; this.expB = t;
  }

  shafts(sceneTex, depthTex, sunUv, aspect) {
    const r = this.renderer;
    this.shaftMask.uniforms.tScene.value = sceneTex;
    this.shaftMask.uniforms.tDepth.value = depthTex;
    this.shaftMask.uniforms.uSun.value.copy(sunUv);
    this.shaftMask.uniforms.uAspect.value = aspect;
    this.fs.render(r, this.shaftMask, this.shaftA);
    this.shaftBlur.uniforms.uSun.value.copy(sunUv);
    this.shaftBlur.uniforms.tSrc.value = this.shaftA.texture;
    this.shaftBlur.uniforms.uStep.value = 0.055;
    this.fs.render(r, this.shaftBlur, this.shaftB);
    this.shaftBlur.uniforms.tSrc.value = this.shaftB.texture;
    this.shaftBlur.uniforms.uStep.value = 0.018;
    this.fs.render(r, this.shaftBlur, this.shaftA);
    return this.shaftA.texture;
  }

  final(sceneTex, bloomTex, shaftTex, volTex) {
    const u = this.composite.uniforms;
    u.tScene.value = sceneTex;
    u.tBloom.value = bloomTex;
    u.tShaft.value = shaftTex;
    u.tVol.value = volTex;
    u.tExp.value = this.expB.texture;
    u.uSrcTexel.value.set(1 / this.srcW, 1 / this.srcH);
    this.fs.render(this.renderer, this.composite, null);
  }
}

// Volumetric sunlight: march each quarter-resolution pixel's view ray through the sun's shadow map, so beams
// form through open shoji, lattice and between eave posts. Air inside the house is dustier than the garden air
// (density rises where the baked sky visibility is low), which keeps outdoor views clear while rooms get shafts.
import * as THREE from 'three';
import { mk } from '../core/post.js';
import { U, UNIFORMS_GLSL, NOISE } from '../core/shared.js';

const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };

export class Volumetric {
  constructor() {
    this.rtA = new THREE.WebGLRenderTarget(4, 4, rtOpts);
    this.rtB = new THREE.WebGLRenderTarget(4, 4, rtOpts);
    this.rtC = new THREE.WebGLRenderTarget(4, 4, rtOpts);
    this.frame = 0;
    this.march = mk(
      /* glsl */ `
      precision highp float;
      precision highp sampler2DShadow;
      ${UNIFORMS_GLSL}
      ${NOISE}
      uniform highp sampler3D tVisSky;
      uniform sampler2D tDepth, tPrev;
      uniform sampler2DShadow tShadow;
      uniform mat4 uInvProj, uCamWorld, uShadowMat;
      uniform float uDensity, uDust, uFrame, uMaxDist, uHist, uOn;
      uniform vec4 uRooms[6];
      float indoorAt(vec3 p){
        float k = 0.0;
        for (int i = 0; i < 6; i++){
          vec4 r = uRooms[i];
          vec2 d = min(p.xz - r.xy, r.zw - p.xz);
          k = max(k, smoothstep(-0.2, 0.6, min(d.x, d.y)));
        }
        return k * smoothstep(3.6, 2.8, p.y) * smoothstep(0.2, 0.6, p.y);
      }
      uniform vec2 uSrcTexel;
      varying vec2 vUv;
      float hg(float mu, float g){ float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * mu, 1.5)); }
      void main(){
        if (uOn < 0.5) { gl_FragColor = vec4(0.0); return; }
        // farthest depth of the 4x4 footprint keeps beams from stopping short at thin foreground lattice
        float d = texture2D(tDepth, vUv).x;
        vec4 ndc = vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
        vec4 vp = uInvProj * ndc; vp /= vp.w;
        vec3 wp = (uCamWorld * vec4(vp.xyz, 1.0)).xyz;
        vec3 ro = cameraPosition;
        vec3 rv = wp - ro;
        float len = min(length(rv), uMaxDist);
        vec3 rd = normalize(rv);
        const int N = 28;
        float dt = len / float(N);
        float jit = fract(sfHash12(gl_FragCoord.xy + uFrame * 17.0) + uFrame * 0.618034);
        float mu = dot(rd, uSunDir);
        float ph = mix(hg(mu, 0.72), hg(mu, -0.1), 0.2);
        vec3 acc = vec3(0.0);
        float T = 1.0;
        for (int i = 0; i < N; i++){
          vec3 p = ro + rd * ((float(i) + jit) * dt);
          vec4 sc = uShadowMat * vec4(p, 1.0);
          sc.xyz /= sc.w;
          // beyond the shadow map nothing is known: take the air there as partly lit and fade into it, so the map's
          // edge never shows as a wall of haze
          float lit = 0.3;
          float cover = smoothstep(0.0, 0.1, min(min(sc.x, 1.0 - sc.x), min(sc.y, 1.0 - sc.y)));
          if (cover > 0.0 && sc.z < 1.0) lit = mix(0.3, texture(tShadow, vec3(sc.xy, sc.z - 0.0008)), cover);
          float enclosed = indoorAt(p);
          // slow drifting dust, thicker indoors
          float n = sfNoise(p.xz * 0.9 + vec2(uTime * 0.05, p.y * 0.7)) * 0.6 + 0.6;
          float dens = (uDensity + uDust * enclosed * n) * smoothstep(-0.2, 0.4, p.y);
          acc += T * lit * dens * dt;
          T *= exp(-dens * dt * 0.35);
        }
        vec3 col = acc * ph * uSunCol * 4.0;
        // temporal blend without reprojection: the walk moves slowly, history only hides the jitter
        vec3 prev = texture2D(tPrev, vUv).rgb;
        col = mix(col, prev, uHist);
        gl_FragColor = vec4(col, 1.0);
      }`,
      {
        ...U,
        tDepth: { value: null }, tPrev: { value: null }, tShadow: { value: null },
        uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uShadowMat: { value: new THREE.Matrix4() },
        uDensity: { value: 0.002 }, uDust: { value: 0.03 }, uFrame: { value: 0 }, uMaxDist: { value: 28 }, uHist: { value: 0.6 }, uOn: { value: 1 },
        uSrcTexel: { value: new THREE.Vector2() },
        uRooms: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -1, -1)) },
      }
    );
    // depth-aware 3x3 blur at quarter res
    this.blur = mk(
      /* glsl */ `
      precision highp float;
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform vec2 uDir;
      varying vec2 vUv;
      void main(){
        vec3 c = texture2D(tSrc, vUv).rgb * 0.4;
        c += texture2D(tSrc, vUv + uDir * uTexel * 1.5).rgb * 0.3;
        c += texture2D(tSrc, vUv - uDir * uTexel * 1.5).rgb * 0.3;
        gl_FragColor = vec4(c, 1.0);
      }`,
      { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uDir: { value: new THREE.Vector2(1, 0) } }
    );
  }

  setSize(w, h) {
    const W = Math.max(2, Math.round(w / 4)), H = Math.max(2, Math.round(h / 4));
    for (const t of [this.rtA, this.rtB, this.rtC]) t.setSize(W, H);
    this.W = W; this.H = H;
  }

  render(renderer, fs, camera, depthTex, light, opts) {
    const u = this.march.uniforms;
    u.uOn.value = opts.on ? 1 : 0;
    u.tDepth.value = depthTex;
    u.tPrev.value = this.rtB.texture;
    u.tShadow.value = light.shadow.map ? light.shadow.map.depthTexture : null;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uShadowMat.value.copy(light.shadow.matrix);
    u.uFrame.value = this.frame++ % 64;
    u.uDensity.value = opts.density;
    u.uDust.value = opts.dust;
    u.uHist.value = opts.moving ? 0.45 : 0.7;
    fs.render(renderer, this.march, this.rtA);
    const b = this.blur.uniforms;
    b.uTexel.value.set(1 / this.W, 1 / this.H);
    b.tSrc.value = this.rtA.texture; b.uDir.value.set(1, 0);
    fs.render(renderer, this.blur, this.rtC);
    b.tSrc.value = this.rtC.texture; b.uDir.value.set(0, 1);
    fs.render(renderer, this.blur, this.rtB);
    // rtB holds the blurred result and is also next frame's history
    return this.rtB.texture;
  }
}

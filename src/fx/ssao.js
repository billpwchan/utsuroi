// Screen-space ambient occlusion at half resolution: a 16-tap spiral in a world-sized radius around each pixel,
// normals rebuilt from the depth buffer, then a depth-aware blur. It supplies what the 25 cm visibility volume
// cannot: contact shade where a post meets the floor, in the corners of a room, under a cushion.
import * as THREE from 'three';
import { mk } from '../core/post.js';

const rt = () => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, format: THREE.RedFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });

export class SSAO {
  constructor() {
    this.rtA = rt();
    this.rtB = rt();
    this.frame = 0;
    this.ao = mk(
      /* glsl */ `
      precision highp float;
      uniform sampler2D tDepth;
      uniform mat4 uProj, uInvProj;
      uniform vec2 uTexel;
      uniform float uRadius, uFrame;
      varying vec2 vUv;
      vec3 viewPos(vec2 uv){
        float d = texture2D(tDepth, uv).x;
        vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
        return p.xyz / p.w;
      }
      void main(){
        float d = texture2D(tDepth, vUv).x;
        if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
        vec3 P = viewPos(vUv);
        // normal from the flatter of the two neighbours on each axis, so edges do not smear
        vec3 px0 = viewPos(vUv + vec2(uTexel.x, 0.0)) - P, px1 = P - viewPos(vUv - vec2(uTexel.x, 0.0));
        vec3 py0 = viewPos(vUv + vec2(0.0, uTexel.y)) - P, py1 = P - viewPos(vUv - vec2(0.0, uTexel.y));
        vec3 dx = abs(px0.z) < abs(px1.z) ? px0 : px1;
        vec3 dy = abs(py0.z) < abs(py1.z) ? py0 : py1;
        vec3 N = normalize(cross(dx, dy));
        float dist = -P.z;
        // the radius in pixels of a sphere of uRadius metres at this depth
        float rPix = uRadius * uProj[1][1] * 0.5 / dist / uTexel.y;
        rPix = min(rPix, 90.0);
        float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        float rot = (noise + uFrame * 0.618034) * 6.2831;
        float occ = 0.0;
        const int TAPS = 16;
        for (int i = 0; i < TAPS; i++){
          float t = (float(i) + 0.5) / float(TAPS);
          float a = t * 6.2831 * 7.0 + rot;
          float r = rPix * t * t;
          vec2 uv = vUv + vec2(cos(a), sin(a)) * r * uTexel;
          vec3 S = viewPos(uv);
          vec3 v = S - P;
          float vv = dot(v, v);
          float vn = dot(v, N) - 0.015 * dist;
          float fall = max(0.0, 1.0 - vv / (uRadius * uRadius));
          occ += max(vn, 0.0) / (vv + 0.02 * dist) * fall;
        }
        float ao = clamp(1.0 - occ * 2.2 / float(TAPS), 0.0, 1.0);
        gl_FragColor = vec4(ao, 0.0, 0.0, 1.0);
      }`,
      { tDepth: { value: null }, uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 0.55 }, uFrame: { value: 0 } }
    );
    this.blur = mk(
      /* glsl */ `
      precision highp float;
      uniform sampler2D tSrc, tDepth;
      uniform vec2 uTexel, uDir, uNearFar;
      varying vec2 vUv;
      float lin(float d){ float n = uNearFar.x, f = uNearFar.y; return 2.0 * n * f / (f + n - (d * 2.0 - 1.0) * (f - n)); }
      void main(){
        float z0 = lin(texture2D(tDepth, vUv).x);
        float acc = 0.0, w = 0.0;
        for (int i = -3; i <= 3; i++){
          vec2 uv = vUv + uDir * uTexel * float(i) * 1.5;
          float z = lin(texture2D(tDepth, uv).x);
          float k = exp(-float(i * i) * 0.18) * exp(-abs(z - z0) / (0.03 * z0 + 0.02) );
          acc += texture2D(tSrc, uv).r * k; w += k;
        }
        gl_FragColor = vec4(acc / max(w, 1e-4), 0.0, 0.0, 1.0);
      }`,
      { tSrc: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() }, uDir: { value: new THREE.Vector2(1, 0) }, uNearFar: { value: new THREE.Vector2(0.1, 1000) } }
    );
  }
  setSize(w, h) {
    this.W = Math.max(2, Math.round(w / 2));
    this.H = Math.max(2, Math.round(h / 2));
    this.rtA.setSize(this.W, this.H);
    this.rtB.setSize(this.W, this.H);
  }
  render(renderer, fs, camera, depthTex) {
    const u = this.ao.uniforms;
    u.tDepth.value = depthTex;
    u.uProj.value.copy(camera.projectionMatrix);
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uTexel.value.set(1 / this.W, 1 / this.H);
    u.uFrame.value = this.frame++ % 16;
    fs.render(renderer, this.ao, this.rtA);
    const b = this.blur.uniforms;
    b.tDepth.value = depthTex;
    b.uTexel.value.set(1 / this.W, 1 / this.H);
    b.uNearFar.value.set(camera.near, camera.far);
    b.tSrc.value = this.rtA.texture; b.uDir.value.set(1, 0);
    fs.render(renderer, this.blur, this.rtB);
    b.tSrc.value = this.rtB.texture; b.uDir.value.set(0, 1);
    fs.render(renderer, this.blur, this.rtA);
    return this.rtA.texture;
  }
}

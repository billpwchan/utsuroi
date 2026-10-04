// Sky: single-scattering atmosphere plus a raymarched cumulus layer, rendered at half resolution behind the
// opaque world (pixels already covered are skipped), jittered and accumulated over frames by reprojecting view
// directions. A small equirect copy of the same sky feeds the environment map and the pond's mirror pass.
import * as THREE from 'three';
import { U, UNIFORMS_GLSL, NOISE } from '../core/shared.js';

// ---- tileable 3D noise: R = perlin-worley base, G/B/A = worley octaves for erosion ----
function makeCloudNoise(N = 64) {
  const data = new Uint8Array(N * N * N * 4);
  const hash = (x, y, z, s) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647) + Math.imul(s, 1013904223)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const worley = (x, y, z, cells, seed) => {
    const fx = x * cells, fy = y * cells, fz = z * cells;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    let best = 9;
    for (let dz = -1; dz <= 1; dz++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const cx = ix + dx, cy = iy + dy, cz = iz + dz;
          const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells, wz = ((cz % cells) + cells) % cells;
          const px = cx + hash(wx, wy, wz, seed), py = cy + hash(wx, wy, wz, seed + 1), pz = cz + hash(wx, wy, wz, seed + 2);
          const d = (px - fx) ** 2 + (py - fy) ** 2 + (pz - fz) ** 2;
          if (d < best) best = d;
        }
    return 1 - Math.min(1, Math.sqrt(best));
  };
  const vnoise = (x, y, z, P, seed) => {
    const fx = x * P, fy = y * P, fz = z * P;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    const ux = fx - ix, uy = fy - iy, uz = fz - iz;
    const sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy), sz = uz * uz * (3 - 2 * uz);
    const h = (a, b, c) => hash(((a % P) + P) % P, ((b % P) + P) % P, ((c % P) + P) % P, seed);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(h(ix, iy, iz), h(ix + 1, iy, iz), sx), l(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), sx), sy),
      l(l(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), sx), l(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), sx), sy),
      sz
    );
  };
  for (let z = 0; z < N; z++)
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const u = x / N, v = y / N, w = z / N;
        const pf = vnoise(u, v, w, 4, 7) * 0.5 + vnoise(u, v, w, 8, 9) * 0.3 + vnoise(u, v, w, 16, 11) * 0.2;
        const w1 = worley(u, v, w, 4, 1), w2 = worley(u, v, w, 8, 21), w3 = worley(u, v, w, 16, 41), w4 = worley(u, v, w, 32, 61);
        const wf = w1 * 0.625 + w2 * 0.25 + w3 * 0.125;
        // perlin-worley: perlin remapped by the worley fbm so blobs get billowy edges
        const pw = Math.min(1, Math.max(0, (pf - (wf - 1)) / (1 - (wf - 1)) - 0.35) * 1.6);
        const i = ((z * N + y) * N + x) * 4;
        data[i] = pw * 255;
        data[i + 1] = (w2 * 0.625 + w3 * 0.25 + w4 * 0.125) * 255;
        data[i + 2] = (w3 * 0.625 + w4 * 0.375) * 255;
        data[i + 3] = w4 * 255;
      }
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RGBAFormat;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const SKY_GLSL = /* glsl */ `
${UNIFORMS_GLSL}
${NOISE}
uniform highp sampler3D tCloud;
uniform float uCover, uCloudSeason, uFrame;

const float RE = 6360e3, RA = 6420e3, HR = 8000.0, HM = 1200.0;
const vec3 BR = vec3(5.8e-6, 13.5e-6, 33.1e-6);
const float BM = 21e-6;
const float SUN_I = 22.0;

float raySphereFar(float oy, vec3 d, float r){
  float b = oy * d.y; float c = oy * oy - r * r; float h = b * b - c;
  return h < 0.0 ? -1.0 : -b + sqrt(h);
}
vec2 odToSun(vec3 p, vec3 s){
  float b = dot(p, s); float c = dot(p, p) - RA * RA;
  float t = -b + sqrt(max(0.0, b * b - c));
  float ds = t / 4.0; vec2 od = vec2(0.0);
  for (int i = 0; i < 4; i++){
    vec3 q = p + s * ((float(i) + 0.5) * ds);
    float h = length(q) - RE;
    if (h < 0.0) return vec2(1e9);
    od += exp(-vec2(h / HR, h / HM)) * ds;
  }
  return od;
}
vec3 atmosphere(vec3 d, vec3 s){
  float oy = RE + 2.0;
  // below the horizon, look along it: never trace through the planet
  vec3 dd = vec3(d.x, max(d.y, 0.002), d.z);
  if (length(dd.xz) < 1e-3) dd.x = 1e-3;
  dd = normalize(dd);
  float t = raySphereFar(oy, dd, RA);
  float ds = t / 8.0;
  float mu = dot(dd, s);
  float pR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float g = 0.76;
  float pM = 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  vec3 sR = vec3(0.0), sM = vec3(0.0); vec2 od = vec2(0.0);
  for (int i = 0; i < 8; i++){
    vec3 p = vec3(0.0, oy, 0.0) + dd * ((float(i) + 0.5) * ds);
    float h = max(length(p) - RE, 0.0);
    vec2 hh = exp(-vec2(h / HR, h / HM)) * ds;
    od += hh;
    vec2 l = odToSun(p, s);
    vec3 a = exp(-(BR * (od.x + l.x) + BM * 1.1 * (od.y + l.y)));
    sR += a * hh.x; sM += a * hh.y;
  }
  return (sR * BR * pR + sM * BM * pM) * SUN_I;
}
vec3 sunTrans(vec3 s){
  vec2 l = odToSun(vec3(0.0, RE + 1500.0, 0.0), normalize(vec3(s.x, max(s.y, -0.05), s.z)));
  return exp(-(BR * l.x + BM * 1.1 * l.y));
}

// cumulus slab between 1.4 and 3.6 km
const float CB = 1400.0, CT = 3600.0;
float hgPhase(float mu, float g){ float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * mu, 1.5)); }
float coverage(vec2 xz){
  vec2 w = xz * 0.000045 + uWind.xy * uTime * 0.00035 + vec2(3.7, 1.3);
  float c = sfFbm(w) * 0.72 + sfNoise(w * 3.1 + 7.0) * 0.28;
  return smoothstep(1.0 - uCover - 0.18, 1.0 - uCover + 0.32, c);
}
float cloudDensity(vec3 p, bool cheap){
  float hf = clamp((p.y - CB) / (CT - CB), 0.0, 1.0);
  // cumulus profile: flat bases, rounded tops
  float prof = smoothstep(0.0, 0.08, hf) * smoothstep(1.0, 0.45, hf);
  float cov = coverage(p.xz);
  if (cov * prof < 0.01) return 0.0;
  vec3 q = p * 0.00028 + vec3(uTime * 0.003, 0.0, uTime * 0.0015);
  vec4 n = texture(tCloud, q);
  float base = n.r * 0.85 + (n.g * 0.625 + n.b * 0.25) * 0.15;
  float d = clamp((base * prof - (1.0 - cov)) / max(cov, 0.05), 0.0, 1.0);
  if (cheap || d <= 0.0) return d;
  // erode the edges with finer worley, more at the base for wispy undersides
  vec4 m = texture(tCloud, p * 0.0016 + vec3(0.0, uTime * 0.004, 0.0));
  float det = mix(m.g, 1.0 - m.g, clamp(hf * 3.0, 0.0, 1.0)) * 0.6 + m.a * 0.4;
  return clamp((d - det * 0.32) / 0.68, 0.0, 1.0);
}
// returns rgb in-scattered light and a = transmittance
vec4 clouds(vec3 d, vec3 sunDir, vec3 sunCol, vec3 skyTop, vec3 skyHor, float jitter){
  if (d.y < 0.012 || uCover < 0.01) return vec4(0.0, 0.0, 0.0, 1.0);
  float t0 = CB / d.y, t1 = CT / d.y;
  t1 = min(t1, t0 + 14000.0);
  if (t0 > 60000.0) return vec4(0.0, 0.0, 0.0, 1.0);
  const int STEPS = 28;
  float dt = (t1 - t0) / float(STEPS);
  float T = 1.0; vec3 L = vec3(0.0);
  float mu = dot(d, sunDir);
  float ph = mix(hgPhase(mu, 0.72), hgPhase(mu, -0.25), 0.35);
  float sigma = 0.045;
  for (int i = 0; i < STEPS; i++){
    float t = t0 + (float(i) + jitter) * dt;
    vec3 p = d * t;
    float den = cloudDensity(p, false);
    if (den > 0.003){
      // light march toward the sun
      float od = 0.0; float ls = 90.0;
      vec3 lp = p;
      for (int j = 0; j < 4; j++){ lp += sunDir * ls; od += cloudDensity(lp, true) * ls; ls *= 1.9; }
      float beer = exp(-od * sigma * 0.55);
      float powder = 1.0 - exp(-od * sigma * 1.6);
      // a few octaves of multiple scattering keep thick cores from going black
      float ms = beer * ph + 0.35 * exp(-od * sigma * 0.14) * hgPhase(mu, 0.3) + 0.12 * exp(-od * sigma * 0.04) / (4.0 * PI);
      float hf = clamp((p.y - CB) / (CT - CB), 0.0, 1.0);
      vec3 amb = mix(skyHor * 0.65, skyTop * 1.15, hf) * (0.55 + 0.45 * hf);
      vec3 S = sunCol * ms * mix(1.0, powder * 1.6 + 0.2, 0.55) * 4.0 + amb * 1.4;
      float ext = den * sigma;
      float Ts = exp(-ext * dt);
      L += T * S * (1.0 - Ts) * 0.5 / max(sigma, 1e-4) * sigma;
      T *= Ts;
      if (T < 0.02) break;
    }
  }
  // far clouds sink into the haze
  float fade = exp(-t0 * 0.000032);
  return vec4(L * fade, mix(1.0, T, fade));
}

vec3 skyCol(vec3 d, float jitter, out float cloudT){
  vec3 s = uTrueSun;
  vec3 col = atmosphere(d, s);
  // night floor and twilight lift
  col += vec3(0.006, 0.009, 0.02) * (1.0 - smoothstep(0.0, 0.5, d.y) * 0.3);
  // the ground below the horizon is the far haze
  col = mix(col, uFogAway * 0.9, smoothstep(0.0, -0.05, d.y));
  vec3 sc = sunTrans(s) * SUN_I * smoothstep(-0.12, 0.02, s.y);
  vec3 mc = vec3(0.07, 0.085, 0.12) * uNight;
  vec3 key = s.y > -0.08 ? s : uMoonDir;
  vec3 kc = s.y > -0.08 ? sc * 0.16 : mc;
  vec4 c = clouds(d, key, kc, uSkyZen, uSkyHor, jitter);
  cloudT = c.a;
  return col * c.a + c.rgb;
}
`;

export class Sky {
  constructor() {
    this.noise = makeCloudNoise(64);
    this.cover = 0.42;
    const common = {
      ...U,
      tCloud: { value: this.noise },
      uCover: { value: this.cover },
      uCloudSeason: { value: 0 },
      uFrame: { value: 0 },
    };
    this.uniforms = common;
    // screen pass at half resolution
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        ...common,
        tDepth: { value: null },
        tPrev: { value: null },
        uInvVP: { value: new THREE.Matrix4() },
        uPrevVP: { value: new THREE.Matrix4() },
        uBlend: { value: 0 },
        uSrcTexel: { value: new THREE.Vector2() },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        ${SKY_GLSL}
        uniform sampler2D tDepth, tPrev;
        uniform mat4 uInvVP, uPrevVP;
        uniform float uBlend;
        uniform vec2 uSrcTexel;
        void main(){
          // skip pixels whose 2x2 footprint is all geometry
          float far = 0.0;
          far = max(far, step(0.99999, texture2D(tDepth, vUv + uSrcTexel * vec2(-0.5, -0.5)).x));
          far = max(far, step(0.99999, texture2D(tDepth, vUv + uSrcTexel * vec2(0.5, -0.5)).x));
          far = max(far, step(0.99999, texture2D(tDepth, vUv + uSrcTexel * vec2(-0.5, 0.5)).x));
          far = max(far, step(0.99999, texture2D(tDepth, vUv + uSrcTexel * vec2(0.5, 0.5)).x));
          if (far < 0.5) { gl_FragColor = vec4(0.0); return; }
          vec4 ndc = vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
          vec4 w = uInvVP * ndc;
          vec3 d = normalize(w.xyz / w.w);
          float jit = fract(sfHash12(gl_FragCoord.xy) + uFrame * 0.618034);
          float ct;
          vec3 col = skyCol(d, jit, ct);
          vec4 pc = uPrevVP * vec4(d, 1.0);
          vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
          if (uBlend > 0.0 && pc.w > 0.0 && all(greaterThan(puv, vec2(0.0))) && all(lessThan(puv, vec2(1.0)))){
            vec4 prev = texture2D(tPrev, puv);
            if (prev.a > 0.0) { col = mix(col, prev.rgb, uBlend); ct = mix(ct, prev.a - 1.0, uBlend); }
          }
          // a stores cloud transmittance + 1 (0 marks "not computed")
          gl_FragColor = vec4(col, ct + 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    // equirect panorama for environment lighting and the mirror pass
    this.panoMat = new THREE.ShaderMaterial({
      uniforms: common,
      vertexShader: `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        ${SKY_GLSL}
        void main(){
          float phi = (vUv.x - 0.5) * 2.0 * PI;
          float th = (vUv.y - 0.5) * PI;
          vec3 d = vec3(sin(phi) * cos(th), sin(th), -cos(phi) * cos(th));
          float ct;
          vec3 col = skyCol(d, 0.5, ct);
          col += uSunCol * 2.0 * smoothstep(0.9993, 0.9997, dot(d, uTrueSun)) * ct * step(-0.02, d.y);
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    const rt = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };
    this.rtA = new THREE.WebGLRenderTarget(4, 4, rt);
    this.rtB = new THREE.WebGLRenderTarget(4, 4, rt);
    this.pano = new THREE.WebGLRenderTarget(512, 256, { ...rt, wrapS: THREE.RepeatWrapping });
    this.pano.texture.mapping = THREE.EquirectangularReflectionMapping;
    this.prevVP = new THREE.Matrix4();
    this.hasPrev = false;
    this.frame = 0;
    this._m = new THREE.Matrix4();
    this._rot = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
  }

  setSize(w, h) {
    const W = Math.max(2, Math.round(w / 2)), H = Math.max(2, Math.round(h / 2));
    this.rtA.setSize(W, H);
    this.rtB.setSize(W, H);
    this.mat.uniforms.uSrcTexel.value.set(1 / w, 1 / h);
    this.hasPrev = false;
  }

  // view-projection without translation: the sky lives at infinity
  rotVP(camera, out) {
    this._rot.makeRotationFromQuaternion(camera.getWorldQuaternion(this._q)).invert();
    return out.multiplyMatrices(camera.projectionMatrix, this._rot);
  }

  render(renderer, fs, camera, depthTex, moving) {
    const u = this.mat.uniforms;
    u.uCover.value = this.cover;
    u.uFrame.value = this.frame++ % 64;
    const vp = this.rotVP(camera, this._m);
    u.uInvVP.value.copy(vp).invert();
    u.uPrevVP.value.copy(this.prevVP);
    u.tDepth.value = depthTex;
    u.tPrev.value = this.rtB.texture;
    // fast time scrubbing changes the light; trust history less
    u.uBlend.value = this.hasPrev ? (moving ? 0.55 : 0.88) : 0;
    fs.render(renderer, this.mat, this.rtA);
    this.prevVP.copy(vp);
    this.hasPrev = true;
    const t = this.rtA; this.rtA = this.rtB; this.rtB = t;
    return this.rtB.texture;
  }

  renderPano(renderer, fs) {
    this.panoMat.uniforms.uCover.value = this.cover;
    fs.render(renderer, this.panoMat, this.pano);
  }
}

// full-resolution sky details: sun disc, moon and stars (the half-res pass would blur them)
export function makeSkyFx() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, uMoonPhase: { value: 0.93 } },
    depthWrite: false,
    depthTest: false,
    side: THREE.BackSide,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = position;
        vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vDir;
      ${UNIFORMS_GLSL}
      ${NOISE}
      uniform float uMoonPhase;
      vec3 stars(vec3 rd){
        vec3 a = abs(rd); vec2 uv; float face;
        if (a.x > a.y && a.x > a.z){ uv = rd.yz / a.x; face = sign(rd.x); }
        else if (a.y > a.z){ uv = rd.xz / a.y; face = 2.0 + sign(rd.y); }
        else { uv = rd.xy / a.z; face = 4.0 + sign(rd.z); }
        vec2 g = uv * 190.0; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
        float h = sfHash13(vec3(id, face));
        vec2 off = vec2(sfHash13(vec3(id, face + 7.0)), sfHash13(vec3(id, face + 13.0))) - 0.5;
        float d = length(f - off * 0.7);
        float b = pow(h, 26.0) * 2.4;
        float tw = 0.7 + 0.3 * sin(uTime * (1.3 + h * 3.0) + h * 70.0);
        vec3 tint = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.88, 0.72), fract(h * 37.0));
        return tint * b * tw * smoothstep(0.1, 0.0, d);
      }
      void main(){
        vec3 rd = normalize(vDir);
        vec3 col = vec3(0.0);
        float above = smoothstep(-0.01, 0.02, rd.y);
        float sd = dot(rd, uTrueSun);
        col += uSunCol * 60.0 * smoothstep(0.99985, 0.99992, sd) * above;
        col += uSunCol * pow(max(sd, 0.0), 1400.0) * 1.5 * above;
        float night = uNight;
        col += stars(rd) * night * smoothstep(0.03, 0.2, rd.y);
        float md = dot(rd, uMoonDir);
        if (md > 0.999){
          vec3 mx = normalize(cross(uMoonDir, vec3(0, 1, 0)));
          vec3 my = cross(mx, uMoonDir);
          vec2 mu = vec2(dot(rd, mx), dot(rd, my)) / 0.0085;
          float r = length(mu);
          float crater = sfFbm(mu * 2.1 + 4.0) * 0.45 + 0.6;
          vec3 n3 = normalize(vec3(mu, sqrt(max(0.0, 1.0 - r * r))));
          float lit = smoothstep(-0.15, 0.2, dot(n3, normalize(vec3(-1.0 + uMoonPhase * 2.0, 0.1, 0.35))));
          col += vec3(1.3, 1.26, 1.15) * smoothstep(1.0, 0.93, r) * crater * (0.06 + 0.94 * lit) * 3.0 * night;
        }
        col += vec3(0.12, 0.15, 0.22) * pow(max(md, 0.0), 300.0) * 0.6 * night;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const geo = new THREE.SphereGeometry(10, 64, 32);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  return scene;
}

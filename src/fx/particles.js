// What drifts in the air: cherry petals in spring, maple leaves in autumn, snow in winter, fireflies over the
// stream on a summer night, and steam off the kettles and the bath. Petals, leaves and snow live in a box that
// travels with the camera and wraps, so the density is the same wherever you stand and nothing is ever spawned;
// they never fall inside the house. All of it is lit like the rest of the garden: the sky the particle can see,
// the sun, the haze.
import * as THREE from 'three';
import { U, NOISE, UNIFORMS_GLSL, ATMOS, VIS_GLSL } from '../core/shared.js';
import { LAYER_FX } from '../core/pipeline.js';
import { VOLUMES } from '../house/house.js';
import { STREAM, pondD } from '../garden/site.js';
import { tex } from '../core/assets.js';
import { rng } from '../lib/math.js';

// the house with its eaves: nothing drifts in under the roofs
const HOUSE = Object.values(VOLUMES).map((v) => new THREE.Vector4(v.x0 - 0.95, v.z0 - 0.95, v.x1 + 0.95, v.z1 + 0.95));

const HEAD = /* glsl */ `
precision highp float;
${UNIFORMS_GLSL}
${NOISE}
`;

function quads(n, attrs) {
  const g = new THREE.InstancedBufferGeometry();
  const base = new THREE.PlaneGeometry(1, 1);
  g.index = base.index;
  g.setAttribute('position', base.getAttribute('position'));
  g.setAttribute('uv', base.getAttribute('uv'));
  for (const [k, size, fill] of attrs) {
    const a = new Float32Array(n * size);
    for (let i = 0; i < n; i++) fill(a, i * size, i);
    g.setAttribute(k, new THREE.InstancedBufferAttribute(a, size));
  }
  g.instanceCount = n;
  return g;
}

function mesh(g, m, order) {
  const o = new THREE.Mesh(g, m);
  o.frustumCulled = false;
  o.layers.set(LAYER_FX);
  o.renderOrder = order;
  return o;
}

// ------------------------------------------------------------------ petals, leaves, snow
function drift(kind, n, opts, map) {
  const R = rng(opts.seed);
  const g = quads(n, [
    ['aP', 3, (a, o) => { a[o] = R(); a[o + 1] = R(); a[o + 2] = R(); }],
    ['aR', 4, (a, o) => { a[o] = R(); a[o + 1] = R(); a[o + 2] = R(); a[o + 3] = R(); }],
  ]);
  const m = new THREE.ShaderMaterial({
    defines: { [kind.toUpperCase()]: '' },
    uniforms: {
      ...U,
      uBox: { value: new THREE.Vector3(...opts.box) },
      uFall: { value: opts.fall },
      uSize: { value: new THREE.Vector2(...opts.size) },
      uPresence: { value: 0 },
      uHouse: { value: HOUSE },
      tLeaf: { value: map || null },
    },
    vertexShader: /* glsl */ `${HEAD}
      attribute vec3 aP;
      attribute vec4 aR;
      uniform vec3 uBox;
      uniform float uFall, uPresence;
      uniform vec2 uSize;
      uniform vec4 uHouse[4];
      varying vec3 vWP, vN;
      varying vec2 vUv;
      varying float vA;
      varying vec4 vR;
      mat3 rot(vec3 ax, float a) {
        ax = normalize(ax); float s = sin(a), c = cos(a), oc = 1.0 - c;
        return mat3(oc*ax.x*ax.x + c, oc*ax.x*ax.y + ax.z*s, oc*ax.z*ax.x - ax.y*s,
                    oc*ax.x*ax.y - ax.z*s, oc*ax.y*ax.y + c, oc*ax.y*ax.z + ax.x*s,
                    oc*ax.z*ax.x + ax.y*s, oc*ax.y*ax.z - ax.x*s, oc*ax.z*ax.z + c);
      }
      void main() {
        float t = uTime;
        vec3 wind = vec3(uWind.x, 0.0, uWind.y) * (0.25 + 0.3 * aR.x);
        vec3 p = aP * uBox + vec3(0.0, -uFall * (0.75 + 0.5 * aR.y), 0.0) * t + wind * t;
        #ifndef SNOW
          // flutter: petals and leaves side-slip as they tumble
          p.x += sin(t * (0.7 + aR.z) + aR.w * 6.283) * 0.45;
          p.z += cos(t * (0.6 + aR.x) + aR.y * 6.283) * 0.45;
        #else
          p.x += sin(t * 0.4 + aR.z * 6.283) * 0.18;
        #endif
        // the box around the camera reaches a little below it and further above
        vec3 off = vec3(uBox.x * 0.5, uBox.y * 0.28, uBox.z * 0.5);
        vec3 rel = mod(p - cameraPosition + off, uBox) - off;
        vec3 wp = cameraPosition + rel;
        float edge = max(abs(rel.x) / off.x, abs(rel.z) / off.z);
        float a = (1.0 - smoothstep(0.7, 1.0, edge)) * smoothstep(0.25, 0.9, length(rel)) * step(aR.w, uPresence);
        a *= smoothstep(-0.6, -0.2, wp.y);
        for (int i = 0; i < 4; i++) {
          vec4 b = uHouse[i];
          if (wp.x > b.x && wp.x < b.z && wp.z > b.y && wp.z < b.w && wp.y < 5.2) a = 0.0;
        }
        float s = mix(uSize.x, uSize.y, aR.z);
        #ifdef SNOW
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          wp += (right * position.x + up * position.y) * s;
          vN = normalize(cameraPosition - wp);
        #else
          mat3 R = rot(vec3(aR.x - 0.5, 0.6, aR.y - 0.5), t * (1.2 + aR.z * 2.2) + aR.w * 6.283) * rot(vec3(1.0, 0.0, 0.3), aR.y * 3.0 + t * 0.7);
          wp += R * vec3(position.x * s, position.y * s * 1.0, 0.0);
          vN = R * vec3(0.0, 0.0, 1.0);
        #endif
        vWP = wp; vUv = uv; vA = a; vR = aR;
        gl_Position = a > 0.001 ? projectionMatrix * viewMatrix * vec4(wp, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `${HEAD}
      ${ATMOS}
      ${VIS_GLSL}
      uniform sampler2D tLeaf;
      varying vec3 vWP, vN;
      varying vec2 vUv;
      varying float vA;
      varying vec4 vR;
      void main() {
        vec2 q = vUv * 2.0 - 1.0;
        vec3 albedo; float mask; float transl;
        #ifdef PETAL
          // a somei-yoshino petal: an oval with a notch at its tip, flushing pink toward the base
          vec2 e = vec2(q.x * 1.45, q.y * 1.0 + 0.1);
          mask = smoothstep(1.0, 0.86, length(e));
          mask *= smoothstep(0.08, 0.2, length(vec2(q.x * 1.8, q.y - 0.98)));
          albedo = mix(vec3(0.98, 0.9, 0.92), vec3(0.95, 0.68, 0.76), smoothstep(0.2, -0.9, q.y) * (0.5 + 0.5 * vR.x));
          transl = 0.45;
        #elif defined(LEAF)
          vec4 l = texture2D(tLeaf, vUv);
          mask = l.a;
          vec3 tint = vR.x < 0.5 ? vec3(0.62, 0.07, 0.03) : vR.x < 0.82 ? vec3(0.72, 0.24, 0.04) : vec3(0.7, 0.48, 0.07);
          albedo = tint * l.r * 1.25;
          transl = 0.5;
        #else
          mask = smoothstep(1.0, 0.25, length(q));
          albedo = vec3(0.92);
          transl = 0.2;
        #endif
        float a = mask * vA;
        if (a < 0.02) discard;
        vec3 n = normalize(vN);
        if (dot(n, cameraPosition - vWP) < 0.0) n = -n;
        float skyVis; vec4 vs;
        vec3 amb = sfAmbient(vWP, n, skyVis, vs);
        // under the canopy or the eaves the sun is mostly blocked; no shadow lookup for a speck
        float sunVis = smoothstep(0.15, 0.6, skyVis);
        float nl = dot(n, uSunDir);
        vec3 sun = uSunCol * (max(nl, 0.0) + max(-nl, 0.0) * transl) * sunVis;
        vec3 col = albedo * (amb + sun) / PI;
        col = sfAtmos(col, vWP);
        #ifdef SNOW
          gl_FragColor = vec4(col, a * 0.85);
        #else
          if (a < 0.45) discard;
          gl_FragColor = vec4(col, 1.0);
        #endif
      }`,
    transparent: kind === 'snow',
    depthWrite: kind !== 'snow',
    side: THREE.DoubleSide,
  });
  return mesh(g, m, 10);
}

// ------------------------------------------------------------------ fireflies
function fireflies(n) {
  const R = rng(611);
  const homes = [];
  // along the stream and round the pond's edge, a little above the water
  for (let i = 0; i < n; i++) {
    let x, z;
    if (R() < 0.45) {
      const k = Math.floor(R() * (STREAM.length - 1)), f = R();
      x = STREAM[k][0] + (STREAM[k + 1][0] - STREAM[k][0]) * f + (R() - 0.5) * 1.6;
      z = STREAM[k][1] + (STREAM[k + 1][1] - STREAM[k][1]) * f + (R() - 0.5) * 1.2;
    } else {
      for (let tries = 0; tries < 50; tries++) {
        x = -12 + R() * 21; z = 3 + R() * 10;
        const d = pondD(x, z);
        if (d > -0.8 && d < 1.6) break;
      }
    }
    homes.push([x, 0.25 + R() * 1.3, z]);
  }
  const g = quads(n, [
    ['aP', 3, (a, o, i) => { a[o] = homes[i][0]; a[o + 1] = homes[i][1]; a[o + 2] = homes[i][2]; }],
    ['aR', 4, (a, o) => { a[o] = R(); a[o + 1] = R(); a[o + 2] = R(); a[o + 3] = R(); }],
  ]);
  const m = new THREE.ShaderMaterial({
    uniforms: { ...U, uPresence: { value: 0 } },
    vertexShader: /* glsl */ `${HEAD}
      attribute vec3 aP;
      attribute vec4 aR;
      uniform float uPresence;
      varying vec2 vUv;
      varying float vI;
      void main() {
        float t = uTime * (0.25 + 0.2 * aR.x) + aR.y * 40.0;
        vec3 p = aP + vec3(sfNoise(vec2(t, aR.z * 9.0)) - 0.5, (sfNoise(vec2(aR.w * 7.0, t * 0.8)) - 0.5) * 0.5, sfNoise(vec2(t + 3.1, aR.x * 5.0)) - 0.5) * 1.6;
        // each one glows for a second or two, then rests in the dark
        float ph = fract(uTime * (0.22 + 0.16 * aR.z) + aR.w);
        float blink = smoothstep(0.0, 0.18, ph) * (1.0 - smoothstep(0.35, 0.62, ph));
        vI = blink * step(aR.x, uPresence);
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 wp = p + (right * position.x + up * position.y) * 0.14;
        vUv = uv;
        gl_Position = vI > 0.002 ? projectionMatrix * viewMatrix * vec4(wp, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `${HEAD}
      varying vec2 vUv;
      varying float vI;
      void main() {
        float r = length(vUv * 2.0 - 1.0);
        float core = smoothstep(0.16, 0.0, r), halo = pow(max(0.0, 1.0 - r), 3.0);
        vec3 c = vec3(0.72, 1.0, 0.32) * (core * 9.0 + halo * 0.9) * vI;
        if (core + halo < 0.002) discard;
        gl_FragColor = vec4(c, 0.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });
  return mesh(g, m, 12);
}

// ------------------------------------------------------------------ steam
function steam(points) {
  const per = 28;
  const n = points.length * per;
  const R = rng(97);
  const g = quads(n, [
    ['aP', 4, (a, o, i) => { const p = points[Math.floor(i / per)]; a[o] = p[0]; a[o + 1] = p[1]; a[o + 2] = p[2]; a[o + 3] = p[3]; }],
    ['aR', 4, (a, o) => { a[o] = R(); a[o + 1] = R(); a[o + 2] = R(); a[o + 3] = R(); }],
  ]);
  const m = new THREE.ShaderMaterial({
    uniforms: { ...U },
    vertexShader: /* glsl */ `${HEAD}
      attribute vec4 aP;
      attribute vec4 aR;
      varying vec2 vUv;
      varying float vA, vLife;
      varying vec3 vWP;
      void main() {
        // aP.w: how wide the source is (a kettle's lid, or the whole tub)
        float life = fract(uTime / (3.2 + aR.x * 1.6) + aR.y);
        vec3 p = aP.xyz + vec3((aR.z - 0.5) * aP.w, 0.0, (aR.w - 0.5) * aP.w);
        p.y += life * (0.34 + 0.2 * aR.z);
        p.x += (sfNoise(vec2(life * 2.0, aR.x * 11.0)) - 0.5) * 0.25 * life + uWind.x * 0.06 * life;
        p.z += (sfNoise(vec2(aR.y * 13.0, life * 2.0)) - 0.5) * 0.25 * life + uWind.y * 0.06 * life;
        float s = mix(0.035, 0.24, life) * (0.8 + 0.4 * aR.w) * (aP.w > 1.0 ? 1.8 : 1.0);
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 wp = p + (right * position.x + up * position.y) * s;
        vUv = uv; vLife = life; vWP = wp;
        vA = smoothstep(0.0, 0.18, life) * (1.0 - smoothstep(0.45, 1.0, life));
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `${HEAD}
      ${VIS_GLSL}
      varying vec2 vUv;
      varying float vA, vLife;
      varying vec3 vWP;
      void main() {
        vec2 q = vUv * 2.0 - 1.0;
        float wisp = sfNoise(q * 2.2 + vec2(vLife * 3.0, -vLife * 5.0)) * 0.6 + sfNoise(q * 4.7 - vLife * 4.0) * 0.4;
        float a = smoothstep(1.0, 0.1, length(q)) * smoothstep(0.25, 0.75, wisp) * vA * 0.16;
        if (a < 0.003) discard;
        float sv; vec4 vs;
        vec3 amb = sfAmbient(vWP, normalize(cameraPosition - vWP), sv, vs);
        vec3 col = vec3(0.9) * amb / PI * 1.3;
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true,
    depthWrite: false,
  });
  return mesh(g, m, 11);
}

export function createParticles(house) {
  const group = new THREE.Group();
  group.name = 'particles';
  const petals = drift('petal', 1400, { seed: 21, box: [28, 10, 28], fall: 0.32, size: [0.011, 0.016] });
  const leafMap = tex('./assets/stamps/maple_1.webp', false, false);
  const leaves = drift('leaf', 420, { seed: 33, box: [28, 11, 28], fall: 0.55, size: [0.035, 0.05] }, leafMap);
  const snow = drift('snow', 5200, { seed: 44, box: [24, 11, 24], fall: 0.75, size: [0.006, 0.013] });
  const flies = fireflies(110);
  group.add(petals, leaves, snow, flies);
  const sp = house.steamPoints || [];
  if (sp.length) group.add(steam(sp));
  return {
    group,
    // presence by season (spring petals, autumn leaves, winter snow, summer fireflies at night)
    update(season, night) {
      petals.material.uniforms.uPresence.value = season.x * 0.85;
      leaves.material.uniforms.uPresence.value = season.z * 0.8;
      snow.material.uniforms.uPresence.value = season.w;
      flies.material.uniforms.uPresence.value = season.y * Math.min(1, Math.max(0, (night - 0.25) / 0.5));
      petals.visible = season.x > 0.01;
      leaves.visible = season.z > 0.01;
      snow.visible = season.w > 0.01;
      flies.visible = season.y > 0.01 && night > 0.25;
    },
  };
}

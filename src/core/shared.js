// One set of uniforms drives every material, so light, air and season stay consistent everywhere.
// Lighting model for patched materials:
//   direct  = sun (or moon) with the shadow map, plus lamps (andon, toro, pendants) without shadows
//   ambient = sky and sunlit-ground light weighted by a baked visibility volume (L1 moments per voxel),
//             plus one bounce inside rooms for the light that came in
// The volume is what makes the rooms darken away from the garden, eaves shade the engawa and stones sit in the moss.
import * as THREE from 'three';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const v4 = (x = 0, y = 0, z = 0, w = 0) => new THREE.Vector4(x, y, z, w);

export const MAX_LAMPS = 16;

export const U = {
  uTime: { value: 0 },
  uSunDir: { value: v3(0.3, 0.4, 0.5).normalize() }, // toward the key light (sun, or moon at night)
  uTrueSun: { value: v3(0.3, 0.4, 0.5).normalize() },
  uMoonDir: { value: v3(-0.3, 0.5, -0.8).normalize() },
  uSunCol: { value: v3(4, 3, 2) },
  uFogSun: { value: v3(1, 0.7, 0.4) },
  uFogAway: { value: v3(0.4, 0.5, 0.6) },
  uFogParams: { value: v4(0.00012, 0.02, 0.18, 0) }, // haze per m, ground-mist density, mist falloff per m, -
  uWind: { value: v4(0.6, -0.8, 0.4, 0) },
  uSeason: { value: v4(1, 0, 0, 0) }, // spring, summer, autumn, winter weights
  uSnow: { value: 0 },
  // the pond's surface: snow never lies below it
  uWaterY: { value: -1e4 },
  uNight: { value: 0 },
  uLampOn: { value: 0 },
  uSkyZen: { value: v3(0.1, 0.2, 0.4) },
  uSkyHor: { value: v3(0.5, 0.55, 0.6) },
  uSkyL: { value: v3(0.4, 0.45, 0.55) }, // mean sky radiance seen by an open surface
  uGndL: { value: v3(0.1, 0.09, 0.07) }, // mean radiance of the sunlit garden
  uBounceL: { value: v3(0.05, 0.04, 0.03) }, // inter-reflection inside rooms, per unit occlusion
  uVolMin: { value: v3(-40, -0.5, -32) },
  uVolInv: { value: v3(1 / 80, 1 / 12, 1 / 64) },
  tVisSky: { value: null },
  tVisGnd: { value: null },
  // the coarse volume round the property (sky in the lower half of its depth, ground in the upper); w = its depth
  tVisOut: { value: null },
  uVolOutMin: { value: v4(0, 0, 0, 0) },
  uVolOutInv: { value: v3(1, 1, 1) },
  uLampPos: { value: Array.from({ length: MAX_LAMPS }, () => v4(0, -999, 0, 1)) },
  uLampCol: { value: Array.from({ length: MAX_LAMPS }, () => v3()) },
  uExposure: { value: 1 },
  // baked light (core/lightmap.js): sky, lamps, and the sun's bounced light at the two baked hours either side
  tLmSky: { value: null },
  tLmLamp: { value: null },
  tLmSunA: { value: null },
  tLmSunB: { value: null },
  uLmSunT: { value: 0 },
  uLmSun: { value: v3() },
  uLmLamp: { value: 0 },
  uLmR: { value: v4(-12, 2, -12, 2) }, // log2 range of the sky map (xy) and the lamp map (zw)
  uLmRS: { value: v4(-12, 2, -12, 2) }, // the two sun maps
  uLmDebug: { value: 0 }, // 1 sky, 2 sun, 3 lamp map shown raw
  // light probes for what has no lightmap: one 3D texture, colour channel by basis stacked along z
  tPrb: { value: null },
  uPrbMin: { value: v3(0, 0, 0) },
  uPrbStep: { value: 1 },
  uPrbN: { value: v4(1, 1, 1, 1) }, // probes along x, y, z; bases
  uPrbHi: { value: v4(0, 0, 0, 0) }, // log2 range tops of sky, lamp, sun A, sun B
  uPrbSun: { value: new THREE.Vector2(2, 2) }, // slabs of sun A and B
  uPrbOn: { value: 0 },
};

// the options each patched material was built with, so a lightmapped variant can be made from it
const PATCHED = new WeakMap();
export function lightmapVariant(mat) {
  const opts = PATCHED.get(mat);
  if (!opts) return null;
  const m = mat.clone();
  patch(m, { ...opts, lm: true });
  return m;
}

export const NOISE = /* glsl */ `
#ifndef PI
#define PI 3.141592653589793
#endif
float sfHash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float sfHash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 sfHash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float sfNoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(sfHash12(i), sfHash12(i+vec2(1,0)), u.x), mix(sfHash12(i+vec2(0,1)), sfHash12(i+vec2(1,1)), u.x), u.y); }
float sfFbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * sfNoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return s; }
float sfFbm3(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ s += a * sfNoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return s; }
`;

export const UNIFORMS_GLSL = /* glsl */ `
uniform float uTime, uSnow, uWaterY, uNight, uLampOn, uExposure;
uniform vec3 uSunDir, uTrueSun, uMoonDir, uSunCol, uFogSun, uFogAway, uSkyZen, uSkyHor, uSkyL, uGndL, uBounceL, uVolMin, uVolInv;
uniform vec4 uFogParams, uWind, uSeason;
uniform vec4 uLampPos[${MAX_LAMPS}];
uniform vec3 uLampCol[${MAX_LAMPS}];
`;

// Aerial perspective: thin haze for the far hills, plus a ground mist that pools in the garden at dawn.
export const ATMOS = /* glsl */ `
// ground mist only exists out in the garden; patched materials lower this for surfaces inside the house
float sfMistK = 1.0;
float sfExpLayer(float k, float b, float y0, float dy, float dist){
  float h0 = k * exp(-b * y0);
  return abs(dy) > 0.01 ? h0 * (1.0 - exp(-b * dy)) / (b * dy / dist) : h0 * dist;
}
float sfOptical(vec3 ro, vec3 rd, float dist){
  float dy = rd.y * dist;
  float near = min(dist, 160.0);
  vec3 mp = ro + rd * near * 0.5;
  float bank = 0.55 + 0.9 * sfNoise(mp.xz * 0.045 + uTime * vec2(0.013, -0.009)) * sfNoise(mp.xz * 0.11 - uTime * 0.02);
  return uFogParams.x * dist + sfExpLayer(uFogParams.y, uFogParams.z, max(ro.y, 0.0), clamp(dy, -6.0, 600.0), near) * bank * sfMistK;
}
vec3 sfFogColor(vec3 rd){
  float s = max(dot(rd, uTrueSun), 0.0);
  float glow = pow(s, 6.0) * 0.6 + pow(s, 40.0) * 0.4;
  return mix(uFogAway, uFogSun, glow);
}
vec3 sfAtmos(vec3 col, vec3 wp){
  vec3 v = wp - cameraPosition; float dist = length(v); vec3 rd = v / max(dist, 1e-4);
  float T = exp(-sfOptical(cameraPosition, rd, dist));
  return col * T + sfFogColor(rd) * (1.0 - T);
}
`;

// L1 visibility moments: x = fraction of all directions that see the sky (or the open ground), yzw = their
// mean direction. Irradiance for a normal n under radiance L is pi * L * (x + 2 n.yzw) (exact for an open sky).
export const VIS_GLSL = /* glsl */ `
uniform highp sampler3D tVisSky;
#ifndef SF_NO_GVIS
uniform highp sampler3D tVisGnd;
#endif
#ifndef SF_NO_VOUT
uniform highp sampler3D tVisOut;
#endif
uniform vec4 uVolOutMin;
uniform vec3 uVolOutInv;
#ifndef SF_NO_PRB
uniform highp sampler3D tPrb;
#endif
uniform vec3 uPrbMin, uLmSun;
uniform vec4 uPrbN, uPrbHi;
uniform vec2 uPrbSun;
uniform float uPrbStep, uPrbOn, uLmSunT, uLmLamp;
// how much of this point's light came from the probes (their lamp light replaces the unshadowed realtime lamps)
float sfPrbW = 0.0;
vec3 sfAmbientVis(vec3 wp, vec3 n, out float skyVis, out vec4 vsOut);
// a probe basis at grid coordinates f (clamped inside the grid): E(n) = a (1 + r.n), a stored as log2
#ifndef SF_NO_PRB
vec3 sfPrbBasis(vec3 f, float slab, float hi, vec3 n){
  vec2 xy = (f.xy + 0.5) / uPrbN.xy;
  float z = f.z + 0.5, d = uPrbN.z * uPrbN.w * 3.0;
  vec4 r = texture(tPrb, vec3(xy, (slab * uPrbN.z + z) / d));
  vec4 g = texture(tPrb, vec3(xy, ((slab + uPrbN.w) * uPrbN.z + z) / d));
  vec4 b = texture(tPrb, vec3(xy, ((slab + 2.0 * uPrbN.w) * uPrbN.z + z) / d));
  vec3 a = exp2(mix(vec3(-16.0), vec3(hi), vec3(r.x, g.x, b.x))) - exp2(-16.0);
  vec3 k = vec3(dot(r.yzw * 2.0 - 1.0, n), dot(g.yzw * 2.0 - 1.0, n), dot(b.yzw * 2.0 - 1.0, n));
  return a * max(1.0 + k, 0.0);
}
#endif
vec3 sfAmbient(vec3 wp, vec3 n, out float skyVis, out vec4 vsOut){
  vec3 E = sfAmbientVis(wp, n, skyVis, vsOut);
  sfPrbW = 0.0;
  #ifndef SF_NO_PRB
  if (uPrbOn > 0.5) {
    vec3 f = (wp + n * 0.16 - uPrbMin) / uPrbStep;
    vec3 top = uPrbN.xyz - 1.0;
    // fades out over one probe past the grid's sides and top; below it, the lowest layer holds
    float w = smoothstep(-1.0, 0.0, min(min(f.x, top.x - f.x), min(f.z, top.z - f.z))) * smoothstep(-1.0, 0.0, top.y - f.y);
    if (w > 0.0) {
      vec3 fc = clamp(f, vec3(0.0), top);
      vec3 sky = sfPrbBasis(fc, 0.0, uPrbHi.x, n);
      vec3 Ep = PI * (uSkyL * sky + uLmSun * mix(sfPrbBasis(fc, uPrbSun.x, uPrbHi.z, n), sfPrbBasis(fc, uPrbSun.y, uPrbHi.w, n), uLmSunT) + uLmLamp * sfPrbBasis(fc, 1.0, uPrbHi.y, n));
      E = mix(E, Ep, w);
      skyVis = mix(skyVis, 0.5 * dot(sky, vec3(0.2126, 0.7152, 0.0722)), w);
      sfPrbW = w;
    }
  }
  #endif
  return E;
}
vec3 sfAmbientVis(vec3 wp, vec3 n, out float skyVis, out vec4 vsOut){
  vec3 uvw = (wp + n * 0.16 - uVolMin) * uVolInv;
  vec4 vs = vec4(0.5, 0.0, 0.25, 0.0), vg = vec4(0.5, 0.0, -0.25, 0.0);
  // the fine volume's last metre hands over to the coarse one round it (the woods beyond the wall)
  vec3 em = min(uvw, 1.0 - uvw) / uVolInv;
  float wIn = smoothstep(0.0, 1.0, min(min(em.x, em.y), em.z));
  #ifndef SF_NO_VOUT
  if (wIn < 1.0 && uVolOutMin.w > 0.5) {
    vec3 uo = (wp + n * 0.5 - uVolOutMin.xyz) * uVolOutInv;
    if (all(greaterThan(uo, vec3(0.0))) && all(lessThan(uo, vec3(1.0)))) {
      float z = clamp(uo.z, 0.5 / uVolOutMin.w, 1.0 - 0.5 / uVolOutMin.w) * 0.5;
      vs = texture(tVisOut, vec3(uo.xy, z));
      vg = texture(tVisOut, vec3(uo.xy, z + 0.5));
    }
  }
  #endif
  if (wIn > 0.0) {
    vs = mix(vs, texture(tVisSky, uvw), wIn);
    #ifndef SF_NO_GVIS
    vg = mix(vg, texture(tVisGnd, uvw), wIn);
    #endif
  }
  float es = max(vs.x + 2.0 * dot(n, vs.yzw), 0.0);
  float eg = max(vg.x + 2.0 * dot(n, vg.yzw), 0.0);
  float occl = clamp(1.0 - vs.x - vg.x, 0.0, 1.0);
  skyVis = vs.x;
  vsOut = vs;
  // sky radiance brighter toward the sun's side of the sky
  float sunSide = 0.75 + 0.5 * max(dot(normalize(vs.yzw + vec3(0.0, 1e-3, 0.0)), normalize(vec3(uTrueSun.x, 0.0, uTrueSun.z))), 0.0);
  return PI * (uSkyL * es * sunSide + uGndL * eg + uBounceL * occl * (vs.x * 4.0 + vg.x * 2.0 + 0.15));
}
`;

const LAMPS = /* glsl */ `
vec3 sfLamps(vec3 wp, vec3 nW, float wrap){
  vec3 acc = vec3(0.0);
  for (int i = 0; i < ${MAX_LAMPS}; i++){
    vec4 lp = uLampPos[i];
    vec3 L = lp.xyz - wp;
    float d2 = dot(L, L);
    float r2 = lp.w * lp.w;
    if (d2 > r2 * 25.0) continue;
    float d = sqrt(d2);
    float att = 1.0 / (1.0 + d2 / r2) * smoothstep(5.0 * lp.w, 2.5 * lp.w, d);
    float ndl = (dot(nW, L / d) + wrap) / (1.0 + wrap);
    acc += uLampCol[i] * att * max(ndl, 0.0);
  }
  return acc;
}
`;

const LM_VERT_HEAD = /* glsl */ `
#ifndef USE_UV1
attribute vec2 uv1;
#endif
varying vec2 vSfLm;
`;
const LM_FRAG_HEAD = /* glsl */ `
varying vec2 vSfLm;
uniform sampler2D tLmSky, tLmLamp, tLmSunA, tLmSunB;
uniform vec4 uLmR, uLmRS;
// the maps store log2 of the light, spread over each map's own range
vec3 sfLmDec(vec3 c, vec2 r){ return exp2(mix(vec3(r.x), vec3(r.y), c)) - exp2(r.x); }
uniform float uLmDebug;
vec3 sfLmDbg = vec3(0.0);
`;

const VERT_HEAD = /* glsl */ `
varying vec3 vSfWP;
${UNIFORMS_GLSL}
${NOISE}
`;

// wind for plants: bend grows with height above the instance origin (h in metres) times flexibility
export const WIND_GLSL = /* glsl */ `
vec3 sfWindOffset(vec3 wpRoot, float h, float flex){
  vec2 wd = normalize(uWind.xy);
  float gust = 0.55 + 0.45 * sin(dot(wpRoot.xz, wd) * 0.21 - uTime * 1.1) * sin(dot(wpRoot.xz, vec2(-wd.y, wd.x)) * 0.13 + uTime * 0.47);
  float s = uWind.z * (0.6 + gust) * flex;
  float bend = h * h * 0.012;
  float flutter = sin(uTime * 2.3 + wpRoot.x * 0.7 + wpRoot.z * 0.9) * 0.25 + sin(uTime * 4.1 + wpRoot.z * 1.3) * 0.12;
  return vec3(wd.x, 0.0, wd.y) * bend * s * (1.0 + flutter) + vec3(0.0, -bend * s * 0.12, 0.0);
}
`;

const FRAG_HEAD = /* glsl */ `
varying vec3 vSfWP;
${UNIFORMS_GLSL}
${NOISE}
${ATMOS}
${LAMPS}
${VIS_GLSL}
`;

const WP_VERT = /* glsl */ `
  {
    vec4 sfWP4 = vec4(transformed, 1.0);
    #ifdef USE_BATCHING
      sfWP4 = batchingMatrix * sfWP4;
    #endif
    #ifdef USE_INSTANCING
      sfWP4 = instanceMatrix * sfWP4;
    #endif
    vSfWP = (modelMatrix * sfWP4).xyz;
  }
`;

// the sun's shadow: the near map (fitted round what the camera looks at) and, past its edge, the far one over the
// whole site and the woods; three's own directional loop is rewritten to take it for light 0
const SUN_SHADOW_GLSL = /* glsl */ `
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
float sfSunShadow(float biasAdd){
  float s = getShadow(directionalShadowMap[0], directionalLightShadows[0].shadowMapSize, directionalLightShadows[0].shadowIntensity, directionalLightShadows[0].shadowBias + biasAdd, directionalLightShadows[0].shadowRadius, vDirectionalShadowCoord[0]);
  #if NUM_DIR_LIGHT_SHADOWS > 1
  vec3 c = vDirectionalShadowCoord[0].xyz / vDirectionalShadowCoord[0].w;
  float wN = smoothstep(0.0, 0.12, min(min(c.x, 1.0 - c.x), min(c.y, 1.0 - c.y))) * step(c.z, 1.0);
  if (wN < 1.0) {
    float f = getShadow(directionalShadowMap[1], directionalLightShadows[1].shadowMapSize, directionalLightShadows[1].shadowIntensity, directionalLightShadows[1].shadowBias + biasAdd * 3.0, directionalLightShadows[1].shadowRadius, vDirectionalShadowCoord[1]);
    s = mix(f, s, wN);
  }
  #endif
  return s;
}
#endif
`;
const DIR_SHADOW_LINE = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
if (!THREE.ShaderChunk.lights_fragment_begin.includes(DIR_SHADOW_LINE)) throw new Error('three lights_fragment_begin changed: directional shadow line not found');
// light 1 is the far sun: dark, there for its shadow map alone
const LIGHTS_BEGIN = THREE.ShaderChunk.lights_fragment_begin.replace(DIR_SHADOW_LINE, `#if UNROLLED_LOOP_INDEX == 0
		directLight.color *= ( directLight.visible && receiveShadow ) ? sfSunShadow( 0.0 ) : 1.0;
		#endif`);

/**
 * Patch a built-in material (Standard or Physical) with the shared world.
 * opts: { snow: how much snow can settle 0..1, wrap: lamp wrap, trans: back-lit transmission 0..1 (paper, leaves),
 *         hooks: {vertex, vertexPost, beginNormal, map, normal, alpha, preLight, light, post}, key,
 *         probes: false for shaders out of the house that are short of texture units;
 *         outer: false likewise, without the coarse visibility volume beyond the fine one;
 *         gvis: false for upward-facing ground, whose lower hemisphere is the open ground itself }
 */
export function patch(mat, opts = {}) {
  PATCHED.set(mat, opts);
  const lm = !!opts.lm;
  const snow = opts.snow ?? 0;
  const trans = opts.trans ?? 0;
  const hooks = opts.hooks || {};
  const extraUniforms = opts.uniforms || {};
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, extraUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}\n${lm ? LM_VERT_HEAD : ''}\n${opts.vertexHead || ''}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${hooks.beginNormal || ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${hooks.vertex || ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${WP_VERT}\n${lm ? 'vSfLm = uv1;' : ''}\n${hooks.vertexPost || ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${opts.probes === false ? '#define SF_NO_PRB\n' : ''}${opts.outer === false ? '#define SF_NO_VOUT\n' : ''}${opts.gvis === false ? '#define SF_NO_GVIS\n' : ''}${FRAG_HEAD}\n${lm ? LM_FRAG_HEAD : ''}\n${opts.fragHead || ''}`)
      .replace('#include <shadowmap_pars_fragment>', `#include <shadowmap_pars_fragment>\n${SUN_SHADOW_GLSL}`)
      .replace('#include <lights_fragment_begin>', LIGHTS_BEGIN)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${hooks.map || ''}`)
      // ambient light enters through three's own image-based path, so its Fresnel energy split still applies; the
      // panorama's own irradiance is unoccluded (a room would be lit like the open lawn), so it is replaced
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
        float sfSkyVis;
        ${lm ? /* glsl */ `
        // baked: sky light and its bounces, the sun's bounced light, the lamps with their shadows and bounces
        vec3 sfLs = sfLmDec(texture(tLmSky, vSfLm).rgb, uLmR.xy);
        vec3 sfLa = sfLmDec(texture(tLmSunA, vSfLm).rgb, uLmRS.xy);
        vec3 sfLb = sfLmDec(texture(tLmSunB, vSfLm).rgb, uLmRS.zw);
        vec3 sfLl = sfLmDec(texture(tLmLamp, vSfLm).rgb, uLmR.zw);
        vec3 sfE = PI * (uSkyL * sfLs + uLmSun * mix(sfLa, sfLb, uLmSunT) + uLmLamp * sfLl);
        sfSkyVis = dot(sfLs, vec3(0.2126, 0.7152, 0.0722));
        sfLmDbg = uLmDebug < 1.5 ? sfLs : uLmDebug < 2.5 ? mix(sfLa, sfLb, uLmSunT) : sfLl;` : /* glsl */ `
        vec4 sfVs;
        vec3 sfE = sfAmbient(vSfWP, sfNW, sfSkyVis, sfVs);`}
        iblIrradiance = sfE;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${hooks.normal || ''}`)
      .replace('#include <alphatest_fragment>', `${hooks.alpha || ''}\n#include <alphatest_fragment>`)
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        vec3 sfNW = inverseTransformDirection(normal, viewMatrix);
        ${hooks.preLight || ''}
        {
          float sfSnowK = ${snow.toFixed(3)} * uSnow;
          if (sfSnowK > 0.001) {
            float sn = sfNoise(vSfWP.xz * 1.7) * 0.5 + sfNoise(vSfWP.xz * 0.31) * 0.5;
            float cover = smoothstep(0.5 - 0.3 * sfSnowK, 0.8 - 0.2 * sfSnowK, sfNW.y + (sn - 0.5) * 0.45) * smoothstep(0.0, 0.35, sfSnowK + sn * 0.3 - 0.15)
              * smoothstep(uWaterY - 0.04, uWaterY + 0.01, vSfWP.y);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.95), cover);
            #ifdef STANDARD
              roughnessFactor = mix(roughnessFactor, 0.6, cover);
            #endif
          }
        }`
      )
      .replace(
        '#include <lights_fragment_end>',
        /* glsl */ `#include <lights_fragment_end>
        {${lm ? /* glsl */ `
          sfMistK = smoothstep(0.05, 0.3, sfSkyVis * 0.5);
          reflectedLight.indirectSpecular *= clamp(sfSkyVis * 1.6, 0.0, 1.0);` : /* glsl */ `
          sfMistK = smoothstep(0.05, 0.3, sfSkyVis);
          // reflections only of the sky that this point can see
          vec3 sfR = reflect(normalize(vSfWP - cameraPosition), sfNW);
          float sfSpec = clamp((sfVs.x + 2.0 * dot(sfR, sfVs.yzw)) * 1.6, 0.0, 1.0);
          reflectedLight.indirectSpecular *= sfSpec;
          vec3 sfLampE = sfLamps(vSfWP, sfNW, ${(opts.wrap ?? 0).toFixed(2)}) * (1.0 - sfPrbW);
          reflectedLight.directDiffuse += BRDF_Lambert(material.diffuseColor) * sfLampE;`}
          ${trans > 0 ? /* glsl */ `
          // light arriving on the back face shows through (washi, leaves): sun with shadow plus the far side's ambient
          {
            float sfSh = 1.0;
            #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
              sfSh = sfSunShadow(0.0015);
            #endif
            float sfBack = max(dot(-sfNW, uSunDir), 0.0);
            float sfSkyVisB; vec4 sfVsB;
            vec3 sfEB = sfAmbient(vSfWP, -sfNW, sfSkyVisB, sfVsB);
            vec3 sfT = (uSunCol * sfBack * sfSh + sfEB + sfLamps(vSfWP, -sfNW, 0.0) * (1.0 - sfPrbW)) * ${trans.toFixed(3)};
            reflectedLight.directDiffuse += BRDF_Lambert(material.diffuseColor) * sfT;
          }` : ''}
          ${hooks.light || ''}
        }`
      )
      .replace('#include <fog_fragment>', `gl_FragColor.rgb = sfAtmos(gl_FragColor.rgb, vSfWP);\n${hooks.post || ''}${lm ? '\nif (uLmDebug > 0.5) gl_FragColor.rgb = pow(sfLmDbg, vec3(0.25)) * 0.5;' : ''}`);
    if (opts.onShader) opts.onShader(sh);
  };
  mat.customProgramCacheKey = () => 'sf:' + (opts.key || mat.type) + ':' + snow + ':' + trans + (lm ? ':lm' : '') + (opts.probes === false ? ':np' : '') + (opts.outer === false ? ':nvo' : '') + (opts.gvis === false ? ':ngv' : '');
  return mat;
}

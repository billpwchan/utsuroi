// Time of day and season. The sun follows Kyoto's sky (35°N) on a fixed late-spring declination, so every
// season keeps the same walk timetable; sky, sun and ambient colours come from one single-scattering model that
// the sky shader shares, so the light on the house always matches the sky behind it.
import * as THREE from 'three';
import { U } from '../core/shared.js';
import { clamp, lerp, smoothstep } from '../lib/math.js';

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

const LAT = (35 * Math.PI) / 180;
const DECL = (12 * Math.PI) / 180;
// the site is turned so the garden front faces a little east of south; the morning sun rakes the corridors
const SITE_ROT = (-18 * Math.PI) / 180;

export function sunDirAt(hours, out = new THREE.Vector3()) {
  const h = ((hours - 12) / 12) * Math.PI;
  const sinAlt = Math.sin(LAT) * Math.sin(DECL) + Math.cos(LAT) * Math.cos(DECL) * Math.cos(h);
  const alt = Math.asin(clamp(sinAlt, -1, 1));
  // azimuth measured from south toward west
  const az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(LAT) - Math.tan(DECL) * Math.cos(LAT));
  const a = az + SITE_ROT;
  // +z is south, +x is east
  out.set(-Math.sin(a) * Math.cos(alt), Math.sin(alt), Math.cos(a) * Math.cos(alt));
  return out;
}

// ---- single scattering (Nishita) on the CPU, mirrored in the sky shader ----
const RE = 6360e3, RA = 6420e3;
const BR = [5.8e-6, 13.5e-6, 33.1e-6];
const BM = 21e-6, HR = 8000, HM = 1200, G = 0.76;
const SUN_I = 22;
const NIGHT_SKY = new THREE.Vector3(0.006, 0.009, 0.02);

function raySphere(oy, dx, dy, dz, r) {
  // origin (0, oy, 0), unit direction; far intersection
  const b = oy * dy;
  const c = oy * oy - r * r;
  const d = b * b - c;
  if (d < 0) return -1;
  return -b + Math.sqrt(d);
}

function opticalToSun(py, px, pz, sx, sy, sz) {
  // from point p (relative to earth centre) toward the sun
  const b = px * sx + py * sy + pz * sz;
  const c = px * px + py * py + pz * pz - RA * RA;
  const t = -b + Math.sqrt(Math.max(0, b * b - c));
  const n = 6, ds = t / n;
  let odR = 0, odM = 0;
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) * ds;
    const x = px + sx * s, y = py + sy * s, z = pz + sz * s;
    const h = Math.hypot(x, y, z) - RE;
    if (h < 0) return null;
    odR += Math.exp(-h / HR) * ds;
    odM += Math.exp(-h / HM) * ds;
  }
  return [odR, odM];
}

function skyRadiance(d, s, out) {
  const oy = RE + 2;
  const t = raySphere(oy, d.x, d.y, d.z, RA);
  const n = 12, ds = t / n;
  const mu = d.x * s.x + d.y * s.y + d.z * s.z;
  const pR = (3 / (16 * Math.PI)) * (1 + mu * mu);
  const pM = (3 / (8 * Math.PI)) * ((1 - G * G) * (1 + mu * mu)) / ((2 + G * G) * Math.pow(1 + G * G - 2 * G * mu, 1.5));
  let r0 = 0, r1 = 0, r2 = 0, m0 = 0, m1 = 0, m2 = 0, odR = 0, odM = 0;
  for (let i = 0; i < n; i++) {
    const st = (i + 0.5) * ds;
    const x = d.x * st, y = oy + d.y * st, z = d.z * st;
    const h = Math.hypot(x, y, z) - RE;
    const hr = Math.exp(-h / HR) * ds, hm = Math.exp(-h / HM) * ds;
    odR += hr; odM += hm;
    const l = opticalToSun(y, x, z, s.x, s.y, s.z);
    if (!l) continue;
    for (let c = 0; c < 3; c++) {
      const tau = BR[c] * (odR + l[0]) + BM * 1.1 * (odM + l[1]);
      const a = Math.exp(-tau);
      if (c === 0) { r0 += a * hr; m0 += a * hm; }
      else if (c === 1) { r1 += a * hr; m1 += a * hm; }
      else { r2 += a * hr; m2 += a * hm; }
    }
  }
  out.set((r0 * BR[0] * pR + m0 * BM * pM) * SUN_I, (r1 * BR[1] * pR + m1 * BM * pM) * SUN_I, (r2 * BR[2] * pR + m2 * BM * pM) * SUN_I);
  return out;
}

function sunTransmittance(s, out) {
  const l = opticalToSun(RE + 2, 0, 0, s.x, Math.max(s.y, -0.02), s.z);
  if (!l) return out.set(0, 0, 0);
  return out.set(Math.exp(-(BR[0] * l[0] + BM * 1.1 * l[1])), Math.exp(-(BR[1] * l[0] + BM * 1.1 * l[1])), Math.exp(-(BR[2] * l[0] + BM * 1.1 * l[1])));
}

const _d = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _h2 = new THREE.Vector3();

export class Environment {
  constructor() {
    this.hours = 6;
    this.hoursTarget = 6;
    this.season = 0;
    this.seasonW = new THREE.Vector4(1, 0, 0, 0);
    this.sun = new THREE.Vector3();
    this.moon = new THREE.Vector3();
    this.sunTrans = new THREE.Vector3();
    this.zen = new THREE.Vector3();
    this.hor = new THREE.Vector3();
    this.horAway = new THREE.Vector3();
    this.horSun = new THREE.Vector3();
    this.night = 0;
    this.lampOn = 0;
    this.sunY = 0.3;
    this.exposure = 1;
    this.mist = 1;
    this.update(0, true);
  }

  setSeason(i) { this.season = ((i % 4) + 4) % 4; }
  setHours(h, snap = false) {
    this.hoursTarget = h;
    if (snap) this.hours = h;
  }

  update(dt, snap = false) {
    // the walk drives time continuously; ease only to soften scroll jitter
    this.hours = snap ? this.hoursTarget : lerp(this.hours, this.hoursTarget, 1 - Math.exp(-dt * 6));

    const ks = snap ? 1 : 1 - Math.exp(-dt * 0.7);
    const target = [0, 0, 0, 0];
    target[this.season] = 1;
    const w = this.seasonW;
    w.set(lerp(w.x, target[0], ks), lerp(w.y, target[1], ks), lerp(w.z, target[2], ks), lerp(w.w, target[3], ks));
    U.uSeason.value.copy(w);
    U.uSnow.value = w.w;

    const sun = sunDirAt(this.hours, this.sun);
    U.uTrueSun.value.copy(sun);
    // a late-rising, nearly full moon over the east wall for the night garden
    const moon = this.moon.set(0.62, 0.42, -0.36).normalize();
    U.uMoonDir.value.copy(moon);

    // sky samples
    const sAbove = _t.copy(sun);
    skyRadiance(_d.set(0, 1, 0), sAbove, this.zen);
    const sx = sun.x, sz = sun.z, sl = Math.hypot(sx, sz) || 1;
    // the sun-side horizon away from the aureole: a low sun's halo is a few degrees across and must not set the
    // colour of the whole haze, the ground bounce and the rooms
    {
      const ca = Math.cos(0.44), sa = Math.sin(0.44), ux = sx / sl, uz = sz / sl;
      skyRadiance(_d.set(ux * ca - uz * sa, 0.06, ux * sa + uz * ca).normalize(), sAbove, this.horSun);
      skyRadiance(_d.set(ux * ca + uz * sa, 0.06, -ux * sa + uz * ca).normalize(), sAbove, _h2);
      this.horSun.add(_h2).multiplyScalar(0.5);
    }
    skyRadiance(_d.set(-sx / sl, 0.06, -sz / sl).normalize(), sAbove, this.horAway);
    // single scattering strips too much blue from the long horizon path and leaves it yellow-green; multiple
    // scattering returns it as a pale blue-white. Pull toward that by day, keep the low sun's orange.
    // At first and last light the same defect reads as a lime veil over everything: there the sun side goes to
    // peach-gold and the side away from it to the lavender of the earth's shadow, as in dawn photographs.
    {
      const k = 0.7 * smoothstep(0.04, 0.3, sun.y);
      const lo = 0.65 * (1 - smoothstep(0.04, 0.3, sun.y)) * smoothstep(-0.1, 0.0, sun.y);
      const tint = [[1.18, 0.96, 0.78], [0.9, 0.93, 1.16]];
      [this.horSun, this.horAway].forEach((v, i) => {
        const l = 0.2126 * v.x + 0.7152 * v.y + 0.0722 * v.z;
        v.set(lerp(v.x, l * 0.9, k), lerp(v.y, l * 1.0, k), lerp(v.z, l * 1.18, k));
        const t = tint[i];
        v.set(lerp(v.x, l * t[0], lo), lerp(v.y, l * t[1], lo), lerp(v.z, l * t[2], lo));
      });
    }
    this.hor.copy(this.horSun).add(this.horAway).multiplyScalar(0.5);
    sunTransmittance(sun, this.sunTrans);

    const e = sun.y;
    const night = smoothstep(0.0, -0.2, e);
    this.night = night;
    U.uNight.value = night;
    // a room dims long before the garden does: the lamps are lit while the sun is still a hand above the hills, and
    // in the morning they are put out as soon as it is up
    this.lampOn = this.hours < 12 ? smoothstep(0.08, -0.06, e) : smoothstep(0.24, 0.0, e);
    this.sunY = e;
    U.uLampOn.value = this.lampOn;

    // night sky floor: moonlit blue
    const zen = U.uSkyZen.value.copy(this.zen).add(NIGHT_SKY);
    const hor = U.uSkyHor.value.copy(this.hor).addScaledVector(NIGHT_SKY, 1.4);

    // key light: sun above the horizon, the moon below it; fade through the swap so shadows never jump
    const sunCol = _c.copy(this.sunTrans).multiplyScalar(SUN_I * 0.32 * smoothstep(-0.03, 0.04, e));
    const moonCol = new THREE.Vector3(0.11, 0.14, 0.22).multiplyScalar(0.55);
    if (e > -0.05) {
      U.uSunDir.value.copy(sun);
      U.uSunCol.value.copy(sunCol);
      this.keyIsSun = true;
    } else {
      U.uSunDir.value.copy(moon);
      U.uSunCol.value.copy(moonCol).multiplyScalar(smoothstep(-0.05, -0.16, e));
      this.keyIsSun = false;
    }

    // mean sky radiance on an open surface, ground radiance from the sunlit garden, bounce inside rooms
    // the bright patch of sky round a low sun is a small solid angle: weight it lightly, so shade under a low sun
    // stays cool and the sunlit side carries the warmth
    const skyL = U.uSkyL.value.copy(zen).multiplyScalar(0.62).addScaledVector(this.horAway, 0.28).addScaledVector(this.horSun, 0.1).addScaledVector(NIGHT_SKY, 0.38 * 1.4);
    const sunOnGround = Math.max(e, 0) * 0.8;
    const gl = U.uGndL.value.set(
      0.2 * (sunCol.x * sunOnGround + Math.PI * skyL.x) / Math.PI,
      0.19 * (sunCol.y * sunOnGround + Math.PI * skyL.y) / Math.PI,
      0.16 * (sunCol.z * sunOnGround + Math.PI * skyL.z) / Math.PI
    );
    U.uBounceL.value.set(skyL.x * 0.5 + gl.x * 1.2, skyL.y * 0.5 + gl.y * 1.15, skyL.z * 0.45 + gl.z * 1.05).multiplyScalar(0.32);

    // haze colours toward and away from the sun
    U.uFogSun.value.copy(this.horSun).add(_d.set(0.004, 0.006, 0.012));
    U.uFogAway.value.copy(this.horAway).add(_d.set(0.004, 0.006, 0.012));
    // ground mist thickest at first light, burns off by mid-morning, returns faintly at dusk
    const dawn = smoothstep(4.8, 5.8, this.hours) * (1 - smoothstep(6.6, 9.5, this.hours));
    const dusk = smoothstep(18.2, 19.6, this.hours) * 0.35;
    this.mist = dawn + dusk + 0.06;
    // the mist lies low: thick on the moss, thin at eye height, so a tree a few metres off keeps its contrast
    U.uFogParams.value.set(0.00006 + 0.0001 * night, 0.014 * this.mist, 0.95, 0);

    // reference exposure by sun height; the post chain adapts on top of this to what the camera sees
    this.exposure = lerp(1.0, 2.0, smoothstep(0.25, -0.12, e)) * lerp(1, 1.25, night);
    U.uExposure.value = this.exposure;
  }
}

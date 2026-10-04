// The walk: fourteen resting places from the gate before dawn to the pond at night, joined by one continuous
// camera path. Scroll is the day. Between two rests the camera glides only through the middle of the scroll
// span; at each end it is still while the clock keeps turning, so a little scroll at a rest watches the light move.
import * as THREE from 'three';
import { clamp, smoothstep, lerp } from '../lib/math.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// each stop: where you stand, what you look at, the hour, lens, and the route that leads to the next stop
export const STOPS = [
  { id: 'gate', h: 5.1, pos: V(-21.5, 1.62, 23.2), look: V(-21.0, 2.3, 6.0), fov: 46,
    route: [V(-21.5, 1.6, 19.2), V(-21.4, 1.6, 16.0)] },
  { id: 'roji', h: 5.85, pos: V(-21.35, 1.6, 11.8), look: V(-12.3, 1.3, 8.1), fov: 50,
    route: [V(-21.0, 1.6, 7.4), V(-20.55, 1.62, 3.4), V(-20.5, 1.62, 1.9)] },
  { id: 'genkan', h: 6.5, pos: V(-20.75, 1.62, 0.95), look: V(-21.7, 1.25, -2.6), fov: 52,
    route: [V(-20.4, 1.9, 1.15), V(-19.6, 2.08, 1.15), V(-17.6, 2.1, 1.15)] },
  { id: 'irigawa', h: 7.5, pos: V(-15.2, 2.08, 1.12), look: V(-4.0, 1.85, 1.0), fov: 50,
    route: [V(-13.6, 2.05, 1.1), V(-13.2, 1.9, 0.2)] },
  { id: 'zashiki', h: 8.6, pos: V(-12.9, 1.5, -1.9), look: V(-12.6, 1.15, 9.0), fov: 54, seated: true,
    route: [V(-12.1, 1.55, -1.5), V(-10.9, 1.65, -1.4), V(-9.0, 1.75, -1.0), V(-7.6, 1.6, -0.9)] },
  { id: 'tea', h: 10.0, pos: V(-7.05, 1.38, -0.15), look: V(-5.4, 0.85, -1.9), fov: 56, seated: true,
    route: [V(-8.0, 1.65, -0.6), V(-9.1, 1.9, 0.2), V(-8.9, 2.0, 1.1), V(-6.0, 2.02, 1.12), V(-4.2, 2.02, 1.12)] },
  { id: 'bridge', h: 11.6, pos: V(-3.64, 2.02, 1.5), look: V(-3.4, 0.2, 7.5), fov: 52,
    route: [V(-1.6, 2.02, 1.1), V(0.9, 2.05, 1.15), V(2.6, 2.05, 0.6), V(3.4, 1.9, -0.2)] },
  { id: 'hearth', h: 14.4, pos: V(4.6, 1.52, -0.75), look: V(0.2, 1.35, -2.4), fov: 54, seated: true,
    route: [V(4.6, 1.8, 0.0), V(4.7, 2.0, 0.9), V(6.6, 1.9, 1.15), V(8.1, 1.6, 1.2)] },
  { id: 'engawa', h: 16.0, pos: V(7.84, 1.48, 1.25), look: V(0.74, 0.6, 8.5), fov: 52, seated: true,
    route: [V(8.7, 1.7, 0.2), V(8.66, 2.0, -1.0), V(9.4, 2.0, -2.25), V(10.4, 1.8, -2.3)] },
  { id: 'kare', h: 17.0, pos: V(12.74, 1.48, -2.2), look: V(14.6, 0.25, 5.5), fov: 50, seated: true,
    route: [V(10.4, 1.75, -2.3), V(9.95, 1.95, -2.4), V(9.95, 1.95, -3.3), V(10.6, 1.8, -4.4), V(11.9, 1.6, -5.7)] },
  { id: 'bedroom', h: 17.95, pos: V(12.25, 1.45, -5.95), look: V(9.2, 1.15, -2.9), fov: 54, seated: true,
    route: [V(12.0, 1.7, -4.9), V(12.25, 2.0, -4.1), V(13.2, 2.0, -4.1), V(13.7, 1.8, -3.5)] },
  { id: 'bath', h: 18.5, pos: V(13.95, 1.62, -3.35), look: V(17.6, 1.05, -5.6), fov: 54,
    route: [V(15.2, 1.7, -3.6), V(16.9, 2.2, -4.6), V(19.0, 6.5, 1.5), V(10.0, 7.5, 13.5), V(3.0, 2.4, 14.0)] },
  { id: 'night', h: 19.8, pos: V(0.6, 1.68, 13.3), look: V(-1.6, 2.0, 0.2), fov: 48,
    route: [V(1.0, 6.0, 20.0), V(-1.0, 24.0, 28.0)] },
  { id: 'above', h: 20.4, pos: V(-3.0, 44.0, 17.0), look: V(-3.0, 0.0, -2.5), fov: 44, route: [] },
];

const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export class Journey {
  constructor(camera, house) {
    this.camera = camera;
    this.house = house;
    // one centripetal spline through every stop and route point; remember where each stop sits on it
    const pts = [];
    this.anchor = [];
    for (const s of STOPS) {
      this.anchor.push(pts.length);
      pts.push(s.pos);
      for (const r of s.route) pts.push(r);
    }
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    // arc length at every control point
    const N = 4000;
    this.samples = [];
    let len = 0, prev = this.curve.getPoint(0);
    const cpT = pts.map(() => 0);
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = this.curve.getPoint(t);
      len += p.distanceTo(prev);
      prev = p;
      this.samples.push(len);
    }
    // control point i sits at t = i / (n - 1) for an open Catmull-Rom curve
    this.anchorS = this.anchor.map((i) => this.samples[Math.round((i / (pts.length - 1)) * N)]);
    void cpT;
    this.total = len;
    this.n = STOPS.length;
    this.progress = 0; // in stops, 0 .. n-1
    this.target = 0;
    this.vel = 0;
    this.pos = V(0, 0, 0);
    this.look = V(0, 0, 0);
    this.look.copy(STOPS[0].look);
    this.pos.copy(STOPS[0].pos);
    this.dir = V(0, 0, -1);
    this.parallax = new THREE.Vector2();
    this.parallaxT = new THREE.Vector2();
    this.drag = new THREE.Vector2();
    this.dragT = new THREE.Vector2();
    this.dwell = 0.22;
    this._a = V(0, 0, 0); this._b = V(0, 0, 0); this._c = V(0, 0, 0); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this.hours = STOPS[0].h;
    this.fov = STOPS[0].fov;
    this.stop = 0;
    this.restK = 1;
  }

  tAtLength(s) {
    // binary search in the arc-length table
    const a = this.samples;
    let lo = 0, hi = a.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (a[mid] < s) lo = mid + 1; else hi = mid;
    }
    const i = Math.max(1, lo);
    const f = (s - a[i - 1]) / Math.max(1e-6, a[i] - a[i - 1]);
    return (i - 1 + f) / (a.length - 1);
  }

  // where the camera is at a given progress (in stops)
  evaluate(p, outPos, outLook) {
    const n = this.n;
    p = clamp(p, 0, n - 1);
    const i = Math.min(n - 2, Math.floor(p));
    const f = p - i;
    const d = this.dwell;
    const u = ease(clamp((f - d) / (1 - 2 * d), 0, 1));
    const s = lerp(this.anchorS[i], this.anchorS[i + 1], u);
    const t = this.tAtLength(s);
    this.curve.getPoint(t, outPos);
    // look: from this stop's view to the next, turning toward the direction of travel mid-way
    const A = STOPS[i], B = STOPS[i + 1];
    const da = this._a.subVectors(A.look, A.pos).normalize();
    const db = this._b.subVectors(B.look, B.pos).normalize();
    const tan = this.curve.getTangent(Math.min(0.9999, t + 0.004), this._c);
    tan.y *= 0.35;
    tan.normalize();
    const dir = da.clone().lerp(db, smoothstep(0.25, 0.85, u)).normalize();
    const w = Math.pow(Math.sin(Math.PI * u), 1.4) * 0.75;
    dir.lerp(tan, w).normalize();
    outLook.copy(outPos).addScaledVector(dir, 6);
    return { i, f, u, hours: lerp(A.h, B.h, f), fov: lerp(A.fov, B.fov, smoothstep(0.2, 0.8, u)), rest: 1 - Math.sin(Math.PI * u) };
  }

  update(dt, scrollStops) {
    this.target = clamp(scrollStops, 0, this.n - 1);
    // critically damped follow of the scroll target: no jitter, no overshoot
    const w = 5.5;
    const x = this.progress - this.target;
    const a = -w * w * x - 2 * w * this.vel;
    this.vel += a * dt;
    this.progress += this.vel * dt;
    if (Math.abs(this.progress - this.target) < 1e-5 && Math.abs(this.vel) < 1e-5) { this.progress = this.target; this.vel = 0; }
    const r = this.evaluate(this.progress, this.pos, this.look);
    this.hours = r.hours;
    this.fov = r.fov;
    this.stop = r.f < 0.5 ? r.i : r.i + 1;
    this.restK = r.rest;
    this.segU = r.u;
    this.segI = r.i;

    // look around: pointer parallax always, drag to look further while resting; both spring back
    const k = 1 - Math.exp(-dt * 3.0);
    this.parallax.lerp(this.parallaxT, k);
    this.drag.lerp(this.dragT, 1 - Math.exp(-dt * 6));
    const cam = this.camera;
    cam.position.copy(this.pos);
    cam.lookAt(this.look);
    this._e.setFromQuaternion(cam.quaternion, 'YXZ');
    this._e.y += -this.parallax.x * 0.06 - this.drag.x;
    this._e.x = clamp(this._e.x - this.parallax.y * 0.035 - this.drag.y, -1.45, 1.2);
    cam.quaternion.setFromEuler(this._e);
    // a breath of motion while still, so a rest never looks like a frozen frame
    const t = performance.now() * 0.001;
    cam.position.y += Math.sin(t * 0.55) * 0.006 * this.restK;
    cam.position.x += Math.sin(t * 0.31) * 0.004 * this.restK;
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }

    // sliding doors open as you approach and close behind you
    for (const d of this.house.doors) {
      const dx = this.pos.x - d.at[0], dz = this.pos.z - d.at[1];
      const want = dx * dx + dz * dz < d.r * d.r ? 1 : 0;
      d.t += (want - d.t) * (1 - Math.exp(-dt * 2.2));
      const e = d.t * d.t * (3 - 2 * d.t);
      d.obj.position.copy(d.base).addScaledVector(d.dir, d.dist * e);
    }
  }
}

// The residence: four volumes stepped along the garden (entrance wing, shoin wing with the zashiki and tea room,
// the living hall, the private wing with bedroom and bath), a roofed bridge over the stream, a courtyard.
// Coordinates in metres: +x east, +z south (the garden side), floor level FL above the ground.
import * as THREE from 'three';
import { Kit, Geo, vec } from './kit.js';
import { M, OPEN_H, shojiPanel, fusumaPanel, glassPanel, koshiPanel, mergeKit, tatami, LAYOUTS, saoCeiling, irimoyaRoof, gableRoof } from './parts.js';
import { rng } from '../lib/math.js';

export const FL = 0.55;
const P = 0.12; // post section
const K = FL + OPEN_H; // underside of the kamoi head rail

export const VOLUMES = {
  A: { x0: -22.75, x1: -15.47, z0: -3.64, z1: 1.82 },
  B: { x0: -15.47, x1: -4.55, z0: -5.46, z1: 1.82 },
  C: { x0: -0.91, x1: 8.19, z0: -6.37, z1: 0.455 },
  D: { x0: 8.19, x1: 16.38, z0: -8.19, z1: -2.73 },
};

// rooms: used for lamps, sound zones and the plan view labels
export const ROOMS = {
  doma: { x0: -22.75, x1: -20.02, z0: -0.91, z1: 1.82, label: 'Genkan', jp: '玄関' },
  corridor: { x0: -20.02, x1: -15.47, z0: 0.455, z1: 1.82, label: 'Corridor', jp: '廊下' },
  zashiki: { x0: -15.47, x1: -10.92, z0: -3.185, z1: 0.455, label: 'Zashiki', jp: '座敷' },
  tsugi: { x0: -10.92, x1: -7.28, z0: -3.185, z1: 0.455, label: 'Tsugi-no-ma', jp: '次の間' },
  tea: { x0: -7.28, x1: -4.55, z0: -2.275, z1: 0.455, label: 'Tea room', jp: '茶室' },
  irigawa: { x0: -15.47, x1: -4.55, z0: 0.455, z1: 1.82, label: 'Irigawa', jp: '入側' },
  living: { x0: -0.91, x1: 5.46, z0: -4.095, z1: 0.455, label: 'Hearth room', jp: '囲炉裏の間' },
  dining: { x0: 5.46, x1: 8.19, z0: -4.095, z1: 0.455, label: 'Dining', jp: '食事の間' },
  bedroom: { x0: 8.19, x1: 12.74, z0: -6.37, z1: -2.73, label: 'Bedroom', jp: '寝室' },
  bath: { x0: 13.65, x1: 16.38, z0: -7.28, z1: -2.73, label: 'Bath', jp: '湯殿' },
};

export class House {
  constructor(materials) {
    this.mats = materials;
    this.k = new Kit(materials);
    this.group = new THREE.Group();
    this.group.name = 'house';
    this.doors = [];
    this.lamps = [];
    // scanned models the caller places once they have loaded (placeScans)
    this.scans = [];
    this.R = rng(1907);
  }

  // ---------- primitives ----------
  post(x, z, y0, y1, s = P, mat = 'hinoki') {
    this.k.g(mat).box(vec(x, (y0 + y1) / 2, z), vec(s, y1 - y0, s), { grain: 'y', chamfer: 0.008, col: this.tint(), uo: this.R() * 4 });
  }
  tint(k = 0.05) {
    const v = 1 + (this.R() - 0.5) * 2 * k;
    return [v, v, v * (1 + (this.R() - 0.5) * 0.02)];
  }
  // horizontal member along an axis-aligned line, centred on it: h tall, d deep
  rail(x0, z0, x1, z1, y0, h, d, mat = 'hinoki', opts = {}) {
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const off = opts.off || 0;
    if (alongX) this.k.g(mat).boxMM(Math.min(x0, x1), y0, z0 - d / 2 + off, Math.max(x0, x1), y0 + h, z0 + d / 2 + off, { grain: 'x', chamfer: opts.chamfer ?? 0.004, col: this.tint(0.04), uo: this.R() * 4 });
    else this.k.g(mat).boxMM(x0 - d / 2 + off, y0, Math.min(z0, z1), x0 + d / 2 + off, y0 + h, Math.max(z0, z1), { grain: 'z', chamfer: opts.chamfer ?? 0.004, col: this.tint(0.04), uo: this.R() * 4 });
  }
  wall(x0, z0, x1, z1, y0, y1, mat = 'clay', t = 0.075) {
    if (y1 <= y0 + 0.005) return;
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const g = this.k.g(mat);
    const uo = this.R() * 5, vo = this.R() * 5;
    if (alongX) g.boxMM(Math.min(x0, x1) + P / 2, y0, z0 - t / 2, Math.max(x0, x1) - P / 2, y1, z0 + t / 2, { grain: 'x', uo, vo });
    else g.boxMM(x0 - t / 2, y0, Math.min(z0, z1) + P / 2, x0 + t / 2, y1, Math.max(z0, z1) - P / 2, { grain: 'z', uo, vo });
  }
  // a wall with a window cut through it: centre c along the wall, width w, sill wy0, head wy1
  wallOpen(x0, z0, x1, z1, y0, y1, mat, c, w, wy0, wy1, t = 0.075) {
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const g = this.k.g(mat);
    const a0 = (alongX ? Math.min(x0, x1) : Math.min(z0, z1)) + P / 2, a1 = (alongX ? Math.max(x0, x1) : Math.max(z0, z1)) - P / 2;
    const o0 = c - w / 2, o1 = c + w / 2;
    const piece = (b0, b1, ya, yb) => {
      if (b1 - b0 < 0.005 || yb - ya < 0.005) return;
      if (alongX) g.boxMM(b0, ya, z0 - t / 2, b1, yb, z0 + t / 2, { grain: 'x', uo: this.R() * 5, vo: this.R() * 5 });
      else g.boxMM(x0 - t / 2, ya, b0, x0 + t / 2, yb, b1, { grain: 'z', uo: this.R() * 5, vo: this.R() * 5 });
    };
    piece(a0, o0, y0, y1);
    piece(o1, a1, y0, y1);
    piece(o0, o1, y0, wy0);
    piece(o0, o1, wy1, y1);
  }
  floor(x0, z0, x1, z1, y, mat = 'boards', dir = 'x', t = 0.05) {
    const g = this.k.g(mat);
    g.boxMM(x0, y - t, z0, x1, y, z1, { grain: dir, col: this.tint(0.03), uo: this.R() * 6, vo: this.R() * 6 });
  }
  // sills and head rails of an opening line
  frame(x0, z0, x1, z1, opts = {}) {
    const y0 = opts.y ?? FL;
    this.rail(x0, z0, x1, z1, y0 - 0.045, 0.045, 0.1, opts.sill || 'hinoki'); // shikii
    this.rail(x0, z0, x1, z1, y0 + OPEN_H, 0.045, 0.1, 'hinoki'); // kamoi
    if (opts.nageshi) this.rail(x0, z0, x1, z1, y0 + OPEN_H + 0.045, 0.1, 0.14, 'hinoki', { off: 0 });
  }

  /**
   * Sliding panels on a line. type: 'shoji' | 'fusuma' | 'glass' | 'koshi'.
   * n panels in two tracks; open: array per panel of slide fraction (-1..1 of its width) for static ones;
   * animate: list of panel indices that become door objects, with their open slide (fraction of width).
   */
  slides(type, x0, z0, x1, z1, n, opts = {}) {
    const y0 = opts.y ?? FL;
    const h = opts.h ?? OPEN_H;
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const L = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const dirSign = alongX ? Math.sign(x1 - x0) : Math.sign(z1 - z0);
    const pw = L / n + 0.025;
    const ry = alongX ? (dirSign > 0 ? 0 : Math.PI) : (dirSign > 0 ? -Math.PI / 2 : Math.PI / 2);
    const along = alongX ? vec(dirSign, 0, 0) : vec(0, 0, dirSign);
    const normal = alongX ? vec(0, 0, 1) : vec(1, 0, 0);
    const static_ = opts.open || [];
    for (let i = 0; i < n; i++) {
      const k = new Kit(this.mats);
      if (type === 'shoji') shojiPanel(k, pw, h, opts);
      else if (type === 'fusuma') fusumaPanel(k, pw, h, { face: opts.face, pullLeft: i % 2 === 1, uo: this.R() * 3 });
      else if (type === 'glass') glassPanel(k, pw, h, opts);
      else if (type === 'koshi') koshiPanel(k, pw, h);
      const track = (i % 2 === 0 ? 1 : -1) * 0.018 * (opts.flipTracks ? -1 : 1);
      const base = vec(alongX ? x0 : x0, y0, alongX ? z0 : z0).addScaledVector(along, (L * i) / n - 0.0125).addScaledVector(normal, track);
      const anim = opts.animate && opts.animate.find((a) => a.i === i);
      const m = new THREE.Matrix4().makeRotationY(ry);
      if (anim) {
        const grp = k.build(new THREE.Group());
        grp.position.copy(base);
        grp.rotation.y = ry;
        this.group.add(grp);
        this.doors.push({ obj: grp, base: base.clone(), dir: along.clone(), dist: anim.slide * pw, at: anim.at, r: anim.r ?? 3.5, t: 0, chapter: anim.chapter });
      } else {
        const off = (static_[i] || 0) * pw;
        m.setPosition(base.clone().addScaledVector(along, off));
        mergeKit(this.k, k, m);
      }
    }
  }

  // stones under the posts and a dark skirting between them, so the floor reads as raised on a crawlspace.
  // hole: [x0, z0, x1, z1] of a sunken floor (the doma) the crawlspace must not fill
  foundation(x0, z0, x1, z1, posts, hole) {
    const st = this.k.g('stone');
    for (const [x, z] of posts) st.box(vec(x, 0.08, z), vec(0.3 + this.R() * 0.06, 0.2, 0.3 + this.R() * 0.06), { grain: 'y', chamfer: 0.04, uo: this.R() * 9, vo: this.R() * 9 });
    const d = this.k.g('dark');
    const inset = 0.06;
    const a = [x0 + inset, z0 + inset, x1 - inset, z1 - inset];
    const parts = [];
    if (!hole) parts.push(a);
    else {
      const [hx0, hz0, hx1, hz1] = hole;
      parts.push([a[0], a[1], a[2], Math.max(a[1], hz0)], [a[0], Math.min(a[3], hz1), a[2], a[3]]);
      parts.push([a[0], Math.max(a[1], hz0), Math.max(a[0], hx0), Math.min(a[3], hz1)], [Math.min(a[2], hx1), Math.max(a[1], hz0), a[2], Math.min(a[3], hz1)]);
    }
    for (const [px0, pz0, px1, pz1] of parts) if (px1 - px0 > 0.01 && pz1 - pz0 > 0.01) d.boxMM(px0, 0, pz0, px1, FL - 0.06, pz1, { grain: 'x' });
  }

  // perimeter posts every step along a rectangle, skipping listed points
  perimeterPosts(x0, z0, x1, z1, step, y1, skip = []) {
    const pts = [];
    const add = (x, z) => {
      if (skip.some(([sx, sz]) => Math.abs(sx - x) < 0.05 && Math.abs(sz - z) < 0.05)) return;
      if (pts.some(([px, pz]) => Math.abs(px - x) < 0.05 && Math.abs(pz - z) < 0.05)) return;
      pts.push([x, z]);
    };
    const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step);
    for (let i = 0; i <= nx; i++) { add(x0 + ((x1 - x0) * i) / nx, z0); add(x0 + ((x1 - x0) * i) / nx, z1); }
    for (let j = 0; j <= nz; j++) { add(x0, z0 + ((z1 - z0) * j) / nz); add(x1, z0 + ((z1 - z0) * j) / nz); }
    for (const [x, z] of pts) this.post(x, z, 0.18, y1, 0.13, 'hinoki');
    return pts;
  }

  // ---------- the plan ----------
  build() {
    this.entranceWing();
    this.shoinWing();
    this.bridge();
    this.livingWing();
    this.privateWing();
    this.k.build(this.group);
    const main = this.k;
    this.k = new Kit(this.mats);
    this.roofs();
    this.roofGroup = this.k.build(new THREE.Group());
    this.roofGroup.name = 'roofs';
    this.group.add(this.roofGroup);
    this.k = main;
    return this;
  }

  entranceWing() {
    const { x0, x1, z0, z1 } = VOLUMES.A;
    const top = 2.95; // wall plate
    const posts = this.perimeterPosts(x0, z0, x1, z1, 1.82, top);
    this.foundation(x0, z0, x1, z1, posts, [-22.75, -0.91, -20.02, 1.82]);
    // doma: earthen floor at ground level, a cedar step up to the hall and the corridor
    this.k.g('doma').boxMM(-22.75, 0, -0.91, -20.02, 0.08, 1.82, { grain: 'x' });
    this.k.g('darkwood').boxMM(-22.75, 0.08, -0.98, -20.02, FL, -0.86, { grain: 'x', chamfer: 0.01 }); // agari-kamachi
    this.k.g('darkwood').boxMM(-20.09, 0.08, 0.455, -19.97, FL, 1.82, { grain: 'z', chamfer: 0.01 });
    // kutsunugi stone at the step: a natural flagstone, scanned
    this.scans.push({ model: 'flagstone', look: 'kutsunugi', x: -21.4, y: 0.06, z: -0.5, h: 0.16, yaw: 1.65 });
    // hall
    this.floor(-22.75, -3.64, -20.02, -0.91, FL, 'boards', 'x');
    saoCeiling(this.k, -22.75, -3.64, -20.02, 1.82, 2.95, 'z');
    // corridor
    this.floor(-20.02, 0.455, -15.47, 1.82, FL, 'boards', 'x');
    this.k.g('ceiling').boxMM(-20.02, 2.85, 0.455, -15.47, 2.87, 1.82, { grain: 'x' });
    this.rail(-20.02, 0.455, -15.47, 0.455, 2.81, 0.04, 0.05, 'hinoki');
    // room A1 (closed): tatami under the doors so it is not a void if glimpsed
    this.floor(-20.02, -3.64, -15.47, 0.455, FL - 0.05, 'boards', 'x', 0.04);
    tatami(this.k, -20.02, -3.185, FL, LAYOUTS[10]);
    this.k.g('ceiling').boxMM(-20.02, 2.95, -3.64, -15.47, 2.97, 0.455, { grain: 'x' });

    // south face: plaster + window | entrance lattice doors | corridor glass and shoji
    this.wall(x0, z1, -21.84, z1, 0.18, 1.0, 'plaster');
    this.wall(x0, z1, -21.84, z1, 2.0, top, 'plaster');
    this.slides('koshi', -21.84, 1.86, -21.84 + 0.91 * 0.98, 1.86, 1, { y: 0.1, h: 1.9 });
    this.slides('koshi', -21.84 + 0.91, 1.86, -20.02, 1.86, 1, { y: 0.1, h: 1.9, animate: [{ i: 0, slide: -0.98, at: [-20.9, 4.0], r: 4.0 }] });
    this.rail(-21.84, 1.86, -20.02, 1.86, 2.0, 0.08, 0.14, 'darkwood');
    this.wall(-21.84, z1, -20.02, z1, 2.08, top, 'plaster');
    // genkan window: lattice in the plaster
    for (let i = 0; i < 7; i++) this.k.g('darkwood').box(vec(-22.6 + i * 0.1, 1.5, z1), vec(0.022, 1.0, 0.05), { grain: 'y' });
    this.rail(x0 + 0.06, z1, -21.84, z1, 0.98, 0.04, 0.1, 'darkwood');
    this.rail(x0 + 0.06, z1, -21.84, z1, 1.98, 0.04, 0.1, 'darkwood');
    this.frame(-20.02, z1, -15.47, z1, {});
    this.wall(-20.02, z1, -15.47, z1, K + 0.045, top, 'plaster');
    this.slides('glass', -20.02, z1 + 0.03, -15.47, z1 + 0.03, 6, { open: [0, 0, -0.98, 0.98, 0, 0] });
    this.slides('shoji', -20.02, z1 - 0.06, -15.47, z1 - 0.06, 5, { koshi: 0.2, open: [0, 0, -0.98, 0.98, 0] });
    // west face
    this.wall(x0, z0, x0, -0.91, FL, top, 'plaster');
    this.wall(x0, -0.91, x0, z1, 0.18, top, 'plaster');
    // north face
    this.wall(x0, z0, x1, z0, FL, top, 'plaster');
    // interior
    this.wall(-22.75, -2.73, -20.02, -2.73, FL, 2.95, 'clay');
    this.wall(-20.02, -0.91, -20.02, 0.455, FL, 2.95, 'clay');
    this.frame(-20.02, -2.73, -20.02, -0.91, {});
    this.slides('fusuma', -20.02, -2.73, -20.02, -0.91, 2, {});
    this.wall(-20.02, -2.73, -20.02, -0.91, K + 0.045, 2.95, 'clay');
    this.frame(-20.02, 0.455, -15.47, 0.455, {});
    this.slides('fusuma', -20.02, 0.455, -15.47, 0.455, 4, {});
    this.wall(-20.02, 0.455, -15.47, 0.455, K + 0.045, 2.85, 'clay');
    for (const [x, z] of [[-20.02, -2.73], [-20.02, -0.91], [-20.02, 0.455], [-17.745, 0.455]]) this.post(x, z, FL, 2.95);
    // the hall's alcove: a board shelf for the arrangement
    this.k.g('darkwood').boxMM(-22.2, FL + 0.02, -2.73 + 0.07, -20.6, FL + 0.08, -2.3, { grain: 'x', chamfer: 0.005 });
    this.lamps.push({ p: [-21.4, 2.6, 0.4], c: [1.0, 0.62, 0.3], r: 2.4, i: 1.6, kind: 'pendant' });
  }

  shoinWing() {
    const { x0, x1, z0, z1 } = VOLUMES.B;
    const top = 3.12;
    const posts = this.perimeterPosts(x0, z0, x1, z1, 1.82, top);
    this.foundation(x0, z0, x1, z1, posts);
    // irigawa: polished boards along the garden
    this.floor(x0, 0.455, x1, z1, FL, 'boards', 'x');
    this.k.g('ceiling').boxMM(x0, 2.92, 0.455, x1, 2.94, z1, { grain: 'x' });
    this.rail(x0, 0.455, x1, 0.455, 2.88, 0.04, 0.05);
    // zashiki: ten mats, tokonoma and chigaidana on the north
    this.floor(x0, -3.185, -4.55, 0.455, FL - 0.05, 'boards', 'x', 0.04);
    tatami(this.k, -15.47, -3.185, FL, LAYOUTS[10]);
    tatami(this.k, -10.92, -3.185, FL, LAYOUTS[8]);
    tatami(this.k, -7.28, -2.275, FL, LAYOUTS[4.5]);
    saoCeiling(this.k, -15.47, -3.185, -10.92, 0.455, FL + 2.6, 'x');
    saoCeiling(this.k, -10.92, -3.185, -7.28, 0.455, FL + 2.6, 'x');
    // tea room: low ceiling, a little cramped on purpose
    saoCeiling(this.k, -7.28, -2.275, -4.55, 0.455, FL + 2.0, 'z');
    this.k.g('clay').boxMM(-7.28, FL + 2.0, -2.275, -4.55, FL + 2.62, -2.2, { grain: 'x' });

    // south face: glass doors over the whole length
    this.frame(x0, z1, x1, z1);
    this.wall(x0, z1, x1, z1, K + 0.045, top, 'plaster');
    this.slides('glass', x0, z1 + 0.03, -10.92, z1 + 0.03, 6, { open: [0, 0, -0.98, 0.98, 0, 0] });
    this.slides('glass', -10.92, z1 + 0.03, x1, z1 + 0.03, 8, { open: [0, -0.98, 0.98, 0, 0, 0, 0, 0] });
    // irigawa / rooms: shoji
    this.frame(x0, 0.455, -7.28, 0.455, { nageshi: true });
    this.slides('shoji', x0, 0.455, -10.92, 0.455, 4, { koshi: 0.24, open: [0, -0.98, 0.98, 0] });
    this.slides('shoji', -10.92, 0.455, -7.28, 0.455, 4, { koshi: 0.24, open: [0, -0.98, 0.98, 0] });
    this.ranma(x0, 0.455, -7.28, 0.455, K + 0.145, FL + 2.6);
    // tea room front: earth wall with a low lattice window
    this.wallOpen(-7.28, 0.455, -4.55, 0.455, FL, FL + 2.0, 'clay', -6.5, 0.7, FL + 0.55, FL + 1.25);
    this.window(-6.5, 0.455, 0.7, FL + 0.55, FL + 1.25, 'x');
    for (const x of [-15.47, -13.195, -10.92, -9.1, -7.28]) this.post(x, 0.455, FL, FL + 2.6);
    // zashiki / tsugi-no-ma: fusuma with a carved transom; the middle pair opens as you pass
    this.frame(-10.92, -3.185, -10.92, 0.455, { nageshi: true });
    this.slides('fusuma', -10.92, -3.185, -10.92, 0.455, 4, { face: 'fusuma', animate: [{ i: 1, slide: 0.98, at: [-11.6, -1.4], r: 3.2 }, { i: 2, slide: -0.98, at: [-11.6, -1.4], r: 3.2 }] });
    this.ranma(-10.92, -3.185, -10.92, 0.455, K + 0.145, FL + 2.6);
    // tsugi / tea: two fusuma (the host's door)
    this.wall(-7.28, -3.185, -7.28, -2.275, FL, FL + 2.6, 'clay');
    this.frame(-7.28, -2.275, -7.28, 0.455);
    this.slides('fusuma', -7.28, -2.275, -7.28, 0.455, 3, { face: 'fusuma', animate: [{ i: 1, slide: -0.98, at: [-8.0, -0.9], r: 2.8 }] });
    this.wall(-7.28, -2.275, -7.28, 0.455, K + 0.045, FL + 2.6, 'clay');
    for (const [x, z] of [[-10.92, -3.185], [-10.92, -1.365], [-7.28, -3.185], [-7.28, -2.275], [-7.28, 0.455], [-4.55, -2.275]]) this.post(x, z, FL, FL + 2.6);
    // tokonoma: raised board, lacquered front rail, a natural post, scroll wall
    this.k.g('darkwood').boxMM(-15.47, FL, -4.095, -12.74, FL + 0.12, -3.185, { grain: 'x' });
    this.k.g('lacquer').boxMM(-15.47, FL, -3.24, -12.74, FL + 0.125, -3.17, { grain: 'x', chamfer: 0.004 });
    this.wall(-15.47, -4.095, -12.74, -4.095, FL, FL + 2.6, 'clay');
    this.wall(-15.47, -4.095, -15.47, -3.185, FL, FL + 2.6, 'clay');
    this.k.g('clay').boxMM(-15.47, FL + 2.12, -3.2, -12.74, FL + 2.6, -3.15, { grain: 'x' }); // otoshigake wall
    this.k.g('darkwood').boxMM(-15.47, FL + 2.07, -3.21, -12.74, FL + 2.12, -3.15, { grain: 'x' });
    this.tokoBashira(-12.74, -3.185);
    // chigaidana: staggered shelves and a small cupboard
    this.wall(-12.74, -4.095, -10.92, -4.095, FL, FL + 2.6, 'clay');
    this.k.g('darkwood').boxMM(-12.74, FL, -4.095, -10.92, FL + 0.05, -3.185, { grain: 'x' });
    this.k.g('darkwood').boxMM(-12.7, FL + 0.95, -4.095, -11.75, FL + 0.98, -3.6, { grain: 'x', chamfer: 0.003 });
    this.k.g('darkwood').boxMM(-11.95, FL + 1.12, -4.095, -10.95, FL + 1.15, -3.6, { grain: 'x', chamfer: 0.003 });
    this.k.g('darkwood').boxMM(-11.79, FL + 0.98, -3.65, -11.76, FL + 1.12, -3.62, { grain: 'y' });
    this.slides('fusuma', -12.74, -3.6, -10.92, -3.6, 2, { y: FL + 1.75, h: 0.6, face: 'fusumaGold' });
    this.k.g('darkwood').boxMM(-12.74, FL + 1.72, -4.095, -10.92, FL + 1.75, -3.6, { grain: 'x' });
    this.k.g('clay').boxMM(-12.74, FL + 2.35, -3.6, -10.92, FL + 2.6, -3.55, { grain: 'x' });
    // tsugi-no-ma north: closets
    this.frame(-10.92, -3.185, -7.28, -3.185);
    this.slides('fusuma', -10.92, -3.185, -7.28, -3.185, 4, { face: 'fusuma' });
    this.wall(-10.92, -3.185, -7.28, -3.185, K + 0.045, FL + 2.6, 'clay');
    // tea room: its own small tokonoma, an earth wall, a shitaji-mado to the east
    this.wall(-7.28, -2.275, -5.46, -2.275, FL, FL + 2.0, 'clay');
    this.k.g('straw').boxMM(-5.46, FL, -3.185, -4.55, FL + 0.08, -2.275, { grain: 'x' });
    this.wall(-5.46, -3.185, -4.55, -3.185, FL, FL + 2.0, 'clay');
    this.wall(-5.46, -3.185, -5.46, -2.275, FL + 1.75, FL + 2.0, 'clay');
    this.k.g('weathered').box(vec(-5.46, FL + 1.0, -2.275), vec(0.09, 2.0, 0.09), { grain: 'y', chamfer: 0.02 });
    this.wallOpen(-4.55, -2.275, -4.55, 0.455, FL, FL + 2.0, 'clay', -0.9, 0.62, FL + 0.7, FL + 1.35);
    this.window(-4.55, -0.9, 0.62, FL + 0.7, FL + 1.35, 'z');
    this.hearth(-6.37, -0.91);
    // west wall of the zashiki, north wall and the back strip
    this.wall(x0, -3.185, x0, 0.455, FL, FL + 2.6, 'clay');
    this.wall(x0, z0, x1, z0, FL, top, 'plaster');
    this.wall(x0, z0, x0, -4.095, FL, top, 'plaster');
    this.wall(x1, z0, x1, -2.275, FL, top, 'plaster');
    this.wall(x1, -2.275, x1, 0.455, FL + 2.0, top, 'plaster');
    this.wall(-15.47, -4.095, -4.55, -4.095, FL + 2.6, top, 'clay');
    this.floor(x0, z0, x1, -4.095, FL, 'boards', 'x');
    // ceiling over the irigawa end and back
    this.lamps.push({ p: [-13.2, FL + 2.3, -1.4], c: [1.0, 0.66, 0.36], r: 3.2, i: 1.2, kind: 'pendant' });
    this.lamps.push({ p: [-6.2, FL + 0.5, -1.6], c: [1.0, 0.55, 0.25], r: 1.6, i: 1.0, kind: 'andon' });
  }

  // ranma: a lattice transom between the head rail and the ceiling
  ranma(x0, z0, x1, z1, y0, y1) {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const L = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const g = this.k.g('hinoki');
    const n = Math.round(L / 0.06);
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const x = alongX ? Math.min(x0, x1) + L * f : x0;
      const z = alongX ? z0 : Math.min(z0, z1) + L * f;
      g.box(vec(x, (y0 + y1) / 2, z), alongX ? vec(0.012, y1 - y0, 0.02) : vec(0.02, y1 - y0, 0.012), { grain: 'y', noEnds: true });
    }
    this.rail(x0, z0, x1, z1, y1 - 0.03, 0.03, 0.05);
    this.rail(x0, z0, x1, z1, y0, 0.03, 0.05);
    this.k.g('paper').rect(alongX ? vec(Math.min(x0, x1), y0, z0 - 0.012) : vec(x0 - 0.012, y0, Math.min(z0, z1)), alongX ? vec(L, 0, 0) : vec(0, 0, L), vec(0, y1 - y0, 0));
  }

  // window with exposed lath (shitaji-mado) or vertical bars, with a shoji behind
  // shitaji-mado: the wall left unplastered over its reed lattice, paper in the middle of the wall; the reeds read
  // from both sides, dark against the paper
  window(cx, cz, w, y0, y1, axis) {
    const along = axis === 'x';
    const g = this.k.g('reed');
    const at = (o, d) => (along ? vec(cx + o, 0, cz + d) : vec(cx + d, 0, cz + o));
    const sz = (a, h, b) => (along ? vec(a, h, b) : vec(b, h, a));
    for (const side of [-1, 1]) {
      const d = side * 0.024;
      let o = -w / 2 + 0.02;
      while (o < w / 2 - 0.01) {
        const p = at(o, d);
        p.y = (y0 + y1) / 2;
        g.box(p, sz(0.011 + this.R() * 0.005, y1 - y0, 0.011), { grain: 'y', noEnds: true });
        o += 0.05 + this.R() * 0.035;
      }
      // the bindings: a few horizontals at uneven heights, paired reeds
      for (const t of [0.13, 0.41, 0.47, 0.78]) {
        const p = at(0, d + side * 0.012);
        p.y = y0 + (y1 - y0) * (t + (this.R() - 0.5) * 0.04);
        g.box(p, sz(w, 0.01, 0.01), { grain: along ? 'x' : 'z', noEnds: true });
      }
    }
    this.k.g('paper').rect(along ? vec(cx - w / 2, y0, cz) : vec(cx, y0, cz - w / 2), along ? vec(w, 0, 0) : vec(0, 0, w), vec(0, y1 - y0, 0));
    this.k.g('weathered').box(vec(cx, y0 - 0.02, cz), along ? vec(w + 0.06, 0.03, 0.09) : vec(0.09, 0.03, w + 0.06), { grain: along ? 'x' : 'z' });
  }

  tokoBashira(x, z) {
    // a natural kitayama cedar post, slightly tapered, polished
    const g = this.k.g('hinoki');
    const pts = [], rad = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push(vec(x + Math.sin(t * 3.1) * 0.006, FL + t * 2.6, z));
      rad.push(0.062 - t * 0.008);
    }
    g.tube(pts, rad, 14, 0.4, [1.05, 1.0, 0.92]);
  }

  hearth(cx, cz) {
    // sunken ro: a lacquered square frame in the half mat, ash, an iron kettle on a trivet
    const s = 0.42;
    this.k.g('lacquer').boxMM(cx - s / 2 - 0.03, FL - 0.005, cz - s / 2 - 0.03, cx + s / 2 + 0.03, FL + 0.012, cz + s / 2 + 0.03, { grain: 'x', chamfer: 0.004 });
    this.k.g('doma').boxMM(cx - s / 2, FL - 0.02, cz - s / 2, cx + s / 2, FL + 0.014, cz + s / 2, { grain: 'x', col: [0.75, 0.73, 0.7] });
    // a scanned arare tetsubin on a low iron trivet over the ash
    const k = this.k.g('iron');
    for (let i = 0; i < 3; i++) {
      const a = i * 2.094 + 0.4;
      k.tube([vec(cx + Math.cos(a) * 0.1, FL + 0.012, cz + Math.sin(a) * 0.1), vec(cx + Math.cos(a) * 0.085, FL + 0.06, cz + Math.sin(a) * 0.085)], [0.007, 0.006], 5, 1);
    }
    k.lathe(vec(cx, FL + 0.055, cz), [[0.1, 0], [0.1, 0.008], [0.088, 0.008], [0.088, 0]], 24);
    this.scans.push({ model: 'tetsubin', x: cx, y: FL + 0.06, z: cz, h: 0.27, yaw: 0.85 });
    this.steamPoints = this.steamPoints || [];
    this.steamPoints.push([cx, FL + 0.32, cz, 0.35]);
  }

  bridge() {
    // roofed bridge over the stream: open sides with a low rail
    const x0 = -4.55, x1 = -0.91, z0 = 0.455, z1 = 1.82;
    this.floor(x0, z0, x1, z1, FL, 'engawa', 'x');
    for (const x of [x0 + 0.06, x1 - 0.06]) for (const z of [z0 + 0.06, z1 - 0.06]) this.post(x, z, 0.1, 2.75, 0.12, 'weathered');
    for (const x of [-2.73]) for (const z of [z0 + 0.06, z1 - 0.06]) this.post(x, z, 0.1, 2.75, 0.12, 'weathered');
    for (const z of [z0 + 0.06, z1 - 0.06]) {
      this.rail(x0, z, x1, z, FL + 0.38, 0.05, 0.07, 'weathered');
      this.rail(x0, z, x1, z, 2.62, 0.13, 0.12, 'weathered');
    }
    // beams below the deck and stone piers in the stream
    this.rail(x0, z0 + 0.3, x1, z0 + 0.3, FL - 0.2, 0.15, 0.12, 'weathered');
    this.rail(x0, z1 - 0.3, x1, z1 - 0.3, FL - 0.2, 0.15, 0.12, 'weathered');
    for (const x of [x0 + 0.06, -2.73, x1 - 0.06]) for (const z of [z0 + 0.06, z1 - 0.06]) this.k.g('stone').box(vec(x, 0.0, z), vec(0.32, 0.36, 0.32), { grain: 'y', chamfer: 0.05 });
  }

  livingWing() {
    const { x0, x1, z0, z1 } = VOLUMES.C;
    const top = 3.22;
    const posts = this.perimeterPosts(x0, z0, x1, z1, 1.82, top);
    this.foundation(x0, z0, x1, 1.82, posts);
    // engawa along the south, wrapping the east corner
    this.floor(x0, z1, x1 + 0.91, 1.82, FL, 'engawa', 'x');
    this.floor(x1, -1.82, x1 + 0.91, z1, FL, 'engawa', 'z');
    this.rail(x0, 1.82, x1 + 0.91, 1.82, FL - 0.16, 0.16, 0.12, 'weathered');
    this.rail(x1 + 0.91, -1.82, x1 + 0.91, 1.82, FL - 0.16, 0.16, 0.12, 'weathered');
    for (let x = x0; x <= x1 + 0.92; x += 1.82) {
      this.post(Math.min(x, x1 + 0.85), 1.76, 0.18, 3.25, 0.12, 'weathered');
      this.k.g('stone').box(vec(Math.min(x, x1 + 0.85), 0.08, 1.76), vec(0.3, 0.2, 0.3), { grain: 'y', chamfer: 0.04 });
    }
    for (const z of [-0.91, 0.455]) {
      this.post(x1 + 0.85, z, 0.18, 3.25, 0.12, 'weathered');
      this.k.g('stone').box(vec(x1 + 0.85, 0.08, z), vec(0.3, 0.2, 0.3), { grain: 'y', chamfer: 0.04 });
    }
    this.rail(x0, 1.76, x1 + 0.91, 1.76, 3.12, 0.16, 0.13, 'weathered');
    this.rail(x1 + 0.85, -1.82, x1 + 0.85, 1.82, 3.12, 0.16, 0.13, 'weathered');
    // living: wide boards, the hearth, a curved pine beam over open rafters
    this.floor(x0, -4.095, x1, z1, FL, 'boards', 'z');
    this.irori(2.275, -1.82);
    this.livingRoofStructure();
    // south face: glass doors and shoji
    this.frame(x0, z1, x1, z1);
    this.slides('glass', x0, z1 + 0.03, x1, z1 + 0.03, 10, { open: [0, -0.98, 0.98, 0, 0, -0.98, 0.98, 0, 0, 0], frame: 'weathered' });
    this.slides('shoji', x0, z1 - 0.06, x1, z1 - 0.06, 10, { koshi: 0.3, open: [0, -0.98, 0.98, 0, 0, -0.98, 0.98, 0, 0, 0] });
    this.wall(x0, z1, x1, z1, K + 0.045, top, 'plaster');
    // west: a picture window to the courtyard
    this.wall(x0, -4.095, x0, z1, FL, FL + 0.7, 'plaster');
    this.slides('glass', x0, -3.64, x0, -0.455, 4, { y: FL + 0.7, h: 1.06, kick: 0.03, bars: [] });
    this.rail(x0, -3.64, x0, -0.455, FL + 0.66, 0.04, 0.1);
    this.rail(x0, -3.64, x0, -0.455, K, 0.045, 0.1);
    this.wall(x0, -4.095, x0, -3.64, FL + 0.7, top, 'plaster');
    this.wall(x0, -0.455, x0, z1, FL + 0.7, top, 'plaster');
    this.wall(x0, -3.64, x0, -0.455, K + 0.045, top, 'plaster');
    // east: shoji to the engawa corner
    this.frame(x1, -1.82, x1, z1);
    this.slides('shoji', x1, -1.82, x1, z1, 2, { koshi: 0.3 });
    this.wall(x1, -1.82, x1, z1, K + 0.045, top, 'plaster');
    this.wall(x1, z0, x1, -1.82, FL, top, 'plaster');
    // north: back wall and kitchen shelves
    this.wall(x0, -4.095, x1, -4.095, FL, top, 'clay');
    this.wall(x0, z0, x1, z0, FL, top, 'plaster');
    this.wall(x0, z0, x0, -4.095, FL, top, 'plaster');
    this.floor(x0, z0, x1, -4.095, FL, 'boards', 'x');
    this.kitchen();
    this.lamps.push({ p: [2.275, FL + 1.9, -1.82], c: [1.0, 0.6, 0.3], r: 3.4, i: 1.5, kind: 'irori' });
    this.lamps.push({ p: [6.8, FL + 2.1, -1.8], c: [1.0, 0.68, 0.4], r: 3.0, i: 1.1, kind: 'pendant' });
  }

  irori(cx, cz) {
    const s = 0.91;
    // robuchi: a lacquered frame round the ash, standing a little proud of the boards
    const lq = this.k.g('lacquer'), fw = 0.1, top = FL + 0.06;
    lq.boxMM(cx - s / 2 - fw, FL - 0.01, cz - s / 2 - fw, cx + s / 2 + fw, top, cz - s / 2, { grain: 'x', chamfer: 0.008 });
    lq.boxMM(cx - s / 2 - fw, FL - 0.01, cz + s / 2, cx + s / 2 + fw, top, cz + s / 2 + fw, { grain: 'x', chamfer: 0.008 });
    lq.boxMM(cx - s / 2 - fw, FL - 0.01, cz - s / 2, cx - s / 2, top, cz + s / 2, { grain: 'z', chamfer: 0.008 });
    lq.boxMM(cx + s / 2, FL - 0.01, cz - s / 2, cx + s / 2 + fw, top, cz + s / 2, { grain: 'z', chamfer: 0.008 });
    // the ash bed, raked smooth and banked toward the frame
    const ash = this.k.g('ash');
    this.mats.ash.userData.centre.set(cx, cz);
    const N = 12, h = (u, v) => FL + 0.02 + 0.025 * Math.pow(Math.max(Math.abs(u), Math.abs(v)) * 2, 3);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const u0 = i / N - 0.5, u1 = (i + 1) / N - 0.5, v0 = j / N - 0.5, v1 = (j + 1) / N - 0.5;
        ash.quad(vec(cx + u0 * s, h(u0, v1), cz + v1 * s), vec(cx + u1 * s, h(u1, v1), cz + v1 * s), vec(cx + u1 * s, h(u1, v0), cz + v0 * s), vec(cx + u0 * s, h(u0, v0), cz + v0 * s),
          [u0 * s, v1 * s, u1 * s, v1 * s, u1 * s, v0 * s, u0 * s, v0 * s]);
      }
    // jizai-kagi: a smoke-blackened bamboo hook from the beam, a fish-shaped lever, the iron kettle
    const b = this.k.g('darkwood');
    b.tube([vec(cx, FL + 0.75, cz), vec(cx, 4.2, cz)], [0.022, 0.022], 8, 0.3, [0.7, 0.6, 0.5]);
    for (let y = FL + 0.95; y < 4.2; y += 0.32) b.tube([vec(cx, y - 0.008, cz), vec(cx, y + 0.008, cz)], [0.025, 0.025], 8, 0.3, [0.5, 0.42, 0.36]);
    this.k.g('darkwood').box(vec(cx, FL + 1.05, cz), vec(0.34, 0.1, 0.05), { grain: 'x', chamfer: 0.02 });
    // a scanned tetsubin on the hook; an iron hook from the bamboo down through its bail
    const kh = 0.32, kb = FL + 0.75 - kh + 0.015;
    this.k.g('iron').tube([vec(cx, FL + 0.77, cz), vec(cx, kb + kh - 0.03, cz), vec(cx + 0.02, kb + kh - 0.045, cz)], [0.006, 0.006, 0.005], 5, 1);
    this.scans.push({ model: 'tetsubin', x: cx, y: kb, z: cz, h: kh, yaw: 0.9 });
    // embers
    this.emberPoints = this.emberPoints || [];
    this.emberPoints.push([cx, FL + 0.02, cz, s * 0.4]);
    this.steamPoints = this.steamPoints || [];
    this.steamPoints.push([cx, FL + 0.68, cz, 0.5]);
  }

  livingRoofStructure() {
    // exposed: tie beams, a great curved pine beam, posts to the ridge, open rafters under the boards
    const { x0, x1, z0, z1 } = VOLUMES.C;
    const yb = 3.3;
    const dw = this.k.g('darkwood');
    for (const z of [-4.095, -1.82, z1]) dw.boxMM(x0, yb, z - 0.11, x1, yb + 0.26, z + 0.11, { grain: 'x', chamfer: 0.012, uo: this.R() * 5 });
    // the curved beam across the hearth, x direction, a natural log
    const pts = [], rad = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      pts.push(vec(x0 + (x1 - x0) * t, yb + 0.55 + Math.sin(t * Math.PI) * 0.32 + Math.sin(t * 9) * 0.02, -0.65 + Math.sin(t * 2.4) * 0.12));
      rad.push(0.21 - Math.abs(t - 0.5) * 0.06);
    }
    this.k.g('darkwood').tube(pts, rad, 14, 1.2, [0.85, 0.8, 0.75]);
    // short posts to the ridge beam
    const ridgeY = 6.25;
    for (const x of [x0 + 1.4, 3.64, x1 - 1.4]) dw.box(vec(x, (yb + ridgeY) / 2, -2.96), vec(0.16, ridgeY - yb, 0.16), { grain: 'y', chamfer: 0.01 });
    dw.boxMM(x0 + 0.5, ridgeY - 0.1, -3.1, x1 - 0.5, ridgeY + 0.12, -2.82, { grain: 'x', chamfer: 0.01 });
    this.atticLining();
    // purlins
    for (const s of [-1, 1]) for (const f of [0.33, 0.66]) {
      const z = -2.96 + s * f * 5.6;
      const y = ridgeY - f * 5.6 * 0.62 + 0.1;
      dw.boxMM(x0 - 0.3, y - 0.08, z - 0.07, x1 + 0.3, y + 0.08, z + 0.07, { grain: 'x', chamfer: 0.008 });
    }
  }

  // the hearth room is open to the roof: smoke-dark boards on rafters under both slopes, clay in the gables
  atticLining() {
    const zA = -4.095, zB = 0.455, xr = 4.095, wallY = 3.22, pitch = 0.62;
    const yAt = (x) => wallY + (Math.min(x, 2 * xr - x) + 0.91) * pitch;
    const yR = yAt(xr);
    const g = this.k.g('darkwood');
    const sootCol = [0.62, 0.58, 0.55];
    // west slope rises from the west wall plate, east slope comes down to the east wall
    const xW = -0.91, xE = 8.19, yE = yAt(xE);
    const lw = Math.hypot(xr - xW, yR - wallY), le = Math.hypot(xE - xr, yR - yE);
    g.quad(vec(xW, wallY, zB), vec(xW, wallY, zA), vec(xr, yR, zA), vec(xr, yR, zB), [0, 0, zB - zA, 0, zB - zA, lw, 0, lw], sootCol);
    g.quad(vec(xr, yR, zB), vec(xr, yR, zA), vec(xE, yE, zA), vec(xE, yE, zB), [0, 0, zB - zA, 0, zB - zA, le, 0, le], sootCol);
    // rafters
    for (let z = zA + 0.2; z < zB; z += 0.455) {
      for (const [xa, ya, xb, yb] of [[xW, wallY, xr, yR], [xr, yR, xE, yE]]) {
        const a = vec(xa, ya - 0.05, z), b = vec(xb, yb - 0.05, z);
        const len = a.distanceTo(b);
        const ang = Math.atan2(yb - ya, xb - xa);
        const kk = new Kit({});
        const geo = new Geo();
        geo.box(vec(0, 0, 0), vec(len, 0.08, 0.06), { grain: 'x', chamfer: 0.006 });
        kk.geos.set('darkwood', geo);
        const m = new THREE.Matrix4().makeRotationZ(ang).setPosition(a.clone().add(b).multiplyScalar(0.5));
        mergeKit(this.k, kk, m);
      }
    }
    // gable infill above the wall plates, and the east wall raised to meet the slope
    const c = this.k.g('clay');
    for (const [z, flip] of [[zA + 0.04, false], [zB - 0.04, true]]) {
      const a = vec(xW, wallY, z), b = vec(xE, wallY, z), t = vec(xr, yR, z), e = vec(xE, yE, z);
      if (flip) { c.tri(a, t, b, [0, 0, 4, 3, 9, 0]); c.tri(b, t, e, [9, 0, 4, 3, 9, 0.5]); }
      else { c.tri(a, b, t, [0, 0, 9, 0, 4, 3]); c.tri(b, e, t, [9, 0, 9, 0.5, 4, 3]); }
    }
    this.k.g('clay').boxMM(xE - 0.04, wallY, zA, xE + 0.04, yE, zB, { grain: 'z' });
  }

  kitchen() {
    // a long hinoki counter with a sunk basin, slatted cabinets, shelves of ceramics
    const z = -3.7, x0 = 5.6, x1 = 8.1;
    this.k.g('hinokiPale').boxMM(x0, FL + 0.82, z - 0.38, x1, FL + 0.87, z + 0.3, { grain: 'x', chamfer: 0.005 });
    const sl = this.k.g('darkwood');
    for (let x = x0 + 0.02; x < x1; x += 0.045) sl.boxMM(x, FL + 0.05, z + 0.27, x + 0.03, FL + 0.82, z + 0.3, { grain: 'y', noEnds: true });
    sl.boxMM(x0, FL, z - 0.38, x1, FL + 0.82, z + 0.26, { grain: 'x' });
    for (const y of [FL + 1.45, FL + 1.85]) this.k.g('hinoki').boxMM(x0, y, -4.095 + 0.02, x1, y + 0.03, -3.82, { grain: 'x', chamfer: 0.003 });
    this.k.g('iron').boxMM(6.4, FL + 0.84, z - 0.25, 6.95, FL + 0.875, z + 0.18, { grain: 'x' });
  }

  privateWing() {
    const { x0, x1, z0, z1 } = VOLUMES.D;
    const top = 3.0;
    const posts = this.perimeterPosts(x0, z0, x1, z1, 1.82, top);
    this.foundation(x0, z0, x1, -1.82, posts);
    // engawa along the south, facing the dry garden
    this.floor(x0, z1, x1, -1.82, FL, 'engawa', 'x');
    this.rail(x0, -1.82, x1, -1.82, FL - 0.16, 0.16, 0.12, 'weathered');
    for (let x = x0 + 1.82; x <= x1 + 0.01; x += 1.82) {
      this.post(x, -1.88, 0.18, 3.0, 0.12, 'weathered');
      this.k.g('stone').box(vec(x, 0.08, -1.88), vec(0.3, 0.2, 0.3), { grain: 'y', chamfer: 0.04 });
    }
    this.rail(x0, -1.88, x1, -1.88, 2.88, 0.15, 0.12, 'weathered');
    // bedroom: ten mats, a low platform bed, paper lamps
    this.floor(x0, -6.37, 12.74, z1, FL - 0.05, 'boards', 'x', 0.04);
    tatami(this.k, x0, -6.37, FL, LAYOUTS[10]);
    saoCeiling(this.k, x0, -6.37, 12.74, z1, FL + 2.45, 'z');
    this.frame(x0, z1, 12.74, z1, {});
    this.slides('shoji', x0, z1, 12.74, z1, 4, { koshi: 0.3, animate: [{ i: 1, slide: -0.98, at: [10.2, -1.6], r: 2.6 }] });
    this.wall(x0, z1, 12.74, z1, K + 0.045, top, 'plaster');
    this.wall(x0, -6.37, 12.74, -6.37, FL, FL + 2.45, 'clay');
    this.wall(x0, z0, x0, z1, FL, top, 'plaster');
    this.bed(10.47, -5.2);
    // dressing passage and bath
    this.floor(12.74, z0, x1, z1, FL, 'boards', 'x');
    this.frame(12.74, -6.37, 12.74, z1);
    this.slides('fusuma', 12.74, -6.37, 12.74, z1, 4, { face: 'fusuma', animate: [{ i: 2, slide: -0.98, at: [12.0, -4.3], r: 2.4 }] });
    this.wall(12.74, -6.37, 12.74, z1, K + 0.045, FL + 2.45, 'clay');
    this.wall(12.74, z0, 12.74, -6.37, FL, top, 'clay');
    this.wall(12.74, z1, 13.65, z1, FL, top, 'plaster');
    this.k.g('ceiling').boxMM(12.74, FL + 2.45, z0, x1, FL + 2.47, z1, { grain: 'x' });
    this.wall(13.65, z0, 13.65, -7.28, FL, top, 'clay');
    this.bath();
    this.wall(x0, z0, x1, z0, FL, top, 'plaster');
    this.wall(12.74, -6.37, x0, -6.37, FL + 2.45, top, 'clay');
    this.lamps.push({ p: [9.0, FL + 0.45, -6.0], c: [1.0, 0.56, 0.26], r: 2.2, i: 1.3, kind: 'andon' });
    this.lamps.push({ p: [11.95, FL + 0.45, -3.75], c: [1.0, 0.56, 0.26], r: 2.2, i: 1.3, kind: 'andon' });
  }

  bed(cx, cz) {
    // a low hinoki platform, an indigo quilt over white linen, two buckwheat pillows
    this.k.g('hinokiPale').boxMM(cx - 1.05, FL, cz - 1.15, cx + 1.05, FL + 0.18, cz + 1.0, { grain: 'z', chamfer: 0.01 });
    this.k.g('linen').boxMM(cx - 0.98, FL + 0.18, cz - 1.08, cx + 0.98, FL + 0.3, cz + 0.93, { grain: 'z', chamfer: 0.04 });
    this.quilt(cx, cz);
    for (const s of [-0.48, 0.48]) this.k.g('linenWhite').box(vec(cx + s, FL + 0.37, cz - 0.88), vec(0.62, 0.12, 0.34), { grain: 'x', chamfer: 0.05 });
  }

  quilt(cx, cz) {
    // a draped quilt: a grid displaced into soft folds, falling over the edges
    const g = this.k.g('indigo');
    const nx = 36, nz = 36;
    const w = 2.2, d = 1.55;
    const base = g.vc;
    const R = this.R;
    const h = (u, v) => {
      const ex = Math.max(0, Math.abs(u) - 0.98), ez = Math.max(0, v - 0.93);
      let y = FL + 0.36 + Math.sin(u * 6.0 + v * 2.0) * 0.012 + Math.sin(u * 13 + 1.3) * Math.cos(v * 7) * 0.006;
      // fold back at the head
      if (v < -0.2) y += Math.max(0, Math.sin((v + 0.2) * -9)) * 0.03;
      y -= ex * 1.6 + ez * 1.6;
      return y;
    };
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const u = -w / 2 + (w * i) / nx, v = -0.3 + (d * j) / nz;
        const x = cx + Math.sign(u) * Math.min(Math.abs(u), 0.98 + Math.max(0, Math.abs(u) - 0.98) * 0.15);
        const z = cz + Math.min(v, 0.93 + Math.max(0, v - 0.93) * 0.15);
        const y = Math.max(FL + 0.05, h(u, v));
        const e = 0.01;
        const nxv = -(h(u + e, v) - h(u - e, v)) / (2 * e), nzv = -(h(u, v + e) - h(u, v - e)) / (2 * e);
        const n = vec(nxv, 1, nzv).normalize();
        g.vert(vec(x, y, z), n, u, v, null);
      }
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const a = base + j * (nx + 1) + i, b = a + nx + 1;
        g.idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
  }

  bath() {
    // slate floor a step down, a hinoki tub filled to the brim, the east side open to bamboo
    const x0 = 13.65, x1 = 16.38, z0 = -7.28, z1 = -2.73;
    const fy = FL - 0.15;
    this.k.g('slate').boxMM(x0, fy - 0.05, z0, x1, fy, z1, { grain: 'x' });
    const tx0 = 14.5, tx1 = 16.2, tz0 = -6.9, tz1 = -5.05, th = 0.62;
    const w = this.k.g('hinokiPale');
    w.boxMM(tx0, fy, tz0, tx1, fy + th, tz0 + 0.06, { grain: 'x', chamfer: 0.008 });
    w.boxMM(tx0, fy, tz1 - 0.06, tx1, fy + th, tz1, { grain: 'x', chamfer: 0.008 });
    w.boxMM(tx0, fy, tz0, tx0 + 0.06, fy + th, tz1, { grain: 'z', chamfer: 0.008 });
    w.boxMM(tx1 - 0.06, fy, tz0, tx1, fy + th, tz1, { grain: 'z', chamfer: 0.008 });
    this.mats.hinokiPale.userData.tub.a.set(tx0, tz0, tx1, tz1);
    this.mats.hinokiPale.userData.tub.y.set(fy, fy + th);
    this.k.g('iron').boxMM(tx0 - 0.005, fy + 0.12, tz0 - 0.005, tx1 + 0.005, fy + 0.15, tz1 + 0.005, { grain: 'x' });
    this.k.g('iron').boxMM(tx0 - 0.005, fy + 0.45, tz0 - 0.005, tx1 + 0.005, fy + 0.48, tz1 + 0.005, { grain: 'x' });
    // room: the box the water mirrors; its east side open up to ey1
    this.tub = { x0: tx0 + 0.06, x1: tx1 - 0.06, z0: tz0 + 0.06, z1: tz1 - 0.06, y: fy + th - 0.015, room: [x0, z0, x1, z1, 2.75], ey1: fy + OPEN_H };
    this.steamPoints = this.steamPoints || [];
    this.steamPoints.push([(tx0 + tx1) / 2, fy + th, (tz0 + tz1) / 2, 1.4]);
    // a stool and a wooden pail
    w.boxMM(13.95, fy, -4.0, 14.35, fy + 0.25, -3.7, { grain: 'x', chamfer: 0.01 });
    // walls: clay with a cedar wainscot; the east side is open between posts
    this.wall(x0, z1, x1, z1, fy, 3.0, 'plaster');
    this.wall(x0, z0, x1, z0, fy, 3.0, 'clay');
    this.k.g('ceiling').boxMM(x0, 2.75, z0, x1, 2.77, z1, { grain: 'z' });
    this.frame(x1, z0, x1, z1, { y: fy });
    this.slides('glass', x1, z0, x1, z1, 4, { y: fy, frame: 'weathered', open: [0, -0.98, 0.98, 0] });
    this.wall(x1, z0, x1, z1, fy + OPEN_H + 0.045, 3.0, 'plaster');
    // a deck outside the bath
    this.floor(x1, -7.28, x1 + 1.4, -2.73, fy, 'engawa', 'z');
    this.lamps.push({ p: [15.9, fy + 1.2, -3.2], c: [1.0, 0.6, 0.32], r: 2.6, i: 1.2, kind: 'lantern' });
  }

  roofs() {
    const k = this.k;
    // entrance wing: its east hip tucks under the shoin eave
    this.roofA = irimoyaRoof(k, { x0: -22.75, x1: -16.6, z0: -3.64, z1: 1.82, o: 1.05, ye: 3.0, pitch: 0.58, axis: 'x', gable: 0.55, wallY: 2.95 });
    this.roofB = irimoyaRoof(k, { x0: -15.47, x1: -4.55, z0: -5.46, z1: 1.82, o: 1.3, ye: 3.22, pitch: 0.6, axis: 'x', gable: 0.5, wallY: 3.12 });
    this.roofBridge = gableRoof(k, { x0: -4.55, x1: -0.91, z0: 0.455, z1: 1.82, o: 0.45, ye: 2.7, pitch: 0.5, axis: 'x' });
    this.roofC = irimoyaRoof(k, { x0: -0.91, x1: 9.1, z0: -6.37, z1: 1.82, o: 1.15, ye: 3.3, pitch: 0.62, axis: 'z', gable: 0.42, wallY: 3.22 });
    this.roofD = irimoyaRoof(k, { x0: 9.4, x1: 16.38, z0: -8.19, z1: -1.88, o: 1.05, ye: 2.95, pitch: 0.58, axis: 'x', gable: 0.55, wallY: 3.0 });
  }
}

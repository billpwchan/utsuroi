// The house drawn as an architect's plan, from the same numbers the 3D world is built from: the garden wall and
// gate, the four wings and their rooms, tatami, the boarded corridors, the pond and stream, and the walk itself
// with its fourteen stops. Every stroke is one <path> with a normalised length, so the loader can draw the sheet
// line by line as the world loads.
import { CatmullRomCurve3 } from 'three';
import { VOLUMES, ROOMS } from '../house/house.js';
import { WALL, STREAM, pondD } from '../garden/site.js';
import { STOPS } from '../journey/journey.js';
import { COPY } from './copy.js';

const NS = 'http://www.w3.org/2000/svg';
const f = (v) => +v.toFixed(2);
const P = (pts) => 'M' + pts.map(([x, z]) => `${f(x)} ${f(z)}`).join('L');
const rect = (x0, z0, x1, z1) => P([[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]]);

// the pond's edge: marching squares over its distance field, chained into closed loops
function pondLoops() {
  const x0 = -13, x1 = 9.5, z0 = 2, z1 = 14, h = 0.22;
  const nx = Math.ceil((x1 - x0) / h), nz = Math.ceil((z1 - z0) / h);
  const v = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) v[j * (nx + 1) + i] = pondD(x0 + i * h, z0 + j * h);
  const at = (i, j) => v[j * (nx + 1) + i];
  const lerpE = (a, b, pa, pb) => { const t = a / (a - b); return [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t]; };
  const segs = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const c = [[x0 + i * h, z0 + j * h], [x0 + (i + 1) * h, z0 + j * h], [x0 + (i + 1) * h, z0 + (j + 1) * h], [x0 + i * h, z0 + (j + 1) * h]];
    const d = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
    const pts = [];
    for (let e = 0; e < 4; e++) {
      const a = d[e], b = d[(e + 1) % 4];
      if ((a < 0) !== (b < 0)) pts.push(lerpE(a, b, c[e], c[(e + 1) % 4]));
    }
    if (pts.length === 2) segs.push(pts);
    else if (pts.length === 4) { segs.push([pts[0], pts[1]]); segs.push([pts[2], pts[3]]); }
  }
  const key = (p) => `${Math.round(p[0] * 500)},${Math.round(p[1] * 500)}`;
  const ends = new Map();
  segs.forEach((s, k) => { for (const p of s) { const kk = key(p); if (!ends.has(kk)) ends.set(kk, []); ends.get(kk).push(k); } });
  const used = new Uint8Array(segs.length);
  const loops = [];
  for (let s = 0; s < segs.length; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const loop = [segs[s][0], segs[s][1]];
    for (;;) {
      const tail = loop[loop.length - 1];
      const next = (ends.get(key(tail)) || []).find((k) => !used[k]);
      if (next === undefined) break;
      used[next] = 1;
      const [a, b] = segs[next];
      loop.push(key(a) === key(tail) ? b : a);
    }
    if (loop.length > 12) loops.push(loop);
  }
  return loops;
}

// mats laid in rows: long side along x, every other row shifted half a mat so no four corners meet
function tatami(r) {
  const out = [];
  const W = r.x1 - r.x0, D = r.z1 - r.z0;
  const rows = Math.round(D / 0.91);
  for (let j = 0; j < rows; j++) {
    const z = r.z0 + j * 0.91;
    out.push(P([[r.x0, z], [r.x1, z]]));
    const off = j % 2 ? 0.91 : 0;
    for (let x = r.x0 + off + 1.82; x < r.x1 - 0.2; x += 1.82) out.push(P([[x, z], [x, Math.min(r.z1, z + 0.91)]]));
    void W;
  }
  return out;
}

// boards: fine lines along the corridor's length
function boards(x0, z0, x1, z1, step = 0.18) {
  const out = [];
  const alongX = x1 - x0 > z1 - z0;
  if (alongX) for (let z = z0 + step; z < z1 - 0.02; z += step) out.push(P([[x0, z], [x1, z]]));
  else for (let x = x0 + step; x < x1 - 0.02; x += step) out.push(P([[x, z0], [x, z1]]));
  return out;
}

export function buildPlan() {
  const svg = document.createElementNS(NS, 'svg');
  const pad = 4;
  const vb = [WALL.x0 - pad, WALL.z0 - pad - 1, WALL.x1 - WALL.x0 + pad * 2, WALL.z1 - WALL.z0 + pad * 2 + 2];
  svg.setAttribute('viewBox', vb.map(f).join(' '));
  svg.setAttribute('class', 'plan');
  svg.setAttribute('aria-hidden', 'true');
  // [class, d, order]; order sets when in the load the stroke is drawn (0..1)
  const strokes = [];
  const add = (cls, d, t0, t1) => strokes.push({ cls, d, t0, t1 });

  // the garden wall: a double line, open at the gate
  const g0 = WALL.gate[0], g1 = WALL.gate[1];
  for (const o of [0, 0.32]) {
    add('wall', P([[g0, WALL.z1 - o], [WALL.x0 + o, WALL.z1 - o], [WALL.x0 + o, WALL.z0 + o], [WALL.x1 - o, WALL.z0 + o], [WALL.x1 - o, WALL.z1 - o], [g1, WALL.z1 - o]]), 0.0, 0.22);
  }
  // the wings, then the rooms inside them
  Object.values(VOLUMES).forEach((v, i) => add('wing', rect(v.x0, v.z0, v.x1, v.z1), 0.12 + i * 0.05, 0.3 + i * 0.05));
  Object.values(ROOMS).forEach((r, i) => add('room', rect(r.x0, r.z0, r.x1, r.z1), 0.3 + i * 0.018, 0.42 + i * 0.018));
  for (const k of ['zashiki', 'tsugi', 'tea']) for (const d of tatami(ROOMS[k])) add('mat', d, 0.44, 0.6);
  for (const k of ['irigawa', 'corridor']) { const r = ROOMS[k]; for (const d of boards(r.x0, r.z0, r.x1, r.z1)) add('mat', d, 0.46, 0.62); }
  // water
  for (const loop of pondLoops()) add('water', P(loop) + 'Z', 0.5, 0.72);
  const sw = 0.42;
  add('water', P(STREAM.map(([x, z]) => [x - sw, z])), 0.55, 0.7);
  add('water', P(STREAM.map(([x, z]) => [x + sw, z])), 0.55, 0.7);
  // the walk, sampled off the same spline the camera rides, up to the last stop on the ground; the stretch the
  // camera flies over the garden is drawn lighter, as an architect draws what passes overhead
  const pts = [], anchor = [];
  for (const s of STOPS) { anchor.push(pts.length); pts.push(s.pos); for (const r of s.route) pts.push(r); }
  const curve = new CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  const tEnd = anchor[STOPS.length - 2] / (pts.length - 1);
  const runs = [];
  let walkLen = 0, prev = null;
  for (let i = 0, N = 1400; i <= N; i++) {
    const q = curve.getPoint((i / N) * tEnd);
    const air = q.y > 3;
    if (!runs.length || runs[runs.length - 1].air !== air) runs.push({ air, pts: prev ? [prev] : [], len: 0, start: walkLen });
    const run = runs[runs.length - 1];
    if (prev) { const d = Math.hypot(q.x - prev[0], q.z - prev[1]); run.len += d; walkLen += d; }
    prev = [q.x, q.z];
    run.pts.push(prev);
  }
  for (const r of runs) add(r.air ? 'walk air' : 'walk', P(r.pts), 0.66 + (0.29 * r.start) / walkLen, 0.66 + (0.29 * (r.start + r.len)) / walkLen);
  const walkPts = runs.filter((r) => !r.air).flatMap((r) => r.pts.filter((_, k) => k % 2 === 0));

  for (const s of strokes) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', s.d);
    p.setAttribute('class', s.cls);
    p.setAttribute('pathLength', '1');
    svg.appendChild(p);
    s.el = p;
  }
  // labels go where they collide least with each other, the stop circles, the walk and the room outlines
  const circles = STOPS.slice(0, -1).map((s) => [s.pos.x - 0.5, s.pos.z - 0.5, s.pos.x + 0.5, s.pos.z + 0.5]);
  const edges = [];
  for (const r of [...Object.values(ROOMS), ...Object.values(VOLUMES)]) {
    for (let x = r.x0; x <= r.x1; x += 0.25) edges.push([x, r.z0], [x, r.z1]);
    for (let z = r.z0; z <= r.z1; z += 0.25) edges.push([r.x0, z], [r.x1, z]);
  }
  const placed = [];
  const overlap = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inside = (b, list) => list.reduce((n, p) => n + (p[0] > b[0] && p[0] < b[2] && p[1] > b[1] && p[1] < b[3] ? 1 : 0), 0);
  const cost = (b, skip) => placed.reduce((c, o) => c + overlap(b, o) * 6, 0)
    + circles.reduce((c, o, k) => c + (k === skip ? 0 : overlap(b, o) * 4), 0)
    + inside(b, walkPts) * 0.35 + inside(b, edges) * 0.12;

  const names = [];
  for (const r of Object.values(ROOMS)) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    if (w < 2.5 || d < 1.3) continue;
    // too narrow for the name across it: written downward, as on a Japanese plan
    const len = r.jp.length * 0.84, vert = len > w - 0.5 && d > len + 0.5;
    const tw = vert ? 0.72 : len, th = vert ? len : 0.72;
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    let best = null;
    for (const dz of [0, -(d / 2 - th / 2 - 0.3), d / 2 - th / 2 - 0.3]) for (const dx of [0, -(w / 2 - tw / 2 - 0.3), w / 2 - tw / 2 - 0.3]) {
      const x = cx + dx, z = cz + dz, b = [x - tw / 2, z - th / 2, x + tw / 2, z + th / 2];
      const c = cost(b, -1) + Math.hypot(dx, dz) * 0.04;
      if (!best || c < best.c) best = { c, x, z, b };
    }
    placed.push(best.b);
    names.push({ jp: r.jp, x: best.x, z: best.z, vert, th });
  }
  const labels = STOPS.slice(0, -1).map((s, i) => {
    const x = s.pos.x, z = s.pos.z, w = 0.8;
    const cand = [[0.6, -0.55], [0.68, 0.22], [0.6, 1.0], [-w / 2, 1.2], [-w / 2, -0.7], [-0.6 - w, -0.55], [-0.68 - w, 0.22], [-0.6 - w, 1.0]];
    let best = null;
    cand.forEach(([dx, dz], k) => {
      const b = [x + dx, z + dz - 0.5, x + dx + w, z + dz + 0.06];
      const c = cost(b, i) + k * 0.01;
      if (!best || c < best.c) best = { c, x: x + dx, z: z + dz, b };
    });
    placed.push(best.b);
    return best;
  });

  const marks = [];
  STOPS.slice(0, -1).forEach((s, i) => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'stop');
    g.innerHTML = `<circle cx="${f(s.pos.x)}" cy="${f(s.pos.z)}" r="0.42"/><text x="${f(labels[i].x)}" y="${f(labels[i].z)}">${String(i + 1).padStart(2, '0')}</text>`;
    svg.appendChild(g);
    marks.push({ el: g, t: 0.68 + (i / 13) * 0.27 });
  });
  for (const n of names) {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('class', 'rname');
    if (n.vert) {
      [...n.jp].forEach((ch, k) => {
        const sp = document.createElementNS(NS, 'tspan');
        sp.setAttribute('x', f(n.x));
        sp.setAttribute('y', f(n.z - n.th / 2 + 0.62 + k * 0.84));
        sp.textContent = ch;
        t.appendChild(sp);
      });
    } else {
      t.setAttribute('x', f(n.x));
      t.setAttribute('y', f(n.z + 0.25));
      t.textContent = n.jp;
    }
    svg.appendChild(t);
    marks.push({ el: t, t: 0.62 });
  }
  // north point and a scale bar, drawn last
  const nx = WALL.x1 + 1.6, nz = WALL.z0 + 1.2;
  const extra = document.createElementNS(NS, 'g');
  extra.setAttribute('class', 'furniture');
  extra.innerHTML = `
    <path d="M${nx} ${nz + 2.2}L${nx} ${nz - 1.4}M${nx - 0.7} ${nz - 0.2}L${nx} ${nz - 1.4}L${nx + 0.7} ${nz - 0.2}"/>
    <text x="${nx}" y="${nz + 3.4}" text-anchor="middle">N</text>
    <path d="M${WALL.x0} ${WALL.z1 + 2.2}L${WALL.x0 + 10} ${WALL.z1 + 2.2}M${WALL.x0} ${WALL.z1 + 1.8}L${WALL.x0} ${WALL.z1 + 2.6}M${WALL.x0 + 5} ${WALL.z1 + 1.95}L${WALL.x0 + 5} ${WALL.z1 + 2.45}M${WALL.x0 + 10} ${WALL.z1 + 1.8}L${WALL.x0 + 10} ${WALL.z1 + 2.6}"/>
    <text x="${WALL.x0}" y="${WALL.z1 + 3.9}">0</text><text x="${WALL.x0 + 5}" y="${WALL.z1 + 3.9}" text-anchor="middle">5</text><text x="${WALL.x0 + 10}" y="${WALL.z1 + 3.9}" text-anchor="middle">10 m</text>`;
  svg.appendChild(extra);
  marks.push({ el: extra, t: 0.9 });

  // p in 0..1: how much of the sheet is drawn
  const draw = (p) => {
    for (const s of strokes) {
      const k = Math.min(1, Math.max(0, (p - s.t0) / (s.t1 - s.t0)));
      s.el.style.strokeDashoffset = (1 - k).toFixed(4);
    }
    for (const m of marks) m.el.classList.toggle('in', p >= m.t);
  };
  draw(0);
  return { svg, draw, stopsLabel: COPY.map((c) => c.jp) };
}

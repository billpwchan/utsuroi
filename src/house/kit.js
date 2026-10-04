// Geometry kit: buckets of triangles per material, merged into one mesh each. UVs are in metres (the materials
// set their own repeat), with U along the grain for timber. Vertex colours carry per-piece tint variation.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class Geo {
  constructor() {
    this.p = [];
    this.n = [];
    this.uv = [];
    this.c = [];
    this.idx = [];
    this.vc = 0;
  }
  vert(p, n, u, v, col) {
    this.p.push(p.x, p.y, p.z);
    this.n.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.c.push(col ? col[0] : 1, col ? col[1] : 1, col ? col[2] : 1);
    return this.vc++;
  }
  // quad a-b-c-d counter-clockwise seen from the front; uvs per corner
  quad(a, b, c, d, uvs, col, n) {
    const nn = n || V().subVectors(b, a).cross(V().subVectors(d, a)).normalize();
    const i0 = this.vert(a, nn, uvs[0], uvs[1], col);
    const i1 = this.vert(b, nn, uvs[2], uvs[3], col);
    const i2 = this.vert(c, nn, uvs[4], uvs[5], col);
    const i3 = this.vert(d, nn, uvs[6], uvs[7], col);
    this.idx.push(i0, i1, i2, i0, i2, i3);
  }
  tri(a, b, c, uvs, col) {
    const nn = V().subVectors(b, a).cross(V().subVectors(c, a)).normalize();
    const i0 = this.vert(a, nn, uvs[0], uvs[1], col);
    const i1 = this.vert(b, nn, uvs[2], uvs[3], col);
    const i2 = this.vert(c, nn, uvs[4], uvs[5], col);
    this.idx.push(i0, i1, i2);
  }
  // planar quad with uvs projected in metres onto its own axes
  rect(o, ax, ay, col, uo = 0, vo = 0) {
    const lx = ax.length(), ly = ay.length();
    const a = o.clone(), b = o.clone().add(ax), c = b.clone().add(ay), d = o.clone().add(ay);
    this.quad(a, b, c, d, [uo, vo, uo + lx, vo, uo + lx, vo + ly, uo, vo + ly], col);
  }
  /**
   * Oriented box. c = centre, s = full size (x, y, z) in local axes, ry = rotation about Y.
   * grain: 'x' | 'y' | 'z' — local axis the texture U follows. chamfer: edge bevel (metres) on the four edges
   * parallel to the grain, like planed timber.
   */
  box(c, s, opts = {}) {
    const ry = opts.ry || 0;
    const grain = opts.grain || 'x';
    const ch = opts.chamfer || 0;
    const col = opts.col;
    const cs = Math.cos(ry), sn = Math.sin(ry);
    const ox = opts.uo || 0, oy = opts.vo || 0;
    // local frame with L = grain axis, A/B the cross axes
    const ex = V(cs, 0, -sn), ey = V(0, 1, 0), ez = V(sn, 0, cs);
    const axes = { x: [ex, s.x], y: [ey, s.y], z: [ez, s.z] };
    const order = grain === 'x' ? ['x', 'y', 'z'] : grain === 'y' ? ['y', 'z', 'x'] : ['z', 'x', 'y'];
    const [L, lenL] = axes[order[0]], [A, lenA] = axes[order[1]], [B, lenB] = axes[order[2]];
    const hl = lenL / 2, ha = lenA / 2, hb = lenB / 2;
    const k = Math.min(ch, ha * 0.45, hb * 0.45);
    // cross-section polygon (counter-clockwise around L)
    const sec = k > 0
      ? [[ha, -hb + k], [ha, hb - k], [ha - k, hb], [-ha + k, hb], [-ha, hb - k], [-ha, -hb + k], [-ha + k, -hb], [ha - k, -hb]]
      : [[ha, -hb], [ha, hb], [-ha, hb], [-ha, -hb]];
    const P = (l, a, b) => V().copy(c).addScaledVector(L, l).addScaledVector(A, a).addScaledVector(B, b);
    // sides along the grain
    let run = 0;
    for (let i = 0; i < sec.length; i++) {
      const [a0, b0] = sec[i], [a1, b1] = sec[(i + 1) % sec.length];
      const w = Math.hypot(a1 - a0, b1 - b0);
      const n = V().addScaledVector(A, b1 - b0).addScaledVector(B, -(a1 - a0)).normalize();
      this.quad(P(-hl, a0, b0), P(-hl, a1, b1), P(hl, a1, b1), P(hl, a0, b0),
        [ox, oy + run, ox, oy + run + w, ox + lenL, oy + run + w, ox + lenL, oy + run], col, n);
      run += w;
    }
    // end caps (end grain), fan
    if (!opts.noEnds) {
      for (const sgn of [-1, 1]) {
        const n = L.clone().multiplyScalar(sgn);
        const ctr = this.vert(P(sgn * hl, 0, 0), n, ox + 0.37, oy + 0.21, col);
        const ids = sec.map(([a, b]) => this.vert(P(sgn * hl, a, b), n, ox + 0.37 + a, oy + 0.21 + b, col));
        for (let i = 0; i < ids.length; i++) {
          const i0 = ids[i], i1 = ids[(i + 1) % ids.length];
          if (sgn > 0) this.idx.push(ctr, i0, i1); else this.idx.push(ctr, i1, i0);
        }
      }
    }
  }
  // axis-aligned convenience: from min corner to max corner
  boxMM(x0, y0, z0, x1, y1, z1, opts = {}) {
    this.box(V((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), V(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), opts);
  }
  // tube along points with radii (for bamboo, branches, ropes)
  tube(pts, radii, sides = 8, uScale = 1, col) {
    const frames = [];
    let prevN = null;
    for (let i = 0; i < pts.length; i++) {
      const t = V();
      if (i < pts.length - 1) t.subVectors(pts[i + 1], pts[i]);
      else t.subVectors(pts[i], pts[i - 1]);
      t.normalize();
      let n;
      if (!prevN) {
        n = Math.abs(t.y) < 0.9 ? V(0, 1, 0).cross(t).normalize() : V(1, 0, 0).cross(t).normalize();
      } else {
        n = prevN.clone().sub(t.clone().multiplyScalar(prevN.dot(t))).normalize();
      }
      prevN = n;
      frames.push([t, n, V().crossVectors(t, n)]);
    }
    let len = 0;
    const base = this.vc;
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) len += pts[i].distanceTo(pts[i - 1]);
      const [, n, b] = frames[i];
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        const dir = n.clone().multiplyScalar(Math.cos(a)).addScaledVector(b, Math.sin(a));
        this.vert(pts[i].clone().addScaledVector(dir, radii[i]), dir, (s / sides) * uScale, len, col);
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      for (let s = 0; s < sides; s++) {
        const a = base + i * (sides + 1) + s, b = a + sides + 1;
        this.idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  /**
   * Surface of revolution about a vertical axis through c. prof: [[r, y], ...] from the bottom outer edge upward
   * (outward normals follow the profile). facet: flat faces between the sides (hexagonal lanterns).
   */
  lathe(c, prof, sides = 16, opts = {}) {
    const col = opts.col, a0 = opts.a0 || 0;
    let run = 0;
    for (let k = 0; k < prof.length - 1; k++) {
      const [r0, y0] = prof[k], [r1, y1] = prof[k + 1];
      const seg = Math.hypot(r1 - r0, y1 - y0);
      if (seg < 1e-6) continue;
      const nr = (y1 - y0) / seg, ny = -(r1 - r0) / seg;
      const base = this.vc;
      if (opts.facet) {
        for (let s = 0; s < sides; s++) {
          const aa = a0 + (s / sides) * Math.PI * 2, ab = a0 + ((s + 1) / sides) * Math.PI * 2, am = (aa + ab) / 2;
          const n = V(Math.cos(am) * nr, ny, Math.sin(am) * nr);
          const w = 2 * Math.sin(Math.PI / sides);
          const i0 = this.vert(V(c.x + Math.cos(aa) * r0, c.y + y0, c.z + Math.sin(aa) * r0), n, 0, run, col);
          const i1 = this.vert(V(c.x + Math.cos(ab) * r0, c.y + y0, c.z + Math.sin(ab) * r0), n, w * r0, run, col);
          const i2 = this.vert(V(c.x + Math.cos(ab) * r1, c.y + y1, c.z + Math.sin(ab) * r1), n, w * r1, run + seg, col);
          const i3 = this.vert(V(c.x + Math.cos(aa) * r1, c.y + y1, c.z + Math.sin(aa) * r1), n, 0, run + seg, col);
          this.idx.push(i0, i3, i2, i0, i2, i1);
        }
      } else {
        for (let s = 0; s <= sides; s++) {
          const a = a0 + (s / sides) * Math.PI * 2;
          const ca = Math.cos(a), sa = Math.sin(a);
          const n = V(ca * nr, ny, sa * nr);
          const u = (s / sides) * Math.PI * 2 * Math.max(r0, r1, 0.05);
          this.vert(V(c.x + ca * r0, c.y + y0, c.z + sa * r0), n, u, run, col);
          this.vert(V(c.x + ca * r1, c.y + y1, c.z + sa * r1), n, u, run + seg, col);
        }
        for (let s = 0; s < sides; s++) {
          const a = base + s * 2;
          this.idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
        }
      }
      run += seg;
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.vc > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export class Kit {
  constructor(materials) {
    this.materials = materials;
    this.geos = new Map();
  }
  g(name) {
    if (!this.geos.has(name)) this.geos.set(name, new Geo());
    return this.geos.get(name);
  }
  build(group = new THREE.Group(), opts = {}) {
    for (const [name, geo] of this.geos) {
      if (!geo.idx.length) continue;
      const mat = this.materials[name];
      if (!mat) { console.warn('[ut] no material', name); continue; }
      const mesh = new THREE.Mesh(geo.geometry(), mat);
      mesh.name = name;
      mesh.castShadow = mat.userData.castShadow !== false;
      mesh.receiveShadow = true;
      if (mat.userData.layer !== undefined) mesh.layers.set(mat.userData.layer);
      if (mat.userData.bake) mesh.userData.bake = mat.userData.bake;
      if (opts.frustum === false) mesh.frustumCulled = false;
      group.add(mesh);
    }
    return group;
  }
}

export const vec = V;

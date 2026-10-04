// Koi: a dozen fish of the classic varieties (kohaku, sanke, showa, yamabuki, ogon, chagoi, asagi) on one scanned
// carp (its scales, eye and fins kept as a detail map), swimming by a travelling wave down the spine. They wander the pond, school loosely,
// keep off the banks, sink in winter and now and then rise to the surface, leaving a ring.
import * as THREE from 'three';
import { patch } from '../core/shared.js';
import { LAYER_NOREFL, LAYER_SHADOW } from '../core/pipeline.js';
import { loadGLB, meshesOf } from '../core/assets.js';
import { pondD, WATER_Y, heightAt } from './site.js';
import { rng, clamp } from '../lib/math.js';

// water a koi will swim in, in metres
const DEEP = 0.42;
const KINDS = [0, 0, 1, 2, 0, 3, 4, 1, 5, 2, 6, 0, 3];

export async function createKoi(waterUniforms) {
  const R = rng(808);
  const N = KINDS.length;
  // scripts/models.mjs 'koi': head at +z, length 1.16 (tail tip -0.66, nose 0.5); _AUX = (spine 0 tail..1 head, part 0 body, 1 fin, 2 tail)
  const [[scan], [lo]] = await Promise.all([loadGLB('koi'), loadGLB('koi_lo')].map((p) => p.then(meshesOf)));
  const geo = scan.geometry;
  geo.setAttribute('aAux', geo.getAttribute('_aux'));
  geo.deleteAttribute('_aux');
  const kind = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) kind.set([KINDS[i], R() * 100, R.range(0.42, 0.68), R() * 6.283], i * 4);
  geo.setAttribute('aKoi', new THREE.InstancedBufferAttribute(kind, 4));
  const mat = new THREE.MeshStandardMaterial({ map: scan.maps.map, color: 0xffffff, roughness: 0.32, metalness: 0.0, side: THREE.DoubleSide });
  const uniforms = { uSwim: { value: new Float32Array(N) } };
  patch(mat, {
    key: 'koi',
    vertexHead: 'attribute vec2 aAux; attribute vec4 aKoi; varying vec3 vKoiP; varying vec4 vKoi; varying float vPart;',
    fragHead: 'varying vec3 vKoiP; varying vec4 vKoi; varying float vPart;',
    hooks: {
      vertex: /* glsl */ `
        {
          vKoiP = position; vKoi = aKoi; vPart = aAux.y;
          // the swimming wave: grows toward the tail, travels from head to tail
          float t = aAux.x;
          float speed = 5.0 + aKoi.w;
          float amp = 0.075 * pow(1.0 - t, 1.6) + 0.006;
          float ph = uTime * speed - t * 5.0 + aKoi.y;
          transformed.x += sin(ph) * amp;
          // fins paddle
          if (aAux.y > 0.5 && aAux.y < 1.5 && abs(position.x) > 0.06) transformed.y += sin(uTime * 3.0 + aKoi.y) * 0.02 * abs(position.x) * 6.0;
          if (aAux.y > 1.5) transformed.x += sin(ph - 1.2) * 0.04;
        }`,
      map: /* glsl */ `
        {
          vec3 p = vKoiP;
          float k = vKoi.x, sd = vKoi.y;
          vec3 white = vec3(0.92, 0.9, 0.86), red = vec3(0.8, 0.12, 0.035), black = vec3(0.025, 0.025, 0.03);
          vec3 gold = vec3(0.95, 0.62, 0.12), plat = vec3(0.86, 0.86, 0.84), brown = vec3(0.32, 0.2, 0.1), blue = vec3(0.33, 0.42, 0.55);
          float n1 = sfNoise(vec2(p.z * 7.0 + sd, p.x * 9.0 + p.y * 6.0 + sd * 1.3));
          float n2 = sfNoise(vec2(p.z * 11.0 - sd, p.y * 8.0 + p.x * 4.0 + sd * 0.7));
          float back = smoothstep(-0.02, 0.06, p.y);
          vec3 c = white;
          if (k < 0.5) { // kohaku: red patches on white
            c = mix(white, red, smoothstep(0.48, 0.55, n1) * back);
          } else if (k < 1.5) { // sanke: kohaku with small black spots
            c = mix(white, red, smoothstep(0.5, 0.56, n1) * back);
            c = mix(c, black, smoothstep(0.7, 0.74, n2) * back);
          } else if (k < 2.5) { // showa: black ground, red and white
            c = mix(black, red, smoothstep(0.5, 0.56, n1) * back);
            c = mix(c, white, smoothstep(0.62, 0.68, n2));
          } else if (k < 3.5) { // yamabuki ogon
            c = gold * (0.9 + 0.2 * n2);
          } else if (k < 4.5) { // platinum ogon
            c = plat;
          } else if (k < 5.5) { // chagoi
            c = brown * (0.85 + 0.3 * n2);
          } else { // asagi: blue net back, red belly
            c = mix(red * 0.9, blue, back);
          }
          // fins (and the thin lips) are pale and half translucent
          float fin = smoothstep(0.5, 0.9, vPart);
          c = mix(c, white * 0.95, 0.85 * fin);
          // the scan's own scales, eye and fin rays: its colour map holds only detail over 0.5. A wild carp's
          // scale net is far bolder than a koi's, so it is softened, and nearly gone on the fins
          float d = min(diffuseColor.r * 2.0, 1.6);
          d = mix(sqrt(d), 1.0 + (d - 1.0) * 0.3, fin);
          diffuseColor.rgb = c * d;
        }`,
      normal: /* glsl */ `
        metalnessFactor = (vKoi.x > 2.5 && vKoi.x < 4.5) ? 0.6 : 0.0;
      `,
    },
  });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.castShadow = false;
  // under the surface: never in the mirror
  mesh.layers.set(LAYER_NOREFL);
  // a fish's shadow on the bed is a soft blot: a light stand-in sharing the fish's own matrices casts it
  const caster = new THREE.InstancedMesh(lo.geometry, mat, N);
  caster.instanceMatrix = mesh.instanceMatrix;
  caster.castShadow = true;
  caster.frustumCulled = false;
  caster.layers.set(LAYER_SHADOW);
  mesh.add(caster);
  mesh.receiveShadow = true;
  // the fish move every frame: cull them as one shoal against the whole pond rather than recompute bounds
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(-1.6, WATER_Y, 7.6), 10);
  mesh.name = 'koi';
  mesh.userData.bake = { skip: true };

  // agents
  const fish = [];
  const randomTarget = () => {
    for (let k = 0; k < 60; k++) {
      const x = R.range(-9, 6.8), z = R.range(3.8, 11.5);
      if (pondD(x, z) < -0.7 && WATER_Y - heightAt(x, z) > DEEP) return new THREE.Vector2(x, z);
    }
    return new THREE.Vector2(-2, 7.5);
  };
  for (let i = 0; i < N; i++) {
    const p = randomTarget();
    fish.push({ p, v: new THREE.Vector2(R.range(-1, 1), R.range(-1, 1)).normalize().multiplyScalar(0.12), target: randomTarget(), depth: R.range(0.12, 0.32), len: kind[i * 4 + 2], yaw: 0, rise: 0, riseT: R.range(5, 30) });
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), pos = new THREE.Vector3();
  const desire = new THREE.Vector2(), o = new THREE.Vector2(), push = new THREE.Vector2();
  let riseSlot = 0;
  const update = (dt, t, winter) => {
    for (let i = 0; i < N; i++) {
      const f = fish[i];
      if (f.p.distanceTo(f.target) < 0.8 || Math.random() < dt * 0.04) f.target = randomTarget();
      desire.copy(f.target).sub(f.p).normalize().multiplyScalar(winter > 0.5 ? 0.05 : 0.16);
      // keep off the bank: push back toward deep water
      const d = pondD(f.p.x, f.p.y);
      if (d > -0.8) {
        const ex = pondD(f.p.x + 0.1, f.p.y) - d, ez = pondD(f.p.x, f.p.y + 0.1) - d;
        desire.add(push.set(-ex, -ez).normalize().multiplyScalar((d + 0.8) * 0.6));
      }
      // and out of the shallows, down the slope of the floor
      const deep = WATER_Y - heightAt(f.p.x, f.p.y);
      if (deep < DEEP) {
        const gx = heightAt(f.p.x + 0.15, f.p.y) - heightAt(f.p.x - 0.15, f.p.y), gz = heightAt(f.p.x, f.p.y + 0.15) - heightAt(f.p.x, f.p.y - 0.15);
        desire.add(push.set(-gx, -gz).normalize().multiplyScalar((DEEP - deep) * 2.0));
      }
      // loose schooling: drift toward neighbours, away when too close
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        o.copy(fish[j].p).sub(f.p);
        const l = o.length();
        if (l < 0.5) desire.add(o.multiplyScalar(-0.25 / Math.max(l, 0.1)));
        else if (l < 2.5) desire.add(o.multiplyScalar(0.012));
      }
      f.v.lerp(desire, clamp(dt * 0.8, 0, 1));
      f.p.addScaledVector(f.v, dt);
      const yaw = Math.atan2(f.v.x, f.v.y);
      let dy = yaw - f.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      f.yaw += dy * clamp(dt * 2.5, 0, 1);
      // now and then a fish comes up to the surface
      f.riseT -= dt;
      if (f.riseT < 0 && winter < 0.5) { f.rise = 1; f.riseT = R.range(14, 40); }
      if (f.rise > 0) {
        f.rise -= dt * 0.25;
        if (f.rise < 0.55 && f.rise + dt * 0.25 >= 0.55 && waterUniforms) {
          const r = waterUniforms.uRise.value[riseSlot++ % 6];
          r.set(f.p.x, f.p.y, t, 1);
        }
      }
      const ground = heightAt(f.p.x, f.p.y);
      const depth = f.depth * (1 - Math.sin(Math.max(0, f.rise) * Math.PI) * 0.85) + winter * 0.25;
      const y = Math.max(ground + 0.08, WATER_Y - depth);
      e.set(0, f.yaw, -dy * 0.6);
      q.setFromEuler(e);
      pos.set(f.p.x, y, f.p.y);
      mesh.setMatrixAt(i, m.compose(pos, q, s.setScalar(f.len)));
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  update(0.016, 0, 0);
  return { mesh, update, fish };
}

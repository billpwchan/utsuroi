// Render the standard check views: node scripts/views.mjs [query] [prefix] [views...]
import { execFileSync } from 'node:child_process';
const q = process.argv[2] || '';
const prefix = process.argv[3] || 'v';
const only = process.argv.slice(4);
const V = {
  iri: [[-11, 2.15, 1.2], [-6, 1.0, 9]],
  pond: [[3.0, 2.1, 1.0], [-1, 0.5, 8]],
  kare: [[10.8, 2.0, -2.3], [14, 0.3, 5]],
  gate: [[-21.5, 1.65, 21.5], [-21.3, 1.8, 10]],
  air: [[-2, 38, 42], [-3, 0, 0]],
  court: [[-6.0, 1.7, -1.0], [-2.5, 0.6, -3.5]],
};
const names = only.length ? only : Object.keys(V);
const shots = names.map((n) => ({ eval: `__ut.camera.position.set(${V[n][0]}); __ut.controls.target.set(${V[n][1]}); __ut.controls.update(); 1`, sleep: 2.5, name: `${prefix}_${n}.png` }));
const out = execFileSync('node', ['scripts/shot.mjs', JSON.stringify({ url: 'http://127.0.0.1:5195/' + q, wait: 7, shots })], { encoding: 'utf8' });
console.log(out.split('\n').filter((l) => !/^eval: 1$/.test(l)).join('\n'));

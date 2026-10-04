// Screenshot journey stops: node scripts/stops.mjs [query] [prefix] [stop indices...]
import { execFileSync } from 'node:child_process';
const q = process.argv[2] || '';
const prefix = process.argv[3] || 's';
const list = process.argv.slice(4).map(Number);
const ids = list.length ? list : [...Array(14).keys()];
const shots = ids.map((k) => ({ eval: `__dbg.stop=${k}; __ut.journey.progress=${k}; __ut.journey.vel=0; 1`, sleep: 3.2, name: `${prefix}_${String(k).padStart(2, '0')}.png` }));
const out = execFileSync('node', ['scripts/shot.mjs', JSON.stringify({ url: 'http://127.0.0.1:5195/' + (q || '?skip'), wait: 6, w: 1600, h: 900, shots })], { encoding: 'utf8' });
console.log(out.split('\n').filter((l) => !/^eval: 1$/.test(l)).join('\n'));

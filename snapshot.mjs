// Build step: bakes a fresh ESPN snapshot + playoff odds into dist/index.html so the first paint needs no network.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fetchAll, simulate } from '../data.js';
const API = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const get = async p => { const r = await fetch(API + p); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); };
const n = new Date(), season = n.getUTCMonth() >= 7 ? n.getUTCFullYear() : n.getUTCFullYear() - 1;
let seed = 'null';
try {
  const d = await fetchAll(get, season); d.sim = await simulate(d.teams, d.games, 20000, 500);
  seed = JSON.stringify(d).replace(/</g, '\\u003c'); // cannot close the script tag
} catch (e) { console.warn('No snapshot, page will load live data:', e.message); }
await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', (await readFile('index.html', 'utf8')).replace('__SEED__', () => seed));
for (const f of ['app.js', 'data.js', 'styles.css', 'favicon.svg', 'robots.txt']) await copyFile(f, 'dist/' + f);
console.log('dist ready, snapshot:', seed !== 'null');

const API = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
import { DIVS, fetchAll, simulate } from './data.js';
const app = document.getElementById('app');
let teams = {}, games = [], sim = {}, stats = {}, wk = null, season;

// All DOM is built with createElement/append (text nodes), never innerHTML, so API data cannot inject markup.
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') e.className = v; else if (k === 'on') e.addEventListener('click', v); else e.setAttribute(k, v);
  }
  e.append(...kids.flat().filter(c => c != null));
  return e;
}
const pct = p => (p >= .995 ? '>99' : p < .005 && p > 0 ? '<1' : Math.round(p * 100)) + '%';
const logo = t => t.logo ? h('img', { class: 'size-7 object-contain inline-block', src: t.logo, alt: '', width: '28', height: '28', loading: 'lazy' }) : null;
const teamLink = t => h('a', { class: 't', href: '#team/' + t.id }, logo(t), t.name);

async function get(path) {
  const r = await fetch(API + path, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

const rec = s => `${s.w}-${s.l}${s.t ? '-' + s.t : ''}`;
const bar = p => h('div', { class: 'yd', role: 'img', 'aria-label': pct(p) + ' chance' }, h('i'));
function withBar(p) { const b = bar(p); b.firstChild.style.width = Math.round(p * 100) + '%'; return b; }

function gameRow(g) {
  const H = teams[g.h], A = teams[g.a], played = g.done || g.live;
  const side = (t, s, other) => h('div', { class: (g.done && s > other ? 'win' : '') }, teamLink(t), played ? h('span', {}, ' ' + s) : null);
  return h('div', { class: 'game' },
    h('div', {}, side(A, g.as, g.hs), side(H, g.hs, g.as)),
    h('div', { class: 'sc' }, played ? h('b', {}, g.done ? 'Final' : 'Live') : new Date(g.date).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }),
      h('div', { class: 'mut' }, played ? g.note : '')));
}

function weekView() {
  const weeks = [...new Set(games.map(g => g.wk))].sort((a, b) => a - b);
  if (wk == null) wk = (games.find(g => !g.done) || games[games.length - 1]).wk;
  const i = weeks.indexOf(wk), list = games.filter(g => g.wk === wk), playing = new Set(list.flatMap(g => [g.h, g.a]));
  const bye = Object.values(teams).filter(t => !playing.has(t.id)).map(t => t.abbr);
  const go = d => () => { wk = weeks[i + d]; render(); };
  return [h('div', { class: 'row' }, h('h2', {}, 'Week ' + wk),
    h('div', {}, h('button', { on: go(-1), ...(i < 1 && { disabled: '' }) }, 'Previous'), ' ', h('button', { on: go(1), ...(i >= weeks.length - 1 && { disabled: '' }) }, 'Next'))),
    ...list.map(gameRow), bye.length ? h('p', { class: 'mut' }, 'On bye: ' + bye.join(', ')) : null];
}

function playoffView() {
  return ['AFC', 'NFC'].flatMap(c => {
    const rows = Object.values(teams).filter(t => t.div.startsWith(c)).sort((a, b) => sim[b.id].playoff - sim[a.id].playoff || sim[b.id].ew - sim[a.id].ew);
    return [h('h2', {}, c), h('table', {}, h('thead', {}, h('tr', {}, ...['Team', 'Record', 'Make playoffs', 'Win division', '#1 seed', 'Proj. wins'].map(x => h('th', {}, x)))),
      h('tbody', {}, ...rows.map(t => { const s = sim[t.id];
        return h('tr', {}, h('td', {}, teamLink(t)), h('td', {}, rec(s)), h('td', {}, pct(s.playoff), withBar(s.playoff)), h('td', {}, pct(s.div)), h('td', {}, pct(s.bye)), h('td', {}, s.ew.toFixed(1))); })))];
  });
}

function teamsView() {
  return Object.entries(DIVS).flatMap(([d, abbrs]) => [h('h2', {}, d), h('div', { class: 'tgrid' },
    ...Object.values(teams).filter(t => t.div === d).map(t => { const a = h('a', { href: '#team/' + t.id }, logo(t), h('div', {}, h('b', {}, t.name), h('div', { class: 'mut' }, `${rec(sim[t.id])} · ${pct(sim[t.id].playoff)} playoffs`))); a.style.setProperty('--tc', t.color); return a; }))]);
}

function teamView(id) {
  const t = teams[id]; if (!t) return [h('p', { class: 'err' }, 'Team not found.')];
  const s = sim[id], mine = games.filter(g => g.h === id || g.a === id), byWk = Object.fromEntries(mine.map(g => [g.wk, g]));
  const maxWk = Math.max(...games.map(g => g.wk)), rows = [];
  for (let w = 1; w <= maxWk; w++) {
    const g = byWk[w]; if (!g) { rows.push(h('tr', {}, h('td', {}, w), h('td', { colspan: '3' }, 'Bye'))); continue; }
    const home = g.h === id, o = teams[home ? g.a : g.h], me = home ? g.hs : g.as, th = home ? g.as : g.hs;
    const res = g.done ? `${me > th ? 'W' : me < th ? 'L' : 'T'} ${me}-${th}` : g.live ? `Live ${me}-${th}` : new Date(g.date).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    rows.push(h('tr', {}, h('td', {}, w), h('td', {}, home ? 'vs' : '@'), h('td', {}, teamLink(o)), h('td', {}, res)));
  }
  const pd = s.pf - s.pa, box = (l, v) => h('div', {}, h('span', { class: 'mut' }, l), h('b', {}, v));
  const out = [h('p', {}, h('a', { href: '#teams' }, 'All teams')), h('div', { class: 'row' }, h('h2', {}, logo(t), ' ' + t.name), h('span', { class: 'mut' }, t.div)),
    h('div', { class: 'big' }, pct(s.playoff)), h('div', { class: 'mut' }, 'chance to make the playoffs'), withBar(s.playoff),
    h('div', { class: 'cards' }, box('Record', rec(s)), box('Win division', pct(s.div)), box('#1 seed', pct(s.bye)), box('Proj. wins', s.ew.toFixed(1)),
      box('Points for', s.pf), box('Points against', s.pa), box('Point diff', (pd > 0 ? '+' : '') + pd)),
    h('h3', {}, 'Schedule and scores'), h('table', {}, h('thead', {}, h('tr', {}, ...['Wk', 'Site', 'Opponent', 'Result'].map(x => h('th', {}, x)))), h('tbody', {}, ...rows))];
  const box2 = h('div', {}, h('p', { class: 'mut' }, 'Loading team stats…')); out.push(h('h3', {}, 'Team stats'), box2);
  teamStats(id).then(cats => box2.replaceChildren(...(cats.length ? cats : [h('p', { class: 'mut' }, 'Detailed stats are not available right now.')])), () => box2.replaceChildren(h('p', { class: 'mut' }, 'Detailed stats are not available right now.')));
  return out;
}

async function teamStats(id) {
  const d = stats[id] ||= await get(`/teams/${id}/statistics`);
  const cats = d?.results?.stats?.categories || d?.splits?.categories || d?.statistics?.splits?.categories || [];
  return cats.slice(0, 6).map(c => h('table', {}, h('thead', {}, h('tr', {}, h('th', { colspan: '2' }, String(c.displayName || c.name || '')))),
    h('tbody', {}, ...(c.stats || []).slice(0, 8).map(x => h('tr', {}, h('td', {}, String(x.displayName || x.name || '')), h('td', {}, String(x.displayValue ?? x.value ?? '')))))));
}

function render(keep) {
  const [r, arg] = (location.hash.slice(1) || 'week').split('/');
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.dataset.r === (r === 'team' ? 'teams' : r)));
  const v = { week: weekView, playoffs: playoffView, teams: teamsView, team: () => teamView(/^\d+$/.test(arg || '') ? arg : '') }[r] || weekView;
  document.title = (r === 'team' && teams[arg] ? teams[arg].name + ' · ' : '') + 'Gridiron Ledger: NFL schedules, scores and playoff odds';
  app.replaceChildren(...v().filter(Boolean)); if (!keep) window.scrollTo(0, 0);
}

const sub = t => { document.getElementById('sub').textContent = t; };
const stamp = d => `${d.season} season · ${new Date(d.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
async function refresh(base) {
  try {
    const d = await fetchAll(get, base.season);
    if (base.games && JSON.stringify(d.games) === JSON.stringify(base.games)) return sub(stamp(d) + ' · up to date');
    sim = await simulate(d.teams, d.games); teams = d.teams; games = d.games; sub(stamp(d) + ' · live'); render(true);
  } catch (e) {
    if (!base.games) { sub('Could not load data'); app.replaceChildren(h('p', { class: 'err' }, 'The ESPN data feed did not respond. Refresh in a minute.')); }
    else sub(stamp(base) + ' · snapshot (live feed unavailable)');
  }
}
(function start() {
  addEventListener('hashchange', () => render());
  let seed = null; try { seed = JSON.parse(document.getElementById('seed').textContent); } catch {}
  const ok = !!seed?.games?.length, n = new Date();
  const base = { season: seed?.season ?? (n.getMonth() >= 7 ? n.getFullYear() : n.getFullYear() - 1), at: seed?.at, games: ok ? seed.games : null };
  if (ok) { ({ teams, games, sim } = seed); sub(stamp(seed) + ' · snapshot'); render(true); addEventListener('load', () => setTimeout(() => refresh(base), 1500)); }
  else refresh(base);
})();

// Shared by the browser (app.js) and the build step (scripts/snapshot.mjs).
export const DIVS = {
  'AFC East': ['BUF', 'MIA', 'NE', 'NYJ'], 'AFC North': ['BAL', 'CIN', 'CLE', 'PIT'],
  'AFC South': ['HOU', 'IND', 'JAX', 'TEN'], 'AFC West': ['DEN', 'KC', 'LV', 'LAC'],
  'NFC East': ['DAL', 'NYG', 'PHI', 'WSH'], 'NFC North': ['CHI', 'DET', 'GB', 'MIN'],
  'NFC South': ['ATL', 'CAR', 'NO', 'TB'], 'NFC West': ['ARI', 'LAR', 'SF', 'SEA']
};
const divOf = {}; Object.entries(DIVS).forEach(([d, a]) => a.forEach(x => divOf[x] = d)); divOf.WAS = 'NFC East';
const num = v => { const n = Number(v?.value ?? v?.displayValue ?? v); return v == null || !Number.isFinite(n) ? null : n; };
// Only ESPN's logo host is accepted; 500px logos are swapped for a 72px resize so images match their display size.
export const safeLogo = u => {
  try {
    const x = new URL(u); if (x.protocol !== 'https:' || x.host !== 'a.espncdn.com') return '';
    const m = /^\/i\/teamlogos\/nfl\/500\/([a-z0-9_-]+)\.png$/i.exec(x.pathname);
    return m ? `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/${m[1]}.png&w=72&h=72` : x.href;
  } catch { return ''; }
};

export async function fetchAll(get, season) {
  const list = (await get('/teams')).sports[0].leagues[0].teams.map(x => x.team), teams = {};
  list.forEach(t => {
    if (!divOf[t.abbreviation]) return;
    const id = String(t.id).replace(/\D/g, '');
    teams[id] = { id, abbr: t.abbreviation, name: t.displayName, logo: safeLogo(t.logos?.[0]?.href),
      color: /^[0-9a-f]{6}$/i.test(t.color || '') ? '#' + t.color : '#1f5a3a', div: divOf[t.abbreviation] };
  });
  const seen = new Map();
  await Promise.all(Object.values(teams).map(async t => {
    const d = await get(`/teams/${t.id}/schedule?season=${season}&seasontype=2`);
    for (const ev of d.events || []) {
      const c = ev.competitions?.[0]; if (!c || seen.has(ev.id)) continue;
      const H = c.competitors.find(x => x.homeAway === 'home'), A = c.competitors.find(x => x.homeAway === 'away');
      const hid = String(H?.team?.id ?? H?.id), aid = String(A?.team?.id ?? A?.id);
      if (!teams[hid] || !teams[aid]) continue;
      const ty = c.status?.type || {};
      seen.set(ev.id, { id: String(ev.id), wk: ev.week?.number, date: ev.date, h: hid, a: aid, hs: num(H.score), as: num(A.score),
        done: !!ty.completed, live: ty.state === 'in', note: String(ty.shortDetail || '') });
    }
  }));
  const games = [...seen.values()].filter(g => g.wk).sort((a, b) => a.wk - b.wk || new Date(a.date) - new Date(b.date));
  return { season, at: Date.now(), teams, games };
}

// Monte Carlo playoff odds (7 seeds per conference). Runs in small slices so no single task blocks the page.
export async function simulate(teams, games, N = 4000, chunk = 250) {
  const ids = Object.keys(teams), S = {};
  ids.forEach(i => S[i] = { w: 0, l: 0, t: 0, pf: 0, pa: 0, g: 0, playoff: 0, div: 0, bye: 0, ew: 0 });
  const rem = [];
  for (const g of games) {
    if (!g.done || g.hs == null) { rem.push(g); continue; }
    const H = S[g.h], A = S[g.a];
    H.pf += g.hs; H.pa += g.as; A.pf += g.as; A.pa += g.hs; H.g++; A.g++;
    if (g.hs === g.as) { H.t++; A.t++; } else if (g.hs > g.as) { H.w++; A.l++; } else { A.w++; H.l++; }
  }
  const R = {}; ids.forEach(i => R[i] = (S[i].pf - S[i].pa) / (S[i].g + 6));
  const divs = {}; ids.forEach(i => (divs[teams[i].div] ||= []).push(i));
  for (let n = 0; n < N; n++) {
    const W = {}; ids.forEach(i => W[i] = S[i].w + S[i].t / 2);
    for (const g of rem) W[Math.random() < 1 / (1 + Math.exp(-(R[g.h] - R[g.a] + 1.5) / 6.5)) ? g.h : g.a]++;
    const K = {}; ids.forEach(i => { K[i] = W[i] + Math.random() * .2; S[i].ew += W[i]; });
    for (const conf of ['AFC', 'NFC']) {
      const win = [], rest = [];
      for (const [d, m] of Object.entries(divs)) if (d.startsWith(conf)) {
        const s = [...m].sort((a, b) => K[b] - K[a]); win.push(s[0]); rest.push(...s.slice(1));
      }
      win.sort((a, b) => K[b] - K[a]); rest.sort((a, b) => K[b] - K[a]);
      win.forEach(i => { S[i].div++; S[i].playoff++; }); S[win[0]].bye++;
      rest.slice(0, 3).forEach(i => S[i].playoff++);
    }
    if ((n + 1) % chunk === 0) await new Promise(r => setTimeout(r));
  }
  ids.forEach(i => ['playoff', 'div', 'bye', 'ew'].forEach(k => S[i][k] /= N));
  return S;
}

// Deep-content test: an over-powered bot dives to the bottom so every monster, spell and the ending get exercised.
const OD = require('../game.js').OD;
const adv = fn => { const t = OD.g.turn, d = OD.g.depth; fn(); return OD.g.turn !== t || OD.g.depth !== d; };
const T_ = { travel: tt => adv(() => OD.travelStep(tt)), explore: () => adv(() => OD.exploreStep()), go: (x, y) => adv(() => OD.goStep(x, y)) };
const N = +process.argv[2] || 12;
let wins = 0, reached = 0, home = 0; const kills = {};
for (let n = 0; n < N; n++) {
  OD.newGame({ seed: 'deep' + n, race: ['Dwarf', 'Elf', 'Human', 'Halfling'][n % 4], cls: ['Warrior', 'Mage', 'Ranger', 'Rogue'][n % 4], name: 'Deep' });
  let g = OD.g, p = g.p; let r = n * 31 + 7; const rnd = k => (r = (r * 1103515245 + 12345) & 0x7fffffff) % k;
  for (let t = 0; t < 60000 && !OD.g.dead; t++) {
    g = OD.g; p = g.p; g.event = null; if (g.ask) OD.resolveAsk(null);
    p.mhp = 4000; if (p.hp < 2500) p.hp = 4000; p.food = 9000; if (p.lvl < 30) { p.lvl = 30; p.exp = OD.expFor(29); } p.mp = 500; p.st.str = Math.max(p.st.str, 40); p.t.para = 0; p.t.sleep = 0; p.t.conf = 0; p.t.afraid = 0;
    if (g.crownHome) { home++; break; }
    const ms = g.mons.filter(m => OD.canSee(m)); const m = ms.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    const c = rnd(100); let did = false;
    if (g.won) { // carry the crown home
      if (g.items.some(o => o.it.k === 'a_crown')) { const o = g.items.find(o => o.it.k === 'a_crown'); if (o.x === p.x && o.y === p.y) did = OD.act(() => OD.pickup()); else { g.seen[o.y * OD.W + o.x] = 1; did = T_.go(o.x, o.y) || OD.act(() => OD.move(Math.sign(o.x - p.x), Math.sign(o.y - p.y))); } }
      else if (g.depth > 0) { if (!(did = OD.act(() => OD.stairs(-1)))) { if (m && Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y)) <= 1) did = OD.act(() => OD.move(m.x - p.x, m.y - p.y)); else { g.mons.forEach(q => q.sl = 1); g.seen.fill(1); did = T_.travel(OD.T.UP); } } }
    } else if (m && (g.depth >= 20 || c < 60)) {
      const d = Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y)), sp = OD.spellList(), tgt = { x: m.x, y: m.y };
      if (sp.length && c < 25) did = OD.act(() => OD.cast(OD.SPELLS.indexOf(sp[rnd(sp.length)]), tgt));
      else if (d > 1 && p.eq.bow && c < 40) did = OD.act(() => OD.fire(tgt));
      if (!did) did = OD.act(() => OD.move(Math.sign(m.x - p.x), Math.sign(m.y - p.y)));
    }
    if (!did && !g.won) { if (g.depth === 0 || g.map[p.y * OD.W + p.x] === OD.T.DOWN) did = OD.act(() => OD.stairs(1)) || T_.travel(OD.T.DOWN);
      if (!did) { if (g.depth >= 20) { g.seen.fill(1); const b = g.mons.find(q => OD.MON[q.k].ch === 'K'); if (b) did = T_.go(b.x, b.y) || OD.act(() => OD.move(Math.sign(b.x - p.x), Math.sign(b.y - p.y))); } else { if (c < 30) g.seen.fill(1); did = T_.travel(OD.T.DOWN) || T_.explore(); } } }
    if (!did) did = OD.act(() => OD.move(rnd(3) - 1, rnd(3) - 1)) || OD.act(() => true);
    if (t % 200 === 0) { const s = OD.save(); OD.load(s); }
  }
  g = OD.g; if (g.maxDepth >= 20) reached++; if (g.won) wins++; for (const k in g.killList) kills[k] = (kills[k] || 0) + g.killList[k];
  OD.morgue(); if (process.argv[3]) console.log(n, 'depth', g.depth, 'max', g.maxDepth, 'turn', g.turn, 'dead', g.dead && g.dead.cause, 'won', g.won, g.msgs.slice(-3).map(m => m.t).join(' | '));
}
const never = OD.MON.filter(m => !kills[m.n]).map(m => m.n);
console.log({ games: N, reached20: reached, wins, crownHome: home, kindsKilled: Object.keys(kills).length, of: OD.MON.length, neverKilled: never.join(', ') });

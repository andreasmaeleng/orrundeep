// Difficulty probe: a plain-sensible bot (fights, heals, rests, upgrades gear, shops for potions) to see how deep each class gets.
const OD = require('../game.js').OD;
const N = +process.argv[2] || 24, MAXT = +process.argv[3] || 40000;
const adv = fn => { const t = OD.g.turn, d = OD.g.depth; fn(); return OD.g.turn !== t || OD.g.depth !== d; };
const res = {};
for (let n = 0; n < N; n++) {
  const cls = ['Warrior', 'Rogue', 'Ranger', 'Mage'][n % 4], race = ['Dwarf', 'Human', 'Elf', 'Halfling'][(n >> 2) % 4];
  OD.newGame({ seed: 'smart' + n, race, cls, name: 'Bot' });
  let r = n * 97 + 3; const rnd = k => (r = (r * 1103515245 + 12345) & 0x7fffffff) % k; let stuck = 0;
  // opening purchases
  for (let i = 0; i < 6; i++) { const st = OD.g.shops[2], j = st.findIndex(it => it.k === 'p_clw'); if (j >= 0) OD.buy(2, j); }
  for (let t = 0; t < MAXT && !OD.g.dead && !OD.g.won; t++) {
    const g = OD.g, p = g.p; g.event = null; if (g.ask) { const i = p.inv.findIndex(it => !OD.fullyKnown(it)); OD.resolveAsk(i >= 0 ? { inv: i } : null); }
    const find = f => p.inv.findIndex(f), ty = t0 => it => OD.kindOf(it).type === t0;
    const ms = g.mons.filter(m => OD.canSee(m) && !m.sl).sort((a, b) => Math.max(Math.abs(a.x - p.x), Math.abs(a.y - p.y)) - Math.max(Math.abs(b.x - p.x), Math.abs(b.y - p.y)));
    const sleepers = g.mons.filter(q => OD.canSee(q) && q.sl); const m = ms[0] || (p.hp > p.mhp * 0.7 ? sleepers[0] : null); let did = false;
    const heal = find(it => ['p_clw', 'p_csw', 'p_heal'].includes(it.k) && g.known[it.k]);
    if (p.hp < p.mhp * 0.4 && heal >= 0) did = adv(() => OD.act(() => OD.quaff(heal)));
    else if (p.hp < p.mhp * 0.3 && find(ty('potion')) >= 0) { const i = find(ty('potion')); did = adv(() => OD.act(() => OD.quaff(i))); }
    else if (p.food < 1500 && find(ty('food')) >= 0) { const i = find(ty('food')); did = adv(() => OD.act(() => OD.eat(i))); }
    else if (!p.eq.light || (p.eq.light.fuel <= 0)) { const i = find(ty('light')); if (i >= 0) did = adv(() => OD.act(() => OD.wear(i))); }
    if (!did && m) {
      const d = Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y)), tgt = { x: m.x, y: m.y }, sp = OD.spellList().filter(s => s.t && s.mp <= p.mp && s.n !== 'Unmake Stone');
      if (sp.length) did = adv(() => OD.act(() => OD.cast(OD.SPELLS.indexOf(sp[sp.length - 1]), tgt)));
      else if (d > 1 && p.eq.bow && find(it => OD.kindOf(it).ammo === OD.kindOf(p.eq.bow).ammo && OD.kindOf(it).type === 'ammo') >= 0) did = adv(() => OD.act(() => OD.fire(tgt)));
      else if (d > 2 && find(it => it.k === 'oil') >= 0 && rnd(3) === 0) { const i = find(it => it.k === 'oil'); did = adv(() => OD.act(() => OD.throwItem(i, tgt))); }
      if (!did) did = (m.sl && d > 1 && adv(() => OD.goStep(m.x, m.y))) || adv(() => OD.act(() => OD.move(Math.sign(m.x - p.x), Math.sign(m.y - p.y)) || OD.move(Math.sign(m.x - p.x), 0) || OD.move(0, Math.sign(m.y - p.y))));
    }
    if (!did && !m) {
      // gear upgrades
      for (let i = 0; i < p.inv.length && !did; i++) { const it = p.inv[i], k = OD.kindOf(it), cur = p.eq[k.type]; if (it.cursed && it.idd) continue;
        if (OD.ARMOR.includes(k.type) && (!cur || OD.kindOf(cur).ac + (cur.ab || 0) < k.ac + (it.idd ? it.ab || 0 : 0))) did = adv(() => OD.act(() => OD.wear(i)));
        else if (k.type === 'weapon' && !k.thrown && (!cur || (OD.kindOf(cur).dice[0] * (OD.kindOf(cur).dice[1] + 1)) < k.dice[0] * (k.dice[1] + 1))) did = adv(() => OD.act(() => OD.wear(i)));
        else if (k.type === 'ring' && !cur) did = adv(() => OD.act(() => OD.wear(i))); }
      if (!did && (p.hp < p.mhp * 0.75 || (p.mmp && p.mp < p.mmp * 0.5))) did = adv(() => OD.act(() => OD.rest()));
      if (!did && g.depth === 0) did = adv(() => OD.travelStep(OD.T.DOWN)) || adv(() => OD.act(() => OD.stairs(1)));
      if (!did) did = adv(() => OD.exploreStep());
      if (!did && p.lvl < g.depth * 1.2 && g.map[p.y * OD.W + p.x] !== OD.T.DOWN && rnd(2)) did = adv(() => OD.travelStep(OD.T.UP)) || adv(() => OD.act(() => OD.stairs(-1)));
      if (!did) did = adv(() => OD.travelStep(OD.T.DOWN)) || adv(() => OD.act(() => OD.stairs(1)));
    }
    if (process.argv[5] && g.turn > 2000 && g.turn < 2012) console.log(g.turn, 'd' + g.depth, 'L' + p.lvl, 'hp', p.hp + '/' + p.mhp, 'did', did, 'm', m && OD.MON[m.k].n + (m.sl ? 'z' : ''), 'tile', g.map[p.y * OD.W + p.x], g.msgs.slice(-1)[0].t);
    if (!did) { did = adv(() => OD.act(() => OD.move(rnd(3) - 1, rnd(3) - 1))) || adv(() => OD.act(() => true)); if (++stuck > 3000) break; }
  }
  const g = OD.g; (res[cls] = res[cls] || []).push(g.maxDepth + (g.dead ? '' : g.won ? 'W' : '*') + '/L' + g.p.lvl);
  if (process.argv[4]) console.log(cls, race, 'depth', g.maxDepth, 'lvl', g.p.lvl, 'turn', g.turn, g.dead ? 'killed by ' + g.dead.cause : 'alive');
}
for (const c in res) console.log(c.padEnd(8), res[c].join('  '));

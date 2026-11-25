// Headless smoke test: bots play many games; any exception or invariant break fails.
const OD = require('../game.js').OD;
const N = +process.argv[2] || 40, MAXT = +process.argv[3] || 6000;
let stats = { games: 0, deaths: 0, maxDepth: 0, turns: 0, lvl: 0, depthSum: 0 };
const causes = {};
function check(g) {
  const p = g.p;
  if (!(p.x > 0 && p.y > 0 && p.x < OD.W - 1 && p.y < OD.H - 1)) throw new Error('player out of bounds');
  if (![1, 3, 4, 5, 9].includes(g.map[p.y * OD.W + p.x])) throw new Error('player in solid tile ' + g.map[p.y * OD.W + p.x]);
  if (Number.isNaN(p.hp) || Number.isNaN(p.exp) || Number.isNaN(p.gold) || Number.isNaN(p.d.ac)) throw new Error('NaN stat');
  for (const m of g.mons) if (Number.isNaN(m.hp) || m.x === undefined) throw new Error('bad monster');
  for (const it of p.inv) { if (!OD.KINDS[it.k]) throw new Error('bad item ' + it.k); if (!(it.n > 0)) throw new Error('bad qty'); OD.itemName(it); }
}
const classes = Object.keys(OD.CLASSES), races = Object.keys(OD.RACES);
for (let n = 0; n < N; n++) {
  const g0 = OD.newGame({ seed: 'bot' + n, race: races[n % 4], cls: classes[(n >> 2) % 4], name: 'Bot' });
  let r = (n + 1) * 7919; const rnd = k => (r = (r * 1103515245 + 12345) & 0x7fffffff) % k;
  let idle = 0;
  for (let t = 0; t < MAXT; t++) {
    let g = OD.g; if (g.dead) break;
    const p = g.p; g.event = null;
    if (g.ask) OD.resolveAsk(p.inv.length ? { inv: rnd(p.inv.length) } : null);
    const seen = g.mons.filter(m => OD.canSee(m) && !m.sl);
    const near = seen.sort((a, b) => Math.max(Math.abs(a.x - p.x), Math.abs(a.y - p.y)) - Math.max(Math.abs(b.x - p.x), Math.abs(b.y - p.y)))[0];
    const c = rnd(100);
    const find = ty => { const L = []; p.inv.forEach((it, i) => { if (OD.kindOf(it).type === ty) L.push(i); }); return L.length ? L[rnd(L.length)] : -1; };
    let did = false;
    if (g.depth === 0) { // town: sometimes shop, then go down
      if (c < 5) OD.act(() => OD.buy(rnd(4), rnd(8)));
      if (c < 3 && p.inv.length) OD.act(() => OD.sell(rnd(4), rnd(p.inv.length)));
      if (!OD.travelStep(OD.T.DOWN)) OD.act(() => OD.stairs(1));
      did = true;
    } else if (p.hp < p.mhp * 0.4 && find('potion') >= 0) { const i = find('potion'); did = OD.act(() => OD.quaff(i)); }
    else if (p.food < 1500 && find('food') >= 0) { const i = find('food'); did = OD.act(() => OD.eat(i)); }
    else if (near) {
      const tgt = { x: near.x, y: near.y }, d = Math.max(Math.abs(near.x - p.x), Math.abs(near.y - p.y));
      const sp = OD.spellList();
      if (c < 8 && find('wand') >= 0) { const i = find('wand'); did = OD.act(() => OD.aim(i, tgt)); }
      else if (c < 14 && find('scroll') >= 0) { const i = find('scroll'); did = OD.act(() => OD.read(i)); }
      else if (c < 20 && find('potion') >= 0) { const i = find('potion'); did = OD.act(() => OD.quaff(i)); }
      else if (c < 26) { const i = rnd(p.inv.length || 1); did = OD.act(() => OD.throwItem(i, tgt)); }
      else if (sp.length && c < 70) { const s = OD.SPELLS.indexOf(sp[rnd(sp.length)]); did = OD.act(() => OD.cast(s, tgt)); }
      else if (d > 1 && p.eq.bow && c < 85) did = OD.act(() => OD.fire(tgt));
      if (!did) did = OD.act(() => OD.move(Math.sign(near.x - p.x), Math.sign(near.y - p.y)));
      if (!did) did = OD.act(() => OD.move(rnd(3) - 1, rnd(3) - 1));
    } else {
      if (c < 3 && p.inv.length) { const i = rnd(p.inv.length); did = OD.act(() => OD.wear(i)); }
      else if (c < 4) did = OD.act(() => OD.takeOff(OD.SLOTS[rnd(9)]));
      else if (c < 5) did = OD.act(() => OD.tunnel(rnd(3) - 1, rnd(3) - 1));
      else if (c < 6) did = OD.act(() => OD.search());
      else if (c < 7) did = OD.act(() => OD.refuel());
      else if (c < 8 && p.inv.length > 18) { const i = rnd(p.inv.length); did = OD.act(() => OD.drop(i)); }
      else if (c < 9) { OD.runStep(rnd(3) - 1, rnd(3) - 1 || 1, true); did = true; }
      else if (c < 10) { did = OD.act(() => OD.disarm(rnd(3) - 1, rnd(3) - 1)); OD.act(() => OD.closeDoor(rnd(3) - 1, rnd(3) - 1)); }
      if (!did) { if (p.hp < p.mhp * 0.6) did = OD.act(() => OD.rest());
        else if (OD.exploreStep()) did = true;
        else if (OD.travelStep(OD.T.DOWN)) did = true;
        else if (OD.act(() => OD.stairs(1))) did = true; }
      if (!did) did = OD.act(() => OD.move(rnd(3) - 1, rnd(3) - 1));
      if (!did) did = OD.act(() => true);
    }
    g = OD.g;
    if (t % 50 === 0) { check(g); const s = OD.save(); OD.load(s); if (OD.save() !== s) throw new Error('save roundtrip mismatch'); }
  }
  const g = OD.g; check(g); OD.morgue(); OD.score();
  for (let y = 0; y < OD.H; y++) for (let x = 0; x < OD.W; x++) OD.describe(x, y);
  stats.games++; stats.turns += g.turn; stats.depthSum += g.maxDepth; stats.maxDepth = Math.max(stats.maxDepth, g.maxDepth); stats.lvl = Math.max(stats.lvl, g.p.lvl);
  if (g.dead) { stats.deaths++; causes[g.dead.cause] = (causes[g.dead.cause] || 0) + 1; }
}
console.log(JSON.stringify(stats), 'avgDepth', (stats.depthSum / stats.games).toFixed(1));
console.log(Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, 12).map(e => e.join(':')).join(', '));

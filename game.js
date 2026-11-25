/* ORRUNDEEP — a classic ASCII dungeon descent. Engine (no DOM). MIT licence. */
(function (root) {
'use strict';
const W = 80, H = 32, MAXD = 20;
const T = { WALL: 0, FLOOR: 1, DOOR: 2, OPEN: 3, DOWN: 4, UP: 5, VEIN: 6, GOLD: 7, RUBBLE: 8, SHOP: 9, PERMA: 10 };
const C = { w: '#d8d4c8', gy: '#8a8578', dg: '#55524a', r: '#e0533d', o: '#e8913a', y: '#f2d14b', g: '#6cc04a', dgn: '#3f8f4f',
  b: '#4f8fe6', lb: '#7fd0f0', p: '#b06fe0', pk: '#f08fc0', br: '#b07a45', cy: '#3fc8b8', wh: '#ffffff', gold: '#ffd75e', red2: '#a02818' };

let g = null;                        // current game (plain JSON-able data)
let vis = new Uint8Array(W * H), los = new Uint8Array(W * H), dmap = new Int16Array(W * H);
let fx = [];                         // transient visual effects for the UI

/* ---------- RNG (seeded, state lives in g.rs) ---------- */
function rnd(n) { let t = (g.rs = (g.rs + 0x6D2B79F5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return Math.floor(((t ^ (t >>> 14)) >>> 0) / 4294967296 * n); }
function rint(a, b) { return a + rnd(b - a + 1); }
function dice(n, s) { let t = 0; for (let i = 0; i < n; i++) t += 1 + rnd(s); return t; }
function chance(p) { return rnd(100) < p; }
function pick(a) { return a[rnd(a.length)]; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }
const ix = (x, y) => y * W + x;
const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
const dist = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/* ---------- Data: races, classes ---------- */
const RACES = {
  Human:    { str: 0, dex: 0, con: 0, int: 0, hd: 0, stealth: 0, dig: 0, bow: 0, desc: 'Adaptable. Learns quickly (+10% experience).' },
  Dwarf:    { str: 2, dex: -1, con: 2, int: -1, hd: 1, stealth: -1, dig: 25, bow: 0, desc: 'Tough, born to stone. Tunnels fast, smells gold.' },
  Elf:      { str: -1, dex: 2, con: -1, int: 2, hd: -1, stealth: 1, dig: 0, bow: 3, desc: 'Keen-eyed and quick. Fine archers, sees the unseen.' },
  Halfling: { str: -2, dex: 3, con: 1, int: 0, hd: -2, stealth: 3, dig: 0, bow: 2, desc: 'Small, quiet and very hard to starve.' },
};
const CLASSES = {
  Warrior: { hd: 10, melee: 20, bow: 12, stealth: 0, str: 3, dex: 1, con: 2, int: -2, desc: 'Steel and stamina. Extra blows at levels 12 and 28.' },
  Rogue:   { hd: 7, melee: 15, bow: 16, stealth: 3, str: 0, dex: 3, con: 0, int: 1, desc: 'Silent. Triple damage on sleepers, spots and disarms traps.' },
  Ranger:  { hd: 8, melee: 13, bow: 22, stealth: 1, str: 1, dex: 2, con: 1, int: 0, desc: 'Master of the bow. Shoots twice from level 15.' },
  Mage:    { hd: 5, melee: 8, bow: 8, stealth: 1, str: -2, dex: 0, con: -1, int: 4, desc: 'Fragile. Wields twelve spells of rune and flame (m).' },
};
const SPELLS = [
  { n: 'Magic Dart', lv: 1, mp: 1, t: 1, d: 'A bolt of force.' },
  { n: 'Phase Step', lv: 3, mp: 2, d: 'Blink a short distance.' },
  { n: 'Find Foes', lv: 5, mp: 3, d: 'Sense nearby creatures.' },
  { n: 'Glowlight', lv: 7, mp: 3, d: 'Light up the area.' },
  { n: 'Frost Shard', lv: 9, mp: 5, t: 1, d: 'A lance of ice.' },
  { n: 'Slumber', lv: 11, mp: 6, d: 'Put creatures in view to sleep.' },
  { n: 'Appraise', lv: 13, mp: 7, d: 'Identify an item.' },
  { n: 'Farstep', lv: 15, mp: 8, d: 'Teleport across the level.' },
  { n: 'Fire Burst', lv: 18, mp: 10, t: 1, d: 'An exploding ball of flame.' },
  { n: 'Quicken', lv: 22, mp: 14, d: 'Haste yourself.' },
  { n: 'Unmake Stone', lv: 25, mp: 9, t: 1, d: 'Turn rock to dust.' },
  { n: 'Thunderlance', lv: 28, mp: 16, t: 1, d: 'A lightning beam through all in line.' },
];

/* ---------- Data: item kinds ---------- */
const KINDS = {};
function K(id, type, name, ch, col, depth, cost, o) { KINDS[id] = Object.assign({ id, type, name, ch, col, depth, cost, w: 10 }, o || {}); }
// weapons
K('dagger', 'weapon', 'Dagger', '|', C.w, 1, 10, { dice: [1, 4], thrown: 1 });
K('shortsword', 'weapon', 'Short Sword', '|', C.w, 1, 28, { dice: [1, 7] });
K('spear', 'weapon', 'Spear', '/', C.br, 1, 30, { dice: [1, 8], thrown: 1 });
K('mace', 'weapon', 'Mace', '\\', C.gy, 2, 50, { dice: [2, 4] });
K('pick', 'weapon', "Miner's Pick", '\\', C.br, 2, 60, { dice: [1, 5], dig: 40 });
K('longsword', 'weapon', 'Long Sword', '|', C.w, 4, 110, { dice: [2, 5] });
K('battleaxe', 'weapon', 'Battle Axe', '\\', C.gy, 6, 180, { dice: [2, 7] });
K('warhammer', 'weapon', 'War Hammer', '\\', C.gy, 8, 260, { dice: [3, 5] });
K('greatsword', 'weapon', 'Great Sword', '|', C.wh, 11, 420, { dice: [3, 6], w: 6 });
K('runeblade', 'weapon', 'Rune Blade', '|', C.lb, 15, 900, { dice: [4, 6], w: 3 });
K('sling', 'bow', 'Sling', '}', C.br, 1, 5, { mult: 2, ammo: 'shot' });
K('shortbow', 'bow', 'Short Bow', '}', C.br, 1, 50, { mult: 2, ammo: 'arrow' });
K('longbow', 'bow', 'Long Bow', '}', C.o, 6, 160, { mult: 3, ammo: 'arrow' });
K('arrow', 'ammo', 'Arrow', '{', C.br, 1, 1, { dice: [1, 7], ammo: 'arrow', w: 14 });
K('shot', 'ammo', 'Iron Shot', '{', C.gy, 1, 1, { dice: [1, 4], ammo: 'shot', w: 6 });
// armour
K('robe', 'body', 'Robe', '(', C.b, 1, 6, { ac: 2 });
K('leather', 'body', 'Leather Armour', '(', C.br, 1, 20, { ac: 4 });
K('studded', 'body', 'Studded Leather', '(', C.br, 3, 50, { ac: 7 });
K('chain', 'body', 'Chain Mail', '[', C.gy, 6, 170, { ac: 12 });
K('scale', 'body', 'Scale Hauberk', '[', C.gy, 9, 300, { ac: 15 });
K('plate', 'body', 'Dwarf-forged Plate', '[', C.wh, 12, 600, { ac: 20, w: 5 });
K('buckler', 'shield', 'Wooden Buckler', ')', C.br, 1, 15, { ac: 2 });
K('ironshield', 'shield', 'Iron Shield', ')', C.gy, 5, 90, { ac: 5 });
K('cap', 'helm', 'Leather Cap', ']', C.br, 1, 10, { ac: 1 });
K('helm', 'helm', 'Iron Helm', ']', C.gy, 4, 70, { ac: 3 });
K('gloves', 'gloves', 'Leather Gloves', ']', C.br, 1, 10, { ac: 1 });
K('gauntlets', 'gloves', 'Gauntlets', ']', C.gy, 5, 60, { ac: 2 });
K('boots', 'boots', 'Leather Boots', ']', C.br, 1, 8, { ac: 1 });
K('ironboots', 'boots', 'Iron-shod Boots', ']', C.gy, 5, 55, { ac: 2 });
// light, food, misc
K('torch', 'light', 'Wooden Torch', '~', C.o, 1, 4, { fuel: 3000, rad: 2, w: 14 });
K('lantern', 'light', 'Brass Lantern', '~', C.y, 3, 90, { fuel: 7500, rad: 3, w: 4 });
K('oil', 'flask', 'Flask of Oil', '!', C.y, 1, 4, { w: 14 });
K('ration', 'food', 'Ration', ',', C.br, 1, 4, { food: 3500, w: 14 });
K('biscuit', 'food', 'Hard Biscuit', ',', C.y, 1, 2, { food: 1500, w: 8 });
K('waybread', 'food', 'Wafer of Waybread', ',', C.wh, 5, 30, { food: 6000, heal: 15, w: 4 });
// potions
function P(id, name, depth, cost, w) { K('p_' + id, 'potion', name, '!', C.w, depth, cost, { eff: id, w: w || 10 }); }
P('clw', 'Light Healing', 1, 20, 22); P('csw', 'Strong Healing', 4, 60, 14); P('heal', 'Great Healing', 10, 250, 6);
P('speed', 'Swiftness', 3, 90, 7); P('hero', 'Heroism', 2, 40, 8); P('mana', 'Clarity', 3, 80, 6); P('poison', 'Poison', 1, 1, 6);
P('conf', 'Muddle', 1, 1, 6); P('sleep', 'Sleep', 2, 1, 5); P('str', 'Strength', 7, 500, 3); P('vigor', 'Vigor', 9, 600, 3);
P('seeinv', 'True Sight', 3, 50, 6); P('resist', 'Resistance', 5, 80, 7); P('cure', 'Antidote', 1, 25, 8); P('exp', 'Insight', 8, 400, 3);
// scrolls
function S(id, name, depth, cost, w) { K('s_' + id, 'scroll', name, '?', C.w, depth, cost, { eff: id, w: w || 10 }); }
S('light', 'Light', 1, 12, 10); S('map', 'Mapping', 3, 70, 9); S('tele', 'Teleportation', 2, 45, 10); S('blink', 'Phasing', 1, 15, 18);
S('id', 'Identify', 1, 35, 18); S('ench_w', 'Enchant Weapon', 3, 120, 7); S('ench_a', 'Enchant Armour', 3, 120, 7);
S('uncurse', 'Remove Curse', 2, 60, 6); S('treasure', 'Treasure Sense', 2, 40, 6); S('recall', 'Homeward', 2, 90, 7);
S('summon', 'Summoning', 1, 1, 6); S('aggro', 'Clamour', 1, 1, 5); S('descent', 'Deep Descent', 4, 60, 4); S('ward', 'Banishment', 9, 300, 3);
// wands
function Wd(id, name, depth, cost, w) { K('w_' + id, 'wand', name, '-', C.w, depth, cost, { eff: id, w: w || 6 }); }
Wd('missile', 'Force Bolts', 1, 100, 10); Wd('elec', 'Lightning', 4, 250, 7); Wd('cold', 'Frost', 6, 400, 6); Wd('fire', 'Fire', 8, 600, 6);
Wd('slow', 'Slowing', 2, 120, 6); Wd('sleepm', 'Slumber', 2, 120, 6); Wd('dig', 'Stone to Dust', 3, 200, 6); Wd('away', 'Sending', 5, 350, 5);
Wd('drain', 'Life Drain', 10, 800, 4);
// rings
function R(id, name, depth, cost, w) { K('r_' + id, 'ring', name, '=', C.w, depth, cost, { eff: id, w: w || 5 }); }
R('prot', 'Protection', 3, 250, 7); R('str', 'Strength', 6, 500, 4); R('dex', 'Deftness', 6, 500, 4); R('regen', 'Regeneration', 5, 450, 5);
R('seeinv', 'True Sight', 4, 300, 5); R('digest', 'Slow Digestion', 3, 200, 5); R('free', 'Free Action', 7, 600, 4);
R('speed', 'Speed', 16, 9000, 1); R('tele', 'Wandering', 2, 1, 3); R('fire', 'Flame Ward', 6, 400, 4); R('cold', 'Frost Ward', 6, 400, 4);
// artifacts
K('a_skarn', 'weapon', 'Skarnbrand', '|', C.o, 12, 9000, { dice: [3, 7], art: 1, th: 8, td: 9, ego: 'flame', w: 0 });
K('a_aegis', 'shield', 'the Aegis of Orrun', ')', C.gold, 10, 8000, { ac: 8, art: 1, ab: 9, ego: 'resist', w: 0 });
K('a_lamp', 'light', 'the Lamp of Yll', '~', C.lb, 8, 7000, { fuel: 1, rad: 4, art: 1, w: 0 });
K('a_whisper', 'bow', 'Whisper', '}', C.cy, 11, 8500, { mult: 4, ammo: 'arrow', art: 1, th: 10, td: 8, w: 0 });
K('a_crown', 'helm', 'the Drowned Crown', ']', C.gold, 99, 50000, { ac: 6, art: 1, ab: 10, ego: 'seeing', w: 0 });
K('gold', 'gold', 'gold', '$', C.gold, 1, 0, { w: 0 });
const EGO = {
  flame: { n: 'of Flame', on: 'weapon', v: 600 }, frost: { n: 'of Frost', on: 'weapon', v: 600 }, venom: { n: 'of Venom', on: 'weapon', v: 500 },
  slaying: { n: 'of Slaying', on: 'weapon', v: 900 }, delving: { n: 'of Delving', on: 'weapon', v: 300 },
  resist: { n: 'of Resistance', on: 'armor', v: 700 }, stealth: { n: 'of Stealth', on: 'boots', v: 400 },
  free: { n: 'of Free Action', on: 'gloves', v: 600 }, seeing: { n: 'of Seeing', on: 'helm', v: 500 },
};
const ARMOR = ['body', 'shield', 'helm', 'gloves', 'boots'];
const SLOTS = ['weapon', 'bow', 'body', 'shield', 'helm', 'gloves', 'boots', 'ring', 'light'];
const SLOTNAME = { weapon: 'Wielding', bow: 'Shooting', body: 'On body', shield: 'On arm', helm: 'On head', gloves: 'On hands', boots: 'On feet', ring: 'On finger', light: 'Light' };
const FLAV = {
  potion: ['Amber', 'Azure', 'Black', 'Bubbling', 'Chalky', 'Crimson', 'Cloudy', 'Emerald', 'Fizzing', 'Golden', 'Inky', 'Milky', 'Murky', 'Oily', 'Pearly', 'Rusty', 'Silver', 'Smoky', 'Violet', 'Viscous'],
  wand: ['Ash', 'Bone', 'Brass', 'Copper', 'Ebony', 'Glass', 'Iron', 'Ivory', 'Oak', 'Silver', 'Tin', 'Yew'],
  ring: ['Agate', 'Amethyst', 'Bloodstone', 'Garnet', 'Jade', 'Jet', 'Moonstone', 'Onyx', 'Opal', 'Pearl', 'Ruby', 'Topaz', 'Zircon'],
};
const FCOL = [C.o, C.b, C.dg, C.lb, C.w, C.r, C.gy, C.g, C.pk, C.gold, C.p, C.wh, C.br, C.y, C.pk, C.o, C.w, C.gy, C.p, C.dgn];
const SYL = ['or', 'run', 'kaz', 'eth', 'ul', 'mir', 'dra', 'vok', 'ash', 'nim', 'tor', 'bel', 'gha', 'zu', 'ith', 'om', 'kel', 'var', 'sen', 'dul'];

/* ---------- Data: monsters ---------- */
const MON = [];
function M(n, ch, col, d, lv, hp, sp, ac, at, xp, fl, o) { MON.push(Object.assign({ n, ch, col, d, lv, hp, sp, ac, at, xp, fl: fl || '' }, o || {})); }
// name, glyph, colour, depth, level, hp, speed, ac, attacks[n,s,effect], xp, flags, extra
M('gutter rat', 'r', C.br, 1, 1, 4, 11, 3, [[1, 3]], 2, 'AP');
M('pale grub', 'w', C.w, 1, 1, 5, 8, 2, [[1, 2]], 1, 'AM');
M('tunnel bat', 'b', C.br, 1, 1, 4, 14, 6, [[1, 3]], 2, 'AE');
M('kobold skulker', 'k', C.g, 1, 2, 8, 10, 6, [[1, 6]], 5, '', { drop: 40 });
M('mine jackal', 'C', C.y, 1, 1, 6, 11, 5, [[1, 3]], 2, 'AP');
M('lost prospector', 'p', C.lb, 1, 2, 9, 10, 5, [[1, 5]], 5, '', { drop: 70 });
M('moss jelly', 'j', C.g, 2, 3, 22, 10, 1, [[1, 4, 'pois']], 10, 'NSFp');
M('cave spider', 'S', C.gy, 2, 1, 3, 12, 6, [[1, 2]], 2, 'AP');
M('kobold slinger', 'k', C.y, 2, 3, 10, 10, 7, [[1, 5]], 9, '', { sp: ['arrow'], fr: 3, drop: 40 });
M('rot grub', 'w', C.dgn, 2, 2, 7, 8, 3, [[1, 3, 'pois']], 3, 'AMp');
M('soot imp', 'u', C.o, 3, 4, 13, 12, 10, [[1, 4, 'fire']], 16, 'ef', { sp: ['bolt_fire', 'blink'], fr: 4 });
M('goblin cutter', 'o', C.g, 3, 4, 16, 10, 9, [[1, 8]], 14, 'P', { drop: 35 });
M('giant centipede', 'c', C.r, 3, 4, 18, 11, 9, [[1, 5], [1, 5, 'pois']], 16, 'A');
M('cutpurse', 'p', C.dg, 3, 4, 15, 12, 10, [[1, 4, 'steal']], 14, '', { drop: 60 });
M('Grubnash, Goblin Overseer', 'o', C.y, 4, 8, 70, 11, 14, [[1, 10], [1, 10]], 110, 'UF', { drop: 100, good: 1 });
M('bone thrall', 's', C.w, 4, 5, 22, 10, 12, [[1, 9]], 22, 'uFp', { drop: 20 });
M('ashen wolf', 'C', C.gy, 4, 5, 20, 12, 10, [[1, 7]], 20, 'AP');
M('acolyte of the Drowned', 'p', C.cy, 4, 6, 24, 10, 10, [[1, 7]], 30, '', { sp: ['missile', 'scare', 'heal'], fr: 4, drop: 60 });
M('goblin archer', 'o', C.br, 4, 5, 18, 10, 10, [[1, 6]], 22, 'P', { sp: ['arrow'], fr: 2, drop: 35 });
M('ghoul', 'z', C.dgn, 5, 7, 34, 9, 12, [[1, 6, 'para'], [1, 7]], 45, 'uFp', { drop: 25 });
M('hobgoblin brute', 'o', C.o, 5, 7, 38, 10, 13, [[2, 6]], 40, '', { drop: 45 });
M('glow wisp', '*', C.lb, 5, 6, 12, 15, 18, [[1, 8, 'elec']], 38, 'EIF');
M('creeping coins', '$', C.gold, 6, 8, 40, 9, 20, [[2, 5, 'pois']], 55, 'SFp', { gold: 300 });
M('ogre', 'O', C.br, 6, 9, 55, 10, 13, [[2, 8]], 60, '', { drop: 50 });
M('cave bear', 'q', C.br, 6, 8, 50, 11, 12, [[1, 8], [1, 8], [1, 10]], 58, 'A');
M('venom asp', 'J', C.g, 7, 9, 36, 11, 16, [[2, 5, 'pois']], 62, 'Ap');
M('tomb wight', 'W', C.gy, 7, 10, 48, 10, 15, [[1, 9, 'xp']], 90, 'uFcp', { sp: ['scare'], fr: 6, drop: 60 });
M('goblin shaman', 'o', C.p, 7, 9, 34, 10, 11, [[1, 7]], 80, '', { sp: ['missile', 'blink', 'conf', 'summon'], fr: 3, drop: 70 });
M('moor troll', 'T', C.dgn, 8, 12, 80, 10, 16, [[1, 10], [1, 10], [2, 6]], 130, 'R', { drop: 50 });
M('phantom miner', 'G', C.lb, 8, 11, 40, 11, 20, [[1, 8, 'str']], 120, 'WIuFcp');
M('dire wolf', 'C', C.r, 8, 10, 46, 13, 14, [[2, 6]], 75, 'AP');
M('basilisk', 'R', C.y, 9, 13, 90, 10, 22, [[2, 8, 'para'], [2, 8]], 220, 'Ap');
M('Old Yarrow, the Mad Prospector', 'p', C.y, 10, 16, 220, 12, 22, [[3, 7], [3, 7], [1, 6, 'steal']], 600, 'UF', { sp: ['boulder', 'blink', 'heal'], fr: 4, drop: 100, good: 1 });
M('fallen dwarf warder', 'h', C.o, 10, 14, 95, 10, 26, [[3, 6], [3, 6]], 210, 'F', { drop: 70 });
M('fire vortex', 'v', C.r, 10, 12, 55, 12, 18, [[2, 8, 'fire']], 170, 'EFfSp', { sp: ['breath_fire'], fr: 5 });
M('young cave drake', 'd', C.g, 10, 14, 110, 10, 24, [[1, 10], [1, 10], [2, 8]], 260, 'p', { sp: ['breath_pois'], fr: 6, drop: 80 });
M('ogre magus', 'O', C.p, 11, 14, 90, 10, 18, [[2, 9], [2, 9]], 250, '', { sp: ['bolt_cold', 'hold', 'heal', 'blink'], fr: 4, drop: 80 });
M('stone giant', 'P', C.gy, 11, 16, 150, 10, 22, [[3, 8], [3, 8]], 320, '', { sp: ['boulder'], fr: 4, drop: 60 });
M('frost vortex', 'v', C.lb, 11, 13, 60, 12, 18, [[2, 8, 'cold']], 180, 'EFcSp', { sp: ['breath_cold'], fr: 5 });
M('pale wraith', 'W', C.w, 12, 16, 100, 11, 24, [[2, 8, 'xp'], [1, 10]], 380, 'uFcp', { sp: ['nether', 'scare', 'hold'], fr: 5, drop: 70 });
M('vampire', 'V', C.p, 12, 17, 130, 11, 26, [[2, 8, 'xp'], [2, 6, 'str']], 450, 'uFcp', { sp: ['scare', 'hold', 'nether'], fr: 5, drop: 90 });
M('gloom mage', 'p', C.p, 12, 16, 85, 11, 16, [[2, 6]], 420, '', { sp: ['bolt_fire', 'bolt_cold', 'blink', 'conf', 'summon', 'tele_to'], fr: 2, drop: 90 });
M('forge golem', 'g', C.o, 13, 18, 260, 9, 34, [[4, 8], [4, 8]], 500, 'SFfcp');
M('frost drake', 'd', C.lb, 13, 17, 170, 10, 28, [[2, 8], [2, 8], [3, 8]], 520, 'c', { sp: ['breath_cold'], fr: 5, drop: 90 });
M('cinder hound', 'Z', C.r, 13, 15, 75, 13, 22, [[2, 8, 'fire']], 260, 'APf', { sp: ['breath_fire'], fr: 6 });
M('bone lord', 's', C.gold, 14, 19, 190, 11, 32, [[3, 8], [3, 8], [2, 8, 'xp']], 700, 'uFcp', { sp: ['summon_undead', 'scare'], fr: 6, drop: 90, good: 1 });
M('banshee', 'G', C.pk, 14, 17, 80, 13, 26, [[2, 8, 'conf']], 480, 'WIuFcpE', { sp: ['scare', 'drain_mana'], fr: 4 });
M('Sister Veil, Voice of the Drowned', 'p', C.cy, 15, 24, 520, 12, 30, [[3, 8, 'xp'], [3, 8, 'conf']], 3000, 'UF', { sp: ['nether', 'hold', 'summon_undead', 'heal', 'tele_to', 'bolt_cold'], fr: 2, drop: 100, good: 1 });
M('fire elemental', 'E', C.o, 15, 20, 210, 11, 28, [[4, 6, 'fire'], [4, 6, 'fire']], 800, 'FfSp', { sp: ['bolt_fire'], fr: 5 });
M('storm giant', 'P', C.b, 15, 21, 280, 11, 28, [[4, 8], [4, 8, 'elec']], 950, '', { sp: ['bolt_elec', 'boulder'], fr: 4, drop: 80 });
M('elder vampire', 'V', C.r, 16, 23, 300, 12, 32, [[3, 8, 'xp'], [3, 8, 'str']], 1500, 'uFcp', { sp: ['nether', 'hold', 'scare', 'tele_to', 'drain_mana'], fr: 3, drop: 100, good: 1 });
M('lich', 'L', C.w, 16, 24, 280, 11, 30, [[2, 10, 'xp'], [2, 10, 'para']], 1900, 'uFcp', { sp: ['nether', 'bolt_cold', 'hold', 'conf', 'summon_undead', 'drain_mana', 'blink'], fr: 2, drop: 100, good: 1 });
M('greater drake', 'd', C.r, 16, 22, 330, 11, 34, [[3, 8], [3, 8], [4, 8]], 1400, 'f', { sp: ['breath_fire'], fr: 4, drop: 100 });
M('abyssal fiend', 'U', C.red2, 17, 25, 420, 12, 36, [[4, 8, 'fire'], [4, 8], [3, 8]], 2400, 'Ffp', { sp: ['bolt_fire', 'summon', 'scare', 'conf'], fr: 3, drop: 80 });
M('dread wraith', 'W', C.p, 17, 24, 300, 12, 34, [[3, 8, 'xp'], [3, 8, 'xp']], 2000, 'uFcpI', { sp: ['nether', 'hold', 'scare'], fr: 3, drop: 90 });
M('ancient fire wyrm', 'D', C.r, 18, 28, 600, 11, 40, [[4, 9], [4, 9], [5, 10]], 4500, 'Ff', { sp: ['breath_fire', 'scare'], fr: 3, drop: 100, good: 1 });
M('ancient frost wyrm', 'D', C.lb, 18, 28, 600, 11, 40, [[4, 9], [4, 9], [5, 10]], 4500, 'Fc', { sp: ['breath_cold', 'scare'], fr: 3, drop: 100, good: 1 });
M('archlich', 'L', C.p, 19, 30, 550, 12, 38, [[3, 10, 'xp'], [3, 10, 'para'], [3, 10, 'str']], 6000, 'uFcp', { sp: ['nether', 'bolt_cold', 'bolt_fire', 'hold', 'summon_undead', 'drain_mana', 'tele_to', 'conf'], fr: 2, drop: 100, good: 1 });
M('Morvane, the Drowned King', 'K', C.gold, 20, 36, 1500, 13, 46, [[5, 9], [5, 9, 'xp'], [4, 10, 'cold'], [4, 8, 'para']], 30000, 'UFBucp', { sp: ['nether', 'breath_cold', 'summon_undead', 'hold', 'tele_to', 'drain_mana', 'heal', 'bolt_elec'], fr: 3, drop: 100, good: 1 });
const BOSS = MON.length - 1;
const has = (k, f) => k.fl.indexOf(f) >= 0;

/* ---------- messages ---------- */
function msg(t, c) {
  const L = g.msgs, last = L[L.length - 1];
  if (last && last.t === t && last.turn >= g.turn - 1) { last.x = (last.x || 1) + 1; last.turn = g.turn; return; }
  L.push({ t, c: c || C.w, turn: g.turn }); if (L.length > 300) L.splice(0, 100);
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- items ---------- */
function kindOf(it) { return KINDS[it.k]; }
const FLAVORED = { potion: 1, scroll: 1, wand: 1, ring: 1 };
function itemCol(it) { const k = kindOf(it); return FLAVORED[k.type] ? g.flav[it.k].c : k.col; }
function itemName(it, noQty) {
  const k = kindOf(it); let s;
  if (k.type === 'gold') return it.n + ' gold pieces';
  if (FLAVORED[k.type]) {
    const f = g.flav[it.k], kn = g.known[it.k];
    const T1 = { potion: 'Potion', scroll: 'Scroll', wand: 'Wand', ring: 'Ring' }[k.type];
    if (kn) s = T1 + ' of ' + k.name; else s = k.type === 'scroll' ? 'Scroll titled "' + f.n + '"' : f.n + ' ' + T1;
    if (k.type === 'wand' && it.idd) s += ' (' + it.ch + ' charges)';
    if (it.n > 1) s = it.n + ' ' + s.replace(/^(Potion|Scroll)/, '$1s').replace(/ (Potion)$/, ' $1s');
    if (it.cursed && it.idd) s += ' {cursed}';
    return s;
  }
  s = k.name;
  if (it.ego) s += ' ' + EGO[it.ego].n;
  if (it.n > 1 && !noQty) s = it.n + ' ' + s.replace(/^(Flask|Wafer)/, '$1s').replace(/(Arrow|Ration|Biscuit|Dagger|Spear|Torch)$/, m => m === 'Torch' ? 'Torches' : m + 's');
  if (k.type === 'bow') s += ' (x' + k.mult + ')';
  if (k.dice) s += ' (' + k.dice[0] + 'd' + k.dice[1] + ')';
  const sg = v => (v >= 0 ? '+' : '') + v;
  if (it.idd) {
    if (k.type === 'weapon' || k.type === 'bow' || k.type === 'ammo') s += ' (' + sg(it.th || 0) + ',' + sg(it.td || 0) + ')';
    if (ARMOR.indexOf(k.type) >= 0) s += ' [' + k.ac + ',' + sg(it.ab || 0) + ']';
    if (it.cursed) s += ' {cursed}';
  } else if (ARMOR.indexOf(k.type) >= 0) s += ' [' + k.ac + ']';
  if (k.type === 'light' && !k.art) s += ' (' + it.fuel + ' turns)';
  return s;
}
function mkItem(id, n) {
  const k = KINDS[id], it = { k: id, n: n || 1 };
  if (k.type === 'light') it.fuel = k.fuel;
  if (k.art) { it.th = k.th || 0; it.td = k.td || 0; it.ab = k.ab || 0; if (k.ego) it.ego = k.ego; it.idd = 1; }
  if (k.type === 'wand') it.ch = rint(4, 10);
  return it;
}
function randKind(depth, types) {
  let tot = 0; const c = [];
  for (const id in KINDS) { const k = KINDS[id]; if (!k.w || k.depth > depth + 2 || (types && types.indexOf(k.type) < 0)) continue;
    const w = k.w * (k.depth >= depth - 5 ? 2 : 1); c.push([id, w]); tot += w; }
  if (!tot) return 'ration';
  let r = rnd(tot); for (const [id, w] of c) { if ((r -= w) < 0) return id; } return c[0][0];
}
function randItem(depth, good, types) {
  // artifacts: rare, once per game
  if (!types && depth >= 6 && chance(good ? 6 : 1)) {
    const a = ['a_skarn', 'a_aegis', 'a_lamp', 'a_whisper'].filter(id => !g.arts[id] && KINDS[id].depth <= depth + 3);
    if (a.length) { const id = pick(a); g.arts[id] = 1; return mkItem(id); }
  }
  // category weights
  let ty = types;
  if (!ty) { const r = rnd(100); ty = r < 24 ? ['potion'] : r < 46 ? ['scroll'] : r < 60 ? ['weapon', 'bow'] : r < 76 ? ARMOR : r < 82 ? ['wand'] : r < 86 ? ['ring'] : r < 92 ? ['food', 'flask', 'light'] : ['ammo']; }
  const id = randKind(depth, ty), k = KINDS[id], it = mkItem(id);
  if (k.type === 'ammo') it.n = rint(8, 25);
  if ((k.type === 'potion' || k.type === 'scroll') && chance(25)) it.n = rint(2, 3);
  if (k.type === 'food' || k.type === 'flask') it.n = rint(1, 4);
  if (k.thrown && chance(40)) it.n = rint(2, 5);
  const ench = () => 1 + rnd(2 + Math.floor(depth / 4));
  if (k.type === 'weapon' || k.type === 'bow' || k.type === 'ammo') {
    it.th = 0; it.td = 0;
    if (good || chance(28 + depth * 2)) { it.th = ench(); it.td = ench();
      if (k.type === 'weapon' && (good ? chance(40) : chance(4 + depth))) it.ego = id === 'pick' ? 'delving' : pick(['flame', 'frost', 'venom', 'slaying', 'flame', 'frost']); }
    else if (chance(9)) { it.th = -ench(); it.td = -ench(); it.cursed = 1; }
  } else if (ARMOR.indexOf(k.type) >= 0) {
    it.ab = 0;
    if (good || chance(28 + depth * 2)) { it.ab = ench();
      if (good ? chance(40) : chance(4 + depth)) it.ego = k.type === 'boots' ? 'stealth' : k.type === 'gloves' ? 'free' : k.type === 'helm' ? 'seeing' : 'resist'; }
    else if (chance(9)) { it.ab = -ench(); it.cursed = 1; }
  } else if (k.type === 'ring') {
    if (k.eff === 'prot') it.ab = ench() + 2;
    if (k.eff === 'str' || k.eff === 'dex') it.ab = 1 + rnd(3);
    if (k.eff === 'tele') it.cursed = 1;
  }
  return it;
}
function itemValue(it) {
  const k = kindOf(it); let v = k.cost;
  v += Math.max(0, (it.th || 0) + (it.td || 0)) * 40 + Math.max(0, it.ab || 0) * 45;
  if (it.ego) v += EGO[it.ego].v;
  if (k.type === 'wand') v = Math.floor(v * (0.4 + (it.ch || 0) * 0.08));
  if (it.cursed) v = 0;
  return Math.max(0, Math.floor(v));
}
const STACK = { potion: 1, scroll: 1, food: 1, flask: 1, ammo: 1, light: 1, weapon: 1 };
function canStack(a, b) {
  const k = kindOf(a); if (a.k !== b.k || !STACK[k.type] || k.art) return false;
  if (k.type === 'weapon' && !k.thrown) return false;
  if (k.type === 'light' && (k.id !== 'torch' || a.fuel !== b.fuel)) return false;
  return (a.th || 0) === (b.th || 0) && (a.td || 0) === (b.td || 0) && (a.ego || '') === (b.ego || '') && !!a.cursed === !!b.cursed && (!k.dice || !!a.idd === !!b.idd);
}
function invAdd(it) {
  const inv = g.p.inv;
  for (let i = 0; i < inv.length; i++) if (canStack(inv[i], it)) { inv[i].n += it.n; return i; }
  if (inv.length >= 23) return -1;
  inv.push(it); sortInv(); return inv.indexOf(it);
}
const TORDER = ['weapon', 'bow', 'ammo', 'body', 'shield', 'helm', 'gloves', 'boots', 'ring', 'light', 'wand', 'potion', 'scroll', 'food', 'flask'];
function sortInv() { g.p.inv.sort((a, b) => TORDER.indexOf(kindOf(a).type) - TORDER.indexOf(kindOf(b).type) || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0)); }
function invTake(i, n) {
  const it = g.p.inv[i]; n = n || 1;
  if (it.n <= n) { g.p.inv.splice(i, 1); return it; }
  it.n -= n; return Object.assign({}, it, { n });
}
function learn(id) { if (FLAVORED[KINDS[id].type] && !g.known[id]) { g.known[id] = 1; return true; } return false; }
function dropAt(it, x, y) {
  // find nearest free floor cell without stacking too deep
  for (let r = 0; r < 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const X = x + dx, Y = y + dy; if (!inb(X, Y)) continue; const t = g.map[ix(X, Y)];
    if (t !== T.FLOOR && t !== T.OPEN) continue;
    if (g.items.some(o => o.x === X && o.y === Y)) { const o = g.items.find(o => o.x === X && o.y === Y && canStack(o.it, it)); if (o) { o.it.n += it.n; return; } if (r < 3) continue; }
    g.items.push({ x: X, y: Y, it }); return;
  }
}
function placeGold(x, y, amt) { g.items.push({ x, y, it: { k: 'gold', n: Math.max(1, amt) } }); }

/* ---------- player derived stats ---------- */
const sb = v => Math.floor((v - 10) / 2);
function expFor(l) { return Math.floor(11 * Math.pow(l, 2.35)); }
function recalc() {
  const p = g.p, cl = CLASSES[p.cls], ra = RACES[p.race], e = p.eq, d = {};
  let str = p.st.str, dex = p.st.dex;
  if (e.ring) { const k = kindOf(e.ring); if (k.eff === 'str') str += e.ring.ab; if (k.eff === 'dex') dex += e.ring.ab; }
  d.str = str; d.dex = dex;
  d.ac = Math.max(0, sb(dex)); d.res = {}; d.stealth = cl.stealth + ra.stealth; d.dig = ra.dig + sb(str) * 4;
  d.fa = 0; d.si = p.race === 'Elf' ? 1 : 0; d.regen = 0; d.sd = p.race === 'Halfling' ? 1 : 0; d.speed = 10; d.light = 0; d.tele = 0;
  for (const s of ARMOR) if (e[s]) { d.ac += kindOf(e[s]).ac + (e[s].ab || 0); const eg = e[s].ego;
    if (eg === 'resist') d.res.fire = d.res.cold = 1; if (eg === 'stealth') d.stealth += 3; if (eg === 'free') d.fa = 1; if (eg === 'seeing') d.si = 1; }
  if (e.ring) { const k = kindOf(e.ring).eff, r = e.ring;
    if (k === 'prot') d.ac += r.ab; if (k === 'regen') d.regen = 1; if (k === 'seeinv') d.si = 1; if (k === 'digest') d.sd = 1; if (k === 'free') d.fa = 1;
    if (k === 'speed') d.speed += 10; if (k === 'tele') d.tele = 1; if (k === 'fire') d.res.fire = 1; if (k === 'cold') d.res.cold = 1; }
  const w = e.weapon;
  d.th = sb(dex) + (w ? (w.th || 0) : 0) + (p.t.hero ? 4 : 0); d.td = sb(str) + (w ? (w.td || 0) : 0);
  if (w) { d.dig += kindOf(w).dig || 0; if (w.ego === 'delving') d.dig += 30; }
  d.blows = 1 + (p.cls === 'Warrior' ? (p.lvl >= 12) + (p.lvl >= 28) : (p.lvl >= 22 ? 1 : 0));
  d.shots = p.cls === 'Ranger' && p.lvl >= 15 ? 2 : 1;
  if (e.light && (e.light.fuel > 0 || kindOf(e.light).art)) d.light = kindOf(e.light).rad;
  if (p.t.haste) d.speed += 10; if (p.t.slow) d.speed -= 5;
  if (p.t.resist) d.res.fire = d.res.cold = 1; if (p.t.seeinv) d.si = 1;
  if (p.t.hero) d.ac += 5;
  d.speed = Math.max(5, d.speed);
  p.mmp = p.cls === 'Mage' ? Math.max(1, p.lvl * 2 + sb(p.st.int) * Math.ceil(p.lvl / 2)) : 0;
  if (p.mp > p.mmp) p.mp = p.mmp;
  p.d = d;
}
function gainExp(n) {
  const p = g.p; if (p.race === 'Human') n *= 1.1;
  p.exp += n;
  while (p.lvl < 40 && p.exp >= expFor(p.lvl)) {
    p.lvl++; const hd = Math.max(3, CLASSES[p.cls].hd + RACES[p.race].hd);
    const gain = Math.max(2, Math.ceil(hd / 2) + rnd(Math.ceil(hd / 2) + 1) + sb(p.st.con)); p.mhp += gain; p.hp += gain;
    recalc(); p.mp = Math.min(p.mmp, p.mp + 2);
    msg('Welcome to level ' + p.lvl + '!', C.gold);
    if (p.cls === 'Mage') for (const s of SPELLS) if (s.lv === p.lvl) msg('You grasp a new spell: ' + s.n + '.', C.lb);
    if (p.lvl % 5 === 0) { const st = pick(['str', 'dex', 'con', 'int']); p.st[st]++; msg('You feel your ' + { str: 'strength', dex: 'agility', con: 'toughness', int: 'mind' }[st] + ' grow.', C.gold); recalc(); }
  }
}

/* ---------- map helpers ---------- */
function tile(x, y) { return inb(x, y) ? g.map[ix(x, y)] : T.PERMA; }
const passT = t => t === T.FLOOR || t === T.OPEN || t === T.DOWN || t === T.UP || t === T.SHOP;
const opaqueT = t => !(t === T.FLOOR || t === T.OPEN || t === T.DOWN || t === T.UP || t === T.SHOP);
function monAt(x, y) { const L = g.mons; for (let i = 0; i < L.length; i++) if (L[i].x === x && L[i].y === y) return L[i]; return null; }
function freeCell(x, y) { return passT(tile(x, y)) && !monAt(x, y) && !(g.p.x === x && g.p.y === y); }
function randFloor(far) {
  for (let i = 0; i < 4000; i++) { const x = rint(1, W - 2), y = rint(1, H - 2); if (g.map[ix(x, y)] !== T.FLOOR || monAt(x, y)) continue;
    if (g.p.x === x && g.p.y === y) continue; if (far && dist(x, y, g.p.x, g.p.y) < far && i < 3000) continue; return [x, y]; }
  return [g.p.x, g.p.y];
}
function line(x0, y0, x1, y1) {
  const pts = []; let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy;
  while (x0 !== x1 || y0 !== y1) { const e2 = 2 * err; if (e2 > -dy) { err -= dy; x0 += sx; } if (e2 < dx) { err += dx; y0 += sy; } pts.push([x0, y0]); }
  return pts;
}
function clearLine(x0, y0, x1, y1) { const L = line(x0, y0, x1, y1); for (let i = 0; i < L.length - 1; i++) if (opaqueT(tile(L[i][0], L[i][1]))) return false; return true; }

/* ---------- FOV ---------- */
const MULT = [[1, 0, 0, -1, -1, 0, 0, 1], [0, 1, -1, 0, 0, -1, 1, 0], [0, 1, 1, 0, 0, -1, -1, 0], [1, 0, 0, 1, -1, 0, 0, -1]];
function castLight(cx, cy, row, start, end, radius, xx, xy, yx, yy) {
  if (start < end) return; let newStart = 0;
  for (let j = row; j <= radius; j++) {
    let dx = -j - 1, dy = -j, blocked = false;
    while (dx <= 0) {
      dx++; const X = cx + dx * xx + dy * xy, Y = cy + dx * yx + dy * yy;
      const l = (dx - 0.5) / (dy + 0.5), r = (dx + 0.5) / (dy - 0.5);
      if (start < r) continue; else if (end > l) break;
      const ok = inb(X, Y); if (ok) los[ix(X, Y)] = 1;
      const op = !ok || opaqueT(g.map[ix(X, Y)]);
      if (blocked) { if (op) { newStart = r; continue; } else { blocked = false; start = newStart; } }
      else if (op && j < radius) { blocked = true; castLight(cx, cy, j + 1, start, l, radius, xx, xy, yx, yy); newStart = r; }
    }
    if (blocked) break;
  }
}
function updateVis() {
  const p = g.p; los.fill(0); vis.fill(0); los[ix(p.x, p.y)] = 1;
  if (!p.t.blind) for (let o = 0; o < 8; o++) castLight(p.x, p.y, 1, 1.0, 0.0, 80, MULT[0][o], MULT[1][o], MULT[2][o], MULT[3][o]);
  const lr = p.t.blind ? 0 : Math.max(1, p.d.light);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = ix(x, y); if (!los[i]) continue;
    const dd = dist(x, y, p.x, p.y);
    if (dd <= lr && (dd <= 1 || (x - p.x) * (x - p.x) + (y - p.y) * (y - p.y) <= lr * lr + 1) || g.lit[i]) { vis[i] = 1; g.seen[i] = 1; } }
  vis[ix(p.x, p.y)] = 1; g.seen[ix(p.x, p.y)] = 1;
  for (const m of g.mons) { const v = canSee(m); if (v && !m.wv) { g.disturb = 1; if (!m.met) { m.met = 1; const k = MON[m.k]; if (has(k, 'U')) msg(k.n + ' stands before you!', C.pk); } } m.wv = v ? 1 : 0; }
}
function canSee(m) { return !!(vis[ix(m.x, m.y)] && (!has(MON[m.k], 'I') || g.p.d.si)) || (m.det >= g.turn); }
function buildDmap() {
  dmap.fill(-1); const q = [ix(g.p.x, g.p.y)]; dmap[q[0]] = 0; let h = 0;
  while (h < q.length) { const c = q[h++], cx = c % W, cy = (c / W) | 0, d = dmap[c]; if (d >= 45) continue;
    for (let k = 0; k < 8; k++) { const X = cx + DIRS[k][0], Y = cy + DIRS[k][1]; if (!inb(X, Y)) continue; const i = ix(X, Y); if (dmap[i] >= 0) continue;
      const t = g.map[i]; if (!(passT(t) || t === T.DOOR)) continue; dmap[i] = d + 1; q.push(i); } }
}

/* ---------- level generation ---------- */
function newLevel(depth, how) {
  g.depth = depth; if (depth > g.maxDepth) g.maxDepth = depth;
  g.map = new Array(W * H).fill(T.WALL); g.seen = new Array(W * H).fill(0); g.lit = new Array(W * H).fill(0);
  g.items = []; g.mons = []; g.traps = {}; g.shopPos = {}; g.feel = '';
  for (let x = 0; x < W; x++) { g.map[ix(x, 0)] = T.PERMA; g.map[ix(x, H - 1)] = T.PERMA; }
  for (let y = 0; y < H; y++) { g.map[ix(0, y)] = T.PERMA; g.map[ix(W - 1, y)] = T.PERMA; }
  if (depth === 0) return genTown(how);
  const cave = depth >= 3 && depth < MAXD && chance(18) && genCave();
  if (!cave) genRooms(depth);
  // mineral veins
  for (let s = 0; s < 26; s++) { let x = rint(2, W - 3), y = rint(2, H - 3);
    for (let n = rint(5, 14); n > 0; n--) { if (g.map[ix(x, y)] === T.WALL) g.map[ix(x, y)] = chance(12 + depth) ? T.GOLD : T.VEIN; const d = pick(DIRS); x = clamp(x + d[0], 2, W - 3); y = clamp(y + d[1], 2, H - 3); } }
  const floors = []; for (let i = 0; i < W * H; i++) if (g.map[i] === T.FLOOR) floors.push(i);
  const takeFloor = () => { for (let n = 0; n < 500; n++) { const i = pick(floors); if (g.map[i] === T.FLOOR) return i; } return floors[0]; };
  const ups = [], downs = [];
  for (let n = rint(1, 2); n > 0; n--) { const i = takeFloor(); g.map[i] = T.UP; ups.push(i); }
  if (depth < MAXD) for (let n = rint(2, 3); n > 0; n--) { const i = takeFloor(); g.map[i] = T.DOWN; downs.push(i); }
  const st = how === 'down' ? pick(ups) : how === 'up' && downs.length ? pick(downs) : takeFloor();
  g.p.x = st % W; g.p.y = (st / W) | 0;
  // inhabitants and loot
  let nm = 7 + rnd(5) + Math.floor(depth / 3);
  while (nm-- > 0) { const [x, y] = randFloor(9); spawn(pickMon(depth), x, y, true); }
  for (let n = 4 + rnd(4); n > 0; n--) { const [x, y] = randFloor(0); g.items.push({ x, y, it: randItem(depth) }); }
  for (let n = 3 + rnd(4); n > 0; n--) { const [x, y] = randFloor(0); placeGold(x, y, dice(3, 8) * (2 + depth)); }
  if (depth >= 2) for (let n = rnd(3 + Math.floor(depth / 3)); n > 0; n--) { const i = takeFloor(); g.traps[i] = { k: pick(['pit', 'dart', 'tele', 'gas', 'summon', depth < MAXD ? 'door' : 'pit', 'fire']), f: 0 }; }
  let danger = 0, loot = 0;
  // treasure chamber
  if (chance(14 + depth)) { const [x, y] = randFloor(12);
    for (let n = 0; n < 4; n++) { dropAt(randItem(depth + 4, chance(50)), x + rint(-1, 1), y + rint(-1, 1)); }
    for (let n = 0; n < 4; n++) { const X = x + rint(-3, 3), Y = y + rint(-3, 3); if (freeCell(X, Y)) spawn(pickMon(depth + 2), X, Y, chance(60)); }
    loot += 2; danger += 1; }
  if (depth === MAXD) { const [x, y] = randFloor(20); spawn(BOSS, x, y, true); danger += 5; }
  else for (let k = 0; k < MON.length; k++) { const mk = MON[k]; if (has(mk, 'U') && !g.uniq[k] && k !== BOSS && mk.d <= depth && mk.d >= depth - 3 && chance(35)) { const [x, y] = randFloor(12); spawn(k, x, y, true); danger += 2; } }
  for (const m of g.mons) if (MON[m.k].d > depth) danger++;
  for (const o of g.items) if (kindOf(o.it).art || o.it.ego) loot += 2;
  g.feel = danger >= 5 ? 'A cold dread grips you. Something terrible dwells here.' : danger >= 3 ? 'This level feels dangerous.' : danger >= 1 ? 'You feel uneasy.' : 'The air here is still.';
  if (loot >= 2) g.feel += ' You sense wealth nearby.';
}
function genRooms(depth) {
  const rooms = [];
  for (let a = 0; a < 120 && rooms.length < 11; a++) {
    const w = rint(4, 13), h = rint(3, 6), x = rint(2, W - w - 3), y = rint(2, H - h - 3);
    if (rooms.some(r => x <= r.x + r.w + 1 && x + w + 1 >= r.x && y <= r.y + r.h + 1 && y + h + 1 >= r.y)) continue;
    rooms.push({ x, y, w, h });
    const lit = rnd(25) > depth;
    for (let Y = y - 1; Y <= y + h; Y++) for (let X = x - 1; X <= x + w; X++) { const i = ix(X, Y); if (lit) g.lit[i] = 1;
      if (X >= x && X < x + w && Y >= y && Y < y + h) g.map[i] = T.FLOOR; }
    // pillars / inner features for variety
    if (w >= 7 && h >= 5 && chance(30)) for (let Y = y + 1; Y < y + h - 1; Y += 2) for (let X = x + 1; X < x + w - 1; X += 2) if (chance(60)) g.map[ix(X, Y)] = T.WALL;
  }
  rooms.sort((a, b) => a.x - b.x);
  const ring = new Uint8Array(W * H);
  for (const r of rooms) for (let Y = r.y - 1; Y <= r.y + r.h; Y++) for (let X = r.x - 1; X <= r.x + r.w; X++) if (X < r.x || X >= r.x + r.w || Y < r.y || Y >= r.y + r.h) ring[ix(X, Y)] = 1;
  const carve = (x, y) => { const i = ix(x, y); if (g.map[i] === T.WALL) { g.map[i] = T.FLOOR; if (ring[i]) ring[i] = 2; } };
  const link = (a, b) => { let x = rint(a.x, a.x + a.w - 1), y = rint(a.y, a.y + a.h - 1); const tx = rint(b.x, b.x + b.w - 1), ty = rint(b.y, b.y + b.h - 1);
    const hf = chance(50);
    const hz = () => { while (x !== tx) { carve(x, y); x += x < tx ? 1 : -1; } }, vt = () => { while (y !== ty) { carve(x, y); y += y < ty ? 1 : -1; } };
    if (hf) { hz(); vt(); } else { vt(); hz(); } carve(x, y); };
  for (let i = 1; i < rooms.length; i++) link(rooms[i - 1], rooms[i]);
  for (let n = rint(1, 3); n > 0; n--) link(pick(rooms), pick(rooms));
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = ix(x, y); if (ring[i] !== 2) continue;
    const wl = t => t === T.WALL || t === T.PERMA;
    const h = wl(g.map[i - 1]) && wl(g.map[i + 1]), v = wl(g.map[i - W]) && wl(g.map[i + W]);
    if ((h || v) && chance(75)) g.map[i] = chance(75) ? T.DOOR : T.OPEN; }
}
function genCave() {
  const m = new Uint8Array(W * H);
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) m[ix(x, y)] = chance(56) ? 1 : 0;
  for (let it = 0; it < 4; it++) { const n = new Uint8Array(W * H);
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { let c = 0; for (let k = 0; k < 8; k++) c += m[ix(x + DIRS[k][0], y + DIRS[k][1])]; n[ix(x, y)] = c >= 5 || (c >= 4 && m[ix(x, y)]) ? 1 : 0; }
    m.set(n); }
  // largest connected region
  const lab = new Int32Array(W * H); let best = 0, bestN = 0, id = 0;
  for (let s = 0; s < W * H; s++) { if (!m[s] || lab[s]) continue; id++; let n = 0; const q = [s]; lab[s] = id;
    while (q.length) { const c = q.pop(); n++; for (let k = 0; k < 4; k++) { const j = c + DIRS[k][0] + DIRS[k][1] * W; if (j > 0 && j < W * H && m[j] && !lab[j]) { lab[j] = id; q.push(j); } } }
    if (n > bestN) { bestN = n; best = id; } }
  if (bestN < 550) return false;
  for (let i = 0; i < W * H; i++) if (lab[i] === best) g.map[i] = T.FLOOR;
  g.cave = 1; return true;
}
const SHOPS = [
  { n: "Halda's Provisions", types: ['food', 'flask', 'light', 'ammo'], fixed: ['ration', 'torch', 'oil', 'arrow', 'shot', 'p_clw', 'lantern'] },
  { n: 'The Cold Anvil', types: ['weapon', 'bow', 'body', 'shield', 'helm', 'gloves', 'boots'], fixed: ['shortsword', 'leather', 'buckler', 'pick', 'shortbow', 'sling'] },
  { n: 'Brine & Tincture', types: ['potion', 'scroll'], fixed: ['p_clw', 'p_cure', 's_recall', 's_id', 's_blink'] },
  { n: "Old Mett's Curios", types: ['wand', 'ring', 'scroll'], fixed: ['w_missile'] },
];
function stockShops() {
  g.shops = SHOPS.map((s, i) => { const st = [];
    for (const id of s.fixed) { const it = mkItem(id, KINDS[id].type === 'ammo' ? 30 : STACK[KINDS[id].type] && KINDS[id].type !== 'weapon' && id !== 'lantern' ? rint(3, 6) : 1); it.idd = 1; if (it.th === undefined && (KINDS[id].type === 'weapon' || KINDS[id].type === 'bow')) { it.th = 0; it.td = 0; } st.push(it); }
    const d = Math.min(12, 2 + Math.floor(g.maxDepth * 0.7));
    for (let n = rint(4, 7); n > 0; n--) { const it = randItem(d, i === 1 && chance(15), s.types); if (it.cursed || KINDS[it.k].cost < 2) continue; it.idd = 1; if (!st.some(o => o.k === it.k && !KINDS[it.k].dice && !KINDS[it.k].ac)) st.push(it); }
    return st; });
  g.restock = g.turn;
}
function genTown(how) {
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) g.map[ix(x, y)] = T.FLOOR;
  g.lit.fill(1);
  const B = [[12, 5], [50, 5], [12, 20], [50, 20]];
  B.forEach(([bx, by], n) => { for (let y = by; y < by + 6; y++) for (let x = bx; x < bx + 18; x++) g.map[ix(x, y)] = T.PERMA;
    const sx = bx + 9, sy = n < 2 ? by + 5 : by; g.map[ix(sx, sy)] = T.SHOP; g.shopPos[ix(sx, sy)] = n; });
  for (let n = 0; n < 40; n++) { const x = rint(2, W - 3), y = rint(2, H - 3); if (g.map[ix(x, y)] === T.FLOOR && dist(x, y, 40, 15) > 3) g.map[ix(x, y)] = chance(50) ? T.RUBBLE : T.FLOOR; }
  g.map[ix(40, 15)] = T.DOWN; g.p.x = 40; g.p.y = how === 'start' ? 17 : 15;
  if (!g.shops || g.turn - g.restock > 1500) stockShops();
  g.feel = 'The camp of Orrun Gate. The stair yawns below.';
}
function pickMon(depth) {
  const d = chance(8) ? depth + rint(1, 3) : depth, c = [];
  for (let k = 0; k < MON.length; k++) { const m = MON[k]; if (has(m, 'U') || m.d > d || m.d < d - 5) continue; c.push(k); if (m.d >= d - 2) c.push(k); }
  return c.length ? pick(c) : 0;
}
function spawn(k, x, y, asleep) {
  const mk = MON[k], hp = Math.max(1, Math.floor(mk.hp * (0.8 + rnd(41) / 100)));
  const mk1 = (X, Y) => { const m = { k, x: X, y: Y, hp: has(mk, 'U') ? mk.hp : hp, en: rnd(10), sl: asleep && !has(mk, 'S') && chance(88) ? 1 : 0 }; m.mhp = m.hp; g.mons.push(m); return m; };
  const m = mk1(x, y);
  if (has(mk, 'P')) for (let n = rint(2, 4); n > 0; n--) { const X = x + rint(-2, 2), Y = y + rint(-2, 2); if (freeCell(X, Y)) mk1(X, Y).sl = m.sl; }
  return m;
}
function spawnNear(k, x, y, n) { let c = 0; for (let t = 0; t < 40 && c < n; t++) { const X = x + rint(-2, 2), Y = y + rint(-2, 2); if (freeCell(X, Y) && g.mons.length < 90) { const m = spawn(k, X, Y, false); m.sl = 0; c++; } } return c; }

/* ---------- combat ---------- */
function mname(m, capd) { const k = MON[m.k]; const s = !canSee(m) ? 'something' : has(k, 'U') ? k.n : 'the ' + k.n; return capd ? cap(s) : s; }
function wake(m) { if (m.sl) { m.sl = 0; } }
function hurtMon(m, dmg, elem) {
  const k = MON[m.k];
  if (elem && ((elem === 'fire' && has(k, 'f')) || (elem === 'cold' && has(k, 'c')) || (elem === 'pois' && has(k, 'p')))) { if (canSee(m)) msg(mname(m, 1) + ' is unaffected.'); return false; }
  wake(m); m.hp -= dmg; m.hurt = 1;
  if (m.hp <= 0) { killMon(m); return true; }
  if (!has(k, 'F') && m.hp < m.mhp * 0.2 && chance(55) && !m.fear) { m.fear = rint(8, 16); if (canSee(m)) msg(mname(m, 1) + ' flees in terror!', C.y); }
  return false;
}
function killMon(m) {
  const k = MON[m.k], p = g.p, seen = canSee(m);
  const i = g.mons.indexOf(m); if (i >= 0) g.mons.splice(i, 1);
  msg(seen ? 'You have ' + (has(k, 'u') || k.ch === 'g' || k.ch === 'v' || k.ch === 'E' ? 'destroyed ' : 'slain ') + mname(m) + '.' : 'You hear a death cry.', C.o);
  gainExp(Math.max(1, Math.floor(k.xp * k.lv / p.lvl)));
  g.kills++; g.killList[k.n] = (g.killList[k.n] || 0) + 1;
  if (has(k, 'U')) g.uniq[m.k] = 1;
  if (k.gold) placeGold(m.x, m.y, k.gold + rnd(k.gold));
  if (k.drop && chance(k.drop)) { const n = has(k, 'U') ? rint(2, 4) : 1;
    for (let j = 0; j < n; j++) { if (chance(k.good ? 15 : 45)) dropAt({ k: 'gold', n: dice(4, 10) * (1 + k.lv) }, m.x, m.y); else dropAt(randItem(Math.max(g.depth, k.d), !!k.good && chance(70)), m.x, m.y); } }
  if (m.k === BOSS) { dropAt(mkItem('a_crown'), m.x, m.y); g.won = 1; msg('Morvane, the Drowned King, sinks into silence. Orrundeep is free!', C.gold); msg('You have WON. Take the crown home, or press Q to retire in glory.', C.gold); }
}
function playerAttack(m) {
  const p = g.p, k = MON[m.k], w = p.eq.weapon, wk = w ? kindOf(w) : null;
  const skill = CLASSES[p.cls].melee + p.lvl + p.d.th;
  let killed = false;
  for (let b = 0; b < p.d.blows && !killed; b++) {
    const sleeping = m.sl;
    if (!sleeping && !chance(clamp(62 + (skill - k.ac) * 2.4, 8, 96))) { msg('You miss ' + mname(m) + '.', C.gy); wake(m); continue; }
    let dmg = wk ? dice(wk.dice[0] + (w.ego === 'slaying' ? 1 : 0), wk.dice[1]) : dice(1, 2);
    dmg += p.d.td; let verb = 'hit';
    if (sleeping && p.cls === 'Rogue') { dmg *= 3; verb = 'backstab'; }
    else if (chance(4 + p.lvl / 4 + (p.cls === 'Warrior' ? 4 : 0))) { dmg = Math.floor(dmg * 2); verb = 'smash'; }
    dmg = Math.max(1, dmg);
    msg('You ' + verb + ' ' + mname(m) + '.', verb === 'hit' ? C.w : C.y);
    killed = hurtMon(m, dmg);
    if (!killed && w && w.ego) { const el = { flame: 'fire', frost: 'cold', venom: 'pois' }[w.ego];
      if (el && !((el === 'fire' && has(k, 'f')) || (el === 'cold' && has(k, 'c')) || (el === 'pois' && has(k, 'p')))) killed = hurtMon(m, dice(1, 8) + 2); }
  }
}
function hurtPlayer(dmg, cause) {
  const p = g.p; if (dmg <= 0 || g.dead) return;
  p.hp -= dmg; g.disturb = 1; if (p.t.sleep) p.t.sleep = 0;
  if (p.hp <= 0) { p.hp = 0; g.dead = { cause, depth: g.depth, turn: g.turn }; msg('You die...', C.r); }
  else if (p.hp < p.mhp * 0.25) msg('*** LOW HITPOINTS ***', C.r);
}
function setT(k, v, m, c) { const p = g.p; if (!p.t[k] && m) msg(m, c || C.w); p.t[k] = Math.max(p.t[k] || 0, v); recalc(); }
function elemDmg(dmg, el) { const p = g.p; if ((el === 'fire' && p.d.res.fire) || (el === 'cold' && p.d.res.cold)) return Math.floor(dmg / 3); return dmg; }
function monAttack(m) {
  const k = MON[m.k], p = g.p;
  for (const a of k.at) {
    if (g.dead || m.gone) return;
    if (!chance(clamp(58 + k.lv * 2.2 - p.d.ac * 0.85, 10, 95))) { msg(mname(m, 1) + ' misses you.', C.gy); continue; }
    let dmg = dice(a[0], a[1]); const e = a[2];
    dmg = Math.max(1, Math.floor(dmg * (1 - Math.min(p.d.ac, 90) / 220)));
    if (e === 'fire' || e === 'cold') dmg = elemDmg(dmg + dice(a[0], 4), e);
    const V = { pois: 'stings', para: 'touches', xp: 'drains', steal: 'grabs at', str: 'chills', fire: 'burns', cold: 'freezes', elec: 'shocks', conf: 'wails at' }[e] || (k.ch.match(/[rCbSwJcRqZdD]/) ? 'bites' : 'hits');
    msg(mname(m, 1) + ' ' + V + ' you.', C.r);
    hurtPlayer(dmg, k.n); if (g.dead) return;
    if (e === 'pois' && chance(60)) setT('pois', rint(5, 12), 'You are poisoned!', C.g);
    if (e === 'para') { if (p.d.fa) msg('You shrug off the numbness.'); else if (chance(45) && !p.t.para) { setT('para', rint(2, 4), 'You are paralysed!', C.r); } }
    if (e === 'xp' && chance(60)) { const l = Math.floor(p.exp * 0.04) + 5; p.exp = Math.max(0, p.exp - l); msg('You feel your life draining away!', C.p); }
    if (e === 'str' && chance(35) && p.st.str > 4) { p.st.str--; msg('You feel weaker.', C.p); recalc(); }
    if (e === 'conf' && chance(50)) setT('conf', rint(3, 6), 'You are confused!', C.y);
    if (e === 'steal' && p.gold > 0 && chance(clamp(70 - p.d.dex * 2, 20, 70))) { const s = Math.min(p.gold, Math.floor(p.gold / 5) + rint(10, 60)); p.gold -= s; msg('Your purse feels lighter! (' + s + ' gold stolen)', C.y); teleMon(m); m.fear = 30; return; }
  }
}
function teleMon(m) { const [x, y] = randFloor(15); m.x = x; m.y = y; }

/* ---------- monster AI ---------- */
function monSpell(m) {
  const k = MON[m.k], p = g.p, s = pick(k.sp), seen = canSee(m), N = mname(m, 1), d = dist(m.x, m.y, p.x, p.y);
  const bolt = (name, dmg, el, col) => { fx.push({ cells: line(m.x, m.y, p.x, p.y), ch: '*', col }); msg(N + ' ' + name + '.', C.r); hurtPlayer(elemDmg(dmg, el), k.n); };
  switch (s) {
    case 'arrow': bolt('fires a missile', dice(1, 6) + Math.floor(k.lv / 2), null, C.br); break;
    case 'boulder': bolt('hurls a boulder', dice(3, 8) + k.lv, null, C.gy); break;
    case 'missile': bolt('casts a force bolt', dice(2, 4) + Math.floor(k.lv / 2), null, C.pk); break;
    case 'bolt_fire': bolt('casts a bolt of fire', dice(4, 6) + k.lv, 'fire', C.o); break;
    case 'bolt_cold': bolt('casts a bolt of frost', dice(4, 6) + k.lv, 'cold', C.lb); break;
    case 'bolt_elec': bolt('hurls lightning', dice(5, 6) + k.lv, null, C.y); break;
    case 'nether': bolt('casts a bolt of grave-dark', dice(5, 6) + k.lv * 2, null, C.p); break;
    case 'breath_fire': case 'breath_cold': case 'breath_pois': {
      if (d > 8) return false; const el = s.slice(7); const dmg = Math.min(260, Math.floor(m.hp / (el === 'pois' ? 4 : 3)));
      fx.push({ cells: line(m.x, m.y, p.x, p.y), ch: '#', col: el === 'fire' ? C.o : el === 'cold' ? C.lb : C.g });
      msg(N + ' breathes ' + { fire: 'fire', cold: 'frost', pois: 'poison gas' }[el] + '!', C.r); hurtPlayer(elemDmg(dmg, el), k.n + "'s breath");
      if (el === 'pois' && !g.dead) setT('pois', rint(6, 12), 'You are poisoned!', C.g); break; }
    case 'blink': { for (let t = 0; t < 20; t++) { const X = m.x + rint(-6, 6), Y = m.y + rint(-6, 6); if (freeCell(X, Y)) { m.x = X; m.y = Y; break; } } if (seen) msg(N + ' blinks away.'); break; }
    case 'tele_to': { if (d < 3) return false; for (let t = 0; t < 30; t++) { const X = p.x + rint(-2, 2), Y = p.y + rint(-2, 2); if (freeCell(X, Y)) { m.x = X; m.y = Y; break; } } msg(N + ' steps out of the dark beside you!', C.r); break; }
    case 'summon': msg(N + ' calls for help!', C.r); spawnNear(pickMon(Math.max(1, k.d - 2)), m.x, m.y, rint(1, 3)); break;
    case 'summon_undead': { msg(N + ' calls the dead from the stone!', C.r); const u = []; MON.forEach((q, i) => { if (has(q, 'u') && !has(q, 'U') && q.d <= k.d - 2 && q.d >= k.d - 12) u.push(i); }); if (u.length) spawnNear(pick(u), m.x, m.y, rint(1, 2)); break; }
    case 'heal': { if (m.hp >= m.mhp * 0.7) return false; m.hp = Math.min(m.mhp, m.hp + k.lv * 4); if (seen) msg(N + ' looks healthier.'); break; }
    case 'conf': msg(N + ' weaves a muddling charm.', C.r); if (chance(clamp(70 - p.lvl, 20, 70))) setT('conf', rint(3, 6), 'You are confused!', C.y); else msg('You resist.'); break;
    case 'scare': msg(N + ' speaks a word of dread.', C.r); if (p.t.hero || chance(p.lvl * 2)) msg('You stand firm.'); else setT('afraid', rint(4, 8), 'You are terrified! (you cannot attack in melee)', C.y); break;
    case 'hold': msg(N + ' gestures at you.', C.r); if (p.d.fa) msg('You shrug off the numbness.'); else if (chance(clamp(65 - p.lvl, 15, 65)) && !p.t.para) setT('para', rint(2, 4), 'You are paralysed!', C.r); else msg('You resist.'); break;
    case 'drain_mana': if (p.mp <= 0) return false; msg(N + ' drinks your power.', C.p); { const dr = Math.min(p.mp, rint(4, 10) + Math.floor(k.lv / 2)); p.mp -= dr; m.hp = Math.min(m.mhp, m.hp + dr * 4); } break;
    default: return false;
  }
  return true;
}
function monStep(m, x, y) {
  const t = tile(x, y), k = MON[m.k];
  if (g.p.x === x && g.p.y === y) { monAttack(m); return true; }
  if (monAt(x, y)) return false;
  if (has(k, 'W')) { if (t === T.PERMA) return false; m.x = x; m.y = y; return true; }
  if (t === T.DOOR) { if (has(k, 'A')) return false; g.map[ix(x, y)] = T.OPEN; if (vis[ix(x, y)]) msg('A door creaks open.'); return true; }
  if (!passT(t)) return false;
  m.x = x; m.y = y; return true;
}
function monAct(m) {
  const k = MON[m.k], p = g.p; let d = dist(m.x, m.y, p.x, p.y);
  if (m.sl) { const ch = Math.max(2, 30 - p.d.stealth * 5) * (d <= 2 ? 3 : 1) * (g.aggro ? 20 : 1);
    if (d < 18 && rnd(1000) < ch) { m.sl = 0; if (canSee(m)) msg(mname(m, 1) + ' wakes up.', C.y); } return; }
  if (m.hold) { m.hold--; return; }
  if (has(k, 'R') && m.hp < m.mhp) m.hp = Math.min(m.mhp, m.hp + 3);
  if (m.fear) m.fear--;
  const L = los[ix(m.x, m.y)];
  if (has(k, 'M') && g.mons.length < 45 && rnd(60) === 0 && g.mons.filter(q => q.k === m.k).length < 12) { for (let t = 0; t < 8; t++) { const dd = pick(DIRS); if (freeCell(m.x + dd[0], m.y + dd[1])) { const c = spawn(m.k, m.x + dd[0], m.y + dd[1], false); c.sl = 0; break; } } }
  if (m.conf) { m.conf--; const dd = pick(DIRS); monStep(m, m.x + dd[0], m.y + dd[1]); return; }
  if (k.sp && L && d <= 14 && rnd(k.fr) === 0 && !m.fear) { if (monSpell(m)) return; }
  if (has(k, 'N')) { if (d <= 1) monAttack(m); return; }
  if ((has(k, 'E') && chance(50)) || (has(k, 'e') && chance(25))) { const dd = pick(DIRS); monStep(m, m.x + dd[0], m.y + dd[1]); return; }
  if (m.fear && d > 1 || (m.fear && chance(70))) { // flee
    let bx = 0, by = 0, bd = -1; for (const dd of DIRS) { const X = m.x + dd[0], Y = m.y + dd[1]; if (!freeCell(X, Y)) continue; const v = dmap[ix(X, Y)]; if (v > bd) { bd = v; bx = X; by = Y; } }
    if (bd > dmap[ix(m.x, m.y)]) { m.x = bx; m.y = by; return; }
    if (d > 1) return;
  }
  if (d <= 1) { monAttack(m); return; }
  if (has(k, 'W')) { monStep(m, m.x + Math.sign(p.x - m.x), m.y + Math.sign(p.y - m.y)); return; }
  const cur = dmap[ix(m.x, m.y)];
  if (cur < 0 || (cur > 22 && !L && !m.hurt && !g.aggro)) { if (chance(30)) { const dd = pick(DIRS); if (freeCell(m.x + dd[0], m.y + dd[1])) monStep(m, m.x + dd[0], m.y + dd[1]); } return; }
  let opts = [];
  for (const dd of DIRS) { const X = m.x + dd[0], Y = m.y + dd[1]; if (!inb(X, Y)) continue; const v = dmap[ix(X, Y)]; if (v >= 0 && v <= cur) opts.push([v + rnd(10) / 20, X, Y]); }
  opts.sort((a, b) => a[0] - b[0]);
  for (const o of opts) if (monStep(m, o[1], o[2])) return;
}

/* ---------- turn processing ---------- */
function endTurn() {
  const p = g.p;
  do {
    g.turn++;
    buildDmap();
    const share = 100 / p.d.speed; // monster energy per player action
    for (const m of g.mons.slice()) {
      if (m.hp <= 0) continue;
      let sp = MON[m.k].sp; if (m.slow) { m.slow--; sp = Math.max(3, sp - 4); }
      m.en += sp * share / 10;
      while (m.en >= 10 && !g.dead && g.mons.indexOf(m) >= 0) { m.en -= 10; m.gone = 0; monAct(m); }
      if (g.dead) return;
    }
    // player upkeep
    const t = p.t;
    if (t.pois && g.turn % 2 === 0) { hurtPlayer(1 + Math.floor(g.depth / 6), 'poison'); if (g.dead) return; }
    for (const k in t) if (t[k] > 0) { t[k]--; if (!t[k]) { const E = { haste: 'You slow down.', slow: 'You speed up again.', conf: 'Your head clears.', para: 'You can move again.', pois: 'The poison fades.', hero: 'The battle-fire fades.', seeinv: 'Your sight dulls.', resist: 'You feel exposed again.', blind: 'You can see again.', afraid: 'Your courage returns.', sleep: 'You wake up.' }[k]; if (E) msg(E); recalc(); } }
    const hungry = p.food < 1500;
    if (g.turn % (p.d.regen ? 3 : hungry ? 14 : 7) === 0 && !t.pois && p.hp < p.mhp) p.hp = Math.min(p.mhp, p.hp + 1 + Math.floor(p.mhp / 60) + (g.resting ? Math.floor(p.mhp / 40) : 0));
    if (p.mmp && g.turn % 6 === 0 && p.mp < p.mmp) p.mp = Math.min(p.mmp, p.mp + 1 + Math.floor(p.mmp / 25) + (g.resting ? 1 : 0));
    if (g.depth > 0 || g.turn % 4 === 0) {
      const burn = (p.d.sd ? (g.turn % 2) : 1) + (p.d.regen ? 1 : 0); const before = p.food; p.food -= burn;
      if (before >= 1500 && p.food < 1500) { msg('You are getting hungry.', C.y); g.disturb = 1; }
      if (before >= 400 && p.food < 400) { msg('You are weak with hunger! Eat something (E).', C.r); g.disturb = 1; }
      if (p.food <= 0) { p.food = 0; if (g.turn % 5 === 0) { msg('You are starving!', C.r); hurtPlayer(1 + Math.floor(p.mhp / 20), 'starvation'); if (g.dead) return; } }
    }
    const l = p.eq.light;
    if (l && !kindOf(l).art && l.fuel > 0 && g.depth > 0) { l.fuel--; if (l.fuel === 150) { msg('Your light is growing faint.', C.y); g.disturb = 1; } if (l.fuel === 0) { msg('Your light has gone out!', C.r); g.disturb = 1; recalc(); } }
    if (g.recall > 0 && --g.recall === 0) { g.disturb = 1;
      if (g.depth > 0) { msg('You feel yourself yanked upwards!', C.lb); newLevel(0, 'recall'); }
      else if (g.maxDepth > 0) { msg('You feel yourself pulled down into the dark!', C.lb); newLevel(Math.max(1, g.maxDepth), 'recall'); }
      arrive(); }
    if (p.d.tele && rnd(120) === 0) { msg('Your ring twists space around you.', C.p); teleport(40); g.disturb = 1; }
    if (g.depth > 0 && rnd(420) === 0 && g.mons.length < 60) { const [x, y] = randFloor(14); spawn(pickMon(g.depth), x, y, false); }
    if (g.aggro) g.aggro--;
    updateVis();
  } while (!g.dead && (p.t.para > 0 || p.t.sleep > 0));
}
function arrive() {
  recalc(); updateVis();
  if (g.depth > 0) { msg('— ' + depthName() + ' —', C.lb); msg(g.feel, C.gy); }
  else msg(g.feel, C.gy);
  checkWinExit(); g.autosave = 1;
}
function depthName() { return g.depth === 0 ? 'Orrun Gate (the surface)' : 'Depth ' + g.depth + ' (' + g.depth * 50 + ' ft)'; }
function teleport(r) {
  const p = g.p; for (let t = 0; t < 500; t++) { const x = r >= 40 ? rint(1, W - 2) : p.x + rint(-r, r), y = r >= 40 ? rint(1, H - 2) : p.y + rint(-r, r);
    if (!freeCell(x, y) || (r >= 40 && dist(x, y, p.x, p.y) < 15 && t < 300)) continue; p.x = x; p.y = y; updateVis(); return; }
}

/* ---------- player actions (each returns true if a turn passed) ---------- */
function act(fn) { if (g.dead) return false; fx.length = 0; g.disturb = 0; const r = fn(); if (r && !g.dead) endTurn(); return r; }
function stepOnto() {
  const p = g.p, i = ix(p.x, p.y);
  for (let j = g.items.length - 1; j >= 0; j--) { const o = g.items[j]; if (o.x === p.x && o.y === p.y && o.it.k === 'gold') { p.gold += o.it.n; msg('You pick up ' + o.it.n + ' gold.', C.gold); g.items.splice(j, 1); } }
  const here = g.items.filter(o => o.x === p.x && o.y === p.y);
  if (here.length === 1) msg('You see ' + itemName(here[0].it) + ' here.', C.gy); else if (here.length > 1) msg('You see ' + here.length + ' items here.', C.gy);
  const tr = g.traps[i]; if (tr) trigger(tr, i);
  const t = g.map[i];
  if (t === T.SHOP) g.event = { shop: g.shopPos[i] };
  if (t === T.DOWN && g.depth === 0 && !g.tipStairs) { g.tipStairs = 1; msg('Press > to descend into Orrundeep.', C.lb); }
  // passive trap spotting
  for (const d of DIRS) { const j = ix(p.x + d[0], p.y + d[1]), q = g.traps[j]; if (q && !q.f && chance(p.cls === 'Rogue' ? 60 : 12)) { q.f = 1; msg('You spot a trap.', C.y); g.disturb = 1; } }
}
function trigger(tr, i) {
  const p = g.p; tr.f = 1; g.disturb = 1;
  if (p.cls === 'Rogue' && chance(35)) { msg('You nimbly sidestep a trap.', C.y); return; }
  switch (tr.k) {
    case 'pit': msg('You fall into a pit!', C.r); hurtPlayer(dice(2, 6), 'a pit trap'); break;
    case 'dart': msg('A dart flies out of the wall!', C.r); hurtPlayer(dice(1, 6), 'a dart trap'); if (!g.dead) setT('pois', rint(6, 12), 'You are poisoned!', C.g); break;
    case 'tele': msg('The floor twists beneath you.', C.p); delete g.traps[i]; teleport(40); break;
    case 'gas': msg('A cloud of gas billows up!', C.g); if (chance(50)) setT('conf', rint(5, 10), 'You are confused!', C.y); else if (!p.d.fa) setT('sleep', rint(3, 6), 'You fall asleep!', C.r); break;
    case 'summon': msg('A rune flares underfoot!', C.p); delete g.traps[i]; spawnNear(pickMon(g.depth), p.x, p.y, rint(2, 3)); break;
    case 'fire': msg('Flames roar up around you!', C.o); hurtPlayer(elemDmg(dice(4, 6), 'fire'), 'a fire trap'); break;
    case 'door': msg('A trapdoor opens beneath you!', C.r); hurtPlayer(dice(1, 6), 'a long fall'); if (!g.dead) { newLevel(g.depth + 1, 'fall'); arrive(); } break;
  }
}
function move(dx, dy) {
  const p = g.p;
  if (p.t.conf && chance(45)) { const d = pick(DIRS); dx = d[0]; dy = d[1]; msg('You stumble.', C.y); }
  const x = p.x + dx, y = p.y + dy, t = tile(x, y), m = monAt(x, y);
  if (m) { if (p.t.afraid) { msg('You are too afraid to attack!', C.y); return false; } playerAttack(m); return true; }
  if (t === T.DOOR) { g.map[ix(x, y)] = T.OPEN; msg('You open the door.'); return true; }
  if (passT(t)) { p.x = x; p.y = y; stepOnto(); return true; }
  if (t === T.RUBBLE || t === T.VEIN || t === T.GOLD) { msg(t === T.RUBBLE ? 'Rubble blocks the way. (T to tunnel)' : 'A mineral vein. (T to tunnel)', C.gy); return false; }
  return false;
}
function pickup() {
  const p = g.p; let n = 0;
  for (let j = g.items.length - 1; j >= 0; j--) { const o = g.items[j]; if (o.x !== p.x || o.y !== p.y) continue;
    const it = o.it; const i = invAdd(it); if (i < 0) { msg('Your pack is full.', C.y); break; }
    g.items.splice(j, 1); msg('You have ' + itemName(p.inv[i]) + ' (' + String.fromCharCode(97 + i) + ').'); n++;
    if (it.k === 'a_crown' && !g.crown) { g.crown = 1; msg('The Drowned Crown is yours. Carry it to the surface!', C.gold); } }
  if (!n && !g.items.some(o => o.x === p.x && o.y === p.y)) { msg('There is nothing here to pick up.'); return false; }
  return n > 0;
}
function drop(i) { const p = g.p, it = p.inv[i]; if (!it) return false; p.inv.splice(i, 1); dropAt(it, p.x, p.y); msg('You drop ' + itemName(it) + '.'); return true; }
function wear(i) {
  const p = g.p, src = p.inv[i]; if (!src) return false; const k = kindOf(src), slot = k.type;
  if (SLOTS.indexOf(slot) < 0) { msg('You cannot wear or wield that.'); return false; }
  const old = p.eq[slot];
  if (old && old.cursed) { old.idd = 1; msg('You cannot remove your ' + itemName(old, 1) + ' — it is cursed!', C.r); return false; }
  const it = invTake(i, 1); p.eq[slot] = it; it.idd = 1;
  if (old) { if (invAdd(old) < 0) dropAt(old, p.x, p.y); }
  if (slot === 'ring') learn(it.k);
  msg((slot === 'weapon' || slot === 'bow' ? 'You wield ' : slot === 'light' ? 'You light ' : 'You put on ') + itemName(it) + '.');
  if (it.cursed) msg('It feels deathly cold. It is cursed!', C.r);
  recalc(); return true;
}
function takeOff(slot) {
  const p = g.p, it = p.eq[slot]; if (!it) return false;
  if (it.cursed) { msg('It will not come off. It is cursed!', C.r); return false; }
  if (invAdd(it) < 0) { msg('Your pack is full.'); return false; }
  p.eq[slot] = null; msg('You remove ' + itemName(it) + '.'); recalc(); return true;
}
function heal(n) { const p = g.p; p.hp = Math.min(p.mhp, p.hp + n); }
function eat(i) {
  const p = g.p, it = p.inv[i], k = kindOf(it); if (k.type !== 'food') return false;
  invTake(i, 1); p.food = Math.min(15000, p.food + k.food); msg('You eat the ' + k.name.toLowerCase() + '. ' + (p.food > 12000 ? 'You are full.' : 'That was good.')); if (k.heal) heal(k.heal); return true;
}
function quaff(i) {
  const p = g.p, it = p.inv[i], k = kindOf(it); if (k.type !== 'potion') return false;
  invTake(i, 1); const isNew = learn(it.k); p.food = Math.min(15000, p.food + 100);
  switch (k.eff) {
    case 'clw': heal(dice(3, 8) + 4); p.t.blind = 0; msg('You feel better.', C.g); break;
    case 'csw': heal(dice(6, 8) + 15); p.t.conf = 0; p.t.blind = 0; msg('You feel much better.', C.g); break;
    case 'heal': heal(300); p.t.conf = p.t.pois = p.t.blind = 0; msg('Warmth floods through you. You feel whole.', C.g); break;
    case 'speed': setT('haste', rint(20, 35), 'The world slows around you.', C.lb); break;
    case 'hero': setT('hero', rint(30, 50), 'Your heart blazes with courage.', C.gold); p.t.afraid = 0; heal(10); break;
    case 'mana': p.mp = p.mmp; msg(p.mmp ? 'Your mind is clear and bright.' : 'Your head feels clear.', C.lb); break;
    case 'poison': setT('pois', rint(8, 16), 'Ugh — poison!', C.g); break;
    case 'conf': setT('conf', rint(6, 12), 'The walls swim. You are confused!', C.y); break;
    case 'sleep': if (p.d.fa) msg('You yawn.'); else setT('sleep', rint(4, 8), 'You fall asleep!', C.r); break;
    case 'str': p.st.str++; msg('Your muscles swell. (+1 Strength)', C.gold); break;
    case 'vigor': { const s = pick(['dex', 'con', 'int']); p.st[s]++; if (s === 'con') { p.mhp += p.lvl; p.hp += p.lvl; } msg('You feel changed for the better. (+1 ' + cap(s) + ')', C.gold); break; }
    case 'seeinv': setT('seeinv', rint(60, 100), 'Your eyes tingle.', C.lb); break;
    case 'resist': setT('resist', rint(40, 60), 'You feel armoured against fire and frost.', C.lb); break;
    case 'cure': p.t.pois = 0; p.t.conf = 0; heal(5); msg('Your blood runs clean.', C.g); break;
    case 'exp': gainExp(Math.max(20, Math.floor(expFor(p.lvl) * 0.25))); msg('Old memories that are not yours pour into you.', C.gold); break;
  }
  if (isNew) msg('It was a Potion of ' + k.name + '.', C.gy);
  recalc(); return true;
}
function litArea(r) { const p = g.p; for (let y = p.y - r; y <= p.y + r; y++) for (let x = p.x - r; x <= p.x + r; x++) if (inb(x, y) && (x - p.x) * (x - p.x) + (y - p.y) * (y - p.y) <= r * r + 1 && clearLine(p.x, p.y, x, y)) g.lit[ix(x, y)] = 1; }
function read(i) {
  const p = g.p, it = p.inv[i], k = kindOf(it); if (k.type !== 'scroll') return false;
  if (p.t.blind || p.t.conf) { msg(p.t.blind ? 'You cannot see to read.' : 'The runes crawl about. You are too confused to read.'); return false; }
  if (!p.d.light && !g.lit[ix(p.x, p.y)]) { msg('It is too dark to read.'); return false; }
  invTake(i, 1); const isNew = learn(it.k);
  switch (k.eff) {
    case 'light': litArea(6); msg('Light floods the area.', C.y); break;
    case 'map': { for (let y = p.y - 12; y <= p.y + 12; y++) for (let x = p.x - 30; x <= p.x + 30; x++) if (inb(x, y)) { const t = g.map[ix(x, y)]; if (passT(t) || t === T.DOOR) { g.seen[ix(x, y)] = 1; for (const d of DIRS) if (inb(x + d[0], y + d[1])) g.seen[ix(x + d[0], y + d[1])] = 1; } } msg('An image of your surroundings forms in your mind.', C.lb); break; }
    case 'tele': msg('The world lurches.', C.p); teleport(40); break;
    case 'blink': msg('You blink.', C.p); teleport(8); break;
    case 'id': { if (p.inv.some(o => !fullyKnown(o)) || SLOTS.some(s => p.eq[s] && !fullyKnown(p.eq[s]))) g.ask = { type: 'id' }; else msg('You have nothing left to identify.'); break; }
    case 'ench_w': { const w = p.eq.weapon || p.eq.bow; if (!w) { msg('Your hands tingle.'); break; } if ((w.th || 0) + (w.td || 0) >= 16) { msg('The enchantment fails.'); break; } if (chance(50)) w.th = (w.th || 0) + 1; else w.td = (w.td || 0) + 1; w.cursed = 0; w.idd = 1; msg('Your ' + kindOf(w).name + ' glows briefly.', C.lb); break; }
    case 'ench_a': { const a = ARMOR.map(s => p.eq[s]).filter(Boolean); if (!a.length) { msg('Your skin tingles.'); break; } const w = pick(a); if ((w.ab || 0) >= 9) { msg('The enchantment fails.'); break; } w.ab = (w.ab || 0) + 1; w.cursed = 0; w.idd = 1; msg('Your ' + kindOf(w).name + ' glows briefly.', C.lb); break; }
    case 'uncurse': { let n = 0; for (const s of SLOTS) if (p.eq[s] && p.eq[s].cursed) { p.eq[s].cursed = 0; n++; } msg(n ? 'You feel as if someone is watching over you.' : 'Nothing seems to happen.', C.lb); break; }
    case 'treasure': { let n = 0; for (const o of g.items) { g.seen[ix(o.x, o.y)] = 1; o.det = 1; n++; } for (let j = 0; j < W * H; j++) if (g.map[j] === T.GOLD) { g.seen[j] = 1; n++; } msg(n ? 'You sense the glint of treasure.' : 'You sense no treasure.', C.gold); break; }
    case 'recall': if (g.recall) { g.recall = 0; msg('A tension leaves the air.'); } else { g.recall = rint(15, 30); msg('The air about you grows charged...', C.lb); } break;
    case 'summon': msg('You hear claws on stone!', C.r); spawnNear(pickMon(g.depth + 1), p.x, p.y, rint(2, 3)); break;
    case 'aggro': msg('A shrieking clamour echoes through the halls!', C.r); g.aggro = 60; for (const m of g.mons) m.sl = 0; break;
    case 'descent': if (g.depth >= MAXD || g.depth === 0) { msg('The floor shivers.'); break; } msg('The floor opens beneath you!', C.p); newLevel(g.depth + 1, 'fall'); arrive(); break;
    case 'ward': { let n = 0; for (const m of g.mons.slice()) if (canSee(m) && !has(MON[m.k], 'U')) { g.mons.splice(g.mons.indexOf(m), 1); n++; } msg(n ? 'The creatures around you are flung into the void!' : 'The scroll crumbles.', C.p); break; }
  }
  if (isNew) msg('It was a Scroll of ' + k.name + '.', C.gy);
  recalc(); return true;
}
function fullyKnown(it) { const k = kindOf(it); if (FLAVORED[k.type] && !g.known[it.k]) return false; if (k.type === 'gold' || k.type === 'food' || k.type === 'flask' || k.type === 'potion' || k.type === 'scroll' || k.type === 'light') return true; return !!it.idd; }
function identify(it) { learn(it.k); it.idd = 1; msg('It is ' + itemName(it) + '.', C.lb); sortInv(); }
function resolveAsk(sel) { // sel: {inv:i} or {eq:slot} or null
  const a = g.ask; g.ask = null; if (!a || !sel) return;
  const it = sel.eq ? g.p.eq[sel.eq] : g.p.inv[sel.inv]; if (it && a.type === 'id') identify(it);
}
/* projectiles */
function project(tx, ty, range, pierce) {
  const p = g.p; let ex = tx, ey = ty; const dx = tx - p.x, dy = ty - p.y; if (!dx && !dy) return { path: [], hits: [], x: p.x, y: p.y };
  const kx = Math.max(Math.abs(dx), Math.abs(dy)); const f = Math.ceil(range / kx) + 1; ex = p.x + dx * f; ey = p.y + dy * f;
  const L = line(p.x, p.y, ex, ey), path = [], hits = []; let lx = p.x, ly = p.y;
  for (const [x, y] of L) { if (path.length >= range || opaqueT(tile(x, y))) break; path.push([x, y]); lx = x; ly = y; const m = monAt(x, y); if (m) { hits.push(m); if (!pierce) break; } }
  return { path, hits, x: lx, y: ly };
}
function boltAt(tgt, dmg, el, col, pierce, name) {
  const r = project(tgt.x, tgt.y, 14, pierce); fx.push({ cells: r.path, ch: pierce ? '=' : '*', col });
  if (!r.hits.length) { msg('The ' + name + ' hits nothing.', C.gy); return r; }
  for (const m of r.hits) { msg('The ' + name + ' strikes ' + mname(m) + '.'); hurtMon(m, typeof dmg === 'function' ? dmg() : dmg, el); }
  return r;
}
function ballAt(tgt, dmg, el, col, name, rad) {
  const r = project(tgt.x, tgt.y, 14); const cells = [];
  for (let y = r.y - rad; y <= r.y + rad; y++) for (let x = r.x - rad; x <= r.x + rad; x++) if (inb(x, y) && !opaqueT(tile(x, y)) && (x - r.x) * (x - r.x) + (y - r.y) * (y - r.y) <= rad * rad + 1 && clearLine(r.x, r.y, x, y)) cells.push([x, y]);
  fx.push({ cells: r.path, ch: '*', col }); fx.push({ cells, ch: '#', col });
  msg('The ' + name + ' explodes!', col);
  for (const [x, y] of cells) { const m = monAt(x, y); if (m) hurtMon(m, Math.floor(dmg * (dist(x, y, r.x, r.y) > 1 ? 0.6 : 1)), el); }
}
function aim(i, tgt) {
  const p = g.p, it = p.inv[i], k = kindOf(it); if (k.type !== 'wand') return false;
  if (it.ch <= 0) { msg('The wand has no charges left.'); it.idd = 1; return true; }
  it.ch--; const isNew = learn(it.k); const lv = p.lvl;
  const first = () => project(tgt.x, tgt.y, 14).hits[0];
  switch (k.eff) {
    case 'missile': boltAt(tgt, dice(3, 5) + 2, null, C.pk, 0, 'force bolt'); break;
    case 'elec': boltAt(tgt, () => dice(5, 8) + lv, null, C.y, 1, 'lightning'); break;
    case 'cold': boltAt(tgt, dice(7, 8) + lv, 'cold', C.lb, 0, 'frost bolt'); break;
    case 'fire': ballAt(tgt, dice(8, 8) + lv * 2, 'fire', C.o, 'fireball', 2); break;
    case 'slow': { const m = first(); if (m) { m.slow = 25; wake(m); msg(mname(m, 1) + ' moves sluggishly.'); } else msg('Nothing happens.'); break; }
    case 'sleepm': { const m = first(); if (m && !has(MON[m.k], 'S') && !has(MON[m.k], 'U') && MON[m.k].lv < lv + 12) { m.sl = 1; msg(mname(m, 1) + ' falls asleep.'); } else msg(m ? mname(m, 1) + ' is unaffected.' : 'Nothing happens.'); break; }
    case 'dig': digBolt(tgt); break;
    case 'away': { const m = first(); if (m) { msg(mname(m, 1) + ' vanishes!'); teleMon(m); } else msg('Nothing happens.'); break; }
    case 'drain': { const m = first(); if (m) { if (has(MON[m.k], 'u')) msg(mname(m, 1) + ' is unaffected.'); else { const d = Math.min(m.hp, 60 + lv * 2); msg('You drink the life of ' + mname(m) + '.', C.p); heal(Math.floor(d / 2)); hurtMon(m, d); } } else msg('Nothing happens.'); break; }
  }
  if (isNew) msg('It is a Wand of ' + k.name + '.', C.gy);
  return true;
}
function digBolt(tgt) {
  const p = g.p, L = line(p.x, p.y, p.x + (tgt.x - p.x) * 20, p.y + (tgt.y - p.y) * 20); let n = 0; const cells = [];
  for (const [x, y] of L) { if (!inb(x, y) || cells.length > 12) break; const i = ix(x, y), t = g.map[i]; if (t === T.PERMA) break; cells.push([x, y]);
    if (t === T.WALL || t === T.VEIN || t === T.GOLD || t === T.RUBBLE || t === T.DOOR) { g.map[i] = T.FLOOR; if (t === T.GOLD) placeGold(x, y, dice(5, 10) * (3 + g.depth)); if (++n >= 1 && t !== T.DOOR && n >= 6) break; } }
  fx.push({ cells, ch: ':', col: C.br }); msg(n ? 'Stone crumbles to dust.' : 'Nothing happens.'); updateVis();
}
function fire(tgt) {
  const p = g.p, bow = p.eq.bow; if (!bow) { msg('You have no launcher to fire with. (v to throw)'); return false; }
  const bk = kindOf(bow), ai = p.inv.findIndex(o => kindOf(o).type === 'ammo' && kindOf(o).ammo === bk.ammo);
  if (ai < 0) { msg('You have no ' + (bk.ammo === 'arrow' ? 'arrows' : 'shot') + '.'); return false; }
  for (let s = 0; s < p.d.shots; s++) { const j = p.inv.findIndex(o => kindOf(o).type === 'ammo' && kindOf(o).ammo === bk.ammo); if (j < 0) break;
    const am = invTake(j, 1), ak = kindOf(am);
    launch(am, tgt, CLASSES[p.cls].bow + RACES[p.race].bow + p.lvl + sb(p.d.dex) + (bow.th || 0) + (am.th || 0), () => (dice(ak.dice[0], ak.dice[1]) + (am.td || 0) + (bow.td || 0)) * bk.mult, 35); }
  return true;
}
function launch(it, tgt, skill, dmgf, breakPct) {
  const k = kindOf(it), r = project(tgt.x, tgt.y, 12); fx.push({ cells: r.path, ch: k.ch, col: k.col });
  const m = r.hits[0]; let broke = false;
  if (k.type === 'flask' || k.type === 'potion') {
    broke = true;
    if (k.type === 'flask') { msg('The flask bursts into flame!', C.o); const cells = []; for (let y = r.y - 1; y <= r.y + 1; y++) for (let x = r.x - 1; x <= r.x + 1; x++) if (!opaqueT(tile(x, y))) { cells.push([x, y]); const q = monAt(x, y); if (q) hurtMon(q, dice(2, 6) + (q === m ? 4 : 0), 'fire'); } fx.push({ cells, ch: '#', col: C.o }); }
    else msg('The potion shatters.');
  } else if (m) {
    if (m.sl || chance(clamp(60 + (skill - MON[m.k].ac) * 2.4 - r.path.length, 8, 96))) { let d = Math.max(1, dmgf()); if (m.sl && g.p.cls === 'Rogue') d *= 2; msg('The ' + k.name.toLowerCase() + ' hits ' + mname(m) + '.'); hurtMon(m, d); broke = chance(breakPct); }
    else { msg('The ' + k.name.toLowerCase() + ' misses ' + mname(m) + '.', C.gy); wake(m); broke = chance(breakPct / 2); }
  }
  if (!broke) dropAt(it, r.x, r.y);
}
function throwItem(i, tgt) {
  const p = g.p, src = p.inv[i]; if (!src) return false; const it = invTake(i, 1), k = kindOf(it);
  launch(it, tgt, CLASSES[p.cls].bow + p.lvl + sb(p.d.dex) + (it.th || 0) + (k.thrown ? 6 : -4), () => (k.thrown ? dice(k.dice[0], k.dice[1]) * 2 + (it.td || 0) + sb(p.d.str) : dice(1, 3)), k.thrown ? 12 : 25);
  return true;
}
function refuel() {
  const p = g.p, l = p.eq.light; if (!l || l.k !== 'lantern') { msg('You have no lantern lit.'); return false; }
  const i = p.inv.findIndex(o => o.k === 'oil'); if (i < 0) { msg('You have no oil.'); return false; }
  invTake(i, 1); l.fuel = Math.min(15000, l.fuel + 5000); msg('You fill your lantern. (' + l.fuel + ' turns)'); recalc(); return true;
}
function spellList() { return g.p.cls === 'Mage' ? SPELLS.filter(s => s.lv <= g.p.lvl) : []; }
function spellFail(s) { return clamp(28 - (g.p.lvl - s.lv) * 4 - sb(g.p.st.int) * 3, 3, 60); }
function cast(si, tgt) {
  const p = g.p, s = SPELLS[si]; if (!s || p.cls !== 'Mage' || s.lv > p.lvl) return false;
  if (p.t.conf) { msg('You are too confused to cast.'); return false; }
  if (p.mp < s.mp) { msg('You do not have enough mana.', C.y); return false; }
  p.mp -= s.mp;
  if (chance(spellFail(s))) { msg('You fail to shape the spell.', C.y); return true; }
  const lv = p.lvl;
  switch (s.n) {
    case 'Magic Dart': boltAt(tgt, dice(3, 4) + Math.floor(lv / 2), null, C.pk, 0, 'dart'); break;
    case 'Phase Step': teleport(8); msg('You blink.', C.p); break;
    case 'Find Foes': { let n = 0; for (const m of g.mons) if (dist(m.x, m.y, p.x, p.y) < 26) { m.det = g.turn + 4; n++; } msg(n ? 'You sense ' + n + ' creature' + (n > 1 ? 's' : '') + ' nearby.' : 'You sense nothing.', C.lb); break; }
    case 'Glowlight': litArea(7); msg('A soft glow fills the area.', C.y); break;
    case 'Frost Shard': boltAt(tgt, dice(6, 6) + lv, 'cold', C.lb, 0, 'frost shard'); break;
    case 'Slumber': { let n = 0; for (const m of g.mons) if (canSee(m) && !has(MON[m.k], 'S') && !has(MON[m.k], 'U') && MON[m.k].lv < lv + rnd(8)) { m.sl = 1; n++; } msg(n ? 'A hush falls. ' + n + ' creature' + (n > 1 ? 's sleep.' : ' sleeps.') : 'Nothing happens.'); break; }
    case 'Appraise': g.ask = { type: 'id' }; break;
    case 'Farstep': teleport(40); msg('The world lurches.', C.p); break;
    case 'Fire Burst': ballAt(tgt, 28 + lv * 3, 'fire', C.o, 'fire burst', 2); break;
    case 'Quicken': setT('haste', 18 + lv, 'The world slows around you.', C.lb); break;
    case 'Unmake Stone': digBolt(tgt); break;
    case 'Thunderlance': boltAt(tgt, () => dice(10, 8) + lv * 2, null, C.y, 1, 'thunderlance'); break;
  }
  return true;
}
function search() { const p = g.p; let f = 0; for (const d of DIRS) { const q = g.traps[ix(p.x + d[0], p.y + d[1])]; if (q && !q.f && chance(p.cls === 'Rogue' ? 90 : 50)) { q.f = 1; f++; } } if (f) msg('You find a trap!', C.y); return true; }
function closeDoor(dx, dy) { const p = g.p, x = p.x + dx, y = p.y + dy; if (tile(x, y) !== T.OPEN) { msg('There is no open door there.'); return false; } if (monAt(x, y) || g.items.some(o => o.x === x && o.y === y)) { msg('Something is in the way.'); return false; } g.map[ix(x, y)] = T.DOOR; msg('You close the door.'); return true; }
function disarm(dx, dy) {
  const p = g.p, i = ix(p.x + dx, p.y + dy), q = g.traps[i]; if (!q || !q.f) { msg('You see no trap there.'); return false; }
  const c = clamp((p.cls === 'Rogue' ? 60 : 25) + p.lvl * 2 + sb(p.d.dex) * 4, 5, 95);
  if (chance(c)) { delete g.traps[i]; msg('You disarm the trap.', C.g); gainExp(3 + g.depth); } else if (chance(25)) { msg('You set it off!', C.r); p.x += dx; p.y += dy; trigger(q, i); } else msg('You fail to disarm the trap.');
  return true;
}
function tunnelOnce(dx, dy) {
  const p = g.p, x = p.x + dx, y = p.y + dy, i = ix(x, y), t = tile(x, y);
  if (monAt(x, y)) { msg('Something is in the way!'); return 0; }
  if (t === T.PERMA) { msg('This rock is unbreakable.'); return 0; }
  if (passT(t) || t === T.DOOR) { msg('There is nothing to tunnel through there.'); return 0; }
  const dg = p.d.dig, c = t === T.RUBBLE ? clamp(30 + dg, 10, 95) : t === T.WALL ? clamp((dg - 20) * 0.5, 1, 40) : clamp(6 + dg * 0.8, 3, 80);
  if (!chance(c)) return 1;
  g.map[i] = T.FLOOR;
  if (t === T.GOLD) { placeGold(x, y, dice(5, 10) * (3 + g.depth)); msg('You have found treasure!', C.gold); }
  else if (t === T.RUBBLE && chance(8) && g.depth > 0) { dropAt(randItem(g.depth), x, y); msg('You clear the rubble — and find something.', C.gold); }
  else msg(t === T.RUBBLE ? 'You clear the rubble.' : 'You break through.');
  return 2;
}
function tunnel(dx, dy) { // repeats until done or disturbed
  let any = false;
  for (let n = 0; n < 60 && !g.dead; n++) { g.disturb = 0; const r = tunnelOnce(dx, dy); if (!r) break; any = true; endTurn(); if (r === 2 || g.disturb) break; if (n === 59) msg('You dig for a while without breaking through.'); }
  return any;
}
function rest() {
  const p = g.p; if (g.mons.some(m => canSee(m) && !m.sl)) { msg('You cannot rest with enemies in view.', C.y); return false; }
  g.resting = 1; let n = 0;
  for (; n < 500 && !g.dead; n++) { if ((p.hp >= p.mhp && p.mp >= p.mmp && !p.t.pois && !p.t.conf && !p.t.afraid) || p.food < 300) break; g.disturb = 0; endTurn(); if (g.disturb) break; }
  g.resting = 0; if (n) msg(g.disturb ? 'Your rest is interrupted.' : 'You finish resting.', C.gy);
  return true;
}
function stairs(dir) {
  const p = g.p, t = tile(p.x, p.y);
  if (dir > 0 && t === T.DOWN) { msg('You descend.'); newLevel(g.depth + 1, 'down'); arrive(); return true; }
  if (dir < 0 && t === T.UP) { msg('You climb.'); newLevel(g.depth - 1, 'up'); arrive(); return true; }
  return false;
}
function checkWinExit() { if (g.depth === 0 && g.won && g.p.inv.concat(SLOTS.map(s => g.p.eq[s]).filter(Boolean)).some(o => o.k === 'a_crown')) { g.crownHome = 1; msg('You step into daylight with the Drowned Crown. The camp roars!', C.gold); } }
/* pathing for auto-explore / travel */
function pathTo(goal, loose) {
  const p = g.p, prev = new Int32Array(W * H).fill(-1), s = ix(p.x, p.y), q = [s]; prev[s] = s; let h = 0, found = -1;
  const blocked = {}; for (const m of g.mons) if (canSee(m)) blocked[ix(m.x, m.y)] = 1;
  while (h < q.length) { const c = q[h++]; if (c !== s && goal(c)) { found = c; break; } const cx = c % W, cy = (c / W) | 0;
    for (let k = 0; k < 8; k++) { const X = cx + DIRS[k][0], Y = cy + DIRS[k][1]; if (!inb(X, Y)) continue; const i = ix(X, Y); if (prev[i] >= 0 || !g.seen[i]) continue;
      const t = g.map[i]; if (!(passT(t) || t === T.DOOR)) continue; if (t === T.SHOP) continue; if (!loose && (blocked[i] || (g.traps[i] && g.traps[i].f))) continue; if (k >= 4 && t === T.DOOR) continue; prev[i] = c; q.push(i); } }
  if (found < 0) return null; let c = found; while (prev[c] !== s) c = prev[c]; return { x: c % W, y: (c / W) | 0, goal: found };
}
function dangerInView() { return g.mons.some(m => canSee(m) && !m.sl && vis[ix(m.x, m.y)]); }
function exploreStep() {
  const p = g.p;
  if (g.dead) return false;
  if (dangerInView()) { msg('Not with enemies in view!', C.y); return false; }
  if (p.food < 400 || p.hp < p.mhp * 0.4) { msg(p.food < 400 ? 'You are too hungry to explore.' : 'You are too hurt to explore — rest first (R).', C.y); return false; }
  if (g.depth === 0) { msg('Nothing to explore up here. Press > at the stair.', C.gy); return false; }
  // items underfoot
  const here = g.items.filter(o => o.x === p.x && o.y === p.y && !o.skip);
  if (here.length) { if (p.inv.length >= 23 && !here.some(o => p.inv.some(q => canStack(q, o.it)))) { here.forEach(o => o.skip = 1); } else { const r = act(pickup); g.items.forEach(o => { if (o.x === p.x && o.y === p.y) o.skip = 1; }); return r && !g.disturb; } }
  const itemAt = {}; for (const o of g.items) if (!o.skip && g.seen[ix(o.x, o.y)]) itemAt[ix(o.x, o.y)] = 1;
  const goal = i => { if (itemAt[i]) return true; if (g.map[i] === T.DOOR) return true; const x = i % W, y = (i / W) | 0;
    for (let k = 0; k < 8; k++) { const X = x + DIRS[k][0], Y = y + DIRS[k][1]; if (inb(X, Y) && !g.seen[ix(X, Y)]) return true; } return false; };
  const st = pathTo(goal);
  if (!st) { msg(pathTo(goal, true) ? 'Something blocks the way onward: a known trap (D to disarm, or step over it) or a sleeper.' : 'Explored. Press > to travel to the stairs down.', C.lb); return false; }
  const r = act(() => move(st.x - p.x, st.y - p.y));
  return r && !g.disturb && !g.event;
}
function travelStep(tt) {
  const p = g.p; if (g.dead || dangerInView() || g.map[ix(p.x, p.y)] === tt) return false;
  const st = pathTo(i => g.map[i] === tt); if (!st) { msg('You do not know of any such stair on this level.', C.gy); return false; }
  const r = act(() => move(st.x - p.x, st.y - p.y));
  return r && !g.disturb && g.map[ix(p.x, p.y)] !== tt;
}
function goStep(x, y) {
  const p = g.p, t = ix(x, y); if (g.dead || dangerInView() || !g.seen[t]) return false;
  const st = pathTo(i => i === t); if (!st) return false;
  const r = act(() => move(st.x - p.x, st.y - p.y));
  return r && !g.disturb && !g.event && !(p.x === x && p.y === y);
}
function runStep(dx, dy, first) {
  const p = g.p; if (dangerInView() && !first) return false;
  const sig = () => { let s = ''; const a = [[-dy, dx], [dy, -dx]]; for (const [ax, ay] of a) s += passT(tile(p.x + ax, p.y + ay)) || tile(p.x + ax, p.y + ay) === T.DOOR ? '1' : '0'; return s; };
  const before = sig(); const t = tile(p.x + dx, p.y + dy);
  if (!passT(t) || monAt(p.x + dx, p.y + dy)) { if (first) return act(() => move(dx, dy)) && false; return false; }
  const r = act(() => move(dx, dy)); if (!r || g.disturb || g.event) return false;
  if (g.items.some(o => o.x === p.x && o.y === p.y) || tile(p.x, p.y) === T.DOWN || tile(p.x, p.y) === T.UP) return false;
  return sig() === before;
}

/* ---------- shops ---------- */
function buyPrice(it) { return Math.max(1, Math.ceil(itemValue(Object.assign({}, it, { n: 1 })) * 1.25)); }
function sellPrice(it) { return Math.floor(itemValue(it) * (fullyKnown(it) ? 0.4 : 0.2)); }
function buy(si, i) {
  const st = g.shops[si], it = st[i], p = g.p; if (!it) return false; const pr = buyPrice(it);
  if (p.gold < pr) { msg('You cannot afford that.', C.y); return false; }
  const n = kindOf(it).type === 'ammo' ? Math.min(it.n, 10) : 1; const one = Object.assign({}, it, { n });
  if (p.gold < pr * n) { msg('You cannot afford that.', C.y); return false; }
  if (invAdd(one) < 0) { msg('Your pack is full.', C.y); return false; }
  p.gold -= pr * n; learn(it.k); it.n -= n; if (it.n <= 0) st.splice(i, 1);
  msg('You buy ' + itemName(one) + ' for ' + pr * n + ' gold.', C.gold); return true;
}
function sell(si, i) {
  const p = g.p, it = p.inv[i]; if (!it) return false; const one = invTake(i, 1); const pr = sellPrice(one);
  learn(one.k); one.idd = 1; p.gold += pr; msg('You sell ' + itemName(one) + ' for ' + pr + ' gold.', C.gold);
  if (!one.cursed && pr > 0) { const st = g.shops[si]; const o = st.find(q => canStack(q, one)); if (o) o.n++; else if (st.length < 20) st.push(one); }
  return true;
}

/* ---------- new game / save / score ---------- */
function newGame(o) {
  const seedStr = String(o.seed || Math.floor(Math.random() * 1e9).toString(36));
  g = { v: 1, seed: seedStr, rs: hashStr(seedStr), turn: 0, depth: 0, maxDepth: 0, msgs: [], known: {}, flav: {}, uniq: {}, arts: {}, kills: 0, killList: {}, recall: 0, aggro: 0,
    map: [], seen: [], lit: [], items: [], mons: [], traps: {}, shopPos: {}, started: Date.now() };
  // flavours
  for (const ty of ['potion', 'wand', 'ring']) { const pool = FLAV[ty].slice(); for (const id in KINDS) if (KINDS[id].type === ty) { const j = rnd(pool.length), n = pool.splice(j, 1)[0]; g.flav[id] = { n, c: FCOL[FLAV[ty].indexOf(n) % FCOL.length] }; } }
  for (const id in KINDS) if (KINDS[id].type === 'scroll') { let n = ''; for (let w = 0, ws = rint(2, 3); w < ws; w++) n += (w ? ' ' : '') + pick(SYL) + pick(SYL) + (chance(40) ? pick(SYL) : ''); g.flav[id] = { n: n.toUpperCase(), c: C.w }; }
  const ra = RACES[o.race], cl = CLASSES[o.cls];
  const p = g.p = { name: (o.name || 'Nameless').slice(0, 16), race: o.race, cls: o.cls, x: 40, y: 17, lvl: 1, exp: 0, gold: rint(80, 160), food: 7000, inv: [], eq: {}, t: {}, st: {} };
  for (const s of ['str', 'dex', 'con', 'int']) p.st[s] = 10 + ra[s] + cl[s] + rint(-1, 2);
  p.mhp = p.hp = Math.max(8, cl.hd + ra.hd + 6 + sb(p.st.con) * 2);
  const give = (id, n, eq) => { const it = mkItem(id, n); it.idd = 1; if (KINDS[id].type === 'weapon' || KINDS[id].type === 'bow' || KINDS[id].type === 'ammo') { it.th = 0; it.td = 0; } if (ARMOR.indexOf(KINDS[id].type) >= 0) it.ab = 0; if (eq) p.eq[KINDS[id].type] = it; else p.inv.push(it); };
  give('torch', 1, 1); give('torch', 3); give('ration', 4); give('oil', 3); give('p_clw', 2); give('s_recall', 1); g.known.p_clw = 1; g.known.s_recall = 1;
  if (o.cls === 'Warrior') { give('shortsword', 1, 1); give('leather', 1, 1); give('buckler', 1, 1); give('p_hero', 1); g.known.p_hero = 1; }
  if (o.cls === 'Rogue') { give('shortsword', 1, 1); give('leather', 1, 1); give('dagger', 6); give('sling', 1, 1); give('shot', 25); }
  if (o.cls === 'Ranger') { give('dagger', 1, 1); give('leather', 1, 1); give('shortbow', 1, 1); give('arrow', 40); }
  if (o.cls === 'Mage') { give('dagger', 1, 1); give('robe', 1, 1); give('s_blink', 3); give('p_mana', 1); g.known.s_blink = 1; g.known.p_mana = 1; }
  sortInv(); recalc(); p.mp = p.mmp;
  newLevel(0, 'start'); recalc(); updateVis();
  msg('Welcome to Orrun Gate, ' + p.name + ' the ' + p.race + ' ' + p.cls + '.', C.gold);
  msg('Shops are the numbered doors. The stair (>) leads down. Press ? for help.', C.gy);
  return g;
}
function save() { return JSON.stringify(g); }
function load(s) { g = typeof s === 'string' ? JSON.parse(s) : s; fx.length = 0; recalc(); updateVis(); return g; }
function score() { const p = g.p; return Math.floor(p.exp + g.maxDepth * 150 + p.gold / 5 + (g.won ? 25000 : 0) + (g.crownHome ? 15000 : 0)); }
function morgue() {
  const p = g.p, L = [];
  const fate = g.crownHome ? 'Returned to the surface bearing the Drowned Crown' : g.won ? 'Slew the Drowned King and retired in glory' : g.dead ? 'Killed by ' + (/^[A-Z]/.test(g.dead.cause) ? '' : /^[aeiou]/.test(g.dead.cause) ? 'an ' : /^(a |poison|starvation)/.test(g.dead.cause) ? '' : 'a ') + g.dead.cause : 'Still delving';
  L.push('ORRUNDEEP — ' + p.name + ' the ' + p.race + ' ' + p.cls + ' (level ' + p.lvl + ')');
  L.push(fate + (g.dead && !g.won ? ' on ' + (g.dead.depth ? 'depth ' + g.dead.depth + ' (' + g.dead.depth * 50 + ' ft)' : 'the surface') : '') + '.');
  L.push('Score ' + score() + ' · deepest ' + g.maxDepth * 50 + ' ft · ' + g.turn + ' turns · ' + g.kills + ' kills · seed "' + g.seed + '"');
  L.push('');
  L.push('HP ' + p.hp + '/' + p.mhp + (p.mmp ? '  MP ' + p.mp + '/' + p.mmp : '') + '  AC ' + p.d.ac + '  Str ' + p.st.str + ' Dex ' + p.st.dex + ' Con ' + p.st.con + ' Int ' + p.st.int + '  Gold ' + p.gold);
  L.push(''); L.push('Equipment:');
  for (const s of SLOTS) if (p.eq[s]) L.push('  ' + SLOTNAME[s] + ': ' + itemName(p.eq[s]));
  L.push('Pack:'); for (const it of p.inv) L.push('  ' + itemName(it));
  const kl = Object.keys(g.killList).sort((a, b) => g.killList[b] - g.killList[a]).slice(0, 8);
  if (kl.length) { L.push(''); L.push('Notable kills: ' + kl.map(n => n + (g.killList[n] > 1 ? ' x' + g.killList[n] : '')).join(', ')); }
  L.push(''); L.push('Last moments:'); for (const m of g.msgs.slice(-7)) L.push('  ' + m.t + (m.x ? ' (x' + m.x + ')' : ''));
  return L.join('\n');
}
function describe(x, y) {
  if (!inb(x, y) || !g.seen[ix(x, y)]) return 'Unknown.';
  const out = []; const m = monAt(x, y);
  if (g.p.x === x && g.p.y === y) out.push('You, ' + g.p.name + '.');
  if (m && canSee(m)) { const k = MON[m.k], r = m.hp / m.mhp; out.push(cap(has(k, 'U') ? k.n : 'a ' + k.n) + ' (lvl ' + k.lv + ', ' + (r >= 1 ? 'unhurt' : r > 0.66 ? 'scratched' : r > 0.33 ? 'wounded' : 'almost dead') + (m.sl ? ', asleep' : m.fear ? ', fleeing' : '') + ')'); }
  if (vis[ix(x, y)] || g.items.some(o => o.x === x && o.y === y && o.det)) for (const o of g.items) if (o.x === x && o.y === y) out.push(itemName(o.it));
  const tr = g.traps[ix(x, y)]; if (tr && tr.f) out.push({ pit: 'a pit', dart: 'a dart trap', tele: 'a twisting rune', gas: 'a gas trap', summon: 'a summoning rune', fire: 'a fire trap', door: 'a trapdoor' }[tr.k]);
  const t = g.map[ix(x, y)];
  out.push(['granite wall', 'floor', 'a closed door', 'an open door', 'a stair down', 'a stair up', 'a mineral vein', 'a vein glittering with gold', 'rubble', 'the entrance to ' + (g.shops && g.shopPos[ix(x, y)] !== undefined ? SHOPS[g.shopPos[ix(x, y)]].n : 'a shop'), 'unbreakable rock'][t]);
  return out.join(' · ');
}
function retire() { if (g.won && !g.dead) { g.dead = { cause: 'retired', depth: g.depth, turn: g.turn, retired: 1 }; } }

root.OD = { W, H, T, C, MAXD, RACES, CLASSES, SPELLS, KINDS, MON, SLOTS, SLOTNAME, SHOPS, ARMOR,
  get g() { return g; }, vis, fx, newGame, save, load, act, move, pickup, drop, wear, takeOff, eat, quaff, read, aim, fire, throwItem, refuel, cast, search, closeDoor, disarm, tunnel, rest, stairs,
  exploreStep, travelStep, runStep, goStep, resolveAsk, itemName, itemCol, kindOf, canSee, monAt, buy, sell, buyPrice, sellPrice, spellList, spellFail, score, morgue, describe, depthName, expFor, fullyKnown, retire, dangerInView,
  endTurnPublic: () => act(() => true) };
})(typeof module !== 'undefined' && module.exports ? module.exports : window);

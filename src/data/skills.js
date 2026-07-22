// ============================================================================
// TECH TREE — branches/nodes are data; effects are computed in modifiers.js.
// To add a node: append here, then wire its `id` into computeModifiers().
//   max  : rank cap
//   cost : skill points per rank
// Nodes unlock left-to-right within a branch (index 0 always available).
// ============================================================================

export const BRANCHES = [
  { key: 'off', name: 'Offense', color: '#ff3b6b', nodes: [
    { id: 'dmg',   name: 'Overclock',     desc: '+18% weapon damage',        max: 5, cost: 1 },
    { id: 'rate',  name: 'Trigger Servo', desc: '+12% fire rate',            max: 5, cost: 1 },
    { id: 'multi', name: 'Split Barrel',  desc: '+1 projectile',             max: 2, cost: 2 },
    { id: 'crit',  name: 'Weak Point AI', desc: '+8% crit chance (2.5x)',    max: 4, cost: 1 },
  ]},
  { key: 'def', name: 'Defense', color: '#ff7a5c', nodes: [
    { id: 'hp',    name: 'Reinforced Hull', desc: '+22 max hull',            max: 5, cost: 1 },
    { id: 'armor', name: 'Ablative Plate',  desc: '+7% damage reduction',    max: 4, cost: 1 },
    { id: 'regen', name: 'Nanite Repair',   desc: '+0.8 hull/sec regen',     max: 4, cost: 1 },
    { id: 'thorn', name: 'Reactive Spikes', desc: 'Reflect 25% contact dmg', max: 2, cost: 2 },
  ]},
  { key: 'mob', name: 'Mobility', color: '#35e0d0', nodes: [
    { id: 'spd',     name: 'Servo Legs',   desc: '+10% move speed',          max: 5, cost: 1 },
    { id: 'dashcd',  name: 'Coolant Vents', desc: '-12% dash cooldown',      max: 4, cost: 1 },
    { id: 'dashchg', name: 'Twin Reactor',  desc: '+1 dash charge',          max: 1, cost: 3 },
    { id: 'pickup',  name: 'Mag Field',     desc: '+35% pickup range',       max: 4, cost: 1 },
  ]},
  { key: 'util', name: 'Utility', color: '#ffd23f', nodes: [
    { id: 'xp',    name: 'Neural Sync',    desc: '+15% XP gain',             max: 4, cost: 1 },
    { id: 'gold',  name: 'Scrap Magnet',   desc: '+20% scrap drops',         max: 4, cost: 1 },
    { id: 'range', name: 'Extended Optics', desc: '+12% projectile range',   max: 3, cost: 1 },
    { id: 'luck',  name: 'Overflow Core',  desc: '+1 point on every 3rd level', max: 1, cost: 3 },
  ]},
];

// Derive gameplay multipliers from purchased ranks. Pure function -> testable.
export function computeModifiers(ranks) {
  const b = {};
  BRANCHES.forEach((br) => br.nodes.forEach((n) => { b[n.id] = ranks[n.id] || 0; }));
  return {
    dmg: 1 + 0.18 * b.dmg, rate: 1 + 0.12 * b.rate, multi: b.multi || 0, crit: 0.08 * b.crit,
    hp: 22 * b.hp, armor: Math.min(0.7, 0.07 * b.armor), regen: 0.8 * b.regen, thorn: b.thorn ? 0.25 * b.thorn : 0,
    spd: 1 + 0.10 * b.spd, dashcd: 1 - 0.12 * b.dashcd, dashchg: 2 + (b.dashchg || 0), pickup: 1 + 0.35 * b.pickup,
    xp: 1 + 0.15 * b.xp, gold: 1 + 0.20 * b.gold, range: 1 + 0.12 * b.range,
  };
}

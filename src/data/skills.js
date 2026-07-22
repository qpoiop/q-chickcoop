// ============================================================================
// TECH TREE — branches/nodes are data; effects are computed in modifiers.js.
// To add a node: append here, then wire its `id` into computeModifiers().
//   max  : rank cap
//   cost : skill points per rank
// Nodes unlock left-to-right within a branch (index 0 always available).
// ============================================================================

export const BRANCHES = [
  { key: 'off', name: 'Offense', nameKo: '공격', color: '#ff3b6b', nodes: [
    { id: 'dmg',   name: 'Overclock',     desc: '+18% weapon damage',     nameKo: '오버클럭',   descKo: '무기 피해 +18%',       max: 5, cost: 1 },
    { id: 'rate',  name: 'Trigger Servo', desc: '+12% fire rate',         nameKo: '방아쇠 서보', descKo: '연사 속도 +12%',       max: 5, cost: 1 },
    { id: 'multi', name: 'Split Barrel',  desc: '+1 projectile',          nameKo: '분열 총열',   descKo: '발사체 +1',            max: 2, cost: 2 },
    { id: 'crit',  name: 'Weak Point AI', desc: '+8% crit chance (2.5x)', nameKo: '약점 AI',    descKo: '치명타 확률 +8% (2.5배)', max: 4, cost: 1 },
  ]},
  { key: 'def', name: 'Defense', nameKo: '방어', color: '#ff7a5c', nodes: [
    { id: 'hp',    name: 'Reinforced Hull', desc: '+22 max hull',            nameKo: '강화 장갑',   descKo: '최대 체력 +22',     max: 5, cost: 1 },
    { id: 'armor', name: 'Ablative Plate',  desc: '+7% damage reduction',    nameKo: '삭마 장갑판', descKo: '받는 피해 -7%',     max: 4, cost: 1 },
    { id: 'regen', name: 'Nanite Repair',   desc: '+0.8 hull/sec regen',     nameKo: '나나이트 수리', descKo: '초당 체력 +0.8 재생', max: 4, cost: 1 },
    { id: 'thorn', name: 'Reactive Spikes', desc: 'Reflect 25% contact dmg', nameKo: '반응 가시',   descKo: '접촉 피해 25% 반사',  max: 2, cost: 2 },
  ]},
  { key: 'mob', name: 'Mobility', nameKo: '기동', color: '#35e0d0', nodes: [
    { id: 'spd',     name: 'Servo Legs',   desc: '+10% move speed',   nameKo: '서보 다리',   descKo: '이동 속도 +10%',   max: 5, cost: 1 },
    { id: 'dashcd',  name: 'Coolant Vents', desc: '-12% dash cooldown', nameKo: '냉각 배출구', descKo: '대시 재사용 -12%', max: 4, cost: 1 },
    { id: 'dashchg', name: 'Twin Reactor',  desc: '+1 dash charge',     nameKo: '트윈 리액터', descKo: '대시 충전 +1',     max: 1, cost: 3 },
    { id: 'pickup',  name: 'Mag Field',     desc: '+35% pickup range',  nameKo: '자기장',     descKo: '획득 범위 +35%',   max: 4, cost: 1 },
  ]},
  { key: 'util', name: 'Utility', nameKo: '유틸', color: '#ffd23f', nodes: [
    { id: 'xp',    name: 'Neural Sync',    desc: '+15% XP gain',                nameKo: '뉴럴 싱크',  descKo: '경험치 획득 +15%',        max: 4, cost: 1 },
    { id: 'gold',  name: 'Scrap Magnet',   desc: '+20% scrap drops',            nameKo: '고철 자석',  descKo: '고철 획득 +20%',          max: 4, cost: 1 },
    { id: 'range', name: 'Extended Optics', desc: '+12% projectile range',      nameKo: '확장 광학계', descKo: '발사체 사거리 +12%',      max: 3, cost: 1 },
    { id: 'luck',  name: 'Overflow Core',  desc: '+1 point on every 3rd level', nameKo: '오버플로 코어', descKo: '3레벨마다 포인트 +1', max: 1, cost: 3 },
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

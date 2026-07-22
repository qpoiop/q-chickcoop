// ============================================================================
// WEAPON DATA — fully data-driven. Add a gun by adding an entry here + a model
// key in data/assets.js -> weaponModels + WEAPON_MODEL_MAP.
//   cd       : cooldown seconds between shots
//   dmg      : base damage per projectile      proj: projectiles per shot
//   spread   : cone spread (radians)           speed: projectile speed (u/s)
//   pierce   : enemies a shot passes through    rangeMul: bullet lifetime ×
//   cost     : scrap cost in Arsenal (0 = starter, owned)
//   bullet   : visual { type:'pellet'|'bolt'|'orb'|'drop', size?, color? }
//   dropChance: chance a slain mob drops this weapon if you don't own it yet
//   overheat : optional { max, cool } — continuous-fire heat then forced cooldown
//   bars     : normalized 0..1 stat bars for the Arsenal UI
//   fx       : optional 'lightning' arc bolt on fire
// ============================================================================

export const WEAPONS = {
  flare: {
    name: 'Cork Popper', icon: '☄', color: '#ffb03b', glow: 'rgba(255,176,59,.5)',
    cost: 0, dropChance: 0.20,
    desc: 'Toy cork pistol — thwup! Slow, chunky pellets with a satisfying pop.',
    nameKo: '코르크 뻥총', descKo: '장난감 코르크 권총 — 뻥! 느리지만 묵직한 탄이 통쾌하게 터진다.',
    cd: 0.46, dmg: 13, proj: 1, spread: 0, speed: 30, pierce: 0, rangeMul: 1,
    bullet: { type: 'pellet' },
    bars: { rate: 0.3, dmg: 0.55, area: 0.35 },
  },
  nerf: {
    name: 'Nerf Blaster', icon: '»', color: '#ff7a5c', glow: 'rgba(255,122,92,.5)',
    cost: 40, dropChance: 0.10,
    desc: 'Rapid foam darts — higher fire rate and more punch than the popper.',
    nameKo: '너프 블래스터', descKo: '빠른 폼 다트 — 코르크보다 연사와 화력이 높다.',
    cd: 0.16, dmg: 16, proj: 1, spread: 0.03, speed: 44, pierce: 0, rangeMul: 1,
    bullet: { type: 'bolt' },
    bars: { rate: 0.7, dmg: 0.62, area: 0.35 },
  },
  laser: {
    name: 'Laser Lance', icon: '↝', color: '#35e0d0', glow: 'rgba(53,224,208,.5)',
    cost: 90, dropChance: 0.05,
    desc: 'Piercing beam bolt (+1 pierce) with extended range and solid damage.',
    nameKo: '레이저 랜스', descKo: '관통 광선(+1 관통)에 사거리와 피해가 강화됐다.',
    cd: 0.3, dmg: 20, proj: 1, spread: 0, speed: 78, pierce: 1, rangeMul: 1.6,
    bullet: { type: 'beam' },
    bars: { rate: 0.5, dmg: 0.85, area: 0.45 },
  },
  space: {
    name: 'Space Cannon', icon: '◉', color: '#8b5bff', glow: 'rgba(139,91,255,.55)',
    cost: 180, dropChance: 0,
    desc: 'Expensive siege gun — lobs a huge dark resonance orb that punches through.',
    nameKo: '스페이스 캐논', descKo: '값비싼 공성 무기 — 거대한 암흑 공명 구체가 적을 꿰뚫는다.',
    cd: 0.8, dmg: 46, proj: 1, spread: 0, speed: 20, pierce: 3, rangeMul: 1.2,
    bullet: { type: 'orb', size: 1.15, color: '#1a1030' },
    bars: { rate: 0.15, dmg: 1.0, area: 0.95 },
  },
  water: {
    name: 'Water Jet', icon: '≈', color: '#35b0ff', glow: 'rgba(53,176,255,.5)',
    cost: 70, dropChance: 0,
    desc: 'Continuous water stream — sprays fast, short-range, and overheats.',
    nameKo: '워터 제트', descKo: '연속 물줄기 — 짧은 사거리로 빠르게 뿜고 과열되면 쿨다운.',
    cd: 0.05, dmg: 5, proj: 1, spread: 0.06, speed: 34, pierce: 0, rangeMul: 0.5,
    bullet: { type: 'drop', size: 0.26 },
    overheat: { max: 1.6, cool: 1.2 },
    bars: { rate: 1.0, dmg: 0.25, area: 0.3 },
  },
};

// Which loaded gun mesh each weapon carries (key -> assets.weaponModels key).
export const WEAPON_MODEL_MAP = {
  flare: 'flare', nerf: 'nerf', laser: 'laser', space: 'space', water: 'water',
};

// Weapon-drop pickups grant the next unowned frame in this progression order.
export const WEAPON_DROP_ORDER = ['nerf', 'laser'];

// ============================================================================
// WEAPON DATA — fully data-driven. Add a new gun by adding an entry here and
// (optionally) a model key in data/assets.js -> weaponModels + WEAPON_MODEL_MAP.
//   cd     : cooldown seconds between shots
//   dmg    : base damage per projectile
//   proj   : projectiles per shot
//   spread : cone spread (radians) — 0 = single stream
//   speed  : projectile speed (u/s)
//   pierce : enemies a shot passes through
//   cost   : scrap cost in Arsenal (0 = starter, owned)
//   bars   : normalized 0..1 stat bars shown in the Arsenal UI
//   fx     : optional -> 'lightning' spawns the arc bolt effect on fire
// ============================================================================

export const WEAPONS = {
  flare: {
    name: 'Cork Popper', icon: '☄', color: '#ffb03b', glow: 'rgba(255,176,59,.5)',
    cost: 0, desc: 'Toy cork pistol — thwup! Slow, chunky pellets with a satisfying pop.',
    cd: 0.46, dmg: 13, proj: 1, spread: 0, speed: 30, pierce: 0,
    bars: { rate: 0.3, dmg: 0.55, area: 0.35 },
  },
  pulse: {
    name: 'Pulse SMG', icon: '≡', color: '#35e0d0', glow: 'rgba(53,224,208,.5)',
    cost: 35, desc: 'Rapid single-shot. Reliable stream of low-damage rounds.',
    cd: 0.12, dmg: 9, proj: 1, spread: 0, speed: 40, pierce: 0,
    bars: { rate: 0.9, dmg: 0.35, area: 0.3 },
  },
  arc: {
    name: 'Arc Coil', icon: '⋔', color: '#59ff9d', glow: 'rgba(89,255,157,.5)',
    cost: 60, desc: 'Triple forked bolts. Balanced spread of medium hits.',
    cd: 0.28, dmg: 11, proj: 3, spread: 0.22, speed: 44, pierce: 1,
    bars: { rate: 0.6, dmg: 0.6, area: 0.6 }, fx: 'lightning',
  },
  scatter: {
    name: 'Scatter Frame', icon: '✷', color: '#ffb03b', glow: 'rgba(255,176,59,.5)',
    cost: 95, desc: 'Five-pellet cone. Devastating point-blank, weak at range.',
    cd: 0.5, dmg: 7, proj: 5, spread: 0.42, speed: 30, pierce: 0,
    bars: { rate: 0.35, dmg: 0.85, area: 0.75 },
  },
  lance: {
    name: 'Rail Lance', icon: '↑', color: '#c06bff', glow: 'rgba(192,107,255,.5)',
    cost: 140, desc: 'High-velocity piercing slug. Punches through a whole line.',
    cd: 0.34, dmg: 20, proj: 1, spread: 0, speed: 72, pierce: 4,
    bars: { rate: 0.5, dmg: 0.95, area: 0.4 }, fx: 'lightning',
  },
};

// Which loaded gun mesh each weapon carries (key -> assets.weaponModels key).
export const WEAPON_MODEL_MAP = {
  flare: 'flare', pulse: 'laser', arc: 'laser', scatter: 'space', lance: 'nerf',
};

// Order in which weapon drops grant new frames.
export const WEAPON_DROP_ORDER = ['pulse', 'arc', 'scatter', 'lance'];

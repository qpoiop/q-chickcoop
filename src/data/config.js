// ============================================================================
// TUNABLES — every gameplay/feel constant in one place. No magic numbers in
// engine code; systems read from CONFIG so balancing is a data edit.
// ============================================================================

// Theme palette — the recurring accent colors used across FX/beacons/UI. Named
// so engine code references COLORS.teal instead of copy-pasting hex literals.
export const COLORS = {
  teal:  0x35e0d0, // primary accent: cores, portals, beacons
  green: 0x59ff9d, // xp / heal / level-up / extraction
  gold:  0xffd23f, // coins, crate salvage
  amber: 0xffb03b, // scrap, boss B
  pink:  0xff3b6b, // grunt / danger
  red:   0xff2d55, // telegraph, boss A
  coral: 0xff7a5c, // brute, boss-entrance storm
};

export const CONFIG = {
  // Character model presentation (was DC editor props in the prototype)
  model: { useModel: true, scale: 1, lift: 0, yaw: 180, gunYaw: 0 },

  // Render / camera
  // camOffset z<0 → camera sits on the opposite side (looks from the far side);
  // Game negates movement/aim input to keep on-screen controls correct.
  render: { fov: 40, camOffset: [0, 45, -22], pixelRatioCap: 2, bloom: 0.9 },
  camera: { lead: 4, lerpPlay: 0.12, lerpIdle: 0.08, zoomMin: 0.55, zoomMax: 1.8 },

  // Player movement + model presentation
  player: {
    radius: 0.7, moveSpeed: 10.2, sprintMul: 1.35, accel: 16,
    dashSpeed: 34, dashTime: 0.22, iframe: 0.32, dashRegen: 1.0,
    hitCd: 0.6,   // invulnerability window (sec) after taking a hit — blocks rapid multi-hit death
    // Touch auto-aim hysteresis: a rival target must be within this fraction of
    // the current target's distance to steal the lock. <1 = sticky (no aim
    // oscillation between two near-equidistant mobs); 1 = always-nearest (jitter).
    autoAimStick: 0.6,
    // faceAim false → the body turns toward the MOVEMENT (left-stick) direction;
    // the gun/aim ring still tracks the aim independently.
    baseMaxHp: 100, height: 2.5, faceAim: false,
  },

  // Progression
  progress: { xpToNext: 8, xpGrowth: 1.32, xpFlat: 2, hpPerLevel: 6, levelHeal: 0.3 },

  // Spawning / difficulty curve
  spawn: {
    firstDelay: 3.2, grace: 2.8, tutGrace: 9999, maxEnemies: 16,
    // Concurrent enemy cap WHILE a boss is alive (boss counts toward it). Lower so
    // the boss's telegraphed attacks stay readable instead of drowning in trash —
    // still some add pressure, but the duel is the focus.
    bossMaxEnemies: 6,
    waveSize: 7, lull: 2.4,   // after every `waveSize` spawns, a `lull`-sec breather (rhythm, room for strategy)
    hpScale: 110, dmgScaleBoss: 120,
    // Mobs spawn on a ring this far from the player (just past the view), biased
    // toward the way they're heading — so combat follows you as you advance instead
    // of sitting dormant at fixed map corners. `ringSpread` = half-arc (radians).
    ring: 24, ringSpread: 1.3,
  },

  // Drops from a slain non-boss enemy. Weapon drop chance is per-weapon
  // (WEAPONS[k].dropChance) for the next unowned progression frame; health/scrap
  // roll afterwards. healAmount = HP restored by a health pickup.
  // pickupLife = seconds an uncollected xp orb / coin lingers before it despawns
  // (prevents unbounded accumulation when kills happen far from the player).
  drops: { healthChance: 0.09, scrapChance: 0.12, healAmount: 35, pickupLife: 18, grab: 1.3 },  // grab = distance at which an orb/coin is collected
};

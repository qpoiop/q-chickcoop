// ============================================================================
// TUNABLES — every gameplay/feel constant in one place. No magic numbers in
// engine code; systems read from CONFIG so balancing is a data edit.
// ============================================================================

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
    waveSize: 7, lull: 2.4,   // after every `waveSize` spawns, a `lull`-sec breather (rhythm, room for strategy)
    hpScale: 110, dmgScaleBoss: 120,
    bossFirst: 60, bossRepeat: 95,
  },

  // Drops from a slain non-boss enemy. Weapon drop chance is per-weapon
  // (WEAPONS[k].dropChance) for the next unowned progression frame; health/scrap
  // roll afterwards. healAmount = HP restored by a health pickup.
  drops: { healthChance: 0.09, scrapChance: 0.12, healAmount: 35 },

  // Bloom-lightning FX cadence
  fx: { boltInterval: 0.11 },
};

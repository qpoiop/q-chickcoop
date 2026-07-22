// ============================================================================
// TUNABLES — every gameplay/feel constant in one place. No magic numbers in
// engine code; systems read from CONFIG so balancing is a data edit.
// ============================================================================

export const CONFIG = {
  // Character model presentation (was DC editor props in the prototype)
  model: { useModel: true, scale: 1, lift: 0, yaw: 180, gunYaw: 0 },

  // Render / camera
  render: { fov: 38, camOffset: [0, 30, 23], pixelRatioCap: 2, bloom: 0.9 },
  camera: { lead: 4, lerpPlay: 0.12, lerpIdle: 0.08, zoomMin: 0.55, zoomMax: 1.8 },

  // Player movement
  player: {
    radius: 0.7, moveSpeed: 7.4, sprintMul: 1.35, accel: 14,
    dashSpeed: 26, dashTime: 0.22, iframe: 0.32, dashRegen: 1.1,
    baseMaxHp: 100,
  },

  // Progression
  progress: { xpToNext: 8, xpGrowth: 1.32, xpFlat: 2, hpPerLevel: 6, levelHeal: 0.3 },

  // Spawning / difficulty curve
  spawn: {
    firstDelay: 3.2, grace: 2.8, tutGrace: 9999, maxEnemies: 80,
    hpScale: 110, dmgScaleBoss: 120,
    bossFirst: 60, bossRepeat: 95,
  },

  // Drop chances from a slain non-boss enemy (cumulative thresholds)
  drops: { weapon: 0.05, health: 0.14, scrap: 0.24, healAmount: 35 },

  // Bloom-lightning FX cadence
  fx: { boltInterval: 0.11 },
};

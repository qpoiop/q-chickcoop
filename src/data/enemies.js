// ============================================================================
// ENEMY TIERS + BOSS — stats are data. Model/animation binding is by `model`
// key into assets.enemyModels. Fallback primitive `geo` renders if a GLB is
// missing so the game is always playable.
//   hp/spd/dmg : base stats (scaled by elapsed time at spawn)
//   s          : size unit (collision radius = s + 0.35)
//   c          : tint / primitive color
//   sight      : aggro sight radius
//   modelMul   : extra scale applied to the fitted GLB
// ============================================================================

export const ENEMY_TIERS = [
  { key: 'grunt', hp: 16, spd: 5.0, dmg: 8,  c: 0xff3b6b, s: 0.90, geo: 'oct', sight: 16, model: 'cute',   modelMul: 1.0 },
  { key: 'brute', hp: 46, spd: 3.4, dmg: 15, c: 0xff7a5c, s: 1.30, geo: 'box', sight: 14, model: 'little', modelMul: 1.0 },
  { key: 'drone', hp: 10, spd: 7.4, dmg: 6,  c: 0xffd23f, s: 0.66, geo: 'tet', sight: 22, model: 'drone',  modelMul: 0.72 },
];

export const BOSS = {
  name: 'PRIME ROOSTER', hp: 520, spd: 2.7, dmg: 26, c: 0xff2d55, r: 3.2,
  model: 'boss', modelMul: 2.4,
};

// Pick a spawn tier from a 0..1 roll, biased by elapsed seconds.
export function pickTier(t, roll) {
  const heavy = roll < Math.min(0.4, t / 220);
  if (!heavy) return 0;
  return Math.random() < 0.45 ? 2 : 1;
}

// ============================================================================
// ENEMY TIERS + BOSSES — stats are data. Model/animation binding is by `model`
// key into assets.enemyModels. Fallback primitive `geo` renders if a GLB is
// missing so the game is always playable.
//   hp/spd/dmg : base stats (scaled by elapsed time at spawn)
//   s          : size unit (collision radius = s + 0.35)
//   c          : tint / primitive color
//   sight      : aggro sight radius
//   modelMul   : extra scale applied to the fitted GLB
// ============================================================================

// atkRange = distance it attacks from; windup = telegraph seconds before the
// hit; ranged tiers keep distance and fire projectiles (projSpeed, cd).
export const ENEMY_TIERS = [
  { key: 'grunt', hp: 18, spd: 3.4, dmg: 9,  c: 0xff3b6b, s: 0.95, geo: 'oct', sight: 17, model: 'cute',   modelMul: 0.95, atkRange: 1.9, windup: 0.45, atkCd: 0.9 },
  { key: 'brute', hp: 60, spd: 2.5, dmg: 18, c: 0xff7a5c, s: 1.45, geo: 'box', sight: 15, model: 'little', modelMul: 1.6,  atkRange: 2.4, windup: 0.7,  atkCd: 1.3 },
  { key: 'drone', hp: 16, spd: 3.1, dmg: 10, c: 0xffd23f, s: 0.85, geo: 'tet', sight: 24, model: 'drone',  modelMul: 1.05, ranged: true, atkRange: 24, keep: 15, windup: 0.75, atkCd: 2.2, projSpeed: 22 },
];

// ---------------------------------------------------------------------------
// BOSSES — two distinct fights. Each has telegraphed `skills`; while a skill
// casts, a bottom "danger gauge" fills and a ground indicator shows the hit
// zone, then the attack fires (see engine/boss.js).
//   skill.type : 'aoe'  -> shockwave ring around the boss / target
//                'dash' -> locks a lane toward the player then lunges
//                'ranged' -> spawns enemy projectiles (pattern spread|radial)
//   cast : seconds the gauge takes to fill    cd : cooldown after use
// ---------------------------------------------------------------------------
export const BOSSES = [
  {
    id: 'dasher', name: 'PRIME ROOSTER', nameKo: '프라임 루스터',
    model: 'bossA', modelMul: 18, hp: 520, spd: 2.8, dmg: 26, r: 22, c: 0xff2d55,   // 5x size
    skills: [
      { id: 'slam',   type: 'aoe',  name: 'Ground Slam',   nameKo: '대지 강타', cast: 1.4, cd: 6.5, radius: 12, dmg: 34, color: 0xff2d55, range: 22 },
      { id: 'charge', type: 'dash', name: 'Rooster Charge', nameKo: '맹돌진',   cast: 1.0, cd: 8.0, dmg: 30, color: 0xff7a5c, width: 5, speed: 46, time: 0.6, range: 60 },
      // carpet bomb — a rapid barrage of small blasts marching across the area around you
      { id: 'barrage', type: 'rain', name: 'Carpet Bomb', nameKo: '융단폭격', cast: 1.2, cd: 10, count: 16, dmg: 12, blast: 4.5, area: 20, stagger: 0.09, color: 0xffb03b },
    ],
  },
  {
    id: 'gunner', name: 'IRON TALON', nameKo: '아이언 탤런',
    model: 'bossB', modelMul: 14.5, hp: 560, spd: 2.2, dmg: 20, r: 20, c: 0xffb03b,  // 5x size
    skills: [
      // feather volley — tighter cone (was too wide) + shorter reach
      { id: 'volley', type: 'ranged', pattern: 'spread', name: 'Feather Volley', nameKo: '깃털 난사', cast: 1.1, cd: 5.0, count: 5, spread: 0.42, dmg: 16, speed: 28, color: 0xffb03b, range: 42 },
      { id: 'storm',  type: 'ranged', pattern: 'radial', name: 'Talon Storm',    nameKo: '탤런 스톰', cast: 1.4, cd: 7.5, count: 20, dmg: 14, speed: 20, color: 0xff7a5c, range: 999 },
      { id: 'barrage', type: 'rain', name: 'Carpet Bomb', nameKo: '융단폭격', cast: 1.2, cd: 10, count: 16, dmg: 12, blast: 4.5, area: 20, stagger: 0.09, color: 0xff7a5c },
    ],
  },
];

// Pick a spawn tier from a 0..1 roll, biased by elapsed seconds.
export function pickTier(t, roll) {
  const heavy = roll < Math.min(0.4, t / 220);
  if (!heavy) return 0;
  return Math.random() < 0.45 ? 2 : 1;
}

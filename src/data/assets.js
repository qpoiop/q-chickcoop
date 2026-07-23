// ============================================================================
// ASSET MANIFEST — single source of truth for every GLB / audio path.
// Change a path here and the whole game repoints; no code edits needed.
// Paths are resolved from the site root (public/ is copied to dist/ verbatim).
// ============================================================================

export const ASSET_BASE = import.meta.env.BASE_URL || './';

const p = (rel) => ASSET_BASE.replace(/\/$/, '') + '/' + rel;

export const ASSETS = {
  // Playable hero = golden_chicken_hero: an original, on-theme goggled battle
  // chicken (idle/run clips; attack is procedural). Replaces the earlier
  // third-party bird asset — on-brand and not someone else's IP character.
  player: p('caracter/golden_chicken_hero.glb'),

  // Character roster — 3 enemies + 2 bosses.
  enemyModels: {
    cute:   p('caracter/lowpoly_bird_animation.glb'),  // grunt (melee)
    little: p('caracter/lowpoly_bird_animation.glb'),  // brute (melee, scaled up)
    drone:  p('caracter/lady_bug_bird.glb'),           // ranged flyer
    bossA:  p('caracter/chick_stylized_character.glb'),
    bossB:  p('caracter/chick_stylized_character.glb'), // golden_chicken is now the player hero
  },

  // Weapon frames — one gun model per weapon key (data/weapons.js WEAPON_MODEL_MAP).
  weaponModels: {
    flare: p('item/flare_gun.glb'),
    nerf:  p('item/nerf_gun.glb'),
    laser: p('item/laser_gun.glb'),
    space: p('item/space_gun.glb'),
    water: p('item/water_gun.glb'),
  },

  // Combat FX
  fxModels: {
    bolt:  p('effect/lightningv2.glb'),
    storm: p('effect/lightningv1.glb'),
  },

  // Interaction props — the workbench you hack (data cores) + the salvage chest
  // you crack open for scrap.
  toolModels: {
    workbench: p('tools/workbench.glb'),
    chest:     p('tools/stylized_chest.glb'),
  },

  // Level geometry — urban city map for the main 시가전 stage.
  cityMap: p('scene/chicken_gun_fruzer_-_city.glb'),

  // Audio
  bgm: p('bgm/leberch-comedy-cartoon-375836.mp3'),
};

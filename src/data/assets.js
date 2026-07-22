// ============================================================================
// ASSET MANIFEST — single source of truth for every GLB / audio path.
// Change a path here and the whole game repoints; no code edits needed.
// Paths are resolved from the site root (public/ is copied to dist/ verbatim).
// ============================================================================

export const ASSET_BASE = import.meta.env.BASE_URL || './';

const p = (rel) => ASSET_BASE.replace(/\/$/, '') + '/' + rel;

export const ASSETS = {
  // Playable hero. NOTE: chick.glb is unusable as a player — it renders ~0.5u
  // tall and its only animation ("Take 01") flings the mesh ~4.6u off the
  // ground. golden_chicken_hero is grounded, correctly sized, and animated.
  player: p('caracter/golden_chicken_hero.glb'),

  // Character roster — 3 enemies + 2 bosses + 1 player (above).
  enemyModels: {
    cute:   p('caracter/lowpoly_bird_animation.glb'),
    little: p('caracter/chick_stylized_character.glb'),
    drone:  p('caracter/lady_bug_bird.glb'),
    // 2 bosses (bossB temporarily shares bossA's model — swap later)
    bossA:  p('caracter/chuck_movie_angry_birds_from_sonic_dash.glb'),
    bossB:  p('caracter/chuck_movie_angry_birds_from_sonic_dash.glb'),
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

  // Level geometry — main (lava town) + boss (detailed city) maps
  map: p('scene/chicken_gun___lava.glb'),
  bossMap: p('scene/chicken_gun_fruzer_-_city.glb'),

  // Audio
  bgm: p('bgm/leberch-comedy-cartoon-375836.mp3'),
};

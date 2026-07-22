// ============================================================================
// ASSET MANIFEST — single source of truth for every GLB / audio path.
// Change a path here and the whole game repoints; no code edits needed.
// Paths are resolved from the site root (public/ is copied to dist/ verbatim).
// ============================================================================

export const ASSET_BASE = import.meta.env.BASE_URL || './';

const p = (rel) => ASSET_BASE.replace(/\/$/, '') + '/' + rel;

export const ASSETS = {
  // Playable hero
  player: p('caracter/golden_chicken_hero.glb'),

  // Enemy roster (keyed by logical model name used in data/enemies.js)
  enemyModels: {
    cute:   p('caracter/chick.glb'),
    little: p('caracter/chuck_movie_angry_birds_from_sonic_dash.glb'),
    drone:  p('caracter/lady_bug_bird.glb'),
    boss:   p('caracter/chuck_movie_angry_birds_from_sonic_dash.glb'),
  },

  // Weapon frames (keyed by logical gun model)
  weaponModels: {
    flare: p('item/flare_gun.glb'),
    laser: p('item/laser_gun.glb'),
    space: p('item/space_gun.glb'),
    bubble: p('item/bubble_gun.glb'),
    nerf:  p('item/nerf_gun.glb'),
  },

  // Combat FX
  fxModels: {
    bolt:  p('effect/lightningv2.glb'),
    storm: p('effect/lightningv1.glb'),
  },

  // Level geometry
  map: p('scene/chicken_gun___lava.glb'),

  // Audio
  bgm: p('bgm/leberch-comedy-cartoon-375836.mp3'),
};

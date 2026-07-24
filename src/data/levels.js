// ============================================================================
// LEVEL LAYOUTS + MAP REGISTRY — data consumed by engine/world.js + Game.
// The game runs across two maps joined by a glowing portal:
//   main  — lava-street town (breach 2 cores → portal opens → enter portal)
//   boss  — open forest arena (defeat the boss → extraction portal → win)
// Coordinates are world units on the XZ plane.
// ============================================================================
import { ASSETS } from './assets.js';

// --- MAIN: lava town over chicken_gun___lava.glb. The GLB is one combined
// mesh + a huge ground plane, so the loader fits it by its structure cluster
// (see Game._loadMapModel). Buildings frame the arena as backdrop; cover comes
// from `covers` data. Play area is a roomy square, not a strip. ---
// The chicken_gun town/lava GLBs are single combined meshes (a giant ground
// plane + a tiny inseparable town) that don't fit a gameplay field, so the main
// map is a purpose-built warm "lava yard" arena: a lit ground + amber grid +
// cover pillars, ringed by a glowing lava moat. Reliable, readable, performant.
// First / tutorial map = a clean research-lab arena: tiled floor + teal grid +
// an energy boundary. Purpose-built (no GLB) so scale/centering are correct.
// First / main map = the chicken-gun lava TOWN model (4 MB, instant, on-theme).
// Real streets + buildings (collision harvested from the mesh); the play area is
// the town itself, no procedural grid / no giant safe ring.
// TUTORIAL = a small, clean tiled training bay. Compact; just teaches the
// basics (move / fire / dash / pickup / fight), then hands off to the city.
export function tutorialLevel() {
  const hx = 26, hz = 20;
  return {
    id: 'tutorial', B: 26, bounds: { hx, hz }, arena: true, lavaRing: true,
    // a clean, warmly-lit training yard: teal energy grid + amber boundary, a few
    // accent pillars for cover so it reads as a place, not an empty plane.
    floorColor: 0x31465c, gridColor1: 0x6a96b0, gridColor2: 0x34455a, accent: 0x35e0d0, edgeColor: 0xffb84a,
    spawnStart: { x: 0, z: 10 },
    walls: [], platforms: [],
    covers: [],   // no crystal-pillars in the training bay — kept clean
    cores: [{ x: 12, z: 4 }],  // workbench to hack (tutorial HACK step)
    shop: { x: -12, z: -6 },   // shop stall (tutorial SHOP step) — was missing
    portal: { x: 0, z: -15, to: 'city' }, // exit portal (tutorial's final step)
    spawns: [[-20, -12], [20, -12], [0, -16], [-20, 5], [20, 5]],
    crates: [[12, -8]],      // salvage chest to open (tutorial OPEN step)
    // brighter, less void-like training bay (was ~72% near-black — read as an empty
    // platform in the dark; first impression). Lighter floor/bg + fog pushed back.
    fog: { color: 0x1a2836, near: 90, far: 240 }, bg: 0x28384a,
    light: { hemi: 1.5, dir: 2.6 },
  };
}

// BOSS / high-risk = the WATERFALL open forest (normalize pipeline, ~1:1 scale).
// Guide anchors: Table_round spawn, Fountain (round → boss ring), Store shop,
// Dumpster salvage. This map is texture-less flat-colour, so it wants brighter,
// cooler light. Exit has no anchor → extraction placed manually near spawn.
export function waterfallLevel() {
  // scaled up ×2 (normalize 120→240, bounds ×2): the arena was way too small —
  // you toured it in a few steps. Anchors below are the guide coords ×2.
  const hx = 118, hz = 118;
  return {
    id: 'boss', B: 118, bounds: { hx, hz }, harvest: true,
    // Town_plane is the play surface here, so bound play to the content bbox (+15)
    // instead of density-trimming (which made extraction unreachable).
    mapFit: { normalize: 240, walkTop: 12, boundToContent: 15 },
    spawnStart: { x: -9.8, z: 10.8 }, safe: { x: -9.8, z: 10.8, r: 10 },
    walls: [], platforms: [], covers: [], cores: [],
    boss: true, bossSpawn: { x: -12.8, z: -4.4 },   // Fountain
    extractionAfterBoss: { x: -9.8, z: 10.8 },        // back at the table (spawn)
    shop: { x: -11.6, z: 22.4 },                      // Store
    crates: [[-14, 23.2], [-25.6, -32.2], [-47, 5.4], [-6.6, 17.2]],
    spawns: [[-40, -16], [20, -32], [-48, 6], [8, 20], [-26, -32]],
    fog: { color: 0x0c1418, near: 160, far: 520 }, bg: 0x14202a,
    light: { hemi: 1.15, dir: 2.3 },
  };
}


// STAGE 1 = combat arena (procedural, model:null). The a_city_in_nature GLB was
// replaced: as a decorative scene it played badly — hills/foliage occluded the
// camera, harvested collision blocked movement everywhere, spawn/anchors landed
// in awkward spots, and the layout let you just hack the nearest core and leave.
// A flat arena fixes all of that: no occlusion, walk anywhere, a visible boundary
// ring, a dead-centre spawn, and the two cores on OPPOSITE corners so you must
// cross the whole arena (and fight) to breach both before the portal opens.
export function cityStageLevel() {
  const hx = 46, hz = 46;
  return {
    id: 'city', B: 46, bounds: { hx, hz }, arena: true, lavaRing: true,
    floorColor: 0x263349, gridColor1: 0x5a7ba0, gridColor2: 0x2c3d56, accent: 0x35e0d0, edgeColor: 0xffb84a,
    spawnStart: { x: 0, z: 0 },                       // dead centre — unambiguous
    walls: [], platforms: [], covers: [],             // covers:[] = no accent pillars (kept clean)
    cores: [{ x: -32, z: -22 }, { x: 32, z: 22 }],    // opposite corners → cross the arena to breach both
    shop: { x: 30, z: -26 },
    portal: { x: 0, z: -38, to: 'boss' },             // opens after both cores; flat ground, clearly visible
    crates: [[-26, 22], [24, -12], [-30, 4], [10, 32], [0, -20]],
    spawns: [[-42, -42], [42, -42], [-42, 42], [42, 42], [0, -44], [0, 44], [-44, 0], [44, 0]],  // perimeter — mobs come from the arena edges
    fog: { color: 0x141d2c, near: 130, far: 340 }, bg: 0x1c2740,
    light: { hemi: 1.7, dir: 2.9 },
  };
}

// Map registry: optional GLB backdrop model + level builder. `model: null` =
// pure procedural arena (no GLB). Referenced by Game map handling.
export const MAPS = {
  tutorial: { id: 'tutorial', model: null, build: tutorialLevel },       // small tiled bay
  city: { id: 'city', model: null, build: cityStageLevel },     // first combat map — procedural arena
  boss: { id: 'boss', model: ASSETS.forestOpen, build: waterfallLevel },     // waterfall forest GLB
};

// Procedural fallback arena (used only if a map GLB fails to load).
export function arenaLevel() {
  const B = 52;
  const walls = [];
  const wall = (x, z, w, d, h = 3) => walls.push({ x, z, w, d, h });
  wall(0, -B, B * 2, 2); wall(0, B, B * 2, 2); wall(-B, 0, 2, B * 2); wall(B, 0, 2, B * 2);
  [[-8, 6], [8, 6], [0, -6], [-18, 14], [18, 14], [0, 20], [-26, 26], [26, 26]]
    .forEach(([x, z]) => wall(x, z, 4, 4, 2.4));
  return {
    id: 'arena', B, walls,
    covers: [[-12, -10], [12, -10], [-32, 4], [32, 4]],
    platforms: [], cores: [{ x: -40, z: -16 }, { x: 40, z: -16 }],
    portal: { x: 0, z: 46, to: 'boss' },
    spawnStart: { x: 0, z: 34 },
    spawns: [[-46, -40], [46, -40], [-46, 44], [46, 44], [0, -46]],
    crates: [[-20, 8], [20, 8], [-30, -8], [30, -8]],
  };
}

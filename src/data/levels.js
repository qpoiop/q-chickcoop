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

// BOSS = a menacing procedural colosseum (model:null, arena:true). The
// forest_waterfall GLB was replaced for the same reason as the city map: as a
// decorative scene only ~9% of it was walkable and harvested collision boxes
// cramped movement — bad for a boss duel that needs open room to kite and dodge
// telegraphs. A flat open arena gives the fight the space it needs.
export function waterfallLevel() {
  const B = 54;
  return {
    id: 'boss', B, bounds: { hx: B, hz: B }, arena: true, lavaRing: true,
    floorColor: 0x241a2e, gridColor1: 0x5a3a7a, gridColor2: 0x2a1e38, accent: 0xc06bff, edgeColor: 0xff2d55,
    spawnStart: { x: 0, z: 40 }, safe: { x: 0, z: 40, r: 8 },   // enter at the edge; a small safe pocket (no mob spawns)
    walls: [], platforms: [], covers: [], cores: [],
    boss: true, bossSpawn: { x: 0, z: -8 },            // boss holds the arena centre
    extractionAfterBoss: { x: 0, z: 44 },              // by the entry edge
    shop: { x: -38, z: 30 },
    crates: [[-30, -20], [30, -20], [-22, 12], [22, 12], [0, -32]],
    spawns: [[-48, -48], [48, -48], [-48, 48], [48, 48], [0, -50], [-50, 0], [50, 0]],  // perimeter adds
    fog: { color: 0x140a1a, near: 140, far: 360 }, bg: 0x1a1022,
    light: { hemi: 0.9, dir: 2.0 },
  };
}


// STAGE 1 = combat arena (procedural, model:null). The a_city_in_nature GLB was
// replaced: as a decorative scene it played badly — hills/foliage occluded the
// camera, harvested collision blocked movement everywhere, spawn/anchors landed
// in awkward spots, and the layout let you just hack the nearest core and leave.
// DIRECTIONAL LEVEL: a long avenue you START at the near edge and PUSH FORWARD
// through (advance along -z). Mobs spawn ahead and to the sides so advancing =
// fighting; the two cores sit further down the lane (mid + deep) and the exit
// portal is at the FAR end — you fight the length of the map to reach it.
export function cityStageLevel() {
  const hx = 34, hz = 62;   // long lane (advance down -z), narrower across
  return {
    id: 'city', B: 62, bounds: { hx, hz }, arena: true, lavaRing: true,
    floorColor: 0x263349, gridColor1: 0x5a7ba0, gridColor2: 0x2c3d56, accent: 0x35e0d0, edgeColor: 0xffb84a,
    spawnStart: { x: 0, z: 54 },                      // START at the near edge, not the centre
    walls: [], platforms: [], covers: [],
    shop: { x: 24, z: 46 },                           // by the entrance — gear up before pushing in
    cores: [{ x: -16, z: 4 }, { x: 18, z: -38 }],     // breach forward: one mid-lane, one deep
    portal: { x: 0, z: -58, to: 'boss' },             // EXIT at the far end of the lane
    crates: [[-24, 32], [22, 14], [-14, -16], [16, -46], [0, -30]],
    // spawns spread DOWN the lane (ahead of the advancing player) so combat is
    // continuous as you push forward — not a single perimeter ring.
    spawns: [[-26, 34], [26, 34], [-28, 8], [28, 8], [-26, -20], [26, -20], [0, -40], [-24, -50], [24, -50]],
    fog: { color: 0x141d2c, near: 160, far: 400 }, bg: 0x1c2740,
    light: { hemi: 1.7, dir: 2.9 },
  };
}

// Map registry: optional GLB backdrop model + level builder. `model: null` =
// pure procedural arena (no GLB). Referenced by Game map handling.
export const MAPS = {
  tutorial: { id: 'tutorial', model: null, build: tutorialLevel },       // small tiled bay
  city: { id: 'city', model: null, build: cityStageLevel },     // first combat map — procedural arena
  boss: { id: 'boss', model: null, build: waterfallLevel },     // boss colosseum — procedural arena
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

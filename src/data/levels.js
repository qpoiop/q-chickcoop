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

// MAIN = the URBAN city map (chicken_gun_fruzer city GLB). It is a long avenue
// (~125×569 in model space, centered (5,-220), floor y=-18.6); a hand-tuned
// transform drops a playable section onto the bounds. Building collision is
// harvested (size-capped).
export function cityLevel() {
  const hx = 62, hz = 62;
  return {
    id: 'main', B: 62, bounds: { hx, hz }, harvest: true,
    // Fit to the BUILDING block (House/Bank/Church cluster: center (6,-4.6),
    // ~123×137, floor y=-18.6). scale/center/minY are MODEL-space; bumping the
    // scale grows the whole city (wider streets to roam) — the ground raycast
    // re-snaps Y afterwards. Meme props (Shrek head etc.) are stripped from the GLB.
    mapFit: { scale: 1.5, center: { x: 6, z: -4.6 }, minY: -18.6 },
    spawnStart: { x: 0, z: 48 },
    walls: [], platforms: [], covers: [],
    cores: [{ x: -34, z: -18 }, { x: 38, z: -16 }],
    shop: { x: 18, z: 30 },   // walk up to the shop stall to buy weapons
    portal: { x: 0, z: -50, to: 'boss' },
    spawns: [[-54, -46], [54, -46], [-54, 40], [54, 40], [0, -56], [-58, 0], [58, 0]],
    crates: [[-26, 16], [30, -12], [-10, -22], [22, 20], [6, 6], [-42, -6], [46, 10]],
    fog: { color: 0x0a0e14, near: 110, far: 340 }, bg: 0x1a2230,
    light: { hemi: 0.95, dir: 2.05 },
  };
}

// --- BOSS: a menacing violet colosseum (pure procedural arena, no heavy GLB
// so the portal transition is instant). Ring of pillars + red energy moat. ---
export function bossArenaLevel() {
  const B = 46;
  const ring = [];
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ring.push([Math.cos(a) * 26, Math.sin(a) * 26]); }
  for (let i = 0; i < 6; i++) { const a = (i + 0.5) / 6 * Math.PI * 2; ring.push([Math.cos(a) * 13, Math.sin(a) * 13]); }
  return {
    id: 'boss', B, bounds: { hx: B, hz: B }, arena: true, lavaRing: true,
    floorColor: 0x241a2e, gridColor1: 0x5a3a7a, gridColor2: 0x2a1e38, accent: 0xc06bff, edgeColor: 0xff2d55,
    spawnStart: { x: 0, z: 34 }, safe: { x: 0, z: 34, r: 7 },
    walls: [], covers: [], platforms: [], cores: [],   // no crystal pillars (removed per feedback)
    boss: true, bossSpawn: { x: 0, z: -8 },
    extractionAfterBoss: { x: 0, z: 38 },
    spawns: [[-40, -34], [40, -34], [-40, 24], [40, 24], [0, -42], [-42, 0], [42, 0]],
    crates: [[-26, 8], [26, 8], [-16, -20], [16, -20], [0, 10]],
    fog: { color: 0x140a1a, near: 110, far: 340 }, bg: 0x1a1022,
    light: { hemi: 0.6, dir: 1.6 },
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


// STAGE 3 = CITY-IN-NATURE (a_city_in_nature.glb — the biggest model, ~124×131
// model units). Loaded via the normalize pipeline (long axis → 120, centred),
// same as the forests, so movement/camera/ranges all carry over untouched. Node
// names are meaningless in this GLB, so anchors are hand-placed in normalized
// space and _snapAnchors pulls each onto reachable street ground at load. Flow:
// forest (breach cores → portal) → CITY (breach cores → portal) → boss room.
export function cityStageLevel() {
  const hx = 58, hz = 58;
  return {
    id: 'city', B: 58, bounds: { hx, hz }, harvest: true,
    mapFit: { normalize: 120, walkTop: 6, trimOpen: 0.9 },  // block open grass/void fields you can stroll into (roads survive — bordered by buildings)
    // spawn at the map's open central plaza (measured walkable centroid) — the
    // guessed edge coord snapped to a cramped corner. Anchors below are spread
    // across the (nearly map-wide) walkable area; _snapAnchors keeps reachable ones.
    spawnStart: { x: 5, z: -1 },
    walls: [], platforms: [], covers: [],
    cores: [{ x: -30, z: -12 }, { x: 41, z: 2 }],   // hack targets, opposite ends (B was on a rooftop y=4.8 → probe-picked clear ground)
    shop: { x: 16, z: 22 },
    portal: { x: 11, z: 41, to: 'boss' },             // was on a rooftop y=3.3 → probe-picked clear ground, far from spawn
    crates: [[-18, 10], [22, 6], [-8, -20], [12, -28], [-1, 56], [30, 20]],  // was [-28,18] under a building (topmost y=6.2) → probe-picked open ground
    spawns: [[-46, -38], [46, -38], [-46, 34], [46, 34], [0, -48], [-50, 0], [50, 0]],
    fog: { color: 0x16202c, near: 130, far: 420 }, bg: 0x24303f,
    exposure: 1.4,   // city read too dark (avg luminance ~34 vs forest ~57; 53% near-black)
    light: { hemi: 1.9, dir: 3.2 },
  };
}

// Map registry: optional GLB backdrop model + level builder. `model: null` =
// pure procedural arena (no GLB). Referenced by Game map handling.
export const MAPS = {
  tutorial: { id: 'tutorial', model: null, build: tutorialLevel },       // small tiled bay
  city: { id: 'city', model: ASSETS.cityNature, build: cityStageLevel },     // first combat map — city-in-nature
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

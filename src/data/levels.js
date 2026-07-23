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
  const hx = 24, hz = 18;
  return {
    id: 'tutorial', B: 24, bounds: { hx, hz }, arena: true, lavaRing: true,
    floorColor: 0x2c3644, gridColor1: 0x4f7c92, gridColor2: 0x26313c, accent: 0x35e0d0, edgeColor: 0x35e0d0,
    spawnStart: { x: 0, z: 8 },
    walls: [], platforms: [], covers: [],
    cores: [{ x: 9, z: 2 }],  // workbench to hack (tutorial HACK step)
    portal: { x: 0, z: -13, to: 'main' }, // exit portal (tutorial's final step)
    spawns: [[-18, -10], [18, -10], [0, -14], [-18, 4], [18, 4]],
    crates: [[-9, 2]],      // salvage chest to open (tutorial OPEN step)
    fog: { color: 0x0c1218, near: 55, far: 150 }, bg: 0x141c26,
    light: { hemi: 0.75, dir: 1.6 },
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
    walls: [], covers: ring, platforms: [], cores: [],
    boss: true, bossSpawn: { x: 0, z: -8 },
    extractionAfterBoss: { x: 0, z: 38 },
    spawns: [[-40, -34], [40, -34], [-40, 24], [40, 24], [0, -42], [-42, 0], [42, 0]],
    crates: [[-26, 8], [26, 8], [-16, -20], [16, -20], [0, 10]],
    fog: { color: 0x140a1a, near: 110, far: 340 }, bg: 0x1a1022,
    light: { hemi: 0.6, dir: 1.6 },
  };
}

// Map registry: optional GLB backdrop model + level builder. `model: null` =
// pure procedural arena (no GLB). Referenced by Game map handling.
export const MAPS = {
  tutorial: { id: 'tutorial', model: null, build: tutorialLevel },       // small tiled bay
  main: { id: 'main', model: ASSETS.cityMap, build: cityLevel },         // urban city GLB
  boss: { id: 'boss', model: null, build: bossArenaLevel },              // pure arena
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

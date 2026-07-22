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
export function townLevel() {
  const hx = 52, hz = 40;
  return {
    id: 'main', B: 52, bounds: { hx, hz }, arena: true, lavaRing: true,
    floorColor: 0x53422c, gridColor1: 0x8a6636, gridColor2: 0x46351f, accent: 0xffb03b,
    spawnStart: { x: 0, z: 34 }, safe: { x: 0, z: 34, r: 7 },
    walls: [], platforms: [],
    covers: [[-22, 8], [22, 8], [-10, -8], [10, -8], [0, 16], [-34, -18], [34, -18], [0, -22]],
    cores: [{ x: -36, z: -16 }, { x: 36, z: -16 }],
    portal: { x: 0, z: -32, to: 'boss' },
    spawns: [[-46, -32], [46, -32], [-46, 26], [46, 26], [0, -34], [-46, 0], [46, 0]],
    crates: [[-20, 20], [20, 20], [-40, 4], [40, 4], [0, 4], [-14, -24], [14, -24]],
    fog: { color: 0x1a0e08, near: 120, far: 300 }, bg: 0x2a1408,
    light: { hemi: 0.7, dir: 1.7 },
  };
}

// --- BOSS: neon arena floor laid over the detailed city model (backdrop) ---
// `arena` draws a readable emissive floor/grid + cover pillars for clean boss
// gameplay; `openArena` skips collision-harvest so the city stays decorative.
export function bossArenaLevel() {
  const B = 42;
  const ring = [];
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ring.push([Math.cos(a) * 18, Math.sin(a) * 18]); }
  return {
    id: 'boss', B, bounds: { hx: B, hz: B }, arena: true, openArena: true,
    floorColor: 0x0d1622, gridColor1: 0x2a4a6a, gridColor2: 0x16283a, accent: 0xc06bff,
    spawnStart: { x: 0, z: 30 }, safe: { x: 0, z: 30, r: 6 },
    walls: [], covers: ring, platforms: [], cores: [],
    boss: true, bossSpawn: { x: 0, z: -6 },
    extractionAfterBoss: { x: 0, z: 34 },
    spawns: [[-36, -30], [36, -30], [-36, 20], [36, 20], [0, -38], [-38, 0], [38, 0]],
    crates: [[-24, 6], [24, 6], [-14, -18], [14, -18]],
    fog: { color: 0x1a2230, near: 100, far: 320 }, bg: 0x223040,
    light: { hemi: 1.05, dir: 2.1 },
  };
}

// Map registry: optional GLB backdrop model + level builder. `model: null` =
// pure procedural arena (no GLB). Referenced by Game map handling.
export const MAPS = {
  main: { id: 'main', model: null, build: townLevel },
  boss: { id: 'boss', model: ASSETS.bossMap, build: bossArenaLevel },
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

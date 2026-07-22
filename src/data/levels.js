// ============================================================================
// LEVEL LAYOUTS + MAP REGISTRY — data consumed by engine/world.js + Game.
// The game runs across two maps joined by a glowing portal:
//   main  — lava-street town (breach 2 cores → portal opens → enter portal)
//   boss  — open forest arena (defeat the boss → extraction portal → win)
// Coordinates are world units on the XZ plane.
// ============================================================================
import { ASSETS } from './assets.js';

// --- MAIN: town strip over chicken_gun___lava.glb (~104 wide x 21 deep) ---
export function townLevel() {
  const hx = 48, hz = 19;
  return {
    id: 'main', B: 52, bounds: { hx, hz },
    spawnStart: { x: 0, z: 0 }, safe: { x: 0, z: 0, r: 8 },
    walls: [], covers: [], platforms: [],
    cores: [{ x: -40, z: -10 }, { x: -8, z: 11 }],
    // Portal to the boss map — hidden until both cores are breached.
    portal: { x: 44, z: 0, to: 'boss' },
    spawns: [[-46, -14], [46, 14], [-44, 14], [44, -14], [-46, 10], [46, -10], [-38, -15]],
    crates: [[-34, 8], [-18, -10], [-2, 9], [10, -9], [30, 10], [36, -8], [-44, -8], [44, 9]],
    fog: { color: 0x0a0e14, near: 90, far: 190 }, bg: 0x1a2230,
    light: { hemi: 0.5, dir: 1.4 },
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

// Map registry: model + level builder + kind. Referenced by Game map handling.
export const MAPS = {
  main: { id: 'main', model: ASSETS.map, build: townLevel },
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

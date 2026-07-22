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
export function townLevel() {
  const hx = 66, hz = 54;
  return {
    id: 'main', B: 66, bounds: { hx, hz }, arena: true, lavaRing: true,
    floorColor: 0x3a4552, gridColor1: 0x5a8ea6, gridColor2: 0x2c3b48, accent: 0x35e0d0, edgeColor: 0x35e0d0,
    spawnStart: { x: 0, z: 44 }, safe: { x: 0, z: 44, r: 8 },
    walls: [
      { x: -24, z: 6, w: 2, d: 20, h: 2.2 }, { x: 24, z: 6, w: 2, d: 20, h: 2.2 },
      { x: 0, z: -6, w: 30, d: 2, h: 2.2 }, { x: -40, z: 20, w: 14, d: 2, h: 2.2 }, { x: 40, z: 20, w: 14, d: 2, h: 2.2 },
    ], platforms: [],
    covers: [[-28, 10], [28, 10], [-14, -8], [14, -8], [0, 22], [-46, -22], [46, -22], [0, -30], [-30, 32], [30, 32], [-16, 18], [16, 18], [-52, -6], [52, -6]],
    cores: [{ x: -46, z: -22 }, { x: 46, z: -22 }],
    portal: { x: 0, z: -44, to: 'boss' },
    spawns: [[-60, -44], [60, -44], [-60, 38], [60, 38], [0, -48], [-60, 0], [60, 0]],
    crates: [[-26, 26], [26, 26], [-54, 6], [54, 6], [0, 8], [-18, -34], [18, -34]],
    fog: { color: 0x0c1218, near: 140, far: 380 }, bg: 0x141c26,
    light: { hemi: 0.75, dir: 1.7 },
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
  main: { id: 'main', model: null, build: townLevel },
  boss: { id: 'boss', model: null, build: bossArenaLevel }, // pure arena → instant portal
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

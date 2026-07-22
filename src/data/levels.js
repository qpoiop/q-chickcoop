// ============================================================================
// LEVEL LAYOUTS — data descriptions consumed by engine/world.js.
// `town` matches the lava-street GLB map (collision harvested from the mesh).
// `arena` is a fully procedural fallback used when the map GLB is unavailable.
// Coordinates are world units on the XZ plane.
// ============================================================================

// Town strip laid over chicken_gun___lava.glb (~104 wide x 21 deep street).
export function townLevel() {
  const hx = 48, hz = 19;
  return {
    id: 'town', B: 52, bounds: { hx, hz },
    spawnStart: { x: 0, z: 0 }, safe: { x: 0, z: 0, r: 8 },
    walls: [], covers: [], platforms: [],
    gate: { x: 22, z: 0, w: hz * 2, across: true },
    cores: [{ x: -40, z: -10 }, { x: -8, z: 11 }],
    extraction: { x: 44, z: 0 },
    spawns: [[-46, -14], [46, 14], [-44, 14], [44, -14], [-46, 10], [46, -10], [-38, -15]],
    crates: [[-34, 8], [-18, -10], [-2, 9], [10, -9], [30, 10], [36, -8], [-44, -8], [44, 9]],
  };
}

// Procedural arena (no map GLB): rooms, cover, pillars, central locked gate.
export function arenaLevel() {
  const B = 52;
  const walls = [];
  const wall = (x, z, w, d, h = 3) => walls.push({ x, z, w, d, h });
  // outer boundary
  wall(0, -B, B * 2, 2); wall(0, B, B * 2, 2); wall(-B, 0, 2, B * 2); wall(B, 0, 2, B * 2);
  // NW room
  wall(-30, -24, 40, 2); wall(-46, -14, 2, 22); wall(-14, -24, 2, 10);
  // NE room
  wall(30, -24, 40, 2); wall(46, -14, 2, 22); wall(14, -30, 2, 14);
  // central pillars / cover
  [[-8, 6], [8, 6], [0, -6], [-18, 14], [18, 14], [0, 20], [-26, 26], [26, 26]]
    .forEach(([x, z]) => wall(x, z, 4, 4, 2.4));
  // south barricades
  wall(-22, 34, 20, 2); wall(22, 34, 20, 2);
  return {
    id: 'arena', B, walls,
    covers: [[-12, -10], [12, -10], [-32, 4], [32, 4], [-6, 30], [6, 30], [-40, 20], [40, 20]],
    platforms: [{ x: 0, z: -34, w: 16, d: 10, h: 1.2 }],
    gate: { x: 0, z: 40, w: 14, across: false },
    cores: [{ x: -40, z: -16 }, { x: 40, z: -16 }],
    extraction: { x: 0, z: 46 },
    spawnStart: { x: 0, z: 34 },
    spawns: [[-46, -40], [46, -40], [-46, 44], [46, 44], [0, -46], [-46, 0], [46, 0]],
    crates: [[-20, 8], [20, 8], [-30, -8], [30, -8], [0, 12], [-8, -16], [8, -16], [-42, 32], [42, 32]],
  };
}

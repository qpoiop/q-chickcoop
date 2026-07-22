import * as THREE from 'three';
import { locName } from '../data/i18n.js';

// ============================================================================
// BOSS AI — telegraphed skill casting. Each frame a boss either chases, winds
// up a skill (a ground telegraph appears + the bottom DANGER gauge fills), or
// executes (AoE shockwave / lane dash / projectile pattern). Damage lands the
// instant the gauge completes, so players read the telegraph and dodge/dash.
//   All entities/effects live in game.scene; enemy projectiles in
//   game.enemyBullets (advanced + collided in Game._updateEnemyBullets).
// ============================================================================

export function initBoss(game, e, def) {
  e.userData.def = def;
  e.userData.skills = def.skills.map((sk) => ({ def: sk, cdT: sk.cd * (0.5 + Math.random() * 0.5) }));
  e.userData.cast = null;
  e.userData.dashT = 0;
  e.userData.dashDir = new THREE.Vector3();
}

// to: normalized dir to player, d: distance to player.
export function updateBoss(game, e, to, d, dt, rdt) {
  const u = e.userData;

  // --- active dash execution ---
  if (u.dashT > 0) {
    u.dashT -= rdt;
    e.position.addScaledVector(u.dashDir, u.dashSpeed * dt);
    game._collide(e.position, u.r * 0.6);
    // lane contact damage
    if (d < u.r + 1.4) game._bossHitPlayer(u.def.dmg, e.position);
    if (u.dashT <= 0) { e.rotation.y = Math.atan2(to.x, to.z); }
    return;
  }

  // --- casting a skill ---
  if (u.cast) {
    const c = u.cast; c.t += dt;
    _animTelegraph(game, e, c);
    game.hud.showCast(locName(c.skill.def), Math.min(1, c.t / c.dur), c.skill.def.color);
    // face the locked direction during windup
    if (c.dir) e.rotation.y = Math.atan2(c.dir.x, c.dir.z);
    if (c.t >= c.dur) { _execute(game, e, c); _clearCast(game, e); }
    return;
  }

  // --- chase + pick a skill ---
  e.rotation.y = Math.atan2(to.x, to.z);
  const step = e.position.clone().addScaledVector(to, u.spd * dt);
  game._collide(step, u.r * 0.7); game._keepOutSafe(step, u.r); e.position.copy(step);

  let ready = null;
  for (const s of u.skills) {
    s.cdT -= dt;
    if (s.cdT <= 0 && d <= (s.def.range || 999)) { if (!ready || Math.random() < 0.5) ready = s; }
  }
  if (ready) _beginCast(game, e, ready, to);
}

function _beginCast(game, e, skill, to) {
  const def = skill.def;
  const cast = { skill, t: 0, dur: def.cast, dir: to.clone(), telegraph: null };
  if (def.type === 'aoe') cast.telegraph = _ringTelegraph(game, e.position, def.radius, def.color);
  else if (def.type === 'dash') cast.telegraph = _laneTelegraph(game, e.position, to, def.range, def.width, def.color);
  else if (def.type === 'ranged') cast.telegraph = _ringTelegraph(game, e.position, 3.2, def.color);
  e.userData.cast = cast;
}

function _clearCast(game, e) {
  const c = e.userData.cast; if (c && c.telegraph) game.scene.remove(c.telegraph);
  e.userData.cast = null; game.hud.hideCast();
}

// Public: tear down any in-progress telegraph (boss death / game reset).
export function clearBossCast(game, e) { _clearCast(game, e); e.userData.dashT = 0; }

function _execute(game, e, c) {
  const def = c.skill.def; c.skill.cdT = def.cd;
  if (def.type === 'aoe') {
    game._impact(e.position, def.color, 34, 10); game.fx.shake = Math.min(1, game.fx.shake + 0.6); game.audio.boss();
    _shockwave(game, e.position, def.radius, def.color);
    const dx = game.player.position.x - e.position.x, dz = game.player.position.z - e.position.z;
    if (Math.hypot(dx, dz) <= def.radius) game._bossHitPlayer(def.dmg, e.position);
  } else if (def.type === 'dash') {
    e.userData.dashDir.copy(c.dir); e.userData.dashT = def.time; e.userData.dashSpeed = def.speed;
    game.fx.shake = Math.min(1, game.fx.shake + 0.4); game.audio.boss();
  } else if (def.type === 'ranged') {
    game.audio.boss(); game.fx.shake = Math.min(1, game.fx.shake + 0.3);
    const origin = e.position.clone(); origin.y = 1.4;
    if (def.pattern === 'radial') {
      for (let i = 0; i < def.count; i++) { const a = (i / def.count) * Math.PI * 2; _bullet(game, origin, new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), def); }
    } else {
      const base = Math.atan2(c.dir.x, c.dir.z);
      for (let i = 0; i < def.count; i++) { const a = base + def.spread * (i - (def.count - 1) / 2) / ((def.count - 1) / 2 || 1); _bullet(game, origin, new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), def); }
    }
  }
}

// ---- enemy projectile ----
function _bullet(game, origin, dir, def) {
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12),
    new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 2.2, roughness: 0.4 }));
  b.position.copy(origin).add(dir.clone().multiplyScalar(u_r(game) + 1.2)); b.position.y = 1.2;
  b.userData = { dir: dir.clone().normalize(), vel: def.speed, dmg: def.dmg, life: 4 };
  game.scene.add(b); game.enemyBullets.push(b);
}
function u_r(game) { return (game.boss && game.boss.userData.r) || 3; }

// ---- telegraphs (ground danger indicators) ----
function _ringTelegraph(game, pos, radius, color) {
  const g = new THREE.Group(); g.position.set(pos.x, 0.06, pos.z);
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.35, radius, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; g.add(ring);
  const fill = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.DoubleSide }));
  fill.rotation.x = -Math.PI / 2; fill.scale.setScalar(0.01); g.add(fill);
  g.userData = { fill, radius }; game.scene.add(g); return g;
}
function _laneTelegraph(game, pos, dir, len, width, color) {
  const g = new THREE.Group();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, len), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(0, 0, len / 2); g.add(plane);
  const core = new THREE.Mesh(new THREE.PlaneGeometry(width, len), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  core.rotation.x = -Math.PI / 2; core.position.set(0, 0, len / 2); core.scale.y = 0.02; g.add(core);
  g.position.set(pos.x, 0.06, pos.z); g.rotation.y = Math.atan2(dir.x, dir.z);
  g.userData = { core }; game.scene.add(g); return g;
}
function _animTelegraph(game, e, c) {
  const g = c.telegraph; if (!g) return; const p = Math.min(1, c.t / c.dur);
  if (g.userData.fill) { g.userData.fill.scale.setScalar(p); g.userData.fill.material.opacity = 0.12 + p * 0.3; }
  if (g.userData.core) { g.userData.core.scale.y = p; g.userData.core.material.opacity = 0.5 + p * 0.4; g.position.set(e.position.x, 0.06, e.position.z); }
  else if (g.userData.fill) g.position.set(e.position.x, 0.06, e.position.z);
}
function _shockwave(game, pos, radius, color) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.4, radius, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(pos.x, 0.1, pos.z); ring.scale.setScalar(0.1);
  ring.userData = { life: 0.5, max: 0.5, grow: radius }; game.fxSprites.push(ring); game.scene.add(ring);
  // reuse fxSprites lifecycle: needs a mixer-less fade; give it a simple grow via life
  ring.userData.mixer = null;
}

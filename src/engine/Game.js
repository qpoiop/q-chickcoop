import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { CONFIG } from '../data/config.js';
import { WEAPONS, WEAPON_MODEL_MAP, WEAPON_DROP_ORDER } from '../data/weapons.js';
import { BRANCHES, computeModifiers } from '../data/skills.js';
import { ENEMY_TIERS, BOSSES, pickTier } from '../data/enemies.js';
import { TUTORIAL } from '../data/tutorial.js';
import { MAPS, arenaLevel } from '../data/levels.js';
import { ASSETS } from '../data/assets.js';
import { t, locName, getLang } from '../data/i18n.js';

import { loadGLB, fitScale, fitHeight, characterBox, cloneSkinned, tuneMaterials } from './loaders.js';
import { initBoss, updateBoss, clearBossCast } from './boss.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { HUD } from '../ui/hud.js';
import { Panels } from '../ui/panels.js';

// ============================================================================
// GAME — orchestrates render, world, player, combat, enemies, FX and state.
// State is a plain object; the HUD/Panels read it and Game.refresh() re-syncs
// the DOM. All balancing lives in src/data/*, so this file is pure behavior.
// ============================================================================

export class Game {
  constructor(dom) {
    this.dom = dom; // { mount, flash, level, event, dash, low, hitDir, joyBase1, joyKnob1, joyBase2, joyKnob2 }
    this.settings = { ...CONFIG.model };
    this.WEAPONS = WEAPONS; this.BRANCHES = BRANCHES;
    this.audio = new Audio();
    this.hud = new HUD(this);
    this.panels = new Panels(this);
    // Touch mode is decided by the ACTIVE input, not mere capability — many
    // laptops report maxTouchPoints>0 yet are used with a mouse (which would
    // wrongly enable mobile auto-fire). Default off; a real touch flips it on.
    this._touchGuess = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches;

    this.state = this._freshState();
    this._dead = false;
    this._tut = false;
    this._tutSeen = false;

    this._waitThree();
    window.addEventListener('resize', this._onResize = () => this._resize());
  }

  _freshState() {
    return {
      started: false, ended: false, win: false, panel: 'none',
      level: 1, hp: 100, maxHp: CONFIG.player.baseMaxHp, xp: 0, xpToNext: CONFIG.progress.xpToNext,
      gold: 0, kills: 0, time: 0, skillPoints: 0, weapon: 'flare', ranks: {},
      dashCharges: 2, dashMax: 2, objectiveKey: 'obj.coreA', cores: 0,
      prompt: null, promptKey: 'E', bossActive: false, bossHp: 0, bossMax: 1, bossName: '',
      owned: { flare: true }, tutorial: false,
    };
  }

  refresh() { this.hud.sync(); this.panels.sync(); }
  _mods() { return computeModifiers(this.state.ranks); }
  get isTouch() { return this.input ? this.input.isTouch : this._touchGuess; }

  // ---------- boot ----------
  _waitThree() { if (this._dead) return; if (this.dom.mount) this._init(); else this._waitT = setTimeout(() => this._waitThree(), 60); }

  dispose() {
    this._dead = true; clearTimeout(this._waitT); cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this.input && this.input.dispose();
  }

  // ---------- init ----------
  _init() {
    const mount = this.dom.mount;
    while (mount.firstChild) mount.removeChild(mount.firstChild);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080b11);
    scene.fog = new THREE.Fog(0x080b11, 60, 120);

    const cam = new THREE.PerspectiveCamera(CONFIG.render.fov, mount.clientWidth / mount.clientHeight, 0.1, 300);
    this.baseFov = CONFIG.render.fov;
    this.camOff = new THREE.Vector3(...CONFIG.render.camOffset);

    const rend = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    rend.setPixelRatio(Math.min(CONFIG.render.pixelRatioCap, devicePixelRatio));
    rend.setSize(mount.clientWidth, mount.clientHeight);
    rend.shadowMap.enabled = true; rend.shadowMap.type = THREE.PCFSoftShadowMap;
    rend.toneMapping = THREE.ACESFilmicToneMapping; rend.toneMappingExposure = 1.25;
    rend.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(rend.domElement);

    scene.add(new THREE.HemisphereLight(0x5878a0, 0x0a0e14, 0.5));
    const dir = new THREE.DirectionalLight(0xdfeeff, 1.4);
    dir.position.set(20, 44, 12); dir.castShadow = true; dir.shadow.mapSize.set(1024, 1024); // 1k is plenty top-down; 2k is a big perf cost
    const sc = dir.shadow.camera; sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.far = 150;
    scene.add(dir);
    const rim = new THREE.PointLight(0x35e0d0, 0.5, 18); rim.position.set(0, 5, 0); scene.add(rim); this.rim = rim;

    this.scene = scene; this.cam = cam; this.rend = rend;

    // bloom post
    const comp = new EffectComposer(rend);
    comp.addPass(new RenderPass(scene, cam));
    const bloom = new UnrealBloomPass(new THREE.Vector2(mount.clientWidth, mount.clientHeight), CONFIG.render.bloom, 0.7, 0.85);
    this.bloom = bloom; comp.addPass(bloom); comp.addPass(new OutputPass()); this.composer = comp;

    this.enemies = []; this.bullets = []; this.enemyBullets = []; this.orbs = []; this.coins = []; this.parts = []; this.ghosts = []; this.fxSprites = [];
    this.aim = new THREE.Vector3(0, 0, 1); this.face = 0;
    this.vel = new THREE.Vector3(); this.ray = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.clock = new THREE.Clock();
    this.fx = { shake: 0, freeze: 0, tScale: 1, tTarget: 1, fov: 0, muzzle: 0, dashT: 0, iframe: 0, dashDir: new THREE.Vector3(), recoil: 0, hitPunch: 0, camKick: new THREE.Vector3() };

    this._iconTex = {};
    this.mapId = 'main';
    this._buildWorld();
    this._buildPlayer();
    this._bindInput();

    // async asset loads (game is playable immediately with primitives)
    this._loadPlayerModel();
    this._loadEnemyModels();
    this._loadWeaponModels();
    this._loadEffectModels();
    this._loadMap();

    this.game = { fireT: 0, spawnT: CONFIG.spawn.firstDelay, hurtT: 0, hudT: 0, ghostT: 0, grace: CONFIG.spawn.grace };
    this.refresh();
    // Dismiss the loading screen as soon as the scene is built — the start
    // overlay covers the canvas, so we never wait on the first rAF frame
    // (which can be throttled in a backgrounded tab).
    this.hud.hideLoading();
    this._loop();
  }

  _resize() {
    if (!this.rend) return;
    const m = this.dom.mount;
    this.cam.aspect = m.clientWidth / m.clientHeight; this.cam.updateProjectionMatrix();
    this.rend.setSize(m.clientWidth, m.clientHeight);
    this.composer.setSize(m.clientWidth, m.clientHeight);
    this.bloom.setSize(m.clientWidth, m.clientHeight);
  }

  // ---------- level data ----------
  // Always the current map's level (a GLB may or may not be loaded under it).
  _levelData() { return (MAPS[this.mapId] || { build: arenaLevel }).build(); }

  // ---------- world ----------
  _buildWorld() {
    const L = this._levelData(); this.L = L; this.obstacles = []; this.interact = [];
    if (this.worldG) this.scene.remove(this.worldG);
    const g = new THREE.Group(); this.worldG = g; this.scene.add(g);

    // Procedural props: full ground for a modelless level, or a readable arena
    // floor/grid/pillars laid over a backdrop map (L.arena).
    if (!this.map || L.arena) {
      const accent = L.accent || 0x35e0d0;
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(L.B * 2 + 4, L.B * 2 + 4),
        new THREE.MeshStandardMaterial({ color: L.floorColor || 0x0c141d, roughness: 1, metalness: 0.1 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = L.arena ? 0.01 : 0; floor.receiveShadow = true; g.add(floor);
      const grid = new THREE.GridHelper(L.B * 2, 52, L.gridColor1 || 0x1f3d4c, L.gridColor2 || 0x14232e); grid.position.y = 0.03; g.add(grid);
      const wmat = new THREE.MeshStandardMaterial({ color: 0x1a2836, roughness: 0.7, metalness: 0.35, emissive: 0x0a1a22, emissiveIntensity: 0.4 });
      const emat = new THREE.MeshStandardMaterial({ color: 0x35e0d0, emissive: 0x35e0d0, emissiveIntensity: 1.4, transparent: true, opacity: 0.5 });
      L.walls.forEach((w) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w.w, w.h, w.d), wmat);
        m.position.set(w.x, w.h / 2, w.z); m.castShadow = true; m.receiveShadow = true; g.add(m);
        const t = new THREE.Mesh(new THREE.BoxGeometry(w.w + 0.05, 0.12, w.d + 0.05), emat); t.position.set(w.x, w.h, w.z); g.add(t);
        this.obstacles.push({ x: w.x, z: w.z, hw: w.w / 2, hd: w.d / 2, env: true });
      });
      L.covers.forEach(([x, z]) => {
        if (L.arena) { // glowing accent pillar
          const h = 3.4, m = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, h, 6), new THREE.MeshStandardMaterial({ color: 0x141c28, emissive: accent, emissiveIntensity: 0.5, roughness: 0.5, metalness: 0.5 }));
          m.position.set(x, h / 2, z); m.castShadow = true; g.add(m);
          const cap = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.09, 8, 18), new THREE.MeshBasicMaterial({ color: accent })); cap.rotation.x = Math.PI / 2; cap.position.set(x, h, z); g.add(cap);
          this.obstacles.push({ x, z, hw: 1.1, hd: 1.1, env: true });
        } else {
          const m = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), new THREE.MeshStandardMaterial({ color: 0x223140, roughness: 0.6, metalness: 0.4 }));
          m.position.set(x, 1, z); m.castShadow = true; g.add(m); this.obstacles.push({ x, z, hw: 1.5, hd: 1.5, env: true });
        }
      });
      L.platforms.forEach((p) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), new THREE.MeshStandardMaterial({ color: 0x16222e, roughness: 0.8, metalness: 0.3 }));
        m.position.set(p.x, p.h / 2, p.z); m.receiveShadow = true; g.add(m);
      });
      // glowing lava moat ringing the arena edge (theme + readable boundary)
      if (L.lavaRing) {
        const col = L.edgeColor || 0xff5a1e;
        const bx = (L.bounds ? L.bounds.hx : L.B), bz = (L.bounds ? L.bounds.hz : L.B);
        const edge = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.08, z); g.add(m); };
        const t = 5;
        edge(bx * 2 + t * 2, t, 0, -bz - t / 2); edge(bx * 2 + t * 2, t, 0, bz + t / 2);
        edge(t, bz * 2, -bx - t / 2, 0); edge(t, bz * 2, bx + t / 2, 0);
        const gl = new THREE.PointLight(col, 1.0, 80); gl.position.set(0, 3, 0); g.add(gl);
      }
    }
    // Map-mesh collision harvest is opt-in (L.harvest): these town GLBs are a
    // single combined mesh, so harvesting yields meaningless blanket colliders.
    // Buildings act as backdrop; cover comes from level `covers` data + bounds.
    if (this.map && L.harvest) this._harvestMapCollision();

    // security gate (optional)
    this.gate = null; this._gateObs = null; this.gateOpen = true;
    if (L.gate) {
      const gmat = new THREE.MeshStandardMaterial({ color: 0xff3b6b, emissive: 0xff3b6b, emissiveIntensity: 1.1, transparent: true, opacity: 0.72 });
      const gAcross = L.gate.across, gw = L.gate.w;
      const gate = new THREE.Mesh(new THREE.BoxGeometry(gAcross ? 1.4 : gw, 4, gAcross ? gw : 1.4), gmat);
      gate.position.set(L.gate.x, 2, L.gate.z); g.add(gate); this.gate = gate; this.gateOpen = false;
      this.obstacles.push(this._gateObs = { x: L.gate.x, z: L.gate.z, hw: gAcross ? 0.7 : gw / 2, hd: gAcross ? gw / 2 : 0.7 });
    }

    // data cores (optional)
    (L.cores || []).forEach((c, i) => {
      const grp = new THREE.Group(); grp.position.set(c.x, 0, c.z);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x1a2836, metalness: 0.5, roughness: 0.5 }));
      base.position.y = 0.25; base.castShadow = true; grp.add(base);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x35e0d0, emissive: 0x35e0d0, emissiveIntensity: 0.85 }));
      cyl.position.y = 1.7; grp.add(cyl);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.08, 8, 24), new THREE.MeshBasicMaterial({ color: 0x35e0d0 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 1.2; grp.add(ring);
      // floating "interact here" beacon: ground ring + light column + hovering marker
      const gring = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.75, 36), new THREE.MeshBasicMaterial({ color: 0x35e0d0, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
      gring.rotation.x = -Math.PI / 2; gring.position.y = 0.06; grp.add(gring);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.6, 6), new THREE.MeshBasicMaterial({ color: 0x35e0d0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
      col.position.y = 2.3; grp.add(col);
      const mark = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshBasicMaterial({ color: 0x7ff2e8 }));
      mark.position.y = 4.4; grp.add(mark);
      g.add(grp); this.obstacles.push({ x: c.x, z: c.z, hw: 1.6, hd: 1.6 });
      this.interact.push({ type: 'core', id: 'Core ' + (i ? 'B' : 'A'), x: c.x, z: c.z, r: 3.6, done: false, mesh: grp, glow: cyl, ring, gring, mark, active: true });
    });

    // glowing map-transition portal (hidden until unlocked)
    this.portalObj = null;
    if (L.portal) {
      const pg = this._makePortal(L.portal, 0x35e0d0); pg.visible = false; g.add(pg); this.portalObj = pg;
      this.interact.push({ type: 'portal', id: 'Portal', to: L.portal.to, x: L.portal.x, z: L.portal.z, r: 3.4, done: false, active: false, mesh: pg });
    }

    // loot crates
    L.crates.forEach(([x, z]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshStandardMaterial({ color: 0x2a3a2a, emissive: 0x1a3a1a, emissiveIntensity: 0.4, roughness: 0.6, metalness: 0.3 }));
      m.position.set(x, 0.8, z); m.castShadow = true; g.add(m);
      this.obstacles.push({ x, z, hw: 0.8, hd: 0.8 }); this.interact.push({ type: 'crate', id: 'Salvage', x, z, r: 2.6, done: false, mesh: m, active: true });
    });

    // safe-zone ring
    if (L.safe) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(L.safe.r - 0.5, L.safe.r, 48), new THREE.MeshBasicMaterial({ color: 0x35e0d0, transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(L.safe.x, 0.04, L.safe.z); g.add(ring);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(L.safe.r, 48), new THREE.MeshBasicMaterial({ color: 0x0e2a2e, transparent: true, opacity: 0.28 }));
      disc.rotation.x = -Math.PI / 2; disc.position.set(L.safe.x, 0.03, L.safe.z); g.add(disc);
    }
    this.itemDrops = [];
  }

  _iconTexture(glyph, color) {
    const key = glyph + color; if (this._iconTex[key]) return this._iconTex[key];
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
    x.clearRect(0, 0, 128, 128); x.beginPath(); x.arc(64, 64, 58, 0, 7); x.fillStyle = 'rgba(10,14,20,.9)'; x.fill();
    x.lineWidth = 7; x.strokeStyle = color; x.stroke();
    x.fillStyle = color; x.font = 'bold 66px Chakra Petch, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(glyph, 64, 70);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; this._iconTex[key] = tex; return tex;
  }

  _spawnItemDrop(pos, kind) {
    const conf = { weapon: { glyph: '✦', color: '#ffd23f' }, health: { glyph: '✚', color: '#59ff9d' }, scrap: { glyph: '◈', color: '#ffb03b' } }[kind] || { glyph: '✦', color: '#ffd23f' };
    const grp = new THREE.Group(); grp.position.set(pos.x, 0, pos.z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.1, 10, 28), new THREE.MeshStandardMaterial({ color: conf.color, emissive: conf.color, emissiveIntensity: 1.4 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 1.1; grp.add(ring);
    const icon = new THREE.Mesh(new THREE.CircleGeometry(0.62, 28), new THREE.MeshBasicMaterial({ map: this._iconTexture(conf.glyph, conf.color), transparent: true, side: THREE.DoubleSide }));
    icon.position.y = 1.1; grp.add(icon);
    const icon2 = icon.clone(); icon2.rotation.y = Math.PI; grp.add(icon2);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.2, 8), new THREE.MeshBasicMaterial({ color: conf.color, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.y = 1.1; grp.add(beam);
    grp.userData = { kind, ring, icon, icon2, x: pos.x, z: pos.z, life: 22, ph: Math.random() * 6 };
    this.worldG.add(grp); this.itemDrops.push(grp);
  }

  // Glowing map-transition / extraction portal (Duckcoop-style).
  _makePortal(pos, color) {
    const grp = new THREE.Group(); grp.position.set(pos.x, 0, pos.z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.26, 14, 44), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.9, metalness: 0.4, roughness: 0.3 }));
    ring.position.y = 2.5; grp.add(ring);
    const swirl = new THREE.Mesh(new THREE.CircleGeometry(2.0, 44), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.34, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    swirl.position.y = 2.5; grp.add(swirl); const swirl2 = swirl.clone(); swirl2.rotation.y = Math.PI; grp.add(swirl2);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 6, 28, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.y = 3; grp.add(beam);
    const base = new THREE.Mesh(new THREE.CircleGeometry(2.4, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, side: THREE.DoubleSide }));
    base.rotation.x = -Math.PI / 2; base.position.y = 0.05; grp.add(base);
    const light = new THREE.PointLight(color, 2.4, 16); light.position.y = 2.5; grp.add(light);
    grp.userData = { ring, swirl, swirl2, light, base, ph: 0 };
    return grp;
  }

  // ---------- player ----------
  _buildPlayer() {
    if (this.player) this.scene.remove(this.player);
    const p = new THREE.Group();
    const aimG = new THREE.Group(); p.add(aimG); this.aimGroup = aimG;
    const faceG = new THREE.Group(); p.add(faceG); this.faceGroup = faceG;
    this.core = null; p.userData.body = null; this.gun = null; this.mixer = null; this.idleAction = null; this.runAction = null;

    const useModel = this.settings.useModel && this.chicken && this.chickenModel;
    if (useModel) {
      if (this.chickenModel.parent) this.chickenModel.parent.remove(this.chickenModel);
      faceG.add(this.chickenModel);
      this.mixer = new THREE.AnimationMixer(this.chickenModel);
      // Pick sensible idle/run clips by name (models label them differently),
      // falling back to the first two clips.
      const clips = this.chicken.clips;
      const pick = (re, def) => clips.find((c) => re.test(c.name)) || def;
      const idleClip = pick(/idle|fly(?!_start)|breath|hover|stand/i, clips[0]);
      const runClip = pick(/run|walk|move|boost|fly/i, clips[1] || clips[0]);
      if (idleClip) { this.idleAction = this.mixer.clipAction(idleClip); this.idleAction.play(); this.idleAction.setEffectiveWeight(1); }
      if (runClip && runClip !== idleClip) { this.runAction = this.mixer.clipAction(runClip); this.runAction.play(); this.runAction.setEffectiveWeight(0); }
      this.chicken.fit = null;
    } else {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 1, 6, 12), new THREE.MeshStandardMaterial({ color: 0x123038, emissive: 0x0e3030, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.5 }));
      body.position.y = 1.1; body.castShadow = true; faceG.add(body); p.userData.body = body;
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 16), new THREE.MeshStandardMaterial({ color: 0x9ffcf0, emissive: 0x35e0d0, emissiveIntensity: 2.4 }));
      core.position.y = 1.4; faceG.add(core); this.core = core;
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 1.6), new THREE.MeshStandardMaterial({ color: 0xdfeef6, emissive: 0x35e0d0, emissiveIntensity: 0.5, metalness: 0.7, roughness: 0.3 }));
      gun.position.set(0, 1.05, 0.95); aimG.add(gun); this.gun = gun;
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 4), new THREE.MeshBasicMaterial({ color: 0x7ff2e8 }));
      fin.rotation.x = Math.PI / 2; fin.position.set(0, 1.05, 1.9); aimG.add(fin);
    }
    // character ground indicator (always shows where the player is)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x35e0d0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.98, 32), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.renderOrder = 2; p.add(ring); this.playerRing = ring;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 3), new THREE.MeshBasicMaterial({ color: 0x7ff2e8, transparent: true, opacity: 0.9, depthWrite: false }));
    arrow.rotation.x = Math.PI / 2; arrow.position.set(0, 0.07, 1.15); aimG.add(arrow); this.aimArrow = arrow; // points where you aim

    const sp = (this.L && this.L.spawnStart) ? this.L.spawnStart : { x: 0, z: 34 };
    p.position.set(sp.x, 0, sp.z); this.scene.add(p); this.player = p;

    this.muzzle = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.muzzle.rotation.x = -Math.PI / 2; aimG.add(this.muzzle); this.muzzle.position.set(0, 1.05, 2.1);
    this.gunLight = new THREE.PointLight(0x7ff2e8, 0, 10); this.gunLight.position.set(0, 1.2, 1.6); aimG.add(this.gunLight);

    if (this.mixer && this.chickenModel && !this.chicken.fit) this._calibrateHero();
    this._attachGun(this.state.weapon);
  }

  // Size the hero to CONFIG.player.height and plant its feet on the ground.
  // Skinned meshes must be measured via SKELETON BONES — their geometry
  // bounding box is the collapsed bind pose, not the animated silhouette, so a
  // mesh-bbox fit blows the scale up. Static meshes use the mesh bbox.
  _calibrateHero() {
    const wrap = this.chickenModel, inner = wrap.children[0];
    const target = CONFIG.player.height || 1.6;
    inner.scale.setScalar(1); inner.position.set(0, 0, 0);
    if (this.mixer) this.mixer.update(0.1);
    wrap.updateWorldMatrix(true, true);
    let sk = null; wrap.traverse((o) => { if (o.isSkinnedMesh) sk = o; });
    if (sk && sk.skeleton) {
      const measure = () => { const b = new THREE.Box3(), v = new THREE.Vector3(); sk.skeleton.bones.forEach((bo) => { bo.getWorldPosition(v); b.expandByPoint(wrap.worldToLocal(v.clone())); }); return b; };
      let b = measure(); const sz = new THREE.Vector3(); b.getSize(sz);
      const fit = target / (sz.y || 1); inner.scale.setScalar(fit);
      wrap.updateWorldMatrix(true, true);
      b = measure(); const ctr = new THREE.Vector3(); b.getCenter(ctr);
      inner.position.x -= ctr.x; inner.position.z -= ctr.z; inner.position.y -= b.min.y;
      this.chicken.fit = fit;
    } else {
      let b = new THREE.Box3().setFromObject(inner); const sz = new THREE.Vector3(); b.getSize(sz);
      const fit = target / (sz.y || 1); inner.scale.setScalar(fit);
      wrap.updateWorldMatrix(true, true);
      b = new THREE.Box3().setFromObject(inner); const ctr = new THREE.Vector3(); b.getCenter(ctr);
      inner.position.x -= ctr.x; inner.position.z -= ctr.z; inner.position.y -= b.min.y;
      this.chicken.fit = fit;
    }
  }

  // ---------- async model loads ----------
  async _loadPlayerModel() {
    if (this.chicken) return;
    const g = await loadGLB(ASSETS.player); if (!g || this._dead) return;
    tuneMaterials(g.scene, { metalness: 0.3 });
    const wrap = new THREE.Group(); wrap.add(g.scene);
    this.chickenModel = wrap; this.chicken = { clips: g.animations, fit: null };
    if (this.player) this._buildPlayer();
  }

  async _loadEnemyModels() {
    if (this.enemyModels) return; this.enemyModels = {};
    const wanted = {};
    ENEMY_TIERS.forEach((tier) => { wanted[tier.model] = ASSETS.enemyModels[tier.model]; });
    BOSSES.forEach((b) => { wanted[b.model] = ASSETS.enemyModels[b.model]; });
    for (const [key, url] of Object.entries(wanted)) {
      const g = await loadGLB(url); if (this._dead) return; if (!g) continue;
      tuneMaterials(g.scene, { metalness: 0.3, shadow: false }); // no shadow-cast: cheaper with many skinned mobs
      this.enemyModels[key] = { scene: g.scene, clips: g.animations, fit: fitHeight(g.scene, 1.4) };
    }
  }

  async _loadWeaponModels() {
    if (this.weaponModels) return; this.weaponModels = {};
    const lens = { flare: 1.15, nerf: 1.4, laser: 1.25, space: 1.5, water: 1.2 };
    for (const [key, url] of Object.entries(ASSETS.weaponModels)) {
      const g = await loadGLB(url); if (this._dead) return; if (!g) continue;
      tuneMaterials(g.scene, { metalness: 0.65 });
      this.weaponModels[key] = { scene: g.scene, fit: fitScale(g.scene, lens[key] || 1.25) };
      this._gunWrap(key); // pre-clone/center now so weapon swaps never hitch
      if (this.aimGroup && this.chicken) this._attachGun(this.state.weapon);
    }
  }

  async _loadEffectModels() {
    if (this.fxModels) return; this.fxModels = {};
    const lens = { bolt: 5.5, storm: 11 };
    for (const [key, url] of Object.entries(ASSETS.fxModels)) {
      const g = await loadGLB(url); if (this._dead) return; if (!g) continue;
      tuneMaterials(g.scene, { additive: true, shadow: false });
      this.fxModels[key] = { scene: g.scene, clips: g.animations, fit: fitScale(g.scene, lens[key] || 5) };
    }
  }

  // Initial map setup on boot. A map may be a pure procedural arena (model:null)
  // or have a decorative GLB backdrop.
  async _loadMap() {
    if (this._mapReady) return; this._mapReady = true;
    const entry = MAPS[this.mapId], level = entry.build();
    if (entry.model) await this._loadMapModel(entry.model, level); else this._applyLevelEnv(level);
    if (this._dead) return;
    this._buildWorld();
    if (this.player) { const sp = level.spawnStart || { x: 0, z: 0 }; this.player.position.set(sp.x, 0, sp.z); }
  }

  // Fog / background / light for a modelless arena.
  _applyLevelEnv(level) {
    if (level.fog) this.scene.fog = new THREE.Fog(level.fog.color, level.fog.near, level.fog.far);
    if (level.bg != null) this.scene.background = new THREE.Color(level.bg);
    if (level.light) this.scene.traverse((o) => { if (o.isHemisphereLight) o.intensity = level.light.hemi; if (o.isDirectionalLight) o.intensity = level.light.dir; });
  }

  // Load a map GLB and fit it to the play area. These town GLBs are one combined
  // mesh + a huge flat ground/lava plane; fitting to the full bbox shrinks the
  // buildings to nothing. We compute the BUILDING bbox by excluding the big flat
  // ground pieces (large footprint + low height), then scale/center on that so
  // the town fills the bounds. `level.mapFit.scale` (+off/groundY/yaw) overrides
  // the auto-fit for hand-tuned maps.
  async _loadMapModel(url, level) {
    const g = await loadGLB(url); if (!g || this._dead) return null;
    const m = g.scene;
    m.traverse((o) => {
      if (!o.isMesh) return;
      if (/Invisible|collider|collision/i.test(o.name)) { o.visible = false; o.castShadow = false; o.receiveShadow = false; return; }
      o.receiveShadow = true; o.castShadow = true;
      if (o.material) o.material.metalness = Math.min(o.material.metalness ?? 0, 0.2);
    });
    const fit = level.mapFit || {};
    m.scale.setScalar(1); m.position.set(0, 0, 0); if (fit.yaw) m.rotation.y = fit.yaw * Math.PI / 180; m.updateWorldMatrix(true, true);

    // full bbox + per-mesh boxes at scale 1
    const full = new THREE.Box3(), parts = []; const s = new THREE.Vector3();
    m.traverse((o) => { if (!o.isMesh) return; const b = new THREE.Box3().setFromObject(o); parts.push(b); full.union(b); });
    full.getSize(s); const fullFoot = Math.max(1, s.x * s.z);
    // building bbox = union of parts that are NOT big flat ground planes
    const bld = new THREE.Box3(), ps = new THREE.Vector3();
    parts.forEach((b) => { b.getSize(ps); const foot = ps.x * ps.z; if (ps.y < 3.5 && foot > 0.18 * fullFoot) return; bld.union(b); });
    const box = bld.isEmpty() ? full : bld;
    box.getSize(ps);

    const scale = fit.scale != null ? fit.scale : (level.B * 2 * (fit.fill ?? 1.15)) / Math.max(ps.x, ps.z || 1);
    m.scale.setScalar(scale); m.updateWorldMatrix(true, true);
    if (fit.center) {
      // hand-tuned: place a known model-space center/floor exactly at the origin
      m.position.set(-fit.center.x * scale + (fit.offX || 0), -(fit.minY ?? 0) * scale + (fit.groundY || 0), -fit.center.z * scale + (fit.offZ || 0));
    } else {
      // auto: recenter/ground on the (scaled) building box
      const box2 = new THREE.Box3(); const c = new THREE.Vector3();
      m.traverse((o) => { if (!o.isMesh) return; const b = new THREE.Box3().setFromObject(o); const sz2 = new THREE.Vector3(); b.getSize(sz2); const foot = sz2.x * sz2.z; if (sz2.y < 3.5 * scale && foot > 0.18 * fullFoot * scale * scale) return; box2.union(b); });
      const target = box2.isEmpty() ? new THREE.Box3().setFromObject(m) : box2;
      target.getCenter(c); m.position.x -= c.x - (fit.offX || 0); m.position.z -= c.z - (fit.offZ || 0); m.position.y -= target.min.y + (fit.groundY || 0);
    }
    this.map = m; this.scene.add(m);
    this._applyLevelEnv(level);
    return m;
  }

  _harvestMapCollision() {
    if (!this.map) return; this.map.updateWorldMatrix(true, true);
    const hz = this.L.bounds ? this.L.bounds.hz : this.L.B;
    this.map.traverse((o) => {
      if (!o.isMesh) return;
      if (/Lava|Invisible|sand|ground|floor|road|street/i.test(o.name)) return;
      const b = new THREE.Box3().setFromObject(o); const s = new THREE.Vector3(); b.getSize(s); const c = new THREE.Vector3(); b.getCenter(c);
      if (s.y < 1.2) return; if (Math.abs(c.z) > hz + 3) return;
      // Skip oversized footprints — those are terrain/base slabs, not walls, and
      // would otherwise blanket the play area with an invisible collider.
      if (s.x > 14 || s.z > 14) return;
      this.obstacles.push({ x: c.x, z: c.z, hw: Math.max(0.6, s.x / 2 * 0.82), hd: Math.max(0.6, s.z / 2 * 0.82), env: true });
    });
  }

  // ---------- weapon attach ----------
  // Gun wraps are cloned + centered ONCE and cached per model key, so swapping
  // or picking up a weapon just re-parents an existing group (no per-pickup
  // clone → no frame hitch).
  _gunWrap(mk) {
    this._gunCache = this._gunCache || {};
    if (this._gunCache[mk]) return this._gunCache[mk];
    const rec = this.weaponModels && this.weaponModels[mk]; if (!rec) return null;
    const wrap = new THREE.Group(); const inst = rec.scene.clone(true); inst.scale.setScalar(rec.fit);
    const b = new THREE.Box3().setFromObject(inst); const c = new THREE.Vector3(); b.getCenter(c); inst.position.sub(c);
    wrap.add(inst); wrap.position.set(0.34, 0.82, 0.62);
    this._gunCache[mk] = wrap; return wrap;
  }
  _attachGun(wk) {
    if (this.game) { this.game.heat = 0; this.game.heatLock = false; } // reset overheat on swap
    if (!this.aimGroup) return;
    if (this.gunModel) { this.aimGroup.remove(this.gunModel); this.gunModel = null; }
    if (!this.settings.useModel || !this.chicken) return; // primitive box gun stays
    const wrap = this._gunWrap(WEAPON_MODEL_MAP[wk]); if (!wrap) return;
    wrap.rotation.y = this.settings.gunYaw * Math.PI / 180;
    this.aimGroup.add(wrap); this.gunModel = wrap;
  }

  // ---------- input wiring ----------
  _bindInput() {
    this.input = new Input(this.rend.domElement, {
      base1: this.dom.joyBase1, knob1: this.dom.joyKnob1, base2: this.dom.joyBase2, knob2: this.dom.joyKnob2,
    }, { onDash: () => this._dash(), onWeapon: (i) => this.selectWeaponSlot(i), onCycle: () => this.cycleWeapon(1), onMode: () => this.refresh(), onPause: () => this.togglePause() });
  }

  _dash() {
    if (!this.state.started || this.state.ended || this.state.panel !== 'none') return;
    if (this.state.dashCharges <= 0 || this.fx.dashT > 0) return;
    const mv = this.input.moveVector(); let dx = mv.x, dz = mv.z;
    if (Math.abs(dx) < 0.01 && Math.abs(dz) < 0.01) { dx = this.aim.x; dz = this.aim.z; }
    const l = Math.hypot(dx, dz) || 1; this.fx.dashDir.set(dx / l, 0, dz / l);
    this.fx.dashT = CONFIG.player.dashTime; this.fx.iframe = CONFIG.player.iframe;
    this.fx.fov = 8; this.fx.tTarget = 0.5; this.fx.shake = Math.min(1, this.fx.shake + 0.3);
    this.state.dashCharges--; this._pulse(this.dom.dash, 0.6, 180);
    if (this._tut && this.tut.step === 2) this._tutAdvance();
    setTimeout(() => { this.fx.tTarget = 1; }, 130);
    this.refresh();
  }

  // Seconds to channel each interaction (hold E / USE to fill the gauge).
  _channelTime(it) { return { core: 1.6, crate: 0.9, portal: 0.7, extract: 0.7 }[it.type] || 1; }

  // Drive the channel each frame from held input; fires _completeInteract at 100%.
  _updateChannel(dt) {
    const it = this._nearestInteract();
    const held = (this.input && this.input.useHeld) || this._touchUseHeld;
    let frac = 0;
    if (it && held) {
      if (this.game.channelIt !== it) { this.game.channel = 0; this.game.channelIt = it; }
      this.game.channel = (this.game.channel || 0) + dt / this._channelTime(it);
      if (this.game.channel >= 1) { this.game.channel = 0; this.game.channelIt = null; this._completeInteract(it); return; }
      frac = this.game.channel;
    } else { this.game.channel = 0; this.game.channelIt = null; }
    const key = it ? { core: 'prompt.core', crate: 'prompt.crate', extract: 'prompt.extract', portal: 'prompt.portal' }[it.type] : null;
    if (key !== this.state.prompt || Math.abs((this.state.channelFrac || 0) - frac) > 0.001) {
      this.state.prompt = key; this.state.channelFrac = frac; this.hud.syncPrompt();
    }
  }

  _completeInteract(it) {
    if (it.type === 'core' && !it.done) {
      it.done = true; it.glow.material.color.set(0x59ff9d); it.glow.material.emissive.set(0x59ff9d); it.ring.material.color.set(0x59ff9d);
      if (it.mark) it.mark.visible = false; if (it.gring) it.gring.visible = false;
      this.state.cores++; this._impact(it.mesh.position, 0x59ff9d, 20, 7); this.fx.shake = 0.5; this._event(t('evt.breached', { id: it.id })); this.audio.levelUp();
      const need = (this.L.cores || []).length;
      if (this.state.cores >= need) { this._activatePortal(); }
      else { this.state.objectiveKey = 'obj.coreB'; }
    } else if (it.type === 'crate' && !it.done) {
      it.done = true; it.mesh.visible = false; const o = this.obstacles.find((x) => x.x === it.x && x.z === it.z); if (o) o.dead = true;
      this._impact(it.mesh.position, 0x59ff9d, 14, 5); this.fx.shake = 0.25; this.audio.pickup();
      const md = this._mods(); this.state.gold += Math.ceil((8 + Math.random() * 10) * md.gold); this._gainXp(6 * md.xp); this._event(t('evt.salvage'));
    } else if (it.type === 'portal' && it.active) { this._enterPortal(it.to);
    } else if (it.type === 'extract' && it.active) { this._win(); }
    this.refresh();
  }

  // Reveal the boss-map portal once the town cores are breached.
  _activatePortal() {
    const p = this.interact.find((x) => x.type === 'portal'); if (!p) return;
    p.active = true; p.mesh.visible = true; this.state.objectiveKey = 'obj.portal';
    this._event(t('evt.portal')); this.fx.shake = 0.6; this.audio.levelUp();
  }

  // Fade-through map transition to the target map id (Duckcoop-style portal).
  async _enterPortal(to) {
    if (this._transitioning) return; this._transitioning = true;
    this.audio.ui(); this._fade(1, 260);
    if (this.dom.trans) this.dom.trans.style.display = 'grid';
    await new Promise((r) => setTimeout(r, 300));
    // clear all transient entities + their hp bars
    this.enemies.forEach((e) => { if (e.userData.boss) clearBossCast(this, e); if (e.userData.hpBar) this.scene.remove(e.userData.hpBar); });
    for (const arr of [this.enemies, this.bullets, this.enemyBullets, this.orbs, this.coins, this.parts, this.ghosts, this.fxSprites, this.itemDrops || []]) {
      arr.forEach((o) => { if (o.parent) o.parent.remove(o); else this.scene.remove(o); }); arr.length = 0;
    }
    this.boss = null; this.state.bossActive = false; this.hud.hideCast();
    if (this.map) { this.scene.remove(this.map); this.map = null; }
    this.mapId = to;
    const entry = MAPS[to], level = entry.build();
    if (entry.model) await this._loadMapModel(entry.model, level); else this._applyLevelEnv(level);
    this._buildWorld(); this._buildPlayer();
    if (level.boss) { this.state.objectiveKey = 'obj.boss'; this.game.grace = 2.5; this._spawnBoss(); }
    this.game.spawnT = 2.5;
    await new Promise((r) => setTimeout(r, 350)); // let the new map settle a beat
    if (this.dom.trans) this.dom.trans.style.display = 'none';
    this._fade(0, 500);
    this._transitioning = false; this.refresh();
  }

  _fade(to, ms) { const el = this.dom.fade; if (!el) return; el.style.transition = `opacity ${ms}ms`; el.style.opacity = to; }

  // Reload the main map after a run that ended on the boss map (async).
  async _reloadMain() {
    const entry = MAPS.main, level = entry.build();
    if (entry.model) await this._loadMapModel(entry.model, level); else this._applyLevelEnv(level);
    if (this._dead) return;
    this._buildWorld(); this._buildPlayer();
    if (this.player) { const sp = level.spawnStart; this.player.position.set(sp.x, 0, sp.z); }
  }

  // Spawn the green extraction portal after the boss dies on the boss map.
  _revealExtraction() {
    const pos = this.L.extractionAfterBoss || { x: 0, z: 34 };
    const pg = this._makePortal(pos, 0x59ff9d); this.worldG.add(pg); this.portalObj = pg;
    this.interact.push({ type: 'extract', id: 'Extraction', x: pos.x, z: pos.z, r: 3.6, done: false, active: true, mesh: pg });
    this.state.objectiveKey = 'obj.extract'; this._event(t('evt.extract')); this.fx.shake = 0.6;
  }

  // Floating enemy HP bar (billboarded, always-on-top). Boss uses the top bar.
  _makeHpBar(tint) {
    const w = 1.3, h = 0.16, grp = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.08, h + 0.08), new THREE.MeshBasicMaterial({ color: 0x0a0e14, transparent: true, opacity: 0.78, depthTest: false }));
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: tint, depthTest: false }));
    fill.position.z = 0.01; bg.renderOrder = 998; fill.renderOrder = 999;
    grp.add(bg); grp.add(fill); grp.visible = false; grp.userData = { w };
    return { group: grp, fill };
  }

  _collectItem(kind) {
    const md = this._mods();
    if (kind === 'weapon') {
      const key = WEAPON_DROP_ORDER.find((k) => !this.state.owned[k]);
      if (key) { this.state.owned = { ...this.state.owned, [key]: true }; if (this.state.weapon === 'flare') { this.state.weapon = key; this._attachGun(key); } this._event(t('evt.acquired', { name: locName(this.WEAPONS[key]) })); }
      else { this.state.gold += 30; this._event(t('evt.scrap30')); }
    } else if (kind === 'health') {
      this.state.hp = Math.min(this.state.maxHp + Math.round(md.hp), this.state.hp + CONFIG.drops.healAmount); this._event(t('evt.hull', { n: CONFIG.drops.healAmount }));
    } else { this.state.gold += Math.ceil(20 * md.gold); this._event(t('evt.scrap')); }
    this.audio.pickup(); this.fx.shake = Math.min(0.5, this.fx.shake + 0.06); // gentle, no seizure on magnet pickups
    if (this._tut && this.tut.step === 3) this._tutAdvance();
    this.refresh();
  }

  _nearestInteract() {
    let best = null, bd = 1e9;
    for (const it of this.interact) {
      if ((it.type === 'portal' || it.type === 'extract') && !it.active) continue;
      if (it.done && it.type !== 'extract' && it.type !== 'portal') continue;
      const d = Math.hypot(this.player.position.x - it.x, this.player.position.z - it.z);
      if (d < it.r && d < bd) { bd = d; best = it; }
    }
    return best;
  }

  // ---------- combat ----------
  // Build one projectile mesh from the weapon's data-driven `bullet` spec.
  _makeBullet(bt, a, dir, origin, col, crit) {
    let b;
    // NOTE: no per-bullet PointLight — dozens of dynamic lights from a fast
    // weapon tank the framerate. Emissive materials + bloom read as glow.
    if (bt.type === 'pellet') {
      b = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 12), new THREE.MeshStandardMaterial({ color: crit ? 0xffffff : 0xffd98a, emissive: 0xffb03b, emissiveIntensity: 2.6, roughness: 0.4 }));
    } else if (bt.type === 'orb') {
      const size = bt.size || 1.1;
      b = new THREE.Mesh(new THREE.SphereGeometry(size, 18, 18), new THREE.MeshStandardMaterial({ color: bt.color || '#1a1030', emissive: 0x2a1050, emissiveIntensity: 0.8, roughness: 0.25, metalness: 0.4 }));
      const halo = new THREE.Mesh(new THREE.SphereGeometry(size * 1.35, 14, 14), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
      b.add(halo);
    } else if (bt.type === 'beam') {
      b = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.2, 6), new THREE.MeshBasicMaterial({ color: crit ? 0xffffff : col }));
      b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    } else if (bt.type === 'drop') {
      const size = bt.size || 0.24;
      b = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 8), new THREE.MeshBasicMaterial({ color: crit ? 0xffffff : col, transparent: true, opacity: 0.9 }));
    } else { // bolt
      b = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.7, 6, 10), new THREE.MeshBasicMaterial({ color: col }));
      b.rotation.x = Math.PI / 2; b.rotation.z = -a; b.lookAt(origin.clone().add(dir));
    }
    b.position.copy(origin).add(dir.clone().multiplyScalar(1.4)); b.position.y = 1.05;
    return b;
  }

  _fire() {
    const wk = this.state.weapon, w = this.WEAPONS[wk], md = this._mods();
    // overheat: block firing while cooling down, accumulate heat while firing
    if (w.overheat) {
      this.game.heat = this.game.heat || 0;
      if (this.game.heatLock) return;
      this.game.heat += w.cd; if (this.game.heat >= w.overheat.max) { this.game.heatLock = true; this.game.heatT = w.overheat.cool; }
    }
    const origin = this.player.position.clone(); origin.y = 1.05;
    const base = this.face; const n = w.proj + md.multi; const bt = w.bullet || { type: 'bolt' };
    for (let i = 0; i < n; i++) {
      const spread = w.spread ? (w.spread * (i - (n - 1) / 2) / ((n - 1) / 2 || 1)) : ((i - (n - 1) / 2) * 0.05);
      const a = base + spread, dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const crit = Math.random() < md.crit, dmg = w.dmg * md.dmg * (crit ? 2.5 : 1);
      const col = crit ? 0xffffff : parseInt(w.color.slice(1), 16);
      const b = this._makeBullet(bt, a, dir, origin, col, crit);
      const spinny = bt.type === 'pellet';
      b.userData = { dir, vel: w.speed, dmg, pierce: w.pierce, life: 1.4 * md.range * (w.rangeMul || 1), hit: [], crit, col, flare: spinny, spin: spinny ? (Math.random() - 0.5) * 10 : 0 };
      this.scene.add(b); this.bullets.push(b);
    }
    this.game.fireT = w.cd / md.rate;
    this.fx.muzzle = bt.type === 'pellet' ? 0.09 : 0.06;
    this.gunLight.color.set(parseInt(w.color.slice(1), 16)); this.gunLight.intensity = bt.type === 'pellet' ? 2.8 : 2.2;
    if (bt.type === 'pellet') this._impact(origin.clone().add(new THREE.Vector3(this.aim.x, 0, this.aim.z).multiplyScalar(1.8)).setY(1.05), 0xffcf6a, 4, 3);
    const heavy = w.proj > 1 || bt.type === 'orb' || bt.type === 'pellet';
    this.fx.shake = Math.min(1, this.fx.shake + (heavy ? 0.12 : 0.05));
    // recoil: kick the gun back + nudge camera opposite the aim
    this.fx.recoil = Math.min(0.7, this.fx.recoil + (bt.type === 'orb' ? 0.7 : bt.type === 'pellet' ? 0.55 : bt.type === 'drop' ? 0.08 : 0.24));
    this.fx.camKick.addScaledVector(this.aim, -(bt.type === 'orb' ? 0.6 : heavy ? 0.42 : bt.type === 'drop' ? 0.06 : 0.24));
    this.audio.shoot(this.state.weapon);
    if (w.fx === 'lightning') { this.game._boltT = this.game._boltT || 0; if (this.state.time >= this.game._boltT) { this._lightningFX(); this.game._boltT = this.state.time + CONFIG.fx.boltInterval; } }
    if (this._tut && this.tut.step === 1) { this.tut.shots++; if (this.tut.shots >= 6) this._tutAdvance(); }
  }

  // ---------- enemies ----------
  _makeEnemyModel(key, scaleMul) {
    const rec = this.enemyModels && this.enemyModels[key]; if (!rec) return null;
    const wrap = new THREE.Group(); const inst = cloneSkinned(rec.scene); // skinned-safe clone
    inst.scale.setScalar(rec.fit * (scaleMul || 1));
    const b = characterBox(inst); const c = new THREE.Vector3(); b.getCenter(c);
    inst.position.x -= c.x; inst.position.z -= c.z; inst.position.y -= b.min.y;
    wrap.add(inst);
    let mixer = null;
    if (rec.clips.length) { mixer = new THREE.AnimationMixer(inst); mixer.clipAction(rec.clips[0]).play(); mixer.update(Math.random() * 2); }
    return { group: wrap, mixer };
  }

  _spawnEnemy() {
    const t = this.state.time;
    const sp = this.L.spawns[Math.floor(Math.random() * this.L.spawns.length)];
    const tier = pickTier(t, Math.random());
    const conf = ENEMY_TIERS[tier];
    let g, mixer = null, glbMesh = false;
    if (this.enemyModels && this.enemyModels[conf.model]) { const em = this._makeEnemyModel(conf.model, conf.modelMul); g = em.group; mixer = em.mixer; glbMesh = true; }
    else {
      g = new THREE.Group();
      const geo = conf.geo === 'tet' ? new THREE.TetrahedronGeometry(conf.s, 0) : conf.geo === 'box' ? new THREE.BoxGeometry(conf.s * 1.6, conf.s * 1.6, conf.s * 1.6) : new THREE.OctahedronGeometry(conf.s, 0);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: conf.c, emissive: conf.c, emissiveIntensity: 0.4, roughness: 0.5, metalness: 0.3 }));
      m.castShadow = true; m.position.y = conf.s + 0.35; g.add(m); g.userData.mesh = m;
    }
    g.position.set(sp[0], 0, sp[1]);
    const hp = conf.hp * (1 + t / CONFIG.spawn.hpScale);
    g.userData = Object.assign(g.userData || {}, {
      hp, maxHp: hp, spd: conf.spd, dmg: conf.dmg, r: conf.s + 0.35, tier,
      spin: (Math.random() - 0.5) * 3, mesh: glbMesh ? null : (g.userData.mesh || g.children[0]), mixer, glb: glbMesh, tint: conf.c,
      home: { x: sp[0], z: sp[1] }, aggro: true, sightR: conf.sight, ph: Math.random() * 6.28, lungeT: 0, atkT: 0,
      atkRange: conf.atkRange, windup: conf.windup, atkCd: conf.atkCd, ranged: !!conf.ranged, keep: conf.keep || 0, projSpeed: conf.projSpeed || 20, fireT: 0, windT: 0,
    });
    const hb = this._makeHpBar(conf.c); g.userData.hpBar = hb.group; g.userData.hpFill = hb.fill; g.userData.barY = tier === 2 ? 2.0 : 2.7;
    this.scene.add(hb.group);
    this.scene.add(g); this.enemies.push(g);
  }

  _spawnBoss() {
    const time = this.state.time;
    const def = BOSSES[Math.floor(Math.random() * BOSSES.length)]; // pick one of the two fights
    const sp = this.L.bossSpawn ? [this.L.bossSpawn.x, this.L.bossSpawn.z] : this.L.spawns[Math.floor(Math.random() * this.L.spawns.length)];
    let g, mixer = null, glb = false;
    if (this.enemyModels && this.enemyModels[def.model]) { const em = this._makeEnemyModel(def.model, def.modelMul); g = em.group; mixer = em.mixer; glb = true; }
    else { g = new THREE.Group(); const m = new THREE.Mesh(new THREE.IcosahedronGeometry(3.4, 0), new THREE.MeshStandardMaterial({ color: def.c, emissive: def.c, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.4 })); m.castShadow = true; m.position.y = 3.6; g.add(m); g.userData.mesh = m; }
    const bl = new THREE.PointLight(def.c, 2.4, 26); bl.position.set(0, 4, 0); g.add(bl);
    g.position.set(sp[0], 0, sp[1]);
    const hp = def.hp * (1 + time / CONFIG.spawn.dmgScaleBoss);
    g.userData = Object.assign(g.userData || {}, { hp, maxHp: hp, spd: def.spd, dmg: def.dmg, r: def.r, tier: 1, spin: 0, mesh: glb ? null : (g.userData.mesh || g.children[0]), mixer, glb, boss: true, tint: def.c });
    initBoss(this, g, def);
    this.scene.add(g); this.enemies.push(g); this.boss = g;
    this.state.bossActive = true; this.state.bossHp = hp; this.state.bossMax = hp; this.state.bossName = locName(def);
    this._event(t('evt.bossIn')); this.fx.shake = 0.7; this.audio.boss(); this._stormFX(g.position.clone());
    this.refresh();
  }

  // ---------- FX ----------
  _lightningFX() {
    const rec = this.fxModels && this.fxModels.bolt; if (!rec || !this.player) return;
    const inst = rec.scene.clone(true); inst.scale.setScalar(rec.fit);
    inst.position.copy(this.player.position).add(new THREE.Vector3(this.aim.x, 0, this.aim.z).multiplyScalar(3.4)); inst.position.y = 1.1;
    inst.rotation.y = this.face + Math.PI / 2;
    inst.traverse((o) => { if (o.isMesh && o.material) o.material.opacity = 1; });
    inst.userData = { life: 0.15, max: 0.15 }; this.fxSprites.push(inst); this.scene.add(inst);
  }
  _stormFX(pos) {
    const rec = this.fxModels && this.fxModels.storm; if (!rec) return;
    const inst = rec.scene.clone(true); inst.scale.setScalar(rec.fit); inst.position.copy(pos); inst.position.y = 0.2;
    let mixer = null; if (rec.clips.length) { mixer = new THREE.AnimationMixer(inst); mixer.clipAction(rec.clips[0]).play(); }
    inst.userData = { life: 1.2, max: 1.2, mixer }; this.fxSprites.push(inst); this.scene.add(inst);
  }
  _pulse(el, to, ms) { if (!el) return; el.style.opacity = to; setTimeout(() => { el.style.opacity = 0; }, ms); }
  _flash() { this._pulse(this.dom.flash, 0.9, 110); }
  _showHitDir() {
    const el = this.dom.hitDir; if (!el || !this._hitFrom || !this.player) return;
    const dx = this._hitFrom.x - this.player.position.x, dz = this._hitFrom.z - this.player.position.z;
    const ang = Math.atan2(dx, -dz) * 180 / Math.PI;
    el.querySelector('div').style.transform = 'rotate(' + ang + 'deg)';
    el.style.transition = 'none'; el.style.opacity = 1;
    requestAnimationFrame(() => { el.style.transition = 'opacity .5s'; el.style.opacity = 0; });
  }
  // Impact sparks reuse one shared geometry + a per-color cached material, so a
  // heavy firefight doesn't allocate thousands of geometries/materials (the main
  // GC-stutter source when the screen fills with enemies).
  _partMaterial(color) {
    this._partMats = this._partMats || {};
    if (!this._partMats[color]) this._partMats[color] = new THREE.MeshBasicMaterial({ color });
    return this._partMats[color];
  }
  _impact(pos, color, count, pow) {
    this._partGeo = this._partGeo || new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const mat = this._partMaterial(color);
    const cap = Math.min(count, 22); // cosmetic cap
    for (let i = 0; i < cap; i++) {
      const p = new THREE.Mesh(this._partGeo, mat);
      p.position.copy(pos); p.position.y = Math.max(0.6, pos.y);
      const a = Math.random() * Math.PI * 2, sp = (pow || 3) * (0.4 + Math.random());
      p.userData = { v: new THREE.Vector3(Math.cos(a) * sp, Math.random() * sp * 0.9 + 1, Math.sin(a) * sp), life: 0.45 + Math.random() * 0.3 };
      this.scene.add(p); this.parts.push(p);
    }
  }
  _ghost() {
    // teal afterimage silhouette (works for model or primitive player)
    const b = this.player.userData.body;
    const geo = b ? b.geometry : (this._ghostGeo || (this._ghostGeo = new THREE.CapsuleGeometry(0.5, (CONFIG.player.height || 1.9) * 0.5, 4, 8)));
    const y = b ? 1.1 : (CONFIG.player.height || 1.9) * 0.55;
    const gm = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x35e0d0, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    gm.position.copy(this.player.position); gm.position.y = y; gm.rotation.y = this.bodyFace || 0;
    gm.userData = { life: 0.3 }; this.scene.add(gm); this.ghosts.push(gm);
  }
  _event(txt) {
    const el = this.dom.event; if (!el) return; el.textContent = txt;
    el.style.transition = 'none'; el.style.opacity = 1; el.style.transform = 'translateX(-50%) scale(1.1)';
    requestAnimationFrame(() => { el.style.transition = 'opacity .9s,transform .9s'; el.style.opacity = 0; el.style.transform = 'translateX(-50%) scale(1)'; });
  }
  _levelToast() {
    const l = this.dom.level; if (!l) return;
    l.style.transition = 'none'; l.style.opacity = 1; l.style.transform = 'translateX(-50%) translateY(0) scale(1.05)';
    requestAnimationFrame(() => { l.style.transition = 'opacity 1s,transform 1s'; l.style.opacity = 0; l.style.transform = 'translateX(-50%) translateY(-28px) scale(1)'; });
  }

  // ---------- progression ----------
  _gainXp(x) {
    this.state.xp += x;
    while (this.state.xp >= this.state.xpToNext) {
      this.state.xp -= this.state.xpToNext; this.state.level++;
      this.state.xpToNext = Math.round(this.state.xpToNext * CONFIG.progress.xpGrowth + CONFIG.progress.xpFlat);
      let pts = 1; if (this.state.ranks.luck && this.state.level % 3 === 0) pts++;
      this.state.skillPoints += pts; this.state.maxHp += CONFIG.progress.hpPerLevel;
      this.state.hp = Math.min(this.state.maxHp, this.state.hp + this.state.maxHp * CONFIG.progress.levelHeal);
      this._levelToast(); this._levelBurst(); this.audio.levelUp(); this.fx.shake = Math.min(1, this.fx.shake + 0.2);
    }
  }

  _win() { this.state.ended = true; this.state.win = true; this.fx.shake = 0.6; this.refresh(); }
  _end() { this.state.ended = true; this.state.win = false; this.fx.freeze = 0.4; this.fx.shake = 0.8; this.audio.hurt(); this.refresh(); }

  // ---------- lifecycle ----------
  start() { this.audio.start(); if (this.onDeploy) this.onDeploy(); this._reset(!this._tutSeen); }
  restart() { this.audio.resume(); this._reset(false); }
  skipTutorial() { this._tutSeen = true; this.audio.resume(); this._reset(false); }
  openPanel(name) { this.state.panel = name; this.audio.ui(); this.refresh(); }
  closePanel() { this.state.panel = 'none'; this.audio.ui(); this.refresh(); }

  togglePause() {
    if (!this.state.started || this.state.ended) return;
    if (this.state.panel === 'pause') this.state.panel = 'none';
    else if (this.state.panel === 'none') this.state.panel = 'pause';
    else return;
    this.audio.ui(); this.refresh();
  }
  toggleMusic() { this.audio.setMusic(!this.audio.enabled); this.audio.ui(); this.refresh(); }
  quitToHome() {
    // stop the run and return to the start screen
    this.enemies.forEach((e) => { if (e.userData.boss) clearBossCast(this, e); if (e.userData.hpBar) this.scene.remove(e.userData.hpBar); });
    for (const arr of [this.enemies, this.bullets, this.enemyBullets, this.orbs, this.coins, this.parts, this.ghosts, this.fxSprites, this.itemDrops || []]) {
      arr.forEach((o) => { if (o.parent) o.parent.remove(o); else this.scene.remove(o); }); arr.length = 0;
    }
    this.hud.hideCast(); this.boss = null;
    Object.assign(this.state, this._freshState());
    this.refresh();
  }

  _reset(tutorial) {
    this.enemies.forEach((e) => { if (e.userData.boss) clearBossCast(this, e); if (e.userData.hpBar) this.scene.remove(e.userData.hpBar); });
    for (const arr of [this.enemies, this.bullets, this.enemyBullets, this.orbs, this.coins, this.parts, this.ghosts, this.fxSprites, this.itemDrops || []]) {
      arr.forEach((o) => { if (o.parent) o.parent.remove(o); else this.scene.remove(o); }); arr.length = 0;
    }
    this.hud.hideCast(); this.portalObj = null;
    this.boss = null; this.state.bossActive = false;
    // a run always restarts on the main map — reload it if we ended on the boss map
    const backToMain = this.map && this.mapId !== 'main';
    this.mapId = 'main';
    if (backToMain) { this.scene.remove(this.map); this.map = null; this._reloadMain(); }
    this._buildWorld(); this._buildPlayer();
    this._tut = !!tutorial;
    Object.assign(this.state, this._freshState(), { started: true, objectiveKey: this._tut ? 'tut:0' : 'obj.coreA', tutorial: this._tut });
    this.tut = { step: 0, move: 0, shots: 0, dashed: false, killBase: 0, timer: 0, dummied: false };
    this.game = { fireT: 0, spawnT: CONFIG.spawn.firstDelay, hurtT: 0, hudT: 0, ghostT: 0, grace: this._tut ? CONFIG.spawn.tutGrace : CONFIG.spawn.grace };
    this.fx = { shake: 0, freeze: 0, tScale: 1, tTarget: 1, fov: 0, muzzle: 0, dashT: 0, iframe: 0, dashDir: new THREE.Vector3(), recoil: 0, hitPunch: 0, camKick: new THREE.Vector3() };
    this.refresh();
  }

  _tutAdvance() {
    if (!this._tut) return; this.tut.step++; const s = this.tut.step;
    if (s >= TUTORIAL.length) {
      this._tut = false; this._tutSeen = true; this.state.tutorial = false; this.state.objectiveKey = 'obj.coreA';
      this.game.grace = 1.2; this.game.spawnT = 1; this._event(t('evt.tutDone')); this.refresh(); return;
    }
    const step = TUTORIAL[s]; this.state.objectiveKey = 'tut:' + s; this._event(getLang() === 'ko' ? (step.toastKo || '') : (step.toast || '')); this.tut.killBase = this.state.kills; this.tut.timer = 0;
    if (s === 3) this._spawnItemDrop({ x: this.player.position.x + Math.cos(this.face) * 6, z: this.player.position.z + Math.sin(this.face) * 6 }, 'weapon');
    if (step.dummies && !this.tut.dummied) {
      this.tut.dummied = true;
      for (let k = 0; k < 3; k++) { this._spawnEnemy(); const e = this.enemies[this.enemies.length - 1]; const a = k * 2.1; e.position.set(this.player.position.x + Math.cos(a) * 11, 0, this.player.position.z + Math.sin(a) * 11); e.userData.home = { x: e.position.x, z: e.position.z }; }
    }
    this.refresh();
  }

  // ---------- collision ----------
  _inSafe(pos) { const s = this.L && this.L.safe; if (!s) return false; return Math.hypot(pos.x - s.x, pos.z - s.z) < s.r; }
  _keepOutSafe(pos, radius) { const s = this.L && this.L.safe; if (!s) return; const dx = pos.x - s.x, dz = pos.z - s.z, d = Math.hypot(dx, dz), min = s.r + (radius || 0); if (d < min && d > 0) { pos.x = s.x + dx / d * min; pos.z = s.z + dz / d * min; } }
  _collide(pos, radius) {
    for (const o of this.obstacles) {
      if (o.dead) continue;
      if (o === this._gateObs && this.gateOpen) continue;
      const dx = pos.x - o.x, dz = pos.z - o.z;
      const px = (o.hw + radius) - Math.abs(dx), pz = (o.hd + radius) - Math.abs(dz);
      if (px > 0 && pz > 0) { if (px < pz) pos.x += px * Math.sign(dx || 1); else pos.z += pz * Math.sign(dz || 1); }
    }
    const bx = (this.L.bounds ? this.L.bounds.hx : this.L.B) - radius, bz = (this.L.bounds ? this.L.bounds.hz : this.L.B) - radius;
    pos.x = Math.max(-bx, Math.min(bx, pos.x)); pos.z = Math.max(-bz, Math.min(bz, pos.z));
  }

  // ---------- main loop ----------
  _loop() {
    if (this._dead) return;
    this._raf = requestAnimationFrame(() => this._loop());
    const rdt = Math.min(0.05, this.clock.getDelta());
    const playing = this.state.started && !this.state.ended && this.state.panel === 'none';
    const fx = this.fx, md = this._mods();

    fx.tScale += (fx.tTarget - fx.tScale) * Math.min(1, rdt * 10);
    fx.freeze = Math.max(0, fx.freeze - rdt);
    const dt = rdt * (fx.freeze > 0 ? 0.02 : fx.tScale);

    if (playing) this._simulate(dt, rdt, md, fx);

    this._animateDetached(rdt);
    this._updateCamera(rdt, fx, playing);

    if (this.bloom) { const bs = CONFIG.render.bloom; if (this.bloom.strength !== bs) this.bloom.strength = bs; }
    if (this.composer && CONFIG.render.bloom > 0.01) this.composer.render(); else this.rend.render(this.scene, this.cam);

    if (!this._shown) { this._shown = true; this.hud.hideLoading(); }
  }

  _simulate(dt, rdt, md, fx) {
    this.state.time += dt;
    // aim / facing
    if (!this.isTouch) {
      this.ray.setFromCamera(this.input.mouseNDC, this.cam); const hit = new THREE.Vector3();
      if (this.ray.ray.intersectPlane(this.groundPlane, hit)) this.aim.copy(hit.sub(this.player.position).setY(0).normalize());
    } else {
      if (this.input.rightStick && (this.input.aimVec.x || this.input.aimVec.y)) this.aim.set(this.input.aimVec.x, 0, this.input.aimVec.y).normalize();
      else {
        let nearest = null, nd = 1e9;
        for (const e of this.enemies) { if (!e.userData.aggro && !e.userData.boss) continue; const d = e.position.distanceToSquared(this.player.position); if (d < nd) { nd = d; nearest = e; } }
        if (!nearest) for (const e of this.enemies) { const d = e.position.distanceToSquared(this.player.position); if (d < nd) { nd = d; nearest = e; } }
        if (nearest) this.aim.copy(nearest.position.clone().sub(this.player.position).setY(0).normalize());
      }
    }
    if (this.aim.lengthSq() > 0) { this.face = Math.atan2(this.aim.x, this.aim.z); this.aimGroup.rotation.y = this.face; }

    // movement
    fx.dashT = Math.max(0, fx.dashT - rdt); fx.iframe = Math.max(0, fx.iframe - rdt);
    const mv = this.input.moveVector(); let ix = mv.x, iz = mv.z;
    const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
    const sprint = this.input.keys['shift'] ? CONFIG.player.sprintMul : 1;
    const base = CONFIG.player.moveSpeed * md.spd * sprint;
    if (fx.dashT > 0) this.vel.set(this.fx.dashDir.x * CONFIG.player.dashSpeed, 0, this.fx.dashDir.z * CONFIG.player.dashSpeed);
    else { const target = new THREE.Vector3(ix * base, 0, iz * base); this.vel.lerp(target, Math.min(1, rdt * CONFIG.player.accel)); }
    const np = this.player.position.clone().addScaledVector(this.vel, dt); this._collide(np, CONFIG.player.radius); this.player.position.copy(np);

    // dash regen
    if (this.state.dashCharges < md.dashchg) { this.game._dregen = (this.game._dregen || 0) + dt; const cd = CONFIG.player.dashRegen * md.dashcd; this.game.dashFrac = Math.min(1, this.game._dregen / cd); if (this.game._dregen >= cd) { this.game._dregen = 0; this.state.dashCharges++; } } else this.game.dashFrac = 1;
    if (this.state.dashMax !== md.dashchg) this.state.dashMax = md.dashchg;

    this._animatePlayer(dt, rdt, fx);

    // fire
    this.game.fireT -= dt;
    let wantFire;
    if (!this.isTouch) wantFire = this.input.mouseDown;
    else if (this.input.rightStick) wantFire = true;
    else wantFire = this.enemies.some((e) => (e.userData.aggro || e.userData.boss) && e.position.distanceToSquared(this.player.position) < 900);
    if (wantFire && this.game.fireT <= 0) this._fire();
    // overheat cooldown (water jet): lock while cooling, bleed heat when idle
    if (this.game.heatLock) { this.game.heatT -= dt; if (this.game.heatT <= 0) { this.game.heatLock = false; this.game.heat = 0; } }
    else if (this.game.heat > 0 && !wantFire) this.game.heat = Math.max(0, this.game.heat - dt * 1.5);
    fx.muzzle = Math.max(0, fx.muzzle - rdt); this.muzzle.material.opacity = fx.muzzle * 10; this.muzzle.scale.setScalar(0.6 + fx.muzzle * 6);
    this.gunLight.intensity = Math.max(0, this.gunLight.intensity - rdt * 30);

    // spawns
    this.game.grace = Math.max(0, (this.game.grace || 0) - dt);
    this.game.spawnT -= dt; const rate = Math.max(0.3, 1.3 - this.state.time / 80);
    if (this.game.grace <= 0 && this.game.spawnT <= 0 && this.enemies.length < CONFIG.spawn.maxEnemies) { this._spawnEnemy(); this.game.spawnT = rate; }
    // Boss is fought on the boss map (spawned on portal entry) — no timed spawn on main.

    if (this._tut) this._updateTutorial(dt);

    this._updateBullets(dt);
    this._updateEnemies(dt, rdt, md, fx);
    this._updateEnemyBullets(dt);
    this._updatePickups(dt, md);

    // channeled interaction (hold E / USE to fill the gauge) + core pulse
    this._updateChannel(dt);
    this.interact.forEach((x) => {
      if (x.type === 'core' && !x.done) {
        if (x.glow) x.glow.material.emissiveIntensity = 1.1 + Math.sin(this.state.time * 4) * 0.5;
        if (x.mark) { x.mark.rotation.y += dt * 2; x.mark.position.y = 4.4 + Math.sin(this.state.time * 3) * 0.25; }
        if (x.gring) { const s = 1 + Math.sin(this.state.time * 3) * 0.06; x.gring.scale.set(s, s, s); }
      }
    });
    // portal swirl animation
    if (this.portalObj && this.portalObj.visible) { const u = this.portalObj.userData; u.ring.rotation.z += dt * 1.4; u.swirl.rotation.z -= dt * 2.2; u.swirl2.rotation.z += dt * 2.2; u.light.intensity = 2 + Math.sin(this.state.time * 4) * 0.9; }

    if (this.state.hp <= 0) { this.state.hp = 0; this._end(); }

    this.game.hudT += rdt; if (this.game.hudT > 0.08) { this.game.hudT = 0; this.hud.tick(); }
  }

  _animatePlayer(dt, rdt, fx) {
    const moving = this.vel.lengthSq() > 1; const body = this.player.userData.body;
    if (body) { body.position.y = 1.1 + (moving ? Math.abs(Math.sin(this.state.time * 12)) * 0.12 : 0); body.rotation.z = -this.vel.x * 0.03; body.rotation.x = this.vel.z * 0.03; }
    // Facing: twin-stick shooters read best when the body faces the AIM
    // direction (clear directional feedback), falling back to movement only
    // when configured off.
    const spd = this.vel.length(); const yawOff = this.settings.yaw * Math.PI / 180;
    const base = CONFIG.player.faceAim ? this.face : (spd > 1.2 ? Math.atan2(this.vel.x, this.vel.z) : this.face);
    const targetFace = base - yawOff;
    let df = targetFace - (this.bodyFace || 0); while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2;
    this.bodyFace = (this.bodyFace || 0) + df * Math.min(1, rdt * 14);
    if (this.faceGroup) this.faceGroup.rotation.y = this.bodyFace;
    // procedural liveliness for models with few/no locomotion clips:
    // hop while moving, lean into movement, tilt back on recoil.
    if (this.chickenModel) {
      const moveAmt = Math.min(1, spd / CONFIG.player.moveSpeed);
      const hop = moveAmt > 0.15 ? Math.abs(Math.sin(this.state.time * 14)) * 0.18 * moveAmt : Math.sin(this.state.time * 2) * 0.02;
      this.chickenModel.position.y = this.settings.lift + hop;
      // lean forward into movement (in body-local space) + recoil tilt back
      const localVX = this.vel.x * Math.cos(-this.bodyFace) - this.vel.z * Math.sin(-this.bodyFace);
      const localVZ = this.vel.x * Math.sin(-this.bodyFace) + this.vel.z * Math.cos(-this.bodyFace);
      this.chickenModel.rotation.x = Math.max(-0.35, Math.min(0.35, localVZ * 0.03)) - fx.recoil * 0.25;
      this.chickenModel.rotation.z = Math.max(-0.3, Math.min(0.3, -localVX * 0.03));
    }
    // procedural juice: dash squash-&-stretch + hit punch on the body group
    fx.recoil = Math.max(0, fx.recoil - rdt * 6);
    fx.hitPunch = Math.max(0, fx.hitPunch - rdt * 4);
    if (this.faceGroup) {
      const dsq = fx.dashT > 0 ? 1 : 0, hp = fx.hitPunch;
      this.faceGroup.scale.set((1 - 0.16 * dsq) * (1 + 0.14 * hp), (1 + 0.06 * dsq) * (1 - 0.12 * hp), (1 + 0.22 * dsq) * (1 + 0.14 * hp));
    }
    // gun kicks back along its barrel as it recoils
    const recoilZ = fx.recoil * 0.5;
    if (this.gunModel) this.gunModel.position.z = 0.62 - recoilZ;
    if (this.gun) this.gun.position.z = 0.95 - recoilZ;
    if (this.core) { this.core.rotation.y += dt * 3; this.core.position.y = 1.4 + Math.sin(this.state.time * 3) * 0.05; }
    if (this.chickenModel) { this.chickenModel.rotation.y = this.settings.yaw * Math.PI / 180; this.chickenModel.scale.setScalar(this.settings.scale); }
    if (this.gunModel) this.gunModel.rotation.y = this.settings.gunYaw * Math.PI / 180;
    if (this.mixer) {
      const run = Math.min(1, spd / 6);
      if (this.runAction) { this.runAction.setEffectiveWeight(run); this.idleAction.setEffectiveWeight(1 - run); this.runAction.timeScale = 1 + (fx.dashT > 0 ? 1.4 : 0); this.idleAction.timeScale = 1; }
      else if (this.idleAction) this.idleAction.timeScale = 0.6 + Math.min(2.4, spd * 0.28) + (fx.dashT > 0 ? 1.6 : 0);
      this.mixer.update(rdt);
    }
    if (fx.dashT > 0) { this.game.ghostT += rdt; if (this.game.ghostT > 0.03) { this.game.ghostT = 0; this._ghost(); } }
  }

  _updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]; b.position.add(b.userData.dir.clone().multiplyScalar(b.userData.vel * dt)); b.userData.life -= dt;
      if (b.userData.flare) { b.rotation.x += b.userData.spin * dt; b.rotation.z += b.userData.spin * 0.7 * dt; }
      let dead = b.userData.life <= 0;
      for (const o of this.obstacles) { if (o.dead) continue; if (o === this._gateObs && this.gateOpen) continue; if (Math.abs(b.position.x - o.x) < o.hw + 0.2 && Math.abs(b.position.z - o.z) < o.hd + 0.2) { dead = true; this._impact(b.position, b.userData.col, 3, 2); break; } }
      if (!dead) for (const e of this.enemies) {
        if (b.userData.hit.includes(e)) continue;
        if (b.position.distanceTo(e.position) < e.userData.r + 0.3) {
          e.userData.hp -= b.userData.dmg; b.userData.hit.push(e); e.userData.aggro = true;
          this._impact(e.position, b.userData.crit ? 0xffffff : b.userData.col, b.userData.crit ? 7 : 4, 4); e.userData.hitT = 0.08; this.audio.hit();
          if (b.userData.pierce > 0) b.userData.pierce--; else dead = true; break;
        }
      }
      if (dead) { this.scene.remove(b); this.bullets.splice(i, 1); }
    }
  }

  _updateEnemies(dt, rdt, md, fx) {
    let dmgTaken = 0; this._hitFrom = null; this._hitFromD = 1e9;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i], u = e.userData;
      const to = this.player.position.clone().sub(e.position); to.y = 0; const d = to.length(); to.normalize();
      if (u.boss) {
        updateBoss(this, e, to, d, dt, rdt); // chase / telegraphed skill / dash
      } else {
        // timers
        u.windT = Math.max(0, (u.windT || 0) - rdt); u.atkT = Math.max(0, (u.atkT || 0) - rdt); u.fireT = Math.max(0, (u.fireT || 0) - rdt);
        u.lungeT = Math.max(0, (u.lungeT || 0) - rdt);
        const move = (dir) => { const ep = e.position.clone().addScaledVector(to, dir * u.spd * dt); this._collide(ep, u.r * 0.7); this._keepOutSafe(ep, u.r); e.position.copy(ep); };
        if (u.ranged) {
          // kite: hold ~keep distance, fire from range with a telegraph
          if (u.windT <= 0) { if (d > u.keep + 2) move(1); else if (d < u.keep - 3) move(-1); }
          if (d <= u.atkRange && u.fireT <= 0 && u.windT <= 0 && !u.telegraph) { u.windT = u.windup; u.telegraph = true; }
          if (u.telegraph && u.windT <= 0) { u.telegraph = false; this._spawnMobBullet(e.position, to, u.dmg, u.projSpeed, u.tint); u.fireT = u.atkCd; this.audio.hit(); }
        } else {
          // melee: close to attack range, then STOP, wind up, and strike
          if (d > u.atkRange && u.windT <= 0 && u.lungeT <= 0) move(1);
          if (d <= u.atkRange && u.windT <= 0 && u.atkT <= 0 && !u.telegraph) { u.windT = u.windup; u.telegraph = true; }
          if (u.telegraph && u.windT <= 0) {
            u.telegraph = false; u.lungeT = 0.12; u.atkT = u.atkCd;
            const mid = e.position.clone().lerp(this.player.position, 0.5); mid.y = 1; this._impact(mid, u.tint || 0xff5533, 7, 4);
            if (d < u.atkRange + 0.8 && this.game.hurtT <= 0 && fx.iframe <= 0 && this.game.grace <= 0) { dmgTaken += u.dmg * (1 - md.armor); if (md.thorn) u.hp -= u.dmg * md.thorn; if (!this._hitFrom || d < this._hitFromD) { this._hitFrom = e.position.clone(); this._hitFromD = d; } }
          }
          if (u.lungeT > 0) e.position.addScaledVector(to, u.spd * 1.8 * dt);
        }
      }

      if (u.mesh) { u.mesh.rotation.x += dt * u.spin; u.mesh.rotation.y += dt * u.spin; if (u.tier === 2) u.mesh.position.y = u.r + 0.5 + Math.sin(this.state.time * 6 + i) * 0.3; u.hitT = Math.max(0, (u.hitT || 0) - rdt); u.mesh.material.emissiveIntensity = 0.4 + (u.hitT > 0 ? 1.4 : 0) + (u.telegraph ? 1.4 : 0) + (u.lungeT > 0 ? 1 : 0) + (1 - u.hp / u.maxHp) * 0.5; }
      else if (u.glb) { if (!u.boss) e.rotation.y = Math.atan2(to.x, to.z); if (u.mixer) u.mixer.update(rdt * (1 + u.spd * 0.05)); if (u.tier === 2 && !u.boss) e.position.y = 0.6 + Math.abs(Math.sin(this.state.time * 7 + i)) * 0.5; u.hitT = Math.max(0, (u.hitT || 0) - rdt); e.scale.setScalar(1 + (u.hitT > 0 ? 0.18 : 0) + (u.telegraph ? 0.2 : 0)); }
      if (u.boss) this.state.bossHp = Math.max(0, u.hp);
      // floating HP bar (mobs only; boss uses the top bar)
      if (u.hpBar && !u.boss) {
        const frac = Math.max(0, u.hp / u.maxHp);
        if (frac < 0.999) { u.hpBar.visible = true; u.hpBar.position.set(e.position.x, u.barY, e.position.z); u.hpBar.quaternion.copy(this.cam.quaternion); const w = u.hpBar.userData.w; u.hpFill.scale.x = frac; u.hpFill.position.x = -(w / 2) * (1 - frac); }
        else u.hpBar.visible = false;
      }

      if (u.hp <= 0) {
        this.state.kills++; this.audio.kill();
        this._impact(e.position, (u.mesh && u.mesh.material) ? u.mesh.material.color.getHex() : (u.tint || 0xff3b6b), u.boss ? 40 : 11, u.boss ? 11 : 6);
        this._drop(e.position, u.tier);
        if (u.boss) { this._spawnItemDrop(e.position, 'weapon'); this._spawnItemDrop(e.position, 'health'); }
        else {
          const nextW = WEAPON_DROP_ORDER.find((k) => !this.state.owned[k]);
          if (nextW && Math.random() < this.WEAPONS[nextW].dropChance) this._spawnItemDrop(e.position, 'weapon');
          else { const r = Math.random(); if (r < CONFIG.drops.healthChance) this._spawnItemDrop(e.position, 'health'); else if (r < CONFIG.drops.healthChance + CONFIG.drops.scrapChance) this._spawnItemDrop(e.position, 'scrap'); }
        }
        if (u.boss) { clearBossCast(this, e); this.boss = null; this.state.bossActive = false; this.state.gold += Math.ceil(60 * md.gold); this._gainXp(40 * md.xp); this._event(t('evt.bossDown')); this.fx.shake = 1; this.fx.freeze = 0.28; for (let k = 0; k < 3; k++) this._drop(e.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4)), 1); if (this.mapId === 'boss') this._revealExtraction(); this.refresh(); }
        if (u.hpBar) this.scene.remove(u.hpBar);
        this.scene.remove(e); this.enemies.splice(i, 1); this.fx.shake = Math.min(1, this.fx.shake + (u.tier === 1 ? 0.28 : 0.12)); this.fx.freeze = Math.max(this.fx.freeze, u.tier === 1 ? 0.07 : 0.035); continue;
      }
    }
    if (dmgTaken > 0 && this.game.hurtT <= 0 && fx.iframe <= 0) { this.state.hp -= dmgTaken; this.game.hurtT = 0.6; this._flash(); this.audio.hurt(); this.fx.shake = Math.min(1, this.fx.shake + 0.35); this.fx.freeze = Math.max(this.fx.freeze, 0.05); this.fx.hitPunch = 1; this._showHitDir(); }
    this.game.hurtT = Math.max(0, this.game.hurtT - rdt);
    if (md.regen > 0 && this.state.hp < this.state.maxHp) this.state.hp = Math.min(this.state.maxHp, this.state.hp + md.regen * dt);
    const lr = this.dom.low; if (lr) lr.style.opacity = this.state.hp / this.state.maxHp < 0.3 ? (0.4 + 0.4 * Math.sin(this.state.time * 6)) : 0;
  }

  // Ranged-mob projectile (routed through the same enemyBullets pipeline).
  _spawnMobBullet(pos, dir, dmg, speed, color) {
    const d = dir.clone().setY(0).normalize();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2, roughness: 0.4 }));
    b.position.copy(pos).add(d.clone().multiplyScalar(1.2)); b.position.y = 1.1;
    b.userData = { dir: d, vel: speed, dmg, life: 3.5 };
    this.scene.add(b); this.enemyBullets.push(b);
  }

  // Boss projectiles: advance, stop on walls, damage player on contact.
  _updateEnemyBullets(dt) {
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      const b = this.enemyBullets[i]; b.position.addScaledVector(b.userData.dir, b.userData.vel * dt); b.userData.life -= dt;
      let dead = b.userData.life <= 0;
      if (!dead) for (const o of this.obstacles) { if (o.dead) continue; if (o === this._gateObs && this.gateOpen) continue; if (Math.abs(b.position.x - o.x) < o.hw + 0.2 && Math.abs(b.position.z - o.z) < o.hd + 0.2) { dead = true; this._impact(b.position, b.material.color.getHex(), 3, 2); break; } }
      if (!dead && b.position.distanceTo(this.player.position) < CONFIG.player.radius + 0.5) { this._bossHitPlayer(b.userData.dmg, b.position); dead = true; }
      if (dead) { this.scene.remove(b); this.enemyBullets.splice(i, 1); }
    }
  }

  // Single damage entry-point for boss skills + projectiles (respects i-frames).
  _bossHitPlayer(dmg, fromPos) {
    if (this.game.hurtT > 0 || this.fx.iframe > 0 || this.game.grace > 0) return;
    const md = this._mods();
    this.state.hp -= dmg * (1 - md.armor); this.game.hurtT = 0.6;
    this._flash(); this.audio.hurt(); this.fx.shake = Math.min(1, this.fx.shake + 0.4); this.fx.freeze = Math.max(this.fx.freeze, 0.05); this.fx.hitPunch = 1;
    if (fromPos) { this._hitFrom = fromPos.clone ? fromPos.clone() : new THREE.Vector3(fromPos.x, 0, fromPos.z); this._showHitDir(); }
    if (this.state.hp <= 0) { this.state.hp = 0; this._end(); }
  }

  _updatePickups(dt, md) {
    const pickR = 3.4 * md.pickup;
    for (let i = this.orbs.length - 1; i >= 0; i--) { const o = this.orbs[i]; o.rotation.y += dt * 3; o.position.y = 0.7 + Math.sin(this.state.time * 4 + i) * 0.1; const to = this.player.position.clone().sub(o.position); to.y = 0; const d = to.length(); if (d < pickR) o.position.add(to.normalize().multiplyScalar(16 * dt)); if (d < 1.1) { this._gainXp(o.userData.xp); this.scene.remove(o); this.orbs.splice(i, 1); } }
    for (let i = this.coins.length - 1; i >= 0; i--) { const c = this.coins[i]; c.rotation.z += dt * 5; const to = this.player.position.clone().sub(c.position); to.y = 0; const d = to.length(); if (d < pickR) c.position.add(to.normalize().multiplyScalar(16 * dt)); if (d < 1.1) { this.state.gold += c.userData.gold; this.scene.remove(c); this.coins.splice(i, 1); } }
    const pr2 = 3.6 * md.pickup;
    for (let i = this.itemDrops.length - 1; i >= 0; i--) {
      const it = this.itemDrops[i]; const u = it.userData; u.life -= dt; u.ring.rotation.z += dt * 1.6; it.position.y = Math.sin(this.state.time * 2 + u.ph) * 0.12;
      const to = this.player.position.clone().sub(it.position); to.y = 0; const d = to.length(); if (d < pr2) it.position.add(to.normalize().multiplyScalar(15 * dt).setY(0));
      if (d < 1.4) { this._collectItem(u.kind); this.worldG.remove(it); this.itemDrops.splice(i, 1); continue; }
      if (u.life <= 0) { this.worldG.remove(it); this.itemDrops.splice(i, 1); }
    }
  }

  _updateTutorial(dt) {
    const st = this.tut;
    if (st.step === 0) { st.move += this.vel.length() * dt; if (st.move > 7) this._tutAdvance(); }
    else if (st.step === 4) { if (this.state.kills - st.killBase >= 3) this._tutAdvance(); }
    else if (st.step === 5) { st.timer += dt; if (st.timer > 4) this._tutAdvance(); }
  }

  _animateDetached(rdt) {
    for (let i = this.parts.length - 1; i >= 0; i--) { const p = this.parts[i]; p.userData.life -= rdt; p.userData.v.y -= 10 * rdt; p.position.addScaledVector(p.userData.v, rdt); p.scale.setScalar(Math.max(0.01, p.userData.life * 2.2)); if (p.userData.life <= 0) { this.scene.remove(p); this.parts.splice(i, 1); } }
    for (let i = this.ghosts.length - 1; i >= 0; i--) { const gh = this.ghosts[i]; gh.userData.life -= rdt; gh.material.opacity = Math.max(0, gh.userData.life * 1.6); if (gh.userData.life <= 0) { this.scene.remove(gh); this.ghosts.splice(i, 1); } }
    for (let i = this.fxSprites.length - 1; i >= 0; i--) { const s = this.fxSprites[i]; s.userData.life -= rdt; if (s.userData.mixer) s.userData.mixer.update(rdt); const o = Math.max(0, s.userData.life / s.userData.max); s.traverse((m) => { if (m.isMesh && m.material) m.material.opacity = o * (s.userData.grow ? 0.9 : 1); }); if (s.userData.grow) s.scale.setScalar(0.1 + (1 - o) * s.userData.grow); else s.rotation.y += rdt * 3; if (s.userData.life <= 0) { this.scene.remove(s); this.fxSprites.splice(i, 1); } }
  }

  _updateCamera(rdt, fx, playing) {
    if (!this.player) return;
    fx.shake = Math.max(0, fx.shake - rdt * 2.4); fx.fov += (0 - fx.fov) * Math.min(1, rdt * 6);
    const lead = this.aim.clone().multiplyScalar(CONFIG.camera.lead);
    const target = this.player.position.clone().add(lead).add(this.camOff.clone().multiplyScalar(this.input ? this.input.zoom : 1));
    this.cam.position.lerp(target, playing ? CONFIG.camera.lerpPlay : CONFIG.camera.lerpIdle);
    const sh = fx.shake * fx.shake; this.cam.position.x += (Math.random() - 0.5) * sh * 3; this.cam.position.y += (Math.random() - 0.5) * sh * 2; this.cam.position.z += (Math.random() - 0.5) * sh * 3;
    // recoil camera kick (springs back to zero)
    if (fx.camKick) { this.cam.position.add(fx.camKick); fx.camKick.multiplyScalar(Math.max(0, 1 - rdt * 12)); }
    this.cam.lookAt(this.player.position.x, 1, this.player.position.z - 2);
    const fov = this.baseFov + fx.fov + (this.vel ? this.vel.length() * 0.05 : 0);
    if (Math.abs(this.cam.fov - fov) > 0.01) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
    this.rim.position.set(this.player.position.x, 5, this.player.position.z);
  }

  _drop(pos, tier) {
    const md = this._mods();
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshStandardMaterial({ color: 0x59ff9d, emissive: 0x59ff9d, emissiveIntensity: 1.8 }));
    orb.position.copy(pos); orb.position.y = 0.6; orb.userData = { xp: (3 + tier * 4) * md.xp }; this.scene.add(orb); this.orbs.push(orb);
    if (Math.random() < 0.6 + tier * 0.2) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 10), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffd23f, emissiveIntensity: 0.9, metalness: 0.8 })); c.position.copy(pos); c.position.y = 0.45; c.rotation.x = Math.PI / 2; c.userData = { gold: Math.ceil((2 + tier * 3) * md.gold) }; this.scene.add(c); this.coins.push(c); }
  }

  // Level-up world burst: expanding green ring + spark shower at the player.
  _levelBurst() {
    if (!this.player) return; const p = this.player.position;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.0, 40), new THREE.MeshBasicMaterial({ color: 0x59ff9d, transparent: true, opacity: 0.95, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.12, p.z); ring.userData = { life: 0.6, max: 0.6, grow: 7 }; this.fxSprites.push(ring); this.scene.add(ring);
    this._impact(new THREE.Vector3(p.x, 1, p.z), 0x59ff9d, 26, 7);
  }

  // ---------- purchases (called from Panels) ----------
  buySkill(id) {
    let node, branch; this.BRANCHES.forEach((b) => b.nodes.forEach((n) => { if (n.id === id) { node = n; branch = b; } }));
    const cur = this.state.ranks[id] || 0; const idx = branch.nodes.indexOf(node);
    const prevOk = idx === 0 || ((this.state.ranks[branch.nodes[idx - 1].id] || 0) > 0);
    if (cur >= node.max || this.state.skillPoints < node.cost || !prevOk) return;
    this.state.ranks = { ...this.state.ranks, [id]: cur + 1 }; this.state.skillPoints -= node.cost; this.audio.ui(); this.refresh();
  }
  pickWeapon(key) {
    const ww = this.WEAPONS[key]; const own = !!this.state.owned[key];
    if (own) { this.state.weapon = key; this._attachGun(key); }
    else { if (this.state.gold < (ww.cost || 0)) return; this.state.gold -= (ww.cost || 0); this.state.owned = { ...this.state.owned, [key]: true }; this.state.weapon = key; this._attachGun(key); }
    this.audio.ui(); this.refresh();
  }

  // Quick-switch between OWNED weapons (HUD readout click / number keys / cycle).
  _ownedWeapons() { return Object.keys(this.WEAPONS).filter((k) => this.state.owned[k]); }
  cycleWeapon(dir = 1) {
    if (!this.state.started || this.state.ended || this.state.panel !== 'none') return;
    const owned = this._ownedWeapons(); if (owned.length < 2) return;
    let i = owned.indexOf(this.state.weapon); i = (i + dir + owned.length) % owned.length;
    this.state.weapon = owned[i]; this._attachGun(owned[i]); this.audio.ui(); this.refresh();
  }
  selectWeaponSlot(idx) {
    if (!this.state.started || this.state.ended || this.state.panel !== 'none') return;
    const owned = this._ownedWeapons(); if (!owned[idx] || owned[idx] === this.state.weapon) return;
    this.state.weapon = owned[idx]; this._attachGun(owned[idx]); this.audio.ui(); this.refresh();
  }
}

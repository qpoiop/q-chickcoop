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
      killStreak: 0, streakBest: 0,
      dashCharges: 2, dashMax: 2, objectiveKey: 'obj.coreA', cores: 0,
      prompt: null, promptKey: 'E', bossActive: false, bossHp: 0, bossMax: 1, bossName: '',
      owned: { flare: true }, tutorial: false,
    };
  }

  refresh() { this.hud.sync(); this.panels.sync(); }
  // Memoized: ranks is replaced by reference on every skill buy / reset, so a
  // reference check lets the per-frame hot path skip the recompute + allocation.
  _mods() { if (this._modRanks !== this.state.ranks) { this._modRanks = this.state.ranks; this._modCache = computeModifiers(this.state.ranks); } return this._modCache; }
  get isTouch() { return this.input ? this.input.isTouch : this._touchGuess; }
  // When the camera is flipped to the far side (camOffset.z<0), world +z reads as
  // "up-screen", so world-space movement/aim input must be negated to stay correct.
  get _camFlip() { return this.camOff && this.camOff.z < 0; }

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

    this.enemies = []; this.bullets = []; this.enemyBullets = []; this.orbs = []; this.coins = []; this.parts = []; this.ghosts = []; this.fxSprites = []; this.dmgNums = [];
    this.aim = new THREE.Vector3(0, 0, 1); this.face = 0;
    this.vel = new THREE.Vector3(); this.ray = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.clock = new THREE.Clock();
    this.fx = { shake: 0, freeze: 0, tScale: 1, tTarget: 1, fov: 0, muzzle: 0, dashT: 0, iframe: 0, dashDir: new THREE.Vector3(), recoil: 0, hitPunch: 0, camKick: new THREE.Vector3() };

    this._iconTex = {};
    this.mapId = 'tutorial'; // maps load per-run via _goToMap; arena fallback for the home bg
    this._buildWorld();
    this._buildPlayer();
    this._bindInput();

    // async asset loads. The city map + player rig are ESSENTIAL, so the
    // loading screen stays up until they're ready (map is loaded at boot, not
    // during the tutorial — the tutorial can be skipped straight into the city).
    const essentials = Promise.all([
      this._loadPlayerModel(),
      this._warmMap(MAPS.main.model),
    ]);
    this._loadEnemyModels();
    this._loadWeaponModels();
    this._loadEffectModels();
    this._loadToolModels();

    this.game = { fireT: 0, spawnT: CONFIG.spawn.firstDelay, hurtT: 0, hudT: 0, ghostT: 0, grace: CONFIG.spawn.grace };
    this.refresh();
    // Loading screen shows real download progress (driven in _loop) until the
    // essentials are ready (or a hard timeout).
    this._booting = true; this.hud.setLoading(0, 'INITIALIZING');
    let done = false;
    const finish = () => { if (done) return; done = true; this._booting = false; this.hud.setLoading(1, 'READY'); setTimeout(() => this.hud.hideLoading(), 280); };
    essentials.then(finish); setTimeout(finish, 20000);
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
    // On grid maps the guide anchors are raw coordinates that may land on a tree,
    // a rock, or a pocket the player can't path to. Snap every placed thing to the
    // nearest cell reachable from the spawn, so cores/crates/shop/portal are always
    // stood on real ground and always reachable (fixes unreachable farming points).
    if (this.map && L.harvest) this._snapAnchors(L);
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
          const h = 3.4, m = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, h, 16), new THREE.MeshStandardMaterial({ color: 0x141c28, emissive: accent, emissiveIntensity: 0.5, roughness: 0.5, metalness: 0.5 }));
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

    // data cores — the hackable WORKBENCH (the provided lab model). No procedural
    // crystal/marker on top; just the model + a ground light-ring rising beacon so
    // it reads as interactable.
    (L.cores || []).forEach((c, i) => {
      const grp = new THREE.Group(); grp.position.set(c.x, 0, c.z);
      grp.rotation.y = this._camFlip ? Math.PI : 0; // face the (flipped) camera, not its back
      let wbMixer = null;
      const tm = this.toolModels && this.toolModels.workbench;
      if (tm) {
        const wb = cloneSkinned(tm.scene); wb.scale.setScalar(tm.fit);
        if (tm.clips && tm.clips.length) { wbMixer = new THREE.AnimationMixer(wb); wbMixer.clipAction(tm.clips[0]).play(); wbMixer.update(0); }
        // Ground to the real geometry bbox (measure what renders) BEFORE parenting,
        // so the bench sits ON the floor instead of sinking — bind-pose boxes were off.
        this._groundModel(wb); grp.add(wb);
      } else {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x1a2836, metalness: 0.5, roughness: 0.5 }));
        base.position.y = 0.25; grp.add(base);
      }
      // interactable beacon: a glowing ground ring only (no vertical column/dome —
      // the dome washed over the model and over-glowed). The RING is what glows.
      const gring = this._beaconRing(0x35e0d0, 2.4);
      grp.add(gring);
      g.add(grp); this.obstacles.push({ x: c.x, z: c.z, hw: 1.6, hd: 1.6 });
      this.interact.push({ type: 'core', id: 'Core ' + (i ? 'B' : 'A'), x: c.x, z: c.z, r: 3.6, done: false, mesh: grp, glow: null, ring: null, gring, col: null, mark: null, wbMixer, active: true });
    });

    // glowing map-transition portal (hidden until unlocked)
    this.portalObj = null;
    if (L.portal) {
      const pg = this._makePortal(L.portal, 0x35e0d0); pg.visible = false; g.add(pg); this.portalObj = pg;
      this.interact.push({ type: 'portal', id: 'Portal', to: L.portal.to, x: L.portal.x, z: L.portal.z, r: 3.4, done: false, active: false, mesh: pg });
    }

    // loot crates — a salvage CHEST you crack open for scrap
    L.crates.forEach(([x, z]) => {
      const grp = new THREE.Group(); grp.position.set(x, 0, z);
      grp.rotation.y = this._camFlip ? Math.PI : 0; // face the (flipped) camera
      let lid = null, lidRest = null;
      const cm = this.toolModels && this.toolModels.chest;
      if (cm) {
        const ch = cloneSkinned(cm.scene); ch.scale.setScalar(cm.fit);
        this._groundModel(ch); grp.add(ch);
        // the GLB's open clip is ~20s and doesn't rebind on the clone — we open the
        // lid procedurally instead, rotating this hinge node.
        ch.traverse((o) => { if (o.name === 'Chest_Top' || /Chest_Top(?!_Final)/i.test(o.name)) lid = o; });
        if (!lid) ch.traverse((o) => { if (/lid|top|cover/i.test(o.name) && o.children.length) lid = o; });
        if (lid) lidRest = lid.quaternion.clone();
      } else {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshStandardMaterial({ color: 0x2a3a2a, emissive: 0x1a3a1a, emissiveIntensity: 0.4, roughness: 0.6, metalness: 0.3 }));
        m.position.y = 0.8; grp.add(m);
      }
      // same glowing ground ring as the cores so the chest reads as interactable
      const cgr = this._beaconRing(0xffd23f, 1.8); grp.add(cgr);
      g.add(grp);
      this.obstacles.push({ x, z, hw: 0.8, hd: 0.8 }); this.interact.push({ type: 'crate', id: 'Salvage', x, z, r: 2.6, done: false, mesh: grp, lid, lidRest, lidT: 0, gring: cgr, active: true });
    });

    // SHOP stall — walk up and interact to open the weapon shop (reusable)
    if (L.shop) {
      const grp = new THREE.Group(); grp.position.set(L.shop.x, 0, L.shop.z);
      grp.rotation.y = this._camFlip ? Math.PI : 0; // face the (flipped) camera, not its back
      const sm = this.toolModels && this.toolModels.shop;
      if (sm) {
        const s = cloneSkinned(sm.scene); s.scale.setScalar(sm.fit);
        // This shop GLB imports with a bad Sketchfab axis conversion that tips the
        // whole stall onto its side (reads as a floating, tilted "SHOP" sign).
        // Zeroing the wrapper node stands it upright as the pink kiosk it is.
        s.traverse((o) => { if (o.name === 'Sketchfab_model') o.rotation.set(0, 0, 0); });
        this._groundModel(s); grp.add(s);
      } else {
        const m = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 2), new THREE.MeshStandardMaterial({ color: 0x2a2036, emissive: 0x35e0d0, emissiveIntensity: 0.2 }));
        m.position.y = 1.5; grp.add(m);
      }
      const sgr = this._beaconRing(0x35e0d0, 2.4); grp.add(sgr);
      g.add(grp); this.obstacles.push({ x: L.shop.x, z: L.shop.z, hw: 1.6, hd: 1.4 });
      this.interact.push({ type: 'shop', id: 'Shop', x: L.shop.x, z: L.shop.z, r: 3.4, done: false, mesh: grp, sgr, gring: sgr, active: true });
    }

    // safe-zone ring
    if (L.safe) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(L.safe.r - 0.5, L.safe.r, 48), new THREE.MeshBasicMaterial({ color: 0x35e0d0, transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(L.safe.x, 0.04, L.safe.z); g.add(ring);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(L.safe.r, 48), new THREE.MeshBasicMaterial({ color: 0x0e2a2e, transparent: true, opacity: 0.28 }));
      disc.rotation.x = -Math.PI / 2; disc.position.set(L.safe.x, 0.03, L.safe.z); g.add(disc);
    }
    this.itemDrops = [];

    // Tutorial: reveal interactables one step at a time so the sequence is enforced
    // (you can't hack the core before the HACK step and skip ahead). Each object is
    // hidden + non-interactable + its collider disabled until its step (see
    // _tutReveal, called from _tutAdvance).
    if (this._tut) {
      const stepFor = { shop: 5, crate: 6, core: 7 };
      const cur = (this.tut && this.tut.step) || 0;
      for (const it of this.interact) {
        const s = stepFor[it.type]; if (s == null) continue;
        it.tutStep = s; it.obs = this.obstacles.find((o) => o.x === it.x && o.z === it.z) || null;
        if (cur < s) { it.active = false; it.tutHidden = true; if (it.mesh) it.mesh.visible = false; if (it.obs) it.obs.dead = true; }
      }
    }
  }

  // Reveal any tutorial interactable whose gated step has now been reached.
  _tutReveal(step) {
    for (const it of this.interact) {
      if (it.tutHidden && it.tutStep === step) {
        it.tutHidden = false; it.active = true;
        if (it.mesh) it.mesh.visible = true;
        if (it.obs) it.obs.dead = false;
      }
    }
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
    // ground beacon ring so it reads as pickup-able even at a glance
    const gring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.15, 32), new THREE.MeshBasicMaterial({ color: conf.color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    gring.rotation.x = -Math.PI / 2; gring.position.y = 0.05; grp.add(gring);
    grp.userData = { kind, ring, icon, icon2, gring, x: pos.x, z: pos.z, life: 22, ph: Math.random() * 6 };
    this.worldG.add(grp); this.itemDrops.push(grp);
  }

  // Glowing map-transition / extraction portal (Duckcoop-style).
  // Centre a model on X/Z and seat it on the floor using its REAL geometry bbox
  // (transformed by each mesh's matrix), which reflects what actually renders —
  // setFromObject/bone boxes on skinned props were grounding to the wrong height.
  // Call before parenting, so the measurement is in the model's own frame.
  _groundModel(obj) {
    obj.updateWorldMatrix(true, true);
    const box = new THREE.Box3(), tmp = new THREE.Box3();
    obj.traverse((o) => {
      if ((o.isMesh || o.isSkinnedMesh) && o.geometry) {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); box.union(tmp);
      }
    });
    if (box.isEmpty()) return;
    const c = new THREE.Vector3(); box.getCenter(c);
    obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= box.min.y;
  }

  // A glowing "interact here" ground ring (additive ring + soft inner disc). Shared
  // by cores/chests/shop so every interactable reads the same way. Returns a group
  // (scale-pulsed by the interact animation).
  _beaconRing(color, r) {
    const grp = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r, 44), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; grp.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.8, 44), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.05; grp.add(disc);
    return grp;
  }

  _makePortal(pos, color) {
    const grp = new THREE.Group(); grp.position.set(pos.x, 0, pos.z);
    const pm = this.toolModels && this.toolModels.portal;
    let spin = null, ring = null, swirl = null, swirl2 = null;
    if (pm) {
      // Use the provided desert_portal model, grounded + centred.
      const m = cloneSkinned(pm.scene); m.scale.setScalar(pm.fit);
      m.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(m); const ctr = new THREE.Vector3(); bb.getCenter(ctr);
      m.position.x -= ctr.x; m.position.z -= ctr.z; m.position.y -= bb.min.y; grp.add(m); spin = m;
    } else {
      // procedural fallback ring/swirl (only if the model failed to load)
      ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.26, 14, 44), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.9, metalness: 0.4, roughness: 0.3 }));
      ring.position.y = 2.5; grp.add(ring);
      swirl = new THREE.Mesh(new THREE.CircleGeometry(2.0, 44), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.34, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      swirl.position.y = 2.5; grp.add(swirl); swirl2 = swirl.clone(); swirl2.rotation.y = Math.PI; grp.add(swirl2);
    }
    // Bright, unmistakable gateway beacon — big ground ring + glow disc + a TALL
    // pillar of light + strong point light, so the portal reads clearly even on a
    // dark map and from across the arena (the desert model alone was near-invisible).
    const gring = new THREE.Mesh(new THREE.RingGeometry(2.8, 3.8, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    gring.rotation.x = -Math.PI / 2; gring.position.y = 0.06; grp.add(gring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.05; grp.add(disc);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.0, 18, 32, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    col.position.y = 9; grp.add(col);
    const light = new THREE.PointLight(color, 5, 44); light.position.y = 4; grp.add(light);
    grp.userData = { spin, ring, swirl, swirl2, gring, col, light, ph: 0 };
    return grp;
  }

  // ---------- player ----------
  // See-through hero: a silhouette twin of the player model that draws ONLY where
  // the player is occluded (depthFunc GreaterDepth). Occluder-agnostic — works no
  // matter how the trees/buildings are meshed, unlike fading the occluders. The
  // twins share the source skeleton, so they animate for free.
  _buildPlayerXray(model) {
    if (!model) return;
    const mat = new THREE.MeshBasicMaterial({ color: 0x7ff2e8, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    mat.depthFunc = THREE.GreaterDepth;   // pass only where a nearer surface already drew (i.e. player is behind it)
    const src = [];
    // Idempotent: skip meshes that are themselves twins, and meshes already twinned
    // (so re-entering a map doesn't stack twins-of-twins).
    model.traverse((o) => { if ((o.isSkinnedMesh || o.isMesh) && !o.userData.xray && !o.userData._hasXray) src.push(o); });
    this._xrayTwins = this._xrayTwins || [];
    for (const o of src) {
      let x;
      if (o.isSkinnedMesh) { x = new THREE.SkinnedMesh(o.geometry, mat); x.bind(o.skeleton, o.bindMatrix); x.bindMode = o.bindMode; }
      else x = new THREE.Mesh(o.geometry, mat);
      x.position.copy(o.position); x.quaternion.copy(o.quaternion); x.scale.copy(o.scale);
      x.frustumCulled = false; x.renderOrder = 20; x.castShadow = false; x.receiveShadow = false;
      x.userData.xray = true; o.userData._hasXray = true;
      x.visible = false;                 // shown only when the hero is actually occluded
      this._xrayTwins.push(x);
      o.parent.add(x);
    }
  }

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
      // Attack clip as an ADDITIVE layer (delta over the bind pose) so it overlays
      // idle/run on fire without replacing locomotion. Root position tracks are
      // dropped so the jab doesn't slide the body. One-shot, retriggered per shot.
      this.attackAction = null;
      const atkClip = clips.find((c) => /attack(?!_slide)/i.test(c.name)) || clips.find((c) => /attack/i.test(c.name));
      if (atkClip) {
        const add = atkClip.clone();
        add.tracks = add.tracks.filter((t) => !/\.position$/.test(t.name));
        THREE.AnimationUtils.makeClipAdditive(add);
        this.attackAction = this.mixer.clipAction(add);
        this.attackAction.setLoop(THREE.LoopOnce, 1);
        this.attackAction.clampWhenFinished = false;
        this.attackAction.setEffectiveWeight(0);
      }
      this.chicken.fit = null;
      this._buildPlayerXray(this.chickenModel);
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

    // Prefer a street-level spawn computed at map load (see _loadMapModel); it
    // overrides the static level.spawnStart for the matching map.
    const ov = this._streetSpawn;
    const sp = (ov && ov.map === this.mapId) ? ov : ((this.L && this.L.spawnStart) ? this.L.spawnStart : { x: 0, z: 34 });
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
    const g = await loadGLB(ASSETS.player, (l, t) => this._bootProg('player', l, t)); if (!g || this._dead) return;
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

  // Interaction props (workbench = data core, chest = salvage). Sized so they
  // read at the interaction footprint; clips (if any) drive the hack/open anim.
  async _loadToolModels() {
    if (this.toolModels) return; this.toolModels = {};
    const H = { workbench: 4.5, chest: 3.0, shop: 9, portal: 6.5 };
    // per-model self-lit tint: the chest sits in dark forest and read almost black,
    // so it gets a stronger tint; shop/workbench stay subtle to avoid washing out.
    const TINT = { workbench: 0.05, chest: 0.1, shop: 0.06, portal: 0.1 };
    for (const [key, url] of Object.entries(ASSETS.toolModels)) {
      const g = await loadGLB(url); if (this._dead) return; if (!g) continue;
      tuneMaterials(g.scene, { metalness: 0.4, shadow: false });
      // these props read too dark at night — give the materials a gentle self-lit
      // tint so they pop without needing an extra light.
      const tint = TINT[key] != null ? TINT[key] : 0.1;
      g.scene.traverse((o) => {
        if (!o.isMesh && !o.isSkinnedMesh) return;
        o.frustumCulled = true;
        const m = Array.isArray(o.material) ? o.material : [o.material];
        m.forEach((mat) => { if (mat && mat.emissive) { mat.emissive.copy(mat.color || mat.emissive).multiplyScalar(tint); mat.emissiveIntensity = 1; } });
      });
      this.toolModels[key] = { scene: g.scene, clips: g.animations, fit: fitScale(g.scene, H[key] || 2) };
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

  // Preload a map GLB into the cache (background) so entering it is instant.
  async _warmMap(url) {
    if (!url) return; this._mapSrc = this._mapSrc || {};
    if (this._mapSrc[url]) return;
    const g = await loadGLB(url, (l, t) => this._bootProg('map', l, t)); if (g && !this._dead) this._mapSrc[url] = g.scene;
  }

  // Boot-progress aggregator: track download bytes for the essential assets and
  // expose a 0..1 fraction (map weighted heavier as it's the bulk of the load).
  _bootProg(kind, l, t) {
    this._boot = this._boot || { player: { l: 0, t: 0 }, map: { l: 0, t: 0 } };
    this._boot[kind] = { l, t };
    if (kind === 'player') this._boot._label = 'HERO';
    else this._boot._label = 'CITY';
  }
  _bootFraction() {
    const b = this._boot; if (!b) return 0;
    // weight: map 0.72 / player 0.28 (map is ~3x the bytes)
    const pf = b.player.t > 0 ? b.player.l / b.player.t : 0;
    const mf = b.map.t > 0 ? b.map.l / b.map.t : 0;
    return Math.min(1, pf * 0.28 + mf * 0.72);
  }

  // Fog / background / light for a modelless arena.
  _applyLevelEnv(level) {
    if (level.fog) this.scene.fog = new THREE.Fog(level.fog.color, level.fog.near, level.fog.far);
    if (level.bg != null) this.scene.background = new THREE.Color(level.bg);
    if (level.light) this.scene.traverse((o) => { if (o.isHemisphereLight) o.intensity = level.light.hemi; if (o.isDirectionalLight) o.intensity = level.light.dir; });
    // Per-map tone-mapping exposure — dark night maps (the forest) need to be
    // brightened at the RENDERER, not faked by making props emissive.
    if (this.rend) this.rend.toneMappingExposure = level.exposure != null ? level.exposure : 1.25;
  }

  // Load a map GLB and fit it to the play area. These town GLBs are one combined
  // mesh + a huge flat ground/lava plane; fitting to the full bbox shrinks the
  // buildings to nothing. We compute the BUILDING bbox by excluding the big flat
  // ground pieces (large footprint + low height), then scale/center on that so
  // the town fills the bounds. `level.mapFit.scale` (+off/groundY/yaw) overrides
  // the auto-fit for hand-tuned maps.
  async _loadMapModel(url, level) {
    // cache the raw scene so re-entering a map doesn't re-download it (the city
    // is 25 MB); map geometry is static, so a plain clone is safe.
    this._mapSrc = this._mapSrc || {};
    let src = this._mapSrc[url];
    if (!src) { const g = await loadGLB(url); if (!g || this._dead) return null; src = g.scene; this._mapSrc[url] = src; }
    const m = src.clone(true);
    m.traverse((o) => {
      if (!o.isMesh) return;
      if (/Invisible|collider|collision/i.test(o.name)) { o.visible = false; o.castShadow = false; o.receiveShadow = false; return; }
      // hide meme props embedded in these scene-rip GLBs (giant Shrek head,
      // zombies, meme photos) — identified by material name.
      const mm = Array.isArray(o.material) ? o.material[0] : o.material;
      const mn = (mm && mm.name) || '';
      if (/shrek|zombie|shrig|skibidi|toilet|maib|metkeys|photo_/i.test(mn) || /shrek|zombie|skibidi/i.test(o.name)) { o.visible = false; return; }
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

    // normalize mode (guide pipeline): scale the WHOLE map so its longest ground
    // axis = fit.normalize, then centre the full footprint on the origin. Anchor
    // coords in the level are given in this normalized space.
    if (fit.normalize) {
      full.getSize(s);
      const nscale = fit.normalize / Math.max(s.x, s.z || 1);
      m.scale.setScalar(nscale); if (fit.yaw) m.rotation.y = fit.yaw * Math.PI / 180; m.updateWorldMatrix(true, true);
      const fb = new THREE.Box3().setFromObject(m); const fc = new THREE.Vector3(); fb.getCenter(fc);
      m.position.set(-fc.x + (fit.offX || 0), -fb.min.y + (fit.groundY || 0), -fc.z + (fit.offZ || 0));
      this.map = m; this.scene.add(m); m.updateMatrixWorld(true);
      return this._finishMapLoad(m, level);
    }
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
    this.map = m; this.scene.add(m); m.updateMatrixWorld(true);
    return this._finishMapLoad(m, level);
  }

  // Shared map post-processing: pick a ground-level spawn, snap it to y=0, and
  // build the walkable grid. Works for both the hand-fit city and normalized maps.
  _finishMapLoad(m, level) {
    const down = new THREE.Vector3(0, -1, 0);
    const probe = (x, z) => { const rc = new THREE.Raycaster(new THREE.Vector3(x, 800, z), down, 0, 4000); return rc.intersectObject(m, true).find((h) => h.object.visible) || null; };

    // Prefer a road/ground mesh at the lowest common surface for the spawn (city);
    // forests have no such names, so this falls back to the level's spawnStart.
    // Stashed on the instance (map-keyed) because _buildWorld rebuilds this.L.
    this._streetSpawn = null;
    let sp = level.spawnStart || { x: 0, z: 0 };
    if (level.harvest && !level.mapFit?.normalize) {
      const streetRe = /road|street|asphalt|sidewalk|crosswalk|pavement|ground|floor|bg_/i;
      const B = (level.bounds ? Math.min(level.bounds.hx, level.bounds.hz) : level.B) - 6;
      let best = null;
      for (let z = B; z >= -B; z -= 6) for (let x = -B; x <= B; x += 6) {
        const h = probe(x, z); if (!h) continue;
        if (!streetRe.test(h.object.name || '')) continue;
        const y = h.point.y, dOrigin = x * x + z * z;
        if (!best || y < best.y - 0.6 || (Math.abs(y - best.y) <= 0.6 && dOrigin < best.d)) best = { x, z, y, d: dOrigin };
      }
      if (best) { sp = { x: best.x, z: best.z }; this._streetSpawn = { map: level.id, x: sp.x, z: sp.z }; }
    } else if (level.spawnStart) {
      this._streetSpawn = { map: level.id, x: level.spawnStart.x, z: level.spawnStart.z };
    }

    // Snap ground under the spawn to y=0 (player feet at 0; fixes sinking).
    const gh = probe(sp.x, sp.z);
    if (gh) { m.position.y -= gh.point.y; this._mapGroundY = 0; }

    // Walkable grid: a cell is walkable only where ground sits near y=0. Blocks the
    // void AND anything tall (rooftops / trees / rocks), so it doubles as collision.
    // Built once at load; per-frame movement does an O(1) lookup.
    this._walk = null;
    if (level.harvest && level.bounds) {
      m.updateMatrixWorld(true);
      const cell = 3, bx2 = level.bounds.hx, bz2 = level.bounds.hz;
      const hi = (level.mapFit && level.mapFit.walkTop != null) ? level.mapFit.walkTop : 5;
      const nx = Math.ceil((bx2 * 2) / cell) + 1, nz = Math.ceil((bz2 * 2) / cell) + 1;
      const bits = new Uint8Array(nx * nz);
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const x = -bx2 + i * cell, z = -bz2 + j * cell; const h = probe(x, z);
        if (h && h.point.y > -3 && h.point.y < hi) bits[j * nx + i] = 1;
      }
      this._walk = { cell, bx: bx2, bz: bz2, nx, nz, bits };

      // Spawn the player in the most OPEN part of the walkable area (the cell with the
      // greatest clearance to any wall/void), so they start with room on all sides
      // instead of jammed against an edge. A cheap two-pass chamfer distance transform
      // over the grid, then pick the max. Keeps the map + all guide anchors untouched.
      if (level.mapFit && level.mapFit.normalize && level.spawnStart) {
        // clearance (chamfer distance to nearest wall/void), two passes
        const INF = 1e6, dist = new Float32Array(nx * nz);
        for (let k = 0; k < nx * nz; k++) dist[k] = bits[k] ? INF : 0;
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (!bits[k]) continue; let d = dist[k]; if (i > 0) d = Math.min(d, dist[k - 1] + 1); if (j > 0) d = Math.min(d, dist[k - nx] + 1); dist[k] = d; }
        for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; if (!bits[k]) continue; let d = dist[k]; if (i < nx - 1) d = Math.min(d, dist[k + 1] + 1); if (j < nz - 1) d = Math.min(d, dist[k + nx] + 1); dist[k] = d; }
        // Pick the most-open cell NEAR the designer's spawnStart (within a radius),
        // so the intended location is honoured — just nudged onto nearby open ground,
        // not teleported to a far/edge pocket that merely has the highest clearance.
        const sc = Math.round((level.spawnStart.x + bx2) / cell), sj = Math.round((level.spawnStart.z + bz2) / cell);
        const R = 6; let best = -1, bd = -1;
        for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) { const ii = sc + di, jj = sj + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue; const k = jj * nx + ii; if (!bits[k]) continue; if (dist[k] > bd) { bd = dist[k]; best = k; } }
        if (best >= 0) { const s = { x: -bx2 + (best % nx) * cell, z: -bz2 + ((best / nx) | 0) * cell }; level.spawnStart.x = s.x; level.spawnStart.z = s.z; if (this._streetSpawn) { this._streetSpawn.x = s.x; this._streetSpawn.z = s.z; } }
      }
    }
    this._applyLevelEnv(level);
    return m;
  }

  // O(1) walkable lookup against the grid built in _loadMapModel. Non-harvest
  // (procedural) maps have no grid → everything within bounds is walkable.
  _walkable(x, z) {
    const w = this._walk; if (!w) return true;
    const i = Math.round((x + w.bx) / w.cell), j = Math.round((z + w.bz) / w.cell);
    if (i < 0 || j < 0 || i >= w.nx || j >= w.nz) return false;
    return w.bits[j * w.nx + i] === 1;
  }

  // Snap level anchors (spawn/cores/crates/shop/portal) onto cells that are both
  // walkable AND reachable from the spawn, so nothing is placed inside a tree or in
  // an island the player can never walk to. BFS a reach mask once, then nearest-snap.
  _snapAnchors(L) {
    const w = this._walk; if (!w || !L.spawnStart) return;
    const { nx, nz, cell, bx, bz, bits } = w;
    const idxOf = (x, z) => { const cx = Math.round((x + bx) / cell), cz = Math.round((z + bz) / cell); return (cx < 0 || cz < 0 || cx >= nx || cz >= nz) ? -1 : cz * nx + cx; };
    const nearestWalkable = (x, z) => {
      const cx = Math.round((x + bx) / cell), cz = Math.round((z + bz) / cell);
      for (let rad = 0; rad < Math.max(nx, nz); rad++)
        for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== rad) continue;
          const ix = cx + dx, iz = cz + dz; if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) continue;
          if (bits[iz * nx + ix]) return iz * nx + ix;
        }
      return -1;
    };
    // BFS the reachable region from the spawn cell.
    let s = idxOf(L.spawnStart.x, L.spawnStart.z); if (s < 0 || !bits[s]) s = nearestWalkable(L.spawnStart.x, L.spawnStart.z);
    if (s < 0) return;
    const reach = new Uint8Array(nx * nz), q = new Int32Array(nx * nz); let head = 0, tail = 0;
    reach[s] = 1; q[tail++] = s;
    while (head < tail) { const idx = q[head++], cx = idx % nx, cz = (idx / nx) | 0;
      if (cx + 1 < nx && bits[idx + 1] && !reach[idx + 1]) { reach[idx + 1] = 1; q[tail++] = idx + 1; }
      if (cx - 1 >= 0 && bits[idx - 1] && !reach[idx - 1]) { reach[idx - 1] = 1; q[tail++] = idx - 1; }
      if (cz + 1 < nz && bits[idx + nx] && !reach[idx + nx]) { reach[idx + nx] = 1; q[tail++] = idx + nx; }
      if (cz - 1 >= 0 && bits[idx - nx] && !reach[idx - nx]) { reach[idx - nx] = 1; q[tail++] = idx - nx; }
    }
    const toWorld = (i) => ({ x: (i % nx) * cell - bx, z: ((i / nx) | 0) * cell - bz });
    const snap = (x, z) => {
      const ci = idxOf(x, z); if (ci >= 0 && reach[ci]) return { x, z }; // already good — keep exact
      let best = -1, bd = 1e18;
      for (let i = 0; i < reach.length; i++) { if (!reach[i]) continue; const p = toWorld(i); const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = i; } }
      return best >= 0 ? toWorld(best) : { x, z };
    };
    const s0 = snap(L.spawnStart.x, L.spawnStart.z); L.spawnStart.x = s0.x; L.spawnStart.z = s0.z;
    const sp = { x: L.spawnStart.x, z: L.spawnStart.z };
    // Keep props off the spawn: snap to reachable ground, then if it landed inside
    // `clear` units of the spawn, push it OUTWARD (away from spawn) to the first
    // reachable cell past that radius — so the player isn't boxed in on drop-in.
    const place = (x, z, clear) => {
      let p = snap(x, z);
      if (clear && Math.hypot(p.x - sp.x, p.z - sp.z) < clear) {
        let ax = p.x - sp.x, az = p.z - sp.z; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
        for (let r = clear; r <= clear + 20; r += cell) {
          const q = snap(sp.x + ax * r, sp.z + az * r);
          if (Math.hypot(q.x - sp.x, q.z - sp.z) >= clear - 0.1) { p = q; break; }
        }
      }
      return p;
    };
    // Keep guide positions when reachable; only snap the unreachable ones, and only
    // push props out of a small spawn bubble so the drop-in isn't fully boxed.
    (L.cores || []).forEach((c) => { const p = place(c.x, c.z, 6); c.x = p.x; c.z = p.z; });
    if (L.shop) { const p = place(L.shop.x, L.shop.z, 6); L.shop.x = p.x; L.shop.z = p.z; }
    if (L.portal) { const p = place(L.portal.x, L.portal.z, 6); L.portal.x = p.x; L.portal.z = p.z; }
    if (L.bossSpawn) { const p = snap(L.bossSpawn.x, L.bossSpawn.z); L.bossSpawn.x = p.x; L.bossSpawn.z = p.z; }
    if (L.crates) L.crates = L.crates.map(([x, z]) => { const p = place(x, z, 6); return [p.x, p.z]; });
    this._reach = { reach, nx, nz, cell, bx, bz }; // reused by mob spawn to keep them in-region
  }

  // Pick a mob spawn: walkable, reachable, and at least minDist from the player so
  // mobs never pop in right on top of them. Search OUTWARD from the requested edge
  // point (which is already far), never toward the player.
  _spawnWalkable(x, z) {
    if (!this._walk) return { x, z };
    const p = this.player.position, MIN = 16;
    const ok = (px, pz) => {
      if (!this._walkable(px, pz)) return false;
      if (Math.hypot(px - p.x, pz - p.z) < MIN) return false;
      if (!this._flow) return true;
      return this._flowDir(px, pz) || Math.hypot(px - p.x, pz - p.z) < 4;
    };
    if (ok(x, z)) return { x, z };
    for (let rad = 2; rad <= 44; rad += 2)
      for (let a = 0; a < 6.28; a += 0.35) { const nx = x + Math.cos(a) * rad, nz = z + Math.sin(a) * rad; if (ok(nx, nz)) return { x: nx, z: nz }; }
    // fallback: a reachable point on a ring at MIN distance around the player
    for (let a = 0; a < 6.28; a += 0.25) { const nx = p.x + Math.cos(a) * MIN, nz = p.z + Math.sin(a) * MIN; if (this._walkable(nx, nz) && (!this._flow || this._flowDir(nx, nz))) return { x: nx, z: nz }; }
    return { x, z };
  }

  // Flow field: BFS distance-to-player over walkable cells. Mobs follow the
  // gradient (see _flowDir) so they path AROUND walls/trees instead of stalling
  // against them. One BFS feeds every mob; rebuilt a few times a second.
  _buildFlowField() {
    const w = this._walk; if (!w || !this.player) { this._flow = null; return; }
    const { nx, nz, cell, bx, bz, bits } = w;
    const px = Math.round((this.player.position.x + bx) / cell), pz = Math.round((this.player.position.z + bz) / cell);
    if (px < 0 || pz < 0 || px >= nx || pz >= nz || !bits[pz * nx + px]) { this._flow = null; return; }
    const dist = (this._flowBuf && this._flowBuf.length === nx * nz) ? this._flowBuf : (this._flowBuf = new Int16Array(nx * nz));
    dist.fill(-1);
    const q = this._flowQ || (this._flowQ = new Int32Array(nx * nz));
    let head = 0, tail = 0; const start = pz * nx + px; dist[start] = 0; q[tail++] = start;
    while (head < tail) {
      const idx = q[head++]; const cx = idx % nx, cz = (idx / nx) | 0, d = dist[idx];
      if (cx + 1 < nx && bits[idx + 1] && dist[idx + 1] < 0) { dist[idx + 1] = d + 1; q[tail++] = idx + 1; }
      if (cx - 1 >= 0 && bits[idx - 1] && dist[idx - 1] < 0) { dist[idx - 1] = d + 1; q[tail++] = idx - 1; }
      if (cz + 1 < nz && bits[idx + nx] && dist[idx + nx] < 0) { dist[idx + nx] = d + 1; q[tail++] = idx + nx; }
      if (cz - 1 >= 0 && bits[idx - nx] && dist[idx - nx] < 0) { dist[idx - nx] = d + 1; q[tail++] = idx - nx; }
    }
    this._flow = { dist, nx, nz, cell, bx, bz };
  }

  // Set this._flowVec to the downhill (toward-player) direction at (x,z). Returns
  // false when off-grid or in an unreachable pocket (caller falls back to direct).
  _flowDir(x, z) {
    const f = this._flow; if (!f) return false;
    const cx = Math.round((x + f.bx) / f.cell), cz = Math.round((z + f.bz) / f.cell);
    if (cx < 0 || cz < 0 || cx >= f.nx || cz >= f.nz) return false;
    const here = f.dist[cz * f.nx + cx]; if (here < 0) return false;
    let best = here, bdx = 0, bdz = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue; const ix = cx + dx, iz = cz + dz;
      if (ix < 0 || iz < 0 || ix >= f.nx || iz >= f.nz) continue;
      const dd = f.dist[iz * f.nx + ix];
      if (dd >= 0 && dd < best) { best = dd; bdx = dx; bdz = dz; }
    }
    if (!bdx && !bdz) return false;
    this._flowVec = this._flowVec || new THREE.Vector3();
    this._flowVec.set(bdx, 0, bdz).normalize(); return true;
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
    const wrap = new THREE.Group(); const inst = rec.scene.clone(true); inst.scale.setScalar(rec.fit * 1.35);
    const b = new THREE.Box3().setFromObject(inst); const c = new THREE.Vector3(); b.getCenter(c); inst.position.sub(c);
    // held forward at shoulder height so it clears the body silhouette and reads
    // from the top-down camera.
    wrap.add(inst); wrap.position.set(0.5, 1.5, 1.1);
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
    if (this._camFlip) { dx = -dx; dz = -dz; }
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
  _channelTime(it) { return { core: 1.6, crate: 0.9, portal: 0.7, extract: 0.7, shop: 0.4 }[it.type] || 1; }

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
    // world-anchored prompt: project the interactable's position to the screen so
    // the "해킹/회수 + gauge" floats ON the model, not as a big center layer.
    const key = it ? { core: 'prompt.core', crate: 'prompt.crate', extract: 'prompt.extract', portal: 'prompt.portal', shop: 'prompt.shop' }[it.type] : null;
    if (it) {
      const yOff = it.type === 'core' ? 3.2 : it.type === 'crate' ? 1.9 : it.type === 'shop' ? 4 : 3.4;
      const v = new THREE.Vector3(it.x, yOff, it.z).project(this.cam);
      const w = this.rend.domElement.clientWidth, h = this.rend.domElement.clientHeight;
      const onScreen = v.z < 1 && Math.abs(v.x) < 1.3 && Math.abs(v.y) < 1.3;
      this.hud.setWorldPrompt(onScreen, (v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h, key, frac, this.isTouch);
    } else this.hud.setWorldPrompt(false);
    this.state.prompt = key; this.state.channelFrac = frac;
  }

  _completeInteract(it) {
    if (it.type === 'core' && !it.done) {
      it.done = true;
      // recolor the beacon ring group to the "breached" green
      if (it.gring) it.gring.traverse((o) => { if (o.isMesh && o.material) o.material.color.set(0x59ff9d); });
      this.state.cores++; this._impact(it.mesh.position, 0x59ff9d, 20, 7); this.fx.shake = 0.5; this._event(t('evt.breached', { id: it.id })); this.audio.levelUp();
      const need = (this.L.cores || []).length;
      if (this.state.cores >= need) { this._activatePortal(); }
      else { this.state.objectiveKey = 'obj.coreB'; }
      if (this._tut && this.tut.step === 7) this._tutAdvance(); // tutorial HACK step
    } else if (it.type === 'crate' && !it.done) {
      it.done = true; const o = this.obstacles.find((x) => x.x === it.x && x.z === it.z); if (o) o.dead = true;
      // crack it open: play the chest's open clip once (fall back to a pop) and
      // spray scrap coins out of the lid for a tactile payout.
      if (it.lid) { it.chestOpening = true; it.lidT = 0; } // procedural lid pop (see _simulate)
      else it.mesh.visible = false;
      const cp = new THREE.Vector3(it.x, 1, it.z);
      this._impact(cp, 0xffd23f, 16, 6); this.fx.shake = 0.28; this.audio.pickup();
      const md = this._mods();
      // Chest loot table: always some scrap + xp, and a LOW chance of the next
      // weapon (chests are now the only weapon source).
      const nextW = WEAPON_DROP_ORDER.find((k) => !this.state.owned[k]);
      if (nextW && Math.random() < 0.25) { this._spawnItemDrop(cp, 'weapon'); this._event(t('evt.acquired', { name: locName(this.WEAPONS[nextW]) })); }
      else this._event(t('evt.salvage'));
      const payout = Math.ceil((10 + Math.random() * 14) * md.gold);
      for (let k = 0; k < 4; k++) this._drop(new THREE.Vector3(it.x + (Math.random() - 0.5) * 1.4, 0, it.z + (Math.random() - 0.5) * 1.4), 1);
      this.state.gold += payout; this._gainXp(8 * md.xp); this.hud.pushLoot('◈', '+' + payout, '#ffd23f');
      if (this._tut && this.tut.step === 6) this._tutAdvance(); // tutorial OPEN step
    } else if (it.type === 'shop') {
      // reusable — open the weapon shop; the tutorial SHOP step also accepts this.
      this.openPanel('weapons');
      if (this._tut && this.tut.step === 5) this._tutAdvance();
      return; // don't mark done / re-channel each visit
    } else if (it.type === 'portal' && it.active) {
      // Portal is the tutorial's final step — finish the tutorial, then cross.
      if (this._tut) { this._tut = false; this._tutSeen = true; this.state.tutorial = false; this._event(t('evt.tutDone')); }
      this._enterPortal(it.to);
    } else if (it.type === 'extract' && it.active) { this._win(); }
    this.refresh();
  }

  // Reveal the boss-map portal once the town cores are breached.
  _activatePortal() {
    const p = this.interact.find((x) => x.type === 'portal'); if (!p) return;
    p.active = true; p.mesh.visible = true; this.state.objectiveKey = 'obj.portal';
    this._event(t('evt.portal')); this.fx.shake = 0.6; this.audio.levelUp();
  }

  _enterPortal(to) { return this._goToMap(to); }

  // Fade-through transition to any map (tutorial → city → boss, or restart).
  // Clears the run's transient entities, swaps the map, rebuilds, sets the
  // objective, and spawns the boss when entering the boss arena.
  async _goToMap(to) {
    if (this._transitioning) return; this._transitioning = true;
    // try/finally guarantees the transition overlay + flag ALWAYS clear, even if a
    // map load throws or re-entrancy hits — otherwise the fade covers the screen
    // forever and the player appears frozen ("loading, can't move").
    try {
      this.audio.ui(); this._fade(1, 240);
      if (this.dom.trans) this.dom.trans.style.display = 'grid';
      await new Promise((r) => setTimeout(r, 260));
      this.enemies.forEach((e) => { if (e.userData.boss) clearBossCast(this, e); if (e.userData.hpBar) this.scene.remove(e.userData.hpBar); });
      for (const arr of [this.enemies, this.bullets, this.enemyBullets, this.orbs, this.coins, this.parts, this.ghosts, this.fxSprites, this.dmgNums || [], this.itemDrops || []]) {
        arr.forEach((o) => { if (o.parent) o.parent.remove(o); else this.scene.remove(o); }); arr.length = 0;
      }
      this.boss = null; this.state.bossActive = false; this.hud.hideCast(); this.portalObj = null;
      if (this.map) { this.scene.remove(this.map); this.map = null; }
      this.mapId = to;
      const entry = MAPS[to], level = entry.build();
      if (entry.model) await this._loadMapModel(entry.model, level); else this._applyLevelEnv(level);
      if (this._dead) return;
      this._buildWorld(); this._buildPlayer();
      if (level.boss) { this.state.objectiveKey = 'obj.boss'; this.game.grace = 2.5; this._spawnBoss(); }
      else if (to === 'tutorial') { this.state.objectiveKey = 'tut:0'; this.game.grace = CONFIG.spawn.tutGrace; }
      else if (to === 'main' || to === 'city') { this.state.objectiveKey = 'obj.coreA'; this.game.grace = 1.5; }
      this.game.spawnT = 2.5; this.game.fireT = 0;
      await new Promise((r) => setTimeout(r, 260));
    } catch (err) {
      console.warn('[map] transition failed:', err);
    } finally {
      if (this.dom.trans) this.dom.trans.style.display = 'none';
      this._fade(0, 450);
      this._transitioning = false; this.refresh();
    }
  }

  _fade(to, ms) { const el = this.dom.fade; if (!el) return; el.style.transition = `opacity ${ms}ms`; el.style.opacity = to; }

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
      // Acquire only — do NOT auto-swap the active weapon out from under the
      // player mid-fight; they switch via number keys / cycle / shop.
      if (key) { const w = this.WEAPONS[key]; this.state.owned = { ...this.state.owned, [key]: true }; this._event(t('evt.acquired', { name: locName(w) })); this.hud.pushLoot(w.icon, locName(w), w.color); }
      else { this.state.gold += 30; this._event(t('evt.scrap30')); this.hud.pushLoot('◈', '+30', '#ffb03b'); }
    } else if (kind === 'health') {
      this.state.hp = Math.min(this.state.maxHp + Math.round(md.hp), this.state.hp + CONFIG.drops.healAmount); this._event(t('evt.hull', { n: CONFIG.drops.healAmount })); this.hud.pushLoot('✚', '+' + CONFIG.drops.healAmount, '#59ff9d');
    } else { const amt = Math.ceil(20 * md.gold); this.state.gold += amt; this._event(t('evt.scrap')); this.hud.pushLoot('◈', '+' + amt, '#ffb03b'); }
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
    // additive attack jab (skip re-trigger if one is already early in its swing so
    // fast weapons don't buzz)
    const aa = this.attackAction;
    if (aa && (!aa.isRunning() || aa.time > aa.getClip().duration * 0.45)) {
      aa.reset(); aa.setEffectiveWeight(0.9); aa.setEffectiveTimeScale(1.35); aa.play();
    }
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
    // FIRE lesson now completes by destroying the scarecrow (see _updateTutorial);
    // count shots only as an anti-softlock fallback if the target is somehow gone.
    if (this._tut && this.tut.step === 1 && !this.tut.fireTarget) { this.tut.shots++; if (this.tut.shots >= 6) this._tutAdvance(); }
  }

  // ---------- enemies ----------
  _makeEnemyModel(key, scaleMul) {
    const rec = this.enemyModels && this.enemyModels[key]; if (!rec) return null;
    const wrap = new THREE.Group(); const inst = cloneSkinned(rec.scene); // skinned-safe clone
    inst.scale.setScalar(rec.fit * (scaleMul || 1));
    const b = characterBox(inst); const c = new THREE.Vector3(); b.getCenter(c);
    inst.position.x -= c.x; inst.position.z -= c.z; inst.position.y -= b.min.y;
    // Perf for crowds: enemies don't cast shadows (huge shadow-pass saving with many
    // mobs) and ARE frustum-culled so off-screen mobs skip draw + skinning. The
    // bounding sphere is inflated so animated poses don't pop at the screen edge.
    inst.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      o.castShadow = false; o.frustumCulled = true;
      if (o.geometry) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); if (o.geometry.boundingSphere) o.geometry.boundingSphere.radius *= 2.4; }
    });
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
    const spot = this._spawnWalkable(sp[0], sp[1]);
    g.position.set(spot.x, 0, spot.z);
    const hp = conf.hp * (1 + t / CONFIG.spawn.hpScale);
    g.userData = Object.assign(g.userData || {}, {
      hp, maxHp: hp, spd: conf.spd, dmg: conf.dmg, r: conf.s + 0.35, tier,
      spin: (Math.random() - 0.5) * 3, mesh: glbMesh ? null : (g.userData.mesh || g.children[0]), mixer, glb: glbMesh, tint: conf.c,
      home: { x: sp[0], z: sp[1] }, aggro: false, sightR: conf.sight, ph: Math.random() * 6.28, lungeT: 0, atkT: 0,
      atkRange: conf.atkRange, windup: conf.windup, atkCd: conf.atkCd, ranged: !!conf.ranged, keep: conf.keep || 0, projSpeed: conf.projSpeed || 20, fireT: 0, windT: 0,
    });
    const hb = this._makeHpBar(conf.c); g.userData.hpBar = hb.group; g.userData.hpFill = hb.fill; g.userData.barY = tier === 2 ? 2.0 : 2.7;
    this.scene.add(hb.group);
    this.scene.add(g); this.enemies.push(g);
  }

  // A straw training dummy for the FIRE lesson: a cross-post scarecrow placed far
  // out in front. It never moves or hits back — the player just shoots it apart.
  // Returns the entity so the tutorial can watch for its destruction.
  _spawnScarecrow(dist = 14) {
    const grp = new THREE.Group();
    const straw = new THREE.MeshStandardMaterial({ color: 0xd9a441, emissive: 0x6b4a12, emissiveIntensity: 0.5, roughness: 0.9 });
    const burlap = new THREE.MeshStandardMaterial({ color: 0xcdb083, emissive: 0x5a4a2a, emissiveIntensity: 0.5, roughness: 1 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.9 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.6, 8), wood); post.position.y = 1.3; grp.add(post);
    const arms = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.16, 0.16), wood); arms.position.y = 1.85; grp.add(arms);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.8, 6, 10), straw); body.position.y = 1.55; grp.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), burlap); head.position.y = 2.35; grp.add(head);
    // burlap-sack face (two stitched eyes + a seam mouth), turned to the player
    const dot = new THREE.MeshBasicMaterial({ color: 0x241a10 });
    const eL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), dot); eL.position.set(-0.14, 2.4, 0.38); grp.add(eL);
    const eR = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), dot); eR.position.set(0.14, 2.4, 0.38); grp.add(eR);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.5, 10), straw); hat.position.y = 2.75; grp.add(hat);
    const strawTuft = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 5), straw);
    strawTuft.position.set(1.15, 1.85, 0); strawTuft.rotation.z = Math.PI / 2; grp.add(strawTuft);
    grp.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    // Place it out in front, toward the arena centre (0,0) from the player, so it's
    // always on-screen regardless of which way the player last moved.
    const p = this.player.position;
    let dx = -p.x, dz = -p.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    grp.position.set(p.x + dx * dist, 0, p.z + dz * dist);
    // aim the player's facing at it too, so the arrow/camera lead points forward
    this.aim.set(dx, 0, dz); this.face = Math.atan2(dx, dz); this.aimGroup.rotation.y = this.face;
    const hp = 40;
    // Wide hit radius: bullets fly at ~1.05 height while this sits at y=0, so a small
    // r would let dead-on shots miss on the vertical gap. It's a big target anyway.
    grp.userData = { hp, maxHp: hp, spd: 0, dmg: 0, r: 1.5, tier: 0, spin: 0, mesh: body, mixer: null, glb: false,
      tint: 0xd9a441, home: { x: grp.position.x, z: grp.position.z }, aggro: false, sightR: 0, static: true, dummy: true,
      atkRange: 0, windup: 0, atkCd: 0, ranged: false, keep: 0, projSpeed: 0, fireT: 0, windT: 0, lungeT: 0, atkT: 0 };
    const hb = this._makeHpBar(0xd9a441); grp.userData.hpBar = hb.group; grp.userData.hpFill = hb.fill; grp.userData.barY = 3.1;
    this.scene.add(hb.group); this.scene.add(grp); this.enemies.push(grp);
    return grp;
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
    for (const arr of [this.enemies, this.bullets, this.enemyBullets, this.orbs, this.coins, this.parts, this.ghosts, this.fxSprites, this.dmgNums || [], this.itemDrops || []]) {
      arr.forEach((o) => { if (o.parent) o.parent.remove(o); else this.scene.remove(o); }); arr.length = 0;
    }
    this.hud.hideCast(); this.boss = null;
    Object.assign(this.state, this._freshState());
    this.refresh();
  }

  // Start a fresh run. Tutorial runs on the small training bay; skipping (or a
  // redeploy) drops straight into the city. _goToMap does the map load + build.
  _reset(tutorial) {
    this._tut = !!tutorial;
    // Cover the screen BEFORE the start overlay is dismissed, so the home-background
    // map isn't flashed for a frame while the real map loads.
    if (this.dom.trans) this.dom.trans.style.display = 'grid';
    this._fade(1, 0);
    Object.assign(this.state, this._freshState(), { started: true, tutorial: this._tut });
    this.tut = { step: 0, move: 0, shots: 0, dashed: false, killBase: 0, timer: 0, dummied: false };
    this.game = { fireT: 0, spawnT: CONFIG.spawn.firstDelay, hurtT: 0, hudT: 0, ghostT: 0, grace: this._tut ? CONFIG.spawn.tutGrace : CONFIG.spawn.grace };
    this.fx = { shake: 0, freeze: 0, tScale: 1, tTarget: 1, fov: 0, muzzle: 0, dashT: 0, iframe: 0, dashDir: new THREE.Vector3(), recoil: 0, hitPunch: 0, camKick: new THREE.Vector3() };
    this.refresh();
    this._goToMap(this._tut ? 'tutorial' : 'main');
  }

  _tutAdvance() {
    if (!this._tut) return; this.tut.step++; const s = this.tut.step;
    if (s >= TUTORIAL.length) {
      this._tut = false; this._tutSeen = true; this.state.tutorial = false;
      this._event(t('evt.tutDone'));
      this._goToMap('main'); // training done → cross into the city
      return;
    }
    const step = TUTORIAL[s]; this.state.objectiveKey = 'tut:' + s; this._event(getLang() === 'ko' ? (step.toastKo || '') : (step.toast || '')); this.tut.killBase = this.state.kills; this.tut.timer = 0;
    this._tutReveal(s);   // pop in the object this step is about (shop/chest/core)
    // FIRE lesson: stand a straw scarecrow out in front to shoot apart.
    if (s === 1) this.tut.fireTarget = this._spawnScarecrow(14);
    if (s === 3) this._spawnItemDrop({ x: this.player.position.x + Math.cos(this.face) * 6, z: this.player.position.z + Math.sin(this.face) * 6 }, 'scrap');
    // Buy step: grant enough scrap for the cheapest STILL-UNOWNED weapon (the
    // pickup step already gifted the first one), so the shop lesson can't soft-lock.
    // The step completes on the actual purchase (see pickWeapon).
    if (s === 5) {
      const costs = Object.keys(this.WEAPONS).filter((k) => !this.state.owned[k] && (this.WEAPONS[k].cost || 0) > 0).map((k) => this.WEAPONS[k].cost);
      const need = costs.length ? Math.min(...costs) : 40;
      this.state.gold = Math.max(this.state.gold, need + 10);
    }
    // Upgrade step: hand out a skill point so the Tech-Tree lesson can't soft-lock.
    if (s === 8) this.state.skillPoints = Math.max(this.state.skillPoints, 1);
    if (step.dummies && !this.tut.dummied) {
      this.tut.dummied = true;
      for (let k = 0; k < 3; k++) { this._spawnEnemy(); const e = this.enemies[this.enemies.length - 1]; const a = k * 2.1; e.position.set(this.player.position.x + Math.cos(a) * 18, 0, this.player.position.z + Math.sin(a) * 18); e.userData.home = { x: e.position.x, z: e.position.z }; }
    }
    this.refresh();
  }

  // ---------- collision ----------
  _inSafe(pos) { const s = this.L && this.L.safe; if (!s) return false; return Math.hypot(pos.x - s.x, pos.z - s.z) < s.r; }
  _keepOutSafe(pos, radius) { const s = this.L && this.L.safe; if (!s) return; const dx = pos.x - s.x, dz = pos.z - s.z, d = Math.hypot(dx, dz), min = s.r + (radius || 0); if (d < min && d > 0) { pos.x = s.x + dx / d * min; pos.z = s.z + dz / d * min; } }
  _collide(pos, radius) {
    // On natural (normalized) maps the walkable grid IS the terrain collision:
    // player/mobs slide off non-walkable cells. Harvested mesh boxes (env) would
    // double-collide and fight that slide — a mob straddling a tree box gets
    // ejected outward while the chase flow pushes it back in, deadlocking it in
    // place. So when a grid exists, skip env boxes here (bullets/LoS keep their
    // own obstacle checks). Gameplay solids (crates/shop/cores) have no env flag.
    const grid = !!this._walk;
    for (const o of this.obstacles) {
      if (o.dead) continue;
      if (grid && o.env) continue;
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

    if (this._booting) this._driveBootBar(rdt);
    if (playing) this._simulate(dt, rdt, md, fx);

    this._animateDetached(rdt);
    this._updateCamera(rdt, fx, playing);
    // Occluder-fade only helps when occluders are separable meshes (procedural /
    // city). On natural maps the whole map is a few combined meshes, so fading one
    // dims half the scene — there the see-through hero (X-ray twin) handles it.
    if (playing && !this._walk) this._updateOcclusion();
    if (playing) this._updateHeroXray();
    this._updateThreatArrows();

    // Adaptive quality: watch a smoothed frame time and shed cost under load so the
    // game never stutters with lots of mobs/bullets — first drop bloom, then the
    // pixel ratio; restore both when it's comfortably fast again. Never adds cost.
    this._perfMs = this._perfMs == null ? 16 : this._perfMs + ((rdt * 1000) - this._perfMs) * 0.06;
    if (playing) this._applyAdaptiveQuality();

    const useBloom = this.composer && CONFIG.render.bloom > 0.01 && this._q !== 0;
    if (this.bloom && useBloom) { const bs = CONFIG.render.bloom * (this._q === 1 ? 0.6 : 1); if (Math.abs(this.bloom.strength - bs) > 0.01) this.bloom.strength = bs; }
    if (useBloom) this.composer.render(); else this.rend.render(this.scene, this.cam);

    // (loading screen is dismissed in _init once essentials finish loading)
  }

  _simulate(dt, rdt, md, fx) {
    this.state.time += dt;
    // aim / facing
    if (!this.isTouch) {
      this.ray.setFromCamera(this.input.mouseNDC, this.cam); const hit = new THREE.Vector3();
      if (this.ray.ray.intersectPlane(this.groundPlane, hit)) this.aim.copy(hit.sub(this.player.position).setY(0).normalize());
    } else {
      if (this.input.rightStick && (this.input.aimVec.x || this.input.aimVec.y)) { this.aim.set(this.input.aimVec.x, 0, this.input.aimVec.y); if (this._camFlip) this.aim.negate(); this.aim.normalize(); }
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
    if (this._camFlip) { ix = -ix; iz = -iz; }
    const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
    const sprint = this.input.keys['shift'] ? CONFIG.player.sprintMul : 1;
    const base = CONFIG.player.moveSpeed * md.spd * sprint;
    if (fx.dashT > 0) this.vel.set(this.fx.dashDir.x * CONFIG.player.dashSpeed, 0, this.fx.dashDir.z * CONFIG.player.dashSpeed);
    else { const target = new THREE.Vector3(ix * base, 0, iz * base); this.vel.lerp(target, Math.min(1, rdt * CONFIG.player.accel)); }
    const np = this.player.position.clone().addScaledVector(this.vel, dt); this._collide(np, CONFIG.player.radius);
    // stay on walkable street ground (block void / rooftops), sliding per-axis
    if (this._walk && !this._walkable(np.x, np.z)) {
      const cur = this.player.position;
      if (this._walkable(np.x, cur.z)) np.z = cur.z;
      else if (this._walkable(cur.x, np.z)) np.x = cur.x;
      else { np.x = cur.x; np.z = cur.z; }
    }
    this.player.position.copy(np);

    // dash regen
    if (this.state.dashCharges < md.dashchg) { this.game._dregen = (this.game._dregen || 0) + dt; const cd = CONFIG.player.dashRegen * md.dashcd; this.game.dashFrac = Math.min(1, this.game._dregen / cd); if (this.game._dregen >= cd) { this.game._dregen = 0; this.state.dashCharges++; } } else this.game.dashFrac = 1;
    if (this.state.dashMax !== md.dashchg) this.state.dashMax = md.dashchg;

    this._animatePlayer(dt, rdt, fx);

    // fire
    this.game.fireT -= dt;
    let wantFire;
    if (!this.isTouch) wantFire = this.input.mouseDown;
    else if (this.input.rightStick) wantFire = true;
    // Touch auto-fire: only when an aggro'd target is in range AND has clear
    // line of sight — no wasting shots into walls at unreachable mobs.
    else wantFire = this.enemies.some((e) => (e.userData.aggro || e.userData.boss)
      && e.position.distanceToSquared(this.player.position) < 625
      && !this._losBlocked(this.player.position, e.position));
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

    // Refresh the chase flow field a few times a second (cheap BFS, feeds all mobs).
    this.game.flowT = (this.game.flowT || 0) - dt;
    if (this.game.flowT <= 0 && this.enemies.length) { this.game.flowT = 0.32; this._buildFlowField(); }

    this._updateBullets(dt);
    this._updateEnemies(dt, rdt, md, fx);
    this._updateEnemyBullets(dt);
    this._updatePickups(dt, md);

    // kill-streak window: reset the combo if no kill lands in time
    if (this.state.killStreak > 0) { this.game.streakT -= dt; if (this.game.streakT <= 0) { this.state.killStreak = 0; this.hud.hideCombo(); } }

    // channeled interaction (hold E / USE to fill the gauge) + core pulse
    this._updateChannel(dt);
    this.interact.forEach((x) => {
      if (x.wbMixer) x.wbMixer.update(rdt); // workbench idle loop
      if (x.chestOpening && x.lid) { // procedural chest-lid pop (~0.5s, eases past then settles)
        x.lidT = Math.min(1, (x.lidT || 0) + dt * 2.4);
        const e = 1 - Math.pow(1 - x.lidT, 3); // ease-out
        this._tmpQ = this._tmpQ || new THREE.Quaternion();
        this._tmpQ.setFromAxisAngle(this._axX || (this._axX = new THREE.Vector3(1, 0, 0)), -1.9 * e);
        x.lid.quaternion.copy(x.lidRest).multiply(this._tmpQ);
      }
      // pulse the interact beacon ring (cores/chests/shop) while it's still active
      if (x.gring && !x.done) { const s = 1 + Math.sin(this.state.time * 3 + (x.x || 0)) * 0.07; x.gring.scale.set(s, 1, s); }
    });
    // portal animation: spin the model + pulse the beacon light (model-based portal)
    if (this.portalObj && this.portalObj.visible) {
      const u = this.portalObj.userData;
      if (u.spin) u.spin.rotation.y += dt * 1.0;
      if (u.ring) u.ring.rotation.z += dt * 1.4;
      if (u.swirl) { u.swirl.rotation.z -= dt * 2.2; u.swirl2.rotation.z += dt * 2.2; }
      if (u.light) u.light.intensity = 2 + Math.sin(this.state.time * 4) * 0.9;
    }

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
      const b = this.bullets[i]; b.position.addScaledVector(b.userData.dir, b.userData.vel * dt); b.userData.life -= dt;
      if (b.userData.flare) { b.rotation.x += b.userData.spin * dt; b.rotation.z += b.userData.spin * 0.7 * dt; }
      let dead = b.userData.life <= 0;
      for (const o of this.obstacles) { if (o.dead) continue; if (o === this._gateObs && this.gateOpen) continue; if (Math.abs(b.position.x - o.x) < o.hw + 0.2 && Math.abs(b.position.z - o.z) < o.hd + 0.2) { dead = true; this._impact(b.position, b.userData.col, 3, 2); break; } }
      if (!dead) for (const e of this.enemies) {
        if (b.userData.hit.includes(e)) continue;
        if (b.position.distanceTo(e.position) < e.userData.r + 0.3) {
          e.userData.hp -= b.userData.dmg; b.userData.hit.push(e); e.userData.aggro = true;
          this._impact(e.position, b.userData.crit ? 0xffffff : b.userData.col, b.userData.crit ? 7 : 4, 4); e.userData.hitT = 0.08; this.audio.hit();
          this._damageNumber({ x: e.position.x, y: (e.userData.r || 1) + 1, z: e.position.z }, b.userData.dmg, b.userData.crit);
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
      // scratch vector reused each iteration (fully consumed within it; boss code
      // clones `to` when it stores it) — no per-enemy per-frame allocation.
      const to = (this._toVec || (this._toVec = new THREE.Vector3())).copy(this.player.position).sub(e.position); to.y = 0; const d = to.length(); to.normalize();
      if (u.boss) {
        updateBoss(this, e, to, d, dt, rdt); // chase / telegraphed skill / dash
      } else {
        // timers
        u.windT = Math.max(0, (u.windT || 0) - rdt); u.atkT = Math.max(0, (u.atkT || 0) - rdt); u.fireT = Math.max(0, (u.fireT || 0) - rdt);
        u.lungeT = Math.max(0, (u.lungeT || 0) - rdt);
        // Sight/aggro gate: idle (gentle bob near home) until the player comes
        // within sight or the mob is hit — so the whole map doesn't swarm at once.
        if (!u.aggro) { if (d < (u.sightR || 16)) u.aggro = true; }
        const move = (dir) => {
          // chase along the flow field (paths around walls/trees); kite/fallback = direct.
          let mv = to;
          if (dir > 0 && this._flowDir(e.position.x, e.position.z)) mv = this._flowVec;
          const ep = (this._epVec || (this._epVec = new THREE.Vector3())).copy(e.position).addScaledVector(mv, dir * u.spd * dt);
          this._collide(ep, u.r * 0.7); this._keepOutSafe(ep, u.r);
          // don't clip through non-walkable terrain; slide along it instead
          if (this._walk && !this._walkable(ep.x, ep.z)) {
            if (this._walkable(ep.x, e.position.z)) ep.z = e.position.z;
            else if (this._walkable(e.position.x, ep.z)) ep.x = e.position.x;
            else { ep.x = e.position.x; ep.z = e.position.z; }
          }
          e.position.copy(ep);
        };
        if (u.static) { e.rotation.y = Math.atan2(to.x, to.z); /* training dummy: never moves or strikes, just takes hits */ }
        else if (!u.aggro) { /* dormant: hold position */ }
        else if (u.ranged) {
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
      else if (u.glb) { if (!u.boss) e.rotation.y = Math.atan2(to.x, to.z);
        // Only skin-animate mobs the player can plausibly see. Far mobs accumulate
        // their skipped time and update in one coarse step, so skinning cost stays
        // bounded no matter how many are on the field. Boss always animates.
        if (u.mixer) { if (u.boss || d < 46) { u.mixer.update((rdt + (u._animDebt || 0)) * (1 + u.spd * 0.05)); u._animDebt = 0; } else { u._animDebt = (u._animDebt || 0) + rdt; if (u._animDebt > 0.25) { u.mixer.update(u._animDebt); u._animDebt = 0; } } }
        if (u.tier === 2 && !u.boss) e.position.y = 0.6 + Math.abs(Math.sin(this.state.time * 7 + i)) * 0.5; u.hitT = Math.max(0, (u.hitT || 0) - rdt); e.scale.setScalar(1 + (u.hitT > 0 ? 0.18 : 0) + (u.telegraph ? 0.2 : 0)); }
      if (u.boss) this.state.bossHp = Math.max(0, u.hp);
      // floating HP bar (mobs only; boss uses the top bar)
      if (u.hpBar && !u.boss) {
        const frac = Math.max(0, u.hp / u.maxHp);
        if (frac < 0.999) { u.hpBar.visible = true; u.hpBar.position.set(e.position.x, u.barY, e.position.z); u.hpBar.quaternion.copy(this.cam.quaternion); const w = u.hpBar.userData.w; u.hpFill.scale.x = frac; u.hpFill.position.x = -(w / 2) * (1 - frac); }
        else u.hpBar.visible = false;
      }

      if (u.hp <= 0) {
        this.state.kills++; this.audio.kill();
        // kill-streak / combo: consecutive kills inside a rolling window
        this.state.killStreak = (this.state.killStreak || 0) + 1;
        this.game.streakT = 2.8;
        if (this.state.killStreak > (this.state.streakBest || 0)) this.state.streakBest = this.state.killStreak;
        if (this.state.killStreak >= 2) this.hud.showCombo(this.state.killStreak);
        this._impact(e.position, (u.mesh && u.mesh.material) ? u.mesh.material.color.getHex() : (u.tint || 0xff3b6b), u.boss ? 40 : 11, u.boss ? 11 : 6);
        this._drop(e.position, u.tier);
        // No weapon drops from kills (the drop had no visible gun model) — weapons
        // now come from cracking chests. Kills give xp + a chance of health/scrap.
        if (u.boss) { this._spawnItemDrop(e.position, 'health'); this._spawnItemDrop(e.position, 'scrap'); }
        else { const r = Math.random(); if (r < CONFIG.drops.healthChance) this._spawnItemDrop(e.position, 'health'); else if (r < CONFIG.drops.healthChance + CONFIG.drops.scrapChance) this._spawnItemDrop(e.position, 'scrap'); }
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
    // Generous magnet: kills happen at bullet range, so a small radius left most
    // scrap/XP on the ground (player earned ~nothing → couldn't afford the shop).
    // A wide radius + strong pull means kills reliably fund progression.
    const pickR = 4 * md.pickup, pull = 16;
    const P = this._pickVec || (this._pickVec = new THREE.Vector3()); // reused scratch — no per-pickup alloc
    for (let i = this.orbs.length - 1; i >= 0; i--) { const o = this.orbs[i]; o.rotation.y += dt * 3; o.position.y = 0.7 + Math.sin(this.state.time * 4 + i) * 0.1; const to = P.copy(this.player.position).sub(o.position); to.y = 0; const d = to.length(); if (d < pickR) o.position.addScaledVector(to.normalize(), pull * dt); if (d < 1.3) { this._gainXp(o.userData.xp); this.scene.remove(o); this.orbs.splice(i, 1); } }
    for (let i = this.coins.length - 1; i >= 0; i--) { const c = this.coins[i]; c.rotation.z += dt * 5; const to = P.copy(this.player.position).sub(c.position); to.y = 0; const d = to.length(); if (d < pickR) c.position.addScaledVector(to.normalize(), pull * dt); if (d < 1.3) { this.state.gold += c.userData.gold; this.scene.remove(c); this.coins.splice(i, 1); } }
    const pr2 = 4 * md.pickup;
    for (let i = this.itemDrops.length - 1; i >= 0; i--) {
      const it = this.itemDrops[i]; const u = it.userData; u.life -= dt; u.ring.rotation.z += dt * 1.6; it.position.y = Math.sin(this.state.time * 2 + u.ph) * 0.12;
      const to = P.copy(this.player.position).sub(it.position); to.y = 0; const d = to.length(); if (d < pr2) { to.normalize(); it.position.x += to.x * 15 * dt; it.position.z += to.z * 15 * dt; }
      if (d < 1.4) { this._collectItem(u.kind); this.worldG.remove(it); this.itemDrops.splice(i, 1); continue; }
      if (u.life <= 0) { this.worldG.remove(it); this.itemDrops.splice(i, 1); }
    }
  }

  _updateTutorial(dt) {
    const st = this.tut;
    if (st.step === 0) { st.move += this.vel.length() * dt; if (st.move > 7) this._tutAdvance(); }
    else if (st.step === 1) { if (st.fireTarget && (st.fireTarget.userData.hp <= 0 || !st.fireTarget.parent)) { st.fireTarget = null; this._tutAdvance(); } }
    else if (st.step === 4) { if (this.state.kills - st.killBase >= 3) this._tutAdvance(); }
    // step 5 (buy a weapon) is completed by an actual purchase — see pickWeapon().
    // No auto-advance: the player must open the Shop and spend scrap.
  }

  // Floating damage number on a hit. Pooled canvas-texture billboards (reused,
  // capped at 28 live) so there is no per-hit allocation — mobile-safe juice.
  _damageNumber(pos, amount, crit) {
    if (!this.scene) return;
    this._dmgPool = this._dmgPool || [];
    let sp;
    if (this.dmgNums.length >= 28) { sp = this.dmgNums.shift(); }
    else if (this._dmgPool.length) { sp = this._dmgPool.pop(); }
    else {
      const c = document.createElement('canvas'); c.width = 128; c.height = 64;
      const tex = new THREE.CanvasTexture(c);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
      sprite.renderOrder = 6; sprite.userData = { c, ctx: c.getContext('2d'), tex };
      sp = sprite;
    }
    const u = sp.userData, ctx = u.ctx, n = Math.max(1, Math.round(amount));
    ctx.clearRect(0, 0, 128, 64);
    ctx.font = (crit ? 'bold 48px' : 'bold 36px') + " 'Chakra Petch', Arial, sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(0,0,0,.9)'; ctx.strokeText(n, 64, 32);
    ctx.fillStyle = crit ? '#ffd23f' : '#ffffff'; ctx.fillText(n, 64, 32);
    u.tex.needsUpdate = true;
    const base = crit ? 2.6 : 1.8;
    u.base = base; u.life = 0.72; u.max = 0.72; u.vy = 3.6; u.crit = crit;
    sp.material.opacity = 1;
    sp.scale.set(base, base * 0.5, 1);
    sp.position.set(pos.x + (Math.random() - 0.5) * 0.7, (pos.y || 1.3) + 0.7, pos.z + (Math.random() - 0.5) * 0.7);
    if (!sp.parent) this.scene.add(sp);
    this.dmgNums.push(sp);
  }

  _animateDetached(rdt) {
    for (let i = this.dmgNums.length - 1; i >= 0; i--) {
      const s = this.dmgNums[i], u = s.userData; u.life -= rdt;
      s.position.y += u.vy * rdt; u.vy = Math.max(0, u.vy - 6 * rdt);
      const f = Math.max(0, u.life / u.max); s.material.opacity = Math.min(1, f * 1.7);
      const pop = u.life > u.max - 0.08 ? 1 + (u.max - u.life) * 4 : 1;
      s.scale.set(u.base * pop, u.base * 0.5 * pop, 1);
      if (u.life <= 0) { this.scene.remove(s); this.dmgNums.splice(i, 1); this._dmgPool.push(s); }
    }
    for (let i = this.parts.length - 1; i >= 0; i--) { const p = this.parts[i]; p.userData.life -= rdt; p.userData.v.y -= 10 * rdt; p.position.addScaledVector(p.userData.v, rdt); p.scale.setScalar(Math.max(0.01, p.userData.life * 2.2)); if (p.userData.life <= 0) { this.scene.remove(p); this.parts.splice(i, 1); } }
    for (let i = this.ghosts.length - 1; i >= 0; i--) { const gh = this.ghosts[i]; gh.userData.life -= rdt; gh.material.opacity = Math.max(0, gh.userData.life * 1.6); if (gh.userData.life <= 0) { this.scene.remove(gh); this.ghosts.splice(i, 1); } }
    for (let i = this.fxSprites.length - 1; i >= 0; i--) { const s = this.fxSprites[i]; s.userData.life -= rdt; if (s.userData.mixer) s.userData.mixer.update(rdt); const o = Math.max(0, s.userData.life / s.userData.max); s.traverse((m) => { if (m.isMesh && m.material) m.material.opacity = o * (s.userData.grow ? 0.9 : 1); }); if (s.userData.grow) s.scale.setScalar(0.1 + (1 - o) * s.userData.grow); else s.rotation.y += rdt * 3; if (s.userData.life <= 0) { this.scene.remove(s); this.fxSprites.splice(i, 1); } }
  }

  // Segment-vs-obstacle test on the XZ plane (sampled): true if a wall sits
  // between a and b. Used to gate touch auto-fire so we don't shoot into cover.
  _losBlocked(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z; const len = Math.hypot(dx, dz) || 1;
    const steps = Math.min(24, Math.ceil(len / 1.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps, px = a.x + dx * t, pz = a.z + dz * t;
      for (const o of this.obstacles) { if (o.dead || o.env === undefined && !o.hw) continue; if (o === this._gateObs && this.gateOpen) continue; if (Math.abs(px - o.x) < o.hw && Math.abs(pz - o.z) < o.hd) return true; }
    }
    return false;
  }

  // See-through hero: show the X-ray twins ONLY when something on the map stands
  // between the camera and the player (otherwise the golden hero shows normally).
  // A single cam->player raycast per frame; GreaterDepth then limits the twins to
  // the actually-hidden pixels.
  _updateHeroXray() {
    const tw = this._xrayTwins; if (!tw || !tw.length || !this.player) return;
    let occluded = false;
    if (this.map) {
      const origin = this.cam.position, target = this._tmpV || (this._tmpV = new THREE.Vector3());
      target.copy(this.player.position); target.y += 1.0;
      const dir = target.clone().sub(origin); const dist = dir.length(); dir.normalize();
      this._occRay = this._occRay || new THREE.Raycaster();
      this._occRay.set(origin, dir); this._occRay.far = Math.max(0.1, dist - 1.3);
      occluded = this._occRay.intersectObject(this.map, true).some((h) => h.object.visible);
    }
    for (const t of tw) t.visible = occluded;
  }

  // Fade any building meshes standing between the camera and the player so the
  // hero (and nearby structures) stay visible even under tall city cover.
  _updateOcclusion() {
    if (!this.map || !this.player || !this.cam) return;
    this._occFaded = this._occFaded || new Set();
    const origin = this.cam.position.clone();
    const dir = this.player.position.clone().setY(1.2).sub(origin);
    const dist = dir.length(); dir.normalize();
    this._occRay = this._occRay || new THREE.Raycaster();
    this._occRay.set(origin, dir); this._occRay.far = Math.max(1, dist - 1.5);
    const hits = this._occRay.intersectObject(this.map, true);
    const now = new Set();
    for (const h of hits) {
      const o = h.object; if (!o.isMesh || !o.visible || !o.material) continue;
      const mat = o.material;
      if (mat.userData._occ === undefined) { mat.userData._occ = { transparent: mat.transparent, opacity: mat.opacity }; }
      mat.transparent = true; mat.depthWrite = false;
      mat.opacity = Math.max(0.18, mat.opacity - 0.35); // ease toward faded
      now.add(o); this._occFaded.add(o);
    }
    // restore meshes no longer occluding
    for (const o of this._occFaded) {
      if (now.has(o)) continue;
      const s = o.material && o.material.userData._occ;
      if (s) { o.material.opacity = Math.min(s.opacity, o.material.opacity + 0.15); if (o.material.opacity >= s.opacity - 0.02) { o.material.opacity = s.opacity; o.material.transparent = s.transparent; o.material.depthWrite = true; this._occFaded.delete(o); } }
      else this._occFaded.delete(o);
    }
  }

  // Edge-of-screen arrows pointing to off-screen aggro'd threats (+ boss). Pooled
  // DOM (≤6), rebuilt each frame from the camera projection — mobile-readable, no
  // per-arrow allocation after warmup.
  _updateThreatArrows() {
    if (this._threats === undefined) {
      const host = document.createElement('div');
      host.id = 'hudThreats';
      host.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:11;overflow:hidden';
      (this.dom.mount && this.dom.mount.parentElement ? this.dom.mount.parentElement : document.body).appendChild(host);
      this._threats = [];
      for (let i = 0; i < 6; i++) {
        const a = document.createElement('div'); a.className = 'threat-arrow'; a.style.display = 'none';
        a.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 4l10 8-10 8z"/></svg>';
        host.appendChild(a); this._threats.push(a);
      }
    }
    const playing = this.state.started && !this.state.ended && this.state.panel === 'none';
    if (!playing) { this._threats.forEach((a) => { if (a.style.display !== 'none') a.style.display = 'none'; }); return; }
    const cam = this.cam, W = window.innerWidth, H = window.innerHeight, cx = W / 2, cy = H / 2, margin = 46;
    const v = new THREE.Vector3(); const list = [];
    for (const e of this.enemies) {
      const u = e.userData; if (!u.aggro && !u.boss) continue;
      v.copy(e.position); v.y = 1.2; v.project(cam);
      const behind = v.z > 1;
      const onScreen = !behind && v.x >= -0.98 && v.x <= 0.98 && v.y >= -0.98 && v.y <= 0.98;
      if (onScreen) continue;
      let nx = v.x, ny = v.y; if (behind) { nx = -nx; ny = -ny; }
      const ang = Math.atan2(-ny, nx);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const t = Math.min((cx - margin) / Math.max(1e-3, Math.abs(ca)), (cy - margin) / Math.max(1e-3, Math.abs(sa)));
      list.push({ ex: cx + ca * t, ey: cy + sa * t, ang, boss: !!u.boss, d: e.position.distanceToSquared(this.player.position) });
    }
    list.sort((a, b) => a.d - b.d);
    for (let i = 0; i < this._threats.length; i++) {
      const a = this._threats[i], it = list[i];
      if (!it) { if (a.style.display !== 'none') a.style.display = 'none'; continue; }
      a.style.display = 'block';
      a.style.left = it.ex + 'px'; a.style.top = it.ey + 'px';
      a.style.transform = `translate(-50%,-50%) rotate(${it.ang}rad)`;
      a.style.color = it.boss ? '#ff8a3b' : '#ff3b6b';
    }
  }

  // Quality tiers driven by smoothed frame time (_perfMs), with a hold so it can't
  // oscillate: 2 = full bloom, 1 = reduced bloom, 0 = bloom off (direct render,
  // skipping the fullscreen post passes). Only ever sheds cost; never adds it.
  // Ease the loading bar toward real byte progress, with a gentle time-creep so
  // it always advances (never stalls) but never hits 100% until actually ready.
  _driveBootBar(rdt) {
    this._bootCreep = Math.min(0.9, (this._bootCreep || 0) + rdt * 0.05);
    const goal = Math.max(this._bootFraction(), this._bootCreep);
    this._bootShown = (this._bootShown || 0) + (goal - (this._bootShown || 0)) * Math.min(1, rdt * 4);
    this.hud.setLoading(this._bootShown, (this._boot && this._boot._label) || 'LOADING');
  }

  _applyAdaptiveQuality() {
    if (this._q == null) this._q = 2;
    this._qHold = (this._qHold || 0) - 1;
    if (this._qHold > 0) return;
    const ms = this._perfMs;
    if (ms > 24 && this._q > 0) { this._q--; this._qHold = 120; }
    else if (ms < 14 && this._q < 2) { this._q++; this._qHold = 120; }
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
    this.cam.lookAt(this.player.position.x, 1, this.player.position.z + (this._camFlip ? 2 : -2));
    const fov = this.baseFov + fx.fov + (this.vel ? this.vel.length() * 0.05 : 0);
    if (Math.abs(this.cam.fov - fov) > 0.01) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
    this.rim.position.set(this.player.position.x, 5, this.player.position.z);
  }

  _drop(pos, tier) {
    const md = this._mods();
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshStandardMaterial({ color: 0x59ff9d, emissive: 0x59ff9d, emissiveIntensity: 1.8 }));
    orb.position.copy(pos); orb.position.y = 0.6; orb.userData = { xp: (3 + tier * 4) * md.xp }; this.scene.add(orb); this.orbs.push(orb);
    if (Math.random() < 0.85 + tier * 0.15) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 10), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffd23f, emissiveIntensity: 0.9, metalness: 0.8 })); c.position.copy(pos); c.position.y = 0.45; c.rotation.x = Math.PI / 2; c.userData = { gold: Math.ceil((4 + tier * 4) * md.gold) }; this.scene.add(c); this.coins.push(c); }
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
    // Tutorial UPGRADE step completes when a skill point is spent.
    if (this._tut && this.tut.step === 8) { this.openPanel('none'); this._tutAdvance(); }
  }
  pickWeapon(key) {
    const ww = this.WEAPONS[key]; const own = !!this.state.owned[key];
    let bought = false;
    if (own) { this.state.weapon = key; this._attachGun(key); }
    else { if (this.state.gold < (ww.cost || 0)) return; this.state.gold -= (ww.cost || 0); this.state.owned = { ...this.state.owned, [key]: true }; this.state.weapon = key; this._attachGun(key); bought = true; }
    if (bought) { this.audio.buy(); this.fx.shake = Math.min(0.4, this.fx.shake + 0.12); this.hud.pushLoot(ww.icon, locName(ww), ww.color); } else this.audio.ui();
    this.refresh();
    // Tutorial SHOP step completes when the player picks any weapon (buy or equip).
    if (this._tut && this.tut.step === 5) { this.openPanel('none'); this._tutAdvance(); }
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

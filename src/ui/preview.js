import * as THREE from 'three';
import { loadGLB, characterBox } from '../engine/loaders.js';

// Tiny self-contained model viewer: renders one GLB to a canvas, slowly spinning,
// with its idle clip if present. Used for the home hero + HUD previews (gun /
// health chicken). Cheap — small canvas, low-poly model, one light.
export class ModelViewer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this._resize();
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(opts.fov || 32, 1, 0.05, 100);
    this.camDist = opts.camDist || 4.2; this.camY = opts.camY != null ? opts.camY : 1.2;
    this.cam.position.set(0, this.camY, this.camDist);
    this._lookY = opts.lookY != null ? opts.lookY : (opts.fitH || 2.2) * 0.5;
    this.cam.lookAt(0, this._lookY, 0);
    const hemi = new THREE.HemisphereLight(0xbfe0ff, 0x20242c, 1.15); this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xfff2d8, 1.6); dir.position.set(2, 4, 3); this.scene.add(dir);
    const rim = new THREE.DirectionalLight(0x7ff2e8, 0.7); rim.position.set(-3, 1.5, -2); this.scene.add(rim);
    this.spin = opts.spin != null ? opts.spin : 0.7;
    this.fitH = opts.fitH || 2.2;
    this.yaw = opts.yaw || 0;
    this.root = null; this.mixer = null; this.clock = new THREE.Clock();
    // Optional "walk showcase": the model paces left↔right across the view, faces
    // its heading, and pauses to turn/pose at the edges — a lively home cameo.
    this.walk = opts.walkRange ? { range: opts.walkRange, speed: opts.walkSpeed || 2.2, x: 0, dir: 1, state: 'walk', t: 0, yaw: Math.PI / 2, yawT: Math.PI / 2 } : null;
    this._actions = {};
    this._alive = true; this._loop = this._loop.bind(this);
    window.addEventListener('resize', () => this._resize());
    requestAnimationFrame(this._loop);
  }

  _resize() {
    const w = this.canvas.clientWidth || 240, h = this.canvas.clientHeight || 240;
    this.renderer.setSize(w, h, false);
    if (this.cam) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  }

  async load(url, o = {}) {
    if (url === this._url) return; this._url = url;               // no-op if unchanged
    const g = await loadGLB(url); if (!g || !this._alive || url !== this._url) return;
    if (this.root) { this.scene.remove(this.root); this.root = null; this.mixer = null; } // swap out the old model
    const wrap = new THREE.Group(); wrap.add(g.scene);
    g.scene.updateMatrixWorld(true);
    // Skinned meshes collapse to their bind pose under setFromObject — measure via
    // skeleton bones (characterBox) so the fit scale is right.
    const box = characterBox(g.scene); const size = new THREE.Vector3(); box.getSize(size);
    const s = (o.fitH || this.fitH) / (size.y || 1); g.scene.scale.setScalar(s);
    g.scene.updateMatrixWorld(true);
    const b2 = characterBox(g.scene); const c = new THREE.Vector3(); b2.getCenter(c);
    g.scene.position.x -= c.x; g.scene.position.z -= c.z; g.scene.position.y -= b2.min.y;
    wrap.rotation.y = (o.yaw != null ? o.yaw : this.yaw);
    this.scene.add(wrap); this.root = wrap;
    if (g.animations && g.animations.length) {
      this.mixer = new THREE.AnimationMixer(g.scene);
      const clips = g.animations;
      const idle = clips.find((a) => /idle|fly|breath|stand/i.test(a.name)) || clips[0];
      const move = clips.find((a) => /run|walk|move/i.test(a.name)) || clips[clips.length - 1];
      if (this.walk) {
        // keep both playing, crossfade by weight (limited-clip models still read lively)
        this._actions.idle = this.mixer.clipAction(idle); this._actions.idle.play();
        this._actions.move = this.mixer.clipAction(move); this._actions.move.play(); this._actions.move.setEffectiveWeight(0);
      } else {
        this.mixer.clipAction(idle).play();
      }
    }
    return this;
  }

  _loop() {
    if (!this._alive) return;
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.mixer) this.mixer.update(dt);
    if (this.root) {
      if (this.walk) this._stepWalk(dt);
      else this.root.rotation.y += this.spin * dt;
    }
    this.renderer.render(this.scene, this.cam);
  }

  _stepWalk(dt) {
    const w = this.walk; w.t += dt;
    const moving = w.state === 'walk';
    if (moving) {
      w.x += w.dir * w.speed * dt;
      w.yaw = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2;   // face heading
      if (Math.abs(w.x) >= w.range) { w.x = Math.sign(w.x) * w.range; w.state = 'turn'; w.t = 0; }
    } else { // turn / pose at the edge — spin to face the camera, then head back
      const p = Math.min(1, w.t / 1.1);
      w.yaw = (w.dir > 0 ? Math.PI / 2 : -Math.PI / 2) + (w.dir > 0 ? 1 : -1) * p * Math.PI;
      const bob = Math.sin(w.t * 9) * 0.06 * (1 - p);   // little shimmy
      this.root.position.y = (this._floorY || 0) + Math.abs(bob);
      if (w.t >= 1.15) { w.dir = -w.dir; w.state = 'walk'; w.t = 0; }
    }
    // ease yaw + crossfade move/idle
    w.yawT += (w.yaw - w.yawT) * Math.min(1, dt * 8);
    this.root.rotation.y = w.yawT;
    this.root.position.x = w.x;
    if (this._actions.move) {
      const target = moving ? 1 : 0;
      const mw = this._actions.move.getEffectiveWeight();
      this._actions.move.setEffectiveWeight(mw + (target - mw) * Math.min(1, dt * 6));
      this._actions.idle.setEffectiveWeight(1 - this._actions.move.getEffectiveWeight());
      this._actions.move.setEffectiveTimeScale(1.4);
    }
  }

  dispose() { this._alive = false; this.renderer.dispose(); }
}

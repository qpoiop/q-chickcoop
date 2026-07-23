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
    const g = await loadGLB(url); if (!g || !this._alive) return;
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
      const idle = g.animations.find((a) => /idle|fly|breath|stand/i.test(a.name)) || g.animations[0];
      this.mixer.clipAction(idle).play();
    }
    return this;
  }

  _loop() {
    if (!this._alive) return;
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.mixer) this.mixer.update(dt);
    if (this.root) this.root.rotation.y += this.spin * dt;
    this.renderer.render(this.scene, this.cam);
  }

  dispose() { this._alive = false; this.renderer.dispose(); }
}

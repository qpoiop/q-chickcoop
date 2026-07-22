import { CONFIG } from '../data/config.js';

// Unified input: keyboard + mouse for desktop, twin-stick touch for mobile.
// Left half of the screen = movement stick, right half = aim + fire stick.
// The Game loop reads the public fields; actions fire via callbacks.

export class Input {
  constructor(domElement, joysticks, callbacks) {
    this.el = domElement;
    this.joy = joysticks; // { base1, knob1, base2, knob2 }
    this.cb = callbacks;  // { onDash, onUse }
    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    this.keys = {};
    this.mouseDown = false;
    this.mouseNDC = { x: 0, y: 0 };
    this.zoom = 1;

    // touch sticks
    this.joyId = null; this.joyVec = { x: 0, y: 0 }; this.joyOrigin = null;
    this.aimId = null; this.aimVec = { x: 0, y: 0 }; this.aimOrigin = null; this.rightStick = false;

    this._bind();
  }

  _bind() {
    const el = this.el;
    this._kd = (e) => {
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      if (k === ' ') { e.preventDefault(); this.cb.onDash(); }
      if (k === 'e') this.cb.onUse();
    };
    this._ku = (e) => { this.keys[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);

    this._mm = (e) => {
      const r = el.getBoundingClientRect();
      this.mouseNDC.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.mouseNDC.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    };
    this._md = (e) => { if (e.button === 0) this.mouseDown = true; if (e.button === 2) this.cb.onDash(); };
    this._mu = (e) => { if (e.button === 0) this.mouseDown = false; };
    el.addEventListener('mousemove', this._mm);
    el.addEventListener('mousedown', this._md);
    window.addEventListener('mouseup', this._mu);
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    this._wheel = (e) => {
      this.zoom = Math.max(CONFIG.camera.zoomMin, Math.min(CONFIG.camera.zoomMax, this.zoom + (e.deltaY > 0 ? 0.09 : -0.09)));
      e.preventDefault();
    };
    el.addEventListener('wheel', this._wheel, { passive: false });

    this._ts = (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.5 && this.joyId === null) {
          this.joyId = t.identifier; this.joyOrigin = { x: t.clientX, y: t.clientY };
          this._show(this.joy.base1, this.joy.knob1, t);
        } else if (t.clientX >= innerWidth * 0.5 && this.aimId === null) {
          this.aimId = t.identifier; this.aimOrigin = { x: t.clientX, y: t.clientY }; this.rightStick = true;
          this._show(this.joy.base2, this.joy.knob2, t);
        }
      }
      e.preventDefault();
    };
    this._tm = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joyId) {
          this._drag(this.joy.knob1, this.joyOrigin, t, (v) => { this.joyVec = v; });
        } else if (t.identifier === this.aimId) {
          this._drag(this.joy.knob2, this.aimOrigin, t, (v, d) => { if (d > 6) this.aimVec = v; });
        }
      }
      e.preventDefault();
    };
    this._te = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joyId) { this.joyId = null; this.joyVec = { x: 0, y: 0 }; this.joy.base1.style.display = 'none'; }
        else if (t.identifier === this.aimId) { this.aimId = null; this.aimVec = { x: 0, y: 0 }; this.rightStick = false; this.joy.base2.style.display = 'none'; }
      }
    };
    el.addEventListener('touchstart', this._ts, { passive: false });
    el.addEventListener('touchmove', this._tm, { passive: false });
    el.addEventListener('touchend', this._te);
    el.addEventListener('touchcancel', this._te);
  }

  _show(base, knob, t) {
    base.style.display = 'block';
    base.style.left = (t.clientX - 60) + 'px';
    base.style.top = (t.clientY - 60) + 'px';
    knob.style.transform = 'translate(0,0)';
  }
  _drag(knob, origin, t, cb) {
    let dx = t.clientX - origin.x, dy = t.clientY - origin.y;
    const d = Math.hypot(dx, dy), mx = 46;
    if (d > mx) { dx *= mx / d; dy *= mx / d; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    cb({ x: dx / mx, y: dy / mx }, d);
  }

  // Movement intent from keyboard + left stick (-1..1 each axis).
  moveVector() {
    let x = 0, z = 0;
    if (this.keys['w'] || this.keys['arrowup']) z -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) z += 1;
    if (this.keys['a'] || this.keys['arrowleft']) x -= 1;
    if (this.keys['d'] || this.keys['arrowright']) x += 1;
    if (this.isTouch) { x += this.joyVec.x; z += this.joyVec.y; }
    return { x, z };
  }

  dispose() {
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    window.removeEventListener('mouseup', this._mu);
  }
}

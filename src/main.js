import './style.css';
import { Game } from './engine/Game.js';
import { ModelViewer } from './ui/preview.js';
import { ASSETS } from './data/assets.js';

// Bootstrap: collect the DOM handles the engine needs, then start the game.
const $ = (id) => document.getElementById(id);

const dom = {
  mount: $('mount'),
  flash: $('flashRef'), level: $('levelRef'), event: $('eventRef'),
  dash: $('dashRef'), low: $('lowRef'), hitDir: $('hitDirRef'), fade: $('fadeRef'), trans: $('transOverlay'),
  joyBase1: $('joyBase1'), joyKnob1: $('joyKnob1'), joyBase2: $('joyBase2'), joyKnob2: $('joyKnob2'),
};

const game = new Game(dom);
window.__CHICKCOOP = game; // debug handle

// Home hero — a large rotating showcase of the playable chicken on the start screen.
const heroCanvas = $('homeHero');
if (heroCanvas) {
  const hero = new ModelViewer(heroCanvas, { camDist: 7, camY: 1.4, lookY: 1.0, fitH: 2.1, fov: 36, walkRange: 4.6, walkSpeed: 2.3 });
  window.__hero = hero;
  hero.load(ASSETS.player).then(() => { hero._loaded = true; }).catch((e) => { hero._err = String(e); });
}

// HUD 3D previews: a rotating gun in the weapon readout + a raw-chicken health icon.
const gunCanvas = $('hudGunCanvas');
if (gunCanvas) {
  const gunView = new ModelViewer(gunCanvas, { camDist: 2.3, camY: 0.1, lookY: 0, fitH: 1.25, spin: 1.3, yaw: -0.5, fov: 34 });
  window.__updateGun = (weaponKey) => { const url = ASSETS.weaponModels[weaponKey]; if (url) gunView.load(url, { fitH: 1.25 }).catch(() => {}); };
  window.__updateGun(game.state.weapon);
}
const hpCanvas = $('hudHpChicken');
if (hpCanvas) {
  const hpView = new ModelViewer(hpCanvas, { camDist: 2.6, camY: 0.7, lookY: 0.65, fitH: 1.5, spin: 0.5, yaw: -0.3, fov: 34 });
  hpView.load(ASSETS.rawChicken).catch(() => {});
}

// Keep the canvas sized to the visual viewport on mobile (URL bar show/hide).
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => game._resize && game._resize());
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) game.audio.resume(); });

// ---------------------------------------------------------------------------
// PWA: service-worker versioning + manual update + install-to-home-screen.
// The SW URL carries the build id, so each deploy registers as an update; the
// banner lets the user apply it on demand (manual update). Dev is left alone.
// ---------------------------------------------------------------------------
const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      const base = import.meta.env.BASE_URL || '/';
      const reg = await navigator.serviceWorker.register(`${base}sw.js?v=${BUILD_ID}`, { updateViaCache: 'none' });

      const banner = $('updateToast');
      const offerUpdate = (worker) => {
        if (!worker) return;
        banner.style.display = 'inline-block';
        banner.onclick = () => { worker.postMessage({ type: 'SKIP_WAITING' }); banner.style.display = 'none'; };
      };
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(nw);
        });
      });
      // reload once the new SW takes control
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
      // manual update check on focus
      window.addEventListener('focus', () => reg.update().catch(() => {}));
    } catch (e) { console.warn('[pwa] SW registration failed', e); }
  });
}

// Install-to-home-screen prompt (Android/desktop Chrome) — shown as a bottom toast.
let deferredPrompt = null;
const installBtn = $('installToast');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferredPrompt = e;
  if (installBtn) installBtn.style.display = 'inline-block';
});
if (installBtn) installBtn.onclick = async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; installBtn.style.display = 'none';
};
window.addEventListener('appinstalled', () => { if (installBtn) installBtn.style.display = 'none'; });

// Best-effort landscape lock (ignored on iOS — hence the on-screen recommendation).
export function tryLockLandscape() {
  try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) {}
}
game.onDeploy = tryLockLandscape;

import './style.css';
import { Game } from './engine/Game.js';

// Bootstrap: collect the DOM handles the engine needs, then start the game.
const $ = (id) => document.getElementById(id);

const dom = {
  mount: $('mount'),
  flash: $('flashRef'), level: $('levelRef'), event: $('eventRef'),
  dash: $('dashRef'), low: $('lowRef'), hitDir: $('hitDirRef'),
  joyBase1: $('joyBase1'), joyKnob1: $('joyKnob1'), joyBase2: $('joyBase2'), joyKnob2: $('joyKnob2'),
};

const game = new Game(dom);
window.__CHICKCOOP = game; // debug handle

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

      const banner = $('updateBanner');
      const offerUpdate = (worker) => {
        if (!worker) return;
        banner.style.display = 'block';
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

// Install-to-home-screen prompt (Android/desktop Chrome).
let deferredPrompt = null;
const installBtn = $('btnInstall');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferredPrompt = e;
  if (installBtn) { installBtn.style.display = 'inline'; }
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

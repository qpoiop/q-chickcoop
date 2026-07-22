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
window.__CHICKCOPE = game; // debug handle

// Keep the canvas sized to the visual viewport on mobile (URL bar show/hide).
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => game._resize && game._resize());
}
// Resume audio if the tab regains focus.
document.addEventListener('visibilitychange', () => { if (!document.hidden) game.audio.resume(); });

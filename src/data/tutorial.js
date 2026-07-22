// ============================================================================
// TUTORIAL SCRIPT — ordered steps. `toast` fires a center banner; `dummies`
// spawns training targets. Progression conditions live in Game.updateTutorial.
// ============================================================================

export const TUTORIAL = [
  { text: 'MOVE · use the left stick / WASD',                       toast: 'TUTORIAL' },
  { text: 'FIRE · aim with mouse or right stick and shoot',        toast: '' },
  { text: 'DASH · tap SPACE to dodge',                             toast: '' },
  { text: 'PICK UP · grab the glowing item drop',                  toast: '' },
  { text: 'FIGHT · defeat the training targets',                   toast: '', dummies: true },
  { text: 'ARSENAL · buy weapons with scrap in the menu. Ready!',  toast: '' },
];

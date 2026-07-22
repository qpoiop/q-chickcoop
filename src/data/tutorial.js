// ============================================================================
// TUTORIAL SCRIPT — ordered steps. `toast` fires a center banner; `dummies`
// spawns training targets. Progression conditions live in Game.updateTutorial.
// Korean variants (textKo/toastKo) picked by the active language.
// ============================================================================

export const TUTORIAL = [
  { text: 'MOVE · use the left stick / WASD',                      textKo: '이동 · 왼쪽 스틱 / WASD 사용',              toast: 'TUTORIAL', toastKo: '튜토리얼' },
  { text: 'FIRE · aim with mouse or right stick and shoot',        textKo: '사격 · 마우스나 오른쪽 스틱으로 조준 후 발사', toast: '', toastKo: '' },
  { text: 'DASH · tap SPACE to dodge',                             textKo: '대시 · SPACE로 회피',                      toast: '', toastKo: '' },
  { text: 'PICK UP · grab the glowing item drop',                 textKo: '획득 · 빛나는 아이템을 주워라',              toast: '', toastKo: '' },
  { text: 'FIGHT · defeat the training targets',                  textKo: '전투 · 훈련용 표적을 처치하라',              toast: '', toastKo: '', dummies: true },
  { text: 'ARSENAL · buy weapons with scrap in the menu. Ready!', textKo: '무기고 · 고철로 무기를 구매하라. 준비 완료!',  toast: '', toastKo: '' },
];

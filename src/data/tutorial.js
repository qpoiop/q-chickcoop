// ============================================================================
// TUTORIAL SCRIPT — ordered steps. `toast` fires a center banner; `dummies`
// spawns training targets. Progression conditions live in Game.updateTutorial +
// the interaction/purchase hooks. Korean variants (textKo/toastKo) by language.
// Flow: move → fire → dash → pick up → fight → shop → open chest → hack → skill →
// go through the portal to the main map (portal = final step; tutorial done).
// ============================================================================

export const TUTORIAL = [
  { text: 'MOVE · use the left stick / WASD',                     textKo: '이동 · 왼쪽 스틱 / WASD 사용',              toast: 'TUTORIAL', toastKo: '튜토리얼' },
  { text: 'FIRE · aim and shoot the scarecrow apart',             textKo: '사격 · 조준해서 저 멀리 허수아비를 부숴라',   toast: '', toastKo: '' },
  { text: 'DASH · tap SPACE to dodge',                            textKo: '대시 · SPACE로 회피',                      toast: '', toastKo: '' },
  { text: 'PICK UP · grab the glowing item drop',                textKo: '획득 · 빛나는 아이템을 주워라',              toast: '', toastKo: '' },
  { text: 'FIGHT · defeat the training targets',                 textKo: '전투 · 훈련용 표적을 처치하라',              toast: '', toastKo: '', dummies: true },
  { text: 'SHOP · open the Shop and pick a weapon',              textKo: '상점 · 상점을 열고 무기를 골라라',           toast: '', toastKo: '' },
  { text: 'OPEN · crack open the salvage chest for scrap',       textKo: '상자 · 고철 상자를 열어라',                  toast: '', toastKo: '' },
  { text: 'UPGRADE · spend a skill point in the Tech Tree',      textKo: '강화 · 기술 트리에서 스킬 포인트를 찍어라',    toast: '', toastKo: '' },
  { text: 'PORTAL · go through the portal to the main map',      textKo: '포탈 · 포탈을 통해 메인 맵으로 이동하라',      toast: '', toastKo: '' },
];

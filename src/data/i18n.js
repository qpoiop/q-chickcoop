// ============================================================================
// i18n — English + Korean. Language is chosen on the home screen and persisted.
// UI chrome uses t(key[,params]); game-data entries carry their own nameKo/
// descKo picked via locName()/locDesc(). {slots} in strings interpolate params.
// ============================================================================

const KEY = 'cc_lang';
let lang = localStorage.getItem(KEY) || ((navigator.language || 'en').toLowerCase().startsWith('ko') ? 'ko' : 'en');

export function getLang() { return lang; }
export function setLang(l) { lang = (l === 'ko') ? 'ko' : 'en'; try { localStorage.setItem(KEY, lang); } catch (e) {} }

export function locName(o) { return (lang === 'ko' && o.nameKo) ? o.nameKo : o.name; }
export function locDesc(o) { return (lang === 'ko' && o.descKo) ? o.descKo : o.desc; }

export function t(key, params) {
  const table = STR[lang] || STR.en;
  let s = (key in table) ? table[key] : (STR.en[key] ?? key);
  if (params) for (const k in params) s = s.replaceAll('{' + k + '}', params[k]);
  return s;
}

const STR = {
  en: {
    'home.eyebrow': 'Barnyard Override · Action Prototype',
    'home.desc': "You're a battle-chicken dropped into a lava-ringed shanty town. Roam the streets, hold off the swarm of rival birds, grab glowing weapon drops, and cash your scrap for bigger guns in the Arsenal. Level up a branching tech tree, breach the two cores to open the portal, then cross to the boss arena and survive to extract.",
    'home.deploy': 'Deploy', 'home.move': 'Move', 'home.aimfire': 'Aim + Hold Fire', 'home.dash': 'Dash', 'home.interact': 'Interact',
    'home.mobile': 'Mobile', 'home.mLeft': 'Left stick — move', 'home.mRight': 'Right stick — aim & fire', 'home.mAuto': 'Auto-fire when idle · DASH / USE',
    'home.skip': 'Skip Tutorial →', 'home.lang': 'Language', 'home.landscape': '↻ Landscape mode recommended — on iOS, rotate your device to play',
    'home.install': '＋ Add to Home Screen', 'home.update': '⟳ Update available — tap to refresh',
    'hud.hull': 'HULL', 'hud.dash': 'Dash', 'hud.scrap': 'Scrap', 'hud.kills': 'Kills', 'hud.time': 'Time',
    'hud.objective': 'Objective', 'hud.tutorial': 'Tutorial', 'hud.weapon': 'Weapon',
    'hud.inventory': 'Inventory', 'hud.arsenal': 'Shop', 'hud.tech': 'Tech Tree',
    'hud.hintDesktop': 'WASD move · aim mouse · SPACE dash · E interact',
    'hud.hintMobile': 'Left stick — move · Right stick — aim & fire · DASH to dodge',
    'touch.use': 'Interact', 'touch.dash': 'Dodge', 'touch.hold': 'Hold',
    'prompt.core': 'Breach', 'prompt.crate': 'Salvage', 'prompt.extract': 'Extract', 'prompt.portal': 'Enter',
    'boss.tag': '⚠ Boss', 'cast.label': 'DANGER',
    'obj.coreA': 'Breach Data Core A', 'obj.coreB': 'Breach Data Core B', 'obj.extract': 'Reach Extraction',
    'obj.portal': 'Enter the Portal', 'obj.boss': 'Defeat the Boss',
    'evt.breached': '{id} BREACHED', 'evt.salvage': '+SALVAGE', 'evt.gate': 'GATE UNLOCKED',
    'evt.portal': 'PORTAL OPEN', 'evt.extract': 'EXTRACTION READY',
    'evt.acquired': '{name} ACQUIRED!', 'evt.scrap30': '+30 SCRAP', 'evt.hull': '+{n} HULL', 'evt.scrap': '+SCRAP',
    'evt.bossIn': '⚠ BOSS INBOUND', 'evt.bossDown': 'BOSS DOWN', 'evt.enrage': '⚠ BOSS ENRAGED', 'evt.tutDone': 'TUTORIAL COMPLETE',
    'inv.eyebrow': 'Field Loadout', 'inv.title': 'INVENTORY', 'inv.resources': 'Resources',
    'inv.scrap': 'Scrap', 'inv.points': 'Skill Points', 'inv.level': 'Level', 'inv.kills': 'Kills',
    'inv.frames': 'Weapon Frames', 'inv.augments': 'Active Augments', 'inv.spent': '{n} pts spent',
    'inv.none': 'No augments yet. Earn skill points by leveling, then spend them in the Tech Tree.',
    'inv.equipped': 'Equipped', 'inv.owned': 'Owned', 'inv.locked': 'Locked · {n} scrap',
    'inv.openArsenal': 'Open Shop', 'inv.openTech': 'Tech Tree',
    'ars.eyebrow': 'Weapon Shop', 'ars.title': 'SHOP', 'ars.equipped': 'Equipped', 'ars.owned': 'Owned',
    'ars.rate': 'Rate', 'ars.damage': 'Damage', 'ars.area': 'Area',
    'tt.eyebrow': 'Neural Tech Tree', 'tt.title': 'AUGMENT LOADOUT', 'tt.points': 'Points',
    'tt.maxed': 'MAXED', 'tt.locked': 'LOCKED', 'tt.pt': '{n} PT',
    'tt.dmg': 'DMG', 'tt.rate': 'Rate', 'tt.move': 'Move', 'tt.hull': 'Max Hull', 'tt.armor': 'Armor',
    'tt.crit': 'Crit', 'tt.dashChg': 'Dash', 'tt.xp': 'XP', 'tt.scrap': 'Scrap', 'tt.chg': '{n} chg',
    'end.win': 'SECTOR CLEARED', 'end.lose': 'FRAME DOWN', 'end.level': 'Level', 'end.kills': 'Kills', 'end.time': 'Time', 'end.redeploy': 'Redeploy',
    'pause.eyebrow': 'Paused', 'pause.title': 'SYSTEM MENU', 'pause.resume': 'Resume', 'pause.music': 'Music', 'pause.quit': 'Quit to Home',
    'loading': 'LOADING…', 'trans.loading': 'Entering…',
  },
  ko: {
    'home.eyebrow': '바냐드 오버라이드 · 액션 프로토타입',
    'home.desc': '용암으로 둘러싸인 판자촌에 투입된 전투 치킨이다. 거리를 누비며 적 새떼를 막아내고, 빛나는 무기 드롭을 주워라. 모은 고철로 무기고에서 더 강한 총을 사고, 갈래형 기술 트리로 성장하라. 두 코어를 해킹해 포탈을 열고, 보스 아레나로 건너가 살아남아 탈출하라.',
    'home.deploy': '출격하기', 'home.move': '이동', 'home.aimfire': '조준 + 사격', 'home.dash': '대시', 'home.interact': '상호작용',
    'home.mobile': '모바일', 'home.mLeft': '왼쪽 스틱 — 이동', 'home.mRight': '오른쪽 스틱 — 조준 & 사격', 'home.mAuto': '정지 시 자동 사격 · DASH / USE',
    'home.skip': '튜토리얼 건너뛰기 →', 'home.lang': '언어', 'home.landscape': '↻ 가로 모드 플레이 권장 — iOS에서는 기기를 가로로 돌려 주세요',
    'home.install': '＋ 홈 화면에 추가', 'home.update': '⟳ 업데이트 있음 — 눌러서 새로고침',
    'hud.hull': '체력', 'hud.dash': '대시', 'hud.scrap': '고철', 'hud.kills': '처치', 'hud.time': '시간',
    'hud.objective': '목표', 'hud.tutorial': '튜토리얼', 'hud.weapon': '무기',
    'hud.inventory': '인벤토리', 'hud.arsenal': '상점', 'hud.tech': '기술 트리',
    'hud.hintDesktop': 'WASD 이동 · 마우스 조준 · SPACE 대시 · E 상호작용',
    'hud.hintMobile': '왼쪽 스틱 — 이동 · 오른쪽 스틱 — 조준 & 사격 · DASH 회피',
    'touch.use': '상호작용', 'touch.dash': '회피', 'touch.hold': '길게',
    'prompt.core': '해킹', 'prompt.crate': '회수', 'prompt.extract': '탈출', 'prompt.portal': '진입',
    'boss.tag': '⚠ 보스', 'cast.label': '위험',
    'obj.coreA': '데이터 코어 A 해킹', 'obj.coreB': '데이터 코어 B 해킹', 'obj.extract': '탈출 지점으로 이동',
    'obj.portal': '포탈로 진입', 'obj.boss': '보스를 처치하라',
    'evt.breached': '{id} 해킹 완료', 'evt.salvage': '+회수', 'evt.gate': '게이트 개방',
    'evt.portal': '포탈 개방', 'evt.extract': '탈출구 개방',
    'evt.acquired': '{name} 획득!', 'evt.scrap30': '+30 고철', 'evt.hull': '+{n} 체력', 'evt.scrap': '+고철',
    'evt.bossIn': '⚠ 보스 접근', 'evt.bossDown': '보스 격파', 'evt.enrage': '⚠ 보스 격노', 'evt.tutDone': '튜토리얼 완료',
    'inv.eyebrow': '필드 장비', 'inv.title': '인벤토리', 'inv.resources': '자원',
    'inv.scrap': '고철', 'inv.points': '스킬 포인트', 'inv.level': '레벨', 'inv.kills': '처치',
    'inv.frames': '무기 프레임', 'inv.augments': '활성 증강', 'inv.spent': '{n} 포인트 사용',
    'inv.none': '아직 증강이 없습니다. 레벨업으로 스킬 포인트를 얻어 기술 트리에서 사용하세요.',
    'inv.equipped': '장착 중', 'inv.owned': '보유', 'inv.locked': '잠김 · {n} 고철',
    'inv.openArsenal': '상점 열기', 'inv.openTech': '기술 트리',
    'ars.eyebrow': '무기 상점', 'ars.title': '상점', 'ars.equipped': '장착 중', 'ars.owned': '보유',
    'ars.rate': '연사', 'ars.damage': '피해', 'ars.area': '범위',
    'tt.eyebrow': '뉴럴 기술 트리', 'tt.title': '증강 로드아웃', 'tt.points': '포인트',
    'tt.maxed': '최대', 'tt.locked': '잠김', 'tt.pt': '{n} PT',
    'tt.dmg': '피해', 'tt.rate': '연사', 'tt.move': '이동', 'tt.hull': '최대 체력', 'tt.armor': '방어',
    'tt.crit': '치명', 'tt.dashChg': '대시', 'tt.xp': '경험치', 'tt.scrap': '고철', 'tt.chg': '{n} 충전',
    'end.win': '구역 정리 완료', 'end.lose': '격추됨', 'end.level': '레벨', 'end.kills': '처치', 'end.time': '시간', 'end.redeploy': '재출격',
    'pause.eyebrow': '일시정지', 'pause.title': '시스템 메뉴', 'pause.resume': '계속하기', 'pause.music': '음악', 'pause.quit': '홈으로 나가기',
    'loading': '로딩 중…', 'trans.loading': '이동 중…',
  },
};

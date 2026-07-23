# CHICKCOOP — 아키텍처 & 개발 컨벤션

탑다운 트윈스틱 액션 로그라이크 (Three.js). 이 문서는 코드 구조, 컨벤션,
핵심 시스템, 그리고 **반복해서 물렸던 함정들**을 관리하기 위한 것이다.
새 기능/수정 전에 이 문서와 `MAP_GUIDE.md`를 먼저 읽는다.

---

## 1. 원칙

- **데이터 주도.** 모든 밸런싱/레벨/에셋 경로/문구는 `src/data/*`에 있다.
  `src/engine/*`는 순수 동작(behavior)만. 숫자를 바꾸려면 데이터를 고친다.
- **한 번에 하나씩, 원인부터.** 증상(흰색으로 보임, 안 보임)을 겉핥기로
  덧칠하지 말고, 파이프라인 어디서 깨지는지 찾아서 그 지점을 고친다.
- **검증은 실기기.** 데스크톱 백그라운드 탭 렌더는 신뢰 불가(아래 6절).
  좌표/상태는 코드로 probe하고, 최종 시각 확인은 배포 후 실기기.

---

## 2. 디렉터리

```
src/
  main.js            부트스트랩(DOM 핸들 수집 → Game 생성), PWA/SW 등록, 홈 히어로
  engine/
    Game.js          오케스트레이터: 렌더/월드/플레이어/전투/적/FX/상태. (가장 큼)
    boss.js          보스 AI(텔레그래프 스킬 캐스팅)
    loaders.js       GLB 로드 + 스킨드 클론 + 스케일/치수 헬퍼
    input.js         키보드/마우스 + 모바일 트윈스틱 조이스틱
    audio.js         BGM(WebAudio) + 절차적 SFX. music/sfx 독립 토글
  ui/
    hud.js           상태 → 정적 마크업 미러링. sync()=구조변경, tick()=매프레임 수치
    panels.js        인벤/상점/기술트리 오버레이 (패널 바뀔 때만 재생성)
    preview.js       홈/HUD 3D 프리뷰(히어로, 총)
  data/
    config.js        모든 튜너블(카메라/이동/스폰/드롭/진행)
    levels.js        레벨 레이아웃 + MAPS 레지스트리
    enemies.js       적 티어 + 보스 스탯
    weapons.js       무기 데이터 + 모델 매핑
    skills.js        기술트리 + computeModifiers()
    assets.js        모든 GLB/오디오 경로 (단일 진실원)
    i18n.js          en/ko 문구
    tutorial.js      튜토리얼 스텝 스크립트
docs/                이 문서들
public/              GLB/오디오/아이콘 (dist로 그대로 복사)
```

## 3. 상태 & 렌더 흐름

- `Game.state`는 평범한 객체. HUD/Panels가 읽고, `Game.refresh()`가 DOM 재동기화.
- `refresh()` = `hud.sync()` + `panels.sync()`. **개별 액션(구매/스킬/맵전환)에서만
  호출**. 매프레임 호출 금지(패널 재생성 → 깜빡임). 매프레임 수치는 `hud.tick()`.
- 렌더 루프: `Game._loop()` → `_simulate()`(플레이 중) → 카메라 → `composer.render()`
  (블룸) 또는 `rend.render()`. 적응형 품질(`_applyAdaptiveQuality`)이 부하 시 비용 감소.
- **핫 루프 규칙**: `_updateBullets/_updateEnemies/_updatePickups`는 엔티티 수만큼
  돈다. `.clone()` 금지 — 재사용 스크래치 벡터(`_toVec/_epVec/_pickVec`) 사용.
  `_mods()`는 `state.ranks` 참조가 바뀔 때만 재계산(메모이즈).

## 4. 좌표계 / 카메라

- 월드 XZ 평면. +Z, +X. 플레이어 y는 **0 고정**(평면 게임 — 5절 참고).
- 카메라: `CONFIG.render.camOffset`. **z<0이면 반대편(far side)에서 봄** →
  월드 이동/조준 입력을 반전해야 화면 조작이 맞음(`Game._camFlip`이 처리).
  카메라 관련 값 바꾸면 `_camFlip`가 쓰이는 3곳(_simulate 이동/터치조준, _dash,
  _updateCamera lookAt bias)이 일관되는지 확인.

## 5. 맵 / 배치 (자세히는 MAP_GUIDE.md)

- 맵 GLB는 `normalize` 파이프라인으로 긴 축을 목표 크기에 맞춰 스케일 → 원점 정렬.
  **레벨 앵커 좌표는 정규화 이후 기준.** normalize를 바꾸면 앵커 좌표도 같은
  배율로 스케일해야 함(안 그러면 구조물에서 벗어남).
- **워크블 그리드 = 충돌.** 바닥이 y≈0 근처인 셀만 걸을 수 있음(높은 것=벽).
  플레이어 y가 0 고정이라 언덕/구덩이는 못 감(장식). 굴곡 맵은 이 한계와 싸움.
- 앵커(코어/포탈/상점/상자)는 하드코딩 좌표 → `_snapAnchors`가 도달 가능한
  땅으로 스냅. **하지만 좌표가 나무 위/void/어두운 가장자리면 여전히 나쁨.**
  → 배치는 **실제 지형 위인지 probe로 검증**하고, 어두운 가장자리 말고
  구조물/밝은 중앙에 둔다.

## 6. 렌더링 함정 (물렸던 것들 — 재발 방지)

- **블룸 + `toneMapped:false` = 흰색.** 밝은 색 재질에 `toneMapped:false`를 주면
  톤매핑을 안 거쳐 풀밝기 → UnrealBloom(임계 0.85)이 흰색으로 태움.
  X-ray 히어로가 나무 뒤에서 흰 덩어리로 보인 원인. → `toneMapped:true` + 낮은
  opacity로 은은하게.
- **밝은 diffuse도 블룸.** 상점 모델 상단이 밝아 흰색으로 blown out. → 상점
  재질 색을 블룸 임계 아래(≈0.6)로 클램프(`_loadToolModels`).
- **탑다운 비콘은 평면(수평)이어야 보인다.** 세로 빛기둥은 위에서 옆면이라 안 보임.
  바닥 링을 y≈0.06에 두면 **지형(y≈0.3)에 묻힘**. → 수평 링을 y≈1.2로 띄우고
  `depthTest:true`(나무/건물이 자연스럽게 가림, 흰색 덧그리기 X).
- **오버레이는 불투명해야 가린다.** `transOverlay`가 배경 없이 스피너만이라 튜토
  맵이 비쳐 깜빡. → 불투명 배경 + 시작 오버레이 숨기기 **전에** 띄움.

## 7. 커밋 / 배포

- 브랜치에서 작업 → `production`으로 PR/머지 → **GitHub Actions가 CF Workers
  자동 배포**(push to production 트리거).
- SW는 install 시 `skipWaiting()` → 배포가 다음 방문에 자동 반영(수동 업데이트
  탭 불필요).
- 배포 전 `npm run build`로 컴파일 확인. 데이터 변경도 빌드로 문법 확인.

## 8. 성능 / 누수 감사 (라이브 probe)

RAF는 백그라운드 탭에서 스로틀되니 프레임타임을 RAF로 재지 말고 **동기 루프로 직접
측정**한다. `window.__CHICKCOOP` 통해:

- **비용**: `R=g.rend`. `R.render(g.scene,g.cam)` 200회 시간 / `g._simulate(dt,rdt,md,fx)`
  200회 시간. 참고치(숲, 몹16): render ~2ms, sim ~0.05ms, draw calls ~219, tris ~126k.
  몹 16마리가 draw call +3 뿐 = 엔티티는 지오/머티리얼 공유(인스턴싱). 조기 최적화 금지.
- **누수 탐지**: 전투를 오래 구동하고 증가를 본다.
  ```js
  // dt=0.05로 구동하면 state.time이 빨리 흘러 시간기반 despawn도 검증됨.
  // _simulate만 부르면 _animateDetached(루프의 FX 정리)가 안 돌아 가짜 누수가 보임 → 둘 다 호출.
  for(i..){ if(g.enemies.length<16&&i%20==0)g._spawnEnemy(); g.game.fireT=-1;
            g._simulate(.05,.05,md,fx); g._animateDetached(.05); if(i%50==0)죽이기; }
  ```
  체크: `R.info.memory.geometries/textures`(공유면 평평해야), `g.scene.children.length`,
  그리고 추적 배열들(`orbs,coins,bullets,enemyBullets,enemies,parts,ghosts,fxSprites,
  dmgNums,itemDrops`). **선형 증가 = 누수.** orphan(scene엔 있는데 어느 배열에도 없음)이
  0인데 kids가 늘면 → 어떤 추적 배열이 안 빠지는 것(수집/만료 조건 확인).
- **함정**: 드롭/FX 메시는 **geometry+material을 공유 캐시**로. 인스턴스마다 new 하면
  scene.remove가 dispose 안 해 GPU 버퍼 누수. 수집으로만 제거되는 것은 시간기반
  despawn도 둔다(`CONFIG.drops.pickupLife`).
- **몹 GLB는 geometry/material 공유(누수 아님, 검증됨)**. `cloneSkinned`=three
  `SkeletonUtils.clone`은 hierarchy+skeleton만 복제하고 **BufferGeometry는 공유**한다.
  같은 tier 몹은 geometry uuid 동일, 72회 스폰/킬에도 geometries 평평. **몹 사망 경로에
  `geometry.dispose()` 넣지 말 것** — 공유 geo라 다른 몹·원본 템플릿이 깨진다.
  ⚠ 누수 감사 시 **반드시 같은 tier로, 리스폰 끄고**(‑`_simulate` 대신 `_updateEnemies`
  직접) 측정. 다른 tier=다른 모델이라 "고유 geo"로 오탐한다(2026-07 실제 오탐 사례).

## 9. 열린 이슈 / 백로그

`docs/BACKLOG.md` 참고 (알려진 구조적 이슈: void 이동 제한, 맵 회전 시 앵커
동시 회전, 보스 모델 교체·확대, 트윈스틱 손맛, 덕코프/Ascent 레퍼런스 정렬).

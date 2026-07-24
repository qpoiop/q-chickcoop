# 백로그 / 알려진 이슈

우선순위·상태를 여기서 관리한다. 고치면 체크. 근본 원인은 `ARCHITECTURE.md`.

## 🔴 열림 — 구조적 (신중히)

- [x] **파란 void로 걸어나감** — (3개 맵 모두 봉쇄 완료) 파란 = 콘텐츠 밖 bare
  ground 평면 + 하늘색 반구광만 받아 파랗게 + walkable이라 걸어나가짐.
  두 기법(둘 다 `_finishMapLoad`, 맵별 opt-in):
  - `mapFit.trimOpen`(밀도 트림): 나무/건물로 쪼개진 맵. R4 밀도>임계 셀=빈 벌판
    제거. **숲 0.9**(W-45→-16), **시티 0.9**(E void x51→x3). 앵커 유지.
  - `mapFit.boundToContent`(콘텐츠 bbox+여백): 바닥 평면이 주 플레이 면인 맵.
    **폭포 15** — 앵커 박스로 봉쇄, bossSpawn/extraction/shop 전부 도달(소프트락
    없음), 563셀. (밀도 트림은 여기서 extraction 끊겨 부적합했음.)
- [ ] **맵 좌로 90도 회전** — `mapFit.yaw`를 넣되 **앵커 좌표도 같은 각도로 회전**
  해야 함. 안 하면 배치 다 어긋남. (MAP_GUIDE 4절)
- [x] ~~몹 GLB 지오메트리 누수~~ **오탐(false alarm) — 누수 아님, 재검증 완료.**
  지난 사이클 판정은 **혼동된 테스트**였음: 서로 다른 tier(grunt/brute/drone)는
  당연히 다른 모델→다른 geometry라 "고유"로 보였고, `_simulate`가 테스트 중 계속
  리스폰해 live 수가 흔들렸음. 정밀 재검증: (1) 같은 tier 몹 2마리는 SkinnedMesh
  geometry **uuid 동일**(공유 확인) — `cloneSkinned`=three `SkeletonUtils.clone`은
  hierarchy+skeleton만 복제하고 BufferGeometry는 **공유**함. (2) 같은 tier 12몹
  스폰=+1 geo. (3) 72회 스폰/킬 사이클 → geometries [66,70,70,70,70,70] **평평**
  (사이클당 증가 0). **⚠ 절대 geometry.dispose 추가 금지** — 공유 geo라 dispose하면
  다른 몹/원본 템플릿이 깨진다. FX 배열(parts/ghosts/fxSprites/dmgNums/bullets/
  enemyBullets)도 전부 bounded 확인. **전 픽업/FX/몹 누수 감사 종료 = clean.**
- [x] **코어 B / 포탈이 안 보이는 곳에 배치됨** — probe 검증 완료: 코어 B (18,-6)
  = 중앙 `Ground_Sol`, 포탈 = Temple 구조물(코어 A 자리). 둘 다 밝게 보이는 곳.
  (최종 시각 확인은 실기기에서.)
- [~] **배치 신뢰성 일반화** — 로드 시 `_validatePlacements()` 추가: 모든
  interactable을 multi-hit 레이캐스트로 검사, VOID/floating(지면 없음)/비-walkable을
  console 경고. multi-hit라 Temple처럼 "구조물 위+아래 지면 있음"은 통과(false
  positive 없음). 앞으로 맵 추가/변경 시 리그레션 자동 감지. 이걸로 시티 건물밑
  상자(-28,18 topmost y6.2) 찾아 열린 땅(-1,56)으로 교체. 전 맵 경고 0 확인.
  잔여: "닫힌 건물 밑 가림"은 레이캐스트로 자동판별 불가 → 눈으로 리뷰. 하드코딩
  대신 로드-시 자동 산출까지는 아직.

## 🔴 열림 — 근본(에셋/방향 필요)

- [ ] **사격/캐릭터가 근본적으로 어색함 (에셋 한계)** — 유저 지적. 손 없는 병아리라 총
  "든" 자세가 안 나오고, 총 GLB는 작아 안 읽힘. 머즐은 흰 사각형으로 깨져 보였음 →
  소프트 발광 섬광으로 고침(PR#97, "안 깨짐" 수준). 근본 해결은 값 튜닝 불가:
  (a) 손 있는 캐릭터+무기 GLB, (b) 총 개념 버리고 발사형 캐릭터(드론/구체), (c) 전체
  아트 디렉션. **유저 결정/에셋 필요 — 자율로 못 넘김.** 그래픽 전반(플랫 아레나,
  재탕 모델)도 같은 범주. 실측 평가: 덕코프 대비 "돌아가는 껍데기" 수준.

## 🟡 열림 — 게임 필/기획

- [~] **보스 모델 교체·확대** — 크기 확대 완료(bossA modelMul 2.4→3.6/r4.4,
  bossB 1.9→2.9/r4.0; 측정 높이 2.66→4.1, ~1.5배). **잔여**: 모델 자체가 구림
  (bossA/bossB 둘 다 chick_stylized_character 재탕) — 더 나은 보스 GLB 필요.
- [~] **트윈스틱 손맛** — 좌/우 스틱 역할 차이 체감(우=조준/사격 독립).
  진행: **터치 자동조준 타깃 히스테리시스**(config.player.autoAimStick 0.6). 기존엔
  매 프레임 최근접 몹으로 스냅 → 두 몹이 비슷한 거리면 조준이 프레임마다 튐(총 지터·
  탄 분산). 이제 락온 유지, 라이벌이 현재 거리의 0.6배 이내로 더 가까울 때만 전환.
  최초 획득은 여전히 최근접. 검증: Node 미세 시뮬(선택 로직 그대로) 랭크 교차 몹
  600프레임 → 타깃 전환 134→**0**, 사망 시 생존자 재획득. 잔여: 실기기 스틱 튜닝.
- [~] **덕코프 / Ascent 레퍼런스 정렬** — 카메라·전투·파밍·몹속도 비교/조정.
      핵심: 속도 우위로 카이팅/포지셔닝이 재미의 축이 되게.
      진행: 히어로 속도↑·몹↓(카이팅), 웨이브 lull(숨틈), **근접 텔레그래프 회피창
      확대**(grunt 0.32→0.45, brute 0.55→0.7) — 검증: 텔레그래프 중 이동=회피(hp
      유지), 정지=피격. "보고 피하는" 컨트롤 확보. **근접 텔레그래프 시각화 추가**:
      windup 중 발밑 빨간 위험 링(strike 반경까지 성장, 공유 geo/mat, ranged/보스
      제외) — GLB 몹은 기존에 scale +20%만이라 탑다운에서 안 보였음. 잔여: 실기기 튜닝.
      **터치 자동조준 히스테리시스**(autoAimStick 0.6): 조준 떨림 제거(별도 항목).
- [~] **자동공격 깊이 / 상시 압박** — 스폰에 **웨이브 리듬** 추가(config.spawn
  waveSize7/lull2.4): 7스폰마다 2.4초 숨 돌릴 틈. 검증: gap 1.2×7→2.4 반복.
  잔여: 실기기 플레이로 lull 길이·waveSize 튜닝, 위협 텔레그래프 강화 등.
- [ ] **구조물 내부/공간 활용** — 지붕만 보이는 건물들, 카메라/스케일 재고.

## ✅ 닫힘 (최근)

- [x] **진행감/전투 부재 (로직 문제)** — 유저 지적: 정중앙 스폰 대칭 아레나는 "진행하는
  맵"이 아님, "싸우는 일도 없음"(고정 코너 스폰 몹을 지나쳐 목표만 해킹). 숫자 아니라
  로직 변경: (1) 시티=방향성 레인(34×62), 근처 가장자리 스폰→전진(코어 중간/깊숙이,
  포탈=먼 끝). (2) 몹을 **플레이어 주변 링 스폰**(config.spawn.ring 24, 진행방향 편향,
  `_enemySpawnPoint`) — 고정 코너 대신 전진을 따라옴. (3) **스폰 즉시 aggro**(sight 밖
  스폰돼도 추격). 검증: 레인 전진 시 조우 3→16, 몹 스웜·추격, 플레이어 피격/사망 가능
  (실전투), 가장자리 스폰(z54) 화면 확인, 코어2→포탈→보스 정상. 잔여: 스웜 난이도 실기기
  튜닝, 그래픽은 에셋 한계. 보스맵도 이미 가장자리 진입형.
- [x] **시티 맵 플레이 불가 → 절차적 아레나로 교체** — 유저 리포트: 이동 안 됨, 언덕 가림,
  움직임 제약 과다, 시작점 애매, 코어/상자 위치 근본없음, 몹 이상한곳, "바로앞 해킹하고
  들어가면 끝". a_city_in_nature GLB는 데코 씬이라 아레나 부적합(하버스트 콜리전이 사방
  막음, 지형 오클루전). cityStageLevel을 평면 절차 아레나(model:null, arena:true)로 재작성
  — 튜토/보스 아레나와 같은 검증된 시스템: walkFrac 1.0(어디든 이동), 오클루전 0, 중앙
  스폰, **코어 2개 대각 배치**(둘 다 해킹하려면 아레나 횡단+전투 → "바로앞거 해킹하고 끝"
  방지), 가장자리 몹 스폰, 경계 링(lavaRing) 가시. 미사용 3.6MB GLB 삭제. 검증: 빌드 그린,
  walkFrac 1.0, 전 앵커 지면+도달(bad 0), 몹 6/6 walkable, 코어2→포탈 활성→보스 진입,
  스샷상 깨끗한 개방 아레나, 콘솔 에러 0. **교훈: 데코 GLB는 플레이 아레나로 부적합 —
  전투 맵은 절차 아레나가 안전(오클루전·이동제약·배치난망 전부 해결).**
- [x] **적/플레이어 구분 안 됨(가독성)** — 적 모델이 전부 노란 병아리라 플레이어·서로
  구별 불가(스샷 확인). 적에 tier 색 지면 링 추가(grunt 핑크/brute 코랄/drone 골드),
  플레이어의 teal 링 컨벤션과 통일 = **적=색링, 나=teal**. 공유 geo + 색별 mat 캐시,
  반경 스케일, 그룹과 함께 제거(누수 X). 검증: 빌드 그린, 전 적 링 착용, 스샷상 적 핑크
  링 vs 플레이어 teal 링 명확, 콘솔 에러 0.
- [x] **보스전 무결성 검증(체크포인트)** — 두 보스 다 정상. bossA(dasher: aoe+dash) —
  스킬 9~11회 캐스트+텔레그래프, 정지 플레이어는 풀피격→사망(4 이벤트), 반경 10 궤도
  카이팅은 회피(aoe 반경 9.5). bossB(gunner: ranged×2) — 캐스트 10회, enemyBullet 27개
  발사(투사체 정상). phase2 격노, 사망→추출→승리 전부 확인. **잔여(관찰): bossA는 반경
  10+ 원궤도로 완전 회피 가능(aoe 9.5 밖 + dash는 원운동에 빗나감) → 약간 쉬움. 카이팅
  의도엔 부합하나 bossA만 압박이 약함. 실기기 밸런스 판단 필요(막 튜닝 금지).**
- [x] **소스 하드코딩 정리 (진행 중)** — 유저 지적("존나 하드코딩"). 안전한 슬라이스로 점진.
  (1) FX 재질/링: additive 재질 스펙 12곳 복붙 + 확장 링 FX 중복 → `_fxMat`/`_burstRing`
  헬퍼로 통합(렌더 무변경). (2) 테마 색: `0x35e0d0`(13회) 등 엔진 hex 리터럴을
  `COLORS`(data/config.js) 팔레트로 추출, 전 엔진 참조 `COLORS.<name>`으로(값 동일, 렌더
  무변경). 검증: 빌드 그린, 색 동일 렌더(#35e0d0 유지), 콘솔 에러 0.
  (3) 전투/픽업 상수: `hurtT=0.6`(피격 무적창, 2곳)→`CONFIG.player.hitCd`,
  orb/coin 획득거리 `d<1.3`(2곳)→`CONFIG.drops.grab`. 값 동일, 동작 무변경.
  **잔여 후보: 인터랙터블 생성 스켈레톤은 dedup ROI 낮음(모델/비콘 다 다름) — 보류.
  fx.shake/freeze는 이벤트별 고유값(중복 아님) — 필요시 개별. 2000줄 Game.js 모듈 분리(대공사,
  신중히).** 동작 안 바뀌게 검증하며 계속.
  (4) 죽은 코드 제거: lightning-FX 서브시스템 전체(`_lightningFX`+`_fire` 트리거+
  `_loadEffectModels`+`ASSETS.fxModels`+`CONFIG.fx.boltInterval`) — 어떤 무기도
  `fx:'lightning'` 안 쓰고 GLB도 이미 제거됨(dead+broken). `_inSafe`(참조 0, `_keepOutSafe`는
  유지). weapons 스키마 주석 정리. 보스 storm(_stormFX 절차적)은 무관·정상. 검증: 빌드
  그린, 잔존 참조 0, 부팅·보스맵·storm 정상, 콘솔 에러 0.
  (5) 죽은 레벨 빌더: `cityLevel`(구 chicken_gun_fruzer 도시)·`bossArenaLevel`(구 절차
  콜로세움) 참조 0 제거. 라이브는 tutorial/cityStage/waterfall + arenaLevel(GLB실패
  폴백, 유지). `CONFIG.spawn.bossFirst/bossRepeat`(구 타임드 보스 스폰, 미사용) 제거.
  검증: 빌드 그린, 3맵 로드+walkable+인터랙터블, 폴백 정상, 콘솔 에러 0.
- [x] **lightning 이펙트 GLB 없음 → 부팅마다 404** — `assets.fxModels`가
  `effect/lightningv2.glb`/`lightningv1.glb` 참조하나 `public/effect/` 자체가 없음.
  bolt는 완전 미사용(어떤 무기도 `fx:'lightning'` 안 씀), storm은 보스 등장 `_stormFX`가
  쓰지만 모델 없어 무음(guard). `fxModels: {}`로 비우고(404 제거), `_stormFX`를 절차적
  충격파(확장 additive 링 3 + 스파크, 기존 fxSprites {life,max,grow} 계약 재사용)로 재작성.
  검증: 부팅 콘솔 클린(lightning fetch-fail 사라짐), _stormFX 링 3개 생성·보스 스폰 시
  발동, 에러 0.
- [x] **"길인데 막혀서 안가져"(시티 도로가 walkable에서 막힘)** — 로드 실패 아니라 이동
  막힘. 원인: `mapFit.trimOpen`(밀도 트림)이 "너무 열린 셀=void 벌판"을 제거하는데,
  시티는 그 평평-열린 셀이 곧 **도로/광장**이라 걷는 길에 구멍을 냄(주석은 "roads
  survive"라 잘못 단언). 시티는 콘텐츠가 bounds를 꽉 채움(지면 x56/z56 vs ±58)이라
  ±hx/hz 클램프가 이미 가장자리를 막음 → trimOpen 불필요. 제거. 실건물은 walkable
  그리드(높은 지오)+env 콜라이더가 계속 막음. 검증: 막혔던 동쪽 도로대 1/36→34/36
  walkable, walkFrac 0.48→0.72, 전 앵커 도달(BFS), bounds 밖 non-walkable 유지(void
  이동 없음), 탑다운 스샷 도로망 열림. **교훈: 도로/광장 있는 도시맵엔 trimOpen 쓰지
  말 것 — 열린 길을 void로 오인해 구멍냄. 콘텐츠가 bounds를 채우면 클램프로 충분.**
- [x] **미사용 죽은 GLB 에셋 제거 (~7.2MB)** — 참조 0인데 배포에 실려있던 파일 삭제:
  raw_chicken.glb(3.4M, "HP바 인디케이터"라는데 코드 참조 0), chicken_gun_fruzer city
  (1.4M, legacy cityMap), mystical_forest_cartoon(2.3M, 숲 제거 후 death), bubble_gun
  (104K, 순수 고아). assets.js 엔트리(cityMap/forestMain/rawChicken) + 고아 빌더
  `mysticForestLevel` 삭제. SW는 index.html만 precache(GLB는 on-demand)라 런타임 영향
  0, 배포/레포만 슬림. 검증: 빌드 그린, city(1323 mesh)·boss(보스 모델 38 mesh) 정상,
  콘솔 신규 에러 0. **잔여 발견: effect/lightningv1·v2.glb는 참조되나 파일 없음(부팅마다
  load fail, fallback으로 무해) — 별도 항목.**
- [x] **"맵이 안가져"(첫 맵 로드 실패)** — 숲 제거로 city가 첫 부팅-로드 맵이 됨. city
  GLB가 **16MB**(무압축 JPEG/PNG 텍스처 + f32 지오, 확장 없음) → 모바일에서 첫 맵이
  제때 안 받아져 안 보임. gltf-transform으로 재압축: 텍스처→webp(q85), 지오→meshopt+
  quantization. **16.4MB→3.6MB**(77%↓, 구 숲보다 가벼움). 세 확장(EXT_meshopt_
  compression/EXT_texture_webp/KHR_mesh_quantization) 전부 three GLTFLoader 기본 지원
  (meshopt 디코더 이미 연결됨). 검증: mesh 1323·walk 0.44·anchors 10·bad 0 = 지오
  동일, 텍스처 에러 0, 스샷 정상. 원본 백업 scratchpad/city_orig.glb.
- [x] **첫 숲(main) 맵 제거** — 요청. 진행 튜토리얼→**시티**→보스(구 튜토→숲→시티→보스).
  levels 튜토 포탈→'city', MAPS에서 'main' 삭제; Game 시작·튜토완료·부팅워밍·objective
  게이트 전부 'city'. `mysticForestLevel`/`forestMain`은 소스 잔존(참조 없음, 복원 가능).
  검증: 튜토 스킵→시티 바로(코어A/상자 배치, 스샷), 시티→보스, 보스 로드. **주의: 아래
  숲 관련 닫힘 항목(숲 trimOpen/밝기/상자)은 이제 죽은 맵 이력 — 시티/보스에만 적용.**
- [x] **무기 드롭 "획득" 토스트 2번** — 상자 개봉 시 `evt.acquired`를 미리 쏘고(줍기 전),
  실제 줍기(`_collectItem`)에서 또 쏨 → 이중+조기 안내. 개봉은 픽업만 스폰, 토스트는
  줍는 순간 1회만. 검증: 상자개봉 이벤트 0 → 줍기 시 acquired 1회, owned에 nerf 추가.
  (부수 감사: 무기 5종 bullet type 전부 `_makeBullet` 처리됨('beam' 포함, 헤더 주석만
  구식), 스위칭 cycleWeapon/selectWeaponSlot/아설널 탭 정상, 드롭 순서 nerf→laser 정상.)
- [x] **강화 장갑(Reinforced Hull) 스킬이 최대 체력을 안 올림** — 'hp' 노드는 "+22
  최대 체력/랭크" 광고인데 `state.maxHp`는 baseMaxHp에서 레벨업으로만 증가, `md.hp`는
  체력 픽업 오버힐 캡(1247)으로만 쓰여 HP바·힐캡·재생캡에 전혀 반영 안 됨 → 최대 5포인트
  "+110" 죽은 스킬. 수정: `buySkill`이 hull 델타(computeModifiers.hp 전/후)를 maxHp+hp에
  적용(레벨업처럼 즉시 부여), 픽업 라인은 잉여 `+md.hp` 제거하고 실제 maxHp로 클램프.
  검증: Hull×3(hp=60) → maxHp 100→166·hp 60→126, dmg×2 → md.dmg 1→1.36·maxHp 유지
  (교차·중복 없음). **부수 감사: 15개 mod 전부 engine에서 소비됨(죽은 스킬 hull뿐이었음).**
- [x] **보스전 중 잡몹 폭주** — 스폰 디렉터가 `maxEnemies`만 보고 `bossActive`는 안 봤음
  → 보스전에도 잡몹이 16까지 스폰(측정: 15에 고정). 보스 텔레그래프(AoE/대시/난사)가
  군중에 묻혀 "읽고 피하는" 보스 듀얼이 무너짐. `CONFIG.spawn.bossMaxEnemies`(6, 보스
  포함) 추가, 보스 생존 중엔 이 값으로 캡. 검증: 보스맵 잡몹 15→5 캡(총 6, 보스 생존),
  일반맵은 16 유지(영향 없음). 보스 사망/승리 경로 무변경.
- [x] **진행 무결성 검증(체크포인트)** — main→city→boss→추출→승리 풀 루프 sim 검증:
  세 맵 전 interactable walkable+지면(badAnchors 0), 보스 사망→추출 활성→objective 갱신,
  추출 도달성(BFS)+`_win()` 정상. objective/이벤트 i18n 키 en/ko 완비. 리그레션 없음.
- [x] **픽업(xp orb/coin) 누수** — 라이브 perf 감사에서 발견. (1) 드롭마다 geometry+
  material을 새로 할당하고 scene.remove 시 dispose 안 함(GPU 버퍼 누수), (2) 수집
  (d<1.3)될 때만 제거 → 멀리서 죽인 몹의 픽업은 영원히 잔류. 측정: geometries
  63→152, orbs 107→339, scene children 223→887(선형 증가). 근본 수정: 픽업 타입별
  geometry+material **1개 공유**(재사용, 미-dispose) + `CONFIG.drops.pickupLife`(18s)
  후 despawn(마지막 1초 shrink). 재검증 7500프레임/375s: geo 12→12, orbs 40→43,
  kids 86→97 = 전부 바운드. (perf 자체는 건강: render 2ms/sim 0.05ms, 몹 16=+3
  draw call로 인스턴싱됨 — 조기 최적화 안 함.)
- [x] **아이템 드롭(health/scrap/weapon) 지오메트리 누수** — 위 픽업 누수와 같은 클래스.
  `_spawnItemDrop`이 드롭마다 geometry 4 + material 4 새로 할당, despawn(worldG.remove)
  시 dispose 안 함 → 세션 누적 드롭 수만큼 GPU 버퍼 누수(live 수는 22s despawn으로
  바운드지만 버퍼는 미해제). 수정: geometry 세트 1회 + material 세트 kind별 캐시
  (`_dropAsset`) 전 인스턴스 재사용. 검증: render-in-loop 3600프레임 드롭 churn →
  geometries 63→63 평평, ring geo 공유(identity ===). (itemDrops는 이미 life 기반
  despawn 있었음 — 이번엔 지오/머티리얼 공유만.)
- [x] 튜토리얼이 void 플랫폼처럼 텅 빔 — 휘도 측정 near-black 72%(작은 아레나+어두운
  배경). floor/bg/fog/light 밝힘. 재측정 near-black 72%→0%, avgLum 54→78.6,
  blowout 0. 첫인상 개선. (폭포=avgLum 81 이미 밝음 → 전 맵 밝기 검증 완료.)
- [x] 시티맵 너무 어두움 — 캔버스 평균 휘도 측정: avgLum 34(숲 57), near-black
  53%. exposure 1.4 + light hemi1.1→1.9/dir2.2→3.2 + 밝은 fog/bg. 재측정
  avgLum 51.5, near-black 36%, blowout 0 = 숲과 비슷·읽을 만함. (측정법 MAP_GUIDE.)
- [x] **시티** 코어B/포탈이 지붕 위에 박혀 안 보임 — probe로 확인: coreB (44,-13)
  y=4.8, portal (0,-44) y=3.3 = 둘 다 elevated plane(지붕) 위 클리핑. (유저의
  "코어B/포탈 안 보임"이 이 시티 배치였음 — 앞서 숲 것만 보고 성급히 닫았던 것 정정.)
  probe 절차로 clear ground 재배치: coreB (41,2) y=-1.1, portal (11,41) y=1.4.
  전부 도달+좋은 땅 검증.
- [x] 숲 상자가 나쁜 곳에 배치됨 — probe로 확인: #3 WallTower 위(y=11.5, 탑 속에
  박힘), #5 바위 위(y=3.4), #1 56유닛(너무 멀어 blue-edge). MAP_GUIDE probe
  절차로 clear Ground(y≈0)·도달·거리14~42·각도분산 5곳 산출해 교체. 전부 검증.
  (몹 스폰은 봉쇄 후에도 정상 — _spawnWalkable 재배치, forest 8/8·city 9/9 도달.)
- [x] 보스가 대시/추격으로 walkable 경계 뚫고 나감 — boss.js 대시·추격이
  `_collide`(장애물 박스)만 보고 `_walk`는 안 봤음. 보스 확대 + 아레나 봉쇄가
  겹치며 노출(대시가 아레나 밖으로). 둘 다 `_walkable` 체크 추가(대시=정지,
  추격=축별 슬라이드). 검증: 대시 x13→x9 정지, 600프레임 이탈 0.

- [x] 핫 루프 per-frame 벡터 할당 제거 + `_mods()` 메모이즈 (perf)
- [x] 시티맵(스테이지3) 추가, 진행 숲→시티→보스
- [x] 카메라 B프리셋 + 반대편(입력 반전)
- [x] 스폰을 설계 앵커 근처 개활지로
- [x] 숲 밝기(exposure) + ×1.5 확대
- [x] 튜토리얼 포탈 스텝9 게이팅(스킬트리 스킵 불가)
- [x] 튜토 시작 깜빡임 — transOverlay 불투명
- [x] 패널 깜빡임/닫힘 — 패널 바뀔 때만 재생성
- [x] 상점 눈부심 — 발광0 + 노출1.4 + 재질 밝기 클램프
- [x] X-ray 히어로 흰색 — toneMapped:true + opacity↓
- [x] 포탈 비콘 탑다운 가시성 — 수평 링 y=1.2, depthTest on
- [x] 음악/효과음 독립 토글
- [x] 크리스탈(아레나 기둥) 제거
- [x] 픽업 자석 너프
- [x] SW 자동 업데이트(skipWaiting)

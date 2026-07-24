# 맵 / 레벨 가이드 (실전)

맵 추가·수정 시 이 절차를 따른다. 배경 이론은 `public/scene/forest_guide.md`,
코드 구조는 `ARCHITECTURE.md`.

---

## 1. 구성 요소

- `src/data/levels.js`
  - 레벨 빌더 함수(`mysticForestLevel()` 등) — 앵커/조명/경계 데이터 반환.
  - `MAPS` 레지스트리 — `{ id, model, build }`. `model:null`=순수 절차 아레나.
  - 진행: 튜토리얼 → city(시티) → boss(폭포). 각 포탈의 `to`로 연결. (구 forest/main
    맵은 완전 제거 — 빌더·에셋·GLB 파일 모두 삭제됨. 복원은 git 히스토리에서.)
- `Game._loadMapModel` → `_finishMapLoad` — GLB 로드/정규화/스폰/워크블 그리드.
- `Game._buildWorld` — 앵커로 코어/포탈/상점/상자 배치, `_snapAnchors`로 스냅.

## 2. 레벨 필드

```
{
  id, B, bounds:{hx,hz},        // 경계(플레이어 클램프 = ±hx/hz - radius)
  harvest:true,                 // 워크블 그리드 생성(자연 맵)
  mapFit:{ normalize, walkTop, yaw?, scale?/center?/... },
  exposure,                     // 이 맵의 톤매핑 노출(어두운 맵 밝히기)
  spawnStart, safe,
  cores:[{x,z}...], shop:{x,z}, portal:{x,z,to}, crates:[[x,z]...],
  spawns:[[x,z]...],            // 몹 스폰 지점(가장자리)
  fog, bg, light:{hemi,dir},
}
```

- **좌표는 normalize 이후 기준.** `normalize`를 N배 바꾸면 **모든 앵커도 N배**.
- `bounds`가 콘텐츠보다 훨씬 크면 빈 땅/void로 걸어나감. 콘텐츠에 맞춰 조인다.
- `exposure` 기본 1.25. 어두운 맵만 올림(숲 1.4). 너무 올리면 밝은 재질이
  블룸으로 흰색됨(ARCHITECTURE 6절).

## 3. 배치 절차 — **추측 금지, 검증 필수**

1. 앵커 후보 좌표를 잡는다(가이드/구조물 이름 기준).
2. **실제 지형 위인지 probe로 확인**한다. 개발 콘솔에서:
   ```js
   const g=window.__CHICKCOOP, V=g.aim.constructor, RC=g.ray.constructor;
   const probe=(x,z)=>{const r=new RC(new V(x,900,z),new V(0,-1,0),0,5000);
     const h=r.intersectObject(g.map,true).filter(o=>o.object.visible);
     return h.length?{y:+h[0].point.y.toFixed(1),name:h[0].object.name}:'VOID';};
   probe(x,z); g._walkable(x,z);
   ```
   - `VOID` / 이름이 `Arbre`(나무) / y가 큰 값 = **나쁨**. `Ground_Sol`이나
     구조물(`Temple`/`Mine`) 위 + y≈0 = 좋음.
3. **어두운 가장자리 금지.** 자연 맵은 중앙/구조물은 밝게, 외곽 평지는 어둡게
   렌더된다. 코어/포탈/상자는 **밝게 보이는 구조물이나 중앙**에 둔다.
4. 워크블 모양을 직접 본다(중앙이 거대 구조물로 막혔는지 등):
   ```js
   // reach 마스크를 ASCII로 덤프 — 실제 걸을 수 있는 형태 확인
   ```
5. 배포 후 **실기기 스크린샷**으로 최종 확인.

## 4. 알려진 함정

- **하드코딩 앵커가 void/나무 위에 떨어짐** — probe 없이 좌표만 옮기면 반복해서
  안 보이는 곳에 박힌다. 3절 절차 필수.
- **normalize 바꾸면 앵커 안 바꿔서 어긋남** — 항상 같은 배율로 스케일.
- **맵 회전(`mapFit.yaw`)** — 맵 지오메트리가 도는데 앵커 좌표는 그대로 →
  구조물에서 벗어남. yaw를 넣으면 **앵커 좌표도 같은 각도로 회전**해야 한다
  ((x,z)→yaw 회전). 아직 미구현/주의.
- **포탈 = 코어(워크벤치) 자리.** 기획상 "해킹한 연구실이 게이트가 됨." 포탈은
  보이는 코어 위치에 co-locate. 비콘은 수평 링(ARCHITECTURE 6절).
- **데스크톱 렌더 검증 불가** — 백그라운드 탭에서 수동 카메라 렌더가 캄캄하게
  나옴. 위치는 probe, 최종은 실기기.
- **맵 밖(void/빈 벌판)으로 걸어나감** — 바닥 평면이 콘텐츠보다 크면 walkable이
  거기까지 뻗음. 두 opt-in 기법으로 봉쇄:
  - `mapFit.trimOpen`(밀도): 나무·바위로 쪼개진 자연맵(숲)에만. 너무 열린 셀 제거.
    **⚠ 도로/광장 있는 도시맵엔 금지** — 평평한 길을 "열린 void"로 오인해 구멍냄
    ("길인데 막힘"). 콘텐츠가 bounds를 채우면 ±hx/hz 클램프만으로 가장자리 봉쇄 충분.
  - `mapFit.boundToContent`(bbox+여백, 폭포 15): 바닥이 주 플레이 면인 맵. 앵커
    박스로 클램프. 밀도 트림이 소프트락 낼 때 이걸 쓴다.
  검증: 4방향 walk 테스트 + 앵커 도달성(특히 extraction) probe로 확인.
- **맵 밝기 객관 측정** — 데스크톱 스샷은 못 믿으니 캔버스 평균 휘도로 잰다:
  다운스케일 캔버스에 `drawImage` → `getImageData`로 `0.2126R+0.7152G+0.0722B`
  평균. 참고: 숲 avgLum≈57(읽을 만함), 어두운 맵은 <40(시티는 34였음).
  목표 ~50 근처. `level.exposure`(1.4)+`light.hemi/dir`로 올리되 blownFrac(>245)
  0 유지(블룸 blowout 방지).

## 5. 현재 맵 상태

| 맵 | 모델 | 정규화 | 성격 | 비고 |
|----|------|--------|------|------|
| tutorial | 없음(절차) | - | 훈련장 | 스텝 게이팅(포탈=스텝9) |
| city | a_city_in_nature | 120 | 시티(첫 전투맵) | 도로/개활, 풀 빌보드 |
| ~~main~~ | ~~mystical_forest~~ | - | 제거됨 | 소스 잔존, MAPS 미등록 |
| boss | forest_waterfall | 240 | 보스 아레나 | ×2 확대 |

# CHICKCOOP — Game Design & Production Doc

> Target quality bar: **Duckcoop-level** — a polished mobile-first urban twin-stick
> survival-action game. Readable top-down city combat, tactile weapon feel, clean
> HUD, smooth on mid-range phones. This doc is the single source of truth for the
> hourly improvement loop: it tracks current state, the gap to target, the quality
> bar, the verification protocol, and a prioritized backlog the loop pulls from.

Last updated: 2026-07-23 (loop maintains this).

---

## 1. Vision & Pillars

**Elevator:** A battle chicken dropped into a neon night city. Roam real streets,
hold off waves of enemy birds, hack data cores to open the portal, and survive the
boss arena. Twin-stick controls, weapon progression, roguelite skill tree.

**Pillars**
1. **Readable urban combat** — you always see your character, your aim, your
   threats. Buildings never fully hide the action (occlusion fade).
2. **Tactile weapons** — every gun has distinct feel: fire rate, recoil, muzzle,
   sound, projectile. Progression flare → nerf → laser → space → water.
3. **Mobile-first** — designed for a phone in landscape, thumbs on twin sticks.
   Desktop is the secondary target, not the reference.
4. **Fair pressure** — enemies telegraph, wake on sight (no instant swarm), boss
   casts a visible danger gauge. Death feels earned.

---

## 2. Current State (implemented)

- **Flow:** Home (EN/KO) → tutorial (skippable, small lab) → city (2 cores → portal)
  → boss arena → extraction/win.
- **Maps:** Real city GLB (meshopt+webp, 1.44 MB, meme meshes stripped), procedural
  tutorial + boss arenas. City enlarged ~2.5× for street combat.
- **Player:** chuck_movie rig (idle/run crossfade + procedural hop/lean/recoil),
  body faces movement direction, visible held gun model, dash w/ i-frames.
- **Combat:** 5 weapons, skill tree, mob tiers (melee/ranged) with telegraphed
  attacks, 2 boss types with cast gauge, drops (weapon/health/scrap), XP/levels.
- **Enemies:** wake on sight/damage (not pre-aggro'd), maxEnemies 16, LOS-gated
  touch auto-fire.
- **Systems:** occlusion fade, camera lead/shake/recoil, twin-stick + keyboard
  input, pause menu (music/quit), i18n EN/KO, PWA (SW versioning + manual update
  + add-to-home), CI/CD (dev → PR → production → CF Workers deploy).
- **Assets:** all GLBs optimized (public 58 MB → 13 MB).

---

## 3. Gap to Duckcoop (target − current)

| Area | Current | Duckcoop-level target |
|---|---|---|
| **Spawn/level design** | Player boots onto a rooftop | Spawn at a street intersection; hand-placed cover, lanes, landmarks |
| **Boss fight** | Basic arena, thin FX | Multi-phase, screen-filling telegraphs, arena hazards, reward beat |
| **Attack anim** | Procedural recoil only | Dedicated fire/attack clip layered over locomotion |
| **Enemy variety** | 3 mob types | 5–6 archetypes (rusher, shooter, bomber, shielder, swarm) |
| **Juice** | Basic impacts/bloom | Hit-stop tuning, screen flash, damage numbers, kill streaks, chromatic |
| **HUD/UX** | Functional | Minimap/threat arrows, weapon wheel, ammo/heat clarity, objective ping |
| **Audio** | 1 BGM + basic SFX | Layered SFX per weapon/impact, boss stinger, adaptive music |
| **Onboarding** | Text tutorial | Guided first-fight with contextual prompts |
| **Perf** | Unverified on phone | Locked 60fps mid-range phone, <3s to interactive |
| **Meta** | Single run | Currency, unlocks, run modifiers, difficulty tiers |

---

## 4. Quality Bar (acceptance criteria)

**Mobile-first (primary check every loop)**
- Landscape phone viewport (e.g. 844×390, 915×412). No clipped/overflowing UI.
- Deploy button, HUD, sticks, buttons fully visible and thumb-reachable.
- Touch: left stick moves + turns body; right stick aims + fires; dash/interact
  buttons aligned, cooldown ring correct.

**Performance**
- Target 60fps with 16 mobs + effects on a mid-range phone; no per-frame GC spikes,
  no per-bullet dynamic lights, shared geometries/materials.
- First interactive < 3s on cached load; assets meshopt+webp.

**Play feel / logic**
- Character never sinks/clips through ground; can't walk off the map.
- Weapons: correct fire rate, pickup does NOT force-swap active weapon.
- Enemies wake on sight, telegraph, don't shoot through walls.
- Interactions: hold-to-channel gauge, icon-only contextual prompt.

**UI**
- Follows the prototype's cyber-HUD aesthetic. No placeholder/kindergarten text.
- i18n complete EN/KO. Icons have rationale (SVG, contextual).

---

## 5. Hourly Verification Protocol (the loop runs this)

Each hour, in order. Stop and fix the first failing gate before adding features.

1. **Build gate** — `npm run build` must pass clean.
2. **Mobile screen check** — the automation Chrome has a FIXED layout viewport
   (`resize_window` changes neither `innerWidth` nor the screenshot), so instead
   **mount the page in an IFRAME** sized to the phone-landscape CSS box (844×390,
   915×412): the iframe gets its own layout viewport, CSS media queries fire, and
   `iframe.contentWindow.innerWidth` reads the real width. Measure element rects
   (`getBoundingClientRect`) for clipping/overflow, and screenshot the iframe for a
   visual check. This is the verified mobile-render harness — use it every loop.
3. **Logic/play check** — via `window.__CHICKCOOP`: verify grounding, bounds,
   weapon pickup (no auto-swap), enemy aggro gate, interaction channel, no console
   errors. **Verify by REAL PLAY, not forced state** — do NOT set gold/hp/owned
   directly then declare success. Simulate the actual loop: kill enemies with real
   bullets, let drops magnet in, confirm gold ACCRUES and a weapon becomes
   affordable; run the tutorial through its real step conditions. Forced-state
   tests hid a dead economy (drops never collected → 0 gold) and a timer-skipped
   buy step. If a check needs you to grant resources to pass, that itself is a bug.
4. **Performance check** — frame-step or FPS probe with mobs active; watch for
   long frames, growing object counts, leaked materials.
5. **Improve** — pull the top open item from the backlog (§6). Implement one
   coherent, verifiable slice. Update this doc.
6. **Re-verify** — repeat gates 1–4 for the change.
7. **Ship** — commit on `development`, open/merge PR to `production` (deploy).
   If merge is blocked, leave the PR ready and report.

Rule: **never deploy a red build.** Prefer one polished, verified change per hour
over many unverified ones. Log what was done + what's next at the bottom.

---

## 6. Prioritized Backlog (loop pulls top open item)

### P0 — correctness / blocking
- [x] **Economy was dead + interaction icons** (2026-07-23, user-reported): the
      pickup magnet radius (3.4) was smaller than typical kill range, so scrap/XP
      drops were left on the ground — a real-combat sim showed **0 gold after 20
      kills**, so the shop was unaffordable ("돈이 없다"). Widened the magnet to 9.5
      with a stronger pull + higher/again-more-reliable coin drops. Re-sim: 15 kills
      → 68 gold, all collected, nerf (40) affordable by ~kill 7. Also redrew the 4
      interaction icons bolder/clearer (HACK chip, GET loot-crate, GO portal, EXIT
      lift-off). Baked "verify by REAL PLAY not forced state" into §5.
- [x] **Tutorial flow fixes** (2026-07-23, user-reported): (1) the buy/shop step
      auto-completed on a 4s timer without buying — now it requires an actual
      purchase (`pickWeapon`), with 60 scrap granted at step start so it can't
      soft-lock; (2) the tutorial→city transition could leave the fade overlay stuck
      (looked like "loading, can't move") — `_goToMap` is now wrapped in try/finally
      so the overlay + `_transitioning` flag ALWAYS clear; (3) removed the tutorial's
      "meaningless pillar" covers for a clean training bay; (4) buy-step text now
      says "SHOP/상점" to match the button. Verified end-to-end: no auto-advance
      without buying, buy → equips + crosses to city, player spawns walkable & moves,
      no console errors.

- [x] **Street-level spawn** (2026-07-23): `_loadMapModel` scans candidate XZ,
      raycasts down, picks the lowest road/sidewalk surface nearest centre; result
      stashed on `this._streetSpawn` (map-keyed) because `_buildWorld` rebuilds
      `this.L` from a fresh `entry.build()`. Verified: player at (-2,8) on BG_01
      road, y=0, no console errors.
- [x] **Walk-off-map guard** (2026-07-23): the ±62 bounds square overshot the city
      footprint (55/1024 sampled cells were void). `_loadMapModel` now builds a
      coarse walkable grid (ground near street level only) once at load; movement
      does an O(1) `_walkable` lookup with per-axis slide, blocking void + rooftops.
      Verified: void points blocked, both cores + portal reachable, streets
      traversable, no errors.
- [x] **Mobile-landscape home clipping** (2026-07-23): `#startOverlay` inline style
      had `overflow:hidden` + `justify-content:center`, beating the stylesheet — so
      on short landscape viewports content taller than the screen clipped top+bottom
      and was unscrollable (62px at 844×390, 74px at 915×412). Fixed to
      `overflow-y:auto` + `justify-content:safe center`; landscape padding tightened.
      **Verified via iframe** at 844×390 & 915×412: overflow-y auto/scrollable,
      Deploy button fully visible, all content reachable, no console errors.

### P1 — Duckcoop-feel core
- [x] **Dedicated attack clip** (2026-07-23): `AngrybirdRed_Attack` played as an
      ADDITIVE layer (delta over bind pose, root position tracks dropped so the body
      doesn't slide) over idle/run, one-shot, retriggered per shot with a rate guard
      so fast weapons don't buzz. Verified: blendMode=Additive, plays on fire at
      weight 0.9, no body teleport (model local pos 0), locomotion blend intact,
      distinct lunge pose on screen, no console errors.
- [x] **Boss 2-phase / arena hazard** (2026-07-23): at ≤50% HP the boss ENRAGES —
      move speed ×1.3, skill cooldowns ×0.55, an impact burst + shake + "BOSS
      ENRAGED" banner/event, and a recurring arena hazard: telegraphed falling
      meteors (ring warns ~1.2s, then shockwave + AoE damage if you're inside).
      Verified: phase 1→2 at 45% HP, spd 2.2→2.86, cdMul 1→0.55, meteors spawn +
      telegraph on-screen, enrage event fires, no console errors. (Red model tint is
      best-effort — some boss materials lack an emissive channel; other cues cover it.)
- [ ] Boss reward beat polish (bigger death payoff / slow-mo).
- [x] **Damage numbers** (2026-07-23): pooled canvas-texture billboards (reused,
      capped 28 live, no per-hit alloc) pop above a struck enemy — white normal,
      gold crit, outlined, float-up + fade. Verified: 10 hits → 10 numbers with
      correct values, rendered on-screen, no console errors. Kill-streak still open.
- [x] **Kill-streak counter** (2026-07-23): consecutive kills inside a 2.8s rolling
      window drive a center-top combo badge (×N) that pops on each kill and escalates
      COMBO→RAMPAGE→CARNAGE with tier colours; resets when the window lapses; tracks
      `streakBest`. Verified: ×2..×6 chain + reset + best=6; badge repositioned to
      top:12% to clear the level-up/acquire toasts; no console errors.
- [ ] Minimap or off-screen threat arrows (mobile-readable).
- [ ] Two more enemy archetypes (bomber that rushes+explodes, shielder).

### P2 — polish / meta
- [ ] Per-weapon layered SFX + boss stinger; adaptive music intensity.
- [ ] Weapon wheel / quick-select for touch.
- [ ] Guided first-fight onboarding prompts.
- [ ] Run currency + unlocks + difficulty tiers.
- [ ] Chromatic/vignette on hit, refined hit-stop tuning.

---

## 7. Change Log (loop appends)

- 2026-07-23 — Asset optimization (city 25.4→1.44 MB, public 58→13 MB), city 2.5×,
  face-move direction, gun visible, occlusion fade, sight-gated mobs, LOS auto-fire,
  PWA toasts hidden in play, SVG interaction/dash icons, weapon pickup no auto-swap.
  Deployed (PR #10).
- 2026-07-23 (hourly loop #1) — P0 street-level spawn: player boots onto the road,
  not a rooftop. Fixed the `this.L` rebuild bug that discarded the computed spawn.
  Gates 1–3 green, no console errors.
- 2026-07-23 (hourly loop #2) — P0 walk-off-map guard: coarse walkable grid built
  at load (street-level ground only); O(1) per-frame lookup blocks void/rooftops.
  Verified void blocked + objectives reachable + streets traversable.
- 2026-07-23 (hourly loop #3) — P1 damage numbers (pooled billboards). Gates 1/3/4
  green; gate 2 was blocked by the fixed viewport at the time.
- 2026-07-23 (hourly loop #4) — UNBLOCKED gate 2 with an iframe render harness, then
  fixed P0 mobile-landscape home clipping (`#startOverlay` inline overflow/justify).
  Verified at 844×390 & 915×412: Deploy button visible, content scrollable, no errors.
- 2026-07-23 (hourly loop #5) — P1 kill-streak combo badge (×N, tiered COMBO/RAMPAGE/
  CARNAGE, 2.8s window). All gates green (mobile via iframe).
- 2026-07-23 (hourly loop #6) — P1 dedicated attack clip (additive layer over
  idle/run, root-position tracks dropped, per-shot retrigger). Verified additive +
  no teleport + locomotion intact + no errors. Animation-only, no UI impact.
- 2026-07-23 (hourly loop #7) — P1 boss 2-phase: enrage at 50% HP (faster, quicker
  skills, banner) + telegraphed meteor arena hazard. Verified phase flip, buffs,
  meteors, no errors. **Next:** off-screen threat arrows (mobile), then enemy
  archetypes.

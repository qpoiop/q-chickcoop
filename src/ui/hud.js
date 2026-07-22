import { WEAPONS } from '../data/weapons.js';
import { computeModifiers } from '../data/skills.js';

// HUD — mirrors game state into the static markup declared in index.html.
// sync()  : structural/state-change updates (overlays, weapon, pips, objective)
// tick()  : cheap per-frame numeric updates (bars, counters, boss)
// All element lookups are cached once; no per-frame querySelector.

const $ = (id) => document.getElementById(id);
const fmtTime = (t) => { const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + String(s).padStart(2, '0'); };

export class HUD {
  constructor(game) {
    this.g = game;
    this.el = {
      loading: $('loading'), start: $('startOverlay'), end: $('endOverlay'),
      level: $('hudLevel'), hpTxt: $('hudHpTxt'), hpBar: $('hudHpBar'), xpBar: $('hudXpBar'),
      dashPips: $('hudDashPips'), gold: $('hudGold'), kills: $('hudKills'), time: $('hudTime'),
      objBox: $('hudObjBox'), objLabel: $('hudObjLabel'), objText: $('hudObjText'), skipTut: $('hudSkipTut'),
      weaponIcon: $('hudWeaponIcon'), weaponName: $('hudWeaponName'),
      skillBadge: $('hudSkillBadge'), prompt: $('hudPrompt'), promptKey: $('hudPromptKey'), promptText: $('hudPromptText'),
      touchBtns: $('hudTouchBtns'), hint: $('hudHint'),
      boss: $('hudBoss'), bossName: $('hudBossName'), bossHp: $('hudBossHp'), bossBar: $('hudBossBar'),
      endTitle: $('endTitle'), endLevel: $('endLevel'), endKills: $('endKills'), endTime: $('endTime'),
      skipStart: $('btnSkipTutStart'),
    };
    this._dashCount = -1;
    this._buildStartParticles();
    this._wire();
  }

  _wire() {
    const g = this.g;
    $('btnStart').onclick = () => g.start();
    $('btnRestart').onclick = () => g.restart();
    $('btnSkipTutStart').onclick = () => g.skipTutorial();
    $('hudSkipTut').onclick = () => g.skipTutorial();
    $('btnInventory').onclick = () => g.openPanel('inv');
    $('btnArsenal').onclick = () => g.openPanel('weapons');
    $('btnSkills').onclick = () => g.openPanel('skills');
    $('btnDash').ontouchstart = (e) => { e.preventDefault(); g._dash(); };
    $('btnUse').ontouchstart = (e) => { e.preventDefault(); g._use(); };
  }

  // Loading screen is dismissed once first frame renders.
  hideLoading() { if (this.el.loading) this.el.loading.style.display = 'none'; }

  _buildStartParticles() {
    const host = $('startParticles'); if (!host) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 10; i++) {
      const warm = Math.random() < 0.6;
      const s = (3 + Math.random() * 4).toFixed(1);
      const sp = document.createElement('span');
      sp.style.cssText = `position:absolute;left:${(Math.random() * 100).toFixed(1)}%;bottom:-10px;width:${s}px;height:${s}px;border-radius:50%;background:${warm ? 'rgba(255,176,59,.7)' : 'rgba(89,255,157,.6)'};opacity:0;animation:floatP ${(8 + Math.random() * 8).toFixed(1)}s linear -${(Math.random() * 12).toFixed(1)}s infinite`;
      frag.appendChild(sp);
    }
    host.appendChild(frag);
  }

  // ---- structural sync (on state changes) ----
  sync() {
    const s = this.g.state, e = this.el;
    e.start.style.display = (!s.started && !s.ended) ? 'flex' : 'none';
    e.end.style.display = s.ended ? 'flex' : 'none';
    e.skipStart.style.display = this.g._tutSeen ? 'none' : 'inline';

    // weapon readout
    const w = WEAPONS[s.weapon] || WEAPONS.flare;
    e.weaponIcon.textContent = w.icon; e.weaponIcon.style.borderColor = w.color; e.weaponIcon.style.color = w.color; e.weaponIcon.style.boxShadow = `0 0 12px ${w.glow}`;
    e.weaponName.textContent = w.name;

    // objective + tutorial state
    e.objLabel.textContent = s.tutorial ? 'Tutorial' : 'Objective';
    const accent = s.tutorial ? '#ff9a3b' : '#35e0d0';
    e.objLabel.style.color = accent; e.objBox.style.borderLeftColor = accent;
    e.objText.textContent = s.objective;
    e.skipTut.style.display = s.tutorial ? 'inline' : 'none';

    // skill points badge
    if (s.skillPoints > 0) { e.skillBadge.style.display = 'grid'; e.skillBadge.textContent = s.skillPoints; }
    else e.skillBadge.style.display = 'none';

    // dash pips (rebuild only when count changes)
    const md = computeModifiers(s.ranks);
    const dashMax = Math.max(s.dashMax || 2, md.dashchg);
    this._syncDashPips(dashMax, s.dashCharges);

    // mobile controls + hint
    e.touchBtns.style.display = this.g.isTouch ? 'flex' : 'none';
    e.promptKey.textContent = this.g.isTouch ? '⊕' : 'E';

    // end screen
    if (s.ended) {
      e.endTitle.textContent = s.win ? 'SECTOR CLEARED' : 'FRAME DOWN';
      e.endTitle.style.color = s.win ? '#59ff9d' : '#ff3b6b';
      e.endTitle.style.textShadow = `0 0 40px ${s.win ? 'rgba(89,255,157,.5)' : 'rgba(255,59,107,.45)'}`;
      e.end.style.background = `radial-gradient(80% 80% at 50% 40%,${s.win ? 'rgba(10,30,20,.7)' : 'rgba(30,10,16,.7)'},rgba(6,9,14,.95))`;
      e.endLevel.textContent = s.level; e.endKills.textContent = s.kills; e.endTime.textContent = fmtTime(s.time);
    }
    this.tick();
  }

  _syncDashPips(dashMax, charges) {
    const host = this.el.dashPips;
    if (this._dashCount !== dashMax) {
      host.innerHTML = '';
      for (let i = 0; i < dashMax; i++) {
        const sp = document.createElement('span');
        sp.style.cssText = 'width:22px;height:6px;clip-path:polygon(4px 0,100% 0,calc(100% - 4px) 100%,0 100%);transition:background .15s';
        host.appendChild(sp);
      }
      this._dashCount = dashMax;
    }
    [...host.children].forEach((sp, i) => {
      const on = i < charges;
      sp.style.background = on ? '#35e0d0' : '#1c2a38';
      sp.style.boxShadow = on ? '0 0 8px rgba(53,224,208,.6)' : 'none';
    });
  }

  syncPrompt() {
    const s = this.g.state, e = this.el;
    if (s.prompt) { e.prompt.style.display = 'flex'; e.promptText.textContent = s.prompt; }
    else e.prompt.style.display = 'none';
  }

  // ---- fast numeric updates (~12.5 Hz during play) ----
  tick() {
    const s = this.g.state, e = this.el, md = computeModifiers(s.ranks);
    const maxHpShown = s.maxHp + Math.round(md.hp);
    e.level.textContent = s.level;
    e.hpTxt.textContent = Math.ceil(s.hp) + ' / ' + maxHpShown;
    e.hpBar.style.transform = `scaleX(${Math.max(0, s.hp / s.maxHp)})`;
    e.xpBar.style.transform = `scaleX(${Math.max(0, Math.min(1, s.xp / s.xpToNext))})`;
    e.gold.textContent = s.gold; e.kills.textContent = s.kills; e.time.textContent = fmtTime(s.time);

    // dash charge fill without rebuilding
    const dashMax = Math.max(s.dashMax || 2, md.dashchg);
    this._syncDashPips(dashMax, s.dashCharges);

    // boss bar
    if (s.bossActive) {
      e.boss.style.display = 'block'; e.bossName.textContent = s.bossName || 'PRIME ROOSTER';
      e.bossHp.textContent = Math.ceil(s.bossHp) + ' / ' + Math.ceil(s.bossMax);
      e.bossBar.style.transform = `scaleX(${Math.max(0, Math.min(1, s.bossHp / (s.bossMax || 1)))})`;
    } else e.boss.style.display = 'none';

    // hint (first seconds)
    const showHint = s.started && !s.ended && s.time < 7 && s.panel === 'none';
    if (showHint) { e.hint.style.display = 'block'; e.hint.textContent = this.g.isTouch ? 'Left stick — move · Right stick — aim & fire · DASH to dodge' : 'WASD move · aim mouse · SPACE dash · E interact'; }
    else e.hint.style.display = 'none';
  }
}

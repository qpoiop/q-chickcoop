import { WEAPONS } from '../data/weapons.js';
import { computeModifiers } from '../data/skills.js';
import { TUTORIAL } from '../data/tutorial.js';
import { t, locName, getLang, setLang } from '../data/i18n.js';

// HUD — mirrors game state into the static markup declared in index.html.
// sync()  : structural/state-change updates (overlays, weapon, pips, objective)
// tick()  : cheap per-frame numeric updates (bars, counters, boss, cast gauge)
// applyI18n(): (re)writes every [data-i18n] label — called on load + lang switch.

const $ = (id) => document.getElementById(id);
const fmtTime = (t2) => { const m = Math.floor(t2 / 60), s = Math.floor(t2 % 60); return m + ':' + String(s).padStart(2, '0'); };

// Contextual interaction icons (stroke = currentColor). Each reads as its action:
//  core → a circuit chip (hack a data core), crate → a box with a down arrow
//  (collect salvage), portal → an arrow entering a ring (travel), extract → an
//  eject/up-chevron over a pad (escape).
const SVG = (b) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${b}</svg>`;
const PROMPT_ICON = {
  // HACK a data core — a microchip with a lit centre node + pins
  'prompt.core': SVG('<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>'),
  // COLLECT salvage — an isometric loot crate
  'prompt.crate': SVG('<path d="M12 3l8.5 4.2v9.6L12 21l-8.5-4.2V7.2z"/><path d="M3.6 7.3L12 11.4l8.4-4.1M12 11.4V21"/>'),
  // TRAVEL — an arrow diving into a portal ring
  'prompt.portal': SVG('<circle cx="15" cy="12" r="6.5"/><path d="M2.5 12h9.5"/><path d="M8.5 8l4 4-4 4"/>'),
  // EXTRACT / escape — a bold up arrow lifting off a pad
  'prompt.extract': SVG('<path d="M12 3.5l7 8.5h-4.3v6.5H9.3V12H5z" fill="currentColor" fill-opacity=".18"/><path d="M12 3.5l7 8.5h-4.3v6.5H9.3V12H5z"/>'),
};

export class HUD {
  constructor(game) {
    this.g = game;
    this.el = {
      loading: $('loading'), start: $('startOverlay'), end: $('endOverlay'),
      level: $('hudLevel'), hpTxt: $('hudHpTxt'), hpBar: $('hudHpBar'), xpBar: $('hudXpBar'),
      dashPips: $('hudDashPips'), gold: $('hudGold'), kills: $('hudKills'), time: $('hudTime'),
      objBox: $('hudObjBox'), objLabel: $('hudObjLabel'), objText: $('hudObjText'), skipTut: $('hudSkipTut'),
      weaponIcon: $('hudWeaponIcon'), weaponName: $('hudWeaponName'),
      skillBadge: $('hudSkillBadge'), prompt: $('hudPrompt'), promptKey: $('hudPromptKey'), promptGlyph: $('hudPromptGlyph'), promptText: $('hudPromptText'), promptHint: $('hudPromptHint'),
      touchBtns: $('hudTouchBtns'), hint: $('hudHint'), btnDash: $('btnDash'),
      boss: $('hudBoss'), bossName: $('hudBossName'), bossHp: $('hudBossHp'), bossBar: $('hudBossBar'),
      cast: $('hudCast'), castName: $('hudCastName'), castBar: $('hudCastBar'),
      endTitle: $('endTitle'), endLevel: $('endLevel'), endKills: $('endKills'), endTime: $('endTime'),
      skipStart: $('btnSkipTutStart'), langEn: $('langEn'), langKo: $('langKo'),
      btnPause: $('btnPause'), pauseOverlay: $('pauseOverlay'), musicState: $('musicState'),
      combo: $('hudCombo'), comboN: $('hudComboN'), comboLbl: $('hudComboLbl'),
    };
    this._dashCount = -1;
    this._buildStartParticles();
    this._wire();
    this.applyI18n();
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
    const bu = $('btnUse');
    const useDown = (e) => { e.preventDefault(); g._touchUseHeld = true; };
    const useUp = () => { g._touchUseHeld = false; };
    bu.ontouchstart = useDown; bu.ontouchend = useUp; bu.ontouchcancel = useUp;
    $('hudWeaponBox').onclick = () => g.cycleWeapon(1);
    this.el.langEn.onclick = () => this._setLang('en');
    this.el.langKo.onclick = () => this._setLang('ko');
    $('btnPause').onclick = () => g.togglePause();
    $('btnResume').onclick = () => g.togglePause();
    $('btnMusic').onclick = () => g.toggleMusic();
    $('btnQuit').onclick = () => g.quitToHome();
  }

  _setLang(l) { setLang(l); this.applyI18n(); this.g.audio && this.g.audio.ui && this.g.audio.ui(); this.g.refresh(); }

  // Write all translatable chrome; safe to call any time.
  applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.getAttribute('data-i18n')); });
    document.documentElement.lang = getLang();
    this.el.langEn.classList.toggle('active', getLang() === 'en');
    this.el.langKo.classList.toggle('active', getLang() === 'ko');
  }

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

  _objText() {
    const k = this.g.state.objectiveKey || 'obj.coreA';
    if (k.startsWith('tut:')) { const st = TUTORIAL[+k.slice(4)]; return getLang() === 'ko' ? st.textKo : st.text; }
    return t(k);
  }

  // ---- structural sync ----
  sync() {
    const s = this.g.state, e = this.el;
    e.start.style.display = (!s.started && !s.ended) ? 'flex' : 'none';
    e.end.style.display = s.ended ? 'flex' : 'none';
    // install / update toasts belong on the HOME screen only — never over gameplay
    // OR the end screen (which is not home). Show only when neither started nor ended.
    document.body.classList.toggle('playing', s.started || s.ended);
    if (!s.started || s.ended) this.hideCombo();
    e.skipStart.style.display = this.g._tutSeen ? 'none' : 'inline';

    const w = WEAPONS[s.weapon] || WEAPONS.flare;
    e.weaponIcon.textContent = w.icon; e.weaponIcon.style.borderColor = w.color; e.weaponIcon.style.color = w.color; e.weaponIcon.style.boxShadow = `0 0 12px ${w.glow}`;
    e.weaponName.textContent = locName(w);

    e.objLabel.textContent = s.tutorial ? t('hud.tutorial') : t('hud.objective');
    const accent = s.tutorial ? '#ff9a3b' : '#35e0d0';
    e.objLabel.style.color = accent; e.objBox.style.borderLeftColor = accent;
    e.objText.textContent = this._objText();
    e.skipTut.style.display = s.tutorial ? 'inline' : 'none';

    if (s.skillPoints > 0) { e.skillBadge.style.display = 'grid'; e.skillBadge.textContent = s.skillPoints; }
    else e.skillBadge.style.display = 'none';

    const md = computeModifiers(s.ranks);
    this._syncDashPips(Math.max(s.dashMax || 2, md.dashchg), s.dashCharges);

    e.touchBtns.style.display = this.g.isTouch ? 'flex' : 'none';
    document.body.classList.toggle('touch', !!this.g.isTouch);

    // pause button + overlay
    e.btnPause.style.display = (s.started && !s.ended) ? 'block' : 'none';
    e.pauseOverlay.style.display = (s.panel === 'pause') ? 'flex' : 'none';
    e.musicState.textContent = this.g.audio.enabled ? 'ON' : 'OFF';

    if (s.ended) {
      e.endTitle.textContent = s.win ? t('end.win') : t('end.lose');
      e.endTitle.style.color = s.win ? '#59ff9d' : '#ff3b6b';
      e.endTitle.style.textShadow = `0 0 40px ${s.win ? 'rgba(89,255,157,.5)' : 'rgba(255,59,107,.45)'}`;
      e.end.style.background = `radial-gradient(80% 80% at 50% 40%,${s.win ? 'rgba(10,32,22,.92)' : 'rgba(32,10,16,.92)'},rgba(6,9,14,.985))`;
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

  syncPrompt() { /* handled per-frame by setWorldPrompt */ }

  // Position the interaction icon + gauge at a screen point (above the target).
  // The glyph is contextual: hack a data core, collect a salvage crate, enter a
  // portal, extract at the pad.
  setWorldPrompt(visible, sx, sy, key, frac) {
    const e = this.el;
    if (!visible || !key) { if (e.prompt.style.display !== 'none') e.prompt.style.display = 'none'; return; }
    e.prompt.style.display = 'flex';
    e.prompt.style.left = sx + 'px'; e.prompt.style.top = sy + 'px';
    if (e.promptGlyph && this._promptKey !== key) { e.promptGlyph.innerHTML = PROMPT_ICON[key] || PROMPT_ICON['prompt.core']; this._promptKey = key; }
    e.promptKey.style.setProperty('--frac', frac || 0);
  }

  // Boss cast gauge (bottom-center danger meter).
  showCast(name, pct, colorHex) {
    const e = this.el; if (!e.cast) return;
    e.cast.style.display = 'block';
    e.castName.textContent = name;
    e.castBar.style.transform = `scaleX(${Math.max(0, Math.min(1, pct))})`;
    if (colorHex != null) {
      const hex = '#' + colorHex.toString(16).padStart(6, '0');
      e.castBar.style.background = `linear-gradient(90deg,${hex},#fff)`;
      e.castName.style.color = hex;
    }
  }
  hideCast() { if (this.el.cast) this.el.cast.style.display = 'none'; }

  // Kill-streak badge. Escalates color/label by tier; re-pops on each kill.
  showCombo(n) {
    const e = this.el; if (!e.combo) return;
    const tier = n >= 12 ? 4 : n >= 8 ? 3 : n >= 5 ? 2 : 1;
    const col = ['#7ff2e8', '#7ff2e8', '#59ff9d', '#ffd23f', '#ff6b3b'][tier];
    const lbl = ['', 'COMBO', 'COMBO', 'RAMPAGE', 'CARNAGE'][tier];
    e.combo.style.setProperty('--cc', col);
    e.comboN.textContent = '×' + n;
    e.comboLbl.textContent = lbl;
    e.combo.style.display = 'block';
    e.combo.classList.remove('pop'); void e.combo.offsetWidth; e.combo.classList.add('pop');
  }
  hideCombo() { if (this.el.combo) this.el.combo.style.display = 'none'; }

  // ---- fast numeric updates ----
  tick() {
    const s = this.g.state, e = this.el, md = computeModifiers(s.ranks);
    const maxHpShown = s.maxHp + Math.round(md.hp);
    e.level.textContent = s.level;
    e.hpTxt.textContent = Math.ceil(s.hp) + ' / ' + maxHpShown;
    e.hpBar.style.transform = `scaleX(${Math.max(0, s.hp / s.maxHp)})`;
    e.xpBar.style.transform = `scaleX(${Math.max(0, Math.min(1, s.xp / s.xpToNext))})`;
    e.gold.textContent = s.gold; e.kills.textContent = s.kills; e.time.textContent = fmtTime(s.time);
    e.objText.textContent = this._objText();

    this._syncDashPips(Math.max(s.dashMax || 2, md.dashchg), s.dashCharges);

    if (s.bossActive) {
      e.boss.style.display = 'block'; e.bossName.textContent = s.bossName || 'BOSS';
      e.bossHp.textContent = Math.ceil(s.bossHp) + ' / ' + Math.ceil(s.bossMax);
      e.bossBar.style.transform = `scaleX(${Math.max(0, Math.min(1, s.bossHp / (s.bossMax || 1)))})`;
    } else e.boss.style.display = 'none';

    // mobile dash button: cooldown ring + empty state
    if (this.g.isTouch && e.btnDash) {
      e.btnDash.dataset.empty = s.dashCharges <= 0 ? '1' : '0';
      e.btnDash.style.setProperty('--cool', (this.g.game && this.g.game.dashFrac != null) ? this.g.game.dashFrac : 1);
    }

    const showHint = s.started && !s.ended && s.time < 7 && s.panel === 'none';
    if (showHint) { e.hint.style.display = 'block'; e.hint.textContent = this.g.isTouch ? t('hud.hintMobile') : t('hud.hintDesktop'); }
    else e.hint.style.display = 'none';
  }
}

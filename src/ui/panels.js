import { WEAPONS } from '../data/weapons.js';
import { BRANCHES, computeModifiers } from '../data/skills.js';
import { t, locName, locDesc } from '../data/i18n.js';

// Panels — Inventory / Arsenal / Tech Tree overlays. Rendered on demand into
// #panelRoot with markup mirroring the prototype. Hover states are applied via
// mouse listeners so interactive/locked cards read exactly as designed.

export class Panels {
  constructor(game) { this.g = game; this.root = document.getElementById('panelRoot'); this._open = null; }

  sync() {
    const p = this.g.state.panel;
    if (p === this._open && p === 'none') return;
    this._open = p;
    this.root.innerHTML = '';
    if (p === 'inv') this._renderInventory();
    else if (p === 'weapons') this._renderArsenal();
    else if (p === 'skills') this._renderSkills();
  }

  _header(eyebrow, title, rightHTML = '') {
    return `<div class="panel-head">
      <div><div class="panel-eyebrow">${eyebrow}</div><h2 class="panel-title">${title}</h2></div>
      <div style="display:flex;align-items:center;gap:16px">${rightHTML}
        <button class="panel-close" data-close>✕</button>
      </div>
    </div>`;
  }

  _mount(html) {
    const div = document.createElement('div'); div.className = 'panel'; div.innerHTML = html;
    this.root.appendChild(div);
    div.querySelectorAll('[data-close]').forEach((b) => b.onclick = () => this.g.closePanel());
    return div;
  }

  // ---------- Inventory ----------
  _renderInventory() {
    const s = this.g.state, owned = s.owned || {};
    const resources = [
      { k: t('inv.scrap'), v: s.gold, c: '#ffd23f' }, { k: t('inv.points'), v: s.skillPoints, c: '#59ff9d' },
      { k: t('inv.level'), v: s.level, c: '#7ff2e8' }, { k: t('inv.kills'), v: s.kills, c: '#dfeef6' },
    ];
    const resHTML = resources.map((r) => `<div style="display:flex;justify-content:space-between;align-items:baseline">
      <span style="font-size:12px;letter-spacing:2px;color:#8098a8;text-transform:uppercase">${r.k}</span>
      <span style="font-family:'Chakra Petch';font-weight:700;font-size:18px;color:${r.c}">${r.v}</span></div>`).join('');

    const wepHTML = Object.entries(WEAPONS).map(([k, w]) => {
      const own = !!owned[k], eq = k === s.weapon;
      const status = eq ? t('inv.equipped') : (own ? t('inv.owned') : t('inv.locked', { n: w.cost || 0 }));
      const statusColor = eq ? '#59ff9d' : (own ? '#7f94a6' : '#5f7486');
      return `<div style="display:flex;align-items:center;gap:11px;opacity:${own ? 1 : 0.45}">
        <span style="width:34px;height:34px;flex:none;display:grid;place-items:center;border:1.5px solid ${own ? w.color : '#3a4a55'};color:${own ? w.color : '#3a4a55'};font-family:'Chakra Petch';font-weight:700">${w.icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-family:'Chakra Petch';font-weight:600;font-size:14px;color:#eef6fb">${locName(w)}</div>
          <div style="font-size:11px;letter-spacing:2px;color:${statusColor};text-transform:uppercase">${status}</div>
        </div></div>`;
    }).join('');

    const aug = [];
    BRANCHES.forEach((b) => b.nodes.forEach((n) => { const r = (s.ranks || {})[n.id] || 0; if (r > 0) aug.push({ name: locName(n), rank: r, max: n.max, color: b.color }); }));
    const augCount = t('inv.spent', { n: aug.reduce((a, x) => a + x.rank, 0) });
    const augBody = aug.length
      ? `<div style="display:flex;flex-direction:column;gap:8px">${aug.map((a) => `<div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:13px;color:#c5d5e2">${a.name}</span>
          <div style="display:flex;gap:3px">${Array.from({ length: a.max }, (_, k) => `<span style="width:13px;height:5px;background:${k < a.rank ? a.color : '#1c2a38'}"></span>`).join('')}</div></div>`).join('')}</div>`
      : `<div style="font-size:13px;color:#5f7486;line-height:1.5">${t('inv.none')}</div>`;

    const div = this._mount(this._header(t('inv.eyebrow'), t('inv.title')) + `
      <div style="flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;align-content:start">
        <div class="card"><div class="card-title">${t('inv.resources')}</div><div style="display:flex;flex-direction:column;gap:10px">${resHTML}</div></div>
        <div class="card"><div class="card-title">${t('inv.frames')}</div><div style="display:flex;flex-direction:column;gap:9px">${wepHTML}</div></div>
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:baseline;padding-bottom:10px;border-bottom:1px solid #223140;margin-bottom:12px">
            <span style="font-family:'Chakra Petch';font-weight:600;font-size:14px;letter-spacing:2px;color:#dfeef6;text-transform:uppercase">${t('inv.augments')}</span>
            <span style="font-size:11px;letter-spacing:2px;color:#59ff9d;text-transform:uppercase">${augCount}</span>
          </div>${augBody}
        </div>
      </div>
      <div style="margin-top:14px;display:flex;gap:12px;padding-top:14px;border-top:1px solid #223140">
        <button class="hud-btn" data-goto="weapons" style="clip-path:none">${t('inv.openArsenal')}</button>
        <button class="hud-btn" data-goto="skills" style="clip-path:none">${t('inv.openTech')}</button>
      </div>`);
    div.querySelectorAll('[data-goto]').forEach((b) => b.onclick = () => this.g.openPanel(b.dataset.goto));
  }

  // ---------- Arsenal ----------
  _renderArsenal() {
    const s = this.g.state, owned = s.owned || {};
    const cards = Object.entries(WEAPONS).map(([k, w]) => {
      const eq = k === s.weapon, own = !!owned[k], canAfford = s.gold >= (w.cost || 0);
      const border = eq ? w.color : (own ? '#223140' : (canAfford ? '#3a5a3a' : '#3a2530'));
      const bg = eq ? 'rgba(53,224,208,.08)' : (own ? 'rgba(11,18,26,.75)' : 'rgba(20,12,14,.7)');
      const interactive = own || canAfford;
      let tag = '';
      if (eq) tag = `<span style="font-size:11px;letter-spacing:2px;color:#59ff9d;text-transform:uppercase;border:1px solid #2a5a44;padding:3px 8px">${t('ars.equipped')}</span>`;
      else if (!own) { const pc = canAfford ? '#ffd23f' : '#8a5a3a'; tag = `<span style="font-family:'Chakra Petch';font-weight:700;font-size:13px;letter-spacing:1px;color:${pc};border:1px solid ${pc};padding:3px 9px">${(w.cost || 0)} ⬡</span>`; }
      else tag = `<span style="font-size:11px;letter-spacing:2px;color:#7f94a6;text-transform:uppercase;border:1px solid #2a3a4a;padding:3px 8px">${t('ars.owned')}</span>`;
      const bars = [{ k: t('ars.rate'), pct: Math.round(w.bars.rate * 100) }, { k: t('ars.damage'), pct: Math.round(w.bars.dmg * 100) }, { k: t('ars.area'), pct: Math.round(w.bars.area * 100) }];
      const barsHTML = bars.map((b) => `<div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:10px;letter-spacing:2px;color:#5f7486;text-transform:uppercase;width:52px;text-align:right">${b.k}</span>
        <div style="flex:1;height:5px;background:#0e1620;border:1px solid #1c2a38"><div style="height:100%;width:${b.pct}%;background:${w.color}"></div></div></div>`).join('');
      return `<button data-pick="${k}" style="text-align:left;font-family:'Rajdhani';cursor:${interactive ? 'pointer' : 'default'};background:${bg};border:1.5px solid ${border};padding:16px;opacity:${interactive ? 1 : 0.6};transition:border-color .15s" ${interactive ? `data-hover="${w.color}" data-base="${border}"` : ''}>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="width:46px;height:46px;display:grid;place-items:center;border:1.5px solid ${w.color};color:${w.color};font-family:'Chakra Petch';font-weight:700;font-size:20px;box-shadow:0 0 14px ${w.glow}">${w.icon}</div>${tag}
        </div>
        <div style="font-family:'Chakra Petch';font-weight:700;font-size:19px;color:#eef6fb;margin-top:12px;letter-spacing:1px">${locName(w)}</div>
        <div style="font-size:13px;line-height:1.4;color:#9fb1c0;margin-top:4px">${locDesc(w)}</div>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:6px">${barsHTML}</div>
      </button>`;
    }).join('');

    const div = this._mount(this._header(t('ars.eyebrow'), t('ars.title')) + `
      <div style="flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px;align-content:start">${cards}</div>`);
    div.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => this.g.pickWeapon(b.dataset.pick); this._hoverBorder(b); });
  }

  // ---------- Tech Tree ----------
  _renderSkills() {
    const s = this.g.state, md = computeModifiers(s.ranks);
    const cols = BRANCHES.map((b) => {
      const nodes = b.nodes.map((n, i) => {
        const cur = s.ranks[n.id] || 0, maxed = cur >= n.max;
        const prevOk = i === 0 || ((s.ranks[b.nodes[i - 1].id] || 0) > 0);
        const afford = s.skillPoints >= n.cost && !maxed && prevOk;
        const border = maxed ? b.color : (afford ? '#35e0d0' : '#223140');
        const bg = maxed ? 'rgba(53,224,208,.08)' : 'rgba(11,18,26,.75)';
        const rankColor = maxed ? b.color : '#7f94a6';
        const costTxt = maxed ? t('tt.maxed') : (prevOk ? t('tt.pt', { n: n.cost }) : t('tt.locked'));
        const costColor = maxed ? b.color : (afford ? '#59ff9d' : '#5f7486');
        const pips = Array.from({ length: n.max }, (_, k) => `<span style="width:14px;height:5px;background:${k < cur ? b.color : '#1c2a38'}"></span>`).join('');
        return `<button ${afford ? `data-buy="${n.id}"` : ''} style="text-align:left;font-family:'Rajdhani';cursor:${afford ? 'pointer' : 'default'};background:${bg};border:1px solid ${border};padding:11px 13px;opacity:${prevOk ? 1 : 0.5};transition:border-color .15s,background .15s" ${afford ? `data-hover="#7ff2e8" data-base="${border}"` : ''}>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
            <span style="font-family:'Chakra Petch';font-weight:600;font-size:14px;color:#eef6fb;letter-spacing:.5px">${locName(n)}</span>
            <span style="font-family:'Chakra Petch';font-size:12px;color:${rankColor};white-space:nowrap">${cur}/${n.max}</span>
          </div>
          <div style="font-size:12px;line-height:1.35;color:#9fb1c0;margin-top:3px">${locDesc(n)}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:7px">
            <div style="display:flex;gap:3px">${pips}</div>
            <span style="font-size:11px;letter-spacing:1px;color:${costColor};text-transform:uppercase">${costTxt}</span>
          </div></button>`;
      }).join('');
      return `<div style="display:flex;flex-direction:column;gap:10px;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;padding-bottom:8px;border-bottom:1px solid #223140">
          <span style="width:9px;height:9px;background:${b.color};box-shadow:0 0 10px ${b.color};transform:rotate(45deg)"></span>
          <span style="font-family:'Chakra Petch';font-weight:600;font-size:15px;letter-spacing:2px;color:#dfeef6;text-transform:uppercase">${locName(b)}</span>
        </div>${nodes}</div>`;
    }).join('');

    const statLine = [
      { k: t('tt.dmg'), v: '×' + md.dmg.toFixed(2) }, { k: t('tt.rate'), v: '×' + md.rate.toFixed(2) }, { k: t('tt.move'), v: '×' + md.spd.toFixed(2) },
      { k: t('tt.hull'), v: s.maxHp + Math.round(md.hp) }, { k: t('tt.armor'), v: Math.round(md.armor * 100) + '%' }, { k: t('tt.crit'), v: Math.round(md.crit * 100) + '%' },
      { k: t('tt.dashChg'), v: t('tt.chg', { n: md.dashchg }) }, { k: t('tt.xp'), v: '×' + md.xp.toFixed(2) }, { k: t('tt.scrap'), v: '×' + md.gold.toFixed(2) },
    ].map((st) => `<span style="letter-spacing:1px"><span style="color:#5f7486;text-transform:uppercase;font-size:11px;letter-spacing:2px">${st.k}</span> <span style="color:#7ff2e8">${st.v}</span></span>`).join('');

    const right = `<div style="text-align:right"><div style="font-family:'Chakra Petch';font-size:30px;font-weight:700;color:#59ff9d;line-height:1">${s.skillPoints}</div><div style="font-size:11px;letter-spacing:2px;color:#7f94a6;text-transform:uppercase">${t('tt.points')}</div></div>`;
    const div = this._mount(this._header(t('tt.eyebrow'), t('tt.title'), right) + `
      <div style="flex:1;overflow:auto;display:grid;grid-template-columns:repeat(4,1fr);gap:clamp(10px,1.6vw,22px);align-content:start">${cols}</div>
      <div style="margin-top:14px;display:flex;gap:clamp(10px,2vw,26px);flex-wrap:wrap;padding-top:14px;border-top:1px solid #223140;font-family:'Chakra Petch';font-size:13px;color:#9fb1c0">${statLine}</div>`);
    div.querySelectorAll('[data-buy]').forEach((b) => { b.onclick = () => this.g.buySkill(b.dataset.buy); this._hoverBorder(b); });
  }

  _hoverBorder(el) {
    const hov = el.dataset.hover, base = el.dataset.base; if (!hov) return;
    el.onmouseenter = () => { el.style.borderColor = hov; };
    el.onmouseleave = () => { el.style.borderColor = base; };
  }
}

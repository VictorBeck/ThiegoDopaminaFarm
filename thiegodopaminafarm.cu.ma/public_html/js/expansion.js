/* ============================================================
   THIEGO DOPAMINA FARM — expansion.js
   Expansão definitiva (backend em api/*.php): conta própria com
   login, coleção de Thiegos, batalhas PvE/boss/desafio, PvP
   ranqueado, loot com pity, inventário/equipamentos e árvore
   genealógica. Todas as ações são validadas no servidor.
   ============================================================ */
(function () {
  'use strict';
  const Net = window.TDFNet;
  const N = window.Num;
  const T = window.TDF;
  const UI = () => window.UI;

  const EX_TABS = ['thiegos', 'battle', 'pvp', 'loot', 'inventory', 'genealogy', 'social'];

  const E = window.Expansion = {
    booted: false,
    netReady: false,   // sessão restaurada
    state: null,       // {user, progress, missions, achievements}
    cache: {},         // dados por aba
    syncTimer: 0,
    pollTimer: 0,
    lastSync: 0,
    lastPoll: 0,
    seenNotify: {},
    claimFlash: false,
  };

  const TYPES = {
    NORMAL: 'NORMAL', FOGO: 'FOGO', AGUA: 'ÁGUA', PLANTA: 'PLANTA',
    ELETRICO: 'ELÉTRICO', GELO: 'GELO', LUTADOR: 'LUTADOR', VENENO: 'VENENO',
    TERRA: 'TERRA', VOADOR: 'VOADOR', PSIQUICO: 'PSÍQUICO', INSETO: 'INSETO',
    PEDRA: 'PEDRA', FANTASMA: 'FANTASMA', DRAGAO: 'DRAGÃO', TREVAS: 'TREVAS',
    METALICO: 'METÁLICO', FADA: 'FADA', CELESTIAL: 'CELESTIAL', ABSOLUTO: 'ABSOLUTO',
  };
  // tipos reais dos Thiegos (tabela thiegos.type) com cor + ícone
  const BATTLE_TYPES = {
    caotico: { label: 'CAÓTICO', icon: '🌪️', color: '#ff5e6c' },
    celestial: { label: 'CELESTIAL', icon: '🌟', color: '#5ef5ff' },
    cosmico: { label: 'CÓSMICO', icon: '🌌', color: '#c86bff' },
    divino: { label: 'DIVINO', icon: '✨', color: '#ffd700' },
    dopamina: { label: 'DOPAMINA', icon: '💊', color: '#5effb1' },
    infinito: { label: 'INFINITO', icon: '♾️', color: '#ff5ec4' },
    mistico: { label: 'MÍSTICO', icon: '🔮', color: '#5ea8ff' },
    tecnologico: { label: 'TECNOLÓGICO', icon: '🤖', color: '#ffa15e' },
  };
  const TYPE_COLORS = {
    caotico: '#ff5e6c', celestial: '#5ef5ff', cosmico: '#c86bff', divino: '#ffd700',
    dopamina: '#5effb1', infinito: '#ff5ec4', mistico: '#5ea8ff', tecnologico: '#ffa15e',
  };
  function typeBadge(type) {
    const t = BATTLE_TYPES[type] || { label: (type || '?').toUpperCase(), icon: '❓', color: '#aaa' };
    return '<span class="exp-type-badge" style="border-color:' + t.color + ';color:' + t.color + '">' + t.icon + ' ' + t.label + '</span>';
  }
  const ROLES = { tank: 'TANQUE', dps: 'DPS', healer: 'SUPORTE', support: 'SUPORTE', assassin: 'ASSASSINO' };
  const CATS = { weapon: 'ARMA', armor: 'ARMADURA', accessory: 'ACESSÓRIO', consumable: 'CONSUMÍVEL', fragment: 'FRAGMENTO', material: 'MATERIAL' };
  const SLOTS = { weapon: 'ARMA', armor: 'ARMADURA', accessory: 'ACESSÓRIO' };
  const STAT_LABEL = { hp: 'HP', atk: 'ATQ', def: 'DEF', spd: 'VEL', crit: 'CRIT', acc: 'ACUR', eva: 'ESQ', crit_dmg: 'CRIT-DMG' };
  const EFFECT_LABEL = {
    heal: 'cura', damage: 'dano', true: 'dano verdadeiro', aoe: 'dano em área', drain: 'drenar vida',
    buff_atk: '+ATQ', buff_def: '+DEF', buff_spd: '+VEL', crit_up: '+CRIT',
    debuff_atk: '-ATQ do inimigo', debuff_def: '-DEF do inimigo', debuff_spd: '-VEL do inimigo', shield: 'escudo',
    stun: 'atordoar', dot: 'dano contínuo', cleanse: 'limpar debuffs', execute: 'execução', taunt: 'provocar',
    berserk: 'berserk', revive: 'reviver', ult_charge: 'carga de ULT',
  };
  const MODE_LABEL = { pve: 'PVE', boss: 'BOSS', challenge: 'DESAFIO', survival: 'SURVIVAL', daily: 'BOSS DO DIA' };
  const MODE_GATE = { pve: 1, boss: 3, challenge: 7, survival: 5, daily: 3 };
  const MODE_COST = { pve: 1, boss: 2, challenge: 2, survival: 2, daily: 0 };
  const RARITY_COLOR = {
    comum: '#5effb1', incomum: '#5ea8ff', raro: '#c86bff', epico: '#ffa15e',
    lendario: '#ff5e6c', mitico: '#ff5ec4', divino: '#ffd700', celestial: '#5ef5ff',
    transcendente: '#f2ecff', infinito: 'linear-gradient(90deg,#ff5e6c,#ffd700,#5effb1,#5ea8ff,#c86bff)',
  };
  const RARITY_BG = {
    comum: 'rgba(94,255,177,.12)', incomum: 'rgba(94,168,255,.12)', raro: 'rgba(200,107,255,.12)',
    epico: 'rgba(255,161,94,.12)', lendario: 'rgba(255,94,108,.14)', mitico: 'rgba(255,94,196,.14)',
    divino: 'rgba(255,215,0,.14)', celestial: 'rgba(94,245,255,.14)', transcendente: 'rgba(242,236,255,.12)',
    infinito: 'rgba(255,255,255,.08)',
  };
  const RARITY_ORDER = ['comum', 'incomum', 'raro', 'epico', 'lendario', 'mitico', 'divino', 'celestial', 'transcendente', 'infinito'];

  /* ============================================================
     HELPERS
     ============================================================ */
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(t) {
    const d = document.createElement('div');
    d.textContent = t == null ? '' : String(t);
    return d.innerHTML;
  }
  function tasset(name) {
    try { return T.asset(name); } catch (e) { return 'assets/' + encodeURI(name); }
  }
  function imgEl(src, cls) {
    const im = el('img', cls || '');
    im.loading = 'lazy';
    im.draggable = false;
    im.alt = '';
    im.src = tasset(src || 'thiego normal 2.jpeg');
    im.addEventListener('error', () => { im.src = tasset('thiego normal 2.jpeg'); }, { once: true });
    return im;
  }
  function isEmoji(s) {
    return /[^\x00-\x7F]/.test(s || '');
  }
  function iconEl(icon, cls, fallbackEmoji) {
    const raw = icon || '';
    if (!raw || raw === '?' || raw === '??' || isEmoji(raw)) {
      const d = el('div', (cls || '') + ' exp-emoji');
      d.textContent = isEmoji(raw) ? raw : (fallbackEmoji || '🎁');
      return d;
    }
    return imgEl(raw, cls);
  }
  function toast(msg, kind, dur) {
    const u = UI();
    if (u && u.toast) u.toast(msg, kind || 'info', dur || 3500);
  }
  function rarityColor(r) { return RARITY_COLOR[r] || '#9b8ab8'; }
  function rarityBadge(r, label) {
    const b = el('span', 'exp-badge');
    b.style.color = rarityColor(r);
    b.style.borderColor = rarityColor(r);
    b.style.background = RARITY_BG[r] || 'rgba(155,138,184,.12)';
    if (r === 'infinito') b.classList.add('r-rainbow');
    b.textContent = (label || (r || '')).toUpperCase();
    return b;
  }
  function statRow(stat) {
    const row = el('div', 'exp-stats-row');
    let parts = [];
    for (const k in stat) {
      if (k === 'crit' || k === 'eva') parts.push('<b>' + (STAT_LABEL[k] || k) + '</b> ' + Math.round((stat[k] || 0) * 100) + '%');
      else if (k === 'acc') parts.push('<b>' + (STAT_LABEL[k] || k) + '</b> ' + Math.round((stat[k] || 0) * 100) + '%');
      else if (k === 'crit_dmg') parts.push('<b>' + (STAT_LABEL[k] || k) + '</b> ×' + (stat[k] || 0).toFixed(1));
      else parts.push('<b>' + (STAT_LABEL[k] || k) + '</b> ' + Math.round(stat[k] || 0));
    }
    if (!parts.length) parts.push('<b>—</b>');
    row.innerHTML = parts.join('<span class="sep">·</span>');
    return row;
  }
  function effectRow(eff) {
    if (!eff || !eff.length) return null;
    const row = el('div', 'exp-effects');
    const parts = eff.map((f) => {
      const nm = EFFECT_LABEL[f.effect] || f.effect || 'efeito';
      const v = f.value != null ? ' ' + Math.round(f.value * 100) + '%' : '';
      return '<span>' + nm + v + '</span>';
    });
    row.innerHTML = 'Efeitos: ' + parts.join(' ');
    return row;
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + s + 's';
    return s + 's';
  }
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(String(iso).replace(' ', 'T'));
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function money(v) { return Number(v || 0).toLocaleString('pt-BR'); }
  function apiErr(e) {
    const msg = (e && e.message) || 'erro de conexão';
    if (/não autenticado|sess[ãa]o|401/i.test(msg)) {
      Net.logged = false; Net.user = null; Net.progress = null;
      E.netReady = false;
      toast('Sessão expirada — faça login.', 'warn', 4500);
    } else {
      toast(msg, 'error', 4500);
    }
  }
  function setBusy(btn, busy, txt) {
    if (!btn) return;
    if (busy) {
      btn.dataset.orig = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '...';
    } else {
      btn.disabled = false;
      if (btn.dataset.orig) btn.innerHTML = btn.dataset.orig;
      if (txt) btn.innerHTML = txt;
    }
  }
  function progress() {
    return (E.state && E.state.progress) || Net.progress || null;
  }

  /* ============================================================
     SESSÃO / LOGIN
     ============================================================ */
  // Abre o login a partir de qualquer lugar (HUD/ranking): muda para uma aba
  // de expansão, que renderiza o formulário quando não há sessão.
  E.showLogin = function () {
    const u = UI();
    if (u && u.switchTab) {
      u.switchTab('thiegos');
      return;
    }
    const host = document.getElementById('exp-tab-thiegos');
    if (host) authView(host);
  };

  E.restore = function () {
    return Net.restore().then((d) => {
      E.netReady = Net.logged;
      E.syncRefs();
      E.hydrateHud(); // (P1) roda TAMBÉM deslogado — o chip precisa virar LOGIN
      if (d) {
        E.state = d;
        if (window.Econ && d.progress && typeof d.progress.genealogy_farm_pct === 'number') {
          window.Econ.farmMult = Math.max(1, d.progress.genealogy_farm_pct);
        }
        // admin UI: botão e possível aba administrador
        if (window.UI && window.UI.refreshAdminUI) window.UI.refreshAdminUI();
        // se admin está em modo admin, usa o save SEPARADO de admin
        E.applyAdminSaveMode();
        E.syncRefs();
        E.hydrateHud();
        E.pollState(true);
        E.afterSession(true);
      }
      E.booted = true;
      return d;
    });
  };

  // Troca o save local conforme admin_mode do usuário logado. Modo admin usa
  // chave própria (v4_admin) — progresso de admin nunca mistura com o normal.
  E.applyAdminSaveMode = function () {
    const Save = window.Save;
    const Game = window.Game;
    if (!Save || !Game) return;
    const on = !!(Net.user && Net.user.admin_mode === 1);
    const isAdminSave = Save.activeKey().indexOf('admin') !== -1;
    if (on && !isAdminSave) {
      if (Game.state) Save.save(Game.state);
      Save.setAdminSave(true);
      const st = Game.load();
      if (st && !st._tooNew) Game.state = st;
      if (Game.save) Game.save();
    } else if (!on && isAdminSave) {
      if (Game.state) Save.save(Game.state);
      Save.setAdminSave(false);
      const st = Game.load();
      if (st && !st._tooNew) Game.state = st;
      if (Game.save) Game.save();
    }
  };

  E.afterSession = function (fresh) {
    if (!E.netReady) return;
    E.sync(true).catch(() => {});
    const u = UI();
    const cur = u && u.getTab ? u.getTab() : '';
    const t = document.getElementById('tab-' + cur);
    if (t) E.renderTab(cur);
    void fresh;
  };

  function authView(host) {
    host.innerHTML = '';
    const card = el('div', 'exp-auth');
    const net = el('div', 'exp-auth-net');
    net.innerHTML =
      '<div class="exp-auth-title">EXPANSÃO DEFINITIVA</div>' +
      '<div class="exp-auth-sub">Coleção, batalhas, PvP, loot e genealogia sincronizados no servidor.</div>' +
      '<div class="exp-auth-tabs"><button class="exp-auth-btn active" data-mode="login">ENTRAR</button>' +
      '<button class="exp-auth-btn" data-mode="register">CRIAR CONTA</button></div>';
    const form = el('form', 'exp-auth-form');
    const fields = el('div', 'exp-auth-fields');
    fields.id = 'exp-auth-fields';
    net.appendChild(form);
    card.appendChild(net);
    card.appendChild(form);
    host.appendChild(card);

    const switchMode = (mode) => {
      net.querySelectorAll('.exp-auth-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
      if (mode === 'login') {
        fields.innerHTML =
          '<input class="imp-box" name="identifier" placeholder="Usuário ou e-mail" required>' +
          '<input class="imp-box" name="password" type="password" placeholder="Senha" required>' +
          '<button class="btn primary" type="submit">ENTRAR</button>';
      } else {
        fields.innerHTML =
          '<input class="imp-box" name="username" placeholder="Usuário (3-20 letras/números)" required>' +
          '<input class="imp-box" name="email" type="email" placeholder="E-mail" required>' +
          '<input class="imp-box" name="password" type="password" placeholder="Senha (mín 6)" required>' +
          '<button class="btn primary" type="submit">CRIAR CONTA</button>';
      }
    };
    net.querySelectorAll('.exp-auth-btn').forEach((b) => b.addEventListener('click', () => switchMode(b.dataset.mode)));
    form.appendChild(fields);
    switchMode('login');

    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const fd = new FormData(form);
      const btn = form.querySelector('button[type=submit]');
      setBusy(btn, true, '...');
      const call = fd.get('username') !== null
        ? Net.register(fd.get('username'), fd.get('email'), fd.get('password'))
        : Net.login(fd.get('identifier'), fd.get('password'));
      call
        .then(() => {
          E.netReady = true;
          return Net.restore();
        })
        .then((d) => {
          E.state = d;
          E.hydrateHud();
          if (window.UI && window.UI.refreshAdminUI) window.UI.refreshAdminUI();
          toast('Bem-vindo, ' + (d.user.username || '') + '!', 'gold', 4000);
          E.pollState(true);
          // ANTES do sync: resolve troca de conta (nunca misturar saves).
          // 1) refresh do ranking (seta LB.online/logged + me com o save)
          // 2) restore do save da conta (ou zera se conta nova)
          // 3) só então afterSession, que faz o sync com o save CORRETO
          const ready = window.Leaderboard
            ? window.Leaderboard.refresh().catch(() => {})
            : Promise.resolve();
          ready
            .then(() => {
              E.applyAdminSaveMode();
              if (window.UI && window.UI.refreshAdminUI) window.UI.refreshAdminUI();
              return window.RestoreServerSave ? window.RestoreServerSave() : null;
            })
            .then(() => {
              E.afterSession(true);
              // push: assina notificações após login (gesto do usuário)
              if (window.PWA && window.PWA.subscribeAfterLogin) {
                try { window.PWA.subscribeAfterLogin(); } catch (e) {}
              }
            });
        })
        .catch((e) => {
          setBusy(btn, false);
          apiErr(e);
        });
    });
  }

  /* ============================================================
     HUD
     ============================================================ */
  let hudRoot = null;
  let hudEls = {};

  E.buildHud = function () {
    const nav = document.querySelector('.tdf-tabs');
    if (!nav || hudRoot) return;
    hudRoot = el('div', 'exp-hud');
    hudRoot.id = 'exp-hud';
    hudRoot.innerHTML =
      '<div class="exp-chip exp-chip-lvl"><span class="exp-chip-lbl">NÍVEL</span><b id="exp-hud-lvl">1</b>' +
      '  <div class="exp-xpbar"><i id="exp-hud-xp" style="width:0%"></i></div>' +
      '  <span class="exp-chip-sub" id="exp-hud-xp-txt"></span></div>' +
      '<div class="exp-chip"><span class="exp-chip-lbl">COINS</span><b id="exp-hud-coins">0</b></div>' +
      '<div class="exp-chip"><span class="exp-chip-lbl">⚡ ENERGIA</span><b id="exp-hud-energy">0/10</b>' +
      '  <span class="exp-chip-sub" id="exp-hud-energy-in"></span></div>' +
      '<button class="exp-chip exp-chip-claim" id="exp-hud-claim" title="Reclamar bônus de dopamina">' +
      '  <span class="exp-chip-lbl">BÔNUS</span><b id="exp-hud-bonus">0</b></button>' +
      '<div class="exp-chip"><span class="exp-chip-lbl">NG</span><b id="exp-hud-ng">0</b></div>' +
      '<div class="exp-chip exp-chip-rating"><span class="exp-chip-lbl">RATING</span><b id="exp-hud-rating">—</b></div>' +
      '<div class="exp-chip exp-chip-user" id="exp-hud-user" title="Sair da conta">LOGIN</div>' +
      '<div class="exp-hud-dot" id="exp-hud-dot" title="offline"></div>';
    nav.insertAdjacentElement('afterend', hudRoot);

    const claimBtn = document.getElementById('exp-hud-claim');
    claimBtn.addEventListener('click', () => E.claim());
    const userChip = document.getElementById('exp-hud-user');
    userChip.addEventListener('click', () => {
      if (!Net.logged) {
        E.showLogin();
        return;
      }
      Net.logout().catch(() => {}).finally(() => {
        Net.logged = false; Net.user = null; Net.progress = null;
        if (window.Econ) window.Econ.farmMult = 1;
        E.netReady = false; E.state = null; E.cache = {};
        if (window.UI && window.UI.refreshAdminUI) window.UI.refreshAdminUI();
        E.hydrateHud();
        toast('Você saiu da conta.', 'info');
        const u = UI();
        const cur = u && u.getTab ? u.getTab() : '';
        const t = document.getElementById('tab-' + cur);
        if (t) E.renderTab(cur);
        if (window.Leaderboard) window.Leaderboard.refresh().catch(() => {});
      });
    });
  };

  E.hydrateHud = function () {
    E.buildHud();
    if (!hudRoot) return;
    const p = progress();
    const dot = document.getElementById('exp-hud-dot');
    if (dot) {
      dot.classList.toggle('on', !!Net.logged);
      dot.title = Net.logged ? 'online' : 'offline';
    }
    const user = document.getElementById('exp-hud-user');
    // (P1) ternário quebrado: sem login caía no fallback 'ok' (texto de
    // debug que parecia um botão "I" no chip estreito). Estados corretos:
    // deslogado → LOGIN · logado com nome → nome · logado sem nome → '…'
    if (user) user.textContent = !Net.logged ? 'LOGIN' : (Net.user && Net.user.username ? Net.user.username : '…');
    if (!Net.logged || !p) return;
    const set = (id, v) => {
      const x = document.getElementById(id);
      if (x) x.textContent = v;
    };
    set('exp-hud-lvl', p.level);
    set('exp-hud-coins', money(p.battle_coins));
    set('exp-hud-energy', p.energy + '/' + p.energy_max);
    set('exp-hud-bonus', (p.dopamine_bonus_log10 > 0 ? '+' : '') + E.claimLabel(p.dopamine_bonus_log10));
    set('exp-hud-ng', p.ng_cycle);
    const xp = document.getElementById('exp-hud-xp');
    if (xp) xp.style.width = Math.min(100, (p.xp / Math.max(1, p.xp_for_next)) * 100) + '%';
    const xpTxt = document.getElementById('exp-hud-xp-txt');
    if (xpTxt) {
      const left = Math.max(0, p.xp_for_next - p.xp);
      xpTxt.textContent = 'XP ' + p.xp + '/' + p.xp_for_next + ' · falta ' + left + ' pro nível ' + (p.level + 1);
    }
    const claim = document.getElementById('exp-hud-claim');
    const hasBonus = (p.dopamine_bonus_log10 || 0) > 0;
    E.claimFlash = hasBonus;
    claim.classList.toggle('has', hasBonus);
  };

  E.claimLabel = function (log10) {
    if (!log10 || log10 <= 0) return '0';
    if (log10 < 5) return String(Math.round(Math.pow(10, log10)).toLocaleString('pt-BR'));
    return '1e+' + Math.round(log10);
  };

  E.tick = function (dt) {
    if (!E.booted || !Net.logged) return;
    const p = progress();
    if (!p) return;
    E.syncTimer += dt;
    E.pollTimer += dt;
    if (E.syncTimer >= 60) {
      E.syncTimer = 0;
      E.sync(false).catch(() => {});
    }
    if (E.pollTimer >= 120) {
      E.pollTimer = 0;
      E.pollState(false).catch(() => {});
    }
    if (p.energy < p.energy_max) {
      const sub = document.getElementById('exp-hud-energy-in');
      if (sub) {
        const left = p.energy_next_in > 0 ? p.energy_next_in : 0;
        if (left > 0) {
          p.energy_next_in = Math.max(0, left - dt);
          sub.textContent = fmtTime(left);
        } else {
          p.energy_next_in = 0;
          p.energy = p.energy_max;
          sub.textContent = '';
          E.hydrateHud();
        }
      }
    }
  };

  /* ---------- ações ---------- */
  E.claim = function () {
    if (!Net.logged) return toast('Faça login para reclamar bônus.', 'warn');
    const p = progress();
    if (!p || !(p.dopamine_bonus_log10 > 0)) return;
    Net.claim()
      .then((d) => {
        E.hydrateHud();
        const dopStr = E.claimLabel(d.claimed_log10);
        const lvl = d.leveled > 0 ? ' — SUBIU PARA O NÍVEL ' + d.level + '!' : '';
        toast('Bônus reclamado: +' + dopStr + ' dopamina, +' + d.xp_gained + ' XP' + lvl, 'gold', 5000);
        if (d.achievements && d.achievements.length && UI() && UI().achievementToasts) {
          UI().achievementToasts(d.achievements.map((a) => ({ name: a.name, img: null })));
        }
        E.pollState(true).catch(() => {});
      })
      .catch((e) => {
        if (/nenhum b[ôo]nus/i.test(e.message)) {
          E.hydrateHud();
        } else {
          apiErr(e);
        }
      });
  };

  E.renderProfileInto = function (host) {
    if (!Net.logged) {
      host.appendChild(el('div', 'exp-panel',
        '<div class="exp-panel-title">PERFIL DA EXPANSÃO</div>' +
        '<div class="exp-empty">Faça login para ver coleção, batalha e ranking da expansão.</div>'));
      return;
    }
    const panel = el('div', 'exp-panel');
    panel.appendChild(el('div', 'exp-panel-title', 'PERFIL DA EXPANSÃO — ' + esc((Net.user && Net.user.username) || '')));
    const grid = el('div', 'exp-prof-grid');
    panel.appendChild(grid);
    host.appendChild(panel);

    const set = (label, value, hl) => {
      const d = el('div', 'exp-prof-stat');
      d.innerHTML = '<span>' + esc(label) + '</span><b' + (hl ? ' class="hl"' : '') + '>' + value + '</b>';
      grid.appendChild(d);
    };

    const p = progress() || {};
    const lvl = p.level || 1;
    set('NÍVEL DA CONTA', lvl, true);
    const need = Math.floor(40 * Math.pow(lvl, 1.12));
    const xpPct = Math.max(0, Math.min(100, ((p.xp || 0) / Math.max(1, need)) * 100));
    const xpBar = el('div', 'exp-prof-stat exp-prof-xp');
    xpBar.innerHTML =
      '<span>XP ATUAL</span><div class="exp-mission-bar"><i style="width:' + xpPct + '%"></i></div>' +
      '<div class="exp-prof-sub">' + Math.round(p.xp || 0).toLocaleString('pt-BR') + ' / ' + need.toLocaleString('pt-BR') + '</div>';
    grid.appendChild(xpBar);
    set('PRESTIGE', p.prestige || 0);
    set('DOPAMINA TOTAL', E.claimLabel(p.total_dopamine_log10 || 0));
    set('NG+ CYCLE', p.ng_cycle || 0);
    set('BATTLE COINS', (p.battle_coins || 0).toLocaleString('pt-BR'));
    set('PONTOS DE GENEALOGIA', p.genealogy_points || 0);

    Promise.all([
      Net.catalog().catch(() => null),
      Net.inventory().catch(() => null),
      Net.pvpStatus().catch(() => null),
      Net.leaderboard('dopamine').catch(() => null),
      Net.leaderboard('battle').catch(() => null),
      Net.genealogyTree().catch(() => null),
    ]).then(([cat, inv, pvp, lbD, lbB, gene]) => {
      const all = (cat && cat.thiegos) ? cat.thiegos : [];
      const owned = all.filter((t) => t.owned && !t.is_boss);
      const power = owned.reduce((acc, t) => {
        const s = t.stats || {};
        return acc + Math.round((s.atk || 0) * 2 + (s.def || 0) * 1.5 + (s.hp || 0) * 0.25 + (s.spd || 0) * 3);
      }, 0);
      set('PODER DE BATALHA', power ? power.toLocaleString('pt-BR') : '—', power > 0);
      set('THIEGOS', owned.length + ' / ' + all.length);
      const invItems = (inv && inv.items) ? inv.items : [];
      set('ITENS NO INVENTÁRIO', invItems.reduce((a, x) => a + (x.qty || 0), 0));
      if (pvp && pvp.unlocked) {
        const total = (pvp.wins || 0) + (pvp.losses || 0);
        set('VITÓRIAS / DERROTAS', (pvp.wins || 0) + 'V-' + (pvp.losses || 0) + 'D');
        set('TAXA DE VITÓRIA', total > 0 ? Math.round((100 * (pvp.wins || 0)) / total) + '%' : '—');
        set('RATING PvP', (pvp.rating || 0) + ' <small>pts</small> (#' + (pvp.rank || 0) + ')', true);
      } else {
        set('PvP', '🔒 Nível 5');
      }
      set('RANKING DOPAMINA', lbD && lbD.me ? '#' + lbD.me.rank : '—');
      set('RANKING BATALHA', lbB && lbB.me ? '#' + lbB.me.rank : '—');
      const nodes = (gene && gene.tree) ? gene.tree.filter((n) => n.level > 0).length : 0;
      set('GENEALOGIA', nodes + ' nós');
    });
  };

  E.pollState = function (force) {
    if (!Net.logged) return Promise.resolve(null);
    if (!force && Date.now() - E.lastPoll < 90000) return Promise.resolve(null);
    E.lastPoll = Date.now();
    return Net.state()
      .then((d) => {
        if (d.ok === false) throw new Error(d.error || 'api');
        E.state = d;
        if (Net.user && d.user) Net.user = d.user;
        Net.progress = d.progress;
        if (window.Econ && d.progress && typeof d.progress.genealogy_farm_pct === 'number') {
          window.Econ.farmMult = Math.max(1, d.progress.genealogy_farm_pct);
        }
        if (window.UI && window.UI.refreshAdminUI) window.UI.refreshAdminUI();
        E.syncRefs();
        E.hydrateHud();
        E.notifyNew(d.notifications || []);
        return d;
      })
      .catch((e) => { if (E.netReady) apiErr(e); return null; });
  };

  E.notifyNew = function (list) {
    if (!Array.isArray(list)) return;
    const freshIds = [];
    for (const n of list) {
      if (!n.is_read && !E.seenNotify[n.id]) {
        E.seenNotify[n.id] = 1;
        toast('🔔 ' + n.title + (n.body ? ' — ' + n.body : ''), 'info', 6000);
        freshIds.push(n.id);
      }
      if (freshIds.length >= 3) break;
    }
    if (freshIds.length) Net.notifyRead(freshIds).catch(() => {});
  };

  /* playtime: o save local não é global (outros navegadores/jogos contam
     no servidor). Mantemos uma base do servidor + delta local desde o login,
     garantindo que o valor só cresça (monotônico). */
  E.syncRefs = function () {
    const p = progress();
    const s = window.Game && window.Game.state;
    if (!p || !s) return;
    if (E.playBase === undefined || (p.playtime_sec || 0) >= E.playBase) {
      E.playBase = (p.playtime_sec || 0);
    }
    E.localPlayRef = s.playTime || 0;
  };

  E.sync = function (force) {
    if (!Net.logged) return Promise.resolve(null);
    // modo admin: não sincroniza nada com o servidor (save de admin é local
    // e não deve tocar nos dados do modo normal / ranking)
    if (Net.user && Net.user.admin_mode === 1) return Promise.resolve(null);
    if (!force && Date.now() - E.lastSync < 55000) return Promise.resolve(null);
    E.lastSync = Date.now();
    const s = window.Game && window.Game.state;
    if (!s) return Promise.resolve(null);
    const p = E.state && E.state.progress;
    const localLog = N.log10(s.totalEarned);
    const dop = Math.max(localLog, (p && p.total_dopamine_log10) || 0) + 1e-9;
    const prest = Math.max(s.prestige || 0, (p && p.prestige) || 0);
    const tier = Math.max(s.tier || 0, (p && p.evolution_tier) || 0);
    const play = Math.max(0, E.playBase + ((s.playTime || 0) - (E.localPlayRef || 0)));
    const payload = {
      dopamine_log10: dop,
      prestige: prest,
      evolution_tier: tier,
      playtime_sec: Math.floor(play),
    };
    // Backup completo do save (mesmo formato do leaderboard/beacon): garante
    // que o progresso real vá ao banco mesmo sem o beacon de unload.
    // NUNCA envia o save local quando ele pertence a outra conta (troca de
    // login no mesmo navegador) nem quando o admin está em modo admin (o save
    // de admin é separado e não deve poluir o save normal do ranking).
    try {
      const adminHidden = !!(Net.user && Net.user.admin_mode === 1);
      const ownerChanged = window.Leaderboard && window.Leaderboard.ownerChanged
        ? window.Leaderboard.ownerChanged()
        : false;
      if (!ownerChanged && !adminHidden) {
        const exp = window.Save && window.Save.export(s);
        if (exp && exp.length > 0 && exp.length <= 200000) {
          payload.save = exp;
          // revisão que este cliente carregou: permite ao servidor detectar
          // overwrite cego entre dispositivos/abas (mesmo circuito do
          // ranking submitSave)
          const lb = window.Leaderboard;
          if (lb && typeof lb.saveRevision === 'number' && lb.saveRevision > 0) {
            payload.base_revision = lb.saveRevision;
          }
        }
      }
    } catch (e) {}
    return Net.sync(payload)
      .then((d) => {
        if (d.ok === false) throw new Error(d.error || 'api');
        E.playBase = Math.floor(play);
        E.localPlayRef = s.playTime || 0;
        // mantém a revisão do save sempre atualizada: o servidor bumppa a
        // cada save gravado; sem isso o próximo submitSave (ranking) ia
        // colher conflito espúrio com base_revision velha
        const lb = window.Leaderboard;
        if (d.save_revision > 0 && lb && lb.setSaveRevision) {
          lb.setSaveRevision(d.save_revision);
        }
        // conflito: o servidor tem save mais novo (base_revision velha).
        // Adota a revisão atual do servidor para o próximo save não ficar
        // em loop de conflito; o conteúdo do servidor é adotado pelo
        // circuito de restauração (restoreSave/submitSave conflict).
        if (d.save_conflict && d.save_conflict_revision > 0 && lb && lb.setSaveRevision) {
          lb.setSaveRevision(d.save_conflict_revision);
          if (window.UI && window.UI.toast) {
            window.UI.toast('Outro dispositivo salvou um save mais recente.', 'warn', 4000);
          }
        }
        if (d.leveled > 0) toast('NÍVEL ' + d.level + ' no servidor!', 'gold', 5000);
        if (d.achievements && d.achievements.length && UI() && UI().achievementToasts) {
          UI().achievementToasts(d.achievements.map((a) => ({ name: a.name, img: null })));
        }
        E.pollState(true).catch(() => {});
        return d;
      })
      .catch((e) => {
        // servidor tem valor acima do local (bônus/conquistas/outros saves):
        // reconstrói a base pelo servidor e reintenta — evita loop de 422.
        if (e && /n[aã]o pode diminuir|diminuir/i.test(e.message)) {
          return E.pollState(true).then(() => {
            const np = E.state && E.state.progress;
            if (np) E.playBase = (np.playtime_sec || 0);
            E.localPlayRef = s.playTime || 0;
            return Net.sync({ playtime_sec: Math.floor(E.playBase + 1) })
              .then((d) => { E.pollState(true).catch(() => {}); return d; })
              .catch((e2) => apiErr(e2));
          });
        }
        return apiErr(e);
      });
  };

  /* ============================================================
     RENDER — integração com ui.js
     ============================================================ */
  E.buildTab = function (id, host) {
    host.innerHTML = '';
    const box = el('div', 'exp-tab');
    box.id = 'exp-tab-' + id;
    box.innerHTML = '<div class="notice">carregando…</div>';
    host.appendChild(box);
  };

  E.renderTab = function (id) {
    const host = document.getElementById('exp-tab-' + id);
    if (!host) return;
    if (!Net.logged) {
      authView(host);
      return;
    }
    const p = progress();
    if (!p) {
      host.innerHTML = '<div class="notice">carregando…</div>';
      return;
    }
    switch (id) {
      case 'thiegos': renderThiegos(host); break;
      case 'battle': renderBattle(host); break;
      case 'pvp': renderPvp(host); break;
      case 'loot': renderLoot(host); break;
      case 'inventory': renderInventory(host); break;
      case 'genealogy': renderGenealogy(host); break;
      case 'social': renderSocial(host); break;
    }
  };

  E.isExpTab = function (id) { return EX_TABS.indexOf(id) >= 0; };
  E.invalidate = function () { E.cache = {}; };

  function cached(key, ttlMs, loader) {
    const c = E.cache[key];
    if (c && (c.at > Date.now() - (ttlMs || 30000)) && !c.dirty) return Promise.resolve(c.data);
    return loader().then((d) => {
      E.cache[key] = { data: d, at: Date.now(), dirty: false };
      return d;
    });
  }
  E.forceReload = function (key) {
    const c = E.cache[key];
    if (c) c.dirty = true;
  };

  function banner(host, cls, html) {
    const b = el('div', 'exp-banner ' + cls, html);
    host.insertBefore(b, host.firstChild);
    return b;
  }

  /* ============================================================
     THIEGOS
     ============================================================ */
  let thiegoFilter = 'all';

  function renderThiegos(host) {
    host.innerHTML = '';
    host.appendChild(el('div', 'exp-head', 'COLETA — <span class="hl">THIEGOS</span>' +
      '<span class="exp-head-sub">desbloqueie, suba de nível e equipe sua coleção</span>'));

    const bar = el('div', 'exp-toolbar');
    bar.innerHTML = '<div class="exp-filters">' +
      '<button class="exp-fbtn active" data-f="all">TODOS</button>' +
      '<button class="exp-fbtn" data-f="owned">MEUS</button>' +
      '<button class="exp-fbtn" data-f="avail">DISPONÍVEIS</button>' +
      '<button class="exp-fbtn" data-f="boss">BOSSES</button></div>' +
      '<button class="btn small" id="exp-thi-refresh">REFRESH UNLOCKS</button>' +
      '<button class="btn primary small" id="exp-thi-buyall">🔓 COMPRAR TODOS</button>';
    bar.querySelectorAll('.exp-fbtn').forEach((b) => b.addEventListener('click', () => {
      thiegoFilter = b.dataset.f;
      bar.querySelectorAll('.exp-fbtn').forEach((x) => x.classList.toggle('active', x === b));
      renderThiegosGrid(host.querySelector('.exp-grid-host'));
    }));
    bar.querySelector('#exp-thi-refresh').addEventListener('click', () => {
      Net.refreshUnlocks()
        .then((d) => {
          if (d.new && d.new.length) {
            toast('Novos Thiegos desbloqueados: ' + d.new.join(', '), 'gold', 5000);
            E.forceReload('catalog');
          } else {
            toast('Nada novo por enquanto.', 'info');
          }
          E.forceReload('catalog');
          renderThiegos(host);
        })
        .catch(apiErr);
    });
    bar.querySelector('#exp-thi-buyall').addEventListener('click', () => {
      const btn = document.getElementById('exp-thi-buyall');
      setBusy(btn, true, '...');
      Net.buyAll()
        .then((d) => {
          setBusy(btn, false);
          E.forceReload('catalog');
          E.hydrateHud();
          const parts = [];
          if (d.new && d.new.length) parts.push(d.new.length + ' novos thiegos');
          if (d.upgraded > 0) parts.push(d.upgraded + ' thiegos subiram de nível (' + (d.spent || 0).toLocaleString('pt-BR') + ' coins)');
          toast(parts.length ? '✅ ' + parts.join(', ') : 'Nada a comprar. Jogue mais para desbloquear mais thiegos.', 'gold', 5000);
          renderThiegos(host);
        })
        .catch((e) => {
          setBusy(btn, false);
          apiErr(e);
        });
    });
    host.appendChild(bar);

    const gridHost = el('div', 'exp-grid-host');
    host.appendChild(gridHost);
    renderThiegosGrid(gridHost);
  }

  function renderThiegosGrid(host) {
    host.innerHTML = '<div class="notice">carregando…</div>';
    cached('catalog', 30000, () => Net.catalog().then((d) => d.thiegos))
      .then((list) => {
        const p = progress();
        const owned = list.filter((t) => t.owned);
        const shown = list.filter((t) => {
          if (thiegoFilter === 'owned') return t.owned;
          if (thiegoFilter === 'avail') return !t.owned && t.unlock_ready;
          if (thiegoFilter === 'boss') return !!t.is_boss;
          return true;
        });
        host.innerHTML = '';
        const sum = el('div', 'exp-summary', 'Coleção: <b>' + owned.length + '/' + list.length + '</b> · Nível ' + p.level);
        host.appendChild(sum);
        if (!shown.length) {
          host.appendChild(el('div', 'exp-empty', thiegoFilter === 'avail' ? 'Nada disponível agora — suba de nível ou aumente sua dopamina total.' : 'Nenhum Thiego aqui.'));
          return;
        }
        const grid = el('div', 'exp-grid');
        for (const t of shown) {
          const card = el('div', 'exp-card thiego' + (t.is_boss ? ' boss' : '') + (t.owned ? ' owned' : ''));
          card.style.borderColor = rarityColor(t.rarity);
          const head = el('div', 'exp-card-head');
          head.appendChild(rarityBadge(t.rarity));
          if (t.is_boss) head.appendChild(el('span', 'exp-boss-tag', 'BOSS'));
          card.appendChild(head);
          const im = el('div', 'exp-card-img');
          im.appendChild(imgEl(t.image));
          card.appendChild(im);
          card.appendChild(el('div', 'exp-card-name', esc(t.name)));
          card.appendChild(el('div', 'exp-card-meta',
            '<span class="exp-type">' + (TYPES[t.type] || t.type || '?') + '</span>' +
            '<span class="exp-role">' + (ROLES[t.role] || t.role || '') + '</span>'));
          if (t.description) card.appendChild(el('div', 'exp-card-desc', esc(t.description)));
          if (t.quote) card.appendChild(el('div', 'exp-card-quote', '“' + esc(String(t.quote).replace(/^["'“”]+|["'“”]+$/g, '')) + '”'));

          if (t.owned) {
            const lvl = el('div', 'exp-card-lvl', 'NÍVEL ' + t.level);
            card.appendChild(lvl);
            if (t.stats) card.appendChild(statRow(t.stats));
            if (t.abilities && t.abilities.length) {
              const ab = el('div', 'exp-card-abilities');
              ab.appendChild(el('div', 'exp-card-abil-title', 'HABILIDADES'));
              for (const a of t.abilities) {
                ab.appendChild(el('div', 'exp-card-abil',
                  '<b>' + esc(a.name) + '</b>' +
                  (a.cooldown ? ' <span class="muted">CD ' + a.cooldown + 's</span>' : '') +
                  (a.energy_cost ? ' <span class="muted">⚡' + a.energy_cost + '</span>' : '') +
                  (a.description ? '<div class="muted">' + esc(a.description) + '</div>' : '')));
              }
              card.appendChild(ab);
            }
            const btns = el('div', 'exp-card-btns');
            const up = el('button', 'btn small', t.level >= 100 ? 'MÁXIMO' : 'SUBE NÍVEL (' + money(25 + t.level * 25) + ')');
            up.disabled = t.level >= 100;
            up.addEventListener('click', () => {
              setBusy(up, true);
              Net.thiegoLevelUp(t.ut_id)
                .then((d) => {
                  setBusy(up, false);
                  toast(t.name + ' agora é nível ' + d.level + '!', 'gold');
                  E.forceReload('catalog');
                  E.forceReload('battle-team');
                  renderThiegosGrid(host);
                  E.hydrateHud();
                })
                .catch((e) => { setBusy(up, false); apiErr(e); });
            });
            const eq = el('button', 'btn small ghost', 'EQUIPAR');
            eq.addEventListener('click', () => equipModal(t));
            btns.appendChild(up);
            btns.appendChild(eq);
            card.appendChild(btns);
          } else {
            const un = el('div', 'exp-card-unlock');
            if (t.unlock_ready && !t.is_boss) {
              un.classList.add('ready');
              un.innerHTML = 'DISPONÍVEL — <b>abra caixas ou use REFRESH</b>';
            } else {
              const reqs = [];
              if (t.is_boss) reqs.push('BOSS — derrote-o no modo BOSS');
              else {
                if (t.unlock.level && p.level < t.unlock.level) reqs.push('Nível ' + t.unlock.level + '+');
                if (t.unlock.metric === 'dopamine') reqs.push('Dopamina total ' + E.claimLabel(t.unlock.value));
                else if (t.unlock.metric === 'prestige') reqs.push(t.unlock.value + '+ prestigios');
                else if (t.unlock.metric === 'ng') reqs.push('NG ' + t.unlock.value + '+');
                else if (t.unlock.metric === 'evolution') reqs.push('Evolução tier ' + t.unlock.value + '+');
                else if (!reqs.length && t.unlock.level) reqs.push('Nível ' + t.unlock.level + '+');
                else if (!reqs.length) reqs.push('Nível ' + (t.unlock.level || 1) + '+');
              }
              un.innerHTML = '🔒 ' + esc(reqs.join(' · '));
            }
            card.appendChild(un);
          }
          grid.appendChild(card);
        }
        host.appendChild(grid);
      })
      .catch((e) => { host.innerHTML = ''; host.appendChild(el('div', 'notice', 'Erro: ' + esc(e.message))); });
  }

  function equipModal(thiego) {
    Net.inventory().then((d) => {
      const eqItems = (d.items || []).filter((i) => (i.category === 'weapon' || i.category === 'armor' || i.category === 'accessory') && i.qty > 0);
      if (!eqItems.length) {
        toast('Nenhum item equipável no inventário.', 'warn');
        return;
      }
      const body = el('div', 'exp-modal-body');
      body.appendChild(el('div', 'exp-modal-title', 'EQUIPAR — ' + esc(thiego.name)));
      const list = el('div', 'exp-eq-list');
      for (const it of eqItems) {
        const row = el('div', 'exp-eq-row');
        row.appendChild(iconEl(it.icon, 'exp-eq-ic', '🎒'));
        const info = el('div', 'exp-eq-info');
        info.appendChild(el('div', 'exp-eq-name', esc(it.name) + ' <span class="muted">x' + it.qty + '</span>'));
        info.appendChild(el('div', 'exp-eq-meta', (SLOTS[it.slot] || CATS[it.category] || it.category) + ' · ' + esc(it.rarity)));
        row.appendChild(info);
        const bt = el('button', 'btn small', 'EQUIPAR');
        bt.addEventListener('click', () => {
          setBusy(bt, true);
          Net.equip(thiego.ut_id, it.item_id)
            .then((r) => {
              toast('Equipado: ' + it.name + ' (' + (SLOTS[r.slot] || r.slot) + ')', 'gold');
              if (window.UI && window.UI.closeModal) window.UI.closeModal();
              E.forceReload('inventory');
              E.forceReload('catalog');
              const t = document.getElementById('tab-thiegos');
              if (t) renderThiegosGrid(t.querySelector('.exp-grid-host'));
            })
            .catch((e) => { setBusy(bt, false); apiErr(e); });
        });
        row.appendChild(bt);
        list.appendChild(row);
      }
      body.appendChild(list);
      openExpModal(body);
    }).catch(apiErr);
  }

  /* ============================================================
     BATALHA (PvE)
     ============================================================ */
  let battleMode = 'pve';
  let battleTeam = [];
  let battleManual = false; // true = batalha manual turno a turno

  function renderBattle(host) {
    host.innerHTML = '';
    host.appendChild(el('div', 'exp-head', 'BATALHA — <span class="hl">PvE</span>' +
      '<span class="exp-head-sub">vença para ganhar coins, XP e dopamina</span>'));

    const modeBar = el('div', 'exp-modes');
    for (const m of ['daily', 'pve', 'boss', 'challenge', 'survival']) {
      const p = progress();
      const locked = p.level < MODE_GATE[m];
      const card = el('button', 'exp-mode' + (battleMode === m ? ' active' : '') + (locked ? ' locked' : ''));
      const extra = m === 'challenge' ? ' · FASE ' + ((p && p.challenge_phase) || 1) + '/5'
        : m === 'daily' ? ' · 1x/dia' : '';
      card.innerHTML =
        '<b>' + MODE_LABEL[m] + '</b>' +
        '<span>' + (locked ? '🔒 Nível ' + MODE_GATE[m] : '⚡ ' + MODE_COST[m] + ' energia' + extra) + '</span>';
      card.addEventListener('click', () => {
        if (locked) { toast('Desbloqueia no nível ' + MODE_GATE[m] + '.', 'warn'); return; }
        battleMode = m;
        renderBattle(host);
      });
      modeBar.appendChild(card);
    }
    host.appendChild(modeBar);

    // daily boss: mostra o boss do dia antes de montar o resto
    if (battleMode === 'daily') {
      const dailyCard = el('div', 'exp-panel exp-daily-panel');
      dailyCard.appendChild(el('div', 'exp-panel-title', '👑 BOSS DO DIA'));
      const dailyBody = el('div', 'exp-daily-body');
      dailyCard.appendChild(dailyBody);
      host.appendChild(dailyCard);
      Net.dailyInfo()
        .then((d) => {
          if (!d || !d.ok) { dailyBody.appendChild(el('div', 'exp-empty', 'Indisponível no momento.')); return; }
          const b = d.boss || {};
          const name = el('div', 'exp-daily-name', '👾 ' + esc(b.name || 'BOSS'));
          const img = imgEl(b.image, 'exp-daily-img');
          const quote = el('div', 'exp-daily-quote', esc(b.quote || ''));
          const st = el('div', 'exp-daily-status' + (d.done ? ' done' : ''), d.done ? '✓ VOCÊ JÁ LUTOU HOJE — volte amanhã!' : '✨ Disponível agora (1 luta grátis)');
          dailyBody.appendChild(img);
          dailyBody.appendChild(name);
          dailyBody.appendChild(quote);
          dailyBody.appendChild(st);
        })
        .catch(() => {});
    }

    // toggle AUTO / MANUAL (survival e daily são sempre AUTO)
    const autoBar = el('div', 'exp-auto-toggle');
    const autoBtn = el('button', 'exp-mode' + (!battleManual ? ' active' : ''),
      '<b>🤖 AUTO</b><span>batalha resolve sozinha</span>');
    const manualBtn = el('button', 'exp-mode' + (battleManual ? ' active' : ''),
      '<b>🕹️ MANUAL</b><span>você escolhe cada ataque (estilo Pokémon)</span>');
    autoBtn.addEventListener('click', () => { battleManual = false; renderBattle(host); });
    manualBtn.addEventListener('click', () => { battleManual = true; renderBattle(host); });
    autoBar.appendChild(autoBtn);
    autoBar.appendChild(manualBtn);
    if (battleMode === 'survival' || battleMode === 'daily') {
      autoBar.style.display = 'none';
    }
    host.appendChild(autoBar);

    // missões do servidor
    const missCard = el('div', 'exp-panel');
    missCard.appendChild(el('div', 'exp-panel-title', 'MISSÕES DO SERVIDOR'));
    renderMissionsInto(missCard, missCard);
    host.appendChild(missCard);

    // seletor de time
    const teamBox = el('div', 'exp-panel');
    teamBox.appendChild(el('div', 'exp-panel-title', 'SEU TIME (máx 3)'));
    const teamHost = el('div', 'exp-team-host');
    teamBox.appendChild(teamHost);
    host.appendChild(teamBox);
    renderTeamPicker(teamHost, { max: 3 });

    // guia de tipos: fraquezas e vantagens do time (estilo Pokémon)
    const typePanel = el('div', 'exp-panel exp-type-panel');
    typePanel.appendChild(el('div', 'exp-panel-title', '⚡ GUIA DE TIPOS'));
    const typeBody = el('div', 'exp-type-body');
    typePanel.appendChild(typeBody);
    host.appendChild(typePanel);
    renderTypeGuide(typeBody);

    const startBtn = el('button', 'btn primary exp-start', (battleManual ? '🕹' : '⚔') + ' INICIAR ' + (battleManual ? 'BATALHA MANUAL' : 'BATALHA') + (MODE_COST[battleMode] > 0 ? ' (' + MODE_COST[battleMode] + ' ⚡)' : ' (GRÁTIS)'));
    startBtn.addEventListener('click', () => {
      if (!battleTeam.length) { toast('Escolha ao menos 1 Thiego.', 'warn'); return; }
      let bossSlug = null;
      if (battleMode === 'boss') {
        const sel = host.querySelector('.exp-boss-sel');
        bossSlug = sel ? sel.value : '';
        if (!bossSlug) { toast('Escolha um boss.', 'warn'); return; }
      }
      setBusy(startBtn, true);
      const start = battleMode === 'survival'
        ? Net.survivalStart(battleTeam.slice())
        : battleMode === 'daily'
          ? Net.dailyStart(battleTeam.slice())
          : battleManual
            ? Net.battleManualStart(battleMode, battleTeam.slice(), bossSlug)
            : Net.battleStart(battleMode, battleTeam.slice(), bossSlug);
      start
        .then((d) => {
          setBusy(startBtn, false);
          if (battleMode === 'survival') renderSurvival(host, d);
          else if (battleMode === 'daily') renderBattleLive(host, d);
          else if (battleManual) renderBattleManual(host, d);
          else renderBattleLive(host, d);
          E.pollState(true).catch(() => {});
        })
        .catch((e) => { setBusy(startBtn, false); apiErr(e); });
    });
    host.appendChild(startBtn);
  }

  /* ============================================================
     SURVIVAL MODE — UI de ondas (onda atual, próxima, retirar)
     ============================================================ */
  function renderSurvival(host, d) {
    host.innerHTML = '';
    const battleId = d.battle_id;
    let wave = d.wave || 1;
    let state = d.state || {};
    let total = { coins: 0, xp: 0, dop: 0 };
    const enemy = d.enemy || {};

    host.appendChild(el('div', 'exp-head', '🌊 SURVIVAL — <span class="hl">ONDA ' + wave + '</span>' +
      '<span class="exp-head-sub">vença as ondas, o time não cura entre elas</span>'));

    // barra de status da run
    const statusBar = el('div', 'exp-survival-status');
    const waveLbl = el('div', 'exp-survival-wave', '🌊 ONDA ' + wave);
    const rewardsLbl = el('div', 'exp-survival-rewards', '🪙 0 · ⚡ 0 XP');
    statusBar.appendChild(waveLbl);
    statusBar.appendChild(rewardsLbl);
    host.appendChild(statusBar);

    const enemyCard = el('div', 'exp-panel');
    enemyCard.appendChild(el('div', 'exp-panel-title', 'PRÓXIMO INIMIGO' + (enemy.is_boss ? ' <span class="exp-boss-badge">BOSS</span>' : '')));
    const enemyRow = el('div', 'exp-daily-body');
    enemyRow.appendChild(imgEl(enemy.image, 'exp-daily-img'));
    const eInfo = el('div');
    eInfo.appendChild(el('div', 'exp-daily-name', '👾 ' + esc(enemy.name || '?')));
    eInfo.appendChild(el('div', 'exp-daily-status', 'Nível ' + (enemy.level || 1)));
    enemyRow.appendChild(eInfo);
    enemyCard.appendChild(enemyRow);
    host.appendChild(enemyCard);

    // replay da onda atual (resolve via survival_next, que avança a run)
    const replayHost = el('div');
    host.appendChild(replayHost);
    buildReplay(replayHost, state, {
      mode: 'survival',
      title: '🌊 ONDA ' + wave,
      fetchAuto: () => Net.survivalNext(battleId).then((r) => ({
        state: r.state || {},
        result: {
          winner: r.won ? 'player' : 'enemy',
          coins: (r.wave_rewards || {}).coins || 0,
          xp: (r.wave_rewards || {}).xp || 0,
          dopamine_log10: (r.wave_rewards || {}).dop || 0,
          total: r.total_rewards || {},
          _state: r.state || {},
          _enemy: r.enemy || {},
          _wave: r.wave || (wave + 1),
        },
      })),
      finish: (res) => {
        E.pollState(true).catch(() => {});
        renderSurvivalResult(host, d, { battleId, wave, res });
      },
      onCancel: () => { Net.battleCancel(battleId).catch(() => {}); battleTeam = []; renderBattle(host); },
    });

    // botão de retirar
    const retireBtn = el('button', 'btn ghost exp-survival-retire', '🏳️ RETIRAR E RECEBER (' + money(total.coins) + ' 🪙)');
    retireBtn.addEventListener('click', () => {
      if (!confirm('Retirar agora? Você recebe o acumulado da run.')) return;
      Net.survivalRetire(battleId).then((r) => {
        renderBattleResult(host, { result: { winner: 'retire', coins: r.total_rewards.coins, xp: r.total_rewards.xp, dopamine_log10: r.total_rewards.dop } }, 'survival');
        E.pollState(true).catch(() => {});
      }).catch((e) => apiErr(e));
    });
    host.appendChild(retireBtn);
  }

  function renderSurvivalResult(host, d, ctx) {
    const res = ctx.res || {};
    const won = res.winner === 'player';
    const wave = ctx.wave;

    if (won) {
      // avançou para a próxima onda (survival_next já preparou o estado)
      toast('🌊 Onda ' + wave + ' vencida! +' + (res.coins || 0) + ' coins', 'gold', 2500);
      const total = res.total || {};
      renderSurvival(host, {
        battle_id: ctx.battleId,
        wave: res._wave || (d.wave || wave) + 1,
        state: res._state || d.state || {},
        enemy: res._enemy || d.enemy || {},
        total: total,
      });
    } else {
      renderBattleResult(host, { result: { winner: 'enemy', coins: (res.total || {}).coins || 0, xp: (res.total || {}).xp || 0, dopamine_log10: (res.total || {}).dop || 0 } }, 'survival');
    }
  }

  function renderMissionsInto(host, anchor) {
    const p = progress();
    if (!p) return;
    const list = (E.state && E.state.missions) || [];
    if (!list.length) {
      anchor.appendChild(el('div', 'exp-empty', 'Nenhuma missão do dia por enquanto.'));
      return;
    }
    const grid = el('div', 'exp-missions');
    for (const m of list) {
      const card = el('div', 'exp-mission' + (m.complete ? ' done' : ''));
      const reward = m.reward ? JSON.parse(m.reward) : null;
      const rTxt = reward ? Object.keys(reward).map((k) => '+' + (reward[k] || '') + ' ' + k).join(' ') : '';
      card.innerHTML =
        '<div class="exp-mission-name">' + esc(m.name) + '</div>' +
        '<div class="exp-mission-desc">' + esc(m.description || '') + '</div>' +
        '<div class="exp-mission-bar"><i style="width:' + Math.min(100, (m.progress / Math.max(1, m.target)) * 100) + '%"></i></div>' +
        '<div class="exp-mission-meta">' + m.progress + '/' + m.target + (rTxt ? ' · <b class="hl">' + esc(rTxt) + '</b>' : '') + '</div>';
      if (m.complete && !m.claimed) {
        const bt = el('button', 'btn small', 'RECEBER');
        bt.addEventListener('click', () => {
          setBusy(bt, true);
          Net.claimMission(m.id)
            .then((d) => {
              setBusy(bt, false);
              const g = d.granted ? Object.keys(d.granted).map((k) => '+' + (d.granted[k] || '') + ' ' + k).join(' ') : '';
              toast('Missão concluída: ' + (g || 'recompensa recebida'), 'gold', 5000);
              E.pollState(true).catch(() => {});
            })
            .catch((e) => { setBusy(bt, false); apiErr(e); });
        });
        card.appendChild(bt);
      } else if (m.claimed) {
        card.appendChild(el('div', 'exp-mission-claimed', '✓ RECEBIDA'));
      }
      grid.appendChild(card);
    }
    anchor.appendChild(grid);
  }

  function renderTeamPicker(host, opts) {
    cached('battle-team', 30000, () => Net.catalog().then((d) => d.thiegos.filter((t) => t.owned && !t.is_boss)))
      .then((list) => {
        host.innerHTML = '';
        if (!list.length) {
          host.appendChild(el('div', 'exp-empty', 'Você ainda não tem Thiegos. Vá na aba THIEGOS e desbloqueie sua coleção.'));
          return;
        }
        list.sort((a, b) => b.level - a.level);
        const grid = el('div', 'exp-team-grid');
        for (const t of list) {
          const card = el('div', 'exp-team-card');
          const cb = el('input', 'exp-team-cb');
          cb.type = 'checkbox';
          cb.id = 'tm-' + t.ut_id;
          cb.checked = battleTeam.indexOf(t.ut_id) >= 0;
          cb.addEventListener('change', () => {
            if (cb.checked) {
              if (battleTeam.length >= (opts.max || 3)) {
                cb.checked = false;
                toast('Máximo de ' + (opts.max || 3) + ' Thiegos.', 'warn');
                return;
              }
              battleTeam.push(t.ut_id);
            } else {
              battleTeam = battleTeam.filter((x) => x !== t.ut_id);
            }
            card.classList.toggle('on', cb.checked);
          });
          card.appendChild(cb);
          const body = el('label', 'exp-team-body');
          body.htmlFor = cb.id;
          body.appendChild(imgEl(t.image, 'exp-team-ic'));
          body.appendChild(el('div', 'exp-team-name', esc(t.name)));
          body.appendChild(el('div', 'exp-team-meta', 'N' + t.level + ' ' + typeBadge(t.type)));
          card.appendChild(body);
          grid.appendChild(card);
        }
        host.appendChild(grid);
        if (battleMode === 'boss') {
          const sel = el('select', 'exp-boss-sel');
          sel.innerHTML = '<option value="">— escolha o boss —</option>';
          cached('catalog', 60000, () => Net.catalog().then((d) => d.thiegos))
            .then((list) => {
              for (const t of list.filter((x) => x.is_boss)) {
                const o = document.createElement('option');
                o.value = t.slug;
                o.textContent = t.name + ' (nvl ' + (t.unlock.level || 1) + ')';
                sel.appendChild(o);
              }
            })
            .catch(() => {});
          host.appendChild(sel);
        }
      })
      .catch((e) => { host.innerHTML = '<div class="notice">' + esc(e.message) + '</div>'; });
  }

  /** Guia de tipos: para cada Thiego do time, mostra contra o que ele é forte/fraco.
   *  Usa a matriz oficial do servidor (type_advantages). */
  function renderTypeGuide(host) {
    const loading = el('div', 'exp-empty', 'carregando guia de tipos…');
    host.appendChild(loading);

    const teamTypes = new Set();
    cached('battle-team', 30000, () => Net.catalog().then((d) => d.thiegos.filter((t) => t.owned && !t.is_boss)))
      .then((list) => {
        for (const ut of battleTeam) {
          const t = list.find((x) => x.ut_id === ut);
          if (t && t.type) teamTypes.add(t.type);
        }
        return teamTypes;
      })
      .catch(() => teamTypes);

    // busca a matriz
    Net.typeChart().then((d) => {
      if (!d || !d.ok || !d.matrix) return;
      const matrix = d.matrix;
      host.innerHTML = '';
      const types = Object.keys(matrix);
      if (!types.length) return;

      // grid completo 8x8 com destaque do time
      const grid = el('div', 'exp-type-grid');
      // cabeçalho: defensor
      const corner = el('div', 'exp-type-cell head');
      grid.appendChild(corner);
      for (const def of types) {
        const h = el('div', 'exp-type-cell head');
        h.innerHTML = typeBadge(def).replace('exp-type-badge', 'exp-type-badge mini');
        grid.appendChild(h);
      }
      for (const atk of types) {
        const l = el('div', 'exp-type-cell head');
        l.innerHTML = typeBadge(atk).replace('exp-type-badge', 'exp-type-badge mini');
        grid.appendChild(l);
        for (const def of types) {
          const mult = (matrix[atk] && matrix[atk][def]) || 1.0;
          const mine = teamTypes.has(atk) || teamTypes.has(def);
          const cell = el('div', 'exp-type-cell' + (mine ? ' mine' : ''));
          let cls = 'n', txt = '·';
          if (mult >= 1.5) { cls = 'w'; txt = mult >= 2 ? '2×' : '1.5×'; }
          else if (mult <= 0.75) { cls = 'l'; txt = mult <= 0.5 ? (mult <= 0.25 ? '0.25×' : '0.5×') : '0.75×'; }
          else if (mult > 1) { cls = 's'; txt = '1.25×'; }
          cell.className = 'exp-type-cell ' + cls + (mine ? ' mine' : '');
          cell.title = BATTLE_TYPES[atk]?.label + ' vs ' + BATTLE_TYPES[def]?.label + ': ' + (mult * 100) + '%';
          cell.textContent = txt;
          grid.appendChild(cell);
        }
      }
      host.appendChild(grid);

      // legenda
      const leg = el('div', 'exp-type-legend');
      leg.innerHTML =
        '<span class="w">2×/1.5× SUPER EFICAZ</span>' +
        '<span class="s">1.25× EFICAZ</span>' +
        '<span class="n">· NEUTRO</span>' +
        '<span class="l">0.75×/0.5× FRACO</span>' +
        (teamTypes.size ? ' <span class="mine-tag">★ = seu time</span>' : '');
      host.appendChild(leg);
    }).catch(() => {});
  }

  /** Replay animado autoritativo de uma batalha (HP bars + log + AUTO 1×/2×/4×).
   *  opts: { mode, title, fetchAuto?: () => Promise<{state,result}>, finish: (res)=>void, onCancel: ()=>void } */
  function buildReplay(host, state, opts) {
    host.innerHTML = '';
    const mode = opts.mode || '';
    const phase = (state.challenge_phase || 1);
    host.appendChild(el('div', 'exp-head', (opts.title || 'COMBATE') + (mode === 'challenge' ? ' <span class="exp-phase">FASE ' + phase + '/5</span>' : '')));

    const vs = el('div', 'exp-vs');
    const mkSide = (lbl, combatants, cls) => {
      const side = el('div', 'exp-vs-side ' + cls);
      side.appendChild(el('div', 'exp-vs-lbl', lbl));
      const wraps = [];
      for (const c of combatants) {
        const w = el('div', 'exp-fighter');
        w.appendChild(imgEl(c.image, 'exp-team-ic'));
        w.appendChild(el('div', 'exp-fighter-name', esc(c.name || c.slug || '?') + ' <span class="exp-fighter-lvl">N' + (c.level || 1) + '</span> ' + typeBadge(c.type)));
        const bar = el('div', 'exp-hpbar');
        const fill = el('i');
        bar.appendChild(fill);
        const num = el('div', 'exp-hpnum');
        w.appendChild(bar);
        w.appendChild(num);
        side.appendChild(w);
        wraps.push({ bar: fill, num, max: Math.max(1, c.maxhp || 1) });
      }
      return { side, wraps };
    };
    const me = mkSide('VOCÊ', (state.combatants && state.combatants.player) || [], 'me');
    const en = mkSide('INIMIGO', (state.combatants && state.combatants.enemy) || [], 'en');
    vs.appendChild(me.side);
    vs.appendChild(el('div', 'exp-vs-x', 'VS'));
    vs.appendChild(en.side);
    host.appendChild(vs);

    const paint = (hpArr, wraps) => {
      (hpArr || []).forEach((h, i) => {
        if (!wraps[i]) return;
        const pct = Math.max(0, Math.min(100, (h.hp / wraps[i].max) * 100));
        wraps[i].bar.style.width = pct + '%';
        wraps[i].bar.style.background = pct > 50 ? 'var(--hp-ok,#4ade80)' : (pct > 25 ? 'var(--hp-mid,#facc15)' : 'var(--hp-low,#f87171)');
        wraps[i].num.textContent = h.hp + '/' + h.maxhp;
      });
    };
    const trail = state.hp_trail || [];
    const trail0 = trail[0];
    if (trail0) { paint(trail0.hp.player, me.wraps); paint(trail0.hp.enemy, en.wraps); }

    const logBox = el('div', 'exp-battle-log');
    const logEntry = (msg, side) => {
      const e = el('div', 'exp-log-entry' + (side === 'sys' ? ' sys' : (side === 'player' ? ' me' : ' en')));
      e.textContent = msg;
      logBox.appendChild(e);
      logBox.scrollTop = logBox.scrollHeight;
    };
    if (trail0) logEntry(trail0.msg, trail0.side);
    host.appendChild(logBox);

    const ctl = el('div', 'exp-battle-btns');
    const speedBtn = el('button', 'btn primary', '▶ AUTO 1×');
    const skipBtn = el('button', 'btn', 'PULAR ▸▸');
    const cancel = el('button', 'btn ghost', 'CANCELAR');
    ctl.appendChild(speedBtn);
    ctl.appendChild(skipBtn);
    ctl.appendChild(cancel);
    host.appendChild(ctl);

    let speed = 1;
    let running = false;
    let instant = false;
    const delay = () => [900, 450, 220][speed - 1] || 220;

    const applySnap = (s) => {
      paint(s.hp.player, me.wraps);
      paint(s.hp.enemy, en.wraps);
      if (s.side === 'player') { me.side.classList.add('flash'); en.side.classList.remove('flash'); }
      else if (s.side === 'enemy') { en.side.classList.add('flash'); me.side.classList.remove('flash'); }
      if (s.msg) logEntry(s.msg, s.side);
    };

    const replay = async (s, res) => {
      const t = s.hp_trail || [];
      for (let i = 1; i < t.length; i++) {
        if (!running) return;
        applySnap(t[i]);
        if (!instant) await new Promise((r) => setTimeout(r, delay()));
      }
      opts.finish(res);
    };

    speedBtn.addEventListener('click', () => {
      if (!running) {
        running = true;
        if (opts.fetchAuto) {
          opts.fetchAuto().then((r) => replay(r.state, r.result)).catch((e) => { apiErr(e); });
        } else {
          replay(state, null);
        }
      }
      speed = speed === 4 ? 1 : speed + 1;
      speedBtn.textContent = '▶ AUTO ' + speed + '×';
    });
    skipBtn.addEventListener('click', () => { instant = true; });
    cancel.addEventListener('click', () => {
      running = false;
      if (opts.onCancel) opts.onCancel();
    });
  }

  function renderBattleLive(host, d) {
    buildReplay(host, d.state || {}, {
      mode: d.mode,
      title: 'BATALHA ATIVA — <span class="hl">' + (MODE_LABEL[d.mode] || d.mode) + '</span>',
      fetchAuto: () => Net.battleAuto(d.battle_id).then((r) => ({ state: r.state || {}, result: r.result || {} })),
      finish: (res) => { renderBattleResult(host, { result: res }, d.mode); E.pollState(true).catch(() => {}); },
      onCancel: () => { Net.battleCancel(d.battle_id).catch(() => {}); battleTeam = []; renderBattle(host); },
    });
  }

  /* ============================================================
     BATALHA MANUAL (estilo Pokémon) — jogador escolhe cada ataque
     ============================================================ */
  const MANUAL_AB_LABEL = {
    basic: 'ATAQUE', skill1: 'GOLPE 1', skill2: 'GOLPE 2', special: 'ESPECIAL',
  };

  function renderBattleManual(host, d) {
    host.innerHTML = '';
    const battleId = d.battle_id;
    let state = d.state || {};
    const mode = d.mode || 'pve';

    host.appendChild(el('div', 'exp-head', '🕹️ BATALHA MANUAL — <span class="hl">' + (MODE_LABEL[mode] || mode) + '</span>' +
      '<span class="exp-head-sub">escolha a ação de cada turno, estilo Pokémon</span>'));

    const arena = el('div', 'exp-arena');
    const logBox = el('div', 'exp-battle-log');

    // estado local de UI
    let menu = 'main'; // main | abilities | items | switch
    const activePlayer = () => {
      const team = (state.combatants && state.combatants.player) || [];
      for (const c of team) if (c.hp > 0) return c;
      return team[0] || null;
    };
    const activeEnemy = () => {
      const team = (state.combatants && state.combatants.enemy) || [];
      for (const c of team) if (c.hp > 0) return c;
      return team[0] || null;
    };

    const logEntry = (msg, side) => {
      const e = el('div', 'exp-log-entry' + (side === 'sys' ? ' sys' : (side === 'player' ? ' me' : ' en')));
      e.textContent = msg;
      logBox.appendChild(e);
      logBox.scrollTop = logBox.scrollHeight;
    };

    function paintHP(fighter, wrap, num) {
      const pct = Math.max(0, Math.min(100, (fighter.hp / Math.max(1, fighter.maxhp)) * 100));
      wrap.style.width = pct + '%';
      wrap.style.background = pct > 50 ? 'var(--hp-ok,#4ade80)' : (pct > 25 ? 'var(--hp-mid,#facc15)' : 'var(--hp-low,#f87171)');
      num.textContent = fighter.hp + '/' + fighter.maxhp;
    }

    function buildArena() {
      const me = activePlayer();
      const en = activeEnemy();
      arena.innerHTML = '';

      // cenário estilo Pokémon: inimigo no topo, aliado embaixo
      const scene = el('div', 'exp-arena-scene');

      // painel inimigo (topo)
      const top = el('div', 'exp-arena-top');
      const enPanel = el('div', 'exp-poke-panel');
      if (en) {
        enPanel.innerHTML =
          '<div class="exp-poke-name">' + esc(en.name) + ' <span class="exp-poke-lvl">N' + (en.level || 1) + '</span>' +
          (en.rarity ? ' <span class="exp-poke-rarity">' + esc(en.rarity) + '</span>' : '') + '</div>';
        const bar = el('div', 'exp-hpbar big');
        const fill = el('i');
        bar.appendChild(fill);
        const num = el('div', 'exp-hpnum');
        enPanel.appendChild(bar);
        enPanel.appendChild(num);
        paintHP(en, fill, num);
        top.appendChild(enPanel);
        const eImg = el('div', 'exp-poke-sprite enemy');
        eImg.appendChild(imgEl(en.image, 'exp-poke-img'));
        eImg.appendChild(el('div', 'exp-poke-type', typeBadge(en.type)));
        top.appendChild(eImg);
      }
      scene.appendChild(top);

      // log central
      const logWrap = el('div', 'exp-arena-logwrap');
      logWrap.appendChild(logBox);
      scene.appendChild(logWrap);

      // painel aliado (embaixo)
      const bottom = el('div', 'exp-arena-bottom');
      const myImg = el('div', 'exp-poke-sprite me');
      if (me) {
        myImg.appendChild(imgEl(me.image, 'exp-poke-img'));
        myImg.appendChild(el('div', 'exp-poke-type', typeBadge(me.type)));
        const mePanel = el('div', 'exp-poke-panel');
        mePanel.innerHTML =
          '<div class="exp-poke-name">' + esc(me.name) + ' <span class="exp-poke-lvl">N' + (me.level || 1) + '</span>' +
          (me.rarity ? ' <span class="exp-poke-rarity">' + esc(me.rarity) + '</span>' : '') + '</div>';
        const bar = el('div', 'exp-hpbar big');
        const fill = el('i');
        bar.appendChild(fill);
        const num = el('div', 'exp-hpnum');
        mePanel.appendChild(bar);
        mePanel.appendChild(num);
        paintHP(me, fill, num);
        bottom.appendChild(mePanel);
      }
      bottom.appendChild(myImg);
      scene.appendChild(bottom);
      arena.appendChild(scene);
    }

    function finished(winner) {
      arena.innerHTML = '';
      arena.appendChild(el('div', 'exp-banner ' + (winner === 'player' ? 'win' : (winner === 'draw' ? 'draw' : 'lose')),
        '<div class="exp-banner-title">' + (winner === 'player' ? 'VITÓRIA!' : (winner === 'draw' ? 'EMPATE' : 'DERROTA')) + '</div>'));
      const btns = el('div', 'exp-battle-btns');
      const again = el('button', 'btn primary', '⚔ NOVA BATALHA');
      again.addEventListener('click', () => { battleTeam = []; renderBattle(host); });
      btns.appendChild(again);
      arena.appendChild(btns);
    }

    function renderActions() {
      const ctl = el('div', 'exp-manual-ctl');
      const me = activePlayer();

      if (state.status !== 'active') {
        finished(state.status);
        return;
      }

      if (menu === 'abilities' && me) {
        const grid = el('div', 'exp-manual-grid');
        const labels = ['basic', 'skill1', 'skill2', 'special'];
        for (const slot of labels) {
          const ab = (me.abilities || []).find((a) => a.slot === slot);
          if (!ab) continue;
          const cd = me.cd && me.cd[slot];
          const onCd = cd > 0;
          const b = el('button', 'btn exp-ab-btn' + (onCd ? ' disabled' : ''));
          b.innerHTML = '<b>' + esc(ab.name) + '</b><small>' + (MANUAL_AB_LABEL[slot] || slot) +
            (onCd ? ' · ⏳' + cd : '') + '</small>';
          if (!onCd) b.addEventListener('click', () => {
            setBusy(b, true, '…');
            Net.battleManualTurn(battleId, { type: 'ability', slot: slot })
              .then((r) => { applyTurn(r); })
              .catch((e) => { setBusy(b, false); apiErr(e); });
          });
          grid.appendChild(b);
        }
        const back = el('button', 'btn ghost', '← VOLTAR');
        back.addEventListener('click', () => { menu = 'main'; renderActions(); });
        grid.appendChild(back);
        ctl.appendChild(grid);
      } else if (menu === 'switch' && me) {
        const grid = el('div', 'exp-manual-grid');
        const team = (state.combatants && state.combatants.player) || [];
        team.forEach((c, i) => {
          const isActive = c === me;
          const b = el('button', 'btn exp-ab-btn' + (c.hp <= 0 ? ' disabled' : '') + (isActive ? ' active' : ''));
          b.innerHTML = '<b>' + esc(c.name) + '</b><small>' + (c.hp > 0 ? c.hp + '/' + c.maxhp + ' HP' : 'DESMAIADO') + '</small>';
          if (c.hp > 0 && !isActive) b.addEventListener('click', () => {
            setBusy(b, true, '…');
            Net.battleManualTurn(battleId, { type: 'switch', switch_idx: i })
              .then((r) => { applyTurn(r); })
              .catch((e) => { setBusy(b, false); apiErr(e); });
          });
          grid.appendChild(b);
        });
        const back = el('button', 'btn ghost', '← VOLTAR');
        back.addEventListener('click', () => { menu = 'main'; renderActions(); });
        grid.appendChild(back);
        ctl.appendChild(grid);
      } else {
        // menu principal estilo Pokémon: 2x2
        const grid = el('div', 'exp-poke-menu');
        const mk = (label, icon, fn, disabled) => {
          const b = el('button', 'btn exp-poke-menu-btn' + (disabled ? ' disabled' : ''));
          b.innerHTML = '<b>' + icon + ' ' + label + '</b>';
          if (!disabled) b.addEventListener('click', fn);
          grid.appendChild(b);
        };
        mk('ATACAR', '⚔', () => { menu = 'abilities'; renderActions(); });
        mk('TROCAR', '🔁', () => { menu = 'switch'; renderActions(); });
        mk('ITEM', '🎒', () => {
          // itens de cura
          const consumables = me && me.consumables ? Object.entries(me.consumables) : [];
          if (!consumables.length) { toast('Nenhum item de cura.', 'warn'); return; }
          const grid2 = el('div', 'exp-manual-grid');
          for (const [ik, it] of consumables) {
            const b = el('button', 'btn exp-ab-btn');
            b.innerHTML = '<b>' + esc(it.name) + '</b><small>x' + it.qty + ' · +' + Math.round(it.heal * 100) + '% HP</small>';
            b.addEventListener('click', () => {
              setBusy(b, true, '…');
              Net.battleManualTurn(battleId, { type: 'item', item_key: parseInt(ik, 10) })
                .then((r) => { applyTurn(r); })
                .catch((e) => { setBusy(b, false); apiErr(e); });
            });
            grid2.appendChild(b);
          }
          const back = el('button', 'btn ghost', '← VOLTAR');
          back.addEventListener('click', () => { menu = 'main'; renderActions(); });
          grid2.appendChild(back);
          ctl.innerHTML = '';
          ctl.appendChild(grid2);
          return;
        });
        mk('FUGIR', '🏃', () => {
          Net.battleCancel(battleId).catch(() => {});
          battleTeam = []; renderBattle(host);
        });
        ctl.appendChild(grid);
      }

      // troca rápida quando o aliado cai
      if (!me && state.status === 'active') {
        const team = (state.combatants && state.combatants.player) || [];
        const alive = team.filter((c) => c.hp > 0);
        if (alive.length) {
          ctl.innerHTML = '';
          const lbl = el('div', 'exp-manual-prompt', 'Seu Thiego desmaiou! Escolha o próximo:');
          ctl.appendChild(lbl);
          const grid = el('div', 'exp-manual-grid');
          alive.forEach((c) => {
            const b = el('button', 'btn exp-ab-btn', '<b>' + esc(c.name) + '</b><small>' + c.hp + '/' + c.maxhp + ' HP</small>');
            b.addEventListener('click', () => {
              setBusy(b, true, '…');
              const idx = team.indexOf(c);
              Net.battleManualTurn(battleId, { type: 'switch', switch_idx: idx })
                .then((r) => { applyTurn(r); })
                .catch((e) => { setBusy(b, false); apiErr(e); });
            });
            grid.appendChild(b);
          });
          ctl.appendChild(grid);
        }
      }

      // botão AUTO (resolve o resto sozinho)
      const autoBar = el('div', 'exp-manual-autobar');
      const autoBtn = el('button', 'btn small', '🤖 AUTO (resolve tudo)');
      autoBtn.addEventListener('click', () => {
        setBusy(autoBtn, true, '…');
        Net.battleAuto(battleId)
          .then((r) => {
            state = r.state || state;
            applyTurn({ state: r.state, result: r.result });
          })
          .catch((e) => { setBusy(autoBtn, false); apiErr(e); });
      });
      autoBar.appendChild(autoBtn);
      ctl.appendChild(autoBar);

      const cur = host.querySelector('.exp-manual-ctl');
      if (cur) cur.remove();
      host.appendChild(ctl);
    }

    function applyTurn(r) {
      const newState = r.state || state;
      const oldTrailLen = (state.hp_trail || []).length;
      state = newState;
      // loga as novas entradas
      const trail = state.hp_trail || [];
      for (let i = oldTrailLen; i < trail.length; i++) {
        logEntry(trail[i].msg, trail[i].side);
      }
      buildArena();
      renderActions();
      if (state.status !== 'active' && r.result) {
        // já mostra resultado
        const winner = state.status;
        if (d.pvp && d.onFinish) {
          // PvP: finaliza no servidor (ELO + recompensas) e mostra banner
          d.onFinish(battleId).catch((e) => { if (e && e.message !== 'Batalha PvP não encontrada.') apiErr(e); });
          return;
        }
        // renderiza resultado completo
        const resHost = el('div');
        renderBattleResult(host, { result: r.result || { winner: winner } }, mode);
        E.pollState(true).catch(() => {});
      }
    }

    // log inicial
    const t0 = (state.hp_trail || [])[0];
    if (t0) logEntry(t0.msg, t0.side);

    host.appendChild(arena);
    buildArena();
    renderActions();
  }

  function renderBattleResult(host, r, mode) {
    const res = r.result || {};
    const w = res.winner || r.state.status || 'draw';
    const won = w === 'player';
    const box = el('div', 'exp-banner ' + (won ? 'win' : (w === 'draw' ? 'draw' : 'lose')));
    const parts = [];
    if (res.coins > 0) parts.push('+' + res.coins + ' coins');
    if (res.xp > 0) parts.push('+' + res.xp + ' XP');
    if ((res.dopamine_log10 || 0) > 0) parts.push('+' + E.claimLabel(res.dopamine_log10) + ' dopamina');
    if (res.ng_cycle > 0) parts.push('+1 NG CYCLE 🎉');
    if (mode === 'challenge' && res.challenge_phase) parts.push('→ FASE ' + res.challenge_phase + '/5');
    box.innerHTML =
      '<div class="exp-banner-title">' + (won ? 'VITÓRIA!' : (w === 'draw' ? 'EMPATE' : 'DERROTA')) +
      (res.challenge_complete ? ' <span class="exp-forced">NG+!</span>' : '') + '</div>' +
      '<div class="exp-banner-sub">' + (parts.length ? parts.join(' · ') : 'Sem recompensas.') + '</div>';
    const btns = el('div', 'exp-battle-btns');
    const again = el('button', 'btn primary', '⚔ NOVA BATALHA');
    again.addEventListener('click', () => { battleTeam = []; renderBattle(host); });
    btns.appendChild(again);
    box.appendChild(btns);
    host.insertBefore(box, host.firstChild);
    if (res.drop) {
      const db = el('div', 'exp-banner loot-open');
      db.style.borderColor = rarityColor(res.drop.rarity);
      db.appendChild(el('div', 'exp-banner-title', '🎁 DROP DE BOSS!'));
      db.appendChild(el('div', 'exp-banner-sub', 'O boss largou: <b>' + esc(res.drop.name) + '</b> <small>(' + esc(res.drop.rarity) + ')</small> — vá em INVENTÁRIO para equipar.'));
      host.insertBefore(db, box.nextSibling);
    }
    void mode;
  }

  /* ============================================================
     PVP
     ============================================================ */
  function renderPvp(host) {
    host.innerHTML = '';
    host.appendChild(el('div', 'exp-head', 'PVP RANQUEADO — <span class="hl">TEMPORADA</span>'));

    Net.pvpStatus().then((st) => {
      if (!st.unlocked) {
        host.appendChild(el('div', 'exp-banner locked',
          '<div class="exp-banner-title">🔒 DESBLOQUEIA NO NÍVEL 5</div>' +
          '<div class="exp-banner-sub">Você está no nível ' + st.level + '. Suba de nível com batalhas e sync de dopamina.</div>'));
        return;
      }
      const dv = st.division || {};
      const statCard = el('div', 'exp-pvp-stats');
      statCard.innerHTML =
        '<div class="exp-pvp-stat"><span>TEMPORADA</span><b>' + esc((st.season && st.season.name) || '—') + '</b></div>' +
        '<div class="exp-pvp-stat"><span>RATING</span><b class="hl">' + st.rating + '</b></div>' +
        '<div class="exp-pvp-stat"><span>DIVISÃO</span><b class="hl">' + (dv.icon || '') + ' ' + esc(dv.name || '—') + '</b></div>' +
        '<div class="exp-pvp-stat"><span>POSIÇÃO</span><b>#' + st.rank + '</b></div>' +
        '<div class="exp-pvp-stat"><span>VITÓRIAS</span><b>' + st.wins + '</b></div>' +
        '<div class="exp-pvp-stat"><span>DERROTAS</span><b>' + st.losses + '</b></div>' +
        '<div class="exp-pvp-stat"><span>SEQUÊNCIA</span><b>' + st.streak + '</b></div>';
      host.appendChild(statCard);

      // verifica batalha ativa para retomar
      Net.pvpActive().then((d) => {
        if (d.battle && d.battle.battle_id && !d.battle.finished) {
          const resume = el('div', 'exp-banner active-battle');
          resume.innerHTML =
            '<div class="exp-banner-title">⚔️ VOCÊ TEM UMA BATALHA ATIVA</div>' +
            '<div class="exp-banner-sub">' + (d.battle.my_turn ? 'É SUA VEZ de jogar!' : 'Aguardando o oponente jogar…') + '</div>';
          const go = el('button', 'btn primary', 'ENTRAR NA BATALHA');
          go.addEventListener('click', () => {
            renderPvpMatchLive(host, {
              battle_id: d.battle.battle_id,
              state: d.battle.state,
              my_turn: d.battle.my_turn,
              opponent: { user_id: null, thiego: 'Adversário', image: null },
            });
          });
          resume.appendChild(go);
          host.insertBefore(resume, host.firstChild.nextSibling);
        }
      }).catch(() => {});

      const teamBox = el('div', 'exp-panel');
      teamBox.appendChild(el('div', 'exp-panel-title', 'SEU TIME (máx 3) — ⚡ 2 por partida'));
      const teamHost = el('div', 'exp-team-host');
      teamBox.appendChild(teamHost);
      host.appendChild(teamBox);
      renderTeamPicker(teamHost, { max: 3 });

      // toggle AUTO / MANUAL
      const autoBar = el('div', 'exp-auto-toggle');
      const autoBtn = el('button', 'exp-mode' + (!battleManual ? ' active' : ''), '<b>🤖 AUTO</b><span>resolve sozinho</span>');
      const manualBtn = el('button', 'exp-mode' + (battleManual ? ' active' : ''), '<b>🕹️ MANUAL</b><span>você escolhe cada ataque</span>');
      autoBtn.addEventListener('click', () => { battleManual = false; renderPvp(host); });
      manualBtn.addEventListener('click', () => { battleManual = true; renderPvp(host); });
      autoBar.appendChild(autoBtn);
      autoBar.appendChild(manualBtn);
      host.appendChild(autoBar);

      const fightBtn = el('button', 'btn primary exp-start', '⚔ BUSCAR OPONENTE (2 ⚡)');
      fightBtn.addEventListener('click', () => {
        if (!battleTeam.length) { toast('Escolha ao menos 1 Thiego.', 'warn'); return; }
        setBusy(fightBtn, true);
        Net.pvpMatchmake(battleTeam.slice())
          .then((d) => {
            setBusy(fightBtn, false);
            if (d.status === 'matched') {
              renderPvpMatchLive(host, d);
            } else if (d.status === 'queue') {
              renderPvpQueue(host, d.battle_id, battleTeam.slice());
            }
            E.pollState(true).catch(() => {});
          })
          .catch((e) => {
            setBusy(fightBtn, false);
            if (e && e.message === 'Oponente sem Thiegos.') { setTimeout(() => renderPvp(host), 800); return; }
            apiErr(e);
          });
      });
      host.appendChild(fightBtn);

      // ranking: toggle Batalha / Dopamina
      const lbPanel = el('div', 'exp-panel');
      lbPanel.appendChild(el('div', 'exp-panel-title', 'RANKING GLOBAL'));
      const lbToggle = el('div', 'exp-lb-toggle');
      const bBtn = el('button', 'btn small active', '⚔ BATALHA');
      const dBtn = el('button', 'btn small', '🧠 DOPAMINA');
      lbToggle.appendChild(bBtn);
      lbToggle.appendChild(dBtn);
      const lbBody = el('div');
      lbPanel.appendChild(lbToggle);
      lbPanel.appendChild(lbBody);
      host.appendChild(lbPanel);

      const loadLb = (mode, activeBtn, otherBtn) => {
        activeBtn.classList.add('active');
        otherBtn.classList.remove('active');
        Net.leaderboard(mode)
          .then((lb) => {
            if (!lb.list || !lb.list.length) { lbBody.innerHTML = '<div class="exp-empty">Sem dados ainda.</div>'; return; }
            const head = mode === 'battle'
              ? 'TOP 10 — ' + esc((lb.season || 'TEMPORADA')) + ' (rating)'
              : 'TOP 10 — DOPAMINA TOTAL';
            const rows = el('div', 'exp-lb');
            for (const r of lb.list.slice(0, 10)) {
              const row = el('div', 'exp-lb-row' + (lb.me && r.rank === lb.me.rank ? ' me' : ''));
              if (mode === 'battle') {
                row.innerHTML =
                  '<span class="exp-lb-rank">' + r.rank + 'º</span>' +
                  '<span class="exp-lb-name">' + esc(r.username) + '</span>' +
                  '<span class="exp-lb-val">' + r.value + ' <small>pts</small></span>' +
                  '<span class="exp-lb-rec">' + r.wins + 'V-' + r.losses + 'D</span>';
              } else {
                row.innerHTML =
                  '<span class="exp-lb-rank">' + r.rank + 'º</span>' +
                  '<span class="exp-lb-name">' + esc(r.username) + '</span>' +
                  '<span class="exp-lb-val">' + r.value + ' <small>log</small></span>' +
                  '<span class="exp-lb-rec">N' + (r.level || 1) + (r.prestige ? ' · ' + r.prestige + ' asc' : '') + '</span>';
              }
              rows.appendChild(row);
            }
            lbBody.innerHTML = '';
            lbBody.appendChild(el('div', 'exp-panel-sub', head));
            lbBody.appendChild(rows);
          })
          .catch(() => { lbBody.innerHTML = '<div class="exp-empty">Erro ao carregar ranking.</div>'; });
      };
      bBtn.addEventListener('click', () => loadLb('battle', bBtn, dBtn));
      dBtn.addEventListener('click', () => loadLb('dopamine', dBtn, bBtn));
      loadLb('battle', bBtn, dBtn);
    }).catch(apiErr);
  }

  function renderPvpResult(host, d) {
    buildReplay(host, d.state || {}, {
      mode: 'pvp',
      title: 'PVP RANQUEADO — <span class="hl">TEMPORADA</span>',
      finish: () => { pvpBanner(host, d); E.pollState(true).catch(() => {}); },
      onCancel: () => { battleTeam = []; renderPvp(host); },
    });
  }

  function renderPvpManualLive(host, d) {
    // reutiliza a UI de batalha manual; finalização PvP via pvpFinishManual
    renderBattleManual(host, Object.assign({}, d, {
      mode: 'pvp',
      pvp: true,
      onFinish: (battleId) => {
        return Net.pvpFinishManual(battleId).then((r) => {
          pvpBanner(host, Object.assign({}, r, { opponent: d.opponent }));
          E.pollState(true).catch(() => {});
          return r;
        });
      },
    }));
  }

  /* PvP ASSÍNCRONO: fila de matchmaking + batalha turno a turno com humanos */
  let _pvpPollTimer = 0;

  function renderPvpQueue(host, queueBattleId, teamIds) {
    host.innerHTML = '';
    host.appendChild(el('div', 'exp-head', 'PVP — <span class="hl">PROCURANDO OPONENTE</span>'));
    const box = el('div', 'exp-pvp-queue');
    box.innerHTML =
      '<div class="exp-pvp-queue-spin">⚔️</div>' +
      '<div class="exp-pvp-queue-title">Buscando adversário real…</div>' +
      '<div class="exp-pvp-queue-sub">Você está na fila. Quando outro jogador entrar, a batalha começa automaticamente.</div>';
    const cancel = el('button', 'btn ghost', 'CANCELAR BUSCA');
    cancel.addEventListener('click', () => {
      clearInterval(_pvpPollTimer);
      Net.pvpLeaveQueue().catch(() => {});
      battleTeam = [];
      renderPvp(host);
    });
    box.appendChild(cancel);
    host.appendChild(box);

    clearInterval(_pvpPollTimer);
    _pvpPollTimer = setInterval(() => {
      Net.pvpQueueStatus()
        .then((st) => {
          if (st.active && st.active.battle_id) {
            clearInterval(_pvpPollTimer);
            // busca estado completo da batalha
            return Net.pvpActive().then((d) => {
              if (d.battle && d.battle.battle_id) {
                renderPvpMatchLive(host, {
                  battle_id: d.battle.battle_id,
                  state: d.battle.state,
                  opponent: { user_id: null, thiego: 'Adversário', image: null },
                  fromActive: true,
                });
              } else {
                renderPvp(host);
              }
            });
          }
          return null;
        })
        .catch(() => {});
    }, 3000);
    void queueBattleId;
    void teamIds;
  }

  function renderPvpMatchLive(host, d) {
    host.innerHTML = '';
    const battleId = d.battle_id;
    let state = d.state || {};
    const mode = 'pvp';

    host.appendChild(el('div', 'exp-head', '⚔️ PVP — <span class="hl">BATALHA AO VIVO</span>' +
      '<span class="exp-head-sub">jogue na sua vez; o oponente é uma pessoa real</span>'));

    const arena = el('div', 'exp-arena');
    const logBox = el('div', 'exp-battle-log');

    let menu = 'main';

    const activePlayer = () => {
      const team = (state.combatants && state.combatants.player) || [];
      for (const c of team) if (c.hp > 0) return c;
      return team[0] || null;
    };
    const activeEnemy = () => {
      const team = (state.combatants && state.combatants.enemy) || [];
      for (const c of team) if (c.hp > 0) return c;
      return team[0] || null;
    };

    const logEntry = (msg, side) => {
      const e = el('div', 'exp-log-entry' + (side === 'sys' ? ' sys' : (side === 'player' ? ' me' : ' en')));
      e.textContent = msg;
      logBox.appendChild(e);
      logBox.scrollTop = logBox.scrollHeight;
    };
    const paintHP = (fighter, wrap, num) => {
      const pct = Math.max(0, Math.min(100, (fighter.hp / Math.max(1, fighter.maxhp)) * 100));
      wrap.style.width = pct + '%';
      wrap.style.background = pct > 50 ? 'var(--hp-ok,#4ade80)' : (pct > 25 ? 'var(--hp-mid,#facc15)' : 'var(--hp-low,#f87171)');
      num.textContent = fighter.hp + '/' + fighter.maxhp;
    };

    function buildArena() {
      const me = activePlayer();
      const en = activeEnemy();
      arena.innerHTML = '';
      const scene = el('div', 'exp-arena-scene');
      const top = el('div', 'exp-arena-top');
      const enPanel = el('div', 'exp-poke-panel');
      if (en) {
        enPanel.innerHTML = '<div class="exp-poke-name">' + esc(en.name) + ' <span class="exp-poke-lvl">N' + (en.level || 1) + '</span></div>';
        const bar = el('div', 'exp-hpbar big');
        const fill = el('i');
        bar.appendChild(fill);
        const num = el('div', 'exp-hpnum');
        enPanel.appendChild(bar);
        enPanel.appendChild(num);
        paintHP(en, fill, num);
        top.appendChild(enPanel);
        const eImg = el('div', 'exp-poke-sprite enemy');
        eImg.appendChild(imgEl(en.image, 'exp-poke-img'));
        top.appendChild(eImg);
      }
      scene.appendChild(top);

      const logWrap = el('div', 'exp-arena-logwrap');
      logWrap.appendChild(logBox);
      scene.appendChild(logWrap);

      const bottom = el('div', 'exp-arena-bottom');
      const myImg = el('div', 'exp-poke-sprite me');
      if (me) {
        myImg.appendChild(imgEl(me.image, 'exp-poke-img'));
        const mePanel = el('div', 'exp-poke-panel');
        mePanel.innerHTML = '<div class="exp-poke-name">' + esc(me.name) + ' <span class="exp-poke-lvl">N' + (me.level || 1) + '</span></div>';
        const bar = el('div', 'exp-hpbar big');
        const fill = el('i');
        bar.appendChild(fill);
        const num = el('div', 'exp-hpnum');
        mePanel.appendChild(bar);
        mePanel.appendChild(num);
        paintHP(me, fill, num);
        bottom.appendChild(mePanel);
      }
      bottom.appendChild(myImg);
      scene.appendChild(bottom);
      arena.appendChild(scene);
    }

    let myTurn = d.my_turn !== undefined ? d.my_turn : true;

    function renderActions() {
      const ctl = el('div', 'exp-manual-ctl');
      const me = activePlayer();
      const en = activeEnemy();

      if (state.status !== 'active') {
        const winner = state.status;
        const box2 = el('div', 'exp-banner ' + (winner === 'player' ? 'win' : (winner === 'draw' ? 'draw' : 'lose')));
        box2.appendChild(el('div', 'exp-banner-title', winner === 'player' ? 'VITÓRIA!' : (winner === 'draw' ? 'EMPATE' : 'DERROTA')));
        const bts = el('div', 'exp-battle-btns');
        const again = el('button', 'btn primary', '⚔ OUTRA PARTIDA');
        again.addEventListener('click', () => { battleTeam = []; renderPvp(host); });
        bts.appendChild(again);
        box2.appendChild(bts);
        arena.innerHTML = '';
        arena.appendChild(box2);
        return;
      }

      const turnLbl = el('div', 'exp-manual-prompt',
        myTurn ? '▶ SUA VEZ — escolha uma ação:' : '⏳ Aguardando o oponente jogar…');
      ctl.appendChild(turnLbl);

      if (!myTurn) {
        // poll para ver se o oponente já jogou
        setTimeout(() => {
          Net.pvpState(battleId).then((r) => {
            state = r.state || state;
            myTurn = !!r.my_turn;
            const oldLen = logBox.children.length;
            const trail = state.hp_trail || [];
            // loga novas entradas apenas se o estado cresceu
            // (re-render simples: redesenha tudo a cada poll)
            renderPvpMatchLive(host, { battle_id: battleId, state: state, my_turn: myTurn });
          }).catch(() => {});
        }, 3000);
        const cur = host.querySelector('.exp-manual-ctl');
        if (cur) cur.remove();
        host.appendChild(ctl);
        return;
      }

      if (menu === 'abilities' && me) {
        const grid = el('div', 'exp-manual-grid');
        for (const slot of ['basic', 'skill1', 'skill2', 'special']) {
          const ab = (me.abilities || []).find((a) => a.slot === slot);
          if (!ab) continue;
          const cd = me.cd && me.cd[slot];
          const onCd = cd > 0;
          const b = el('button', 'btn exp-ab-btn' + (onCd ? ' disabled' : ''));
          b.innerHTML = '<b>' + esc(ab.name) + '</b><small>' + (MANUAL_AB_LABEL[slot] || slot) + (onCd ? ' · ⏳' + cd : '') + '</small>';
          if (!onCd) b.addEventListener('click', () => {
            setBusy(b, true, '…');
            Net.pvpTurn(battleId, { type: 'ability', slot: slot })
              .then((r) => { applyTurn(r); })
              .catch((e) => { setBusy(b, false); apiErr(e); });
          });
          grid.appendChild(b);
        }
        const back = el('button', 'btn ghost', '← VOLTAR');
        back.addEventListener('click', () => { menu = 'main'; renderActions(); });
        grid.appendChild(back);
        ctl.appendChild(grid);
      } else if (menu === 'switch' && me) {
        const grid = el('div', 'exp-manual-grid');
        (state.combatants && state.combatants.player || []).forEach((c, i) => {
          const isActive = c === me;
          const b = el('button', 'btn exp-ab-btn' + (c.hp <= 0 ? ' disabled' : '') + (isActive ? ' active' : ''));
          b.innerHTML = '<b>' + esc(c.name) + '</b><small>' + (c.hp > 0 ? c.hp + '/' + c.maxhp + ' HP' : 'DESMAIADO') + '</small>';
          if (c.hp > 0 && !isActive) b.addEventListener('click', () => {
            setBusy(b, true, '…');
            Net.pvpTurn(battleId, { type: 'switch', switch_idx: i })
              .then((r) => { applyTurn(r); })
              .catch((e) => { setBusy(b, false); apiErr(e); });
          });
          grid.appendChild(b);
        });
        const back = el('button', 'btn ghost', '← VOLTAR');
        back.addEventListener('click', () => { menu = 'main'; renderActions(); });
        grid.appendChild(back);
        ctl.appendChild(grid);
      } else {
        const grid = el('div', 'exp-poke-menu');
        const mk = (label, icon, fn, disabled) => {
          const b = el('button', 'btn exp-poke-menu-btn' + (disabled ? ' disabled' : ''));
          b.innerHTML = '<b>' + icon + ' ' + label + '</b>';
          if (!disabled) b.addEventListener('click', fn);
          grid.appendChild(b);
        };
        mk('ATACAR', '⚔', () => { menu = 'abilities'; renderActions(); });
        mk('TROCAR', '🔁', () => { menu = 'switch'; renderActions(); });
        mk('ITEM', '🎒', () => {
          const consumables = me && me.consumables ? Object.entries(me.consumables) : [];
          if (!consumables.length) { toast('Nenhum item de cura.', 'warn'); return; }
          const grid2 = el('div', 'exp-manual-grid');
          for (const [ik, it] of consumables) {
            const b = el('button', 'btn exp-ab-btn');
            b.innerHTML = '<b>' + esc(it.name) + '</b><small>x' + it.qty + ' · +' + Math.round(it.heal * 100) + '% HP</small>';
            b.addEventListener('click', () => {
              setBusy(b, true, '…');
              Net.pvpTurn(battleId, { type: 'item', item_key: parseInt(ik, 10) })
                .then((r) => { applyTurn(r); })
                .catch((e) => { setBusy(b, false); apiErr(e); });
            });
            grid2.appendChild(b);
          }
          const back = el('button', 'btn ghost', '← VOLTAR');
          back.addEventListener('click', () => { menu = 'main'; renderActions(); });
          grid2.appendChild(back);
          ctl.innerHTML = '';
          ctl.appendChild(grid2);
          return;
        });
        mk('FUGIR', '🏃', () => {
          Net.pvpLeaveQueue().catch(() => {});
          battleTeam = []; renderPvp(host);
        });
        ctl.appendChild(grid);
      }

      // se o aliado caiu, forçar troca
      if (!me && state.status === 'active') {
        const team = (state.combatants && state.combatants.player) || [];
        const alive = team.filter((c) => c.hp > 0);
        if (alive.length) {
          ctl.innerHTML = '';
          ctl.appendChild(el('div', 'exp-manual-prompt', 'Seu Thiego desmaiou! Escolha o próximo:'));
          const grid = el('div', 'exp-manual-grid');
          alive.forEach((c) => {
            const b = el('button', 'btn exp-ab-btn', '<b>' + esc(c.name) + '</b><small>' + c.hp + '/' + c.maxhp + ' HP</small>');
            b.addEventListener('click', () => {
              setBusy(b, true, '…');
              const idx = (state.combatants && state.combatants.player || []).indexOf(c);
              Net.pvpTurn(battleId, { type: 'switch', switch_idx: idx })
                .then((r) => { applyTurn(r); })
                .catch((e) => { setBusy(b, false); apiErr(e); });
            });
            grid.appendChild(b);
          });
          ctl.appendChild(grid);
        }
      }

      const cur = host.querySelector('.exp-manual-ctl');
      if (cur) cur.remove();
      host.appendChild(ctl);
    }

    function applyTurn(r) {
      const oldLen = (state.hp_trail || []).length;
      state = r.state || state;
      const trail = state.hp_trail || [];
      for (let i = oldLen; i < trail.length; i++) logEntry(trail[i].msg, trail[i].side);
      myTurn = !!r.my_turn;
      buildArena();
      renderActions();
      if (state.status !== 'active' && r.result) {
        Net.pvpFinishManual(battleId).then((fr) => {
          const d2 = Object.assign({}, fr, { opponent: { user_id: null, thiego: 'Adversário', image: null } });
          host.innerHTML = '';
          host.appendChild(el('div', 'exp-head', 'PVP RANQUEADO — <span class="hl">TEMPORADA</span>'));
          pvpBanner(host, d2);
          E.pollState(true).catch(() => {});
        }).catch(() => {});
      }
    }

    const t0 = (state.hp_trail || [])[0];
    if (t0) logEntry(t0.msg, t0.side);

    host.appendChild(arena);
    buildArena();
    renderActions();
  }

  function pvpBanner(host, d) {
    const won = d.winner === 'player';
    const draw = d.winner === 'draw';
    const delta = d.rating_change || 0;
    const box = el('div', 'exp-banner ' + (won ? 'win' : (draw ? 'draw' : 'lose')));
    const opp = d.opponent || {};
    const parts = [];
    if (d.coins > 0) parts.push('+' + d.coins + ' coins');
    if (d.xp > 0) parts.push('+' + d.xp + ' XP');
    box.innerHTML =
      '<div class="exp-banner-title">' + (won ? 'VITÓRIA!' : (draw ? 'EMPATE' : 'DERROTA')) + ' <span class="exp-delta ' + (delta >= 0 ? 'up' : 'down') + '">' +
      (delta >= 0 ? '+' : '') + delta + ' RATING</span></div>' +
      '<div class="exp-banner-sub">Adversário: ' + esc((opp.thiego || '???') + ' (rating ' + (opp.rating || '?') + ')') +
      (parts.length ? ' — ' + parts.join(' · ') : '') + '</div>' +
      '<div class="exp-banner-sub muted">Novo rating: <b>' + d.rating + '</b> · Divisão: ' + ((d.division || {}).icon || '') + ' ' + esc((d.division || {}).name || '—') + '</div>';
    const btns = el('div', 'exp-battle-btns');
    const again = el('button', 'btn primary', '⚔ OUTRA PARTIDA');
    again.addEventListener('click', () => { battleTeam = []; renderPvp(host); });
    btns.appendChild(again);
    box.appendChild(btns);
    host.insertBefore(box, host.firstChild);
  }

  /* ============================================================
     LOOT
     ============================================================ */
  function renderLoot(host) {
    host.innerHTML = '';
    host.appendChild(el('div', 'exp-head', 'LOOT — <span class="hl">CAIXAS</span>' +
      '<span class="exp-head-sub">cada abertura dá dopamina extra; pity garante raridade alta</span>'));

    const coinsLine = el('div', 'exp-summary');
    host.appendChild(coinsLine);

    cached('boxes', 20000, () => Net.boxes())
      .then((d) => {
        coinsLine.innerHTML = 'Saldo: <b class="hl">' + money(d.coins) + '</b> battle coins';
        const grid = el('div', 'exp-grid loot');
        for (const b of d.boxes) {
          const card = el('div', 'exp-card box' + (b.locked ? ' locked' : ''));
          card.style.borderColor = rarityColor(b.rarity);
          const head = el('div', 'exp-card-head');
          head.appendChild(rarityBadge(b.rarity));
          card.appendChild(head);
          const im = el('div', 'exp-card-img');
          im.appendChild(iconEl(b.icon, '', '📦'));
          card.appendChild(im);
          card.appendChild(el('div', 'exp-card-name', esc(b.name)));
          card.appendChild(el('div', 'exp-card-meta', '<span class="exp-type">' + b.cost + ' coins</span>'));
          card.appendChild(el('div', 'exp-pity', 'PITY: ' + b.pity_counter + '/' + b.pity_limit + ' → ' + esc(b.pity_guarantee)));
          if (b.locked) {
            card.appendChild(el('div', 'exp-card-unlock', '🔒 Nível ' + b.unlock_level + '+'));
          } else {
            const bt = el('button', 'btn small', 'ABRIR (' + b.cost + ')');
            bt.addEventListener('click', () => {
              setBusy(bt, true);
              Net.openBox(b.slug)
                .then((r) => {
                  setBusy(bt, false);
                  E.forceReload('boxes');
                  renderLoot(host);
                  renderLootResult(host, r);
                  E.pollState(true).catch(() => {});
                })
                .catch((e) => { setBusy(bt, false); apiErr(e); });
            });
            card.appendChild(bt);
          }
          grid.appendChild(card);
        }
        host.appendChild(grid);
      })
      .catch((e) => { host.appendChild(el('div', 'notice', 'Erro: ' + esc(e.message))); });

    Net.lootHistory().then((d) => {
      if (!d.history || !d.history.length) return;
      const panel = el('div', 'exp-panel');
      panel.appendChild(el('div', 'exp-panel-title', 'HISTÓRICO RECENTE'));
      const rows = el('div', 'exp-lb');
      for (const h of d.history.slice(0, 12)) {
        const rw = h.result || {};
        const rwTxt = rw.type === 'coins' ? '+' + rw.qty + ' coins' : (rw.name ? rw.name + (rw.qty > 1 ? ' x' + rw.qty : '') : (rw.slug || '?'));
        const row = el('div', 'exp-lb-row');
        row.innerHTML =
          '<span class="exp-lb-name"><i class="exp-hist-dot" style="background:' + rarityColor(h.rarity) + '"></i>' +
          esc(rwTxt) + '</span>' +
          '<span class="exp-lb-rec">' + esc(h.box || '') + '</span>' +
          '<span class="exp-lb-val">' + esc(fmtDate(h.created_at)) + '</span>';
        rows.appendChild(row);
      }
      panel.appendChild(rows);
      host.appendChild(panel);
    }).catch(() => {});
  }

  function renderLootResult(host, r) {
    const rw = r.reward || {};
    const isCoin = rw.type === 'coins';
    const rwTxt = rw.name || rw.slug || (isCoin ? '+' + rw.qty + ' coins' : '???');
    const box = el('div', 'exp-banner loot-open');
    box.style.borderColor = rarityColor(r.rarity);
    const title = el('div', 'exp-banner-title');
    title.appendChild(document.createTextNode(rwTxt));
    if (rw.qty > 1 && rw.name) title.appendChild(document.createTextNode(' x' + rw.qty));
    if (r.forced) title.appendChild(el('span', 'exp-forced', 'PITY!'));
    box.appendChild(title);
    box.appendChild(el('div', 'exp-banner-sub', 'Raridade: ' + esc(r.rarity) + ' · pity ' + r.pity_counter + '/' + r.pity_limit));
    if (!isCoin && rw.icon) {
      const imw = el('div', 'exp-banner-img');
      imw.appendChild(iconEl(rw.icon, '', '🎁'));
      box.appendChild(imw);
    }
    host.insertBefore(box, host.firstChild);
  }

  /* ============================================================
     INVENTÁRIO
     ============================================================ */
  let invView = 'items';
  let invCat = 'all';
  let invRar = 'all';
  let invSort = 'rarity';

  function renderInventory(host) {
    host.innerHTML = '';
    host.appendChild(el('div', 'exp-head', 'INVENTÁRIO — <span class="hl">ITENS</span>'));

    const bar = el('div', 'exp-filters');
    bar.innerHTML = '<button class="exp-fbtn' + (invView === 'items' ? ' active' : '') + '" data-v="items">ITENS</button>' +
      '<button class="exp-fbtn' + (invView === 'equip' ? ' active' : '') + '" data-v="equip">EQUIPADOS</button>';
    bar.querySelectorAll('.exp-fbtn').forEach((b) => b.addEventListener('click', () => {
      invView = b.dataset.v;
      renderInventory(host);
    }));
    host.appendChild(bar);

    Net.inventory().then((d) => {
      if (invView === 'equip') {
        const eq = d.equipment || [];
        if (!eq.length) {
          host.appendChild(el('div', 'exp-empty', 'Nada equipado. Equipe itens pela aba THIEGOS → EQUIPAR.'));
          return;
        }
        const grid = el('div', 'exp-grid inv');
        for (const e of eq) {
          const card = el('div', 'exp-card eq');
          card.style.borderColor = rarityColor(e.rarity);
          const im = el('div', 'exp-card-img');
          im.appendChild(iconEl(e.icon, '', '🗡️'));
          card.appendChild(im);
          card.appendChild(el('div', 'exp-card-name', esc(e.name)));
          card.appendChild(el('div', 'exp-card-meta',
            '<span class="exp-type">' + (SLOTS[e.slot] || e.slot) + ' +' + e.eq_level + '</span>' +
            '<span class="exp-role">' + esc(e.thiego_name) + '</span>'));
          const stats = JSON.parse(e.stats || '{}');
          card.appendChild(statRow(stats));
          const btns = el('div', 'exp-card-btns');
          const up = el('button', 'btn small', e.eq_level >= 20 ? 'MÁXIMO' : 'MELHORAR (' + money(30 + e.eq_level * 40) + ')');
          up.disabled = e.eq_level >= 20;
          up.addEventListener('click', () => {
            setBusy(up, true);
            Net.upgradeEquip(e.equipment_id)
              .then((r) => {
                setBusy(up, false);
                toast(e.name + ' agora é nível ' + r.level + '!', 'gold');
                renderInventory(host);
                E.hydrateHud();
              })
              .catch((err) => { setBusy(up, false); apiErr(err); });
          });
          const rm = el('button', 'btn small ghost', 'REMOVER');
          rm.addEventListener('click', () => {
            Net.unequip(e.equipment_id)
              .then(() => {
                toast('Removido: ' + e.name, 'info');
                renderInventory(host);
              })
              .catch(apiErr);
          });
          const ds = el('button', 'btn small ghost', 'DESMONTAR');
          ds.addEventListener('click', () => {
            Net.disassemble(e.equipment_id)
              .then((r) => {
                toast('Desmontado: +' + r.fragments + ' fragmentos', 'info');
                renderInventory(host);
              })
              .catch(apiErr);
          });
          btns.appendChild(up);
          btns.appendChild(rm);
          btns.appendChild(ds);
          card.appendChild(btns);
          grid.appendChild(card);
        }
        host.appendChild(grid);
      } else {
        const items = (d.items || []).filter((i) => i.qty > 0);
        if (!items.length) {
          host.appendChild(el('div', 'exp-empty', 'Inventário vazio. Abra caixas na aba LOOT.'));
          return;
        }
        const fbar = el('div', 'exp-filters');
        const catOpts = '<option value="all">CATEGORIA</option>' + Object.keys(CATS)
          .map((c) => '<option value="' + c + '"' + (invCat === c ? ' selected' : '') + '>' + CATS[c] + '</option>').join('');
        const rarOpts = '<option value="all">RARIDADE</option>' + RARITY_ORDER
          .map((r) => '<option value="' + r + '"' + (invRar === r ? ' selected' : '') + '>' + r.toUpperCase() + '</option>').join('');
        const sortOpts =
          '<option value="rarity"' + (invSort === 'rarity' ? ' selected' : '') + '>RARIDADE ↓</option>' +
          '<option value="value"' + (invSort === 'value' ? ' selected' : '') + '>VALOR ↓</option>' +
          '<option value="name"' + (invSort === 'name' ? ' selected' : '') + '>NOME A→Z</option>';
        fbar.innerHTML =
          '<select class="exp-fsel" data-f="cat">' + catOpts + '</select>' +
          '<select class="exp-fsel" data-f="rar">' + rarOpts + '</select>' +
          '<select class="exp-fsel" data-f="sort">' + sortOpts + '</select>';
        fbar.querySelectorAll('select').forEach((s) => s.addEventListener('change', () => {
          const f = s.dataset.f;
          if (f === 'cat') invCat = s.value;
          if (f === 'rar') invRar = s.value;
          if (f === 'sort') invSort = s.value;
          renderInventory(host);
        }));
        host.appendChild(fbar);
        let list = items;
        if (invCat !== 'all') list = list.filter((i) => i.category === invCat);
        if (invRar !== 'all') list = list.filter((i) => i.rarity === invRar);
        const ri = (r) => RARITY_ORDER.indexOf(r);
        list = list.slice().sort((a, b) => {
          if (invSort === 'value') return (b.sell_value || 0) - (a.sell_value || 0);
          if (invSort === 'name') return (a.name || '').localeCompare(b.name || '');
          return (ri(b.rarity) - ri(a.rarity)) || ((b.sell_value || 0) - (a.sell_value || 0));
        });
        const eqMap = {};
        for (const e of (d.equipment || [])) { (eqMap[e.ut_id] = eqMap[e.ut_id] || {})[e.slot] = e; }
        const grid = el('div', 'exp-grid inv');
        for (const it of list) {
          const card = el('div', 'exp-card item');
          card.style.borderColor = rarityColor(it.rarity);
          const im = el('div', 'exp-card-img');
          im.appendChild(iconEl(it.icon, '', '🎒'));
          card.appendChild(im);
          card.appendChild(el('div', 'exp-card-name', esc(it.name) + ' <span class="exp-qty">x' + it.qty + '</span>'));
          card.appendChild(el('div', 'exp-card-meta',
            '<span class="exp-type">' + (CATS[it.category] || it.category || '') + '</span>' +
            '<span class="exp-role">' + esc(it.rarity) + '</span>'));
          if (it.stats) card.appendChild(statRow(it.stats));
          if (it.effects) {
            const er = effectRow(it.effects);
            if (er) card.appendChild(er);
          }
          if (it.description) card.appendChild(el('div', 'exp-card-desc', esc(it.description)));
          const btns = el('div', 'exp-card-btns');
          if (it.category === 'weapon' || it.category === 'armor' || it.category === 'accessory') {
            const eq = el('button', 'btn small', 'EQUIPAR');
            eq.addEventListener('click', () => {
              Net.catalog().then((d) => {
                const owned = d.thiegos.filter((t) => t.owned && !t.is_boss);
                if (!owned.length) { toast('Nenhum Thiego para equipar.', 'warn'); return; }
                const body = el('div', 'exp-modal-body');
                body.appendChild(el('div', 'exp-modal-title', 'EQUIPAR ' + esc(it.name) + ' EM…'));
                const list = el('div', 'exp-eq-list');
                for (const t of owned) {
                  const row = el('div', 'exp-eq-row');
                  row.appendChild(imgEl(t.image, 'exp-eq-ic'));
                  const info = el('div', 'exp-eq-info');
                  info.appendChild(el('div', 'exp-eq-name', esc(t.name)));
                  info.appendChild(el('div', 'exp-eq-meta', 'NÍVEL ' + t.level));
                  const cur = eqMap[t.ut_id] ? eqMap[t.ut_id][it.slot] : null;
                  const cmp = el('div', 'exp-eq-cmp');
                  if (cur) {
                    const stA = it.stats || {};
                    let stB = {};
                    try { stB = JSON.parse(cur.stats || '{}'); } catch (e) { stB = {}; }
                    const keys = Array.from(new Set([...Object.keys(stA), ...Object.keys(stB)]));
                    const difs = keys.map((k) => {
                      const a = stA[k] || 0, b = stB[k] || 0;
                      const d = a - b;
                      if (d === 0) return null;
                      return '<span class="' + (d > 0 ? 'up' : 'down') + '">' + (STAT_LABEL[k] || k.toUpperCase()) + ' ' + (d > 0 ? '+' : '') + d + '</span>';
                    }).filter(Boolean);
                    cmp.innerHTML = 'SLOT (' + (SLOTS[it.slot] || it.slot) + ') — atual: <b>' + esc(cur.name) + '</b> +' + cur.eq_level +
                      (difs.length ? ' · ' + difs.join(' ') : '');
                  } else {
                    cmp.innerHTML = 'SLOT (' + (SLOTS[it.slot] || it.slot) + ') — vazio';
                  }
                  info.appendChild(cmp);
                  row.appendChild(info);
                  const bt = el('button', 'btn small', 'EQUIPAR');
                  bt.addEventListener('click', () => {
                    setBusy(bt, true);
                    Net.equip(t.ut_id, it.item_id)
                      .then((r) => {
                        toast('Equipado em ' + t.name + '!', 'gold');
                        if (window.UI && window.UI.closeModal) window.UI.closeModal();
                        renderInventory(host);
                      })
                      .catch((err) => { setBusy(bt, false); apiErr(err); });
                  });
                  row.appendChild(bt);
                  list.appendChild(row);
                }
                body.appendChild(list);
                openExpModal(body);
              }).catch(apiErr);
            });
            btns.appendChild(eq);
          }
          if (it.sell_value > 0 && it.category !== 'consumable' || (it.category === 'consumable' && it.sell_value > 0)) {
            const sl = el('button', 'btn small ghost', 'VENDER (' + money(it.sell_value) + ')');
            sl.addEventListener('click', () => {
              Net.sellItem(it.item_id, 1)
                .then((r) => {
                  toast('Vendido: +' + r.gained + ' coins', 'info');
                  renderInventory(host);
                  E.hydrateHud();
                })
                .catch(apiErr);
            });
            btns.appendChild(sl);
          }
          card.appendChild(btns);
          grid.appendChild(card);
        }
        host.appendChild(grid);
      }
    }).catch((e) => { host.appendChild(el('div', 'notice', 'Erro: ' + esc(e.message))); });
  }

  /* ============================================================
     GENEALOGIA
     ============================================================ */
  function renderGenealogy(host) {
    host.innerHTML = '';
    host.appendChild(el('div', 'exp-head', 'GENEALOGIA — <span class="hl">ÁRVORE</span>' +
      '<span class="exp-head-sub">bônus globais para farm, batalhas e coins</span>'));

    Net.genealogyTree().then((data) => {
      const p = progress();
      if (p.level < 3) {
        host.appendChild(el('div', 'exp-banner locked',
          '<div class="exp-banner-title">🔒 DESBLOQUEIA NO NÍVEL 3</div>' +
          '<div class="exp-banner-sub">Você está no nível ' + p.level + '. Ganhe pontos de genealogia subindo de nível da conta.</div>'));
        return;
      }

      const head = el('div', 'exp-summary');
      head.innerHTML = 'Pontos de genealogia: <b class="hl">' + data.genealogy_points + '</b>';
      const respec = el('button', 'btn small ghost', 'RESPEC (-50%)');
      respec.addEventListener('click', () => {
        if (!window.confirm('Respec devolve 50% dos pontos gastos. Confirmar?')) return;
        Net.genealogyRespec()
          .then((r) => {
            toast('Respec: +' + r.refund + ' pontos devolvidos.', 'gold');
            renderGenealogy(host);
          })
          .catch(apiErr);
      });
      head.appendChild(respec);
      host.appendChild(head);

      const bySlug = {};
      for (const n of data.tree) bySlug[n.slug] = n;
      const chMap = {};
      let root = null;
      for (const n of data.tree) {
        if (!n.requires) { root = n; }
        else {
          if (!chMap[n.requires]) chMap[n.requires] = [];
          chMap[n.requires].push(n);
        }
      }
      if (!root) return;

      const depMap = {};
      function calcDep(nd, dep) {
        depMap[nd.slug] = dep;
        for (const c of (chMap[nd.slug] || [])) calcDep(c, dep + 1);
      }
      calcDep(root, 0);

      const NW = 170, NH = 96, GX = 40, GY = 80;
      const posMap = {};
      let leafIdx = 0;
      function calcX(nd) {
        const kids = chMap[nd.slug] || [];
        if (!kids.length) {
          posMap[nd.slug] = { x: leafIdx * (NW + GX) + NW / 2, y: depMap[nd.slug] * (NH + GY) + NH / 2 };
          leafIdx++;
          return;
        }
        for (const c of kids) calcX(c);
        const xs = kids.map(c => posMap[c.slug].x);
        posMap[nd.slug] = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: depMap[nd.slug] * (NH + GY) + NH / 2 };
      }
      calcX(root);

      const cvsW = leafIdx * (NW + GX);
      const maxD = Math.max(...Object.values(depMap));
      const cvsH = (maxD + 1) * (NH + GY) + GY;

      const prevTip = document.querySelector('.exp-gene-tip');
      if (prevTip) prevTip.remove();
      const tip = el('div', 'exp-gene-tip');
      tip.style.display = 'none';
      document.body.appendChild(tip);
      const moveTip = (e) => {
        const pad = 12;
        let x = e.clientX + pad, y = e.clientY + pad;
        const r = tip.getBoundingClientRect();
        if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - pad;
        if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - pad;
        tip.style.left = x + 'px';
        tip.style.top = y + 'px';
      };
      const showTip = (nd, e) => {
        tip.innerHTML =
          '<div class="exp-gene-tip-name">' + esc(nd.icon || '🌱') + ' ' + esc(nd.name) + '</div>' +
          '<div class="exp-gene-tip-eff">' + E.effectText(nd) + '</div>' +
          '<div class="exp-gene-tip-lvl">' + (nd.level > 0 ? 'NÍVEL ' + nd.level + '/' + nd.max_level : 'NÃO DESBLOQUEADO') + '</div>' +
          (nd.cost != null ? '<div class="exp-gene-tip-cost">Custo: ' + nd.cost + ' pts</div>' : '') +
          (nd.requires ? '<div class="exp-gene-tip-req">Requer: ' + esc(nd.requires) + '</div>' : '');
        tip.style.display = 'block';
        moveTip(e);
      };
      const hideTip = () => { tip.style.display = 'none'; };

      let zoom = 1;
      const zoomBar = el('div', 'exp-gene-zoom');
      const zmOut = el('button', 'btn small', '−');
      const zmLbl = el('span', 'exp-gene-zoom-lbl', '100%');
      const zmIn = el('button', 'btn small', '+');
      const zmRst = el('button', 'btn small ghost', '⟲ CENTRALIZAR');
      zoomBar.append(zmOut, zmLbl, zmIn, zmRst);
      host.appendChild(zoomBar);

      const scroll = el('div', 'exp-gene-scroll');
      const world = el('div', 'exp-gene-world');
      world.style.width = cvsW + 'px';
      world.style.height = cvsH + 'px';
      const canvas = el('div', 'exp-gene-canvas');
      canvas.style.width = cvsW + 'px';
      canvas.style.height = cvsH + 'px';

      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('width', cvsW);
      svg.setAttribute('height', cvsH);
      svg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;';

      // Definições de filtro glow para SVG
      const defs = document.createElementNS(svgNS, 'defs');
      const filter = document.createElementNS(svgNS, 'filter');
      filter.setAttribute('id', 'glow');
      filter.setAttribute('x', '-50%');
      filter.setAttribute('y', '-50%');
      filter.setAttribute('width', '200%');
      filter.setAttribute('height', '200%');
      const blur = document.createElementNS(svgNS, 'feGaussianBlur');
      blur.setAttribute('stdDeviation', '3');
      blur.setAttribute('result', 'coloredBlur');
      const merge = document.createElementNS(svgNS, 'feMerge');
      const mn1 = document.createElementNS(svgNS, 'feMergeNode');
      mn1.setAttribute('in', 'coloredBlur');
      const mn2 = document.createElementNS(svgNS, 'feMergeNode');
      mn2.setAttribute('in', 'SourceGraphic');
      merge.appendChild(mn1);
      merge.appendChild(mn2);
      filter.appendChild(blur);
      filter.appendChild(merge);
      defs.appendChild(filter);
      svg.appendChild(defs);

      for (const nd of data.tree) {
        if (!nd.requires || !posMap[nd.slug] || !posMap[nd.requires]) continue;
        const pp = posMap[nd.requires], cp = posMap[nd.slug];
        const parentOwned = bySlug[nd.requires] && bySlug[nd.requires].level > 0;
        const childOwned = nd.level > 0;
        const pathEl = document.createElementNS(svgNS, 'path');
        pathEl.setAttribute('d',
          'M ' + pp.x + ' ' + (pp.y + NH / 2) +
          ' C ' + pp.x + ' ' + ((pp.y + cp.y) / 2) +
          ', ' + cp.x + ' ' + ((pp.y + cp.y) / 2) +
          ', ' + cp.x + ' ' + (cp.y - NH / 2));
        if (childOwned) {
          pathEl.setAttribute('stroke', 'rgba(0, 217, 255, .6)');
          pathEl.setAttribute('stroke-width', '2.5');
          pathEl.setAttribute('filter', 'url(#glow)');
        } else if (parentOwned) {
          pathEl.setAttribute('stroke', 'rgba(94, 255, 177, .4)');
          pathEl.setAttribute('stroke-width', '2');
        } else {
          pathEl.setAttribute('stroke', 'rgba(255, 255, 255, .08)');
          pathEl.setAttribute('stroke-width', '1.5');
        }
        pathEl.setAttribute('fill', 'none');
        svg.appendChild(pathEl);
      }
      canvas.appendChild(svg);

      for (const nd of data.tree) {
        if (!posMap[nd.slug]) continue;
        const pp = posMap[nd.slug];
        const branchColors = { familia: '#3dffa2', poder: '#ff4d6b', sabedoria: '#00d9ff', sorte: '#ffb300', transcendencia: '#a06bff', origem: '#ffd700' };
        const bColor = branchColors[nd.branch] || '#fff';
        const card = el('div', 'exp-gene-node' + (nd.level > 0 ? ' owned' : '') + (nd.locked && nd.level === 0 ? ' locked' : ''));
        if (nd.level > 0) card.style.borderColor = bColor + '80';
        card.style.cssText = 'position:absolute;left:' + (pp.x - NW / 2) + 'px;top:' + (pp.y - NH / 2) + 'px;width:' + NW + 'px;';
        card.addEventListener('mouseenter', (e) => showTip(nd, e));
        card.addEventListener('mousemove', moveTip);
        card.addEventListener('mouseleave', hideTip);
        card.innerHTML =
          '<div class="exp-gene-ic">' + esc(nd.icon || '🌱') + '</div>' +
          '<div class="exp-gene-name">' + esc(nd.name) + '</div>' +
          '<div class="exp-gene-eff">' + E.effectText(nd) + '</div>' +
          '<div class="exp-gene-lvl">' + (nd.level > 0 ? 'NÍVEL ' + nd.level + '/' + nd.max_level : 'NÃO DESBLOQUEADO') + '</div>';
        const unlockable = nd.level < nd.max_level && (!nd.requires || data.tree.find((x) => x.slug === nd.requires && x.level > 0));
        if (unlockable) {
          const bt = el('button', 'btn small' + (nd.cost > 0 && data.genealogy_points < nd.cost ? ' ghost' : ''),
            nd.level > 0 ? '+1 (' + nd.cost + ' pts)' : 'DESBLOQUEAR (' + nd.cost + ' pts)');
          bt.addEventListener('click', () => {
            setBusy(bt, true);
            Net.genealogyUnlock(nd.slug)
              .then(() => {
                setBusy(bt, false);
                toast(nd.name + ' nível ' + (nd.level + 1) + '!', 'gold');
                renderGenealogy(host);
              })
              .catch((e) => { setBusy(bt, false); apiErr(e); });
          });
          card.appendChild(bt);
        } else if (nd.level === 0 && nd.requires) {
          card.appendChild(el('div', 'exp-gene-req', '🔒 ' + esc(nd.requires)));
        }
        canvas.appendChild(card);
      }

      world.appendChild(canvas);
      scroll.appendChild(world);
      host.appendChild(scroll);

      function applyZoom() {
        canvas.style.transform = 'scale(' + zoom + ')';
        world.style.width = cvsW * zoom + 'px';
        world.style.height = cvsH * zoom + 'px';
        zmLbl.textContent = Math.round(zoom * 100) + '%';
      }
      applyZoom();

      function centerRoot() {
        const vw = scroll.clientWidth, vh = scroll.clientHeight;
        scroll.scrollLeft = posMap[root.slug].x * zoom - vw / 2;
        scroll.scrollTop = posMap[root.slug].y * zoom - vh / 2;
      }
      setTimeout(centerRoot, 60);

      zmIn.addEventListener('click', () => { zoom = Math.min(2, zoom * 1.2); applyZoom(); centerRoot(); });
      zmOut.addEventListener('click', () => { zoom = Math.max(0.3, zoom / 1.2); applyZoom(); centerRoot(); });
      zmRst.addEventListener('click', () => { zoom = 1; applyZoom(); centerRoot(); });

      scroll.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = scroll.getBoundingClientRect();
        const mx = e.clientX - rect.left + scroll.scrollLeft;
        const my = e.clientY - rect.top + scroll.scrollTop;
        const oldZ = zoom;
        if (e.deltaY < 0) zoom = Math.min(2, zoom * 1.1);
        else zoom = Math.max(0.3, zoom / 1.1);
        applyZoom();
        scroll.scrollLeft = mx * (zoom / oldZ) - (e.clientX - rect.left);
        scroll.scrollTop = my * (zoom / oldZ) - (e.clientY - rect.top);
      }, { passive: false });

      let panning = false, sx = 0, sy = 0, sl = 0, st = 0;
      scroll.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.btn')) return;
        panning = true; sx = e.clientX; sy = e.clientY; sl = scroll.scrollLeft; st = scroll.scrollTop;
        scroll.classList.add('panning');
        scroll.setPointerCapture(e.pointerId);
      });
      scroll.addEventListener('pointermove', (e) => {
        if (!panning) return;
        scroll.scrollLeft = sl - (e.clientX - sx);
        scroll.scrollTop = st - (e.clientY - sy);
      });
      const endPan = () => { panning = false; scroll.classList.remove('panning'); };
      scroll.addEventListener('pointerup', endPan);
      scroll.addEventListener('pointercancel', endPan);
    }).catch(apiErr);
  }

  E.effectText = function (n) {
    const v = Math.round((n.effect_value || 0) * 100);
    switch (n.effect_type) {
      case 'farm_pct': return '+' + v + '% farm por nível';
      case 'coin_pct': return '+' + v + '% coins por nível';
      case 'xp_pct': return '+' + v + '% XP por nível';
      case 'hp_pct': return '+' + v + '% HP dos Thiegos por nível';
      case 'atk_pct': return '+' + v + '% ATQ dos Thiegos por nível';
      case 'def_pct': return '+' + v + '% DEF dos Thiegos por nível';
      case 'crit_pct': return '+' + v + '% CRIT dos Thiegos por nível';
      default: return (n.effect_type || '') + ' ' + v + '%';
    }
  };

  /* ============================================================
     SOCIAL — amizade + party
     ============================================================ */
  function renderSocial(host) {
    host.innerHTML = '';
    host.appendChild(el('div', 'exp-head', 'SOCIAL — <span class="hl">AMIGOS &amp; PARTY</span>' +
      '<span class="exp-head-sub">adicione amigos, crie uma party e jogue junto</span>'));

    const root = el('div', 'exp-social');

    // ---- amizades ----
    const friendsCard = el('div', 'exp-panel');
    friendsCard.appendChild(el('div', 'exp-panel-title', '👥 AMIGOS'));
    const fBody = el('div', 'exp-social-body');
    friendsCard.appendChild(fBody);
    root.appendChild(friendsCard);

    // adicionar amigo
    const addRow = el('div', 'exp-social-add');
    const addInput = el('input', 'imp-box', null);
    addInput.placeholder = 'username ou email';
    const addBtn = el('button', 'btn primary small', 'ADICIONAR');
    addBtn.addEventListener('click', () => {
      const id = addInput.value.trim();
      if (!id) { toast('Digite um nome.', 'warn'); return; }
      setBusy(addBtn, true, '…');
      Net.friendAdd(id)
        .then((r) => { setBusy(addBtn, false); addInput.value = ''; toast(r.status === 'accepted' ? 'Amizade aceita!' : 'Pedido enviado!', 'gold'); loadSocial(); })
        .catch((e) => { setBusy(addBtn, false); apiErr(e); });
    });
    addRow.appendChild(addInput);
    addRow.appendChild(addBtn);
    fBody.appendChild(addRow);

    const invitesWrap = el('div', 'exp-social-section');
    fBody.appendChild(invitesWrap);
    const friendsWrap = el('div', 'exp-social-section');
    fBody.appendChild(friendsWrap);
    const sentWrap = el('div', 'exp-social-section');
    fBody.appendChild(sentWrap);

    // ---- party ----
    const partyCard = el('div', 'exp-panel');
    partyCard.appendChild(el('div', 'exp-panel-title', '⚔️ PARTY'));
    const pBody = el('div', 'exp-social-body');
    partyCard.appendChild(pBody);
    root.appendChild(partyCard);

    const partyNoParty = el('div', 'exp-social-section');
    pBody.appendChild(partyNoParty);
    const partyDetail = el('div', 'exp-social-section');
    pBody.appendChild(partyDetail);

    host.appendChild(root);

    function renderFriends(data) {
      // convites recebidos
      invitesWrap.innerHTML = '<div class="exp-social-sec-title">CONVITES RECEBIDOS</div>';
      const inv = data.invites || [];
      if (!inv.length) invitesWrap.appendChild(el('div', 'exp-social-empty', 'nenhum convite.'));
      for (const i of inv) {
        const row = el('div', 'exp-social-row');
        row.appendChild(el('div', 'exp-social-name', esc(i.username) + (i.admin ? ' <span class="rank-admin">🛡️ ADMIN</span>' : '')));
        const ok = el('button', 'btn small', '✓ ACEITAR');
        ok.addEventListener('click', () => { Net.friendAccept(i.id).then(() => loadSocial()).catch(apiErr); });
        const no = el('button', 'btn small ghost', '✕');
        no.addEventListener('click', () => { Net.friendDecline(i.id).then(() => loadSocial()).catch(apiErr); });
        const b = el('div', 'exp-social-btns');
        b.appendChild(ok);
        b.appendChild(no);
        row.appendChild(b);
        invitesWrap.appendChild(row);
      }

      // amigos
      friendsWrap.innerHTML = '<div class="exp-social-sec-title">SEUS AMIGOS</div>';
      const fr = data.friends || [];
      if (!fr.length) friendsWrap.appendChild(el('div', 'exp-social-empty', 'nenhum amigo ainda. adicione alguém!'));
      for (const f of fr) {
        const row = el('div', 'exp-social-row');
        row.appendChild(el('div', 'exp-social-name', esc(f.username) + (f.admin ? ' <span class="rank-admin">🛡️ ADMIN</span>' : '')));
        const rm = el('button', 'btn small ghost', 'REMOVER');
        rm.addEventListener('click', () => { Net.friendRemove(f.id).then(() => loadSocial()).catch(apiErr); });
        const b = el('div', 'exp-social-btns');
        b.appendChild(rm);
        row.appendChild(b);
        friendsWrap.appendChild(row);
      }

      // pedidos enviados
      sentWrap.innerHTML = '<div class="exp-social-sec-title">PEDIDOS ENVIADOS</div>';
      const sn = data.sent || [];
      if (!sn.length) sentWrap.appendChild(el('div', 'exp-social-empty', 'nenhum pedido pendente.'));
      for (const s of sn) {
        const row = el('div', 'exp-social-row');
        row.appendChild(el('div', 'exp-social-name', esc(s.username) + ' <span class="exp-social-pending">aguardando…</span>'));
        const rm = el('button', 'btn small ghost', '✕');
        rm.addEventListener('click', () => { Net.friendRemove(s.id).then(() => loadSocial()).catch(apiErr); });
        const b = el('div', 'exp-social-btns');
        b.appendChild(rm);
        row.appendChild(b);
        sentWrap.appendChild(row);
      }
    }

    function renderParty(data) {
      const party = data.party;
      if (!party) {
        partyNoParty.style.display = '';
        partyDetail.style.display = 'none';
        partyNoParty.innerHTML = '<div class="exp-social-sec-title">VOCÊ NÃO ESTÁ NUMA PARTY</div>';
        // criar
        const createRow = el('div', 'exp-social-add');
        const nameIn = el('input', 'imp-box', null);
        nameIn.placeholder = 'nome da party (opcional)';
        const createBtn = el('button', 'btn primary small', 'CRIAR PARTY');
        createBtn.addEventListener('click', () => {
          setBusy(createBtn, true, '…');
          Net.partyCreate(nameIn.value.trim() || 'Party')
            .then(() => { setBusy(createBtn, false); toast('Party criada!', 'gold'); loadSocial(); })
            .catch((e) => { setBusy(createBtn, false); apiErr(e); });
        });
        createRow.appendChild(nameIn);
        createRow.appendChild(createBtn);
        partyNoParty.appendChild(createRow);
        // entrar por código
        const joinRow = el('div', 'exp-social-add');
        const codeIn = el('input', 'imp-box', null);
        codeIn.placeholder = 'código da party (ex: A1B2C3D4)';
        const joinBtn = el('button', 'btn small', 'ENTRAR');
        joinBtn.addEventListener('click', () => {
          setBusy(joinBtn, true, '…');
          Net.partyJoin(codeIn.value.trim())
            .then(() => { setBusy(joinBtn, false); toast('Você entrou na party!', 'gold'); loadSocial(); })
            .catch((e) => { setBusy(joinBtn, false); apiErr(e); });
        });
        joinRow.appendChild(codeIn);
        joinRow.appendChild(joinBtn);
        partyNoParty.appendChild(joinRow);
        return;
      }

      partyNoParty.style.display = 'none';
      partyDetail.style.display = '';
      partyDetail.innerHTML = '';
      const head = el('div', 'exp-social-sec-title', 'PARTY: ' + esc(party.name) + ' <span class="exp-party-code">CÓDIGO: <b>' + esc(party.code) + '</b></span>');
      partyDetail.appendChild(head);
      const sub = el('div', 'exp-social-empty', 'Compartilhe o código para seus amigos entrarem.');
      partyDetail.appendChild(sub);
      const members = el('div', 'exp-party-members');
      for (const m of party.members) {
        const row = el('div', 'exp-social-row');
        const label = esc(m.username) + (m.admin ? ' <span class="rank-admin">🛡️ ADMIN</span>' : '') +
          (m.is_leader ? ' <span class="exp-party-leader">👑 LÍDER</span>' : '');
        row.appendChild(el('div', 'exp-social-name', label));
        const isMe = m.user_id === (window.TDFNet.user && window.TDFNet.user.id);
        const isLeader = party.leader_id === (window.TDFNet.user && window.TDFNet.user.id);
        const btns = el('div', 'exp-social-btns');
        if (!isMe && isLeader) {
          const kick = el('button', 'btn small ghost', 'EXPULSAR');
          kick.addEventListener('click', () => { Net.partyKick(m.user_id).then(() => loadSocial()).catch(apiErr); });
          btns.appendChild(kick);
        }
        row.appendChild(btns);
        members.appendChild(row);
      }
      partyDetail.appendChild(members);
      const actions = el('div', 'exp-social-btns');
      if (party.leader_id === (window.TDFNet.user && window.TDFNet.user.id)) {
        const dis = el('button', 'btn small ghost', 'DISSOLVER PARTY');
        dis.addEventListener('click', () => { if (confirm('Dissolver a party?')) Net.partyDisband().then(() => loadSocial()).catch(apiErr); });
        actions.appendChild(dis);
      }
      const leave = el('button', 'btn small ghost', 'SAIR DA PARTY');
      leave.addEventListener('click', () => { Net.partyLeave().then(() => loadSocial()).catch(apiErr); });
      actions.appendChild(leave);
      partyDetail.appendChild(actions);
    }

    function loadSocial() {
      Net.socialStatus()
        .then((d) => { renderFriends(d); renderParty(d); })
        .catch(apiErr);
    }
    loadSocial();
  }

  /* ============================================================
     MODAL
     ============================================================ */
  function openExpModal(body) {
    if (window.UI && window.UI.closeModal) window.UI.closeModal();
    const m = el('div', 'ui-modal');
    m.id = 'ui-modal';
    const box = el('div', 'modal-box');
    box.appendChild(body);
    m.appendChild(box);
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
    setTimeout(() => m.classList.add('in'), 10);
  }

  /* ============================================================
     BOOT — chamado pelo main.js
     ============================================================ */
  E.boot = function () {
    E.buildHud();
    E.restore().catch(() => { E.booted = true; });
  };
})();

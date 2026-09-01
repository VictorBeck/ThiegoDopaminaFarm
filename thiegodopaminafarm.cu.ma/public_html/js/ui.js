/* ============================================================
   THIEGO DOPAMINA FARM — ui.js
   Toda a interface: 11 abas, HUD, modais, toasts, overlay de
   encontros, ranking. Re-render é leve: HUD em ~10fps, demais
   listas somente quando mudam (ou ao trocar de aba).
   ============================================================ */
(function () {
  'use strict';
  const T = window.TDF;
  const N = window.Num;
  const Econ = window.Econ;
  const G = window.Game;
  const Fx = window.Fx || window.TDF?.Fx;
  const UI = window.UI = {};

  const TABS = [
    ['farm', 'FARMAR'], ['upgrades', 'UPGRADES'], ['generators', 'GERADORES'],
    ['evolutions', 'EVOLUÇÕES'], ['prestige', 'PRESTIGE'], ['transcend', 'TRANSCENDER'],
    ['brain', '🧠 CÉREBRO'],
    ['achievements', 'CONQUISTAS'],
    ['missions', 'MISSÕES'], ['ranking', 'RANKING'], ['profile', 'PERFIL'],
    ['stats', 'ESTATÍSTICAS'], ['settings', 'CONFIG'],
    ['thiegos', 'THIEGOS'], ['battle', 'BATALHA'], ['pvp', 'PVP'],
    ['loot', 'LOOT'], ['inventory', 'INVENTÁRIO'], ['genealogy', 'GENEALOGIA'], ['social', 'SOCIAL'],
    ['suggestions', 'SUGESTÕES'],
  ];

  let root, hud, content;
  let selectedTab = 'farm';
  let lastHud = {};

  /* ============================================================
     MONTAGEM
     ============================================================ */
  UI.init = function () {
    root = document.getElementById('app');
    root.innerHTML = '';
    root.appendChild(buildHeader());
    root.appendChild(buildTabs());
    root.appendChild(buildContent());
    for (const [id, label] of TABS) buildTab(id, label);
    UI.switchTab(selectedTab);
    // Initial stats panel update
    if (document.getElementById('hud-stats')) {
      try {
        const hs = document.getElementById('hud-stats');
        const s = G.s;
        if (s) {
          const totalEarnedVal = N.toF(s.totalEarned);
          const level = Math.floor(Math.log10(Math.max(1, totalEarnedVal)) / 3) + 1;
          const coinsVal = N.toF(s.dopamine);
          const energy = Math.min(10, Math.floor(s.playTime / 60));
          const ng = Math.max(0, s.transcends);
          hs.innerHTML = '<div class="hud-stat"><div class="hud-stat-label">NÍVEL</div><div class="hud-stat-value">' + level + '</div></div>' +
            '<div class="hud-stat"><div class="hud-stat-label">COINS</div><div class="hud-stat-value">' + fmtMoney(coinsVal).slice(0,6) + '</div></div>' +
            '<div class="hud-stat"><div class="hud-stat-label">⚡ ENERGIA</div><div class="hud-stat-value">' + energy + '/10</div></div>' +
            '<div class="hud-stat"><div class="hud-stat-label">NG</div><div class="hud-stat-value">' + ng + '</div></div>' +
            '<div class="hud-stat"><div class="hud-stat-label">RATING</div><div class="hud-stat-value">—</div></div>' +
            '<div class="hud-stat"><div class="hud-stat-label">LOGIN</div><div class="hud-stat-value login">—</div></div>';
        }
      } catch(e) { console.error('Initial stats error:', e.message); }
    }
  };

  function buildHeader() {
    const h = el('div', 'tdf-header');
    h.innerHTML =
      '<div class="hud-top">' +
      '  <div class="hud-money"><span class="hud-label">DOPAMINA</span>' +
      '    <div class="hud-value" id="hud-dopa">0</div><div class="hud-stats" id="hud-stats"></div>' +
      '    <div class="hud-dps-wrap" tabindex="0" role="tooltip" aria-label="detalhes da produção por segundo">' +
      '      <span class="hud-sub" id="hud-dps">0/s</span>' +
      '      <div class="tip-box" id="dps-tip" role="region" aria-label="quebra da produção"></div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="hud-topright" id="hud-topright"></div>' +
      '</div>' +
      '<div class="hud-savebar">' +
      '  <button class="btn save-now-btn" id="save-now-btn" type="button" aria-label="Salvar agora">💾 SALVAR AGORA</button>' +
      '  <span class="save-status" id="save-status" role="status">—</span>' +
      '  <button class="btn admin-mode-btn" id="admin-mode-btn" type="button" style="display:none" title="Alterna entre modo admin e modo normal">🛡️ MODO ADMIN</button>' +
      '</div>' +
      '<div class="hud-meters">' +
      '  <div class="meter-slot" id="meter-prestige"></div>' +
      '  <div class="meter-slot" id="meter-evo"></div>' +
      '  <div class="meter-slot" id="meter-combo"></div>' +
      '</div>' +
      '<div class="hud-goal" id="hud-goal" role="status"></div>';
    hud = h;
    const amBtn = h.querySelector('#admin-mode-btn');
    if (amBtn) amBtn.addEventListener('click', () => UI.toggleAdminMode());
    const wrap = h.querySelector('.hud-dps-wrap');
    const openTip = () => {
      const tip = document.getElementById('dps-tip');
      if (tip) { tip.innerHTML = dpsTooltipHTML(G.s); tip.classList.add('open'); }
    };
    const closeTip = () => {
      const tip = document.getElementById('dps-tip');
      if (tip) tip.classList.remove('open');
    };
    wrap.addEventListener('mouseenter', openTip);
    wrap.addEventListener('mouseleave', closeTip);
    wrap.addEventListener('focus', openTip);
    wrap.addEventListener('blur', closeTip);
    return h;
  }

  function buildTabs() {
    const wrap = el('div', 'tdf-tabs-wrap');
    const nav = el('nav', 'tdf-tabs nav nav-pills flex-nowrap overflow-auto pb-2');
    nav.setAttribute('role', 'tablist');
    nav.setAttribute('aria-label', 'seções do jogo');
    for (const [id, label] of TABS) {
      const b = el('button', 'nav-link tab-btn' + (id === selectedTab ? ' active' : ''));
      b.dataset.tab = id;
      b.textContent = label;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', id === selectedTab ? 'true' : 'false');
      b.addEventListener('click', () => UI.switchTab(id));
      nav.appendChild(b);
    }
    wrap.appendChild(nav);
    // Indicador de continuação: fades nas pontas + sombra quando há mais abas
    nav.addEventListener('scroll', updateTabFades, { passive: true });
    requestAnimationFrame(updateTabFades);
    return wrap;
  }

  // Fades de continuação nas pontas da barra de abas (indica que há mais)
  function updateTabFades() {
    const nav = document.querySelector('.tdf-tabs');
    if (!nav) return;
    const wrap = nav.parentElement;
    if (!wrap || !wrap.classList.contains('tdf-tabs-wrap')) return;
    const max = nav.scrollWidth - nav.clientWidth;
    const x = nav.scrollLeft;
    wrap.classList.toggle('fade-right', x < max - 4);
    wrap.classList.toggle('fade-left', x > 4);
  }
  UI.updateTabFades = updateTabFades;

  function buildContent() {
    const c = el('main', 'tdf-content');
    const view = el('div', 'tdf-view');
    view.id = 'tdf-view';
    c.appendChild(view);
    return c;
  }

  function tabEl(id) {
    const view = document.getElementById('tdf-view');
    let t = document.getElementById('tab-' + id);
    if (!t) {
      t = el('section', 'tab');
      t.id = 'tab-' + id;
      t.dataset.tab = id;
      t.setAttribute('role', 'tabpanel');
      t.setAttribute('aria-label', TABS.find((x) => x[0] === id)[1]);
      view.appendChild(t);
    }
    return t;
  }

  function buildTab(id, label) {
    const t = tabEl(id);
    switch (id) {
      case 'farm': buildFarm(t); break;
      case 'upgrades': buildUpgrades(t); break;
      case 'generators': buildGenerators(t); break;
      case 'evolutions': buildEvolutions(t); break;
      case 'prestige': buildPrestige(t); break;
      case 'transcend': buildTranscend(t); break;
      case 'achievements': buildAchievements(t); break;
      case 'missions': buildMissions(t); break;
      case 'ranking': buildRanking(t); break;
      case 'profile': buildProfile(t); break;
      case 'stats': buildStats(t); break;
      case 'settings': buildSettings(t); break;
      case 'brain': buildBrain(t); break;
      case 'suggestions': buildSuggestions(t); break;
      case 'admin': buildAdminTab(t); break;
      default:
        if (window.Expansion && window.Expansion.isExpTab(id)) window.Expansion.buildTab(id, t);
    }
  }

  UI.switchTab = function (id) {
    if (!TABS.find((t) => t[0] === id)) return;
    selectedTab = id;
    document.querySelectorAll('.tab-btn').forEach((b) => {
      const on = b.dataset.tab === id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + id));
    renderTab(id);
    // UX: trocar de aba enquanto rolado no meio da anterior deixava o
    // jogador "perdido" numa posição aleatória da nova aba.
    const act = document.getElementById('tab-' + id);
    if (act && act.getBoundingClientRect().top < 0) {
      act.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    // ranking: ao abrir a aba, busca imediatamente os status atualizados
    if (id === 'ranking' && window.Leaderboard) {
      window.Leaderboard.refresh().catch(() => {});
    }
  };
  UI.getTab = function () { return selectedTab; };

  /* ============================================================
     ADMIN: botão de modo + aba admin (só admins)
     ============================================================ */
  const ADMIN_TAB = ['admin', 'ADMIN'];
  UI.isAdmin = function () {
    const u = window.TDFNet && window.TDFNet.user;
    return !!(u && u.is_admin === 1);
  };
  UI.adminModeActive = function () {
    const u = window.TDFNet && window.TDFNet.user;
    return !!(u && u.admin_mode === 1);
  };
  // Reavalia visibilidade do botão e da aba ADMIN conforme sessão/modo.
  UI.refreshAdminUI = function () {
    const btn = document.getElementById('admin-mode-btn');
    const isAdmin = UI.isAdmin();
    const on = UI.adminModeActive();
    if (btn) {
      btn.style.display = isAdmin ? '' : 'none';
      btn.innerHTML = on ? '🛡️ MODO ADMIN ON' : '🛡️ MODO ADMIN';
      btn.classList.toggle('on', on);
    }
    // adiciona/remove a aba ADMIN dinamicamente
    const hasTab = TABS.some((t) => t[0] === 'admin');
    if (isAdmin && on && !hasTab) {
      TABS.push(ADMIN_TAB);
      const nav = document.querySelector('.tdf-tabs');
      if (nav) {
        const b = el('button', 'nav-link tab-btn', 'ADMIN');
        b.dataset.tab = 'admin';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', 'false');
        b.addEventListener('click', () => UI.switchTab('admin'));
        nav.appendChild(b);
        buildTab('admin', 'ADMIN');
      }
    } else if ((!isAdmin || !on) && hasTab) {
      const idx = TABS.findIndex((t) => t[0] === 'admin');
      if (idx >= 0) TABS.splice(idx, 1);
      const tb = document.querySelector('.tab-btn[data-tab="admin"]');
      if (tb) tb.remove();
      const te = document.getElementById('tab-admin');
      if (te) te.remove();
      if (selectedTab === 'admin') UI.switchTab('farm');
    }
  };
  // Alterna o modo admin no servidor + troca o save (separado por modo).
  UI.toggleAdminMode = function () {
    const btn = document.getElementById('admin-mode-btn');
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    window.TDFNet.adminToggleMode()
      .then((d) => {
        const on = !!d.admin_mode;
        if (window.TDFNet && window.TDFNet.user) window.TDFNet.user.admin_mode = on ? 1 : 0;
        // troca o save local (modo admin usa chave própria)
        const saveNow = window.Save;
        if (saveNow) {
          if (window.Game && window.Game.state) saveNow.save(window.Game.state);
          saveNow.setAdminSave(on);
          const st = window.Game.load();
          if (st && st._tooNew) { location.reload(); return; }
          window.Game.state = st;
          window.Game.save();
        }
        UI.refreshAdminUI();
        if (window.Expansion && window.Expansion.state) window.Expansion.state.user = window.TDFNet.user;
        UI.toast(on ? '🛡️ Modo ADMIN ativado. Seu progresso agora fica escondido do ranking e você ganhou o Admin Hub.' : 'Modo normal ativado. Você volta ao ranking normalmente.', 'gold', 4500);
        if (window.Leaderboard) window.Leaderboard.refresh().catch(() => {});
        if (window.Game && window.Game.checkAchievements) window.Game.checkAchievements(true);
        renderAllSoon();
      })
      .catch((e) => {
        if (btn) { btn.disabled = false; UI.refreshAdminUI(); }
        apiErr(e);
      })
      .finally(() => { if (btn) btn.disabled = false; });
  };

  function renderTab(id) {
    if (id === 'farm') renderFarm();
    else if (id === 'upgrades') renderUpgrades();
    else if (id === 'generators') renderGenerators();
    else if (id === 'evolutions') renderEvolutions();
    else if (id === 'prestige') renderPrestige();
    else if (id === 'transcend') renderTranscend();
    else if (id === 'brain') { if (window.renderBrain) window.renderBrain(); }
    else if (id === 'achievements') renderAchievements();
    else if (id === 'missions') renderMissions();
    else if (id === 'ranking') { UI.renderRanking(); }
    else if (id === 'profile') renderProfile();
    else if (id === 'stats') renderStats();
    else if (id === 'settings') renderSettings();
    else if (id === 'suggestions') renderSuggestions();
    else if (id === 'admin') renderAdminTab();
    else if (window.Expansion && window.Expansion.isExpTab(id)) window.Expansion.renderTab(id);
  }

  /* ============================================================
     HELPERS
     ============================================================ */
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function fmtMoney(v) {
    const st = G.s.settings;
    if (st.numStyle === 'full' && N.toF(v) < 1e15 && N.toF(v) >= 0) {
      return Math.floor(N.toF(v)).toLocaleString('pt-BR');
    }
    return N.fmt(v);
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + s + 's';
    return s + 's';
  }
  function num(v) { return N.toF(v); }
  function img(src, cls) {
    const im = document.createElement('img');
    im.className = cls || '';
    im.loading = 'lazy';
    mutateOnError(im);
    im.src = T.asset(src);
    im.alt = '';
    im.draggable = false;
    return im;
  }
  function mutateOnError(im) {
    im.addEventListener('error', () => {
      im.src = T.asset('thiego normal 2.jpeg');
    }, { once: true });
  }

  /* ============================================================
     HUD (rápido, ~10fps)
     ============================================================ */
  UI.tick = function (dt) {
    const s = G.s;
    if (!s || !hud) return;
    // throttling: atualiza HUD a ~10fps
    UI._tickA = (UI._tickA || 0) + dt;
    if (UI._tickA < 0.1) return;
    UI._tickA = 0;

    const now = Date.now();
    const dps = Econ.dps(s, G.runtime);
    const hd = document.getElementById('hud-dopa');
    const hdps = document.getElementById('hud-dps');
    if (hd && !lastHud.dopa) lastHud.dopa = '';
    const dopaStr = fmtMoney(s.dopamine);
    const dpsStr = fmtMoney(dps) + '/s';
    if (hd && hd.textContent !== dopaStr) { hd.textContent = dopaStr; }
    // (P1) números gigantes ganham fonte reduzida em vez de quebrar dígito
    if (hd) hd.classList.toggle('hud-value--long', dopaStr.length > 12);
    if (hdps && hdps.textContent !== dpsStr) { hdps.textContent = dpsStr; }
    // Stats panel: Nível, Coins, Energia, NG, Rating, Login
    const hs = document.getElementById('hud-stats');
    if (hs) {
      try {
        const totalEarnedVal = N.toF(s.totalEarned);
        const level = Math.floor(Math.log10(Math.max(1, totalEarnedVal)) / 3) + 1;
        const coinsVal = N.toF(s.dopamine);
        const energy = Math.min(10, Math.floor(s.playTime / 60));
        const ng = Math.max(0, s.transcends);
        const rating = '—';
        const login = s.lastActiveDay ? s.lastActiveDay.slice(5) : '—';
        hs.innerHTML = '<div class="hud-stat"><div class="hud-stat-label">NÍVEL</div><div class="hud-stat-value">' + level + '</div></div>' +
          '<div class="hud-stat"><div class="hud-stat-label">COINS</div><div class="hud-stat-value">' + fmtMoney(coinsVal).slice(0,6) + '</div></div>' +
          '<div class="hud-stat"><div class="hud-stat-label">⚡ ENERGIA</div><div class="hud-stat-value">' + energy + '/10</div></div>' +
          '<div class="hud-stat"><div class="hud-stat-label">NG</div><div class="hud-stat-value">' + ng + '</div></div>' +
          '<div class="hud-stat"><div class="hud-stat-label">RATING</div><div class="hud-stat-value">' + rating + '</div></div>' +
          '<div class="hud-stat"><div class="hud-stat-label">LOGIN</div><div class="hud-stat-value login">' + login + '</div></div>';
      } catch(e) {
        console.error('Stats error:', e.message);
      }
    }

    // multiplicador ativo
    const top = document.getElementById('hud-topright');
    if (top) {
      const mult = Econ.prestigeMult(s);
      const parts = [];
      if (N.gt(mult, N.one)) parts.push('ASC ' + N.fmt(mult) + '×');
      const transc = Econ.transcMult(s);
      if (N.gt(transc, N.one)) parts.push('🌟TRANS ' + N.fmt(transc) + '×');
      const evo = N.fromF(Econ.evoMult(s));
      if (N.gt(evo, N.one)) parts.push('EVO ' + N.fmt(evo) + '×');
      const gl = Econ.globalMult(s, G.runtime);
      if (N.gt(gl, N.one)) parts.push('MULT ' + N.fmt(gl) + '×');
      // buffs de top 3 do ranking (não aparecem para admins)
      if (Econ.rankDopMult > 1) parts.push('🏆 TOP3 +' + Math.round((Econ.rankDopMult - 1) * 100) + '% DOP');
      if (Econ.rankPresMult > 1) parts.push('🏆 TOP3 +' + Math.round((Econ.rankPresMult - 1) * 100) + '% PRES');
      top.innerHTML = parts.map((p) => '<span class="hud-chip">' + p + '</span>').join('');
      if (s.points > 0) top.insertAdjacentHTML('afterbegin', '<span class="hud-chip chip-points">' + s.points + ' PTS</span>');
      if (s.tPoints > 0) top.insertAdjacentHTML('afterbegin', '<span class="hud-chip chip-transc">🌟' + s.tPoints + ' T-PTS</span>');
    }

    // status do botão/status de save
    UI.touchSaveStatus();

    // imagem do Thiego acompanha a evolução atual (e re-sincroniza no prestige)
    const fi = document.getElementById('farm-img');
    if (fi) {
      const evoT = activeEvo();
      const relE = T.asset(evoT.img);
      if (fi.getAttribute('src') !== relE) { fi.src = relE; fi.classList.remove('fresh'); void fi.offsetWidth; fi.classList.add('fresh'); }
    }

    // meter prestige
    const mp = document.getElementById('meter-prestige');
    if (mp) {
      const g = num(Econ.prestigeGain(s));
      const can = Econ.canPrestige(s);
      const eta = Econ.secsToPrestige(s, G.runtime);
      if (can) {
        mp.innerHTML = '<div class="meter-label"><span class="meter-icon">⭐</span><span class="lbl-full">ASCENSÃO DISPONÍVEL</span><span class="lbl-mini">ASC</span> +' + (Math.max(1, Math.floor(g))) + ' pts</div><div class="meter-bar"><div class="meter-fill" style="width:100%"></div></div>';
        mp.classList.add('available');
      } else {
        mp.classList.remove('available');
        const need = num(Econ.prestigeNeed(s));
        const run = Math.max(1, num(s.runEarned || s.totalEarned));
        const left = Math.max(0, need - run);
        const pct = Math.min(100, Math.max(0, Math.log10(run) / Math.log10(Math.max(need, 1)) * 100));
        mp.innerHTML = '<div class="meter-label"><span class="meter-icon">⭐</span><span class="lbl-full">ASCENSÃO: falta ' + fmtMoney(left) +
          (isFinite(eta) && eta < 365 * 24 * 3600 ? ' (' + fmtTime(eta) + ')' : '') +
          ' · +' + Math.floor(g) + ' pts</span><span class="lbl-mini">ASC +' + Math.floor(g) + '</span></div>' +
          '<div class="meter-bar"><div class="meter-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="meter-progress-text">' + Math.floor(pct) + '% do próximo ponto</div>';
      }
    }

    // meter evolução
    const me = document.getElementById('meter-evo');
    if (me) {
      const next = Econ.nextTier(s);
      if (next === null) {
        me.innerHTML = '<div class="meter-label"><span class="meter-icon">🧬</span><span class="lbl-full">EVOLUÇÃO MÁXIMA</span><span class="lbl-mini">EVO MAX</span></div>';
        me.classList.remove('available');
      } else {
        const cost = Econ.evoCost(s, next);
        const have = s.dopamine;
        const pct = N.gte(have, cost) ? 100 : Math.max(0, Math.min(99, 100 * num(have) / num(cost)));
        me.innerHTML = '<div class="meter-label"><span class="meter-icon">🧬</span><span class="lbl-full">PRÓXIMA EVOLUÇÃO: ' + T.EVOLUTIONS[next].name + '</span><span class="lbl-mini">EVO: ' + T.EVOLUTIONS[next].name + '</span></div>' +
          '<div class="meter-bar"><div class="meter-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="meter-progress-text">' + fmtMoney(have) + ' / ' + fmtMoney(cost) + ' (' + Math.floor(pct) + '%)</div>';
        me.classList.toggle('available', N.gte(have, cost));
      }
    }

    // combo meter
    const mc = document.getElementById('meter-combo');
    if (mc) {
      const combo = G.runtime.combo || 0;
      const cap = Econ.comboCap(s);
      const pct = Math.min(100, 100 * combo / cap);
      const mult = Econ.comboMult(G.s, combo);
      mc.innerHTML = '<div class="meter-label"><span class="meter-icon">🔥</span><span class="lbl-full">COMBO</span><span class="lbl-mini">CMB</span> ' + combo + '×' + N.fmt(mult) + '</div>' +
        '<div class="meter-bar"><div class="meter-fill fill-combo" style="width:' + pct + '%"></div></div>';
      mc.classList.remove('available');
    }

    // tooltip de produção (só preenche quando aberto — hover ou foco)
    const dwWrap = hud && hud.querySelector('.hud-dps-wrap');
    if (dwWrap && (dwWrap.matches(':hover') || document.activeElement === dwWrap)) {
      const tip = document.getElementById('dps-tip');
      if (tip && !tip.classList.contains('open')) {
        tip.innerHTML = dpsTooltipHTML(s);
        tip.classList.add('open');
      }
    }

    // humor contextual (§53)
    const fh = document.getElementById('farm-humor');
    if (fh && G.runtime.humor) {
      if (fh.textContent !== G.runtime.humor) {
        fh.textContent = G.runtime.humor;
        fh.classList.remove('humor-fresh');
        void fh.offsetWidth;
        fh.classList.add('humor-fresh');
      }
    }

    // linha do Thiego acima do botão (evolução atual + frase)
    const ml = document.getElementById('farm-multiline');
    if (ml) {
      const ev = T.EVOLUTIONS[Math.min(s.tier, T.EVOLUTIONS.length - 1)];
      const line = ev.name + (ev.quote ? ' ' + ev.quote : '');
      if (ml.textContent !== line) ml.textContent = line;
    }

    // badges de eventos ativos
    const fa = document.getElementById('farm-active');
    if (fa) {
      const evts = G.runtime.events || [];
      const html = evts.map((e) => {
        const left = Math.max(0, Math.ceil((e.end - Date.now()) / 1000));
        return '<span class="evt-badge">' + (e.icon || '🎲') + ' ' + (e.text || e.name || 'EVENTO') + ' <i>' + fmtTime(left) + '</i></span>';
      }).join('');
      if (fa.innerHTML !== html) fa.innerHTML = html;
    }

    // próximo objetivo — só quando nada é comprável (dead zone)
    const gz = document.getElementById('hud-goal');
    if (gz) {
      const gh = nextGoalHTML();
      if (gz.innerHTML !== gh) gz.innerHTML = gh;
    }

    // amostragem do gráfico de produção
    UI._histT = (UI._histT || 0) + dt;
    if (UI._histT >= 5) {
      UI._histT = 0;
      sampleHist();
      if (selectedTab === 'stats') drawGraph();
    }
  };

  /* ---------- tooltip: quebra da produção (§50) ---------- */
  function dpsTooltipHTML(s) {
    const bd = Econ.breakdown(s, G.runtime);
    const labels = {
      base: 'Geradores', evo: 'Evolução', prestige: 'Ascensão',
      achievements: 'Conquistas', upgrades: 'Upgrades', event: 'Eventos',
    };
    let html = '<div class="tip-title">PRODUÇÃO POR SEGUNDO</div>';
    for (const k of Object.keys(bd)) {
      const isTot = k === 'total';
      const v = isTot ? fmtMoney(bd[k]) + '/s' : N.fmt(bd[k]) + '×';
      html += '<div class="tip-row' + (isTot ? ' total' : '') + '"><span>' + (labels[k] || k) + '</span><b>' + v + '</b></div>';
    }
    return html;
  }

  /* ---------- próximo objetivo (§52) ---------- */
  function nextGoalHTML() {
    const s = G.s;
    if (Econ.canPrestige(s)) return '<span class="goal-go">⚠ ASCENSÃO DISPONÍVEL — prestigie agora!</span>';
    const dps = Econ.dps(s, G.runtime);
    let best = null;
    for (const u of T.UPGRADES) {
      const lvl = s.upgrades[u.id] || 0;
      if (lvl >= (u.effect.maxLevel || 1)) continue;
      const cost = N.mul(N.fromF(u.cost), N.fromF(Econ.costRed(s)));
      if (!best || N.lt(cost, best.cost)) best = { label: 'UPGRADE: ' + u.name, cost };
    }
    for (let i = 0; i < T.GENERATORS.length; i++) {
      const cost = Econ.genCost(s, i, 1);
      if (!best || N.lt(cost, best.cost)) best = { label: 'GERADOR: ' + T.GENERATORS[i].name, cost };
    }
    if (!best) return '<span>EVOLUÇÃO MÁXIMA — só resta ascender… ou dormir.</span>';
    if (N.gte(s.dopamine, best.cost)) return ''; // algo comprável: a própria loja guia
    const rem = N.sub(best.cost, s.dopamine);
    let eta = null;
    if (dps.m > 0) {
      const t = N.toF(N.div(rem, dps));
      if (isFinite(t) && t > 0 && t < 3.6e6) eta = fmtTime(t);
    }
    return '<span>PRÓXIMO: ' + best.label + ' — falta ' + fmtMoney(rem) +
      (eta ? ' (~' + eta + ')' : '') + '</span>';
  }

  /* ---------- gráfico de produção (§33) ---------- */
  function sampleHist() {
    const s = G.s;
    const dps = Econ.dps(s, G.runtime);
    const hist = G.runtime.hist;
    if (!hist) return;
    hist.push({
      t: Date.now(),
      d: dps.m === 0 ? 0 : N.log10(dps),
      m: s.dopamine.m === 0 ? 0 : N.log10(s.dopamine),
    });
    if (hist.length > 60) hist.shift();
  }

  function drawGraph() {
    const cv = document.getElementById('prod-graph');
    if (!cv) return;
    const hist = G.runtime.hist || [];
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const pad = 6;
    if (hist.length < 2) {
      ctx.fillStyle = '#9b8ab8';
      ctx.font = '11px Segoe UI';
      ctx.textAlign = 'center';
      ctx.fillText('coletando histórico de produção…', w / 2, h / 2);
      return;
    }
    const plot = (key) => {
      const vals = hist.map((p) => p[key]);
      let lo = Math.min.apply(null, vals);
      let hi = Math.max.apply(null, vals);
      if (!isFinite(lo)) lo = 0;
      if (!isFinite(hi) || hi <= lo) hi = lo + 1;
      ctx.beginPath();
      hist.forEach((p, i) => {
        const x = pad + (i / (hist.length - 1)) * (w - 2 * pad);
        const y = h - pad - ((p[key] - lo) / (hi - lo)) * (h - 2 * pad);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = key === 'm' ? '#ffd700' : '#5effb1';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke();
    };
    plot('m');
    plot('d');
    ctx.fillStyle = '#9b8ab8';
    ctx.font = '10px Segoe UI';
    ctx.textAlign = 'left';
    ctx.fillText('DOPAMINA', pad + 2, 12);
    ctx.fillStyle = '#5effb1';
    ctx.fillText('DPS (log10)', pad + 72, 12);
  }

  /* ============================================================
     ABA FARM
     ============================================================ */
  function buildFarm(t) {
    const evo = activeEvo();
    t.innerHTML =
      '<div class="farm-wrap d-flex flex-column align-items-center gap-3 pt-2">' +
      '  <div class="farm-multiline text-center fw-bold small" id="farm-multiline"></div>' +
      '  <button class="farm-thiego" id="farm-btn" aria-label="Clique no Thiego">' +
      '    <img id="farm-img" src="' + T.asset(evo.img) + '" alt="Thiego" class="rounded">' +
      '    <div class="farm-title" id="farm-title"></div>' +
      '  </button>' +
      '  <div class="farm-info d-flex flex-wrap gap-2 justify-content-center" id="farm-info"></div>' +
      '  <div class="farm-humor text-muted text-center fst-italic" id="farm-humor" aria-live="polite"></div>' +
      '  <div class="farm-active d-flex flex-wrap gap-2 justify-content-center" id="farm-active"></div>' +
      '</div>';
    // FX overlay for juice float numbers
    const overlay = document.createElement("div");
    overlay.id = "fx-overlay";
    overlay.style.position = "absolute";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "100";
    t.appendChild(overlay);
    const btn = t.querySelector('#farm-btn');
    btn.classList.add('idle-beat'); // CC-lesson: botão principal respira
    btn.addEventListener('pointerdown', (e) => onFarmPointer(e));
    t.querySelector('#farm-img').addEventListener('error', () => {
      t.querySelector('#farm-img').src = T.asset('thiego normal 2.jpeg');
    });
  }

  function activeEvo() {
    const s = G.s;
    return T.EVOLUTIONS[Math.max(0, Math.min(s.tier, T.EVOLUTIONS.length - 1))];
  }

  function onFarmPointer(e) {
    if (!G.s) return;
    const r = G.click();
    if (!r) return;
    const btn = document.getElementById('farm-btn');
    const rect = btn.getBoundingClientRect();
    const x = e.clientX, y = e.clientY;
    const combo = Math.max(1, G.runtime.combo || 1);
    const gainStr = fmtMoney(r.gain);
    Fx.float(x, y - 10, gainStr, {
      size: r.crit ? 30 : 20,
      color: r.crit ? '#ff8c42' : '#ffd700',
      crit: r.crit, life: 0.9,
    });
    // ---- feedback escalando com o combo (lição CC: cada clique tem peso) ----
    // intensidade cresce com o combo, com teto para não virar poluição visual
    const heat = Math.min(1, combo / 40);                     // 0 → 1
    if (r.crit) {
      Fx.burst(x, y, { count: 22 + Math.round(14 * heat), color: '#ff8c42', speed: 260 + 120 * heat, life: 0.6, shape: 'spark' });
      Fx.burst(x, y, { count: 10, color: '#ffd700', speed: 170, life: 0.85, shape: 'circle', gravity: 320 });
      Fx.ring(x, y, { r1: 80 + 60 * heat, color: 'rgba(255,140,66,.9)', width: 5, life: 0.5 });
      Fx.shake(2.5 + 3 * heat);
      window.AudioFX.sfx.crit();
    } else {
      Fx.burst(x, y, {
        count: Math.round(6 + 10 * heat),
        color: heat > 0.6 ? '#ffe066' : '#ffd700',
        speed: 160 + 100 * heat, life: 0.55, shape: 'spark',
      });
      window.AudioFX.sfx.click();
    }
    // marco de combo a cada 25 cliques seguidos
    if (combo >= 25 && combo % 25 === 0) {
      Fx.float(x, y - 46, 'COMBO ×' + combo, { size: 16 + Math.min(10, combo / 50), color: '#c86bff', life: 1.2 });
      Fx.ring(x, y, { r1: 130, color: 'rgba(200,107,255,.8)', width: 4, life: 0.55 });
    }
    G.checkAchievements();
    // escala visual: squish no pointerdown + LIBERAÇÃO após 130ms.
    // (Antes: remove+re-add no mesmo frame = :pressed nunca saía e o
    //  botão ficava preso em scale(.97) para sempre.)
    btn.classList.add('pressed');
    clearTimeout(btn._squishT);
    btn._squishT = setTimeout(() => btn.classList.remove('pressed'), 130);
    // ripple: anel que nasce debaixo do dedo/cursor
    spawnRipple(btn, x - rect.left, y - rect.top, r.crit);
  }

  // ripple dentro do botão (não usa canvas: fica clipado pelo border-radius)
  function spawnRipple(btn, lx, ly, crit) {
    const FXr = window.Fx;
    if (!FXr || !FXr.isEnabled || !FXr.isEnabled()) return;
    const el = document.createElement('span');
    el.className = 'farm-ripple' + (crit ? ' crit' : '');
    el.style.left = lx + 'px';
    el.style.top = ly + 'px';
    btn.appendChild(el);
    setTimeout(() => el.remove(), 550);
  }

  /* ============================================================
     THIEGO DOURADO FLUTUANTE (lição CC: golden cookie)
     Atravessa a tela; clicar = dopamina instantânea + buff.
     ============================================================ */
  UI.spawnGolden = function () {
    const el = document.createElement('button');
    el.className = 'golden-float';
    el.setAttribute('aria-label', 'THIEGO DOURADO! Clique rápido!');
    el.innerHTML =
      '<img src="' + T.asset('thiego do sorriso safado.jpeg') + '" alt="Thiego Dourado">' +
      '<span class="gf-label">🤑 CLICA!</span>';
    const dur = 11000;
    const y = 12 + Math.random() * 55;         // % da altura
    const wob = (Math.random() * 24 - 12);      // oscilação vertical em vh
    el.style.top = y + 'vh';
    el.style.animationDuration = dur + 'ms';
    el.style.setProperty('--gf-wob', wob + 'vh');
    if (Math.random() < 0.5) el.classList.add('rev');
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      catchGolden(e.clientX, e.clientY, el);
    }, { once: true });
    document.body.appendChild(el);
    // escapa sem ser clicado: libera o agendador
    setTimeout(() => {
      if (el.isConnected) {
        el.remove();
        if (G.runtime && G.runtime.golden) G.runtime.golden.active = false;
      }
    }, dur);
  };

  function catchGolden(x, y, el) {
    const r = G.goldenClicked();
    el.classList.add('caught');
    setTimeout(() => el.remove(), 320);
    if (!r) return;
    const FXr = window.Fx;
    if (FXr) {
      FXr.burst(x, y, { count: 40, color: '#ffd700', speed: 420, life: 1.0, shape: 'spark' });
      FXr.burst(x, y, { count: 20, color: '#fff3b0', speed: 260, life: 1.3, shape: 'circle', gravity: 380 });
      FXr.ring(x, y, { r1: 220, color: 'rgba(255,215,0,.9)', width: 7, life: 0.7 });
      FXr.flash('#ffd700', 350);
      FXr.shake(6);
      FXr.float(x, y - 30, '+' + fmtMoney(r.gain), { size: 34, color: '#ffd700', crit: true, life: 1.6 });
    }
    try { window.AudioFX && AudioFX.sfx.achievement(); } catch (e) {}
    UI.toast('🤑 THIEGO DOURADO PEGO! +' + fmtMoney(r.gain), 'gold', 5000);
    if (r.enc && UI.showEncounter) UI.showEncounter(r.enc);
  }

  function renderFarm() {
    const s = G.s;
    const evo = activeEvo();
    const im = document.getElementById('farm-img');
    const rel = T.asset(evo.img);
    if (im && im.getAttribute('src') !== rel) { im.src = rel; im.classList.remove('fresh'); void im.offsetWidth; im.classList.add('fresh'); }
    const ft = document.getElementById('farm-title');
    if (ft) ft.textContent = s.title ? (T.TITLES.find((x) => x.id === s.title) || {}).name : 'THIEGO';
    if (!G.runtime.humor) {
      const pool = Econ.dps(s, G.runtime).e >= 12 ? T.HUMOR_ABSURD : T.HUMOR;
      G.runtime.humor = pool[(Math.random() * pool.length) | 0];
    }
    const info = document.getElementById('farm-info');
    if (info) {
      info.innerHTML =
        '<span>CLIQUE: <b>' + fmtMoney(Econ.clickPower(s, G.runtime, Math.max(1, G.runtime.combo || 1))) + '</b></span>' +
        '<span>CRÍTICO: <b>' + (Econ.critChance(s) * 100).toFixed(1) + '%</b> ×' + N.fmt(N.fromF(Econ.critMult(s))) + '</span>' +
        '<span>DPS: <b>' + fmtMoney(Econ.dps(s, G.runtime)) + '</b></span>';
    }
  }

  /* ============================================================
     ABA UPGRADES
     ============================================================ */
  let upFilter = 'todas';
  function buildUpgrades(t) {
    const cats = ['todas', 'clique', 'auto', 'evo', 'prestige', 'offline', 'event', 'battle', 'economy', 'xp', 'loot', 'meme'];
    const labels = { todas: 'TODAS', clique: 'CLIQUE', auto: 'AUTOMAÇÃO', evo: 'EVOLUÇÃO', prestige: 'ASCENSÃO', offline: 'OFFLINE', event: 'EVENTOS', battle: 'BATALHA', economy: 'ECONOMIA', xp: 'XP', loot: 'LOOT', meme: 'MEME' };
    const bar = el('div', 'up-filter d-flex flex-wrap gap-2 mb-3');
    for (const c of cats) {
      const b = el('button', 'badge rounded-pill chip-btn' + (c === upFilter ? ' active' : ''), labels[c]);
      b.addEventListener('click', () => { upFilter = c; renderUpgrades(); });
      bar.appendChild(b);
    }
    const buyAll = el('button', 'btn buy ms-auto', '⚡ COMPRAR TODOS POSSÍVEIS');
    buyAll.id = 'up-buy-all';
    buyAll.title = 'Compra todos os upgrades que você pode pagar (respeitando o nível máximo).';
    buyAll.addEventListener('click', () => {
      const n = G.buyAllUpgrades();
      if (n > 0) {
        window.AudioFX.sfx.buy();
        try { window.Fx && window.Fx.flash('#00d9ff', 300); } catch (e) {}
        UI.toast('⚡ ' + n + ' upgrade' + (n > 1 ? 's' : '') + ' comprados!', 'gold', 3500);
        renderUpgrades();
        G.checkAchievements();
        G.save();
      } else {
        denied();
      }
    });
    bar.appendChild(buyAll);
    t.appendChild(bar);
    t.appendChild(el('div', 'up-list', '<div class="notice">carregando…</div>'));
  }
  function renderUpgrades() {
    const s = G.s;
    const list = tList('upgrades');
    list.className = 'up-list d-grid gap-2';
    list.innerHTML = '';
    const filtered = T.UPGRADES.filter((u) => upFilter === 'todas' || u.cat === upFilter);
    if (!filtered.length) { list.appendChild(el('div', 'notice', 'nada por aqui.')); return; }
    for (const u of filtered) {
      const lvl = s.upgrades[u.id] || 0;
      const max = u.effect.maxLevel || 1;
      const can = G.canBuyUpgrade(u.id);
      const card = el('div', 'up-card d-flex align-items-center gap-3' + (can.ok ? ' buyable' : '') + (lvl >= max ? ' maxed' : ''));
      const isImg = u.icon && /\.(png|jpe?g|gif|webp)$/i.test(u.icon);
      const icon = isImg ? '<img class="up-icon" src="' + T.asset(u.icon) + '" alt="" loading="lazy">' : '<div class="up-icon placeholder">' + (u.icon || '⬆') + '</div>';
      card.innerHTML =
        icon +
        '<div class="up-body">' +
        '  <div class="up-name">' + u.name + '</div>' +
        '  <div class="up-desc">' + effectDesc(u) + '</div>' +
        '  <div class="up-lvl">NÍVEL ' + lvl + '/' + max + '</div>' +
        (lvl >= max ? '' : '<div class="up-progress"><div class="up-progress-fill" style="width:' + Math.min(100, Math.round(lvl / max * 1000) / 10) + '%"></div></div>') +
        '</div>' +
        '<div class="up-buy">' +
        (lvl >= max
          ? '<span class="up-max">MÁX</span>'
          : '<button class="btn buy" ' + (can.ok ? '' : 'disabled') + '>COMPRAR<br><small>' + fmtMoney(can.cost || 0) + '</small></button>') +
        '</div>';
      const btn = card.querySelector('button');
      if (btn) btn.addEventListener('click', () => {
        if (G.buyUpgrade(u.id)) {
          window.AudioFX.sfx.buy();
          renderUpgrades();
          G.checkAchievements();
        } else { if (!can.ok) denied(); }
      });
      list.appendChild(card);
    }
  }
  function pct(v) {
    const p = Math.round(v * 1000) / 10;
    return (p % 1 === 0) ? String(p) : p.toFixed(1);
  }
  function effectDesc(u) {
    const e = u.effect;
    const v = e.val !== undefined ? e.val : e.value;
    switch (e.type) {
      case 'clickMult': return '+' + pct(v) + '% ao clique';
      case 'critChance': return '+' + pct(v) + '% chance de crítico';
      case 'critMult': return 'crítico ×' + N.fmt(N.fromF(3 + v));
      case 'comboTime': return '+' + Math.round(v / 1000) + 's na janela de combo';
      case 'comboCap': return 'combo máximo +' + v;
      case 'clickShare': return 'clique ganha ' + pct(v) + '% do DPS (lvl ' + (u.effect.maxLevel || 1) + ')';
      case 'genMult': return '+' + pct(v) + '% a todos os geradores';
      case 'costRed': return 'custos -' + pct(v) + '%';
      case 'prodMult': return 'produção +' + pct(v) + '%';
      case 'evoCost': return 'evolução -' + pct(v) + '%';
      case 'perEvo': return '+' + pct(v) + '% por nível de evolução';
      case 'prestigeGain': return 'ganho de ascensão +' + pct(v) + '%';
      case 'prestigeMult': return 'multiplicador de ascensão +' + pct(v) + '%';
      case 'offlineEff': return 'ganho offline +' + pct(v) + '%';
      case 'offlineCap': return 'offline +' + v + 'h';
      case 'eventFreq': return 'eventos ' + Math.round((1 / (1 - v) - 1) * 100) + '% mais frequentes';
      case 'eventDur': return 'eventos duram +' + pct(v) + '%';
      case 'eventReward': return 'recompensas de eventos +' + pct(v) + '%';
      default: return u.desc || '';
    }
  }

  /* ============================================================
     ABA GERADORES
     ============================================================ */
  function buildGenerators(t) {
    const bar = el('div', 'gen-filter d-flex flex-wrap gap-2 mb-3');
    const buyBest = el('button', 'btn buy ms-auto', '⚡ COMPRAR MELHORES');
    buyBest.id = 'gen-buy-best';
    buyBest.title = 'Calcula o gerador e a quantidade com melhor custo-benefício (DPS por dopamina) e compra enquanto puder.';
    buyBest.addEventListener('click', () => {
      const n = G.buyBestGenerators();
      if (n > 0) {
        window.AudioFX.sfx.buy();
        try { window.Fx && window.Fx.flash('#3dffa2', 300); } catch (e) {}
        UI.toast('⚡ ' + n + ' gerador' + (n > 1 ? 'es' : '') + ' comprados!', 'gold', 3500);
        renderGenerators();
        G.checkAchievements();
        G.save();
      } else {
        denied();
      }
    });
    bar.appendChild(buyBest);
    t.appendChild(bar);
    t.appendChild(el('div', 'gen-list', '<div class="notice">carregando…</div>'));
  }
  function renderGenerators() {
    const s = G.s;
    const list = tList('generators');
    list.innerHTML = '';
    // Desbloqueio progressivo (lição CC): um gerador só aparece quando o
    // jogador está próximo dele (dopamina >= 30% do custo base) OU já possui
    // o gerador. O próximo na fila aparece como teaser "???".
    let teaserShown = false;
    let visibleCount = 0;
    // Calcula o melhor custo-benefício para highlight (lição CC: "best buy")
    let bestIdx = -1, bestRatio = 0;
    for (let i = 0; i < T.GENERATORS.length; i++) {
      const owned = s.gens[i];
      if (!owned && i > 0) {
        const base = N.fromF(T.GENERATORS[i].baseCost);
        if (!N.gte(s.dopamine, N.mul(base, N.fromF(0.3)))) break;
      }
      const cost = Econ.genCost(s, i, 1);
      const dps1 = Econ.genUnitDps(s, i);
      if (N.gt(cost, N.zero) && N.gt(dps1, N.zero)) {
        const ratio = num(N.div(dps1, cost));
        if (ratio > bestRatio) { bestRatio = ratio; bestIdx = i; }
      }
    }
    for (let i = 0; i < T.GENERATORS.length; i++) {
      const g = T.GENERATORS[i];
      const owned = s.gens[i];
      if (!owned && i > 0) {
        const base = N.fromF(g.baseCost);
        const near = N.gte(s.dopamine, N.mul(base, N.fromF(0.3)));
        if (!near) {
          if (!teaserShown) {
            teaserShown = true;
            const tcard = el('div', 'gen-card gen-locked d-flex align-items-center gap-3');
            tcard.innerHTML =
              '<div class="gen-img placeholder rounded flex-shrink-0 text-center" style="width:52px;height:52px;line-height:52px;font-size:20px;background:var(--panel2)">❓</div>' +
              '<div class="gen-info flex-grow-1 min-width-0"><div class="gen-name fw-bold">???</div>' +
              '<div class="gen-meta small text-muted">Continue farmando para descobrir…</div></div>';
            list.appendChild(tcard);
          }
          break;
        }
      }
      visibleCount++;
      const cost = Econ.genCost(s, i, 1);
      const dps1 = Econ.genUnitDps(s, i);
      const isBest = (i === bestIdx && N.gte(s.dopamine, cost));
      const card = el('div', 'gen-card' + (N.gte(s.dopamine, cost) ? ' buyable' : '') + (isBest ? ' gen-best' : ''));
      const mil = milestoneInfo(i, owned);
      const gIsImg = g.img && /\.(png|jpe?g|gif|webp)$/i.test(g.img);
      card.innerHTML =
        (isBest ? '<div class="gen-best-badge">★ MELHOR CUSTO-BENEFÍCIO</div>' : '') +
        '<div class="gen-head d-flex align-items-center gap-3">' +
        (gIsImg ? '<img class="gen-img rounded flex-shrink-0" src="' + T.asset(g.img) + '" alt="" loading="lazy">'
          : '<div class="gen-img placeholder rounded flex-shrink-0 text-center" style="width:52px;height:52px;line-height:52px;font-size:20px;background:var(--panel2)">' + (g.icon || '⚙️') + '</div>') +
        '<div class="gen-info flex-grow-1 min-width-0"><div class="gen-name fw-bold">' + g.name + '</div>' +
        '<div class="gen-meta small text-muted">' + owned + ' · ' + fmtMoney(N.mul(dps1, N.fromF(owned))) + '/s total · cada: ' + fmtMoney(dps1) + '</div></div>' +
        '<div class="gen-cost fw-bold text-warning flex-shrink-0">' + fmtMoney(cost) + '</div>' +
        '</div>' +
        '<div class="gen-buys d-flex gap-2 mt-2">' +
        [1, 10, 25].map((nn) => '<button class="btn btn-sm btn-outline-secondary flex-fill' + (N.gte(s.dopamine, Econ.genCost(s, i, nn)) ? '' : ' disabled') + '" data-n="' + nn + '">×' + nn + '</button>').join('') +
        '<button class="btn btn-sm btn-outline-warning flex-fill max">MAX</button>' +
        '</div>' +
        (mil ? '<div class="gen-milestone small text-info mt-2">' + mil + '</div>' : '');
      card.querySelector('.gen-buys').addEventListener('click', (ev) => {
        const b = ev.target.closest('button');
        if (!b) return;
        const n = b.dataset.n ? parseInt(b.dataset.n, 10) : null;
        const count = n ? n : Math.max(1, Econ.maxGenBuy(s, i));
        if (G.buyGen(i, count)) {
          window.AudioFX.sfx.buy();
          renderGenerators();
          G.checkAchievements();
        } else {
          denied();
        }
      });
      list.appendChild(card);
    }
    if (visibleCount > 0) {
      list.appendChild(el('div', 'notice small text-muted mt-2', visibleCount + ' de ' + T.GENERATORS.length + ' geradores descobertos.'));
    }
  }
  function milestoneInfo(i, owned) {
    const next = T.MILESTONES.find((mv) => owned < mv);
    if (next === undefined) return 'MILESTONE FINAL ATINGIDO';
    return 'próximo milestone ×' + next + ' (' + (owned) + '/' + next + ')';
  }

  /* ============================================================
     ABA EVOLUÇÕES
     ============================================================ */
  function buildEvolutions(t) {
    t.appendChild(el('div', 'evo-list', '<div class="notice">carregando…</div>'));
  }
  function renderEvolutions() {
    const s = G.s;
    const list = tList('evolutions');
    list.innerHTML = '';
    const cur = T.EVOLUTIONS[s.tier];
    const head = el('div', 'evo-current');
    head.innerHTML =
      '<div class="evo-now">EVOLUÇÃO ATUAL</div>' +
      '<div class="evo-now-img"><img src="' + T.asset(cur.img) + '" alt=""></div>' +
      '<div class="evo-now-name">' + cur.name + '</div>' +
      '<div class="evo-now-mult">MULTIPLICADOR TOTAL: ' + N.fmt(N.fromF(Econ.evoMult(s))) + '×</div>';
    list.appendChild(head);
    // botão evoluir tudo (no topo)
    const all = el('div', 'evo-all');
    const btn = el('button', 'btn primary', '🚀 EVOLUIR TODOS');
    btn.addEventListener('click', () => evolveAll());
    all.appendChild(btn);
    list.appendChild(all);
    for (let i = 0; i < T.EVOLUTIONS.length; i++) {
      const ev = T.EVOLUTIONS[i];
      const cost = i === 0 ? N.zero : Econ.evoCost(s, i);
      const dps = Econ.dps(s, G.runtime);
      const rem = N.sub(cost, s.dopamine);
      const etaSecs = N.gte(dps, N.fromF(0.1)) && N.gt(rem, N.zero) ? num(N.div(rem, dps)) : null;
      const eta = etaSecs !== null && etaSecs < 365 * 24 * 3600 ? fmtTime(etaSecs) : '—';
      const card = el('div', 'evo-card' + (i === s.tier ? ' current' : (i < s.tier ? ' done' : '')) + (i === s.tier + 1 && N.gte(s.dopamine, cost) ? ' buyable' : ''));
      card.innerHTML =
        '<img class="evo-img" src="' + T.asset(ev.img) + '" alt="" loading="lazy">' +
        '<div class="evo-body">' +
        '<div class="evo-name">' + ev.name + '</div>' +
        '<div class="evo-mult">' + (i === 0 ? 'base' : '×' + N.fmt(N.fromF(ev.mult))) + ' prod</div>' +
        (i < s.tier ? '<div class="evo-done">EVOLUÍDO</div>'
          : i === s.tier ? '<div class="evo-active">ATUAL</div>'
          : '<div class="evo-cost">' + fmtMoney(cost) + (eta !== '—' ? ' · ETA ' + eta : '') + '</div>') +
        '</div>';
      if (i > s.tier) {
        card.classList.add('locked');
        card.addEventListener('click', () => {
          const r = G.evolve();
          if (r) {
            const evT = T.EVOLUTIONS[r];
            window.AudioFX.sfx.evolve();
            Fx.flash('#ffd700', 500);
            showTransformOverlay(evT);
            renderAllSoon();
          } else denied();
        });
      }
      list.appendChild(card);
    }
  }

  function evolveAll() {
    const s = G.s;
    const start = s.tier;
    let target = start;
    let costTotal = N.zero;
    while (target + 1 < T.EVOLUTIONS.length) {
      const cost = Econ.evoCost(s, target + 1);
      if (N.lt(s.dopamine, N.add(costTotal, cost))) break;
      costTotal = N.add(costTotal, cost);
      target++;
    }
    if (target === start) {
      UI.toast('Dopamina insuficiente para evoluir.', 'warn');
      return;
    }
    const ev = T.EVOLUTIONS[target];
    s.dopamine = N.sub(s.dopamine, costTotal);
    s.tier = target;
    G.save();
    window.AudioFX.sfx.evolve();
    Fx.flash('#ffd700', 500);
    showTransformOverlay(ev);
    renderAllSoon();
  }

  let transformQueued = false;
  function renderAllSoon() { transformQueued = true; }
  // chamado do loop principal
  UI.flush = function () { if (transformQueued) { transformQueued = false; renderTab(selectedTab); } };

  /* ---------- status do save global (botão + texto) ---------- */
  let _saveStatusCache = '';
  UI.touchSaveStatus = function () {
    const ss = document.getElementById('save-status');
    const btn = document.getElementById('save-now-btn');
    if (!ss && !btn) return;
    const lb = window.Leaderboard || {};
    let txt = '—';
    let cls = '';
    let btnTxt = '💾 SALVAR AGORA';
    const online = !!(lb.online && lb.logged);
    if (lb._savingNow) {
      txt = '⟳ Salvando...';
      cls = 'saving';
    } else if (online) {
      const ago = lb.lastSavedAt ? Math.max(0, Math.round((Date.now() - lb.lastSavedAt) / 1000)) : null;
      if (lb._saveFailed) { txt = '⚠ Falha no salvamento'; cls = 'error'; }
      else if (ago !== null && ago < 120) { txt = '✓ Salvo há ' + ago + 's'; cls = 'saved'; }
      else if (ago !== null) { txt = '✓ Salvo às ' + new Date(lb.lastSavedAt).toLocaleTimeString('pt-BR'); cls = 'saved'; }
      else { txt = 'conta conectada'; cls = 'saved'; }
    } else {
      txt = 'modo local';
      cls = 'local';
      btnTxt = '💾 SALVAR LOCAL';
    }
    const key = txt + '|' + cls + '|' + btnTxt;
    if (_saveStatusCache !== key) {
      _saveStatusCache = key;
      if (ss) { ss.textContent = txt; ss.className = 'save-status ' + cls; }
      if (btn && btn.textContent !== btnTxt) btn.textContent = btnTxt;
    }
  };
  // clique do botão SALVAR AGORA (HUD)
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest ? e.target.closest('#save-now-btn') : null;
    if (!b) return;
    const lb = window.Leaderboard;
    if (!lb) return;
    if (lb._savingNow) return;
    if (!lb.online || !lb.logged) {
      // sem login: o G.save() já gravou no localStorage; só confirma visual
      UI.toast('Save salvo neste navegador. Faça login (aba THIEGOS) para salvar na conta.', 'info', 4000);
      lb.lastSavedAt = Date.now();
      UI.touchSaveStatus();
      return;
    }
    lb._savingNow = true;
    lb._saveFailed = false;
    UI.touchSaveStatus();
    (window.SaveNow ? window.SaveNow(true) : lb.submitSave(true))
      .then((d) => {
        if (d && d.ok) {
          UI.toast('💾 Save salvo na conta!', 'gold', 3000);
          G.save();
        } else if (d && d.error) {
          // rate_limit: não é falha real — o save anterior já foi enviado
          if (d.error === 'rate_limit') {
            UI.toast('⌛ Save enviado recentemente, aguarde um pouco.', 'info', 3000);
            G.save();
          } else {
            UI.toast('Servidor recusou: ' + d.error, 'error', 4000);
            lb._saveFailed = true;
          }
        }
      })
      .catch(() => { UI.toast('Falha ao salvar no servidor', 'error'); lb._saveFailed = true; })
      .finally(() => { lb._savingNow = false; UI.touchSaveStatus(); });
  });

  function showTransformOverlay(ev) {
    const ov = Fx.overlay('evo', T.asset(ev.img), ev.name + '!', 'EVOLUÇÃO COMPLETA');
    setTimeout(() => ov.done(), 1800);
  }

  /* ============================================================
     ABA PRESTIGE
     ============================================================ */
  function buildPrestige(t) {
    const box = el('div', 'pres-view');
    box.innerHTML =
      '<div class="pres-head" id="pres-head"></div>' +
      '<div class="pres-gain" id="pres-gain"></div>' +
      '<button class="btn pres-btn" id="pres-btn">ASCENDER</button>' +
      '<div class="pres-quote" id="pres-quote"></div>' +
      '<div class="pres-tree" id="pres-tree"></div>';
    box.querySelector('#pres-btn').addEventListener('click', () => tryPrestige());
    t.appendChild(box);
  }
  function tryPrestige() {
    const s = G.s;
    const gain = Econ.prestigeGain(s);
    if (!Econ.canPrestige(s)) { denied(); return; }
    const done = (ok) => {
      window.AudioFX.sfx.prestige();
      Fx.flash('#c86bff', 600);
      Fx.shake(8);
      if (ok) showPrestigeOverlay(ok.gained, ok.multAfter);
      renderAllSoon();
      G.checkAchievements();
      if (window.Leaderboard) Leaderboard.submit(true);
    };
    if (s.settings.confirmPrestige) {
      openModal('ASCENSÃO DOPAMÍNICA', prestigeModalBody(gain), [
        { label: 'CANCELAR', cls: 'btn' },
        { label: 'ASCENDER!', cls: 'btn primary', cb: () => done(G.prestige()) },
      ]);
    } else {
      done(G.prestige());
    }
  }
  function prestigeModalBody(gain) {
    return '<p>Você vai ganhar <b class="hl">+' + Math.max(1, Math.floor(num(gain))) + ' pontos</b> de Dopamina Ascendida.</p>' +
      '<p>Multiplicador atual: <b>' + N.fmt(Econ.prestigeMult(G.s)) + '×</b> → novo: <b>' + N.fmt(Econ.prestigeMultAfter(G.s, num(gain))) + '×</b></p>' +
      '<p class="warn">Seus geradores, upgrades e dopamina serão <b>resetados</b> por uma ascensão. Evolução e conquistas permanecem.</p>';
  }
  function showPrestigeOverlay(gained, multAfter) {
    const ov = Fx.overlay('prestige', null, 'ASCENSÃO TOTAL!', '+' + Math.max(1, Math.floor(gained)) + ' PONTOS · MULT ' + N.fmt(multAfter) + '×');
    setTimeout(() => ov.done(), 2400);
  }
  function renderPrestige() {
    const s = G.s;
    const head = document.getElementById('pres-head');
    if (head) head.innerHTML = 'ASCENSÕES: <b>' + s.prestige + '</b> · PONTOS: <b>' + s.points + '</b> · MULT GLOBAL: <b>' + N.fmt(Econ.prestigeMult(s)) + '×</b>';
    const gain = Econ.prestigeGain(s);
    const gs = document.getElementById('pres-gain');
    if (gs) {
      const can = Econ.canPrestige(s);
      if (can) {
        gs.innerHTML = 'PRONTO: +' + Math.max(1, Math.floor(num(gain))) + ' pts ao ascender!';
      } else {
        const need = num(Econ.prestigeNeed(s));
        const run = Math.max(1, num(s.runEarned || s.totalEarned));
        const left = Math.max(0, need - run);
        const pct = Math.min(100, Math.max(0, Math.log10(run) / Math.log10(Math.max(need, 1)) * 100));
        gs.innerHTML = 'GANHO ATUAL: ' + Math.floor(num(gain)) + ' pts · <b>FALTA ' + fmtMoney(left) + ' DE DOPAMINA PARA ASCENDER</b> <small>(' + Math.floor(pct) + '% da run)</small>';
      }
    }
    const q = document.getElementById('pres-quote');
    if (q && s.counters.prestiges > 0) q.innerHTML = '🗿 <i>' + (T.HUMOR_PRESTIGE[(s.counters.prestiges - 1) % T.HUMOR_PRESTIGE.length]) + '</i>';
    const tree = document.getElementById('pres-tree');
    if (tree) {
      tree.innerHTML = '';
      for (const tr of T.PRESTIGE_TREE) {
        const lvl = s.tree[tr.id] || 0;
        const card = el('div', 'tree-card');
        card.innerHTML = '<div class="tree-name">' + tr.name + '</div><div class="tree-desc">' + tr.desc + '</div>';
        const lv = el('div', 'tree-levels');
        for (let i = 0; i < tr.max; i++) {
          const b = el('button', 'tree-level' + (i < lvl ? ' owned' : ''));
          const cost = tr.levels[i];
          b.textContent = i < lvl ? '✓' : cost;
          b.title = 'Nível ' + (i + 1) + ': ' + fmtTreeEffect(tr, i + 1);
          if (i >= lvl && tr.levels[i] <= s.points) b.classList.add('buyable');
          if (i === lvl) {
            b.addEventListener('click', () => {
              if (G.buyTree(tr.id)) {
                window.AudioFX.sfx.buy();
                renderPrestige();
                G.checkAchievements();
              } else denied();
            });
          }
          lv.appendChild(b);
        }
        lv.querySelectorAll('.tree-level.owned').forEach((b) => b.disabled = true);
        card.appendChild(lv);
        tree.appendChild(card);
      }
    }
  }
  function fmtTreeEffect(tr, lvl) {
    return tr.desc + ' (nível ' + lvl + ')';
  }

  /* ============================================================
     ABA TRANSCEND (meta-camada infinita pós-prestige)
     ============================================================ */
  function buildTranscend(t) {
    t.appendChild(el('div', 'transc-view', '<div class="notice">carregando…</div>'));
  }
  function renderTranscend() {
    const s = G.s;
    const view = tList('transcend');
    view.innerHTML = '';
    view.appendChild(el('div', 'transc-head', 'TRANSCENDÊNCIA — <span class="hl">ALÉM DO PRESTIGE</span>' +
      '<span class="exp-head-sub">cada ponto de transcendência multiplica TUDO por ×2. Progresso infinito.</span>'));

    // status
    const head = el('div', 'transc-status');
    head.innerHTML =
      '<div class="transc-stat"><span>TRANSCENSÕES</span><b>' + s.transcends + '</b></div>' +
      '<div class="transc-stat"><span>PONTOS</span><b class="hl">' + s.tPoints + '</b></div>' +
      '<div class="transc-stat"><span>MULT GLOBAL</span><b class="hl">' + N.fmt(Econ.transcMult(s)) + '×</b></div>';
    view.appendChild(head);

    // progresso até próxima transcendência
    const needLog = Econ.transcendNeedLog(s);
    const curLog = N.log10(s.totalEarned);
    const prog = el('div', 'transc-progress');
    const pct = Math.min(100, Math.max(0, (curLog / Math.max(1, needLog)) * 100));
    const gain = Econ.transcendGain(s);
    prog.innerHTML =
      '<div class="transc-prog-label">' +
      (Econ.canTranscend(s)
        ? '✔ <b>TRANSCENDÊNCIA DISPONÍVEL</b> — ganhe <b>+' + gain + '</b> pontos'
        : 'PRÓXIMA TRANSCENDÊNCIA: total log10 <b>' + needLog + '</b> (você: ' + curLog.toFixed(1) + ')') +
      '</div>' +
      '<div class="transc-prog-bar"><i style="width:' + pct + '%"></i></div>';
    view.appendChild(prog);

    // botão transcender
    const btns = el('div', 'transc-actions');
    const trBtn = el('button', 'btn primary', '🌟 TRANSCENDER (+' + Math.max(1, gain) + ' pts)');
    trBtn.addEventListener('click', () => {
      const done = (ok) => {
        window.AudioFX.sfx.prestige();
        Fx.flash('#ffd700', 800);
        Fx.shake(12);
        if (ok) {
          UI.toast('🌟 TRANSCENDÊNCIA! +' + ok.gained + ' pontos · MULT ' + N.fmt(ok.multAfter) + '×', 'gold', 6000);
          renderAllSoon();
          G.save();
        }
      };
      if (!Econ.canTranscend(s)) { UI.toast('Dopamina total insuficiente para transcender.', 'warn'); return; }
      done(G.transcend());
    });
    btns.appendChild(trBtn);
    view.appendChild(btns);

    // aviso de reset
    const warn = el('div', 'transc-warn',
      'Ao transcender você reseta a RUN + PRESTIGE + ÁRVORE DE PRESTIGE, mas ganha pontos permanentes (×2 global cada). Conquistas, títulos e a árvore de transcendência permanecem.');
    view.appendChild(warn);

    // árvore de transcendência
    const tree = el('div', 'transc-tree');
    tree.appendChild(el('div', 'transc-tree-title', 'ÁRVORE DE TRANSCENDÊNCIA (pontos: ' + s.tPoints + ')'));
    for (const tr of T.TRANSCENDENCE_TREE) {
      const lvl = s.transTree[tr.id] || 0;
      const card = el('div', 'tree-card');
      card.innerHTML = '<div class="tree-name">' + tr.name + '</div><div class="tree-desc">' + tr.desc + '</div>';
      const lv = el('div', 'tree-levels');
      for (let i = 0; i < tr.max; i++) {
        const b = el('button', 'tree-level' + (i < lvl ? ' owned' : ''));
        const cost = tr.levels[i];
        b.textContent = i < lvl ? '✓' : cost;
        b.title = 'Nível ' + (i + 1) + ': ' + tr.desc;
        if (i >= lvl && tr.levels[i] <= s.tPoints) b.classList.add('buyable');
        if (i === lvl) {
          b.addEventListener('click', () => {
            if (G.buyTransTree(tr.id)) {
              window.AudioFX.sfx.buy();
              renderTranscend();
              G.checkAchievements();
            } else denied();
          });
        }
        lv.appendChild(b);
      }
      lv.querySelectorAll('.tree-level.owned').forEach((b) => b.disabled = true);
      card.appendChild(lv);
      tree.appendChild(card);
    }
    view.appendChild(tree);
  }

  /* ============================================================
     ABA CONQUISTAS
     ============================================================ */
  let achFilter = 'todas';
  function buildAchievements(t) {
    const bar = el('div', 'ach-filter');
    for (const [k, label] of [['todas', 'TODAS'], ['normal', 'NORMAIS'], ['secret', 'SECRETAS']]) {
      const b = el('button', 'chip-btn' + (k === achFilter ? ' active' : ''), label);
      b.addEventListener('click', () => { achFilter = k; renderAchievements(); });
      bar.appendChild(b);
    }
    t.appendChild(bar);
    t.appendChild(el('div', 'ach-grid', '<div class="notice">carregando…</div>'));
  }
  function renderAchievements() {
    const s = G.s;
    const grid = tList('achievements');
    // NÃO usar classes .row/.row-cols do Bootstrap aqui: o width:25% delas
    // colapsa os cards dentro do grid CSS (43px em colunas de 173px).
    grid.className = 'ach-grid';
    grid.innerHTML = '';
    const ctx = G.buildCtx();
    const list = T.ACHIEVEMENTS.filter((a) =>
      achFilter === 'todas' ? true
      : achFilter === 'secret' ? !!a.secret
      : !a.secret);
    for (const a of list) {
      const got = s.achievements.includes(a.id);
      const card = el('div', 'ach-card' + (got ? ' got' : '') + (a.secret ? ' secret' : ''));
      card.innerHTML =
        '<div class="ach-icon">' + (a.icon || (a.secret ? '🔥' : '🏆')) + '</div>' +
        '<div class="ach-name">' + a.name + '</div>' +
        '<div class="ach-desc">' + a.desc + '</div>' +
        (a.secret && !got ? '<div class="ach-secret">???</div>' : '');
      card.title = (ctx['achAll'] ? 'todas coletadas' : '');
      grid.appendChild(card);
    }
  }

  /* ============================================================
     ABA MISSÕES
     ============================================================ */
  function buildMissions(t) {
    t.appendChild(el('div', 'miss-list d-grid gap-2', '<div class="notice">carregando…</div>'));
  }
  function renderMissions() {
    const s = G.s;
    const list = tList('missions');
    list.innerHTML = '';
    const groups = [['daily', 'MISSÕES DIÁRIAS'], ['weekly', 'MISSÕES SEMANAIS'], ['special', 'MISSÃO ESPECIAL']];
    for (const [kind, label] of groups) {
      list.appendChild(el('div', 'miss-group-title', label));
      const group = s.missions[kind];
      if (!group) continue;
      const items = kind === 'special' ? [group] : group;
      for (let i = 0; i < items.length; i++) {
        const m = items[i];
        const def = findMissionDef(kind, m.id);
        if (!def) continue;
        const prog = G.missionProgress(m, s);
        const card = el('div', 'miss-card' + (prog.done ? ' done' : '') + (m.claimed ? ' claimed' : ''));
        card.innerHTML =
          '<div class="miss-name">' + def.name + '</div>' +
          '<div class="miss-bar"><div class="miss-fill" style="width:' + Math.min(100, 100 * prog.cur / Math.max(1, prog.target)) + '%"></div></div>' +
          '<div class="miss-meta"><span>' + Math.min(prog.cur, prog.target) + '/' + prog.target + '</span>' +
          '<span class="miss-reward">' + missReward(def) + '</span></div>' +
          (m.claimed ? '<div class="miss-claim">ENTREGUE</div>'
            : '<button class="btn small claim" ' + (prog.done ? '' : 'disabled') + '>RECEBER</button>');
        if (!m.claimed) {
          const btn = card.querySelector('button');
          btn.addEventListener('click', () => {
            const r = G.claimMission(kind, i);
            if (r) {
              window.AudioFX.sfx.achievement();
              UI.toast(r.points ? 'RECEBIU ' + r.points + ' PTS' : 'RECEBIU +' + fmtMoney(r.dopa), 'achievement', 4000);
              renderMissions();
            }
          });
        }
        list.appendChild(card);
      }
    }
    // placeholder para missão IA (js/ai.js)
    if (!document.getElementById('ai-content')) {
      const aiBox = el('div', 'miss-group-title', 'MISSÃO DO DIA');
      aiBox.id = 'ai-content';
      aiBox.innerHTML += '<div class="ai-card-placeholder">🤖 Carregando...</div>';
      list.appendChild(aiBox);
    }
    // se a IA já carregou os dados, preenche o card
    if (window.AI && window.AI.renderInto) {
      try { window.AI.renderInto(); } catch (e) {}
    }
  }
  function findMissionDef(kind, id) {
    const pool = T.MISSION_POOL[kind] || [];
    return pool.find((m) => m.id === id);
  }
  function missReward(def) {
    if (def.reward == null) return 'recompensa?';
    if (def.reward.dopa != null) return '⏱ vale ' + def.reward.dopa + 's de produção';
    if (def.reward.points != null) return '⛰ ' + def.reward.points + ' PTS';
    return 'recompensa?';
  }

  /* ============================================================
     ABA RANKING
     ============================================================ */
  function buildRanking(t) {
    t.appendChild(el('div', 'rank-view', '<div class="notice">carregando…</div>'));
  }
  UI.renderRanking = function () {
    const view = tList('ranking');
    view.innerHTML = '';
    const lb = window.Leaderboard || {};
    const online = !!lb.online && !!lb.logged;
    const bar = el('div', 'rank-bar');
    bar.innerHTML = '<span class="rank-mode">' + (online ? '🌍 RANKING GLOBAL' : '📦 RANKING LOCAL — SEM LOGIN') + '</span>';
    const modes = [['global', 'GERAL'], ['today', 'HOJE'], ['week', 'SEMANA'], ['month', 'MÊS']];
    for (const [k, label] of modes) {
      const b = el('button', 'chip-btn' + (lb.mode === k ? ' active' : ''), label);
      b.addEventListener('click', () => { Leaderboard.refresh({ mode: k }); });
      bar.appendChild(b);
    }
    const sorts = [['score', 'DOPAMINA'], ['prestige', 'ASCENSÃO']];
    for (const [k, label] of sorts) {
      const b = el('button', 'chip-btn' + (lb.sort === k ? ' active' : ''), label);
      b.addEventListener('click', () => { Leaderboard.refresh({ sort: k }); });
      bar.appendChild(b);
    }
    const sub = el('button', 'btn small', 'ATUALIZAR / ENVIAR');
    sub.addEventListener('click', () => { Leaderboard.submit(true).then(() => Leaderboard.refresh()); });
    bar.appendChild(sub);
    if (!online) {
      const loginBtn = el('button', 'btn primary small', '🔑 ENTRAR / CRIAR CONTA');
      loginBtn.addEventListener('click', () => {
        if (window.Expansion && window.Expansion.showLogin) window.Expansion.showLogin();
        else window.UI.switchTab('thiegos');
      });
      bar.appendChild(loginBtn);
    }
    view.appendChild(bar);

    if (lb.me) {
      const me = el('div', 'rank-me');
      me.innerHTML = '<b>VOCÊ:</b> posição ' + lb.me.rank + ' · ' + (lb.me.name || '') + (lb.me.admin ? ' <span class="rank-admin">🛡️ ADMIN</span>' : '') + ' · ' + Leaderboard.fmtScore(lb.me.log10) +
        (lb.bestRank ? ' <small>· melhor: #' + lb.bestRank + '</small>' : '');
      view.appendChild(me);
    }
    const list = el('div', 'rank-list');
    if (!lb.list || !lb.list.length) list.appendChild(el('div', 'notice', online ? 'sem dados ainda.' : 'jogue offline e volte!'));

    const rows = (lb.list || []).slice(0, 50);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const row = el('div', 'rank-row' + (lb.me && lb.me.rank === r.rank ? ' me' : ''));
      const medal = i < 3 ? '🥇🥈🥉'[i] : r.rank;
      const evo = (r.evolution !== undefined && r.evolution > 0) ? ' · evo ' + T.EVOLUTIONS[Math.min(r.evolution, T.EVOLUTIONS.length - 1)].name : '';
      row.innerHTML =
        '<span class="rank-medal">' + medal + '</span>' +
        '<span class="rank-name">' + esc(r.name || 'Anônimo') + (r.admin ? ' <span class="rank-admin">🛡️ ADMIN</span>' : '') + evo + '</span>' +
        '<span class="rank-score">' + Leaderboard.fmtScore(r.log10) + '</span>';
      list.appendChild(row);
    }
    view.appendChild(list);
    const note = el('div', 'rank-note', online
      ? 'Envio automático a cada 90s. Métrica: dopamina total produzida (escala log).'
      : 'Sem login → seu progresso fica salvo apenas neste navegador. Clique em "ENTRAR / CRIAR CONTA".');
    view.appendChild(note);
  };
  function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

  /* ============================================================
     ABA ADMIN (admin hub) — só admins em modo admin
     Edita APENAS a própria conta (o servidor valida is_admin).
     ============================================================ */
  function buildAdminTab(t) {
    t.appendChild(el('div', 'admin-view', '<div class="notice">carregando…</div>'));
  }
  function renderAdminTab() {
    const view = tList('admin');
    view.innerHTML = '';
    view.appendChild(el('div', 'exp-head', '🛡️ <span class="hl">ADMIN HUB</span>' +
      '<span class="exp-head-sub">você só pode editar a SUA conta. Nada de mexer nos outros.</span>'));

    const head = el('div', 'admin-card');
    head.innerHTML = '<div class="admin-title">SESSÃO ADMIN ATIVA</div>' +
      '<div class="admin-sub">Modo admin: escondido do ranking e sem buffs. Para voltar ao jogo normal, desative o modo admin no botão do topo.</div>';
    view.appendChild(head);

    const form = el('div', 'admin-card');
    form.innerHTML = '<div class="admin-title">EDITAR MINHA CONTA</div>' +
      '<div class="admin-grid">' +
      '<label>Dopamina total (log10)<input class="imp-box" id="adm-dop" type="number" step="0.01" min="0" max="1200"></label>' +
      '<label>Prestige<input class="imp-box" id="adm-pres" type="number" min="0" max="1000000"></label>' +
      '<label>Pontos de prestige<input class="imp-box" id="adm-ppts" type="number" min="0" max="10000000"></label>' +
      '<label>Nível da conta<input class="imp-box" id="adm-lvl" type="number" min="1" max="999"></label>' +
      '<label>XP<input class="imp-box" id="adm-xp" type="number" min="0" max="999999999"></label>' +
      '<label>Tier de evolução<input class="imp-box" id="adm-tier" type="number" min="0" max="100"></label>' +
      '<label>Pontos de genealogia<input class="imp-box" id="adm-gp" type="number" min="0" max="1000000"></label>' +
      '<label>Battle Coins<input class="imp-box" id="adm-bc" type="number" min="0" max="1000000000"></label>' +
      '<label>Playtime (segundos)<input class="imp-box" id="adm-pts" type="number" min="0" max="100000000"></label>' +
      '</div>' +
      '<div class="admin-actions"><button class="btn primary" id="adm-save">SALVAR ALTERAÇÕES</button></div>' +
      '<div class="admin-status" id="adm-status"></div>';
    view.appendChild(form);

    // preenche com valores atuais
    const p = (window.TDFNet && window.TDFNet.progress) || {};
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setVal('adm-dop', p.total_dopamine_log10 != null ? p.total_dopamine_log10 : '');
    setVal('adm-pres', p.prestige != null ? p.prestige : '');
    setVal('adm-ppts', p.prestige_points != null ? p.prestige_points : '');
    setVal('adm-lvl', p.level != null ? p.level : '');
    setVal('adm-xp', p.xp != null ? p.xp : '');
    setVal('adm-tier', p.evolution_tier != null ? p.evolution_tier : '');
    setVal('adm-gp', p.genealogy_points != null ? p.genealogy_points : '');
    setVal('adm-bc', p.battle_coins != null ? p.battle_coins : '');
    setVal('adm-pts', p.playtime_sec != null ? p.playtime_sec : '');

    const saveBtn = document.getElementById('adm-save');
    const status = document.getElementById('adm-status');
    if (saveBtn) saveBtn.addEventListener('click', () => {
      const fields = {};
      const get = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
      const dop = parseFloat(get('adm-dop'));
      if (isFinite(dop)) fields.total_dopamine_log10 = dop;
      const pres = parseInt(get('adm-pres'), 10);
      if (isFinite(pres)) fields.prestige = pres;
      const ppts = parseInt(get('adm-ppts'), 10);
      if (isFinite(ppts)) fields.prestige_points = ppts;
      const lvl = parseInt(get('adm-lvl'), 10);
      if (isFinite(lvl)) fields.level = lvl;
      const xp = parseInt(get('adm-xp'), 10);
      if (isFinite(xp)) fields.xp = xp;
      const tier = parseInt(get('adm-tier'), 10);
      if (isFinite(tier)) fields.evolution_tier = tier;
      const gp = parseInt(get('adm-gp'), 10);
      if (isFinite(gp)) fields.genealogy_points = gp;
      const bc = parseInt(get('adm-bc'), 10);
      if (isFinite(bc)) fields.battle_coins = bc;
      const pts = parseInt(get('adm-pts'), 10);
      if (isFinite(pts)) fields.playtime_sec = pts;
      if (!Object.keys(fields).length) { status.textContent = 'Nada para salvar.'; return; }
      status.textContent = 'Salvando…';
      window.TDFNet.adminUpdate(fields)
        .then(() => {
          // aplica as edições também no SAVE LOCAL do jogo, para o admin ver
          // a mudança de verdade no farm (dopamina, prestige, tier, pontos)
          const st = G.s;
          if (st) {
            if (fields.total_dopamine_log10 != null) {
              const v = fields.total_dopamine_log10 > 0 ? N.fromLog10(fields.total_dopamine_log10) : N.zero;
              st.dopamine = v;
              st.totalEarned = N.max(st.totalEarned, v);
              st.bestRun = N.max(st.bestRun, v);
            }
            if (fields.prestige != null) {
              st.prestige = fields.prestige;
              st.counters.prestiges = Math.max(st.counters.prestiges, fields.prestige);
            }
            if (fields.prestige_points != null) {
              const delta = Math.max(0, fields.prestige_points - (st.counters.prestiges || 0));
              st.points = Math.max(0, delta);
            }
            if (fields.evolution_tier != null) {
              st.tier = Math.max(0, Math.min(T.EVOLUTIONS.length - 1, fields.evolution_tier));
            }
            G.save();
            renderAllSoon();
          }
          status.textContent = '✅ Alterações salvas na conta e no save local.';
          if (window.Expansion && window.Expansion.pollState) window.Expansion.pollState(true).catch(() => {});
          if (window.Leaderboard) window.Leaderboard.refresh().catch(() => {});
        })
        .catch((e) => { status.textContent = '❌ ' + (e.message || 'erro'); });
    });
  }

  /* ============================================================
     ABA PERFIL
     ============================================================ */
  function buildProfile(t) {
    t.appendChild(el('div', 'prof-view', '<div class="notice">carregando…</div>'));
  }
  function renderProfile() {
    const s = G.s;
    const view = tList('profile');
    view.innerHTML = '';
    const evo = activeEvo();
    const myTitle = s.title ? (T.TITLES.find((x) => x.id === s.title) || {}).name : null;
    const hero = el('div', 'prof-hero');
    hero.innerHTML =
      '<img class="prof-img" src="' + T.asset(evo.img) + '" alt="">' +
      '<div class="prof-name">' + (myTitle ? myTitle + ' ' : '') + 'THIEGO</div>' +
      '<div class="prof-meta">evo ' + T.EVOLUTIONS[s.tier].name + ' · ' + s.prestige + ' ascensões · ' + s.achievements.length + '/' + T.ACHIEVEMENTS.length + ' conquistas</div>';
    view.appendChild(hero);

    // títulos
    const tt = el('div', 'prof-sec');
    tt.appendChild(el('div', 'sec-title', 'TÍTULOS'));
    const tgrid = el('div', 'title-grid');
    for (const tit of T.TITLES) {
      const ok = s.title === tit.id;
      const can = tit.check(s, G.buildCtx());
      const b = el('button', 'title-card' + (ok ? ' equipped' : '') + (can ? '' : ' locked'));
      b.textContent = tit.name;
      if (can) b.addEventListener('click', () => { G.equipTitle(tit.id); window.AudioFX.sfx.evolve(); renderProfile(); });
      tgrid.appendChild(b);
    }
    tt.appendChild(tgrid);
    view.appendChild(tt);

    // conquistas (resumo; grade completa na aba CONQUISTAS)
    const ach = el('div', 'prof-sec');
    const pct = Math.round(100 * s.achievements.length / Math.max(1, T.ACHIEVEMENTS.length));
    ach.appendChild(el('div', 'sec-title', 'CONQUISTAS (' + s.achievements.length + '/' + T.ACHIEVEMENTS.length + ')'));
    const bar = el('div', 'ach-bar');
    bar.innerHTML = '<div class="ach-bar-fill" style="width:' + pct + '%"></div>';
    ach.appendChild(bar);
    view.appendChild(ach);

    // perfil da expansão (coleção, batalha, ranking)
    if (window.Expansion && Expansion.renderProfileInto) {
      const prof = el('div', 'exp-prof-wrap');
      view.appendChild(prof);
      Expansion.renderProfileInto(prof);
    }
  }

  /* ============================================================
     ABA ESTATÍSTICAS
     ============================================================ */
  function buildStats(t) {
    t.appendChild(el('div', 'stats-view', '<div class="notice">carregando…</div>'));
  }
  function renderStats() {
    const s = G.s;
    const v = tList('stats');
    v.innerHTML = '';
    const lb = window.Leaderboard || {};
    const rows = [
      ['⏱ Tempo jogado', fmtTime(s.playTime)],
      ['🕹 Cliques', s.counters.clicks.toLocaleString('pt-BR')],
      ['💥 Críticos', s.counters.crits.toLocaleString('pt-BR')],
      ['🔥 Maior combo', s.counters.maxCombo.toLocaleString('pt-BR')],
      ['🛒 Compras', s.counters.buys.toLocaleString('pt-BR')],
      ['⚡ Eventos vistos', s.counters.events.toLocaleString('pt-BR')],
      ['🎰 Eventos raros', (s.counters.rareEvents || 0).toLocaleString('pt-BR')],
      ['🔥 Dias seguidos', (s.dayStreak || 0).toLocaleString('pt-BR')],
      ['👾 Encontros', s.counters.encounters.toLocaleString('pt-BR')],
      ['💰 Maior clique', fmtMoney(s.stats.biggestClick)],
      ['🏭 Melhor DPS', fmtMoney(s.stats.bestDps)],
      ['🦄 Máx dopamina de uma vez', fmtMoney(s.stats.bigDopaminaAtOnce)],
      ['🌌 Ascensões', s.counters.prestiges.toLocaleString('pt-BR')],
      ['⛰ Pontos gastos', s.pointsSpent.toLocaleString('pt-BR')],
      ['📦 Offline acumulado', fmtTime(s.offlineTime)],
      ['🏆 Melhor posição global', lb.bestRank ? '#' + lb.bestRank : '—'],
      ['✅ Missões entregues', s.missionClaims.toLocaleString('pt-BR')],
    ];
    const table = el('div', 'stats-table');
    for (const [k, val] of rows) {
      const r = el('div', 'stat-row');
      r.innerHTML = '<span>' + k + '</span><b>' + val + '</b>';
      table.appendChild(r);
    }
    v.appendChild(table);
    const br = el('div', 'stat-break');
    br.innerHTML = '<div class="sec-title">PRODUÇÃO</div>';
    const bd = Econ.breakdown(s, G.runtime);
    const labels = { base: 'Geradores', evo: 'Evolução', prestige: 'Ascensão', achievements: 'Conquistas', upgrades: 'Upgrades', event: 'Eventos', total: 'TOTAL' };
    for (const k of Object.keys(bd)) {
      const r = el('div', 'stat-row' + (k === 'total' ? ' total' : ''));
      const vv = k === 'total' ? fmtMoney(bd[k]) : N.fmt(bd[k]) + '×';
      r.innerHTML = '<span>' + (labels[k] || k) + '</span><b>' + vv + '</b>';
      br.appendChild(r);
    }
    v.appendChild(br);
    const gr = el('div', 'graph-box');
    gr.innerHTML = '<div class="sec-title">PRODUÇÃO (últimos ~5 min, log10)</div>' +
      '<canvas id="prod-graph" role="img" aria-label="gráfico de produção de dopamina e DPS ao longo do tempo"></canvas>';
    v.appendChild(gr);
    drawGraph();
  }

  /* ============================================================
     ABA CONFIG
     ============================================================ */
  function buildSettings(t) {
    const v = el('div', 'set-view');
    t.appendChild(v);
  }
  function renderSettings() {
    const s = G.s;
    const v = tList('settings');
    v.innerHTML = '';
    const rows = [
      ['particles', 'Partículas', 'poeira de dopamina nas animações', () => s.settings.particles],
      ['animations', 'Animações', 'efeitos visuais de interface', () => s.settings.animations],
      ['perfMode', 'Modo performance', 'desliga partículas e pesados (celular fraco)', () => s.settings.perfMode],
      ['reducedMotion', 'Movimento reduzido', 'menos tremores e zooms', () => s.settings.reducedMotion],
      ['notifications', 'Notificações', 'toasts de conquistas', () => s.settings.notifications],
      ['autoPrestige', 'Prestige automático', 'executa ascensão automaticamente quando disponível', () => s.settings.autoPrestige],
      ['confirmPrestige', 'Confirmar ascensão', 'pede confirmação antes de ascender', () => s.settings.confirmPrestige],
      ['confirmReset', 'Confirmar reset', 'pede digitar THIEGO para resetar', () => s.settings.confirmReset],
      ['muted', 'Som ligado', 'SFX sintetizados', () => !s.settings.muted],
      ['music', 'Música ambiente', 'melodia simples de fundo', () => s.settings.music],
    ];
    for (const [key, name, desc, get] of rows) {
      const label = el('label', 'set-row');
      label.innerHTML = '<div><b>' + name + '</b><small>' + desc + '</small></div>';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = get();
      input.addEventListener('change', () => {
        const on = input.checked;
        if (key === 'muted') G.setSetting('muted', !on);
        else if (key === 'music') { G.setSetting('music', on); AudioFX.setMusic(on); }
        else G.setSetting(key, on);
      });
      label.appendChild(input);
      v.appendChild(label);
    }
    // volume
    const vol = el('label', 'set-row');
    vol.innerHTML = '<div><b>Volume</b><small>' + Math.round(s.settings.volume * 100) + '%</small></div>';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = 0; slider.max = 100; slider.value = Math.round(s.settings.volume * 100);
    slider.addEventListener('input', () => {
      G.setSetting('volume', slider.value / 100);
      AudioFX.setVolume(slider.value / 100);
      slider.parentElement.querySelector('small').textContent = Math.round(slider.value) + '%';
      if (+slider.value > 0) { G.setSetting('muted', false); AudioFX.enabled = true; }
    });
    vol.appendChild(slider);
    v.appendChild(vol);
    // numStyle
    const ns = el('label', 'set-row');
    ns.innerHTML = '<div><b>Formato de números</b><small>auto · científico · completo</small></div>';
    const sel = document.createElement('select');
    for (const [k, label] of [['auto', 'AUTO'], ['sci', 'CIENTÍFICO'], ['full', 'COMPLETO']]) {
      const o = document.createElement('option');
      o.value = k; o.textContent = label;
      if (k === s.settings.numStyle) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => { G.setSetting('numStyle', sel.value); renderSettings(); });
    ns.appendChild(sel);
    v.appendChild(ns);
    // som do clique (sintetizado ou MP3 custom)
    const cs = el('label', 'set-row');
    cs.innerHTML = '<div><b>Som do clique</b><small>clique sintetizado ou o BOOKFLOW.mp3</small></div>';
    const csSel = document.createElement('select');
    for (const [k, label] of [['synth', 'PADRÃO'], ['mp3', 'BOOKFLOW (MP3)']]) {
      const o = document.createElement('option');
      o.value = k; o.textContent = label;
      if (k === s.settings.clickSound) o.selected = true;
      csSel.appendChild(o);
    }
    csSel.addEventListener('change', () => {
      G.setSetting('clickSound', csSel.value);
      AudioFX.setClickSound(csSel.value);
      // toca um preview imediato
      if (csSel.value === 'mp3') {
        setTimeout(() => window.AudioFX.sfx.click(), 250);
      }
    });
    cs.appendChild(csSel);
    v.appendChild(cs);
    // export/import/reset
    const acts = el('div', 'set-actions');
    const sv = el('button', 'btn primary', '💾 SALVAR NO SERVIDOR');
    sv.addEventListener('click', () => saveToServerNow(sv));
    const exp = el('button', 'btn', 'EXPORTAR SAVE');
    exp.addEventListener('click', () => exportSave());
    const imp = el('button', 'btn', 'IMPORTAR SAVE');
    imp.addEventListener('click', () => importSave());
    const rst = el('button', 'btn danger', 'RESETAR TUDO');
    rst.addEventListener('click', () => resetGame());
    acts.append(sv, exp, imp, rst);
    v.appendChild(acts);
    v.appendChild(el('div', 'set-foot', saveFootText()));
  }

  /* ============================================================
     ABA SUGESTÕES (jogadores propõem ideias; likes sobem no topo;
     sugestões expiram após 7 dias)
     ============================================================ */
  function buildSuggestions(t) {
    t.appendChild(el('div', 'sug-view', '<div class="notice">carregando…</div>'));
  }
  function renderSuggestions() {
    const view = tList('suggestions');
    view.innerHTML = '';
    view.appendChild(el('div', 'sug-head', '💡 SUGESTÕES — <span class="hl">DÊ SUA IDEIA</span>' +
      '<span class="exp-head-sub">o que o povo curte sobe para o topo · sugestões expiram em 7 dias</span>'));

    // formulário
    const form = el('div', 'sug-form');
    const ta = el('textarea', 'imp-box sug-input');
    ta.placeholder = 'Escreva sua sugestão para o jogo… (ex: mais geradores, novo modo, balanceamento)';
    ta.maxLength = 500;
    const send = el('button', 'btn primary', 'ENVIAR SUGESTÃO');
    const status = el('div', 'sug-status');
    send.addEventListener('click', () => {
      const txt = ta.value.trim();
      if (!txt) { status.textContent = 'Escreva algo primeiro.'; return; }
      send.disabled = true; send.textContent = '…';
      window.TDFNet.suggestAdd(txt)
        .then(() => { send.disabled = false; send.textContent = 'ENVIAR SUGESTÃO'; ta.value = ''; status.textContent = '✅ Sugestão enviada!'; loadSugs(); })
        .catch((e) => { send.disabled = false; send.textContent = 'ENVIAR SUGESTÃO'; status.textContent = '❌ ' + (e.message || 'erro'); });
    });
    const row = el('div', 'sug-sendrow');
    row.appendChild(ta);
    row.appendChild(send);
    form.appendChild(row);
    form.appendChild(status);
    view.appendChild(form);

    const list = el('div', 'sug-list');
    view.appendChild(list);

    function loadSugs() {
      list.innerHTML = '<div class="notice">carregando…</div>';
      window.TDFNet.suggestList()
        .then((d) => {
          list.innerHTML = '';
          const sugs = d.suggestions || [];
          if (!sugs.length) {
            list.appendChild(el('div', 'exp-empty', 'Nenhuma sugestão ainda. Seja o primeiro a dar uma ideia!'));
            return;
          }
          for (const s of sugs) {
            const row = el('div', 'sug-item' + (s.liked ? ' liked' : ''));
            const left = el('div', 'sug-likebox');
            const likeBtn = el('button', 'btn small' + (s.liked ? ' active' : ''), (s.liked ? '❤️' : '🤍') + ' ' + s.likes);
            likeBtn.addEventListener('click', () => {
              const p = s.liked ? window.TDFNet.suggestUnlike(s.id) : window.TDFNet.suggestLike(s.id);
              p.then((r) => { s.liked = !s.liked; s.likes = r.likes; loadSugs(); }).catch(apiErr);
            });
            left.appendChild(likeBtn);
            row.appendChild(left);
            const body = el('div', 'sug-body');
            body.appendChild(el('div', 'sug-text', esc(s.text)));
            body.appendChild(el('div', 'sug-meta', esc(s.username) + (s.mine ? ' · <b>você</b>' : '') + ' · ' + esc(s.created_at)));
            row.appendChild(body);
            list.appendChild(row);
          }
        })
        .catch((e) => { list.innerHTML = ''; list.appendChild(el('div', 'notice', 'Erro: ' + esc(e.message))); });
    }
    loadSugs();
  }

  function saveFootText() {
    const lb = window.Leaderboard || {};
    const online = !!lb.online && !!lb.logged;
    const when = lb.lastSavedAt ? new Date(lb.lastSavedAt).toLocaleTimeString('pt-BR') : '—';
    return online
      ? 'v4 · 💾 save global sincronizado às ' + when + ' (auto ~30s)'
      : 'v4 · save local · faça login na aba THIEGOS para salvar no servidor';
  }
  function saveToServerNow(btn) {
    if (!(window.SaveNow)) {
      UI.toast('salvamento global indisponível', 'error');
      return;
    }
    const online = window.Leaderboard && window.Leaderboard.online && window.Leaderboard.logged;
    if (!online) {
      UI.toast('Faça login (aba THIEGOS) para salvar no servidor.', 'warn', 4500);
      return;
    }
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '...';
    window.SaveNow(true)
      .then((d) => {
        if (d && d.ok) { UI.toast('💾 Save salvo no servidor!', 'gold', 3500); G.save(); renderSettings(); }
        else if (d && d.error) UI.toast('Servidor recusou: ' + d.error, 'error', 4000);
        else UI.toast('nada a enviar', 'info');
      })
      .catch(() => { UI.toast('falha ao salvar no servidor', 'error'); })
      .finally(() => { if (btn) { btn.disabled = false; btn.innerHTML = orig; } });
  }

  function exportSave() {
    const txt = Save.export(G.s);
    if (!txt) { UI.toast('falha ao exportar', 'error'); return; }
    UI.toast('save copiado! cole em um arquivo .txt', 'info');
    navigator.clipboard && navigator.clipboard.writeText(txt).catch(() => {});
    openModal('EXPORTAR SAVE', '<textarea class="imp-box" readonly>' + esc(txt) + '</textarea>', [
      { label: 'FECHAR', cls: 'btn' },
    ]);
  }
  function importSave() {
    openModal('IMPORTAR SAVE', '<textarea class="imp-box" placeholder="cole o JSON do save aqui"></textarea>', [
      { label: 'CANCELAR', cls: 'btn' },
      {
        label: 'IMPORTAR', cls: 'btn primary', cb: () => {
          const ta = document.querySelector('#ui-modal textarea');
          if (!ta) return;
          if (Save.import(ta.value.trim())) {
            window.location.reload();
          } else {
            UI.toast('save inválido ou de versão mais nova', 'error');
          }
        },
      },
    ]);
  }
  function resetGame() {
    const doIt = () => {
      // Apagou de propósito: marca para o boot NÃO restaurar o backup do servidor.
      try { localStorage.setItem('tdf_no_restore', '1'); } catch (e) {}
      Save.reset();
      window.location.reload();
    };
    if (G.s.settings.confirmReset) {
      openModal('RESETAR TUDO', '<p>Digite <b>THIEGO</b> para confirmar. Isso apaga o save v4 deste navegador para sempre.</p>' +
        '<input class="imp-box" id="reset-conf" maxlength="20" placeholder="THIEGO">', [
        { label: 'CANCELAR', cls: 'btn' },
        { label: 'APAGAR TUDO', cls: 'btn danger', cb: () => { if ((document.getElementById('reset-conf') || {}).value === 'THIEGO') doIt(); else UI.toast('digite THIEGO', 'warn'); } },
      ]);
    } else doIt();
  }

  /* ============================================================
     TOASTS (conquistas / gerais)
     ============================================================ */
  UI.toast = function (msg, kind, dur) {
    Fx.toast(msg, kind, dur);
  };
  function toastQueue(items, kind, title) {
    const queue = [];
    for (const it of items) {
      queue.push({
        icon: '🏆',
        title: title,
        name: it.name,
        img: it.img ? T.asset(it.img) : null,
      });
    }
    showNext(queue);
  }
  function showNext(queue) {
    if (!queue.length) return;
    const it = queue.shift();
    const card = el('div', 'toast-big toast-ach');
    card.innerHTML = (it.img ? '<img src="' + it.img + '" alt="" loading="lazy">' : '<div class="tbig-icon">' + it.icon + '</div>') +
      '<div><div class="tbig-title">' + it.title + '</div><div class="tbig-name">' + esc(it.name) + '</div></div>';
    document.body.appendChild(card);
    setTimeout(() => card.classList.add('in'), 30);
    setTimeout(() => {
      card.classList.remove('in');
      setTimeout(() => card.remove(), 500);
      showNext(queue);
    }, 3600);
  }
  UI.achievementToasts = function (fresh) {
    toastQueue(fresh || [], 'achievement', 'CONQUISTA DESBLOQUEADA!');
  };

  /* ============================================================
     ENCONTROS
     ============================================================ */
  UI.showEncounter = function (enc) {
    if (!enc) return;
    const cur = document.querySelector('.enc-overlay');
    if (cur) cur.remove();
    const ov = el('div', 'enc-overlay');
    const card = el('div', 'enc-card');
    const gainStr = enc.instantGain ? fmtMoney(enc.instantGain) : (enc.time > 0 ? 'bônus ativo por ' + fmtTime((enc.end - Date.now()) / 1000) : '');
    card.innerHTML =
      '<div class="enc-name">' + (enc.name || (enc.encounter && enc.encounter.name) || '???') + '</div>' +
      '<img src="' + enc.img + '" alt="" loading="lazy">' +
      '<div class="enc-quote">' + esc(enc.quote || '') + '</div>' +
      (gainStr ? '<div class="enc-gain">+' + gainStr + '</div>' : '') +
      '<button class="btn small">fechar</button>';
    card.querySelector('button').addEventListener('click', () => ov.remove());
    ov.appendChild(card);
    document.body.appendChild(ov);
    setTimeout(() => ov.classList.add('in'), 30);
    if (!enc.time && !enc.instant) setTimeout(() => ov.remove(), 4000);
  };

  /* ============================================================
     MODAL genérico
     ============================================================ */
  function openModal(title, bodyHtml, buttons) {
    closeModal();
    const m = el('div', 'ui-modal', '');
    m.id = 'ui-modal';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    const box = el('div', 'modal-box');
    const head = el('div', 'modal-head');
    head.appendChild(el('div', 'modal-title', title));
    const x = el('button', 'modal-x', '✕');
    x.type = 'button';
    x.setAttribute('aria-label', 'Fechar');
    x.title = 'Fechar (Esc)';
    x.addEventListener('click', () => closeModal());
    head.appendChild(x);
    box.appendChild(head);
    const body = el('div', 'modal-body');
    if (typeof bodyHtml === 'string') body.innerHTML = bodyHtml;
    else body.appendChild(bodyHtml);
    box.appendChild(body);
    const footer = el('div', 'modal-foot');
    for (const b of (buttons || [])) {
      const btn = el('button', b.cls || 'btn', b.label);
      btn.addEventListener('click', () => {
        closeModal();
        if (b.cb) b.cb();
      });
      footer.appendChild(btn);
    }
    box.appendChild(footer);
    m.appendChild(box);
    m.addEventListener('click', (e) => { if (e.target === m) closeModal(); });
    document.body.appendChild(m);
    setTimeout(() => m.classList.add('in'), 10);
    return m;
  }
  function closeModal() {
    const m = document.getElementById('ui-modal');
    if (m) m.remove();
    const cp = document.getElementById('cp-modal');
    if (cp) cp.remove();
  }
  // Esc fecha o modal aberto (Hub de conteúdo e genérico)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const cpM = document.getElementById('cp-modal');
    const uiM = document.getElementById('ui-modal');
    if (!cpM && !uiM) return;
    // não fecha enquanto o jogador está digitando em inputs dentro do modal
    const tag = ((document.activeElement || {}).tagName || '').toUpperCase();
    if (tag === 'TEXTAREA') return;
    e.preventDefault();
    if (cpM) cpM.remove();
    else if (uiM) uiM.remove();
  });
  UI.closeModal = closeModal;

  /* ============================================================
     OFFLINE (vindo de Game.applyOffline no boot)
     ============================================================ */
  UI.showOffline = function (off) {
    if (!off) return;
    UI.toast('bem-vindo de volta após ' + fmtTime(off.elapsed) + '!', 'info', 5000);
    openModal('BEM-VINDO DE VOLTA', '<p>Você ficou offline por <b>' + fmtTime(off.elapsed) + '</b>.</p>' +
      '<p>Produziu <b class="hl">+' + fmtMoney(off.gain) + '</b> de dopamina com <b>' + Math.round(off.eff * 100) + '%</b> de eficiência offline.</p>', [
      { label: 'PROCESSAR!', cls: 'btn primary', cb: () => { UI.flush(); renderAllSoon(); } },
    ]);
  };

  /* ============================================================
     DENIED (sem dinheiro / sem condição)
     ============================================================ */
  function denied() {
    window.AudioFX.sfx.denied();
    const btn = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    Fx.shake(3);
  }

  /* ---------- utils de lista corrente ---------- */
  function tList(tab) {
    return document.querySelector('#tab-' + tab + ' > div:last-child');
  }

  /* ---------- expõe render manual ---------- */
  UI.render = function () { renderTab(selectedTab); UI.tick(0.2); };
  UI.renderTab = renderTab;

  /* ============================================================
     🧠 ABA CÉREBRO — Sistema de Dopamina Neurocientífico
     ============================================================ */
  function buildBrain(t) {
    t.innerHTML =
      '<div class="brain-view">' +
      '  <div class="brain-header">' +
      '    <div class="brain-mood" id="brain-mood"></div>' +
      '    <div class="brain-level" id="brain-level"></div>' +
      '  </div>' +
      '  <div class="brain-section">' +
      '    <div class="brain-section-title">🎯 Vias Dopaminérgicas</div>' +
      '    <div class="brain-pathways" id="brain-pathways"></div>' +
      '  </div>' +
      '  <div class="brain-section">' +
      '    <div class="brain-section-title">🔬 Receptores</div>' +
      '    <div class="brain-receptors" id="brain-receptors"></div>' +
      '  </div>' +
      '  <div class="brain-section">' +
      '    <div class="brain-section-title">⚗️ Ciclo da Dopamina</div>' +
      '    <div class="brain-cycle" id="brain-cycle"></div>' +
      '  </div>' +
      '</div>';
  }
})();
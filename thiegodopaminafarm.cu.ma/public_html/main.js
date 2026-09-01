/* ============================================================
   THIEGO DOPAMINA FARM — main.js
   Boot: carrega save, aplica offline/settings, inicia loop e
   atalhos. Códigos secretos: konami, "cotaprice", "thiega",
   "gestante". Space = clique no Thiego.
   ============================================================ */
(function () {
  'use strict';
  const T = window.TDF;
  const N = window.Num;
    const G = window.Game;
  const UI = window.UI;
  const Fx = window.Fx;
  const J = window.Juice || {};

  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  const CODES = {
    'cotaprice': 'code',
    'thiega': 'thiega',
    'gestante': 'gestante',
  };
  let seq = [];
  let typed = '';

  function boot() {
    const res = G.load();
    if (res && res._tooNew) {
      document.getElementById('app').innerHTML =
        '<div class="boot-error"><h1>SAVE MUITO NOVO</h1><p>Seu save é de uma versão futura do jogo.</p>' +
        '<button class="btn" onclick="localStorage.removeItem(window.Save.KEY);location.reload()">APAGAR E RECOMEÇAR</button></div>';
      return;
    }

        applySettings();
    Fx.init(document.body);
    UI.init();
    J.init(window.Game.state);
    // HUB de conteúdo (plano de conteúdo)
    if (window.ContentPanel && window.ContentPanel.init) {
      try { window.ContentPanel.init(); } catch (e) { console.warn('ContentPanel init', e); }
      try { window.ContentPanel.applyTheme(); } catch (e) {}
      try { window.ContentPanel.applyCosmetics(); } catch (e) {}
    }

    // novos módulos: IndexedDB, fundo WebGL, push
    if (window.BG3D && window.BG3D.init) {
      try { window.BG3D.init(); } catch (e) {}
    }
    if (window.DB && window.DB.saveBackup) {
      try { window.DB.saveBackup(G.state); } catch (e) {}
    }
    if (window.PWA && window.PWA.swReg === undefined) {
      // pwa.js se registra sozinho no DOMContentLoaded
    }

    // offline
    const last = (G.state.timestamps && G.state.timestamps.savedAt) || Date.now();
    const elapsed = (Date.now() - last) / 1000;
    const off = G.applyOffline(G.state, elapsed);
    if (off) UI.showOffline(off);
    G.tickDayStreak();
    G.checkMilestones(true);
    G.save();

    // ranking: restaura melhor posição e atualiza em silêncio
    window.Leaderboard.bestRankFromStorage();
    window.Leaderboard.refresh().catch(() => {}).then(() => {
      // Restauração de save: se o backup do servidor é MAIOR que o save
      // local (troca de PC/navegador), adota automaticamente quando o local
      // é novo; com progresso local real, pede confirmação.
      window.RestoreServerSave && window.RestoreServerSave();
    }).catch(() => {});

    // expansão: sessão do servidor + HUD
    if (window.Expansion && window.Expansion.boot) window.Expansion.boot();

    // recuperação local (IndexedDB): roda tardiamente para não disputar com
    // o RestoreServerSave, que tem prioridade
    setTimeout(() => {
      try { window.RecoverLocalBackup && window.RecoverLocalBackup(); } catch (e) {}
    }, 8000);

    // desbloqueio de áudio no primeiro gesto
    const unlockOnce = () => {
      window.AudioFX.unlock();
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
    window.addEventListener('pointerdown', unlockOnce);
    window.addEventListener('keydown', unlockOnce);

    window.addEventListener('keydown', onKey);
    // flush de saída: beforeunload cobre desktop; pagehide cobre mobile/bfcache
    function flushOnExit() {
      G.save();
      beaconRank();
      if (window.Expansion && window.Expansion.netReady) window.Expansion.sync(true).catch(() => {});
    }
    window.addEventListener('beforeunload', flushOnExit);
    window.addEventListener('pagehide', () => { try { flushOnExit(); } catch (e) {} });
    window.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        G.save();
        beaconRank();
        if (window.Expansion && window.Expansion.netReady) window.Expansion.sync(true).catch(() => {});
      }
    });

    lastT = performance.now();
    requestAnimationFrame(loop);
  }

  function applySettings() {
    const st = G.state.settings || {};
    document.body.classList.toggle('perf', !!st.perfMode);
    document.body.classList.toggle('reduce-motion', !!st.reducedMotion);
    window.AudioFX.setVolume(st.volume !== undefined ? st.volume : 0.65);
    window.AudioFX.enabled = !st.muted;
    window.AudioFX.setMusic(!!st.music && !st.muted);
    if (st.clickSound === 'mp3') window.AudioFX.setClickSound('mp3');
    try {
      window.Fx.setParticles(!!st.particles && !st.perfMode);
      window.Fx.setAnimations(st.animations !== false);
    } catch (e) {}
  }

  /* ---------- loop ---------- */
  let lastT = 0;
  let autosaveAcc = 0;
  let svAcc = 0;
  let lbAcc = 0;
  let rankRefreshAcc = 0;
  let lbTimer = 90000 + Math.random() * 30000;

  function loop(now) {
    const dt = Math.min(1, (now - lastT) / 1000 || 0);
    lastT = now;

    G.tick(dt);
    UI.tick(dt);
    if (window.Expansion && window.Expansion.tick) window.Expansion.tick(dt);
    Fx.update(dt);
    Fx.draw();
    UI.flush();

    autosaveAcc += dt;
    if (autosaveAcc >= 15) { autosaveAcc = 0; G.save(); }

    // IndexedDB: amostra de produção + backup do save
    if (window.DB && window.DB.tick) {
      try { window.DB.tick(dt, G.state); } catch (e) {}
    }

    // auto-save do SAVE COMPLETO no servidor (~30s) quando logado
    svAcc += dt;
    if (svAcc >= 30) {
      svAcc = 0;
      // journal local em IndexedDB junto do autosave: mesmo que o localStorage
      // falhe (quota/privado), há snapshot de recuperação recente
      try { window.DB && window.DB.saveBackup && window.DB.saveBackup(G.state); } catch (e) {}
      saveToServer();
    }

    // refresh da LISTA do ranking: independente do submit (GET sem rate
    // limit de 90s). Com a aba ranking aberta atualiza a cada 30s para
    // mostrar os status mais recentes dos jogadores; fechada, a cada 90s.
    rankRefreshAcc += dt;
    {
      const isRankOpen = window.UI && window.UI.selectedTab === 'ranking';
      const interval = isRankOpen ? 30 : 90;
      if (rankRefreshAcc >= interval) {
        rankRefreshAcc = 0;
        window.Leaderboard.refresh().catch(() => {});
      }
    }

    lbAcc += dt;
    if (lbAcc >= lbTimer) {
      lbAcc = 0;
      // submit do score: rate limit do servidor é 90s para score puro
      lbTimer = 90000 + Math.random() * 30000;
      window.Leaderboard.submit(false).catch(() => {});
    }

    requestAnimationFrame(loop);
  }

  /* ---------- teclado ---------- */
  function onKey(e) {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
    if (!typing && (e.code === 'Space' || e.code === 'Enter')) {
      e.preventDefault();
      const btn = document.getElementById('farm-btn');
      if (btn) {
        const r = btn.getBoundingClientRect();
        btn.dispatchEvent(new PointerEvent('pointerdown', {
          clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true,
        }));
      }
    }

    // códigos secretos
    if (!typing) {
      const k = e.key;
      seq.push(k);
      if (seq.length > KONAMI.length) seq.shift();
      if (seq.join('|').toLowerCase() === KONAMI.join('|').toLowerCase()) {
        seq = [];
        G.addSecret('konami');
        UI.toast('CÓDIGO KONAMI! +1 segredo', 'secret', 5000);
        Fx.flash('#ff0000', 400);
        window.AudioFX.sfx.secret();
      }
      if (/^[a-z]$/i.test(k)) {
        typed += k.toLowerCase();
        if (typed.length > 10) typed = typed.slice(-10);
        for (const code in CODES) {
          if (typed.endsWith(code)) {
            typed = '';
            G.addSecret(CODES[code]);
            UI.toast('SEGREDO DESCOBERTO: "' + code + '"', 'secret', 5000);
            Fx.flash('#ffd700', 400);
            window.AudioFX.sfx.secret();
          }
        }
      }
    }
  }

  /* ---------- beacon do ranking no unload ---------- */
  // Restaura o save do servidor quando ele é MAIOR que o local (troca de
  // PC/navegador). Chamado no boot e após login. Adota AUTOMATICAMENTE
  // quando o save local é novo (sem progresso real) — sem prompt — e pede
  // confirmação quando o jogador tem progresso local real.
  window.RestoreServerSave = function () {
    const lb = window.Leaderboard;
    if (!lb || !lb.online || !lb.logged) return Promise.resolve(null);
    // modo admin: save de admin é local e separado — nunca restaurar do servidor
    const u = window.TDFNet && window.TDFNet.user;
    if (u && u.admin_mode === 1) return Promise.resolve(null);
    try {
      if (localStorage.getItem('tdf_no_restore')) return Promise.resolve(null);
    } catch (e) { return Promise.resolve(null); }
    const currentUser = (window.TDFNet && window.TDFNet.user && window.TDFNet.user.username) || null;
    return lb.restoreSave().then((cmp) => {
      const local = window.Game && window.Game.state;
      const ownerChanged = lb.saveOwner && currentUser && lb.saveOwner !== currentUser;

      if (ownerChanged) {
        // Save local pertence a OUTRA conta: nunca misturar. Se a conta atual
        // tem save no servidor, adota (mesmo que o local seja maior — é de
        // outra conta); senão, zera o save local para começar limpo.
        if (cmp && cmp.save) {
          if (window.Save.import(cmp.save)) {
            if (cmp.serverRevision > 0) lb.setSaveRevision(cmp.serverRevision);
            lb.setSaveOwner(currentUser);
            window.Game.load();
            if (window.UI && window.UI.toast) window.UI.toast('💾 Progresso de ' + currentUser + ' carregado', 'gold', 4000);
            if (window.UI && window.UI.touchSaveStatus) window.UI.touchSaveStatus();
            return cmp;
          }
        } else {
          // conta nova: recomeça do zero (sem o save da conta anterior)
          window.Save.reset();
          window.Game.load();
          lb.clearSaveRevision();
          lb.setSaveOwner(currentUser);
          if (window.UI && window.UI.toast) window.UI.toast('👋 Conta ' + currentUser + ' — novo começo!', 'info', 3500);
          return { reset: true };
        }
      }

      if (!cmp || !cmp.restore) return cmp;
      const localFresh = window.Game && window.Game.isFreshSave && window.Game.isFreshSave();
      const doImport = () => {
        if (window.Save.import(cmp.save)) {
          if (cmp.serverRevision > 0) lb.setSaveRevision(cmp.serverRevision);
          lb.setSaveOwner(currentUser);
          window.Game.load();
          if (window.UI && window.UI.toast) {
            window.UI.toast('💾 Progresso da conta carregado', 'gold', 4000);
          }
          if (window.UI && window.UI.touchSaveStatus) window.UI.touchSaveStatus();
          return true;
        }
        if (window.UI && window.UI.toast) window.UI.toast('falha ao restaurar backup', 'error');
        return false;
      };
      if (localFresh) {
        // PC novo / save vazio: restaura sozinho, sem perguntar
        return doImport();
      }
      // Há progresso local real: pergunta antes de substituir
      const localFmt = N.fmt(N.fromLog10(cmp.localLog10));
      const backupFmt = N.fmt(N.fromLog10(cmp.backupLog10));
      if (window.confirm('Encontramos um backup do seu save no servidor (' + backupFmt +
        ' · ' + (cmp.backupAt ? new Date(cmp.backupAt.replace(' ', 'T')).toLocaleDateString('pt-BR') : '?') +
        '), maior que o save atual (' + localFmt + '). Restaurar o backup?')) {
        return doImport();
      }
      return cmp;
    }).catch(() => null);
  };

  /* ---------- falhas de gravação local (state.js emite o evento) ---------- */
  // localStorage pode falhar silenciosamente (quota/privado). Antes isso era
  // engolido e o jogo continuava "salvando" nada — ao recarregar, o jogador
  // voltava para um estado antigo. Agora o problema é visível de imediato.
  let _staleWarned = 0;
  window.addEventListener('tdf_save_issue', (e) => {
    const kind = e && e.detail && e.detail.kind;
    if (kind === 'error') {
      lbRef()._saveFailed = true;
      UI.touchSaveStatus();
      UI.toast('⚠️ Falha ao salvar no navegador! Não feche a página — faça login para salvar na conta.', 'error', 8000);
    } else if (kind === 'stale') {
      const now = Date.now();
      if (now - _staleWarned < 120000) return;
      _staleWarned = now;
      UI.toast('⚠️ Este jogo está aberto em OUTRA aba com progresso mais recente. Feche a aba antiga.', 'warn', 9000);
    }
  });

  function lbRef() { return window.Leaderboard || {}; }

  /* ---------- recuperação local (última linha de defesa) ---------- */
  // Se o backup do IndexedDB tem progresso MUITO maior que o save carregado
  // (localStorage apagado/corrompido/quota cheia), oferece restaurar.
  // Nunca substitui automaticamente sem confirmar — e o servidor continua
  // sendo a fonte prioritária via RestoreServerSave.
  window.RecoverLocalBackup = function () {
    if (!window.DB || !window.DB.loadBackup) return Promise.resolve(false);
    const s = G.state;
    if (!s) return Promise.resolve(false);
    try { if (localStorage.getItem('tdf_no_restore')) return Promise.resolve(false); } catch (e) {}
    return window.DB.loadBackup().then((bk) => {
      if (!bk) return false;
      let bkLog = -1;
      try { bkLog = N.log10(N.fromF(bk.totalEarned || { m: 0, e: 0 })); } catch (e) {}
      const localLog = N.log10(s.totalEarned);
      if (!(bkLog > localLog + 0.5)) return false; // só quando há perda real
      const bkAt = bk.savedAt || null;
      const okRestore = window.confirm(
        'Encontramos um backup LOCAL mais recente (' +
        N.fmt(N.fromLog10(bkLog)) +
        (bkAt ? ' · ' + new Date(bkAt).toLocaleString('pt-BR') : '') +
        ') do que o save atual (' + N.fmt(N.fromLog10(localLog)) + ').\n\nRestaurar o backup local?'
      );
      if (!okRestore) return false;
      if (!window.Save.import(JSON.stringify(bk))) {
        UI.toast('Falha ao restaurar backup local.', 'error');
        return false;
      }
      G.load();
      G.save();
      UI.toast('💾 Backup local restaurado!', 'gold', 5000);
      if (UI.touchSaveStatus) UI.touchSaveStatus();
      return true;
    }).catch(() => false);
  };

  // Envia o save completo para o servidor (backup global). Chamado pelo
  // auto-save periódico, pelo botão "salvar" e no unload/hide.
  // Trata conflito (409): se o servidor tem um save MAIOR (outro dispositivo
  // salvou mais recente), adota o save do servidor; se o LOCAL é maior
  // (jogou offline/em outro dispositivo), força o envio — o servidor aceita
  // por ser progresso maior (proteção monotônica nunca é pulada).
  function resolveSaveConflict(err) {
    const lb = window.Leaderboard;
    const local = window.Game && window.Game.state;
    if (!err || !err.server_save || !local) return false;
    let serverLog = -1;
    try { serverLog = N.log10(N.fromF(JSON.parse(err.server_save).totalEarned || { m: 0, e: 0 })); } catch (e) {}
    const localLog = N.log10(local.totalEarned);
    if (localLog > serverLog + 0.001) {
      // progresso local é maior: refaz com force (servidor aceita por ser maior)
      return lb.submitSave(true).then((d) => {
        if (d && d.ok) return true;
        return false;
      }).catch(() => false);
    }
    // servidor vence: adota o save do servidor (restauração automática)
    if (window.Save.import(err.server_save)) {
      if (err.server_revision != null && err.server_revision > 0) lb.setSaveRevision(err.server_revision);
      window.Game.load();
      window.UI && window.UI.toast('Outro dispositivo salvou mais recentemente — progresso atualizado.', 'warn', 5000);
      return Promise.resolve(true);
    }
    return false;
  }

  function saveToServer() {
    const lb = window.Leaderboard;
    if (lb && lb.submitSave) {
      lb.submitSave(false)
        .catch((err) => {
          // 409 = conflito de save: decide pelo maior progresso
          if (err && err.server_save) return resolveSaveConflict(err);
          return null;
        });
    }
    if (window.Expansion && window.Expansion.netReady && window.Expansion.sync) {
      window.Expansion.sync(false).catch(() => {});
    }
  }
  window.SaveNow = function (force) {
    const lb = window.Leaderboard;
    if (!lb || !lb.submitSave) return Promise.resolve(null);
    if (!lb.online || !lb.logged) return Promise.resolve({ ok: false, error: 'not_logged' });
    return lb.submitSave(!!force)
      .then((d) => {
        if (d && d.ok) {
          if (window.UI && window.UI.touchSaveStatus) window.UI.touchSaveStatus();
        }
        return d;
      })
      .catch((err) => {
        if (err && err.server_save) return resolveSaveConflict(err);
        return { ok: false, error: (err && err.message) || 'save_failed' };
      });
  };

  function beaconRank() {
    const lb = window.Leaderboard;
    if (!lb || !lb.online || !lb.logged) return;
    const s = G.state;
    if (!s) return;
    const sExp = (window.Save && (window.Save.export(s) || '')) || '';
    const myLog = N.log10(s.totalEarned);
    const payload = JSON.stringify({
      log10: isFinite(myLog) && myLog > 0 ? myLog : 0,
      prestige: s.prestige,
      evolution: s.tier,
      playtime: Math.max(0, s.playTime),
      flags: window.AC ? Math.min(10, window.AC.flags) : 0,
      departing: true,
      save: sExp && sExp.length <= 200000 ? sExp : undefined,
    });
    try {
      navigator.sendBeacon('api/ranking.php', new Blob([payload], { type: 'application/json' }));
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
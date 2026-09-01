/* ============================================================
   THIEGO DOPAMINA FARM — leaderboard.js
   Ranking GLOBAL real via api/ranking.php (sessão do jogo).
   Sem login → MODO LOCAL explícito (localStorage), nunca finge
   que está online. Métrica: DOPAMINA TOTAL PRODUZIDA (log10).
   ============================================================ */
(function () {
  'use strict';
  const N = window.Num;
  const AC = window.AC;
  const LB = window.Leaderboard = {
    online: false,       // servidor respondeu?
    logged: false,       // usuário logado no jogo?
    list: [],
    me: null,
    bestRank: null,      // melhor posição global já vista (persistido)
    localRank: null,     // posição no modo local
    mode: 'global',
    sort: 'score',
    _lastSubmitAt: 0,
    _lastFetch: 0,
    lastSavedAt: null,     // último backup do save no servidor (Date.now)
    lastSavedError: null,
    buffs: null,           // {dopamine, prestige} para o usuário logado (top 3)
  };

  const LOCAL_KEY = 'tdf_rank_local';

  function localEntries() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function saveLocal(entries) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(entries.slice(0, 500))); } catch (e) {}
  }

  LB.refresh = function (opts) {
    if (opts) {
      LB.mode = opts.mode || LB.mode;
      LB.sort = opts.sort || LB.sort;
    }
    const q = 'api/ranking.php?mode=' + encodeURIComponent(LB.mode) + '&sort=' + encodeURIComponent(LB.sort);
    return fetch(q, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error('http_' + r.status);
        return r.json();
      })
      .then((data) => {
        if (!data || !data.ok) throw new Error('bad');
        LB.online = true;
        LB.logged = !!data.logged;
        LB.list = Array.isArray(data.list) ? data.list : [];
        LB.buffs = data.buffs || null;
        // aplica buffs de top 3 (produção / prestige) no motor de economia
        if (window.Econ) {
          window.Econ.rankDopMult = (LB.buffs && LB.buffs.dopamine) ? 1 + LB.buffs.dopamine : 1;
          window.Econ.rankPresMult = (LB.buffs && LB.buffs.prestige) ? 1 + LB.buffs.prestige : 1;
        }
        LB.me = data.me && data.me.rank ? data.me : null;
        if (LB.me) {
          if (!LB.bestRank || LB.me.rank < LB.bestRank) LB.bestRank = LB.me.rank;
          try { localStorage.setItem('tdf_best_rank', String(LB.bestRank)); } catch (e) {}
        }
        window.Game && window.Game.checkAchievements(true);
        window.UI && window.UI.renderRanking();
        return data;
      })
      .catch(() => {
        LB.online = false;
        LB.logged = false;
        LB.buffs = null;
        if (window.Econ) { window.Econ.rankDopMult = 1; window.Econ.rankPresMult = 1; }
        const entries = localEntries();
        const my = N.fromF(window.Game.state.totalEarned);
        const myLog = N.log10(my);
        const better = entries.filter((e) => e.log10 > myLog).length;
        LB.localRank = better + 1;
        LB.list = entries.slice(0, 50).map((e, i) => ({ rank: i + 1, name: e.name, log10: e.log10, prestige: e.prestige, evolution: e.evolution, local: true }));
        // posiciona "você" na lista local
        LB.me = { rank: LB.localRank, name: 'Você', log10: myLog, prestige: window.Game.state.prestige, evolution: window.Game.state.tier, local: true };
        window.UI && window.UI.renderRanking();
        return { ok: true, online: false };
      });
  };

  LB.submit = function (force) {
    const s = window.Game && window.Game.state;
    if (!s) return Promise.resolve(null);
    // modo admin: nunca envia score/save (fica invisível e não polui o save normal)
    const u = window.TDFNet && window.TDFNet.user;
    if (u && u.admin_mode === 1) return Promise.resolve(null);
    const now = Date.now();
    if (!force && now - LB._lastSubmitAt < 90000) return Promise.resolve(null);
    LB._lastSubmitAt = now;

    const myLog = N.log10(s.totalEarned);
    AC.sample(myLog);

    const payload = {
      // save zerado → 0 (nunca -Infinity: o servidor rejeita score_invalid)
      log10: isFinite(myLog) && myLog > 0 ? myLog : 0,
      prestige: s.prestige,
      evolution: s.tier,
      playtime: Math.max(0, s.playTime),
      flags: AC.flags > 0 ? Math.min(10, AC.flags) : 0,
    };

    // Backup do save completo (só quando online): permite restaurar o
    // progresso em outro navegador/PC. Enviado junto do POST normal.
    if (LB.online && LB.logged) {
      const exp = window.Save && window.Save.export(s);
      if (exp && exp.length > 0 && exp.length <= 200000) payload.save = exp;
    }

    // Modo local: salva em localStorage claramente rotulado como local.
    if (!LB.online || !LB.logged) {
      const entries = localEntries();
      entries.unshift({
        name: 'Você', log10: payload.log10, prestige: payload.prestige,
        evolution: payload.evolution, t: now,
      });
      const seen = new Set();
      const uniq = [];
      for (const e of entries) {
        const k = e.log10 + '|' + e.prestige;
        if (seen.has(k)) continue;
        seen.add(k);
        uniq.push(e);
      }
      uniq.sort((a, b) => b.log10 - a.log10);
      saveLocal(uniq);
      LB.list = uniq.slice(0, 50).map((e, i) => ({ rank: i + 1, name: e.name, log10: e.log10, prestige: e.prestige, evolution: e.evolution, local: true }));
      const better = uniq.filter((e) => e.log10 > payload.log10).length;
      LB.localRank = better + 1;
      LB.me = { rank: LB.localRank, name: 'Você', log10: payload.log10, prestige: payload.prestige, evolution: payload.evolution, local: true };
      window.UI && window.UI.renderRanking();
      return Promise.resolve({ ok: true, local: true });
    }

    return fetch('api/ranking.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    })
      .then((r) => (r.ok ? r.json() : r.json().then((j) => { throw new Error(j.error || 'http'); })))
      .then((data) => {
        LB.lastSavedAt = Date.now();
        return data;
      })
      .catch((err) => {
        const msg = String((err && err.message) || err || '');
        // Só sessão perdida (401/not_logged) ou falha de rede derrubam para o
        // modo local. Rejeições transitórias (rate_limit, too_early,
        // growth_impossible, time_rewind…) NÃO devem rebaixar o ranking: o
        // usuário continua logado/online e o envio apenas é pulado neste ciclo.
        if (/not_logged|401|failed to fetch|networkerror|http_401/i.test(msg)) {
          LB.online = false; LB.logged = false;
        }
        return { ok: false, error: msg };
      });
  };

  // Faz o backup do SAVE completo (JSON) no servidor, independente do score
  // do ranking. Usado pelo botão "salvar" e pelo auto-save. Não grava no
  // modo local e não rebaixa o modo global em erros transitórios.
  // Retorna Promise com {ok, save_stored, save_revision} ou, em conflito,
  // rejeita com Error contendo server_save/server_revision (o chamador decide).
  LB.submitSave = function (force) {
    const s = window.Game && window.Game.state;
    if (!s) return Promise.resolve(null);
    const u = window.TDFNet && window.TDFNet.user;
    if (u && u.admin_mode === 1) return Promise.resolve(null);
    if (!LB.online || !LB.logged) return Promise.resolve(null);
    const now = Date.now();
    if (!force && LB.lastSavedAt && now - LB.lastSavedAt < 15000) return Promise.resolve(null);
    const exp = window.Save && window.Save.export(s);
    if (!exp || exp.length === 0 || exp.length > 200000) return Promise.resolve(null);
    // log10 do totalEarned: save zerado → 0 (nunca -Infinity, que o servidor
    // rejeita como score_invalid antes de processar o save)
    const myLog = N.log10(s.totalEarned);
    const payload = {
      log10: isFinite(myLog) && myLog > 0 ? myLog : 0,
      prestige: s.prestige,
      evolution: s.tier,
      playtime: Math.max(0, s.playTime),
      flags: 0,
      save: exp,
      // revisão que o cliente carregou: permite ao servidor detectar conflito
      // (outro dispositivo salvou mais recente) e recusar overwrite cego.
      base_revision: LB.saveRevision != null ? LB.saveRevision : null,
      force: !!force,
    };
    return fetch('api/ranking.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    })
      .then((r) => (r.ok ? r.json() : r.json().then((j) => { const e = new Error(j.error || 'http'); e.status = r.status; if (j.server_save) e.server_save = j.server_save; if (j.server_revision != null) e.server_revision = j.server_revision; if (j.server_saved_at) e.server_saved_at = j.server_saved_at; throw e; })))
      .then((data) => {
        LB.lastSavedAt = Date.now();
        if (data && typeof data.save_revision === 'number' && data.save_revision > 0) {
          LB.saveRevision = data.save_revision;
        }
        // marca o dono do save local: a partir de agora este navegador
        // pertence a esta conta (evita misturar contas na troca de login)
        const u = window.TDFNet && window.TDFNet.user && window.TDFNet.user.username;
        if (u) LB.setSaveOwner(u);
        return data;
      })
      .catch((err) => {
        const msg = String((err && err.message) || err || '');
        // Só sessão perdida (401/not_logged) ou falha de rede derrubam para o
        // modo local. Rejeições transitórias (rate_limit, too_early,
        // growth_impossible, time_rewind…) NÃO devem rebaixar o ranking: o
        // usuário continua logado/online e o envio apenas é pulado neste ciclo.
        if (/not_logged|401|failed to fetch|networkerror|http_401/i.test(msg)) {
          LB.online = false; LB.logged = false;
        }
        // conflito de save (409): repassa o erro com server_save para o chamador
        if (err && err.server_save) throw err;
        return { ok: false, error: msg };
      });
  };

  // Revisão do save remoto atual (carregada no boot e atualizada a cada save).
  // Persistida em localStorage: sem isso, cada reload recomeçava com revisão
  // null e o primeiro autosave do dia podia colidir silenciosamente.
  LB.saveRevision = (() => {
    try {
      const v = parseInt(localStorage.getItem('tdf_save_revision'), 10);
      return isFinite(v) && v > 0 ? v : null;
    } catch (e) { return null; }
  })();
  LB.setSaveRevision = function (rev) {
    rev = parseInt(rev, 10);
    if (!isFinite(rev) || rev <= 0) return;
    if (LB.saveRevision !== null && rev < LB.saveRevision) return; // nunca regride
    LB.saveRevision = rev;
    try { localStorage.setItem('tdf_save_revision', String(rev)); } catch (e) {}
  };
  LB.clearSaveRevision = function () {
    LB.saveRevision = null;
    try { localStorage.removeItem('tdf_save_revision'); } catch (e) {}
  };

  // Dono do save local (username). Usado para NUNCA misturar contas no mesmo
  // navegador: ao trocar de conta, o save local da conta anterior é
  // substituído pelo da conta atual (ou zerado se a conta não tem save).
  LB.saveOwner = (() => { try { return localStorage.getItem('tdf_save_owner'); } catch (e) { return null; } })();
  LB.setSaveOwner = function (username) {
    LB.saveOwner = username || null;
    try {
      if (username) localStorage.setItem('tdf_save_owner', username);
      else localStorage.removeItem('tdf_save_owner');
    } catch (e) {}
  };
  // True quando o save local pertence a OUTRA conta (troca de login no mesmo
  // navegador). O sync/autosave NÃO deve enviar esse save para o servidor da
  // conta atual antes do restore resolver a troca.
  LB.ownerChanged = function () {
    const u = window.TDFNet && window.TDFNet.user && window.TDFNet.user.username;
    return !!(LB.saveOwner && u && LB.saveOwner !== u);
  };

  LB.bestRankFromStorage = function () {
    try {
      const v = parseInt(localStorage.getItem('tdf_best_rank'), 10);
      LB.bestRank = isFinite(v) && v > 0 ? v : null;
    } catch (e) {}
  };

  // Restaura o save do servidor (backup) quando ele é MAIOR que o local
  // (troca de navegador/PC ou save perdido). Retorna comparação para o boot
  // decidir com confirmação do jogador. Só age logado e sem flag de reset
  // voluntário (tdf_no_restore).
  LB.restoreSave = function () {
    if (!LB.online || !LB.logged) return Promise.resolve(null);
    try {
      if (localStorage.getItem('tdf_no_restore')) return Promise.resolve(null);
    } catch (e) { return Promise.resolve(null); }
    const local = window.Game && window.Game.state;
    if (!local) return Promise.resolve(null);
    const localLog10 = N.log10(local.totalEarned);
    return fetch('api/ranking.php?mode=global&sort=score', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http_' + r.status))))
      .then((data) => {
        if (!data || !data.ok || !data.me) return null;
        const sv = data.me.save;
        if (!sv || typeof sv !== 'string' || sv.length === 0 || sv.length > 200000) return null;
        let bkLog10 = -1;
        try {
          const parsed = JSON.parse(sv);
          bkLog10 = N.log10(N.fromF(parsed.totalEarned || { m: 0, e: 0 }));
        } catch (e) { return null; }
        return {
          save: sv,
          localLog10: localLog10,
          backupLog10: bkLog10,
          restore: bkLog10 > localLog10 + 0.001, // backup estritamente maior
          backupAt: data.me.save_at || null,
          serverRevision: data.me.save_revision || 0,
        };
      })
      .then((cmp) => {
        // guarda a revisão do servidor mesmo quando o backup NÃO é restaurado
        // (para o próximo submitSave enviar base_revision correto)
        LB.setSaveRevision(cmp.serverRevision);
        return cmp;
      })
      .catch(() => null);
  };

  // formata um score log10 para exibição
  LB.fmtScore = function (log10) {
    if (!isFinite(log10) || log10 <= 0) return '0';
    const v = N.fromLog10(log10);
    return N.fmt(v);
  };
})();

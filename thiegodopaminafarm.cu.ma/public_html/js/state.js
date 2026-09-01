/* ============================================================
   THIEGO DOPAMINA FARM — state.js
   Schema do save v4, migração do save v1 (jogo antigo),
   autosave, export/import e sanitização. Código não é
   executado a partir de saves importados (JSON apenas).
   ============================================================ */
(function () {
  'use strict';
  const T = window.TDF;
  const N = window.Num;
  const Save = window.Save = {};

  const KEY = 'thiego_dopamina_farm_v4';
  const ADMIN_KEY = 'thiego_dopamina_farm_v4_admin';
  const OLD_KEY = 'thiego_dopamina_farm_v1';
  const VERSION = 4;

  // Alterna a chave de save entre modo normal e modo admin. O modo admin
  // (admin_mode=1) usa um save SEPARADO: progresso de admin não contamina
  // o save "normal" que aparece no ranking.
  let activeKey = KEY;
  Save.setAdminSave = function (on) {
    activeKey = on ? ADMIN_KEY : KEY;
  };
  Save.activeKey = function () { return activeKey; };

  /* ---------- estado inicial ---------- */
  function freshState() {
    return {
      version: VERSION,
      dopamine: { m: 0, e: 0 },
      totalEarned: { m: 0, e: 0 },
      runEarned: { m: 0, e: 0 },
      bestRun: { m: 0, e: 0 },
      gens: T.GENERATORS.map(() => 0),
      upgrades: {},        // id -> nível comprado
      tree: {},            // id -> nível
      tier: 0,
      prestige: 0,
      points: 0,           // pontos de Dopamina Ascendida disponíveis
      pointsSpent: 0,
      transcends: 0,       // nº de transcendências
      tPoints: 0,          // pontos de Transcendência disponíveis
      tPointsSpent: 0,     // pontos de Transcendência gastos na árvore
      transTree: {},       // árvore de transcendência (id -> nível)
      achievements: [],
      title: null,
      secrets: { code: false, konami: false, thiega: false, gestante: false },
      milestones: [],      // ids de milestones de dopamina já concedidos
      dayStreak: 0,
      lastActiveDay: '',
      // ---- PLANO DE CONTEÚDO (tools/PLANO_CONTEUDO.md) ----
      hardcore: false,             // C5: run hardcore ativa
      hardcoreRuns: 0,             // C5: nº de runs hardcore completadas
      ascensionPath: null,         // C6: id do caminho escolhido
      ascensionTier: 0,            // C6: tier no caminho
      cosmetics: {},               // C4: {head: id, aura: id}
      activeTheme: 'classic',      // A4: tema visual
      loreUnlocked: [],            // A1: ids dos capítulos vistos
      returnBoost: null,           // B5: {mult, until} boost de retorno
      flavorEventsSeen: {},        // A2: id -> contagem
      flavorEvent: null,           // A2: evento narrativo ativo {id, deadline}
      counters: {
        clicks: 0, crits: 0, critStreak: 0, critStreakMax: 0,
        maxCombo: 0, buys: 0, prestiges: 0,
        earned: { m: 0, e: 0 },
        events: 0, encounters: 0,
        rareEvents: 0,
        encDourado: 0, encBravo: 0, encSkibidi: 0, encPig: 0,
      },
      offlineTime: 0,
      playTime: 0,
      missionClaims: 0,
      stats: {
        biggestClick: { m: 0, e: 0 },
        bestDps: { m: 0, e: 0 },
        bigDopamineAtOnce: { m: 0, e: 0 },
      },
      missions: null,
      settings: {
        volume: 0.65, muted: false, music: false,
        particles: true, animations: true, perfMode: false,
        numStyle: 'auto',           // auto | sci | full
        confirmPrestige: true, confirmReset: true,
        notifications: true, reducedMotion: false,
        autoPrestige: false,        // prestige automático ON/OFF
        clickSound: 'synth',       // 'synth' | 'mp3' — som do clique
      },
      timestamps: { startedAt: Date.now(), savedAt: Date.now() },
      migrated: false,
    };
  }

  /* ---------- sanitização (também serve para import) ---------- */
  function wrapMoney(x) { return N.fromF(x); }

  /**
   * MIGRAÇÃO P0 (balanceamento) — converte saves criados ANTES do P0 para a
   * economia nova, de forma justa:
   *  1) Pontos de prestige disponíveis: o ganho por run caiu de 0.6×(logT−12)
   *     para 0.35×(logT−12) (razão 0.35/0.6). Pontos guardados são
   *     convertidos pela mesma razão (não destrói a árvore comprada).
   *  2) Tier de evolução: o EVO_R das 28 últimas evoluções ficou 5× mais
   *     caro. O tier é recalculado pelo totalEarned com os custos NOVOS
   *     (nunca aumenta; só reduz o que a nova curva não cobre).
   *  3) Marca o save com p0Nerfed=true para não reaplicar.
   * A árvore de prestige (tree), pontos gastos, prestígios, transcende e
   * totalEarned são PRESERVADOS — o jogador não perde o que comprou.
   */
  function migrateP0(d) {
    if (!d || d.p0Nerfed) return d;

    // 1) pontos disponíveis × (0.35/0.6)
    if (typeof d.points === 'number' && d.points > 0) {
      d.points = Math.max(0, Math.floor(d.points * (0.35 / 0.6)));
    }

    // 2) tier recalculado: maior T com soma(custo evoluções 1..T) <= totalEarned
    const logTotal = N.log10(d.totalEarned);
    const evos = (T && T.EVOLUTIONS) || [];
    if (isFinite(logTotal) && logTotal > 0 && evos.length > 1) {
      let sum = 0;
      let maxTier = 0;
      // custos reais do data.js NOVO (último ~1e102 — cabe em float64)
      for (let i = 1; i < evos.length; i++) {
        sum += evos[i].cost || 0;
        if (sum > 0 && Math.log10(sum) <= logTotal) maxTier = i;
        else break;
      }
      if (maxTier > 0 && (d.tier || 0) > maxTier) d.tier = maxTier;
    }

    d.p0Nerfed = true;
    d.p0NerfedAt = new Date().toISOString();
    return d;
  }

  Save.sanitize = function (d) {
    const need = freshState();
    if (!d || typeof d !== 'object') return null;

    const c = d.counters = d.counters || {};
    const needC = need.counters;
    for (const k in needC) {
      if (k === 'earned') continue;
      if (typeof c[k] !== 'number' || !isFinite(c[k])) c[k] = 0;
      c[k] = Math.max(0, Math.floor(c[k]));
    }
    c.earned = wrapMoney(c.earned);

    d.dopamine = wrapMoney(d.dopamine);
    d.totalEarned = wrapMoney(d.totalEarned);
    d.runEarned = wrapMoney(d.runEarned);
    d.bestRun = wrapMoney(d.bestRun);
    d.stats = d.stats || {};
    d.stats.biggestClick = wrapMoney(d.stats.biggestClick);
    d.stats.bestDps = wrapMoney(d.stats.bestDps);
    d.stats.bigDopamineAtOnce = wrapMoney(d.stats.bigDopamineAtOnce);

    // Preserve existing gens and pad with zeros for new generators
    if (!Array.isArray(d.gens)) d.gens = [];
    while (d.gens.length < T.GENERATORS.length) d.gens.push(0);
    d.gens = d.gens.slice(0, T.GENERATORS.length).map((g) => Math.max(0, Math.min(1e9, Math.floor(g) || 0)));

    d.upgrades = d.upgrades && typeof d.upgrades === 'object' ? d.upgrades : {};
    d.tree = d.tree && typeof d.tree === 'object' ? d.tree : {};
    for (const key of Object.keys(d.upgrades)) {
      const u = T.UPGRADES.find((k) => k.id === key);
      if (!u) { delete d.upgrades[key]; continue; }
      const max = (u.effect && u.effect.maxLevel) || 1;
      d.upgrades[key] = Math.max(0, Math.min(max, Math.floor(d.upgrades[key]) || 0));
    }
    for (const key of Object.keys(d.tree)) {
      const tr = T.PRESTIGE_TREE.find((k) => k.id === key);
      if (!tr) { delete d.tree[key]; continue; }
      d.tree[key] = Math.max(0, Math.min(tr.max, Math.floor(d.tree[key]) || 0));
    }

    d.tier = Math.max(0, Math.min(T.EVOLUTIONS.length - 1, Math.floor(d.tier) || 0));
    d.prestige = Math.max(0, Math.floor(d.prestige) || 0);
    d.points = Math.max(0, Math.floor(d.points) || 0);
    d.pointsSpent = Math.max(0, Math.floor(d.pointsSpent) || 0);
    d.transcends = Math.max(0, Math.floor(d.transcends) || 0);
    d.tPoints = Math.max(0, Math.floor(d.tPoints) || 0);
    d.tPointsSpent = Math.max(0, Math.floor(d.tPointsSpent) || 0);
    d.transTree = d.transTree && typeof d.transTree === 'object' ? d.transTree : {};
    for (const key of Object.keys(d.transTree)) {
      const tr = T.TRANSCENDENCE_TREE.find((k) => k.id === key);
      if (!tr) { delete d.transTree[key]; continue; }
      d.transTree[key] = Math.max(0, Math.min(tr.max, Math.floor(d.transTree[key]) || 0));
    }
    d.offlineTime = Math.max(0, d.offlineTime || 0);
    d.playTime = Math.max(0, d.playTime || 0);
    d.missionClaims = Math.max(0, Math.floor(d.missionClaims) || 0);

    if (!Array.isArray(d.achievements)) d.achievements = [];
    d.achievements = d.achievements.filter((id) => T.ACHIEVEMENTS.some((a) => a.id === id));
    d.secrets = Object.assign({ code: false, konami: false, thiega: false, gestante: false }, d.secrets || {});

    if (!Array.isArray(d.milestones)) d.milestones = [];
    d.milestones = d.milestones.filter((id) => T.DOPAMINE_MILESTONES.some((ms) => ms.id === id));
    d.dayStreak = Math.max(0, Math.floor(d.dayStreak) || 0);
    d.lastActiveDay = typeof d.lastActiveDay === 'string' ? d.lastActiveDay : '';

    // ---- PLANO DE CONTEÚDO: campos novos (sanitização/migração) ----
    d.hardcore = !!d.hardcore;
    d.hardcoreRuns = Math.max(0, Math.floor(d.hardcoreRuns) || 0);
    d.ascensionPath = (T.ASCENSION_PATHS && T.ASCENSION_PATHS.some((p) => p.id === d.ascensionPath)) ? d.ascensionPath : null;
    d.ascensionTier = Math.max(0, Math.floor(d.ascensionTier) || 0);
    d.cosmetics = d.cosmetics && typeof d.cosmetics === 'object' ? d.cosmetics : {};
    for (const slot of Object.keys(d.cosmetics)) {
      const c = T.COSMETICS ? T.COSMETICS.find((k) => k.id === d.cosmetics[slot]) : null;
      if (!c || c.slot !== slot) delete d.cosmetics[slot];
    }
    if (T.THEMES && T.THEMES.some((t) => t.id === d.activeTheme)) d.activeTheme = d.activeTheme;
    else d.activeTheme = 'classic';
    if (!Array.isArray(d.loreUnlocked)) d.loreUnlocked = [];
    if (T.LORE) d.loreUnlocked = d.loreUnlocked.filter((id) => T.LORE.some((l) => l.id === id));
    if (!d.returnBoost || typeof d.returnBoost !== 'object' ||
        !isFinite(d.returnBoost.mult) || d.returnBoost.mult <= 0 ||
        !isFinite(d.returnBoost.until) || d.returnBoost.until <= Date.now()) {
      d.returnBoost = null;
    }
    d.flavorEventsSeen = d.flavorEventsSeen && typeof d.flavorEventsSeen === 'object' ? d.flavorEventsSeen : {};
    if (d.flavorEvent && (typeof d.flavorEvent !== 'object' || !d.flavorEvent.id ||
        !isFinite(d.flavorEvent.deadline) || d.flavorEvent.deadline <= Date.now())) {
      d.flavorEvent = null;
    }

    d.settings = Object.assign({}, need.settings, d.settings || {});
    d.timestamps = Object.assign({}, need.timestamps, d.timestamps || {});
    return migrateP0(d);
  };

  /* ---------- migração do save antigo v1 ---------- */
  const LEGACY_GENS_BASE = [0.5, 4, 25, 130, 700, 4000, 22000, 110000, 550000, 3100000, 17000000];

  function migrateV1(old) {
    const s = freshState();
    s.dopamine = N.fromF(old.dopamine || 0);
    s.totalEarned = N.fromF(old.totalEarned || 0);
    // migração justa: a run atual conta como o total acumulado
    s.runEarned = N.fromF(old.totalEarned || 0);
    s.tier = Math.min(6, Math.floor(old.tier) || 0);
    s.prestige = Math.max(0, Math.floor(old.prestige) || 0);
    // 2^P antigo ≈ 1.12^N → N = P·ln2/ln1.12 ≈ 6.116P (compensa a fórmula nova)
    s.points = Math.round((Math.max(0, old.prestigePoints || 0)) * 6.116);
    s.playTime = Math.max(0, old.playTime || 0);
    s.counters.clicks = Math.max(0, Math.floor(old.clicks) || 0);
    s.counters.events = Math.max(0, Math.floor(old.eventsSeen) || 0);
    // Compensação: 1h da produção antiga vira dopamina (não destrói progresso)
    if (Array.isArray(old.owned)) {
      let comp = 0;
      old.owned.forEach((n, i) => {
        if (n > 0 && LEGACY_GENS_BASE[i]) comp += n * LEGACY_GENS_BASE[i];
      });
      comp = Math.min(1e15, comp * 60);
      if (comp > 0) {
        const bonus = N.fromF(comp);
        s.dopamine = N.add(s.dopamine, bonus);
        s.totalEarned = N.add(s.totalEarned, bonus);
        s._migrationBonus = comp;
      }
    }
    s.migrated = true;
    s.timestamps.savedAt = old.lastSave || Date.now();
    return s;
  }

  /* ---------- guarda contra rollback ---------- */
  // PROBLEMA ORIGINAL: Save.export() lia DE VOLTA o localStorage depois de
  // salvar. Se o localStorage falhava silenciosamente (quota/privado), o
  // export retornava UM SAVE ANTIGO — e o jogo podia enviar/regredir para um
  // estado de minutos atrás. Além disso, múltiplas abas com estados em
  // memória diferentes sobrescreviam o save mais novo com um mais antigo.
  //
  // Regras novas:
  //   1. export serializa o ESTADO EM MEMÓRIA (nunca lê de volta o storage);
  //   2. todo write compara o savedAt persistido contra o da memória:
  //      se o storage está À FRENTE da memória (outro avanço reconhecido),
  //      esta aba NÃO sobrescreve (marcada como "stale");
  //   3. falha de gravação é exposta via evento 'tdf_save_error'.
  const GUARD_SLACK = 3000;          // tolerância entre escritas da mesma aba
  let _guardMutedUntil = 0;          // janela pós-import (escrita autorizada)
  let _lastErrNotified = 0;

  function readStoredSavedAt() {
    try {
      const raw = localStorage.getItem(activeKey);
      if (!raw) return null;
      const m = raw.match(/"savedAt":\s*(\d{10,})/);
      return m ? parseInt(m[1], 10) : null;
    } catch (e) { return null; }
  }

  function notifySaveIssue(kind, detail) {
    const now = Date.now();
    if (now - _lastErrNotified < 5000) return; // throttle de evento/toast
    _lastErrNotified = now;
    try {
      window.dispatchEvent(new CustomEvent('tdf_save_issue', { detail: { kind: kind, at: now, reason: detail || '' } }));
    } catch (e2) {}
  }

  Save.suppressGuard = function (ms) {
    _guardMutedUntil = Math.max(_guardMutedUntil, Date.now() + (ms || 4000));
  };
  Save.lastError = null;   // última falha de gravação ({at, reason})
  Save.stale = false;      // true quando esta aba detectou storage à frente

  /* ---------- save / load ---------- */
  Save.save = function (state) {
    if (!state || state._resetting || state._tooNew) return false;
    // guarda anti-rollback: o que está persistido é MAIS NOVO que a memória?
    try {
      const storedAt = readStoredSavedAt();
      const memAt = state.timestamps ? state.timestamps.savedAt : null;
      if (Date.now() > _guardMutedUntil &&
          storedAt !== null && memAt !== null &&
          storedAt > memAt + GUARD_SLACK) {
        Save.stale = true;
        notifySaveIssue('stale', 'storage_newer');
        return false; // nunca grava estado antigo sobre um mais novo
      }
    } catch (e) { /* guarda nunca deve travar o save */ }
    Save.stale = false;
    let txt = null;
    try {
      state.timestamps = state.timestamps || {};
      state.timestamps.savedAt = Date.now();
      txt = JSON.stringify(state);
    } catch (e) {
      Save.lastError = { at: Date.now(), reason: 'serialize' };
      notifySaveIssue('error', 'serialize');
      return false;
    }
    try {
      localStorage.setItem(activeKey, txt);
      if (Save.lastError) Save.lastError = null;
      return true;
    } catch (e) {
      // quota ou modo privado: NÃO é mais silencioso
      Save.lastError = { at: Date.now(), reason: e && e.name || 'quota' };
      notifySaveIssue('error', Save.lastError.reason);
      return false;
    }
  };

  Save.load = function () {
    let raw = null;
    try { raw = localStorage.getItem(activeKey); } catch (e) {}
    if (!raw) {
      // tenta migrar do jogo antigo (apenas no modo normal)
      if (activeKey === KEY) {
        let oldRaw = null;
        try { oldRaw = localStorage.getItem(OLD_KEY); } catch (e) {}
        if (oldRaw) {
          try {
            const old = JSON.parse(oldRaw);
            const st = Save.sanitize(migrateV1(old));
            try { localStorage.removeItem(OLD_KEY); } catch (e2) {}
            return st;
          } catch (e) { return freshState(); }
        }
      }
      return freshState();
    }
    try {
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return freshState();
      if (!d.version || d.version > VERSION) {
        return { _tooNew: true };
      }
      if (d.version < VERSION && d.version > 0) {
        d.version = VERSION; // migrações futuras ficariam aqui
      }
      return Save.sanitize(d);
    } catch (e) {
      // save corrompido: preserva o texto bruto para recuperação antes de
      // qualquer coisa sobrescrever o slot com um estado zerado
      try { sessionStorage.setItem(KEY + '_corrupt', raw.slice(0, 200000)); } catch (e2) {}
      return freshState();
    }
  };

  // Serializa o ESTADO EM MEMÓRIA informado (não faz leitura de volta do
  // storage). Se a gravação local falhar ou estiver bloqueada pelo guarda,
  // ainda retorna o texto atual — chamadores remotos decidem se enviam; o
  // writer do servidor valida monotonicidade/revisão por conta própria.
  Save.export = function (state) {
    if (!state || state._resetting || state._tooNew) return '';
    try {
      Save.save(state);
      return JSON.stringify(state);
    } catch (e) {
      try { return localStorage.getItem(activeKey) || ''; } catch (e2) { return ''; }
    }
  };

  Save.import = function (txt) {
    try {
      if (typeof txt !== 'string' || txt.length > 2_000_000) return false;
      const d = JSON.parse(txt);
      if (!d || typeof d !== 'object') return false;
      if (d.version === undefined || typeof d.version !== 'number' || d.version > VERSION) return false;
      if (d.dopamine === undefined && d.gens === undefined && d.counters === undefined) return false;
      const st = Save.sanitize(d);
      // importa com o guarda suprimido: a gravação aqui É a autoridade
      // (restore do servidor / import manual); a memória é sincronizada
      // logo depois por Game.load().
      Save.suppressGuard(6000);
      try { localStorage.setItem(activeKey, JSON.stringify(st)); } catch (e) { return false; }
      return true;
    } catch (e) { return false; }
  };

  Save.reset = function () {
    try { localStorage.removeItem(activeKey); } catch (e) {}
  };

  Save.KEY = KEY;
  Save.ADMIN_KEY = ADMIN_KEY;
  Save.fresh = freshState;
})();
/* ============================================================
   THIEGO DOPAMINA FARM — game.js
   Ações do jogador, loop principal, combo, crítico, eventos,
   encontros, prestige, misses, conquistas, títulos e
   offline. Toda a mutação do estado passa por aqui.
   ============================================================ */
(function () {
  'use strict';
  const T = window.TDF;
  const N = window.Num;
  const Econ = window.Econ;
  const G = window.Game = {};

  const RUNTIME = {
    events: [],          // eventos ativos
    lastEventAt: 0,
    nextEventIn: 30000,
    encCooldown: {},     // id -> próxima vez permitida
    idleSince: Date.now(),
    offline: null,       // {elapsed, gain} do retorno
    combo: 0,
    comboT: 0,
    humor: null,
    humorT: 0,
    hist: [],            // histórico curto {t, d, m} p/ gráfico de produção
  };
  G.runtime = RUNTIME;

  /* ============================================================
     UTILIDADES de ganho
     ============================================================ */
function earn(state, amount) {
    if (amount.m === 0) return;
    state.dopamine = N.add(state.dopamine, amount);
    state.totalEarned = N.add(state.totalEarned, amount);
    state.runEarned = N.add(state.runEarned, amount);
    state.counters.earned = N.add(state.counters.earned, amount);
    if (N.gt(state.dopamine, state.bestRun)) state.bestRun = state.dopamine;
    if (N.gt(state.dopamine, state.stats.bigDopaminaAtOnce)) state.stats.bigDopaminaAtOnce = state.dopamine;
  }

  G.earn = earn;

  /* ============================================================
     CLIQUE
     ============================================================ */
  G.click = function () {
    const s = G.s;
    RUNTIME.comboT = Econ.comboWindow(s);
    RUNTIME.combo = (RUNTIME.combo || 0) + 1;
    if (RUNTIME.combo > 1e6) RUNTIME.combo = 1e6;

    const ch = Econ.critChance(s);
    const crit = Math.random() < ch;
    let gain = Econ.clickPower(s, RUNTIME, RUNTIME.combo);
    if (crit) {
      gain = N.mul(gain, N.fromF(Econ.critMult(s)));
      s.counters.crits++;
      s.counters.critStreak++;
      if (s.counters.critStreak > s.counters.critStreakMax) s.counters.critStreakMax = s.counters.critStreak;
    } else {
      s.counters.critStreak = 0;
    }

    earn(s, gain);
    s.counters.clicks++;
    if (RUNTIME.combo > s.counters.maxCombo) s.counters.maxCombo = RUNTIME.combo;
    if (N.gt(gain, s.stats.biggestClick)) s.stats.biggestClick = gain;

    // encontro BRAVO: cliques extras durante o evento
    for (const ev of RUNTIME.events) {
      if (ev.end > Date.now() && ev.clickBoost) {
        const extra = N.mul(Econ.clickPower(s, RUNTIME, RUNTIME.combo), N.fromF(ev.clickBoost));
        earn(s, extra);
        gain = N.add(gain, extra);
      }
    }

    // A2: desafio de clique (flavor event) — completa ao atingir o alvo
    if (RUNTIME._flavorChallenge && RUNTIME._flavorChallenge.target > 0) {
      RUNTIME._flavorChallenge.target--;
      if (RUNTIME._flavorChallenge.target <= 0) {
        const ch = RUNTIME._flavorChallenge;
        const reward = ch.reward;
        if (reward && reward.prodMult && reward.duration) {
          RUNTIME.events.push({ id: 'flavor_chal_' + ch.id, end: Date.now() + reward.duration * 1000, prod: 1 + reward.prodMult, flavor: true });
          if (window.UI) window.UI.toast('⚡ Desafio completo! +' + Math.round(reward.prodMult * 100) + '% produção por ' + reward.duration + 's', 'gold', 4000);
        } else {
          const bonus = N.mul(Econ.dps(s, RUNTIME), N.fromF(50));
          earn(s, bonus);
          if (window.UI) window.UI.toast('⚡ Desafio completo! +' + N.fmt(bonus), 'gold', 4000);
        }
        RUNTIME._flavorChallenge = null;
      }
    }

        RUNTIME.idleSince = Date.now();
    // C4: notifica o motor de juice sobre o clique
    if (window.Juice && typeof Juice.onClick === 'function') Juice.onClick();

    return { gain, crit, combo: RUNTIME.combo, critStreak: s.counters.critStreak };
  };
  /* ===================== JUICE HOOKS ===================== */
  G.flash = function(color, duration) {
    const el = document.getElementById("hud-dopa");
    if (!el) return;
    el.style.boxShadow = "0 0 " + (duration||200) + "px " + color;
    setTimeout(function() { el.style.boxShadow = ""; }, duration||200);
  };
  G.addDopamine = function(val, reason) {
    // Delegate to Juice motor for visual feedback
    if (window.Juice && typeof Juice.addDopamine === "function") {
      Juice.addDopamine(val, 0, 0);
    }
  };

  /* ============================================================
     GERADORES / UPGRADES
     ============================================================ */
  G.buyGen = function (i, n) {
    const s = G.s;
    if (i < 0 || i >= T.GENERATORS.length) return false;
    n = Math.max(1, Math.floor(n));
    const cost = Econ.genCost(s, i, n);
    if (N.lt(s.dopamine, cost)) return false;
    s.dopamine = N.sub(s.dopamine, cost);
    const before = s.gens[i];
    s.gens[i] += n;
    s.counters.buys += n;
    if (G.genMilestoneFeedback) G.genMilestoneFeedback(i, before, s.gens[i]);
    return true;
  };

  // dps de um gerador num nível hipotético (para comparar ROIs de compra)
  function genDpsAt(i, level) {
    const g = T.GENERATORS[i];
    const prod = N.mul(N.fromF(g.baseProd * Econ.milestoneMult(level)), N.fromF(Math.max(0, level)));
    return N.mul(prod, N.fromF(Econ.genMult(G.s)));
  }

  G.buyBestGenerators = function () {
    const s = G.s;
    let bought = 0;
    // loop: escolhe o gerador/pacote com melhor ROI (dps ganho ÷ custo)
    for (let pass = 0; pass < 500; pass++) {
      let best = null; // { i, n, gain, cost }
      for (let i = 0; i < T.GENERATORS.length; i++) {
        const owned = s.gens[i];
        const nextMs = T.MILESTONES.find((m) => owned < m);
        const nOpts = [1];
        // cruzar o próximo milestone dobra toda a produção do gerador
        if (nextMs !== undefined && nextMs - owned > 1) nOpts.push(nextMs - owned);
        for (const n of nOpts) {
          const cost = Econ.genCost(s, i, n);
          if (N.lt(s.dopamine, cost)) continue;
          const gain = N.sub(genDpsAt(i, owned + n), genDpsAt(i, owned));
          if (!N.gt(gain, N.zero)) continue;
          if (!best || N.gt(N.mul(gain, best.cost), N.mul(best.gain, cost))) {
            best = { i, n, gain, cost };
          }
        }
      }
      if (!best) break;
      s.dopamine = N.sub(s.dopamine, best.cost);
      const before = s.gens[best.i];
      s.gens[best.i] += best.n;
      s.counters.buys += best.n;
      bought += best.n;
      if (G.genMilestoneFeedback) G.genMilestoneFeedback(best.i, before, s.gens[best.i]);
    }
    return bought;
  };

  G.buyUpgrade = function (id) {
    const s = G.s;
    const u = T.UPGRADES.find((k) => k.id === id);
    if (!u) return false;
    const lvl = s.upgrades[id] || 0;
    if (lvl >= (u.effect.maxLevel || 1)) return false;
    const cost = Econ.upgradeCost(s, u);
    if (N.lt(s.dopamine, cost)) return false;
    s.dopamine = N.sub(s.dopamine, cost);
    s.upgrades[id] = lvl + 1;
    s.counters.buys++;
    return true;
  };

  G.canBuyUpgrade = function (id) {
    const s = G.s;
    const u = T.UPGRADES.find((k) => k.id === id);
    if (!u) return { ok: false, reason: 'none' };
    const lvl = s.upgrades[id] || 0;
    if (lvl >= (u.effect.maxLevel || 1)) return { ok: false, reason: 'max' };
    const cost = Econ.upgradeCost(s, u);
    if (N.lt(s.dopamine, cost)) return { ok: false, reason: 'cost', cost };
    return { ok: true, cost };
  };

  G.buyAllUpgrades = function () {
    const s = G.s;
    let bought = 0;
    // loop até não restar nada comprável (reduções de custo mudam o cenário)
    for (let pass = 0; pass < 1000; pass++) {
      let any = false;
      for (const u of T.UPGRADES) {
        const lvl = s.upgrades[u.id] || 0;
        if (lvl >= (u.effect.maxLevel || 1)) continue;
        const cost = Econ.upgradeCost(s, u);
        if (N.lt(s.dopamine, cost)) continue;
        s.dopamine = N.sub(s.dopamine, cost);
        s.upgrades[u.id] = lvl + 1;
        s.counters.buys++;
        bought++;
        any = true;
      }
      if (!any) break;
    }
    return bought;
  };

  /* ============================================================
     EVOLUÇÃO
     ============================================================ */
  G.evolve = function () {
    const s = G.s;
    const t = Econ.nextTier(s);
    if (t === null) return null;
    const cost = Econ.evoCost(s, t);
    if (N.lt(s.dopamine, cost)) return null;
    s.dopamine = N.sub(s.dopamine, cost);
    s.tier = t;
    // A1: desbloqueia lore
    if (G.checkLoreUnlock) G.checkLoreUnlock(s);
    // A3: humor de evolução
    if (T.HUMOR_ON_EVOLVE && T.HUMOR_ON_EVOLVE.length) {
      RUNTIME.humor = T.HUMOR_ON_EVOLVE[(Math.random() * T.HUMOR_ON_EVOLVE.length) | 0];
      RUNTIME.humorT = 8;
    }
    return t;
  };

  /* ============================================================
     PRESTIGE (infinito, fórmula genérica)
     ============================================================ */
  G.prestige = function () {
    const s = G.s;
    if (!Econ.canPrestige(s)) return null;
    const gain = Econ.prestigeGain(s);
    const g = N.toF(gain);
    const multBefore = Econ.prestigeMult(s);
    s.points += Math.max(1, Math.floor(g));
    s.pointsSpent += 0;
    s.prestige++;
    s.counters.prestiges++;
    s.dopamine = N.zero;
    s.bestRun = N.zero;
    s.runEarned = N.zero;
    s.gens = T.GENERATORS.map(() => 0);
    s.upgrades = {};
    s.tier = 0;
    RUNTIME.combo = 0; RUNTIME.comboT = 0;
    RUNTIME.events = [];
    s.timestamps.lastPrestigeAt = Date.now();
    const multAfter = Econ.prestigeMult(s);
    const quotePool = (T.HUMOR_ON_PRESTIGE && T.HUMOR_ON_PRESTIGE.length) ? T.HUMOR_ON_PRESTIGE : T.HUMOR_PRESTIGE;
    const r = {
      gained: g,
      multBefore,
      multAfter,
      perPoint: 1.12,
      quote: quotePool[(Math.random() * quotePool.length) | 0],
    };
    G.save();
    return r;
  };

  /* ============================================================
     ÁRVORE DE PRESTIGE
     ============================================================ */
  G.buyTree = function (id) {
    const s = G.s;
    const tr = T.PRESTIGE_TREE.find((k) => k.id === id);
    if (!tr) return false;
    const lvl = s.tree[id] || 0;
    if (lvl >= tr.max) return false;
    const cost = tr.levels[lvl];
    if (s.points < cost) return false;
    s.points -= cost;
    s.pointsSpent += cost;
    s.tree[id] = lvl + 1;
    return true;
  };

  /* ============================================================
     TRANSCENDÊNCIA (meta-camada infinita pós-prestige)
     Reseta prestige + árvore + run, mas ganha pontos permanentes
     que multiplicam TUDO por ×2 cada. Progresso infinito.
     ============================================================ */
  G.transcend = function () {
    const s = G.s;
    if (!Econ.canTranscend(s)) return null;
    const gain = Econ.transcendGain(s);
    const multBefore = Econ.transcMult(s);
    s.tPoints += Math.max(1, Math.floor(gain));
    s.transcends++;
    // reseta tudo da run + prestige + árvore de prestige
    s.dopamine = N.zero;
    s.bestRun = N.zero;
    s.runEarned = N.zero;
    s.gens = T.GENERATORS.map(() => 0);
    s.upgrades = {};
    s.tier = 0;
    s.prestige = 0;
    s.points = 0;
    s.pointsSpent = 0;
    s.tree = {};
    RUNTIME.combo = 0; RUNTIME.comboT = 0;
    RUNTIME.events = [];
    s.timestamps.lastTranscendAt = Date.now();
    // C6: ascendência — cada transcendência sobe o tier do caminho (máx. perks do caminho)
    if (T.ASCENSION_PATHS && T.ASCENSION_PATHS.length) {
      const maxTier = Math.max.apply(null, T.ASCENSION_PATHS.map((p) => Math.max.apply(null, p.perks.map((k) => k.tier))));
      s.ascensionTier = Math.min(maxTier, (s.ascensionTier || 0) + 1);
      // 1ª transcendência → UI pede para escolher o caminho
      if (!s.ascensionPath) s._pendingAscension = true;
    }
    const multAfter = Econ.transcMult(s);
    const r = {
      gained: gain,
      multBefore,
      multAfter,
      perPoint: 2,
      quote: T.HUMOR_TRANSCEND[(Math.random() * T.HUMOR_TRANSCEND.length) | 0],
    };
    G.save();
    return r;
  };

  /* ============================================================
     ÁRVORE DE TRANSCENDÊNCIA
     ============================================================ */
  G.buyTransTree = function (id) {
    const s = G.s;
    const tr = T.TRANSCENDENCE_TREE.find((k) => k.id === id);
    if (!tr) return false;
    const lvl = s.transTree[id] || 0;
    if (lvl >= tr.max) return false;
    const cost = tr.levels[lvl];
    if (s.tPoints < cost) return false;
    s.tPoints -= cost;
    s.tPointsSpent += cost;
    s.transTree[id] = lvl + 1;
    return true;
  };

  /* ============================================================
     TÍTULO
     ============================================================ */
  G.equipTitle = function (id) {
    const s = G.s;
    if (id === null) { s.title = null; return true; }
    const t = T.TITLES.find((k) => k.id === id);
    if (!t) return false;
    const ctx = G.buildCtx();
    if (!t.check(s, ctx)) return false;
    s.title = id;
    return true;
  };

  /* ============================================================
     CONQUISTAS
     ============================================================ */
  G.buildCtx = function () {
    const s = G.s;
    const lb = window.Leaderboard || {};
    return {
      evoMult: Econ.evoMult(s),
      dps: Econ.dps(s, RUNTIME),
      rankBest: lb.bestRank || 9999,
      lbOnline: !!lb.online,
      localTop: lb.localRank || 9999,
      missionsClaimed: s.missionClaims || 0,
      achAll: T.ACHIEVEMENTS.every((a) => s.achievements.includes(a.id)),
    };
  };

  G.checkAchievements = function (silent) {
    const s = G.s;
    const ctx = G.buildCtx();
    const fresh = [];
    for (const a of T.ACHIEVEMENTS) {
      if (s.achievements.includes(a.id)) continue;
      let ok = false;
      try { ok = a.check(s, ctx); } catch (e) { ok = false; }
      if (ok) {
        s.achievements.push(a.id);
        fresh.push(a);
      }
    }
    if (fresh.length && !silent) {
      window.UI && window.UI.achievementToasts(fresh);
      try { window.AudioFX && AudioFX.sfx.achievement(); } catch (e) {}
    }
    return fresh;
  };

  /* ============================================================
     MILESTONES DE DOPAMINA
     Recompensa única ao cruzar cada potência marcada (10^log10).
     ============================================================ */
  G.checkMilestones = function (silent) {
    const s = G.s;
    const cur = N.log10(s.totalEarned);
    const fresh = [];
    for (const ms of T.DOPAMINE_MILESTONES) {
      if (s.milestones.includes(ms.id)) continue;
      if (cur >= ms.log10) {
        s.milestones.push(ms.id);
        const reward = N.mul(Econ.dps(s, RUNTIME), N.fromF(ms.reward));
        earn(s, reward);
        fresh.push({ ms, reward });
      }
    }
    if (!fresh.length) return fresh;
    for (const f of fresh) {
      const label = 'MILESTONE: ' + N.fmt(N.fromLog10(f.ms.log10)) + ' de dopamina!';
      const msg = '+ ' + N.fmt(f.reward) + ' de bônus';
      if (!silent) {
        window.UI && window.UI.toast(label + ' ' + msg, 'gold', 4500);
        try {
          window.AudioFX && AudioFX.sfx.achievement();
          if (f.ms.log10 >= 40) { window.Fx && window.Fx.flash('#ffd700', 500); }
        } catch (e) {}
      }
    }
    if (!silent) G.save();
    return fresh;
  };

  /* ============================================================
     DAY STREAK
     Sequência de dias com atividade (sem punição: nunca zera bônus
     acumulado, apenas não cresce ao faltar um dia).
     ============================================================ */
  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  G.tickDayStreak = function (silent) {
    const s = G.s;
    const tk = todayKey();
    if (s.lastActiveDay === tk) return 0;
    const yesterday = new Date(Date.now() - 86400000);
    const yk = yesterday.getFullYear() + '-' + String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + String(yesterday.getDate()).padStart(2, '0');
    let next = (s.lastActiveDay === yk) ? (s.dayStreak + 1) : 1;
    s.dayStreak = next;
    s.lastActiveDay = tk;
    if (next >= 2 && !silent) {
      const bonus = N.mul(Econ.dps(s, RUNTIME), N.fromF(Math.min(900, 60 + next * 15)));
      earn(s, bonus);
      window.UI && window.UI.toast('🔥 Dia ' + next + ' seguido! +' + N.fmt(bonus) + ' de bônus', 'gold', 4500);
      try { window.AudioFX && AudioFX.sfx.event(); } catch (e) {}
    }
    G.save();
    return next;
  };

  /* ============================================================
     FEEDBACK DE MILESTONE DE GERADOR
     ============================================================ */
  G.genMilestoneFeedback = function (i, before, after) {
    const s = G.s;
    const g = T.GENERATORS[i];
    for (const ms of T.MILESTONES) {
      if (before < ms && after >= ms) {
        const pts = 1 + T.MILESTONES.indexOf(ms);
        const msg = '⚡ ' + g.name + ' ×' + ms + '!';
        window.UI && window.UI.toast(msg + ' produção dobrada', 'gold', 3500);
        try {
          window.AudioFX && AudioFX.sfx.buy();
          if (ms >= 100) window.Fx && window.Fx.flash('#00d9ff', 300);
        } catch (e) {}
      }
    }
  };

  /* ============================================================
     MISSÕES
     ============================================================ */
  function dayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function weekKey() {
    const d = new Date();
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    return d.getFullYear() + '-W' + d.getMonth() + '-' + d.getDate();
  }

  function pickMissions(s, pool, n) {
    const arr = pool.slice();
    const out = [];
    while (arr.length && out.length < n) {
      const i = (Math.random() * arr.length) | 0;
      out.push(arr.splice(i, 1)[0]);
    }
    return out;
  }

  function prepMissions(s) {
    if (!s.missions || s.missions.dailyKey !== dayKey() || s.missions.weekKey !== weekKey()) {
      const base = G.buildCtx();
      s.missions = {
        dailyKey: dayKey(), weekKey: weekKey(),
        daily: pickMissions(s, T.MISSION_POOL.daily, 3).map((m) => ({ id: m.id, baseline: paddedBase(base), claimed: false })),
        weekly: pickMissions(s, T.MISSION_POOL.weekly, 2).map((m) => ({ id: m.id, baseline: paddedBase(base), claimed: false })),
        special: null,
      };
    }
    if (!s.missions.special || s.missions.specialKey !== dayKey()) {
      const sp = pickMissions(s, T.MISSION_POOL.special, 1)[0];
      s.missions.specialKey = dayKey();
      s.missions.special = { id: sp.id, baseline: paddedBase(G.buildCtx()), claimed: false };
    }
  }
  function paddedBase(ctx) {
    const s = G.s;
    const gensTotal = Array.isArray(s.gens) ? s.gens.reduce((a, b) => a + b, 0) : 0;
    return {
      clicks: s.counters.clicks, earned: s.counters.earned, buys: s.counters.buys,
      crits: s.counters.crits, events: s.counters.events, prestiges: s.counters.prestiges,
      encDourado: s.counters.encDourado, combo: s.counters.maxCombo, gens: gensTotal,
    };
  }

  G.missionProgress = function (m, s) {
    const def = findMissionDef(m.id);
    if (!def) return { cur: 0, target: 1, done: false };
    const track = def.track;
    let cur = 0;
    if (track === 'clicks') cur = s.counters.clicks - (m.baseline && m.baseline.clicks || 0);
    else if (track === 'earned') cur = N.toF(N.sub(s.counters.earned, m.baseline.earned));
    else if (track === 'buys') cur = s.counters.buys - (m.baseline && m.baseline.buys || 0);
    else if (track === 'crits') cur = s.counters.crits - (m.baseline && m.baseline.crits || 0);
    else if (track === 'events') cur = s.counters.events - (m.baseline && m.baseline.events || 0);
    else if (track === 'prestiges') cur = s.counters.prestiges - (m.baseline && m.baseline.prestiges || 0);
    else if (track === 'encDourado') cur = s.counters.encDourado - (m.baseline && m.baseline.encDourado || 0);
    else if (track === 'combo') cur = s.counters.maxCombo;
    else if (track === 'gens') cur = s.gens.reduce((a, b) => a + b, 0) - (m.baseline && m.baseline.gens || 0);
    cur = Math.max(0, Math.floor(cur));
    const target = def.target;
    return { cur, target, done: cur >= target };
  };
  function findMissionDef(id) {
    for (const poolKey of ['daily', 'weekly', 'special']) {
      const f = T.MISSION_POOL[poolKey].find((m) => m.id === id);
      if (f) return f;
    }
    return null;
  }

  G.claimMission = function (kind, idx) {
    const s = G.s;
    prepMissions(s);
    const group = s.missions[kind];
    const m = group && (kind === 'special' ? group : group[idx]);
    if (!m || m.claimed) return false;
    const prog = G.missionProgress(m, s);
    if (!prog.done) return false;
    const def = findMissionDef(m.id);
    m.claimed = true;
    s.missionClaims++;
    const rewardDopa = def.reward && def.reward.dopa !== undefined
      ? N.mul(Econ.dps(s, RUNTIME), N.fromF(def.reward.dopa))
      : null;
    if (rewardDopa) earn(s, rewardDopa);
    if (def.reward && def.reward.points !== undefined) s.points += def.reward.points;
    G.checkAchievements();
    return { dopa: rewardDopa, points: def.reward && def.reward.points };
  };

  /* ============================================================
     EVENTOS E ENCONTROS
     ============================================================ */
  function pickWeighted(pool) {
    let total = 0;
    for (const p of pool) total += (p.weight || 1);
    let r = Math.random() * total;
    for (const p of pool) {
      r -= (p.weight || 1);
      if (r <= 0) return p;
    }
    return pool[pool.length - 1];
  }

  function spawnEvent() {
    const s = G.s;
    const pool = T.EVENTS;
    const ev = pickWeighted(pool);
    const now = Date.now();
    const durMult = Econ.eventDurMult(s);
    const rewardMult = Econ.eventRewardMult(s);
    const active = { id: ev.id, text: ev.text, icon: ev.icon, start: now, end: now + ev.time * 1000 * durMult, evt: ev, rare: !!ev.rare };
    if (ev.instant) {
      const fx = N.mul(Econ.dps(s, RUNTIME), N.fromF(ev.instant * rewardMult));
      earn(s, fx);
      active.instantGain = fx;
    }
    if (ev.time > 0) RUNTIME.events.push(active);
    if (RUNTIME.events.length > 8) RUNTIME.events = RUNTIME.events.slice(-6);
    s.counters.events++;
    if (ev.rare) s.counters.rareEvents = (s.counters.rareEvents || 0) + 1;
    G.checkAchievements();
    if (ev.rare) {
      try {
        window.Fx && window.Fx.flash('#ffd700', 400);
        window.UI && window.UI.toast(ev.text + ' EVENTO RARO!', 'gold', 5000);
      } catch (e) {}
    }
    try { window.AudioFX && AudioFX.sfx.event(); } catch (e) {}
    return active;
  }

  function canNight(time, chance, cd) {
    if (Date.now() < cd) return false;
    if (chance <= 0) return false;
    return Math.random() < chance / 100;
  }

  function spawnEncounter(force) {
    const s = G.s;
    const now = Date.now();
    const candidates = [];
    // força por id (ex.: clique no Thiego Dourado flutuante) — ignora cooldown
    if (typeof force === 'string') {
      const forced = T.ENCOUNTERS.find((e) => e.id === force);
      if (forced) {
        RUNTIME.encCooldown[forced.id] = now + forced.cooldown * 1000;
        return buildEncounter(s, forced, now);
      }
      force = null;
    }
    // dormindo: só se idle ≥ 5min
    if (now - RUNTIME.idleSince >= 300000) {
      const d = T.ENCOUNTERS.find((e) => e.id === 'dormindo');
      if (canNight(now, d.chance * 40, RUNTIME.encCooldown.dormindo || 0)) candidates.push(d);
    }
    // pig: gated por cliques + chance + cooldown
    if (s.counters.clicks >= 2_500_000) {
      const p = T.ENCOUNTERS.find((e) => e.id === 'pig');
      if (p && canNight(now, p.chance, RUNTIME.encCooldown.pig || 0)) candidates.push(p);
    }
    const normal = T.ENCOUNTERS.filter((e) => e.id !== 'dormindo' && e.id !== 'pig');
    for (const e of normal) {
      if (canNight(now, e.chance, RUNTIME.encCooldown[e.id] || 0)) candidates.push(e);
    }
    if (force) {
      const any = T.ENCOUNTERS.filter((e) => e.id !== 'dormindo' && (e.id !== 'pig' || s.counters.clicks >= 2_500_000));
      if (candidates.length === 0) candidates.push(any[(Math.random() * any.length) | 0]);
    }
    if (candidates.length === 0) return null;
    const enc = candidates[(Math.random() * candidates.length) | 0];
    RUNTIME.encCooldown[enc.id] = now + enc.cooldown * 1000;
    return buildEncounter(s, enc, now);
  }

  // monta o evento ativo a partir do encontro escolhido (spawnEncounter e
  // o Thiego Dourado flutuante compartilham esta montagem)
  function buildEncounter(s, enc, now) {
    const durMult = Econ.eventDurMult(s);
    const rewardMult = Econ.eventRewardMult(s);
    const active = {
      id: enc.id, encounter: enc, name: enc.name, img: T.asset(enc.img),
      text: enc.name, icon: enc.icon || '🎲',
      start: now, end: now + (enc.time ? enc.time * 1000 * durMult : 0),
      quote: enc.quote,
      prod: enc.prod, click: enc.click, clickBoost: enc.clickBoost,
      glitch: enc.glitch, comboKeep: enc.comboKeep,
    };
    if (enc.instant) {
      const fx = N.mul(Econ.dps(s, RUNTIME), N.fromF(enc.instant * rewardMult));
      earn(s, fx);
      active.instantGain = fx;
    }
    if (enc.time > 0) RUNTIME.events.push(active);
    s.counters.encounters++;
    if (enc.id === 'dourado') s.counters.encDourado++;
    if (enc.id === 'bravo') s.counters.encBravo++;
    if (enc.id === 'skibidi') s.counters.encSkibidi++;
    if (enc.id === 'pig') s.counters.encPig++;

    // segredos especiais
    if (enc.id === 'skibidi') { s.secrets.skibidi = true; G.addSecret('skibidi'); }
    if (enc.id === 'pig') { s.secrets.pig = true; G.addSecret('pig'); }
    if (enc.id === 'dormindo') { s.secrets.dormindo = true; }
    G.checkAchievements();
    if (enc.rare) {
      try {
        window.Fx && window.Fx.flash('#ffd700', 400);
        window.UI && window.UI.toast(enc.name + ' — ENCONTRO RARO!', 'gold', 5000);
      } catch (e) {}
    }
    try { window.AudioFX && AudioFX.sfx.encounter(); } catch (e) {}
    return active;
  }

  /* ============================================================
     THIEGO DOURADO FLUTUANTE (lição CC: golden cookie)
     Aparece atravessando a tela de vez em quando; quem clicar
     ganha dopamina instantânea + o buff do encontro Dourado.
     ============================================================ */
  RUNTIME.golden = { nextIn: 45 + Math.random() * 90, active: false };

  function tickGolden(dt) {
    if (RUNTIME.golden.active) return;
    RUNTIME.golden.nextIn -= dt;
    if (RUNTIME.golden.nextIn <= 0) {
      RUNTIME.golden.nextIn = 180 + Math.random() * 300; // próxima em 3–8 min
      RUNTIME.golden.active = true;
      try { window.UI && window.UI.spawnGolden(); } catch (e) { RUNTIME.golden.active = false; }
    }
  }

  // chamado pela UI quando o jogador clica no Thiego Dourado
  G.goldenClicked = function () {
    const s = G.s;
    if (!s) return null;
    RUNTIME.golden.active = false;
    // recompensa instantânea: 10–20 min de DPS (escalando com o progresso)
    const secs = (10 + Math.random() * 10) * 60 * Econ.eventRewardMult(s);
    const gain = N.mul(Econ.dps(s, RUNTIME), N.fromF(secs));
    earn(s, gain);
    const enc = spawnEncounter('dourado'); // + buff de clique do Dourado
    G.checkAchievements();
    G.save();
    return { gain, enc };
  };

  G.addSecret = function (flag) {
    const s = G.s;
    if (s.secrets[flag]) return;
    s.secrets[flag] = true;
    G.checkAchievements();
  };

  /* ============================================================
     LOOP PRINCIPAL
     ============================================================ */
  G.tick = function (dt) {
    const s = G.s;
    if (!s) return;

    const dps = Econ.dps(s, RUNTIME);
    const gain = N.mul(dps, N.fromF(dt));
    earn(s, gain);
    s.playTime += dt;
    s.timestamps.savedAt = Date.now();

    // combo decay
    RUNTIME.comboT -= dt * 1000;
    if (RUNTIME.comboT <= 0) { RUNTIME.comboT = 0; RUNTIME.combo = 0; }

    // poda eventos expirados (evita badges eternos em 0s)
    if (RUNTIME.events.length && RUNTIME.events.some((e) => e.end <= Date.now())) {
      RUNTIME.events = RUNTIME.events.filter((e) => e.end > Date.now());
    }

    // eventos
    RUNTIME.nextEventIn -= dt * 1000;
    if (RUNTIME.nextEventIn <= 0) {
      const [mn, mx] = Econ.eventInterval(s, 40000, 80000);
      RUNTIME.nextEventIn = mn + Math.random() * (mx - mn);
      if (Math.random() < 0.35) {
        const enc = spawnEncounter(false);
        if (enc) window.UI && window.UI.showEncounter(enc);
        else spawnEvent();
      } else {
        spawnEvent();
      }
    }

    // humor
    RUNTIME.humorT -= dt;
    if (RUNTIME.humorT <= 0) {
      RUNTIME.humorT = 6 + Math.random() * 4;
      const pool = N.gte(dps, 1e12) ? T.HUMOR_ABSURD : T.HUMOR;
      RUNTIME.humor = pool[(Math.random() * pool.length) | 0];
    }
    // A3: humor contextual (idle / click spree)
    tickIdleHumor(dt);
    tickClickSpree(dt);
    // A2: eventos narrativos
    tickFlavorEvent(dt);
    // Thiego Dourado flutuante (golden cookie)
    tickGolden(dt);
    // A2: desafio de clique ativo
    if (RUNTIME._flavorChallenge) {
      const ch = RUNTIME._flavorChallenge;
      ch.remaining -= dt;
      if (ch.remaining <= 0) {
        RUNTIME._flavorChallenge = null;
        if (window.UI) window.UI.toast('⏰ Desafio expirou sem completar!', 'info', 3000);
      }
    }
    // A2: recompensas atrasadas (delayed)
    if (RUNTIME.events.some((e) => e.delayedReward)) {
      const now = Date.now();
      for (const ev of RUNTIME.events) {
        if (ev.delayedReward && ev.end <= now) {
          const gain = N.mul(Econ.dps(s, RUNTIME), N.fromF(ev.delayedReward));
          earn(s, gain);
          ev.delayedReward = 0;
          if (window.UI) window.UI.toast('⏳ Bônus atrasado chegou! +' + N.fmt(gain), 'gold', 3500);
        }
      }
    }

    // check periódico
    G._checkT = (G._checkT || 0) + dt;
    if (G._checkT >= 2) {
      G._checkT = 0;
      G.checkAchievements();
      G.checkMilestones();
      prepMissions(s);

      // Auto-prestige: quando habilitado e prestige disponível (exige 50 prestígios manuais — P0)
      // C5: hardcore bloqueia auto-prestige
      const hcBlock = Econ.hardcore(s) && T.HARDCORE && T.HARDCORE.noAutoPrestige;
      if (!hcBlock && s.settings && s.settings.autoPrestige && s.prestige >= 50 && Econ.canPrestige(s)) {
        G.prestige();
        if (window.UI && window.UI.toast) {
          window.UI.toast('⚡ PRESTIGE AUTOMÁTICO EXECUTADO!', 'gold', 4000);
        }
      }
    }
    // C4: dopamina visual - tick do motor de juice (a cada frame)
    if (window.Juice && typeof Juice.tick === "function") Juice.tick(dt);
    // Update HUD
    if (window.UI && typeof UI.tick === "function") UI.tick(dt);
  };
  /* ============================================================
     OFFLINE — calculado na carga
     ============================================================ */
  G.applyOffline = function (state, elapsed) {
    const eff = Econ.offlineEff(state);
    const clamped = Math.min(cap, Math.max(0, elapsed));
    if (clamped < 5) return null;
    try {
      const gain = N.mul(Econ.dps(state, []), N.fromF(clamped * eff));
      if (gain.m > 0) {
        earn(state, gain);
        state.offlineTime += clamped;
        RUNTIME.offline = { elapsed: clamped, gain, eff };
        G.save();
        return RUNTIME.offline;
      }
    } catch (e) {}
    return null;
  };

  /* ============================================================
     CONFIG
     ============================================================ */
  G.setSetting = function (key, value) {
    G.s.settings[key] = value;
    if (key === 'perfMode') document.body.classList.toggle('perf', !!value);
    if (key === 'reducedMotion') document.body.classList.toggle('reduce-motion', !!value);
    if (key === 'particles') { try { window.Fx.setParticles(!!value); } catch (e) {} }
    if (key === 'animations') { try { window.Fx.setAnimations(!!value); } catch (e) {} }
    G.save();
    return true;
  };

  /* ---------- persistência ---------- */
  G.state = null;
  Object.defineProperty(G, 's', { get: () => G.state });

  G.save = function () { window.Save.save(G.state); };
  G.load = function () {
    G.state = window.Save.load();
    if (G.state && G.state._tooNew) return G.state;
    prepMissions(G.state);
    G.checkAchievements(true);
    // A1: lore retroativo (jogadores já evoluídos)
    G.checkLoreUnlock && G.checkLoreUnlock(G.state);
    // B5: boost de retorno
    G.applyReturnBoost && G.applyReturnBoost(G.state);
    return G.state;
  };
  // True quando o save atual nunca teve progresso real (serve para decidir
  // se vale tentar restaurar o backup do servidor).
  G.isFreshSave = function () {
    const s = G.state;
    if (!s) return false;
    if (s._tooNew) return false;
    if (s.migrated) return false;
    if (s.totalEarned && (s.totalEarned.m > 0 || s.totalEarned.e > 0)) return false;
    if (s.tier > 0 || s.prestige > 0) return false;
    if (Array.isArray(s.gens)) { for (const g of s.gens) if (g > 0) return false; }
    if (s.dopamine && (s.dopamine.m > 0 || s.dopamine.e > 0)) return false;
    if (s.playTime > 10) return false;
    return true;
  };

  /* ============================================================
     PLANO DE CONTEÚDO — FRONTEND HOOKS
     ============================================================ */

  // ---- A1: Lore narrativa (desbloqueio por evolução) ----
  G.checkLoreUnlock = function (s) {
    if (!T.LORE || !T.LORE.length) return [];
    const fresh = [];
    for (const ch of T.LORE) {
      if (s.loreUnlocked.includes(ch.id)) continue;
      if (s.tier >= ch.tierMin) {
        s.loreUnlocked.push(ch.id);
        fresh.push(ch);
      }
    }
    if (fresh.length) {
      if (window.UI) {
        window.UI.toast('📖 Novo capítulo: ' + fresh[0].title, 'gold', 5000);
      }
    }
    return fresh;
  };

  // ---- A2: Eventos narrativos com escolha ----
  G.triggerFlavorEvent = function () {
    const s = G.s;
    if (!T.FLAVOR_EVENTS || !T.FLAVOR_EVENTS.length) return null;
    if (s.flavorEvent && s.flavorEvent.deadline > Date.now()) return null; // já ativo
    const pool = T.FLAVOR_EVENTS.filter((ev) => (ev.tierMin || 0) <= s.tier);
    if (!pool.length) return null;
    const ev = pool[(Math.random() * pool.length) | 0];
    const deadline = Date.now() + 60000; // 60s para escolher
    s.flavorEventsSeen[ev.id] = (s.flavorEventsSeen[ev.id] || 0) + 1;
    s.flavorEvent = { id: ev.id, deadline };
    RUNTIME.humor = null; // pausa humor
    // fallback defensivo (M13): se o Hub não inicializou, UI.showFlavorEvent
    // não existiria e o tick do jogo lançaria TypeError
    if (window.UI) {
      if (typeof window.UI.showFlavorEvent !== 'function') {
        window.UI.showFlavorEvent = function () {}; // no-op seguro
      }
      window.UI.showFlavorEvent(ev, deadline);
    }
    return ev;
  };

  G.resolveFlavorChoice = function (choiceIdx) {
    const s = G.s;
    if (!s.flavorEvent) return null;
    const ev = T.FLAVOR_EVENTS.find((e) => e.id === s.flavorEvent.id);
    if (!ev || !ev.choices[choiceIdx]) { s.flavorEvent = null; return null; }
    const choice = ev.choices[choiceIdx];
    const now = Date.now();
    s.flavorEvent = null;
    const fx = choice.effect || {};
    // aplica efeito (formato: effect: { type, value, duration, log10, clicks, time, reward, penalty })
    if (fx.type === 'prodMult' && fx.duration) {
      RUNTIME.events.push({ id: 'flavor_' + ev.id, end: now + fx.duration * 1000, prod: 1 + (fx.value || 0), flavor: true });
      // penalidade aninhada após o término (ex: investidor)
      if (fx.penalty && fx.penalty.duration) {
        const pid = 'flavor_pen_' + ev.id;
        setTimeout(function () {
          RUNTIME.events.push({ id: pid, end: Date.now() + fx.penalty.duration * 1000, prod: 1 + (fx.penalty.prodMult || 0), flavor: true });
        }, fx.duration * 1000);
      }
    } else if (fx.type === 'clickMult' && fx.duration) {
      RUNTIME.events.push({ id: 'flavor_click_' + ev.id, end: now + fx.duration * 1000, click: 1 + (fx.value || 0), flavor: true });
    } else if (fx.type === 'instant' && fx.log10) {
      const gain = N.mul(Econ.dps(s, RUNTIME), N.fromF(fx.log10 * 30));
      earn(s, gain);
    } else if (fx.type === 'clickChallenge' && fx.clicks) {
      RUNTIME._flavorChallenge = { id: ev.id, target: fx.clicks, remaining: fx.time || 30, started: now, reward: fx.reward || null };
    } else if (fx.type === 'penalty' && fx.time) {
      const loss = N.mul(Econ.dps(s, RUNTIME), N.fromF(fx.time || 1));
      s.dopamine = N.max(N.zero, N.sub(s.dopamine, loss));
    } else if (fx.type === 'delayed') {
      // penalidade imediata (se houver)
      if (fx.penalty && fx.penalty.duration) {
        RUNTIME.events.push({ id: 'flavor_del_pen_' + ev.id, end: now + fx.penalty.duration * 1000, prod: 1 + (fx.penalty.prodMult || 0), flavor: true });
      }
      // recompensa atrasada
      if (fx.reward && fx.reward.duration) {
        var delayMs = (fx.penalty ? fx.penalty.duration : 0) * 1000;
        setTimeout(function () {
          RUNTIME.events.push({ id: 'flavor_del_rew_' + ev.id, end: Date.now() + fx.reward.duration * 1000, prod: 1 + (fx.reward.prodMult || 0), flavor: true });
        }, delayMs);
      }
    }
    // else 'none' — sem efeito
    if (window.UI) window.UI.toast('🧩 Escolha aplicada: ' + choice.text, 'info', 3000);
    return choice;
  };

  // ---- A3: Humor contextual ----
  G.sayHumor = function (text, duration) {
    if (text) {
      RUNTIME.humor = text;
      RUNTIME.humorT = duration || 6;
    }
  };

  // ---- B1: Check-in diário (frontend) ----
  G.checkin = function () {
    const s = G.s;
    // BUG corrigido: usava window.Net (não existe) — o cliente HTTP é TDFNet.
    // Isso fazia o botão de check-in ficar preso em "⏳..." para sempre.
    const Net = window.TDFNet;
    if (!Net || !Net.checkin) return Promise.reject(new Error('Net.checkin unavailable'));
    return Net.checkin().then(function (res) {
      if (res && res.ok && !res.already_claimed) {
        // otimista: aplica recompensa local (dopamina do check-in)
        if (res.reward && res.reward.dopamine_log10) {
          const bonus = N.fromLog10(res.reward.dopamine_log10);
          earn(s, bonus);
        }
        // sincroniza o streak LOCAL com o servidor (o Hub lê s.dayStreak)
        if (typeof res.streak === 'number') {
          s.dayStreak = Math.max(s.dayStreak || 0, res.streak);
          try { s.lastActiveDay = new Date().toDateString(); } catch (e2) {}
        }
        G.save();
        if (window.UI) window.UI.toast('✅ Check-in realizado! Streak: ' + (res.streak || 1) + ' dias', 'gold', 4000);
      } else if (res && res.ok && res.already_claimed) {
        if (window.UI) window.UI.toast('✅ Check-in de hoje já foi feito. Volte amanhã!', 'info', 3000);
      } else {
        if (window.UI) window.UI.toast((res && res.error) || 'Check-in já feito hoje', 'info', 3000);
      }
      return res;
    }).catch(function () {
      if (window.UI) window.UI.toast('Erro ao fazer check-in (offline)', 'info', 3000);
      return null;
    });
  };

  // ---- C5: Hardcore run ----
  G.startHardcoreRun = function () {
    if (!window.Save) return false;
    const fresh = window.Save.fresh();
    fresh.hardcore = true;
    G.state = fresh;
    G.save();
    if (window.UI) window.UI.toast('💀 RUN HARDCORE INICIADA! Sem offline, sem auto-prestige, custos dobrados!', 'gold', 6000);
    // A3: humor hardcore
    if (T.HUMOR_ON_HARDORE && T.HUMOR_ON_HARDORE.length) {
      RUNTIME.humor = T.HUMOR_ON_HARDORE[(Math.random() * T.HUMOR_ON_HARDORE.length) | 0];
      RUNTIME.humorT = 10;
    }
    return true;
  };

  // ---- B5: Boost de retorno (concedido ao voltar de ausência) ----
  G.applyReturnBoost = function (s) {
    if (s.returnBoost && s.returnBoost.until > Date.now()) return; // já ativo
    // concede boost se ausente >= 3 dias (72h) ou se playTime < 3600 (jogador novo)
    const absentDays = (Date.now() - s.timestamps.savedAt) / 86400000;
    if (absentDays >= 3) {
      const mult = Math.min(3, 1 + Math.floor(absentDays / 3) * 0.5); // +0.5 a cada 3 dias, máx 3×
      const until = Date.now() + 24 * 3600 * 1000; // 24h de boost
      s.returnBoost = { mult, until };
      if (window.UI) window.UI.toast('🎉 Boost de retorno ativo! ×' + mult + ' produção por 24h!', 'gold', 6000);
    }
  };

  // ---- C6: Escolher caminho de ascensão ----
  G.chooseAscensionPath = function (pathId) {
    const s = G.s;
    if (!T.ASCENSION_PATHS || !T.ASCENSION_PATHS.some((p) => p.id === pathId)) return false;
    s.ascensionPath = pathId;
    s._pendingAscension = false;
    G.save();
    if (window.UI) window.UI.toast('⚡ Caminho da Ascensão escolhido: ' + (T.ASCENSION_PATHS.find((p) => p.id === pathId) || {}).name, 'gold', 5000);
    return true;
  };

  // ---- Tick de flavor events, idle humor, click spree ----
  // Chamado pelo G.tick
  // Primeira janela igual às demais (5-20 min): nada de pop-up no boot —
  // visitante novo merece os primeiros cliques sem evento narrativo (lição CC: golden cookie nunca no load)
  G._flavorTimer = 300 + Math.random() * 900;

  function tickFlavorEvent(dt) {
    const s = G.s;
    if (!T.FLAVOR_EVENTS || !T.FLAVOR_EVENTS.length) return;
    G._flavorTimer -= dt;
    if (G._flavorTimer > 0) return;
    // intervalo: 5-20 minutos
    G._flavorTimer = 300 + Math.random() * 900;
    if (s.flavorEvent && s.flavorEvent.deadline > Date.now()) return; // já ativo
    // 30% de chance a cada intervalo
    if (Math.random() < 0.3) G.triggerFlavorEvent();
  }

  function tickIdleHumor(dt) {
    const s = G.s;
    const idleDuration = (Date.now() - RUNTIME.idleSince) / 1000;
    if (idleDuration > 30 && T.HUMOR_ON_IDLE && T.HUMOR_ON_IDLE.length) {
      if (RUNTIME.humorT <= 0 || RUNTIME.humorT < 2) {
        RUNTIME.humor = T.HUMOR_ON_IDLE[(Math.random() * T.HUMOR_ON_IDLE.length) | 0];
        RUNTIME.humorT = 8;
      }
    }
  }

  function tickClickSpree(dt) {
    const s = G.s;
    if (RUNTIME.combo >= 20 && T.HUMOR_ON_CLICK_SPREE && T.HUMOR_ON_CLICK_SPREE.length) {
      if (RUNTIME.humorT <= 0 || RUNTIME.humorT < 2) {
        RUNTIME.humor = T.HUMOR_ON_CLICK_SPREE[(Math.random() * T.HUMOR_ON_CLICK_SPREE.length) | 0];
        RUNTIME.humorT = 6;
      }
    }
  }
})();
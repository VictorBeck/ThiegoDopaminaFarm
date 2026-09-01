/* ============================================================
   THIEGO DOPAMINA FARM — economy.js
   Todos os derivados: produção, clique, crítico, combo, custos,
   prestige, offline, eventos. Funções puras sobre o estado.
   Nenhum número mágico fora do registry (data.js).
   ============================================================ */
(function () {
  'use strict';
  const T = window.TDF;
  const N = window.Num;
  const Econ = window.Econ = {};

  /* ---------- helpers de upgrades ---------- */
  function upLevel(s, id, dflt) { return s.upgrades[id] || dflt || 0; }
  Econ.upLevel = upLevel;

  function upSum(s, type) {
    let total = 0;
    for (const u of T.UPGRADES) {
      if (u.effect.type !== type) continue;
      const lvl = upLevel(s, u.id);
      if (lvl > 0) total += u.effect.value * lvl;
    }
    return total;
  }
  Econ.upSum = upSum;

  function treeLevel(s, id) { return s.tree[id] || 0; }
  Econ.treeLevel = treeLevel;

  // nível na árvore de TRANSCENDÊNCIA (s.transTree)
  function transLevel(s, id) { return (s.transTree && s.transTree[id]) || 0; }
  Econ.transLevel = transLevel;

  /* ============================================================
     PLANO DE CONTEÚDO: HARDCORE (C5) + ASCENSÃO (C6) helpers
     ============================================================ */
  Econ.hardcore = function (s) { return !!(s && s.hardcore && T.HARDCORE); };
  function hc(s) { const h = T.HARDCORE; return Econ.hardcore(s) ? h : null; }

  // perks ativos do caminho de ascensão escolhido
  function ascActive(s) {
    const list = [];
    if (!s.ascensionPath || !T.ASCENSION_PATHS) return list;
    const path = T.ASCENSION_PATHS.find((p) => p.id === s.ascensionPath);
    if (!path) return list;
    const tier = s.ascensionTier || 0;
    for (const perk of path.perks) {
      if (tier >= perk.tier) list.push(perk);
    }
    return list;
  }
  function ascSum(s, type) {
    let total = 0;
    for (const perk of ascActive(s)) {
      if (perk.effect && perk.effect.type === type) total += perk.effect.value;
      if (perk.extra && perk.extra.type === type) total += perk.extra.value;
    }
    return total;
  }
  Econ.ascSum = ascSum;

  function treeSum(s, type) {
    let total = 1;
    for (const tr of T.PRESTIGE_TREE) {
      if (tr.effect.type !== type) continue;
      const lvl = treeLevel(s, tr.id);
      if (lvl > 0) total *= Math.pow(1 + tr.effect.value, lvl);
    }
    return total;
  }
  Econ.treeSum = treeSum;

  /* ---------- multiplicadores estruturais ---------- */
  Econ.evoMult = function (s) {
    let m = 1;
    for (let i = 0; i <= s.tier; i++) m *= T.EVOLUTIONS[i].mult;
    return m;
  };

  Econ.prestigeMult = function (s) {
    // total de pontos já ganhos (disponíveis + gastos na árvore):
    // gastar pontos NUNCA reduz o multiplicador —
    // cada ponto ganho permanentemente dá +12% de produção
    const totalPoints = Math.max(0, (s.points || 0)) + Math.max(0, (s.pointsSpent || 0));
    const base = N.pow({ m: 1.12, e: 0 }, totalPoints);
    const bonus = 1 + upSum(s, 'prestigeMult');
    return N.mul(base, N.fromF(bonus));
  };

  /* ---------- TRANSCENDÊNCIA (meta-camada infinita) ----------
     Depois de prestigiar bastante, o jogador pode TRANSCENDER:
     reseta prestige+árvore+run, mas ganha PONTOS DE TRANSCENDÊNCIA
     permanentes. Cada ponto dá ×2 de produção GLOBAL. Esses pontos
     podem ser gastos numa árvore própria (que multiplica ainda mais,
     sem reduzir o multiplicador base). Progresso infinito. */
  Econ.transcMult = function (s) {
    const total = Math.max(0, (s.tPoints || 0)) + Math.max(0, (s.tPointsSpent || 0));
    // cada ponto = ×2 de produção GLOBAL (os efeitos da árvore de
    // transcendência são aplicados individualmente em prodBonus, genMult,
    // costRed, clickPower e offline)
    return N.pow({ m: 2, e: 0 }, total);
  };

  // dopamina total (log10) necessária para transcender
  Econ.transcendNeedLog = function (s) {
    // cresce com cada transcendência: 1e50 + 10 por transcendência
    return 50 + (s.transcends || 0) * 10 + (s.tPoints || 0) * 2;
  };

  Econ.canTranscend = function (s) {
    return N.gte(s.totalEarned, N.fromF(Math.pow(10, Math.min(Econ.transcendNeedLog(s), 300))));
  };

  // pontos de transcendência a ganhar ao transcender
  Econ.transcendGain = function (s) {
    const needLog = Econ.transcendNeedLog(s);
    const cur = N.log10(s.totalEarned);
    if (cur < needLog) return 0;
    // +1 ponto a cada 15 log10 além do limiar
    return Math.max(1, Math.floor((cur - needLog) / 15) + 1);
  };

  Econ.transcendMultAfter = function (s, gained) {
    const total = Math.max(0, (s.tPoints || 0)) + Math.max(0, (s.tPointsSpent || 0));
    return N.pow({ m: 2, e: 0 }, total);
  };

  const ACH_BONUS = 0.01, ACH_SECRET_BONUS = 0.02;
  Econ.achMult = function (s) {
    let n = 0, sec = 0;
    for (const id of s.achievements) {
      const a = T.ACHIEVEMENTS.find((k) => k.id === id);
      if (!a) continue;
      if (a.secret) sec++; else n++;
    }
    return Math.pow(1 + ACH_BONUS, n) * Math.pow(1 + ACH_SECRET_BONUS, sec);
  };

  Econ.genMult = function (s) {
    const base = 1 + upSum(s, 'genMult');
    const tree = treeSum(s, 'genMult');
    const transc = Math.pow(2, transLevel(s, 'transGen')); // ×2 por nível na árvore de transcendência
    const asc = 1 + ascSum(s, 'genMult');                  // C6: ascensão (poder t2: geradores ×2)
    return base * tree * transc * asc;
  };

  Econ.prodBonus = function (s) {
    // upgrades prodMult + meme (prodMult) + árvore poder (prodMult)
    let ups = 1 + upSum(s, 'prodMult');
    const tree = treeSum(s, 'prodMult');
    const transc = Math.pow(2, transLevel(s, 'transProd')); // árvore de transcendência
    const asc = 1 + ascSum(s, 'prodMult');                  // C6: ascensão (poder t1:+50%, t5:×10)
    // perEvo: (1+v)^lvl por evolução possuída (tier+1)
    let perEvo = 1;
    const evoCount = s.tier + 1;
    for (const u of T.UPGRADES) {
      if (u.effect.type === 'perEvo') {
        const lvl = upLevel(s, u.id);
        if (lvl > 0) perEvo *= Math.pow(1 + u.effect.value * lvl, evoCount);
      }
    }
    return ups * tree * transc * perEvo * asc;
  };

  function treeReduction(s, type) {
    // efeitos de redução: (1 - value)^lvl (ex.: costRed ×0.93 por nível)
    let total = 1;
    for (const tr of T.PRESTIGE_TREE) {
      if (tr.effect.type !== type) continue;
      const lvl = treeLevel(s, tr.id);
      if (lvl > 0) total *= Math.pow(1 - tr.effect.value, lvl);
    }
    return total;
  }

  Econ.costRed = function (s) {
    const ups = 1 - upSum(s, 'costRed');
    const tree = treeReduction(s, 'costRed'); // 0.93^n multiplicativo
    const transc = Math.pow(0.90, transLevel(s, 'transCost')); // árvore de transcendência
    const asc = 1 - ascSum(s, 'costRed');     // C6: ascensão (sabedoria t1:-10%, t5:-50%)
    return Math.max(0.25, ups * tree * transc * asc); // P0: floor 0.1 → 0.25
  };

  Econ.evoCostRed = function (s) {
    const transc = Math.pow(0.85, transLevel(s, 'transEvo'));
    const asc = 1 - ascSum(s, 'evoCost');     // C6: ascensão (sabedoria t2: ×0.80)
    return Math.max(0.25, (1 - upSum(s, 'evoCost')) * Econ.costRed(s) * transc * asc); // P0: floor 0.1 → 0.25
  };

  /* ---------- geradores ---------- */
  Econ.milestoneMult = function (level) {
    let m = 1;
    for (const ms of T.MILESTONES) if (level >= ms) m *= T.MILESTONE_MULT;
    return m;
  };

  Econ.genCost = function (s, i, n) {
    const g = T.GENERATORS[i];
    const owned = s.gens[i];
    const single = N.fromF(g.baseCost);
    const hcCost = hc(s) ? (hc(s).genCostMult || 1) : 1; // C5: hardcore ×1.5 nos custos
    if (n === 1) {
      const c = N.mul(single, N.pow({ m: g.growth, e: 0 }, owned));
      return N.mul(N.mul(c, N.fromF(Econ.costRed(s))), N.fromF(hcCost));
    }
    // soma geométrica: cost * (g^n - 1)/(g - 1)
    const gr = N.pow({ m: g.growth, e: 0 }, owned);
    const grN = N.pow({ m: g.growth, e: 0 }, n);
    const sum = N.div(N.sub(grN, N.one), N.sub({ m: g.growth, e: 0 }, N.one));
    return N.mul(N.mul(N.mul(single, gr), N.mul(sum, N.fromF(Econ.costRed(s)))), N.fromF(hcCost));
  };

  Econ.maxGenBuy = function (s, i) {
    const g = T.GENERATORS[i];
    const owned = s.gens[i];
    const dop = s.dopamine;
    const cost = N.mul(N.fromF(g.baseCost), N.pow({ m: g.growth, e: 0 }, owned));
    const red = N.fromF(Econ.costRed(s));
    const hcCost = hc(s) ? (hc(s).genCostMult || 1) : 1; // C5: hardcore nos custos
    const c = N.mul(N.mul(cost, red), N.fromF(hcCost));
    if (N.lte(dop, c)) return 0;
    // n = floor( log_g( 1 + dop*(g-1)/c ) )
    const g1 = g.growth - 1;
    const ratio = N.div(N.mul(dop, N.fromF(g1)), c);
    const inner = N.add(N.one, ratio);
    const n = Math.floor(N.log10(inner) / Math.log10(g.growth));
    return Math.max(0, Math.min(1e6, n));
  };

  Econ.genDps = function (s) {
    const gm = Econ.genMult(s);
    let total = N.zero;
    T.GENERATORS.forEach((g, i) => {
      const lvl = s.gens[i];
      if (lvl <= 0) return;
      const prod = N.mul(N.fromF(g.baseProd * Econ.milestoneMult(lvl)), N.fromF(lvl));
      total = N.add(total, prod);
    });
    return N.mul(total, N.fromF(gm));
  };

  // dps por unidade de um gerador específico (para exibição)
  Econ.genUnitDps = function (s, i) {
    const g = T.GENERATORS[i];
    const lvl = s.gens[i];
    const prod = N.fromF(g.baseProd * Econ.milestoneMult(lvl));
    return N.mul(prod, N.fromF(Econ.genMult(s)));
  };

  /* ---------- eventos (runtime) ---------- */
  Econ.eventProdMult = function (runtime) {
    let m = 1;
    if (!runtime || !runtime.events) return m;
    const now = Date.now();
    for (const ev of runtime.events) {
      if (ev.end > now && ev.prod) m *= ev.prod;
    }
    return m;
  };
  Econ.eventClickMult = function (runtime) {
    let m = 1;
    if (!runtime || !runtime.events) return m;
    const now = Date.now();
    for (const ev of runtime.events) {
      if (ev.end > now && ev.click) m *= ev.click;
    }
    return m;
  };
  Econ.eventGlitch = function (runtime) {
    if (!runtime || !runtime.events) return false;
    const now = Date.now();
    return runtime.events.some((ev) => ev.end > now && ev.glitch);
  };

  /* ---------- produção global ---------- */
  Econ.farmMult = 1;
  Econ.rankDopMult = 1;   // buff de top 3 em dopamina (definido pelo ranking)
  Econ.rankPresMult = 1;  // buff de top 3 em prestige (definido pelo ranking)
  Econ.globalMult = function (s, runtime) {
    const evo = N.fromF(Econ.evoMult(s));
    const pres = Econ.prestigeMult(s);
    const transc = Econ.transcMult(s);
    const ach = N.fromF(Econ.achMult(s));
    const bonus = N.fromF(Econ.prodBonus(s));
    const evt = N.fromF(Econ.eventProdMult(runtime));
    const farm = N.fromF(Econ.farmMult);
    const rankDop = N.fromF(Econ.rankDopMult);
    let m = N.mul(evo, pres);
    m = N.mul(m, transc);
    m = N.mul(m, ach);
    m = N.mul(m, bonus);
    m = N.mul(m, evt);
    m = N.mul(m, farm);
    m = N.mul(m, rankDop);
    // B5: boost de retorno (recompensa por voltar ao jogo)
    if (s.returnBoost && s.returnBoost.until > Date.now() && s.returnBoost.mult > 1) {
      m = N.mul(m, N.fromF(s.returnBoost.mult));
    }
    return m;
  };

  Econ.dps = function (s, runtime) {
    const gen = Econ.genDps(s);
    return N.mul(gen, Econ.globalMult(s, runtime));
  };

  /* ---------- clique ---------- */
  Econ.comboWindow = function (s) { return 2600 + upSum(s, 'comboTime'); };
  Econ.comboCap = function (s) { return 25 + upSum(s, 'comboCap'); };
  Econ.comboMult = function (s, combo) {
    const cap = Econ.comboCap(s);
    const m = 1 + Math.max(0, (combo || 0) - 1) * 0.1;
    return Math.min(cap, m);
  };
  Econ.critChance = function (s) {
    const asc = ascSum(s, 'critChance'); // C6: ascensão (caos t1: +10%)
    return Math.min(0.75, 0.05 + upSum(s, 'critChance') + 0.02 * treeLevel(s, 'transcendencia') + 0.02 * treeLevel(s, 'sorte') + asc); // P0: ramo 'sorte'
  };
  Econ.critMult = function (s) {
    const asc = ascSum(s, 'critMult'); // C6: ascensão (caos t2: ×3)
    return 3 + upSum(s, 'critMult') + asc;
  };
  // C6: produção pode críticar (caos t5)
  Econ.prodCritChance = function (s) {
    return ascSum(s, 'prodCrit');
  };
  Econ.clickPower = function (s, runtime, combo) {
    let base = 1 + upSum(s, 'clickMult') + ascSum(s, 'clickMult'); // C6: ascensão (poder t3, caos t4)
    const treeClick = Math.pow(1.4, treeLevel(s, 'transcendencia')) * Math.pow(1.05, treeLevel(s, 'foco')); // P0: ramo 'foco'
    const transClick = Math.pow(2, transLevel(s, 'transClick')); // árvore de transcendência
    let power = N.fromF(base * treeClick * transClick);
    power = N.mul(power, N.fromF(Econ.comboMult(s, combo)));
    power = N.mul(power, N.fromF(Econ.eventClickMult(runtime)));
    power = N.mul(power, Econ.globalMult(s, runtime));
    // share do dps no clique
    const share = upSum(s, 'clickShare');
    if (share > 0) {
      power = N.add(power, N.mul(Econ.dps(s, runtime), N.fromF(share)));
    }
    return power;
  };

  /* ---------- evolução ---------- */
  Econ.evoCost = function (s, tierIndex) {
    const c = T.EVOLUTIONS[tierIndex].cost;
    if (c === 0) return N.zero;
    return N.mul(N.fromF(c), N.fromF(Econ.evoCostRed(s)));
  };
  Econ.nextTier = function (s) {
    const t = s.tier + 1;
    return t < T.EVOLUTIONS.length ? t : null;
  };

  /* ---------- prestige ---------- */
  // Ganho LINEAR no log10 do que a RUN atual produziu (runEarned): cada
  // década de dopamina na run rende PRESTIGE_EXP pontos fixos. Sub-linear.
  // Para convergir (nada de Infinity), o limiar de ascensão cresce MAIS
  // rápido que o multiplicador: precisa de runEarned ≥ 1e12 × mult^1.5,
  // então cada ciclo exige uma run progressivamente mais funda e o total
  // de pontos se estabiliza num valor finito.
  const PRESTIGE_BASE_LOG = 12;      // 1e12 dopamina na run
  const PRESTIGE_EXP = 0.35;          // P0: 0.6 → 0.35 (ganho ~42% menor)
  const PRESTIGE_THRESHOLD_EXP = 1.2; // P0: 1.5 → 1.2 (convergência mais suave)
  let MULT_PER_POINT = 1.12;
  Econ.PRESTIGE_BASE_LOG = PRESTIGE_BASE_LOG;
  Econ.prestigeGain = function (s) {
    const src = s.runEarned || s.totalEarned;
    const logT = N.log10(src);
    if (logT < PRESTIGE_BASE_LOG) return N.zero;
    const raw = PRESTIGE_EXP * (logT - PRESTIGE_BASE_LOG);
    const mult = 1 + upSum(s, 'prestigeGain');
    const rankMult = (Econ.rankPresMult || 1);
    const hcMult = (hc(s) && hc(s).prestigeMult) || 1; // C5: hardcore = ×2 pontos
    return N.floor(N.fromF(raw * mult * rankMult * hcMult));
  };
  // dopamina da run necessária para ascender: 1e12 × mult^PRESTIGE_THRESHOLD_EXP
  Econ.prestigeNeed = function (s) {
    const multLog = N.log10(Econ.prestigeMult(s));
    const needLog = PRESTIGE_BASE_LOG + PRESTIGE_THRESHOLD_EXP * multLog;
    return N.fromF(Math.pow(10, Math.min(Math.max(needLog, 0), 300)));
  };
  Econ.canPrestige = function (s) {
    return N.gte(s.runEarned, Econ.prestigeNeed(s)) && N.gte(Econ.prestigeGain(s), N.one);
  };
  Econ.multWithPoints = function (points) { return N.pow({ m: MULT_PER_POINT, e: 0 }, points); };

  // mult resultante se o jogador ascender ganhando gainedPoints pontos
  Econ.prestigeMultAfter = function (s, gainedPoints) {
    return N.mul(Econ.prestigeMult(s), Econ.multWithPoints(Math.max(1, Math.floor(gainedPoints))));
  };

  // segundos até ascender (Infinity se impossível) — calculado em log-space
  Econ.secsToPrestige = function (s, runtime) {
    const upMult = Math.max(0.01, PRESTIGE_EXP * (1 + upSum(s, 'prestigeGain')));
    const g = N.toF(Econ.prestigeGain(s));
    const cur = Math.max(0, N.log10(s.runEarned || s.totalEarned));
    let needLog;
    if (!(g >= 1)) {
      needLog = PRESTIGE_BASE_LOG + 1 / upMult; // log10 para ganhar o 1º ponto
    } else {
      needLog = Math.max(
        PRESTIGE_BASE_LOG + (Math.floor(g) + 1) / upMult,                     // próximo ponto
        PRESTIGE_BASE_LOG + PRESTIGE_THRESHOLD_EXP * N.log10(Econ.prestigeMult(s)) // limiar
      );
    }
    if (needLog <= cur) return 0;
    const dps = N.toF(Econ.dps(s, runtime));
    if (!(dps > 0)) return Infinity;
    const step = Math.pow(10, needLog - cur);
    return Math.max(0, (step - 1) * Math.pow(10, cur) / dps);
  };

  /* ---------- offline ---------- */
  Econ.offlineEff = function (s) {
    // C5: hardcore sem offline
    if (hc(s) && hc(s).noOffline) return 0;
    return Math.min(1, 0.25 + upSum(s, 'offlineEff') + 0.08 * treeLevel(s, 'offline') + 0.20 * transLevel(s, 'transOff') + ascSum(s, 'offlineEff')); // P0: 0.35/0.10/0.25 → 0.25/0.08/0.20
  };
  Econ.offlineCap = function (s) {
    return (8 + 4 * treeLevel(s, 'offline') + 12 * transLevel(s, 'transOff')) * 3600 + upSum(s, 'offlineCap') * 3600;
  };

  /* ---------- eventos (frequência) ---------- */
  Econ.eventInterval = function (s, baseMin, baseMax) {
    let freq = Math.max(0.2, 1 - upSum(s, 'eventFreq'));
    const evtTree = treeLevel(s, 'eventos');
    freq *= Math.pow(0.85, evtTree);
    freq *= Math.max(0.2, 1 - ascSum(s, 'eventFreq')); // C6: ascensão (caos t3: 2× mais frequentes)
    return [baseMin * freq, baseMax * freq];
  };
  Econ.eventDurMult = function (s) {
    return 1 + upSum(s, 'eventDur') + 0.15 * treeLevel(s, 'eventos') + ascSum(s, 'eventDur'); // C6: ascensão (sabedoria t4: +50%)
  };
  Econ.eventRewardMult = function (s) {
    return 1 + upSum(s, 'eventReward') + 0.25 * treeLevel(s, 'eventos');
  };

  // C5: custo de upgrade (upgrades custam 2× no hardcore) — usado pelo game.js
  Econ.upgradeCostMult = function (s) {
    return hc(s) ? ((hc(s).upgradeCostMult) || 1) : 1;
  };
  Econ.upgradeCost = function (s, u) {
    return N.mul(N.mul(N.fromF(u.cost), N.fromF(Econ.costRed(s))), N.fromF(Econ.upgradeCostMult(s)));
  };

  /* ---------- breakdown (tooltip) ---------- */
  Econ.breakdown = function (s, runtime) {
    return {
      base: Econ.genDps(s),
      evo: N.fromF(Econ.evoMult(s)),
      prestige: Econ.prestigeMult(s),
      achievements: N.fromF(Econ.achMult(s)),
      upgrades: N.fromF(Econ.prodBonus(s)),
      event: N.fromF(Econ.eventProdMult(runtime)),
      total: Econ.dps(s, runtime),
    };
  };
})();
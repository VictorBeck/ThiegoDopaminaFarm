/* ============================================================
   THIEGO DOPAMINA FARM — antiCheat.js
   Detecção de anomalias no cliente. O servidor (api/ranking.php)
   é quem valida de verdade — aqui apenas evitamos pontuação
   obviamente inválida e avisamos o jogador.
   ============================================================ */
(function () {
  'use strict';
  const AC = window.AC = { flags: 0, warned: false };

  let lastLog = null;      // último log10(totalEarned) amostrado
  let lastSampleT = null;
  const clickTimes = [];
  let lastClickT = 0;

  // Amostra o crescimento do total produzido. Se crescer de forma
  // absurdamente mais rápida que a economia real permite, acende o alerta.
  // Janela ampla (15 min) porque os submits são throttled a 90–120s.
  AC.sample = function (log10Total) {
    const now = Date.now();
    if (lastLog !== null && lastSampleT !== null && now - lastSampleT < 900000) {
      const dtSec = Math.max(1, (now - lastSampleT) / 1000);
      const growPerSec = (log10Total - lastLog) / dtSec;
      // a economia real raramente dobra por segundo: log10 +0.3/s já é muito
      if (growPerSec > 0.5) {
        AC.flag();
        return true;
      }
    }
    lastLog = log10Total;
    lastSampleT = now;
    return false;
  };

  // Cliques por segundo monitorados em janela de 12s.
  AC.clickRate = function () {
    const now = Date.now();
    if (now - lastClickT >= 250) {
      lastClickT = now;
      clickTimes.push(now);
      if (clickTimes.length > 300) clickTimes.shift();
    }
    while (clickTimes.length && clickTimes[0] < now - 12000) clickTimes.shift();
    return Math.max(0, (clickTimes.length - 1) / 12);
  };

  AC.flag = function () {
    AC.flags++;
    if (!AC.warned) {
      AC.warned = true;
      try { window.UI && window.UI.toast('ANOMALIA DETECTADA — RANKING SUSPENSO', 'warn', 5000); } catch (e) {}
    }
  };

  // Limite "moral" para o servidor: pontuação que um ser humano
  // consegue com honestidade em X horas (conservador).
  AC.saneLog10 = function (playTime) {
    return 20 + Math.log10(1 + playTime / 3600) * 5;
  };
})();
/* ============================================================
   THIEGO DOPAMINA FARM — minigames.js (C3)
   Três minigames rápidos: reação, memória, timing.
   Cada um ~30s, 1 tentativa/dia, score 0-1000.
   ============================================================ */
(function () {
  'use strict';
  const N = window.Num;
  const T = window.TDF;
  const Net = window.TDFNet;
  const MG = window.Minigames = {};

  const COLORS = {
    bg: '#1a1a2e',
    fg: '#e0e0e0',
    accent: '#ffd700',
    success: '#00c853',
    fail: '#ff1744',
    neutral: '#7c4dff',
  };

  let activeGame = null;
  let activeContainer = null;
  let activeResolve = null;

  /* ---------- helpers ---------- */
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function renderContainer(title) {
    const c = el('div', 'minigame-container');
    c.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;';
    const box = el('div', 'minigame-box');
    box.style.cssText = 'background:#16213e;border:2px solid #ffd700;border-radius:16px;padding:24px;max-width:480px;width:90%;text-align:center;color:#e0e0e0;font-family:sans-serif;';
    const h = el('h2', '', title);
    h.style.cssText = 'color:#ffd700;margin:0 0 16px 0;font-size:1.4em;';
    box.appendChild(h);
    const body = el('div', 'minigame-body');
    body.style.cssText = 'min-height:200px;display:flex;flex-direction:column;align-items:center;justify-content:center;';
    box.appendChild(body);
    const closeBtn = el('button', '', '✕ Fechar');
    closeBtn.style.cssText = 'margin-top:12px;padding:8px 20px;background:#333;color:#fff;border:1px solid #666;border-radius:8px;cursor:pointer;';
    closeBtn.onclick = function () { document.body.removeChild(c); if (activeResolve) { activeResolve(0); activeResolve = null; } };
    box.appendChild(closeBtn);
    c.appendChild(box);
    document.body.appendChild(c);
    return { container: c, body: body, closeBtn: closeBtn };
  }

  /* ---------- 1. REAÇÃO ---------- */
  function gameReaction() {
    const ui = renderContainer('⚡ REAÇÃO');
    const body = ui.body;
    let score = 0;
    let attempts = 0;
    const maxAttempts = 10;
    let waiting = false;
    let readyAt = 0;
    let finished = false;

    const status = el('p', '', 'Prepare-se...');
    status.style.color = COLORS.accent;
    body.appendChild(status);

    const target = el('div', '', '●');
    target.style.cssText = 'width:120px;height:120px;border-radius:50%;background:#444;margin:16px auto;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:2em;transition:background 0.15s;user-select:none;';
    body.appendChild(target);

    const info = el('p', '', '0/' + maxAttempts);
    info.style.color = COLORS.fg;
    body.appendChild(info);

    function nextRound() {
      if (finished || attempts >= maxAttempts) return finish();
      attempts++;
      waiting = false;
      target.style.background = '#444';
      target.textContent = '●';
      const delay = 800 + Math.random() * 2200; // 0.8-3s
      status.textContent = 'Aguardando...';
      setTimeout(function () {
        if (finished) return;
        waiting = true;
        readyAt = Date.now();
        target.style.background = '#00c853';
        target.textContent = 'CLIQUE!';
        status.textContent = 'AGORA!';
      }, delay);
    }

    target.onclick = function () {
      if (finished) return;
      if (!waiting) return;
      const ms = Date.now() - readyAt;
      waiting = false;
      let pts = 0;
      if (ms <= 150) { pts = 100; status.textContent = '⚡ Sobrenatural! ' + ms + 'ms'; status.style.color = '#ffd700'; }
      else if (ms <= 200) { pts = 90; status.textContent = '🔥 Incrível! ' + ms + 'ms'; status.style.color = '#ff9800'; }
      else if (ms <= 250) { pts = 75; status.textContent = 'Ótimo! ' + ms + 'ms'; status.style.color = '#4caf50'; }
      else if (ms <= 350) { pts = 50; status.textContent = 'Bom! ' + ms + 'ms'; status.style.color = '#8bc34a'; }
      else if (ms <= 500) { pts = 30; status.textContent = 'Ok... ' + ms + 'ms'; status.style.color = '#ffc107'; }
      else { pts = 10; status.textContent = 'Lento... ' + ms + 'ms'; status.style.color = '#ff5722'; }
      score += pts;
      info.textContent = attempts + '/' + maxAttempts + ' | Score: ' + score;
      target.style.background = '#444';
      target.textContent = '●';
      setTimeout(nextRound, 600);
    };

    function finish() {
      if (finished) return;
      finished = true;
      const final = Math.round(score / maxAttempts * 10);
      status.textContent = 'Score final: ' + Math.min(1000, final);
      status.style.color = COLORS.accent;
      target.style.display = 'none';
      const doneBtn = el('button', '', '✅ Enviar resultado');
      doneBtn.style.cssText = 'margin-top:8px;padding:10px 24px;background:#ffd700;color:#000;border:none;border-radius:8px;font-weight:bold;cursor:pointer;';
      doneBtn.onclick = function () {
        if (activeResolve) { activeResolve(Math.min(1000, final)); activeResolve = null; }
        document.body.removeChild(ui.container);
      };
      body.appendChild(doneBtn);
    }

    setTimeout(nextRound, 1000);
  }

  /* ---------- 2. MEMÓRIA ---------- */
  function gameMemory() {
    const ui = renderContainer('🧠 MEMÓRIA');
    const body = ui.body;
    const ICONS = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🦄', '🐔', '🐧', '🐸'];
    let round = 0;
    let sequence = [];
    let playerIdx = 0;
    let score = 0;
    let finished = false;
    let lock = false;

    const status = el('p', '', 'Memorize a sequência!');
    status.style.color = COLORS.accent;
    body.appendChild(status);

    const seqDisplay = el('div', '', '');
    seqDisplay.style.cssText = 'font-size:2.5em;letter-spacing:12px;margin:16px 0;min-height:60px;';
    body.appendChild(seqDisplay);

    const grid = el('div', '');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-width:300px;margin:12px auto;';
    const buttons = [];
    for (let i = 0; i < 12; i++) {
      const btn = el('button', '', ICONS[i % ICONS.length]);
      btn.style.cssText = 'padding:12px;font-size:1.5em;background:#1a1a3e;border:2px solid #333;border-radius:10px;cursor:pointer;transition:0.1s;';
      btn.dataset.idx = i;
      btn.onclick = function () {
        if (lock || finished) return;
        const idx = parseInt(this.dataset.idx);
        if (idx === sequence[playerIdx]) {
          this.style.borderColor = '#00c853';
          playerIdx++;
          score += 10;
          if (playerIdx >= sequence.length) {
            lock = true;
            setTimeout(nextRound, 500);
          }
        } else {
          this.style.borderColor = '#ff1744';
          finish();
        }
        setTimeout(function () { btn.style.borderColor = '#333'; }, 200);
      };
      buttons.push(btn);
      grid.appendChild(btn);
    }
    body.appendChild(grid);

    const info = el('p', '', 'Round: 0 | Score: 0');
    body.appendChild(info);

    function nextRound() {
      if (finished) return;
      round++;
      playerIdx = 0;
      lock = true;
      const next = (Math.random() * 12) | 0;
      sequence.push(next);
      status.textContent = 'Round ' + round + ' — Memorize!';
      info.textContent = 'Round: ' + round + ' | Score: ' + score;
      seqDisplay.textContent = '';
      // mostra sequência
      let i = 0;
      function showNext() {
        if (i >= sequence.length) {
          seqDisplay.textContent = '';
          status.textContent = 'Sua vez!';
          lock = false;
          return;
        }
        const idx = sequence[i];
        seqDisplay.textContent = ICONS[idx % ICONS.length];
        buttons[idx].style.borderColor = '#ffd700';
        setTimeout(function () { buttons[idx].style.borderColor = '#333'; }, 300);
        i++;
        setTimeout(showNext, 500);
      }
      setTimeout(showNext, 600);
    }

    function finish() {
      if (finished) return;
      finished = true;
      lock = true;
      const final = Math.round(score / Math.max(1, round) * 50);
      status.textContent = 'Fim! Você acertou ' + round + ' rounds. Score: ' + Math.min(1000, final);
      status.style.color = COLORS.accent;
      seqDisplay.textContent = '💀';
      const doneBtn = el('button', '', '✅ Enviar resultado');
      doneBtn.style.cssText = 'margin-top:8px;padding:10px 24px;background:#ffd700;color:#000;border:none;border-radius:8px;font-weight:bold;cursor:pointer;';
      doneBtn.onclick = function () {
        if (activeResolve) { activeResolve(Math.min(1000, final)); activeResolve = null; }
        document.body.removeChild(ui.container);
      };
      body.appendChild(doneBtn);
    }

    setTimeout(nextRound, 1000);
  }

  /* ---------- 3. TIMING ---------- */
  function gameTiming() {
    const ui = renderContainer('🎯 TIMING');
    const body = ui.body;
    let attempts = 0;
    const maxAttempts = 8;
    let score = 0;
    let finished = false;
    let animId = null;
    let barPos = 0; // 0-100
    let barDir = 1;

    const status = el('p', '', 'Pare a barra no centro!');
    status.style.color = COLORS.accent;
    body.appendChild(status);

    const track = el('div', '');
    track.style.cssText = 'width:300px;height:40px;background:#222;border-radius:8px;margin:16px auto;position:relative;overflow:hidden;';
    const center = el('div', '', '🎯');
    center.style.cssText = 'position:absolute;left:120px;width:60px;height:40px;display:flex;align-items:center;justify-content:center;color:#ffd700;font-size:1.2em;';
    track.appendChild(center);

    const bar = el('div', '');
    bar.style.cssText = 'width:30px;height:36px;background:#ffd700;border-radius:4px;position:absolute;top:2px;left:0;transition:left 0.05s;';
    track.appendChild(bar);

    const info = el('p', '', '0/' + maxAttempts + ' | Score: 0');
    body.appendChild(info);

    const stopBtn = el('button', '', '⏹ PARAR');
    stopBtn.style.cssText = 'padding:12px 32px;font-size:1.2em;background:#ffd700;color:#000;border:none;border-radius:10px;cursor:pointer;font-weight:bold;margin:8px 0;';
    body.appendChild(stopBtn);

    function startBar() {
      if (finished) return;
      stopBtn.disabled = false;
      stopBtn.style.opacity = '1';
      barPos = 0;
      barDir = 1;
      let speed = 2 + round * 0.5;
      function move() {
        if (finished) return;
        barPos += speed * barDir;
        if (barPos >= 270) { barPos = 270; barDir = -1; }
        if (barPos <= 0) { barPos = 0; barDir = 1; }
        bar.style.left = barPos + 'px';
        animId = requestAnimationFrame(move);
      }
      animId = requestAnimationFrame(move);
    }

    let round = 0;

    stopBtn.onclick = function () {
      if (finished) return;
      if (animId) cancelAnimationFrame(animId);
      stopBtn.disabled = true;
      stopBtn.style.opacity = '0.5';
      round++;
      attempts++;
      const dist = Math.abs(barPos + 15 - 150); // distância do centro
      let pts = 0;
      let msg = '';
      if (dist <= 5) { pts = 100; msg = '🎯 PERFEITO!'; status.style.color = '#ffd700'; }
      else if (dist <= 10) { pts = 80; msg = '🔥 Quase perfeito!'; status.style.color = '#ff9800'; }
      else if (dist <= 20) { pts = 60; msg = '👍 Bom!'; status.style.color = '#4caf50'; }
      else if (dist <= 40) { pts = 40; msg = '👌 Ok'; status.style.color = '#8bc34a'; }
      else if (dist <= 60) { pts = 20; msg = '😅 Passou longe'; status.style.color = '#ffc107'; }
      else { pts = 5; msg = '💀 Muito longe!'; status.style.color = '#ff5722'; }
      score += pts;
      status.textContent = msg + ' (' + dist + 'px)';
      info.textContent = attempts + '/' + maxAttempts + ' | Score: ' + score;
      if (attempts >= maxAttempts) {
        finish();
      } else {
        setTimeout(startBar, 800);
      }
    };

    function finish() {
      if (finished) return;
      finished = true;
      if (animId) cancelAnimationFrame(animId);
      const final = Math.round(score / maxAttempts * 10);
      status.textContent = 'Score final: ' + Math.min(1000, final);
      status.style.color = COLORS.accent;
      bar.style.display = 'none';
      const doneBtn = el('button', '', '✅ Enviar resultado');
      doneBtn.style.cssText = 'margin-top:8px;padding:10px 24px;background:#ffd700;color:#000;border:none;border-radius:8px;font-weight:bold;cursor:pointer;';
      doneBtn.onclick = function () {
        if (activeResolve) { activeResolve(Math.min(1000, final)); activeResolve = null; }
        document.body.removeChild(ui.container);
      };
      body.appendChild(doneBtn);
    }

    setTimeout(startBar, 1000);
  }

  /* ---------- API pública ---------- */
  MG.games = {
    reaction: { name: '⚡ Reação', fn: gameReaction },
    memory: { name: '🧠 Memória', fn: gameMemory },
    timing: { name: '🎯 Timing', fn: gameTiming },
  };

  MG.play = function (gameId) {
    const g = MG.games[gameId];
    if (!g) return Promise.resolve(0);
    if (activeGame) return Promise.resolve(0);
    activeGame = gameId;
    return new Promise(function (resolve) {
      activeResolve = function (score) {
        activeGame = null;
        activeResolve = null;
        if (score > 0 && Net && Net.minigameScore) {
          // antes o erro era engolido (409 "já jogou hoje" sumia) e a
          // recompensa do servidor nunca era mostrada
          Net.minigameScore(gameId, score).then(function (r) {
            if (window.UI && r && r.reward) {
              const rw = r.reward;
              const bits = [];
              if (rw.battle_coins) bits.push('💰' + rw.battle_coins);
              if (rw.xp) bits.push('⚡' + rw.xp);
              if (rw.dopamine_log10) bits.push('🧠 10^' + rw.dopamine_log10);
              window.UI.toast('🏅 ' + g.name + ': ' + score + ' — ' + (bits.length ? bits.join(' ') : 'registrado'), 'gold', 4000);
            }
          }).catch(function (e) {
            if (window.UI) window.UI.toast((e && e.message) || 'Erro ao enviar score.', 'error', 3500);
          });
        }
        resolve(score);
      };
      g.fn();
    });
  };

  MG.isActive = function () { return activeGame !== null; };
})();
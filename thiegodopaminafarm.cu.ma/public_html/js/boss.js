/* ============================================================
   THIEGO DOPAMINA FARM — boss.js
   BOSS MUNDIAL COLABORATIVO:
   - Barra de HP em tempo real (via Ably + polling)
   - Botão atacar (dano = f(totalEarned) validado no servidor)
   - Recompensas ao matar (coins + XP creditados no servidor)
   - Ranking de dano da fase
   - Integra com o painel do chat (js/chat.js)
   ============================================================ */
(function () {
  'use strict';

  var RT = window.Realtime;
  var Boss = window.Boss = {
    state: null,      // {hp, maxHp, phase, name, state, ...}
    me: null,         // {damage, attacks}
    rank: null,
    attacking: false,
    cooldown: 0,
    top: [],
  };

  var bossEl = null, barEl = null, hpTextEl = null, infoEl = null, atkEl = null, btnEl = null, rankEl = null;

  /* ---------- construir UI dentro do painel do chat ---------- */
  Boss.build = function () {
    var panel = document.getElementById('chat-panel');
    if (!panel) return;
    bossEl = document.createElement('div');
    bossEl.id = 'boss-box';
    bossEl.className = 'boss-box';
    bossEl.innerHTML =
      '<div class="boss-head">' +
      '  <div class="boss-name" id="boss-name">👾 BOSS MUNDIAL</div>' +
      '  <div class="boss-phase" id="boss-phase">FASE 1</div>' +
      '</div>' +
      '<div class="boss-bar"><div class="boss-fill" id="boss-fill" style="width:100%"></div></div>' +
      '<div class="boss-hp" id="boss-hp">—</div>' +
      '<div class="boss-atk" id="boss-atk"></div>' +
      '<div class="boss-info" id="boss-info"></div>' +
      '<button class="boss-attack" id="boss-attack">⚔️ ATACAR</button>' +
      '<div class="boss-top" id="boss-top"></div>';
    // insere antes do form do chat
    var form = document.getElementById('chat-form');
    panel.insertBefore(bossEl, form);
    // remove o botão antigo simples do chat.js se existir
    var old = panel.querySelector('.chat-boss-btn');
    if (old) old.remove();
    var oldBox = document.getElementById('chat-boss');
    if (oldBox) oldBox.remove();

    barEl = document.getElementById('boss-fill');
    hpTextEl = document.getElementById('boss-hp');
    infoEl = document.getElementById('boss-info');
    atkEl = document.getElementById('boss-atk');
    btnEl = document.getElementById('boss-attack');
    rankEl = document.getElementById('boss-top');

    btnEl.addEventListener('click', attack);
    refresh();
    // atualiza a cada 20s (fallback caso Ably falhe)
    setInterval(refresh, 20000);
  };

  /* ---------- buscar estado ---------- */
  function refresh() {
    fetch('api/boss.php?route=state', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) return;
        Boss.state = d.boss;
        Boss.me = d.me;
        Boss.rank = d.rank;
        render();
      })
      .catch(function () {});
  }

  function fetchTop() {
    fetch('api/boss.php?route=leaderboard', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok) { Boss.top = d.top || []; renderTop(); }
      })
      .catch(function () {});
  }

  /* ---------- renderizar ---------- */
  function render() {
    if (!Boss.state || !bossEl) return;
    var b = Boss.state;
    var hp = Math.max(0, b.hp);
    var pct = b.maxHp > 0 ? (hp / b.maxHp) * 100 : 0;
    document.getElementById('boss-name').textContent = (b.icon || '👾') + ' ' + b.name;
    document.getElementById('boss-phase').textContent = 'FASE ' + b.phase;
    if (barEl) barEl.style.width = pct + '%';
    barEl.style.background = pct > 50 ? 'linear-gradient(90deg,#5effb1,#00d9ff)'
      : pct > 25 ? 'linear-gradient(90deg,#ffd700,#ffa15e)'
      : 'linear-gradient(90deg,#ff5e6c,#ff0000)';
    if (hpTextEl) {
      if (b.state === 'dead') {
        hpTextEl.textContent = '💀 MORTO! Próximo em ' + fmtTime((b.respawnAt || 0) - Date.now() / 1000);
      } else {
        hpTextEl.textContent = fmtNum(hp) + ' / ' + fmtNum(b.maxHp) + ' HP';
      }
    }
    if (atkEl) {
      atkEl.innerHTML = '<span class="boss-atk-name">⚔️ ' + esc(b.atk || '') + '</span>' +
        '<span class="boss-atk-desc">' + esc(b.atkDesc || '') + '</span>';
    }
    if (infoEl) {
      var parts = [];
      if (Boss.me) parts.push('Você: ' + fmtNum(Boss.me.damage) + ' dmg · ' + Boss.me.attacks + ' ataques');
      if (Boss.rank) parts.push('Rank #' + Boss.rank);
      infoEl.textContent = parts.join(' · ');
    }
    // botão
    var isDead = b.state === 'dead';
    btnEl.disabled = isDead || Boss.attacking;
    btnEl.textContent = isDead ? '⏳ RECARREGANDO...' : (Boss.attacking ? '⚔️ ATACANDO...' : '⚔️ ATACAR');
    fetchTop();
  }

  function renderTop() {
    if (!rankEl) return;
    if (!Boss.top.length) { rankEl.innerHTML = ''; return; }
    var html = '<div class="boss-top-title">🏆 TOP DANO</div>';
    Boss.top.slice(0, 5).forEach(function (r, i) {
      html += '<div class="boss-top-row"><span class="boss-top-pos">' + (i + 1) + '</span>' +
        '<span class="boss-top-name">' + esc(r.username) + '</span>' +
        '<span class="boss-top-dmg">' + fmtNum(r.damage) + '</span></div>';
    });
    rankEl.innerHTML = html;
  }

  /* ---------- atacar ---------- */
  function attack() {
    if (Boss.attacking) return;
    var b = Boss.state;
    if (!b || b.state === 'dead') return;
    Boss.attacking = true;
    render();
    fetch('api/boss.php?route=attack', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        Boss.attacking = false;
        if (!d.ok) {
          if (d.error && d.error.includes('login')) {
            if (window.UI && window.UI.toast) window.UI.toast('🔒 Faça login para atacar o boss!', 'warn', 3500);
            if (window.Expansion && window.Expansion.showLogin) window.Expansion.showLogin();
          } else if (d.error && d.error.includes('calma')) {
            // cooldown
          }
          render();
          return;
        }
        // feedback visual
        if (window.Fx && window.Fx.flash) window.Fx.flash('#ff5e6c', 200);
        if (d.reviveMsg) {
          if (window.UI && window.UI.toast) window.UI.toast(d.reviveMsg, 'secret', 5000);
        } else if (d.mechMsg) {
          if (window.UI && window.UI.toast) window.UI.toast(d.mechMsg, 'warn', 2200);
        } else if (window.UI && window.UI.toast) {
          window.UI.toast('⚔️ ' + fmtNum(d.damage) + ' de dano ao boss!', 'info', 1500);
        }
        if (d.killed) {
          if (window.UI && window.UI.toast) {
            window.UI.toast('💀 BOSS MORTO por ' + (d.killedBy || 'alguém') + '! Recompensas entregues!', 'gold', 6000);
          }
        }
        refresh();
      })
      .catch(function () {
        Boss.attacking = false;
        render();
      });
  }

  /* ---------- Ably: atualização em tempo real ---------- */
  Boss.init = function () {
    if (Boss._inited) return;
    Boss._inited = true;
    if (!RT) return;
    Boss.build();
    if (!bossEl) return;

    RT.on('boss', function (d) {
      if (!d) return;
      if (d.type === 'attack' && Boss.state) {
        Boss.state.hp = d.hp;
        Boss.state.maxHp = d.maxHp;
        Boss.state.state = 'alive';
        render();
        if (d.mechMsg && d.name && d.mechMsg && d.name !== (window.TDFNet && window.TDFNet.user ? window.TDFNet.user.username : '')) {
          // mostra o ataque único de OUTRO jogador também
          if (window.UI && window.UI.toast) window.UI.toast('[' + d.name + '] ' + d.mechMsg, 'warn', 1800);
        }
      } else if (d.type === 'revive' && Boss.state) {
        Boss.state.state = 'alive';
        Boss.state.hp = d.hp;
        Boss.state.maxHp = d.maxHp;
        render();
        if (window.UI && window.UI.toast) window.UI.toast(d.msg || '💀 O boss revivou!', 'secret', 4000);
      } else if (d.type === 'dead' && Boss.state) {
        Boss.state.state = 'dead';
        Boss.state.hp = 0;
        Boss.state.respawnAt = d.respawnAt || (Date.now() / 1000 + (d.respawnIn || 180));
        Boss.state.nextName = d.nextName;
        render();
        if (window.UI && window.UI.toast) {
          window.UI.toast('💀 ' + (d.name || 'O boss') + ' morreu! Fase ' + (d.phase || '?') + ' derrotada!', 'gold', 5000);
        }
        // contador de respawn
        scheduleDeadTick();
      } else if (d.type === 'spawn' && Boss.state) {
        Boss.state.state = 'alive';
        Boss.state.phase = d.phase;
        Boss.state.name = d.name;
        Boss.state.icon = d.icon;
        Boss.state.hp = d.hp;
        Boss.state.maxHp = d.maxHp;
        Boss.state.respawnAt = null;
        // busca a descrição do ataque da nova fase
        fetch('api/boss.php?route=state', { credentials: 'same-origin', cache: 'no-store' })
          .then(function (r) { return r.json(); })
          .then(function (s) { if (s && s.ok) { Boss.state.atk = s.boss.atk; Boss.state.atkDesc = s.boss.atkDesc; Boss.state.mech = s.boss.mech; render(); } })
          .catch(function () {});
        render();
        if (window.UI && window.UI.toast) {
          window.UI.toast((d.icon || '👾') + ' FASE ' + d.phase + ' apareceu: ' + (d.name || 'BOSS') + '!', 'secret', 4000);
        }
      }
    });
  };

  var deadTimer = null;
  function scheduleDeadTick() {
    if (deadTimer) clearInterval(deadTimer);
    deadTimer = setInterval(function () {
      if (!Boss.state || Boss.state.state !== 'dead') {
        clearInterval(deadTimer); deadTimer = null; return;
      }
      if (hpTextEl) {
        hpTextEl.textContent = '💀 MORTO! Próximo em ' + fmtTime((Boss.state.respawnAt || 0) - Date.now() / 1000);
      }
      // quando o tempo passar, o refresh/Ably atualiza
      if ((Boss.state.respawnAt || 0) * 1000 < Date.now()) {
        clearInterval(deadTimer); deadTimer = null;
        refresh();
      }
    }, 1000);
  }

  /* ---------- helpers ---------- */
  function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return String(Math.round(n));
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function esc(t) {
    var d = document.createElement('div');
    d.textContent = t == null ? '' : String(t);
    return d.innerHTML;
  }

  // init após o chat (o chat.js também chama Boss.init — idempotente)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { Boss.init(); }, 6500); });
  } else {
    setTimeout(function () { Boss.init(); }, 6500);
  }
})();
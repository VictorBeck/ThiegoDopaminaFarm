/* ============================================================
   THIEGO DOPAMINA FARM — content.js
   HUB de conteúdo dos 22 itens do PLANO DE CONTEÚDO.
   Abre painéis modais para cada funcionalidade.
   ============================================================ */
(function () {
  'use strict';
  const T = window.TDF;
  const N = window.Num;
  const Econ = window.Econ;
  const G = window.Game;
  const Net = window.TDFNet;
  const UI = window.UI;

  const CP = window.ContentPanel = {};

  /* ---------- helpers ---------- */
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function fmtMoney(v) { return N.fmt(v); }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + s + 's';
    return s + 's';
  }

  /* ---------- Modal próprio (reutiliza classes do ui.js) ---------- */
  function openModal(title, bodyHtml, buttons) {
    closeModal();
    const m = el('div', 'ui-modal', '');
    m.id = 'cp-modal';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    const box = el('div', 'modal-box');
    const head = el('div', 'modal-head');
    head.appendChild(el('div', 'modal-title', title));
    // botão de fechar consistente em todo o app (hover vermelho via CSS)
    const x = el('button', 'modal-x', '✕');
    x.type = 'button';
    x.setAttribute('aria-label', 'Fechar');
    x.title = 'Fechar (Esc)';
    x.addEventListener('click', closeModal);
    head.appendChild(x);
    box.appendChild(head);
    const body = el('div', 'modal-body');
    if (typeof bodyHtml === 'string') body.innerHTML = bodyHtml;
    else body.appendChild(bodyHtml);
    box.appendChild(body);
    if (buttons && buttons.length) {
      const footer = el('div', 'modal-foot');
      for (const b of buttons) {
        const btn = el('button', b.cls || 'btn', b.label);
        btn.addEventListener('click', function () {
          if (b.close !== false) closeModal();
          if (b.cb) b.cb();
        });
        footer.appendChild(btn);
      }
      box.appendChild(footer);
    }
    m.appendChild(box);
    m.addEventListener('click', function (e) { if (e.target === m) closeModal(); });
    document.body.appendChild(m);
    setTimeout(function () { m.classList.add('in'); }, 10);
    return m;
  }
  function closeModal() {
    const m = document.getElementById('cp-modal');
    if (m) m.remove();
  }

  /* ============================================================
     BOTÃO FLUTUANTE
     ============================================================ */
  CP.init = function () {
    const btn = el('button', 'cp-fab', '🧩');
    btn.id = 'cp-fab';
    btn.type = 'button';
    btn.title = 'Conteúdo Extra (Hub)';
    btn.setAttribute('aria-label', 'Abrir Hub de Conteúdo');
    btn.addEventListener('click', function () { showMenu(); });
    document.body.appendChild(btn);

    // Hook flavor event
    if (UI) {
      UI.showFlavorEvent = function (ev, deadline) {
        showFlavorEvent(ev, deadline);
      };
    }
  };

  function showMenu() {
    const NetR = window.TDFNet || {};
    const items = [
      { id: 'diario', icon: '📖', label: 'Diário do Thiego (A1)' },
      { id: 'checkin', icon: '✅', label: 'Check-in Diário (B1)' },
      { id: 'missoes', icon: '📋', label: 'Missões do Servidor (B2)', srv: 1 },
      { id: 'eventos', icon: '🌍', label: 'Eventos Globais (B4)', srv: 1 },
      { id: 'mercado', icon: '🏪', label: 'Mercado (C1)', srv: 1 },
      { id: 'guilda', icon: '🏰', label: 'Guilda (C2)', srv: 1 },
      { id: 'minigames', icon: '🎮', label: 'Minigames (C3)', srv: 1 },
      { id: 'cosmeticos', icon: '👑', label: 'Cosméticos (C4)' },
      { id: 'hardcore', icon: '💀', label: 'Hardcore (C5)' },
      { id: 'ascensao', icon: '⚡', label: 'Ascensão (C6)' },
      { id: 'temas', icon: '🎨', label: 'Temas Visuais (A4)' },
      { id: 'passe', icon: '🎟️', label: 'Season Pass (B3)', srv: 1 },
      { id: 'denuncia', icon: '🚩', label: 'Denunciar Jogador (D6)', srv: 1 },
    ];
    if (UI && UI.isAdmin && UI.isAdmin() && UI.adminModeActive && UI.adminModeActive()) {
      items.push({ id: 'admin_mod', icon: '🛡️', label: 'Admin: Moderação (D2/D3/D6)', srv: 1 });
    }
    // guard de login (M2): painéis server-backed abriam em 401 genérico
    // quando o jogador não está logado — agora avisa antes de abrir
    let html = '';
    if (!NetR.logged) {
      html += '<p class="cp-state cp-state-empty" style="margin-bottom:10px;">🔐 Painéis de servidor (missões, eventos, mercado, guilda, minigames, passe, denúncia) exigem login. Faça login na aba <strong>THIEGOS</strong> — o resto do Hub funciona offline.</p>';
    }
    html += '<div class="cp-menu-grid">';
    for (const item of items) {
      const dis = !NetR.logged && item.srv;
      html += '<button type="button" class="btn cp-menu-item" data-cp="' + item.id + '"' +
        (dis ? ' disabled title="Requer login na aba THIEGOS"' : '') + '>' +
        '<span class="cp-menu-icon" aria-hidden="true">' + item.icon + '</span>' +
        '<span class="cp-menu-label">' + esc(item.label) + '</span></button>';
    }
    html += '</div>';
    const m = openModal('🧩 HUB DE CONTEÚDO', html, [
      { label: 'Fechar', cls: 'btn', cb: function () {} },
    ]);
    m.querySelectorAll('[data-cp]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        closeModal();
        const id = this.dataset.cp;
        if (CP[id]) CP[id]();
        else if (id === 'admin_mod') CP.adminModPanel();
      });
    });
  }

  /* ============================================================
     A1: DIÁRIO DO THIEGO
     ============================================================ */
  CP.diario = function () {
    const s = G.s;
    if (!T.LORE || !T.LORE.length) {
      openModal('📖 Diário do Thiego', '<p style="color:#888;">Nenhum capítulo disponível.</p>', [{ label: 'Fechar', cls: 'btn' }]);
      return;
    }
    const total = T.LORE.length;
    const vistos = s.loreUnlocked ? T.LORE.filter(function (c) { return s.loreUnlocked.indexOf(c.id) !== -1; }).length : 0;
    let html = '<p style="color:#aaa;margin-bottom:12px;">Capítulos desbloqueados por evolução · <strong style="color:#ffd700;">' + vistos + '/' + total + '</strong> lidos</p>';
    for (const ch of T.LORE) {
      const unlocked = s.loreUnlocked && s.loreUnlocked.includes(ch.id);
      const locked = !unlocked && s.tier >= ch.tierMin; // elegível mas não visto
      html += '<div style="background:' + (unlocked ? '#1a2a1a' : '#1a1a2e') + ';border:1px solid ' + (unlocked ? '#4caf50' : '#333') + ';border-radius:8px;padding:10px;margin-bottom:8px;cursor:' + (locked ? 'pointer' : 'default') + ';" ' + (locked ? 'data-chapter="' + ch.id + '"' : '') + '>';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
      html += '<strong style="color:' + (unlocked ? '#4caf50' : '#666') + ';">' + esc(ch.title) + '</strong>';
      html += '<span style="color:#888;font-size:0.8em;">Tier ' + ch.tierMin + '+</span>';
      html += '</div>';
      if (unlocked && ch.text) {
        html += '<div style="margin-top:6px;color:#ccc;font-size:0.9em;line-height:1.5;border-top:1px solid #333;padding-top:6px;">' + esc(ch.text) + '</div>';
      } else if (unlocked) {
        html += '<div style="margin-top:6px;color:#888;font-style:italic;">Capítulo disponível.</div>';
      } else {
        html += '<div style="margin-top:6px;color:#555;font-style:italic;">🔒 Desbloqueie no Tier ' + ch.tierMin + '</div>';
      }
      html += '</div>';
    }
    const m = openModal('📖 Diário do Thiego', html, [
      { label: 'Fechar', cls: 'btn' },
    ]);
    m.querySelectorAll('[data-chapter]').forEach(function (div) {
      div.addEventListener('click', function () {
        const id = this.dataset.chapter;
        if (!s.loreUnlocked.includes(id)) {
          s.loreUnlocked.push(id);
          G.save();
          if (UI) UI.toast('📖 ' + (T.LORE.find(function (c) { return c.id === id; }) || {}).title + ' desbloqueado!', 'gold', 3000);
          CP.diario(); // recarrega
        }
      });
    });
  };

  /* ============================================================
     B1: CHECK-IN DIÁRIO
     ============================================================ */
  CP.checkin = function () {
    const s = G.s;
    let html = '<div style="margin-bottom:12px;">';
    if (T.DAILY_REWARDS) {
      html += '<p style="color:#aaa;">Recompensas de streak diário:</p><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin:8px 0;">';
      for (const r of T.DAILY_REWARDS) {
        const active = s.dayStreak >= r.day;
        html += '<div style="background:' + (active ? '#1a3a1a' : '#1a1a2e') + ';border:1px solid ' + (active ? '#4caf50' : '#333') + ';border-radius:6px;padding:6px;text-align:center;font-size:0.75em;">';
        html += '<div style="color:' + (active ? '#4caf50' : '#666') + ';font-weight:bold;">Dia ' + r.day + '</div>';
        html += '<div style="color:#ccc;">💰 ' + (r.coins || 0) + '</div>';
        html += '<div style="color:#ccc;">⚡ ' + (r.xp || 0) + 'xp</div>';
        if (r.dopamine) html += '<div style="color:#ffd700;">🧠 +' + r.dopamine + '</div>';
        html += '</div>';
      }
      html += '</div>';
    }
    html += '<p style="color:#aaa;">Streak atual: <strong style="color:#ffd700;">' + (s.dayStreak || 0) + '</strong> dias</p>';
    html += '<button class="btn primary" id="cp-checkin-btn" style="width:100%;padding:12px;font-size:1.1em;">✅ FAZER CHECK-IN</button>';
    html += '<div id="cp-checkin-result" style="margin-top:8px;color:#888;"></div>';
    html += '</div>';

    openModal('✅ Check-in Diário', html, [
      { label: 'Fechar', cls: 'btn' },
    ]);
    const btn = document.getElementById('cp-checkin-btn');
    const res = document.getElementById('cp-checkin-result');
    if (btn) {
      btn.addEventListener('click', function () {
        btn.disabled = true;
        btn.textContent = '⏳...';
        if (G.checkin) {
          G.checkin().then(function (r) {
            btn.disabled = false;
            btn.textContent = '✅ FAZER CHECK-IN';
            if (!r) {
              if (res) res.innerHTML = '⚠️ Não foi possível conectar ao servidor.';
              return;
            }
            if (r.ok && r.already_claimed) {
              if (res) res.innerHTML = '✅ Check-in de hoje já foi feito (streak: <strong>' + (r.streak || '?') + '</strong> dias). Volte amanhã!';
              return;
            }
            if (r.ok) {
              let msg = '✅ Check-in realizado!<br>Streak: <strong>' + (r.streak || 1) + '</strong> dias';
              const reward = r.reward || {};
              if (reward.battle_coins) msg += '<br>💰 +' + reward.battle_coins + ' coins';
              if (reward.xp) msg += '<br>⚡ +' + reward.xp + ' xp';
              if (reward.dopamine_log10) msg += '<br>🧠 +' + fmtMoney(N.fromLog10(reward.dopamine_log10)) + ' dopamina';
              if (res) res.innerHTML = msg;
            } else {
              if (res) res.innerHTML = '⚠️ ' + ((r && r.error) || 'Já fez check-in hoje ou offline.');
            }
          }).catch(function () {
            btn.disabled = false;
            btn.textContent = '✅ FAZER CHECK-IN';
            if (res) res.innerHTML = '⚠️ Erro de conexão com o servidor.';
          });
        } else {
          btn.disabled = false;
          btn.textContent = '✅ FAZER CHECK-IN';
          if (res) res.innerHTML = '⚠️ Net.checkin não disponível.';
        }
      });
    }
  };

  /* ============================================================
     B2: MISSÕES DO SERVIDOR
     ============================================================ */
  CP.missoes = function () {
    const html = '<div id="cp-missoes-content"><p class="cp-state cp-state-loading">Carregando missões do servidor...</p></div>';
    const m = openModal('📋 Missões do Servidor', html, [
      { label: 'Fechar', cls: 'btn' },
      { label: '🔄 Atualizar', cls: 'btn', close: false, cb: function () { CP.missoes(); } },
    ]);
    if (Net && Net.state) {
      Net.state().then(function (d) {
        const box = document.getElementById('cp-missoes-content');
        if (!box) return;
        const missions = d && d.missions;
        if (!missions || !missions.length) {
          box.innerHTML = '<p style="color:#888;">Nenhuma missão ativa no servidor.</p>';
          return;
        }
        let html2 = '<p style="color:#aaa;margin-bottom:8px;">Missões ativas (sincronizadas com servidor):</p>';
        for (const m of missions) {
          const done = m.progress >= m.target;
          html2 += '<div style="background:' + (done ? '#1a3a1a' : '#1a1a2e') + ';border:1px solid ' + (done ? '#4caf50' : '#333') + ';border-radius:8px;padding:10px;margin-bottom:8px;">';
          html2 += '<div style="display:flex;justify-content:space-between;">';
          html2 += '<strong>' + esc(m.name || m.id) + '</strong>';
          html2 += '<span style="color:' + (done ? '#4caf50' : '#ffd700') + ';">' + (m.progress || 0) + '/' + m.target + '</span>';
          html2 += '</div>';
          if (m.reward) {
            // o backend envia reward como STRING JSON {battle_coins,xp,dopamine_log10,genealogy_points}
            let rw = m.reward;
            try { if (typeof rw === 'string') rw = JSON.parse(rw); } catch (e) {}
            if (rw && typeof rw === 'object') {
              const bits = [];
              if (rw.battle_coins) bits.push('💰' + rw.battle_coins);
              if (rw.xp) bits.push('⚡' + rw.xp);
              if (rw.dopamine_log10) bits.push('🧠 10^' + rw.dopamine_log10);
              if (rw.genealogy_points) bits.push('🌳' + rw.genealogy_points);
              if (bits.length) html2 += '<div style="color:#888;font-size:0.85em;">Recompensa: ' + esc(bits.join(' ')) + '</div>';
            }
          }
          if (done && !m.claimed) {
            html2 += '<button class="btn btn-sm cp-claim-mission" data-mid="' + esc(m.id) + '" style="margin-top:6px;">✅ Reivindicar</button>';
          } else if (m.claimed) {
            html2 += '<div style="color:#4caf50;font-size:0.85em;margin-top:4px;">✅ Reivindicado</div>';
          }
          html2 += '</div>';
        }
        box.innerHTML = html2;
        box.querySelectorAll('.cp-claim-mission').forEach(function (b) {
          b.addEventListener('click', function () {
            const mid = this.dataset.mid;
            Net.claimMission(mid).then(function (r) {
              if (UI) UI.toast('✅ Missão reivindicada!', 'gold', 3000);
              CP.missoes();
            }).catch(function () {
              if (UI) UI.toast('Erro ao reivindicar missão.', 'error', 3000);
            });
          });
        });
      }).catch(function () {
        const box = document.getElementById('cp-missoes-content');
        if (box) box.innerHTML = '<p class="cp-state cp-state-error">Erro ao carregar missões do servidor. Tente novamente.</p>';
      });
    }
  };

  /* ============================================================
     B4: EVENTOS GLOBAIS
     ============================================================ */
  CP.eventos = function () {
    const html = '<div id="cp-eventos-content"><p class="cp-state cp-state-loading">Carregando eventos globais...</p></div>';
    const m = openModal('🌍 Eventos Globais', html, [
      { label: 'Fechar', cls: 'btn' },
      { label: '🔄 Atualizar', cls: 'btn', close: false, cb: function () { CP.eventos(); } },
    ]);
    if (Net && Net.eventsCurrent) {
      Net.eventsCurrent().then(function (d) {
        const box = document.getElementById('cp-eventos-content');
        if (!box) return;
        const events = d && d.events;
        if (!events || !events.length) {
          box.innerHTML = '<p style="color:#888;">Nenhum evento global ativo no momento.</p>';
          return;
        }
        let html2 = '';
        for (const ev of events) {
          // contrato do backend: progress_log10 / progress_pct / can_claim
          const pct = Math.min(100, Math.round(ev.progress_pct || 0));
          html2 += '<div style="background:#1a1a2e;border:1px solid #ffd700;border-radius:8px;padding:12px;margin-bottom:12px;">';
          html2 += '<h3 style="color:#ffd700;margin:0 0 6px 0;">' + esc(ev.title) + '</h3>';
          html2 += '<div style="color:#aaa;font-size:0.85em;">' + esc(ev.description || '') + '</div>';
          html2 += '<div style="margin:8px 0;background:#111;height:20px;border-radius:10px;overflow:hidden;"><div style="width:' + pct + '%;background:#ffd700;height:100%;border-radius:10px;transition:width 0.3s;"></div></div>';
          html2 += '<div style="display:flex;justify-content:space-between;color:#888;font-size:0.85em;">';
          html2 += '<span>Progresso: ' + fmtMoney(N.fromLog10(ev.progress_log10 || 0)) + ' / ' + fmtMoney(N.fromLog10(ev.goal_log10)) + '</span>';
          html2 += '<span>' + pct + '%</span>';
          html2 += '</div>';
          if (ev.my_contribution > 0) {
            html2 += '<div style="color:#4caf50;font-size:0.85em;margin-top:4px;">Sua contribuição: ' + ev.my_contribution + ' log10</div>';
          }
          if (ev.status === 'finished' && !ev.can_claim && !ev.my_claimed && ev.my_contribution <= 0) {
            html2 += '<div style="color:#888;font-size:0.8em;margin-top:4px;">Evento encerrado — só quem contribuiu recebe.</div>';
          }
          if (ev.can_claim) {
            html2 += '<button class="btn btn-sm cp-claim-event" data-eid="' + ev.id + '" style="margin-top:6px;">🎁 Reivindicar recompensa</button>';
          } else if (ev.my_claimed) {
            html2 += '<div style="color:#4caf50;font-size:0.85em;margin-top:4px;">✅ Recompensa reivindicada</div>';
          }
          html2 += '</div>';
        }
        box.innerHTML = html2;
        box.querySelectorAll('.cp-claim-event').forEach(function (b) {
          b.addEventListener('click', function () {
            const eid = parseInt(this.dataset.eid);
            Net.eventClaim(eid).then(function () {
              if (UI) UI.toast('✅ Recompensa do evento reivindicada!', 'gold', 3000);
              CP.eventos();
            }).catch(function (e) { if (UI) UI.toast(e.message || 'Erro ao reivindicar.', 'error', 3000); });
          });
        });
      }).catch(function (e) {
        const box = document.getElementById('cp-eventos-content');
        if (box) {
          const msg = String((e && e.message) || '');
          if (/n[aã]o autenticado|401|api/i.test(msg)) {
            box.innerHTML = '<p class="cp-state cp-state-empty">🔐 Faça login (aba THIEGOS) para participar dos eventos globais.</p>';
          } else {
            box.innerHTML = '<p class="cp-state cp-state-error">Erro ao carregar eventos: ' + esc(msg || 'falha de rede') + '. <button class="btn btn-sm" onclick="window.ContentPanel.eventos()">Tentar novamente</button></p>';
          }
        }
      });
    }
  };

  /* ============================================================
     C1: MERCADO (placeholder)
     ============================================================ */
  CP.mercado = function () {
    const html = '<div id="cp-mercado-content"><p class="cp-state cp-state-loading">Carregando mercado...</p></div>';
    const m = openModal('🏪 Mercado entre Jogadores', html, [
      { label: 'Fechar', cls: 'btn' },
      { label: '🔄', cls: 'btn', close: false, cb: function () { CP.mercado(); } },
    ]);
    if (Net && Net.marketList) {
      Net.marketList().then(function (d) {
        const box = document.getElementById('cp-mercado-content');
        if (!box) return;
        const listings = d && d.listings;
        if (!listings || !listings.length) {
          box.innerHTML = '<p class="cp-state cp-state-empty">Nenhum item no mercado ainda. Seja o primeiro a anunciar!</p>' +
            '<div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">' +
            '<button class="btn gold" id="cp-market-add">➕ Anunciar item</button>' +
            '<button class="btn" id="cp-market-mine">Ver meus anúncios</button></div>';
          addMineListener(box);
          const add0 = document.getElementById('cp-market-add');
          if (add0) add0.addEventListener('click', function () { CP.mercadoAnunciar(); });
          return;
        }
        // contrato do backend: price_currency ('coins'|'dopamine') + price_amount (float)
        function priceLabel(l) {
          return l.price_currency === 'coins'
            ? '💰 ' + N.fmt(N.fromF(l.price_amount))
            : '🧠 10^' + l.price_amount;
        }
        let html2 = '<p style="color:#aaa;margin-bottom:8px;">Itens à venda:</p>';
        for (const l of listings) {
          html2 += '<div style="background:#1a1a2e;border:1px solid #333;border-radius:8px;padding:8px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">';
          html2 += '<div><strong>' + esc(l.item_name || 'Item #' + l.item_id) + (l.qty > 1 ? ' x' + l.qty : '') + '</strong><br><span style="color:#888;font-size:0.8em;">Vendedor: ' + esc(l.seller_name || '?') + '</span></div>';
          html2 += '<div style="text-align:right;"><span style="color:#ffd700;">' + priceLabel(l) + '</span>';
          const isMine = l.seller_id === (Net.user && Net.user.id);
          if (!isMine && l.price_currency === 'coins') {
            html2 += '<br><button class="btn btn-sm cp-market-buy" data-lid="' + l.id + '">Comprar</button>';
          } else if (!isMine) {
            html2 += '<br><span style="color:#888;font-size:0.75em;">compra em dopamine em breve</span>';
          }
          html2 += '</div></div>';
        }
        html2 += '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">' +
          '<button class="btn gold btn-sm" id="cp-market-add">➕ Anunciar item</button>' +
          '<button class="btn btn-sm" id="cp-market-mine">Meus anúncios</button></div>';
        box.innerHTML = html2;
        box.querySelectorAll('.cp-market-buy').forEach(function (b) {
          b.addEventListener('click', function () {
            const lid = parseInt(this.dataset.lid);
            Net.marketBuy(lid).then(function () {
              if (UI) UI.toast('✅ Compra realizada!', 'gold', 3000);
              CP.mercado();
            }).catch(function (e) { if (UI) UI.toast(e.message || 'Erro na compra.', 'error', 3000); });
          });
        });
        const add = document.getElementById('cp-market-add');
        if (add) add.addEventListener('click', function () { CP.mercadoAnunciar(); });
        addMineListener(box);
      }).catch(function (e) {
        const box = document.getElementById('cp-mercado-content');
        if (box) box.innerHTML = '<p class="cp-state cp-state-error">Erro ao carregar mercado: ' + esc((e && e.message) || 'falha de rede') + '. <button class="btn btn-sm" onclick="window.ContentPanel.mercado()">Tentar novamente</button></p>';
      });
    }
    function addMineListener(box) {
      setTimeout(function () {
        const btn = document.getElementById('cp-market-mine');
        if (btn) btn.addEventListener('click', function () { CP.mercadoMine(); });
      }, 50);
    }
  };

  // C7: criação de anúncio — o painel só listava; Net.marketAdd nunca era chamado
  CP.mercadoAnunciar = function () {
    if (!Net || !Net.inventory || !Net.marketAdd) return;
    Net.inventory().then(function (d) {
      const items = ((d && d.items) || []).filter(function (i) { return i.qty > 0; });
      if (!items.length) {
        openModal('Anunciar Item', '<p class="cp-state cp-state-empty">Seu inventário está vazio. Consiga itens na aba EXPANSÃO (loot/batalhas).</p>', [{ label: 'Fechar', cls: 'btn' }]);
        return;
      }
      let html = '<p style="color:#aaa;margin-bottom:8px;">Escolha o item, o preço e a moeda:</p>';
      html += '<div style="display:flex;flex-direction:column;gap:8px;">';
      html += '<label style="color:#888;font-size:0.85em;">Item<br><select id="cp-add-item" style="width:100%;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px;">';
      for (const it of items) {
        html += '<option value="' + it.id + '">' + esc(it.icon || '🎒') + ' ' + esc(it.name) + ' (x' + it.qty + ')</option>';
      }
      html += '</select></label>';
      html += '<label style="color:#888;font-size:0.85em;">Moeda do preço<br><select id="cp-add-currency" style="width:100%;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px;">' +
        '<option value="coins">💰 Battle Coins (comprável agora)</option>' +
        '<option value="dopamine">🧠 Dopamina — escala log10, ex.: 12 = 1e12 (resgate pelo comprador em breve)</option>' +
        '</select></label>';
      html += '<label style="color:#888;font-size:0.85em;">Preço<br><input id="cp-add-price" type="number" min="1" step="1" placeholder="Ex.: 500" style="width:100%;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px;"></label>';
      html += '<label style="color:#888;font-size:0.85em;">Quantidade<br><input id="cp-add-qty" type="number" min="1" step="1" value="1" style="width:100%;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px;"></label>';
      html += '<button class="btn gold" id="cp-add-submit">📣 Publicar anúncio</button>';
      html += '</div>';
      const m = openModal('Anunciar Item', html, [{ label: 'Fechar', cls: 'btn' }]);
      const sub = m.querySelector('#cp-add-submit');
      if (sub) sub.addEventListener('click', function () {
        const itemId = parseInt((m.querySelector('#cp-add-item') || {}).value);
        const currency = ((m.querySelector('#cp-add-currency') || {}).value) || 'coins';
        const price = parseFloat((m.querySelector('#cp-add-price') || {}).value);
        const qty = Math.max(1, parseInt((m.querySelector('#cp-add-qty') || {}).value) || 1);
        if (!itemId || !isFinite(price) || price <= 0) {
          if (UI) UI.toast('Escolha o item e informe um preço maior que zero.', 'warn', 3500);
          return;
        }
        sub.disabled = true;
        Net.marketAdd(itemId, price, currency, qty).then(function () {
          if (UI) UI.toast('✅ Anúncio publicado!', 'gold', 3000);
          CP.mercado();
        }).catch(function (e) {
          if (UI) UI.toast(e.message || 'Erro ao publicar anúncio.', 'error', 3500);
          sub.disabled = false;
        });
      });
    }).catch(function (e) {
      openModal('Anunciar Item', '<p class="cp-state cp-state-error">Não foi possível carregar seu inventário: ' + esc((e && e.message) || 'falha de rede') + '</p>', [{ label: 'Fechar', cls: 'btn' }]);
    });
  };

  CP.mercadoMine = function () {
    if (!Net || !Net.marketMine) return;
    Net.marketMine().then(function (d) {
      const listings = d && d.listings;
      if (!listings || !listings.length) {
        openModal('Meus Anúncios', '<p class="cp-state cp-state-empty">Você não tem anúncios (ativos ou encerrados).</p>', [{ label: 'Fechar', cls: 'btn' }]);
        return;
      }
      let html = '';
      for (const l of listings) {
        const statusTxt = l.status === 'active' ? '' : ' <span style="color:#888;font-size:0.75em;">(' + esc(l.status) + ')</span>';
        html += '<div style="background:#1a1a2e;border:1px solid #333;border-radius:8px;padding:8px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">';
        html += '<div><strong>' + esc(l.item_name || 'Item #' + l.item_id) + (l.qty > 1 ? ' x' + l.qty : '') + '</strong>' + statusTxt + '<br><span style="color:#888;font-size:0.8em;">' + (l.price_currency === 'coins' ? '💰 ' : '🧠 10^') + N.fmt(N.fromF(l.price_amount)) + '</span></div>';
        if (l.status === 'active') {
          html += '<button class="btn btn-sm cp-market-cancel" data-lid="' + l.id + '">Cancelar</button>';
        }
        html += '</div>';
      }
      const m = openModal('Meus Anúncios', html, [{ label: 'Fechar', cls: 'btn' }]);
      m.querySelectorAll('.cp-market-cancel').forEach(function (b) {
        b.addEventListener('click', function () {
          b.disabled = true;
          Net.marketCancel(parseInt(this.dataset.lid)).then(function () {
            if (UI) UI.toast('Anúncio cancelado — item devolvido ao inventário.', 'info', 2500);
            CP.mercadoMine();
          }).catch(function (e) {
            if (UI) UI.toast(e.message || 'Erro ao cancelar.', 'error', 3000);
            b.disabled = false;
          });
        });
      });
    }).catch(function (e) {
      openModal('Meus Anúncios', '<p class="cp-state cp-state-error">Erro ao carregar seus anúncios: ' + esc((e && e.message) || 'falha de rede') + '</p>', [{ label: 'Fechar', cls: 'btn' }]);
    });
  };

  /* ============================================================
     C2: GUILDA
     ============================================================ */
  CP.guilda = function () {
    const html = '<div id="cp-guilda-content"><p class="cp-state cp-state-loading">Carregando guilda...</p></div>';
    openModal('🏰 Guilda', html, [
      { label: 'Fechar', cls: 'btn' },
      { label: '🔄', cls: 'btn', close: false, cb: function () { CP.guilda(); } },
    ]);
    if (Net && Net.guildStatus) {
      Net.guildStatus().then(function (d) {
        const box = document.getElementById('cp-guilda-content');
        if (!box) return;
        // contrato do backend: sem guilda → {ok:true, guild:null, boss:null}
        if (!d || !d.guild) {
          box.innerHTML = '<p class="cp-state cp-state-empty">Você não está em uma guilda.</p>' +
            '<button class="btn" id="cp-guild-create">Criar Guilda (💰2000)</button>' +
            '<p style="margin-top:8px;">Ou entre pelo código de tag: <input id="cp-guild-tag" placeholder="TAG" maxlength="6" style="width:60px;background:#333;color:#fff;border:1px solid #666;border-radius:4px;padding:4px;text-transform:uppercase;"> <button class="btn btn-sm" id="cp-guild-join">Entrar</button></p>';
          setTimeout(function () {
            const createBtn = document.getElementById('cp-guild-create');
            if (createBtn) createBtn.addEventListener('click', function () {
              const name = prompt('Nome da guilda (3-40 caracteres):');
              const tag = prompt('Tag (2-6 letras/números):');
              if (name && tag) Net.guildCreate(name, tag.toUpperCase()).then(function () {
                if (UI) UI.toast('🏰 Guilda criada!', 'gold', 3000);
                CP.guilda();
              }).catch(function (e) { if (UI) UI.toast(e.message || 'Erro ao criar.', 'error', 3000); });
            });
            const joinBtn = document.getElementById('cp-guild-join');
            if (joinBtn) joinBtn.addEventListener('click', function () {
              const tag = document.getElementById('cp-guild-tag').value.trim().toUpperCase();
              if (tag) Net.guildJoinByTag(tag).then(function () {
                if (UI) UI.toast('✅ Entrou na guilda!', 'gold', 3000);
                CP.guilda();
              }).catch(function (e) { if (UI) UI.toast(e.message || 'Erro ao entrar.', 'error', 3000); });
            });
          }, 50);
          return;
        }
        const guild = d.guild || {};
        // membros vêm em d.guild.members; boss usa hp_total/hp_left/defeated
        const members = (guild && guild.members) || [];
        const boss = d.boss || {};
        let html2 = '<h3 style="color:#ffd700;margin:0 0 6px 0;">' + esc(guild.name) + ' [' + esc(guild.tag) + ']</h3>';
        html2 += '<div style="color:#aaa;font-size:0.85em;">Nível ' + (guild.level || 1) + ' | XP: ' + (guild.xp || 0) + ' | Membros: ' + (guild.member_count || members.length) + '/' + (guild.max_members || '?') + '</div>';
        html2 += '<div style="margin:8px 0;background:#111;height:10px;border-radius:5px;"><div style="width:' + Math.min(100, (guild.xp || 0) / Math.max(1, guild.xp_for_next || 500) * 100) + '%;background:#ffd700;height:100%;border-radius:5px;"></div></div>';
        html2 += '<p style="color:#aaa;">Membros (' + members.length + '):</p>';
        for (const m of members) {
          html2 += '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #222;">';
          html2 += '<span>' + (m.role === 'leader' ? '👑 ' : '') + esc(m.username || 'Jogador #' + m.id) + '</span>';
          html2 += '<span style="color:#888;">Contribuição: ' + (m.contribution || 0) + '</span>';
          html2 += '</div>';
        }
        if (boss.hp_total > 0 && !boss.defeated) {
          const dmg = boss.hp_total - boss.hp_left;
          const pct = boss.hp_total > 0 ? Math.round(dmg / boss.hp_total * 100) : 0;
          html2 += '<div style="margin-top:12px;border-top:1px solid #333;padding-top:8px;">';
          html2 += '<h4 style="color:#f44;margin:0 0 4px 0;">🐉 Boss Semanal</h4>';
          html2 += '<div style="color:#888;font-size:0.85em;margin-bottom:4px;">' + esc(boss.name || 'Boss') + '</div>';
          html2 += '<div style="height:16px;background:#111;border-radius:8px;overflow:hidden;"><div style="width:' + Math.min(100, pct) + '%;background:linear-gradient(90deg,#f44,#ff8);height:100%;border-radius:8px;"></div></div>';
          html2 += '<div style="color:#888;font-size:0.85em;margin:4px 0;">Dano causado: ' + fmtMoney(N.fromF(dmg)) + ' / HP ' + fmtMoney(N.fromF(boss.hp_total)) + '</div>';
          html2 += '<button class="btn btn-sm" id="cp-boss-attack">⚔️ Atacar Boss</button>';
          html2 += '</div>';
        } else if (boss.defeated) {
          html2 += '<div style="margin-top:12px;color:#4caf50;font-size:0.9em;">💀 Boss Semanal derrotado esta semana! Volte na próxima.</div>';
        }
        html2 += '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">';
        html2 += '<button class="btn btn-sm" id="cp-guild-contribute">🧠 Contribuir Dopamina</button>';
        html2 += '<button class="btn btn-sm" id="cp-guild-leave">Sair</button>';
        html2 += '</div>';
        box.innerHTML = html2;
        setTimeout(function () {
          const contrib = document.getElementById('cp-guild-contribute');
          if (contrib) contrib.addEventListener('click', function () {
            if (!Net.guildContribute) return;
            const s = G.s;
            const log = Math.max(0, Math.round((N.log10(s.totalEarned) || 0) * 100) / 100);
            contrib.disabled = true;
            Net.guildContribute(log).then(function (r) {
              if (UI) UI.toast('🏰 Contribuição enviada! Guilda nível ' + ((r && r.guild_level) || '?'), 'gold', 3000);
              CP.guilda();
            }).catch(function (e) { if (UI) UI.toast(e.message || 'Erro ao contribuir.', 'error', 3000); if (contrib) contrib.disabled = false; });
          });
          const atk = document.getElementById('cp-boss-attack');
          if (atk) atk.addEventListener('click', function () {
            atk.disabled = true;
            Net.guildBossAttack().then(function (r) {
              if (r && r.defeated) {
                const rw = r.reward || {};
                if (UI) UI.toast('💀 Boss derrotado! Guilda recebeu 💰' + (rw.battle_coins || 0) + ' · ⚡' + (rw.xp || 0), 'gold', 6000);
              } else {
                if (UI) UI.toast('⚔️ Dano causado: ' + ((r && r.damage) || 0), 'gold', 3000);
              }
              CP.guilda();
            }).catch(function (e) { if (UI) UI.toast(e.message || 'Erro.', 'error', 3000); if (atk) atk.disabled = false; });
          });
          const leave = document.getElementById('cp-guild-leave');
          if (leave) leave.addEventListener('click', function () {
            if (confirm('Sair da guilda?')) Net.guildLeave().then(function () {
              if (UI) UI.toast('Saiu da guilda.', 'info', 2000);
              CP.guilda();
            }).catch(function (e) { if (UI) UI.toast(e.message || 'Erro.', 'error', 3000); });
          });
        }, 50);
      }).catch(function () {
        const box = document.getElementById('cp-guilda-content');
        if (box) box.innerHTML = '<p class="cp-state cp-state-error">Erro ao carregar guilda.</p>';
      });
    }
  };

  /* ============================================================
     C3: MINIGAMES
     ============================================================ */
  CP.minigames = function () {
    const MG = window.Minigames;
    if (!MG) {
      openModal('🎮 Minigames', '<p class="cp-state cp-state-error">Minigames não carregados.</p>', [{ label: 'Fechar', cls: 'btn' }]);
      return;
    }
    let html = '<p style="color:#aaa;">Jogos rápidos de 30s — 1 tentativa por dia. Score máximo: 1000.</p>';
    html += '<div style="display:grid;gap:8px;">';
    for (const [id, g] of Object.entries(MG.games)) {
      html += '<button class="btn cp-play-minigame" data-game="' + id + '" style="padding:14px;font-size:1.1em;">' + g.name + '</button>';
    }
    html += '</div>';
    html += '<div id="cp-minigame-result" style="margin-top:8px;color:#888;"></div>';

    const m = openModal('🎮 Minigames', html, [
      { label: 'Fechar', cls: 'btn' },
    ]);
    m.querySelectorAll('.cp-play-minigame').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const game = this.dataset.game;
        if (MG.isActive()) return;
        closeModal();
        MG.play(game).then(function (score) {
          if (score > 0) {
            if (UI) UI.toast('🎮 Minigame! Score: ' + score, 'gold', 3000);
          }
        });
      });
    });
  };

  /* ============================================================
     C4: COSMÉTICOS
     ============================================================ */
  CP.cosmeticos = function () {
    const s = G.s;
    if (!T.COSMETICS || !T.COSMETICS.length) {
      openModal('👑 Cosméticos', '<p style="color:#888;">Nenhum cosmético disponível.</p>', [{ label: 'Fechar', cls: 'btn' }]);
      return;
    }
    let html = '<p style="color:#aaa;">Equipe visuais para o Thiego:</p><div style="display:grid;gap:8px;">';
    for (const c of T.COSMETICS) {
      const owned = c.unlock === 'achievement' ? s.achievements.includes(c.achievementId) :
        c.unlock === 'tier' ? s.tier >= (c.tierMin || 999) :
        c.unlock === 'prestige' ? s.prestige >= (c.prestigeMin || 999) : false;
      const equipped = s.cosmetics && s.cosmetics[c.slot] === c.id;
      html += '<div style="background:' + (owned ? (equipped ? '#1a3a1a' : '#1a1a2e') : '#111') + ';border:1px solid ' + (equipped ? '#4caf50' : owned ? '#333' : '#222') + ';border-radius:8px;padding:10px;display:flex;justify-content:space-between;align-items:center;">';
      html += '<div><strong>' + c.icon + ' ' + esc(c.name) + '</strong><br><span style="color:#888;font-size:0.8em;">' + esc(c.desc) + '</span></div>';
      if (owned) {
        html += '<button class="btn btn-sm cp-equip-cosmetic" data-id="' + c.id + '" data-slot="' + c.slot + '" style="' + (equipped ? 'background:#4caf50;color:#fff;' : '') + '">' + (equipped ? '✅ Equipado' : 'Equipar') + '</button>';
      } else {
        const req = c.unlock === 'achievement' ? ' (Conquista: ' + (c.achievementId || '?') + ')' :
          c.unlock === 'tier' ? ' (Tier ' + (c.tierMin || '?') + '+)' :
          ' (Prestige ' + (c.prestigeMin || '?') + '+)';
        html += '<span style="color:#555;">🔒' + req + '</span>';
      }
      html += '</div>';
    }
    html += '</div>';
    const m = openModal('👑 Cosméticos', html, [
      { label: 'Fechar', cls: 'btn' },
      { label: '🔄', cls: 'btn', close: false, cb: function () { CP.cosmeticos(); } },
    ]);
    m.querySelectorAll('.cp-equip-cosmetic').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = this.dataset.id;
        const slot = this.dataset.slot;
        if (s.cosmetics[slot] === id) {
          delete s.cosmetics[slot];
        } else {
          s.cosmetics[slot] = id;
        }
        G.save();
        if (UI) UI.toast('👑 Cosméticos atualizados!', 'info', 2000);
        CP.cosmeticos();
        applyCosmetics();
      });
    });
  };

  /* ============================================================
     A4: TEMAS VISUAIS
     ============================================================ */
  CP.temas = function () {
    const s = G.s;
    if (!T.THEMES || !T.THEMES.length) {
      openModal('🎨 Temas', '<p style="color:#888;">Nenhum tema disponível.</p>', [{ label: 'Fechar', cls: 'btn' }]);
      return;
    }
    let html = '<p style="color:#aaa;">Escolha um tema visual (desbloqueado por tier):</p><div style="display:grid;gap:6px;">';
    for (const th of T.THEMES) {
      const unlocked = s.tier >= (th.tierMin || 0);
      const active = s.activeTheme === th.id;
      html += '<button class="btn cp-select-theme" data-theme="' + th.id + '" style="background:' + (unlocked ? (active ? '#1a3a1a' : '#1a1a2e') : '#111') + ';border:1px solid ' + (active ? '#4caf50' : unlocked ? '#333' : '#222') + ';padding:12px;display:flex;justify-content:space-between;align-items:center;width:100%;">';
      html += '<span style="color:' + (unlocked ? '#fff' : '#555') + ';">' + esc(th.name) + (th.bgColor ? ' <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:' + th.bgColor + ';vertical-align:middle;"></span>' : '') + '</span>';
      html += '<span style="color:' + (active ? '#4caf50' : unlocked ? '#888' : '#555') + ';font-size:0.8em;">' + (active ? '✅ Ativo' : unlocked ? 'Tier ' + (th.tierMin || 0) + '+' : '🔒 Tier ' + (th.tierMin || 0) + '+') + '</span>';
      html += '</button>';
    }
    html += '</div>';
    const m = openModal('🎨 Temas Visuais', html, [
      { label: 'Fechar', cls: 'btn' },
    ]);
    m.querySelectorAll('.cp-select-theme').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const theme = this.dataset.theme;
        const th = T.THEMES.find(function (t) { return t.id === theme; });
        if (!th || s.tier < (th.tierMin || 0)) return;
        s.activeTheme = theme;
        G.save();
        if (UI) UI.toast('🎨 Tema: ' + th.name + ' ativado!', 'gold', 3000);
        CP.temas();
        applyTheme();
      });
    });
  };

  /* ============================================================
     C5: HARDCORE
     ============================================================ */
  CP.hardcore = function () {
    const s = G.s;
    if (s.hardcore) {
      openModal('💀 Hardcore', '<p style="color:#4caf50;">🔥 Run HARDCORE ativa!</p><p style="color:#888;">Sem auto-prestige, sem offline, upgrades 2× mais caros, mas pontos de prestige ×2.</p>', [
        { label: 'Fechar', cls: 'btn' },
      ]);
      return;
    }
    openModal('💀 Iniciar Run Hardcore', '<p style="color:#f44;">⚠️ Isso vai resetar TODO o progresso atual!</p>' +
      '<p style="color:#aaa;">Regras: sem auto-prestige, sem ganho offline, upgrades 2× mais caros, geradores 1.5× mais caros.</p>' +
      '<p style="color:#ffd700;">Recompensa: pontos de prestige ×2 e badge Hardcore (💀).</p>', [
      { label: '💀 INICIAR HARDCORE', cls: 'btn primary', cb: function () {
        if (confirm('TEM CERTEZA? Isso vai resetar todo o progresso!')) {
          G.startHardcoreRun();
        }
      } },
      { label: 'Cancelar', cls: 'btn' },
    ]);
  };

  /* ============================================================
     C6: ASCENSÃO
     ============================================================ */
  CP.ascensao = function () {
    const s = G.s;
    if (!T.ASCENSION_PATHS || !T.ASCENSION_PATHS.length) {
      openModal('⚡ Ascensão', '<p style="color:#888;">Sistema de ascensão não disponível.</p>', [{ label: 'Fechar', cls: 'btn' }]);
      return;
    }
    if (!s.ascensionPath) {
      // Escolher caminho
      let html = '<p style="color:#aaa;">Escolha seu caminho de ascensão (permanente, 1 por conta):</p><div style="display:grid;gap:10px;">';
      for (const path of T.ASCENSION_PATHS) {
        html += '<button class="btn cp-choose-path" data-path="' + path.id + '" style="padding:14px;text-align:left;background:#1a1a2e;border:1px solid #ffd700;">';
        html += '<strong style="color:#ffd700;">' + esc(path.name) + '</strong><br>';
        html += '<span style="color:#aaa;font-size:0.85em;">' + esc(path.desc) + '</span><br>';
        html += '<span style="color:#888;font-size:0.8em;">Perks: ' + path.perks.map(function (p) { return 'T' + p.tier + ': ' + p.desc; }).join(' | ') + '</span>';
        html += '</button>';
      }
      html += '</div>';
      const m = openModal('⚡ Ascensão — Escolha o Caminho', html, [
        { label: 'Fechar', cls: 'btn' },
      ]);
      m.querySelectorAll('.cp-choose-path').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const pathId = this.dataset.path;
          if (G.chooseAscensionPath) {
            G.chooseAscensionPath(pathId);
            CP.ascensao();
          }
        });
      });
    } else {
      const path = T.ASCENSION_PATHS.find(function (p) { return p.id === s.ascensionPath; });
      let html = '<p style="color:#4caf50;">✅ Caminho: <strong>' + esc(path ? path.name : s.ascensionPath) + '</strong></p>';
      html += '<p style="color:#aaa;">Tier de Ascensão: <strong style="color:#ffd700;">' + (s.ascensionTier || 0) + '</strong> (sobe a cada transcendência)</p>';
      html += '<div style="display:grid;gap:6px;">';
      if (path) {
        for (const perk of path.perks) {
          const active = (s.ascensionTier || 0) >= perk.tier;
          html += '<div style="background:' + (active ? '#1a3a1a' : '#1a1a2e') + ';border:1px solid ' + (active ? '#4caf50' : '#333') + ';border-radius:8px;padding:8px;display:flex;justify-content:space-between;">';
          html += '<div><span style="color:' + (active ? '#4caf50' : '#666') + ';">T' + perk.tier + ':</span> ' + esc(perk.desc) + '</div>';
          html += '<span style="color:' + (active ? '#4caf50' : '#555') + ';">' + (active ? '✅' : '🔒') + '</span>';
          html += '</div>';
        }
      }
      html += '</div>';
      html += '<p style="color:#888;font-size:0.8em;margin-top:8px;">💡 Transcenda para aumentar o Tier de Ascensão e desbloquear mais perks.</p>';
      openModal('⚡ Ascensão', html, [
        { label: 'Fechar', cls: 'btn' },
      ]);
    }
  };

  /* ============================================================
     B3: SEASON PASS
     ============================================================ */
  CP.passe = function () {
    const html = '<div id="cp-passe-content"><p class="cp-state cp-state-loading">Carregando Season Pass...</p></div>';
    const m = openModal('🎟️ Season Pass', html, [
      { label: 'Fechar', cls: 'btn' },
      { label: '🔄', cls: 'btn', close: false, cb: function () { CP.passe(); } },
    ]);
    if (Net && Net.seasonInfo) {
      Net.seasonInfo().then(function (d) {
        const box = document.getElementById('cp-passe-content');
        if (!box) return;
        if (!d || d.error || !d.season) {
          box.innerHTML = '<p class="cp-state cp-state-empty">Nenhuma temporada ativa no momento.</p>';
          return;
        }
        // contrato do backend: {season, pass:{xp,tier,premium,claimed_rewards}, tiers:[{tier,xp_required,free,premium}], max_tier}
        const pass = d.pass || {};
        const tier = pass.tier || 0;
        const xp = pass.xp || 0;
        const maxTier = d.max_tier || 20;
        const premium = !!pass.premium;
        const claimedList = Array.isArray(pass.claimed_rewards) ? pass.claimed_rewards.map(String) : [];
        const tiers = Array.isArray(d.tiers) ? d.tiers : [];
        const xpForNext = (tier + 1) * 100;
        const xpInTier = Math.min(xpForNext, Math.max(0, xp - tier * 100));
        function fmtReward(rw) {
          if (!rw) return '';
          const parts = [];
          if (rw.battle_coins) parts.push('💰' + rw.battle_coins);
          if (rw.xp) parts.push('⚡' + rw.xp);
          if (rw.dopamine_log10) parts.push('🧠 10^' + rw.dopamine_log10);
          if (rw.genealogy_points) parts.push('🌳' + rw.genealogy_points);
          return parts.join(' ');
        }
        let html2 = '<div style="color:#aaa;text-align:center;font-size:0.9em;">🎟️ ' + esc(d.season.name || 'Temporada') + '</div>';
        html2 += '<div style="color:#ffd700;font-size:1.2em;text-align:center;margin:6px 0 4px 0;">Tier ' + tier + '/' + maxTier + '</div>';
        html2 += '<div style="background:#111;height:20px;border-radius:10px;overflow:hidden;margin:8px 0;"><div style="width:' + Math.min(100, xpInTier / Math.max(1, xpForNext) * 100) + '%;background:linear-gradient(90deg,#ffd700,#ff8c00);height:100%;border-radius:10px;"></div></div>';
        html2 += '<div style="color:#aaa;text-align:center;">XP do tier: ' + xpInTier + '/' + xpForNext + '</div>';
        if (!premium) {
          html2 += '<button class="btn" id="cp-buy-premium" style="width:100%;margin-top:8px;">Comprar Premium (💰5000)</button>';
        } else {
          html2 += '<div style="color:#4caf50;text-align:center;margin-top:8px;">✅ Premium ativo</div>';
        }
        // Tiers
        html2 += '<div style="margin-top:12px;max-height:300px;overflow-y:auto;">';
        for (let t = 1; t <= maxTier; t++) {
          const info = tiers.find(function (x) { return x.tier === t; }) || {};
          const freeTxt = fmtReward(info.free);
          const premTxt = fmtReward(info.premium);
          const claimedF = claimedList.indexOf(t + ':free') !== -1;
          const claimedP = claimedList.indexOf(t + ':premium') !== -1;
          const unlocked = tier >= t;
          const done = !premium ? claimedF : (claimedF && claimedP);
          html2 += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid #222;background:' + (done ? '#1a3a1a' : unlocked ? '#1a1a2e' : '#0a0a15') + ';">';
          html2 += '<span style="color:' + (claimedF ? '#4caf50' : unlocked ? '#ffd700' : '#555') + ';min-width:48px;">Tier ' + t + '</span>';
          html2 += '<span style="flex:1;color:#888;font-size:0.8em;">Free: ' + esc(freeTxt || '?') + '</span>';
          if (premium) html2 += '<span style="flex:1;color:#b9c;font-size:0.8em;">Premium: ' + esc(premTxt || '?') + '</span>';
          if (unlocked && !claimedF) {
            html2 += '<button class="btn btn-sm cp-claim-pass" data-tier="' + t + '" data-mode="free">🎁F</button>';
          } else if (claimedF) {
            html2 += '<span style="color:#4caf50;font-size:0.8em;">✅</span>';
          } else {
            html2 += '<span style="color:#555;">🔒</span>';
          }
          if (premium) {
            if (unlocked && !claimedP) {
              html2 += '<button class="btn btn-sm cp-claim-pass" data-tier="' + t + '" data-mode="premium" style="background:#ffd700;color:#000;">🎁P</button>';
            } else if (claimedP) {
              html2 += '<span style="color:#4caf50;font-size:0.8em;">✅P</span>';
            }
          }
          html2 += '</div>';
        }
        html2 += '</div>';

        box.innerHTML = html2;
        setTimeout(function () {
          const buyP = document.getElementById('cp-buy-premium');
          if (buyP) buyP.addEventListener('click', function () {
            Net.seasonBuyPremium().then(function () {
              if (UI) UI.toast('🎟️ Premium comprado!', 'gold', 3000);
              CP.passe();
            }).catch(function (e) { if (UI) UI.toast(e.message || 'Erro.', 'error', 3000); });
          });
          box.querySelectorAll('.cp-claim-pass').forEach(function (b) {
            b.addEventListener('click', function () {
              const t = parseInt(this.dataset.tier);
              const mode = this.dataset.mode;
              Net.seasonClaim(t, mode).then(function () {
                if (UI) UI.toast('🎟️ Recompensa do Passe reivindicada!', 'gold', 3000);
                CP.passe();
              }).catch(function (e) { if (UI) UI.toast(e.message || 'Erro.', 'error', 3000); });
            });
          });
        }, 50);
      }).catch(function () {
        const box = document.getElementById('cp-passe-content');
        if (box) box.innerHTML = '<p class="cp-state cp-state-error">Erro ao carregar Season Pass.</p>';
      });
    }
  };

  /* ============================================================
     D6: DENUNCIAR JOGADOR
     ============================================================ */
  CP.denuncia = function () {
    const html = '<p style="color:#aaa;">Denuncie um jogador por comportamento impróprio (cheating, assédio, spam):</p>' +
      '<div style="margin:8px 0;"><label style="color:#888;">ID ou nome do jogador:</label><br><input id="cp-report-target" placeholder="username ou ID" style="width:100%;background:#333;color:#fff;border:1px solid #666;border-radius:6px;padding:8px;"></div>' +
      '<div style="margin:8px 0;"><label style="color:#888;">Motivo:</label><br>' +
      '<select id="cp-report-reason" style="width:100%;background:#333;color:#fff;border:1px solid #666;border-radius:6px;padding:8px;">' +
      '<option value="cheating">Trapaça / Cheating</option>' +
      '<option value="harassment">Assédio / Harassment</option>' +
      '<option value="spam">Spam</option>' +
      '<option value="other">Outro</option>' +
      '</select></div>' +
      '<div style="margin:8px 0;"><label style="color:#888;">Detalhes (opcional, máx 500 caracteres):</label><br>' +
      '<textarea id="cp-report-detail" maxlength="500" style="width:100%;background:#333;color:#fff;border:1px solid #666;border-radius:6px;padding:8px;min-height:60px;"></textarea></div>' +
      '<div id="cp-report-result" style="color:#888;margin-top:4px;"></div>';
    const m = openModal('🚩 Denunciar Jogador', html, [
      { label: 'Enviar Denúncia', cls: 'btn primary', close: false, cb: function () {
        const target = document.getElementById('cp-report-target').value.trim();
        const reason = document.getElementById('cp-report-reason').value;
        const detail = document.getElementById('cp-report-detail').value.trim();
        const res = document.getElementById('cp-report-result');
        if (!target) { res.innerHTML = '<span style="color:#f44;">Informe o ID ou nome do jogador.</span>'; return; }
        Net.report(target, reason, detail).then(function () {
          res.innerHTML = '<span style="color:#4caf50;">✅ Denúncia enviada com sucesso!</span>';
          if (UI) UI.toast('🚩 Denúncia registrada.', 'info', 3000);
        }).catch(function (e) {
          res.innerHTML = '<span style="color:#f44;">' + (e.message || 'Erro ao enviar.') + '</span>';
        });
      } },
      { label: 'Fechar', cls: 'btn' },
    ]);
  };

  /* ============================================================
     ADMIN: MODERAÇÃO (D2/D3/D6)
     ============================================================ */
  CP.adminModPanel = function () {
    let html = '<div id="cp-admin-mod-content">';
    html += '<p style="color:#aaa;">Painel de moderação. Use com responsabilidade.</p>';

    // Auditoria
    html += '<h4 style="color:#ffd700;margin:8px 0;">📋 Auditoria (D2)</h4>';
    html += '<div id="cp-audit-list"><p class="cp-state cp-state-loading">Carregando...</p></div>';

    // Ban / Mute / Freeze
    html += '<h4 style="color:#ffd700;margin:12px 0 8px 0;">🛠️ Moderação (D3)</h4>';
    html += '<div style="display:grid;gap:6px;">';
    html += '<div><input id="cp-mod-user" placeholder="ID do jogador" style="width:100%;background:#333;color:#fff;border:1px solid #666;border-radius:6px;padding:6px;"></div>';
    html += '<div><input id="cp-mod-reason" placeholder="Motivo" style="width:100%;background:#333;color:#fff;border:1px solid #666;border-radius:6px;padding:6px;"></div>';
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
    html += '<button class="btn btn-sm" id="cp-admin-ban">Banir</button>';
    html += '<button class="btn btn-sm" id="cp-admin-mute">Mutar</button>';
    html += '<button class="btn btn-sm" id="cp-admin-warn">Avisar</button>';
    html += '<button class="btn btn-sm" id="cp-admin-freeze">Congelar</button>';
    html += '<button class="btn btn-sm" id="cp-admin-unfreeze">Descongelar</button>';
    html += '</div></div>';

    // Denúncias pendentes
    html += '<h4 style="color:#ffd700;margin:12px 0 8px 0;">🚩 Denúncias Pendentes (D6)</h4>';
    html += '<div id="cp-reports-list"><p class="cp-state cp-state-loading">Carregando...</p></div>';

    html += '</div>';

    const m = openModal('🛡️ Admin: Moderação', html, [
      { label: 'Fechar', cls: 'btn' },
      { label: '🔄', cls: 'btn', close: false, cb: function () { CP.adminModPanel(); } },
    ]);

    // Carrega auditoria
    if (Net && Net.adminAudit) {
      Net.adminAudit({ limit: 10 }).then(function (d) {
        const box = document.getElementById('cp-audit-list');
        if (!box) return;
        const logs = d && d.logs;
        if (!logs || !logs.length) {
          box.innerHTML = '<p style="color:#888;">Nenhum log de auditoria.</p>';
          return;
        }
        let html2 = '';
        for (const log of logs) {
          html2 += '<div style="padding:4px 0;border-bottom:1px solid #222;font-size:0.85em;color:#aaa;">' +
            esc(log.action || '?') + ' — admin #' + (log.admin_id || '?') + ' → alvo #' + (log.target_id || '?') +
            ' <span style="color:#666;">' + (log.created_at || '') + '</span></div>';
        }
        box.innerHTML = html2;
      }).catch(function () {
        const box = document.getElementById('cp-audit-list');
        if (box) box.innerHTML = '<p class="cp-state cp-state-error">Erro ao carregar auditoria.</p>';
      });
    }

    // Carrega denúncias
    if (Net && Net.adminReports) {
      Net.adminReports().then(function (d) {
        const box = document.getElementById('cp-reports-list');
        if (!box) return;
        const reports = d && d.reports;
        if (!reports || !reports.length) {
          box.innerHTML = '<p style="color:#888;">Nenhuma denúncia pendente.</p>';
          return;
        }
        let html2 = '';
        for (const r of reports) {
          html2 += '<div style="padding:6px 0;border-bottom:1px solid #222;font-size:0.85em;">';
          html2 += '<span style="color:#f44;">#' + r.id + '</span> — ' + esc(r.reason || '?') + ' — alvo #' + (r.target_id || '?') + ' — reporter #' + (r.reporter_id || '?');
          html2 += ' <button class="btn btn-sm cp-resolve-report" data-rid="' + r.id + '" data-action="actioned">✅ Ação</button>';
          html2 += ' <button class="btn btn-sm cp-resolve-report" data-rid="' + r.id + '" data-action="dismissed">✕ Ignorar</button>';
          html2 += '</div>';
        }
        box.innerHTML = html2;
        box.querySelectorAll('.cp-resolve-report').forEach(function (b) {
          b.addEventListener('click', function () {
            const rid = parseInt(this.dataset.rid);
            const action = this.dataset.action;
            Net.adminResolveReport(rid, action).then(function () {
              if (UI) UI.toast('Denúncia #' + rid + ' resolvida.', 'info', 2000);
              CP.adminModPanel();
            }).catch(function (e) { if (UI) UI.toast(e.message || 'Erro.', 'error', 3000); });
          });
        });
      }).catch(function () {
        const box = document.getElementById('cp-reports-list');
        if (box) box.innerHTML = '<p class="cp-state cp-state-error">Erro ao carregar denúncias.</p>';
      });
    }

    // Ações de moderação
    setTimeout(function () {
      const banBtn = document.getElementById('cp-admin-ban');
      const muteBtn = document.getElementById('cp-admin-mute');
      const warnBtn = document.getElementById('cp-admin-warn');
      const freezeBtn = document.getElementById('cp-admin-freeze');
      const unfreezeBtn = document.getElementById('cp-admin-unfreeze');
      const userInput = document.getElementById('cp-mod-user');
      const reasonInput = document.getElementById('cp-mod-reason');
      function modAction(action) {
        const uid = parseInt(userInput.value.trim());
        const reason = reasonInput.value.trim() || 'Moderação';
        if (!uid || isNaN(uid)) { if (UI) UI.toast('Informe o ID do jogador.', 'error', 2000); return; }
        Net.adminMod(action, { user_id: uid, reason: reason }).then(function () {
          if (UI) UI.toast('✅ Ação de moderação aplicada: ' + action, 'gold', 3000);
        }).catch(function (e) { if (UI) UI.toast(e.message || 'Erro na moderação.', 'error', 3000); });
      }
      if (banBtn) banBtn.addEventListener('click', function () {
        const dur = prompt('Duração em segundos (deixe vazio para permanente):');
        const uid = parseInt(userInput.value.trim());
        const reason = reasonInput.value.trim() || 'Ban';
        if (!uid || isNaN(uid)) { if (UI) UI.toast('Informe o ID.', 'error', 2000); return; }
        Net.adminBan(uid, reason, dur ? parseInt(dur) : null).then(function () {
          if (UI) UI.toast('✅ Banido.', 'gold', 3000);
        }).catch(function (e) { if (UI) UI.toast(e.message || 'Erro.', 'error', 3000); });
      });
      if (muteBtn) muteBtn.addEventListener('click', function () { modAction('mute'); });
      if (warnBtn) warnBtn.addEventListener('click', function () { modAction('warn'); });
      if (freezeBtn) freezeBtn.addEventListener('click', function () { modAction('freeze'); });
      if (unfreezeBtn) unfreezeBtn.addEventListener('click', function () {
        const uid = parseInt(userInput.value.trim());
        if (!uid || isNaN(uid)) { if (UI) UI.toast('Informe o ID.', 'error', 2000); return; }
        Net.adminUnfreeze(uid).then(function () {
          if (UI) UI.toast('✅ Descongelado.', 'gold', 3000);
        }).catch(function (e) { if (UI) UI.toast(e.message || 'Erro.', 'error', 3000); });
      });
    }, 50);
  };

  /* ============================================================
     APLICAÇÃO DE TEMA E COSMÉTICOS NO THIEGO
     Delegado à nova engine js/cosmeticFX.js (data-theme +
     css/themes.css; cosméticos estruturados css/cosmetics.css).
     ============================================================ */
  function applyTheme() {
    if (window.CosmeticFX) { window.CosmeticFX.applyTheme(); return; }
    // fallback legado (sem cosmeticFX.js): tema clássico sem inline styles
    document.body.removeAttribute('data-theme');
  }

  function applyCosmetics() {
    if (window.CosmeticFX) { window.CosmeticFX.applyCosmetics(); return; }
    // fallback legado: sem FX quando a engine nova não está carregada
  }

  // Aplica ao carregar e quando trocar de tema/cosmético
  CP.applyTheme = applyTheme;
  CP.applyCosmetics = applyCosmetics;

  /* ============================================================
     FLAVOR EVENT — MODAL
     ============================================================ */
  function showFlavorEvent(ev, deadline) {
    if (!ev) return;
    const choices = ev.choices || [];
    let html = '<div style="text-align:center;">';
    if (ev.icon) html += '<div style="font-size:3em;margin:8px 0;">' + ev.icon + '</div>';
    if (ev.title) html += '<div style="color:#ffd700;font-weight:bold;font-size:1.1em;">' + esc(ev.title) + '</div>';
    html += '<p style="color:#ddd;font-size:1em;">' + esc(ev.text || '') + '</p>';
    html += '<div style="color:#888;font-size:0.85em;margin-bottom:12px;">Escolha uma ação (expira em 60s):</div>';
    html += '<div style="display:grid;gap:8px;">';
    for (let i = 0; i < choices.length; i++) {
      const c = choices[i];
      html += '<button class="btn cp-flavor-choice" data-idx="' + i + '" style="padding:12px;text-align:left;background:#1a1a2e;border:1px solid #ffd700;">';
      html += '<strong style="color:#ffd700;">' + (c.text || 'Opção ' + (i + 1)) + '</strong>';
      if (c.desc) html += '<br><span style="color:#aaa;font-size:0.85em;">' + esc(c.desc) + '</span>';
      html += '</button>';
    }
    html += '</div></div>';
    const m = openModal('🎲 Evento Narrativo!', html, [
      { label: 'Ignorar', cls: 'btn', cb: function () {
        if (G && G.resolveFlavorChoice) G.resolveFlavorChoice(-1);
      } },
    ]);
    m.querySelectorAll('.cp-flavor-choice').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const idx = parseInt(this.dataset.idx);
        closeModal();
        if (G && G.resolveFlavorChoice) G.resolveFlavorChoice(idx);
      });
    });
  }

})();
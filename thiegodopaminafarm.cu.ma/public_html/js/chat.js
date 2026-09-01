/* ============================================================
   THIEGO DOPAMINA FARM — chat.js
   UI do tempo real: chat global + presença (online) + boss
   mundial. Usa window.Realtime (Ably). Painel flutuante
   discreto; só aparece quando conectado.
   ============================================================ */
(function () {
  'use strict';

  var RT = window.Realtime;
  var Chat = window.Chat = { open: false, messages: [], online: 0 };

  var panel = null, listEl = null, inputEl = null, btnEl = null, dotEl = null, bossEl = null;

  /* ---------- construir painel ---------- */
  function build() {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = 'chat-panel';
    panel.className = 'chat-panel';
    panel.innerHTML =
      '<div class="chat-head">' +
      '  <span class="chat-title">💬 FARM GLOBAL</span>' +
      '  <span class="chat-online" id="chat-online">● 0</span>' +
      '  <button class="chat-min" id="chat-min">–</button>' +
      '</div>' +
      '<div class="chat-body" id="chat-body"></div>' +
      '<div class="chat-boss" id="chat-boss" style="display:none"></div>' +
      '<form class="chat-form" id="chat-form">' +
      '  <input class="chat-input" id="chat-input" maxlength="300" placeholder="mensagem... (Enter p/ enviar)" autocomplete="off">' +
      '  <button class="chat-send" type="submit">➤</button>' +
      '</form>';
    document.body.appendChild(panel);

    listEl = document.getElementById('chat-body');
    inputEl = document.getElementById('chat-input');
    bossEl = document.getElementById('chat-boss');
    dotEl = document.getElementById('chat-online');

    document.getElementById('chat-min').addEventListener('click', toggle);
    document.getElementById('chat-form').addEventListener('submit', function (e) {
      e.preventDefault();
      send();
    });

    // botão flutuante para abrir
    var fab = document.createElement('button');
    fab.id = 'chat-fab';
    fab.className = 'chat-fab';
    fab.innerHTML = '💬<span class="chat-fab-badge" id="chat-fab-badge" style="display:none"></span>';
    fab.title = 'Chat global';
    fab.addEventListener('click', toggle);
    document.body.appendChild(fab);
    window.ChatFab = fab;
  }

  function toggle() {
    if (!panel) return;
    Chat.open = !Chat.open;
    panel.classList.toggle('open', Chat.open);
    var fab = document.getElementById('chat-fab');
    if (fab) fab.style.display = Chat.open ? 'none' : '';
    if (Chat.open) {
      // marca como lido
      var badge = document.getElementById('chat-fab-badge');
      if (badge) badge.style.display = 'none';
      render();
      if (inputEl) inputEl.focus();
    }
  }

  /* ---------- receber mensagens ---------- */
  function addMessage(msg) {
    Chat.messages.push(msg);
    if (Chat.messages.length > 100) Chat.messages.shift();
    if (Chat.open) render();
    else {
      var badge = document.getElementById('chat-fab-badge');
      if (badge) badge.style.display = '';
    }
  }

  function render() {
    if (!listEl) return;
    listEl.innerHTML = '';
    Chat.messages.forEach(function (m) {
      var row = document.createElement('div');
      row.className = 'chat-msg' + (m.clientId === RT.me ? ' me' : '');
      var name = m.name || '?';
      var time = m.ts ? new Date(m.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      row.innerHTML = '<span class="chat-who">' + esc(name) + ':</span> <span class="chat-txt">' + esc(m.text) + '</span>' +
        '<span class="chat-time">' + time + '</span>';
      listEl.appendChild(row);
    });
    listEl.scrollTop = listEl.scrollHeight;
  }

  function send() {
    if (!inputEl || !inputEl.value.trim()) return;
    var text = inputEl.value.trim();
    inputEl.value = '';
    if (RT.connected) {
      RT.sendChat(text).catch(function () { addMessage({ name: 'você', text: text + ' (offline — não enviada)', ts: Date.now(), clientId: RT.me }); });
      addMessage({ name: 'você', text: text, ts: Date.now(), clientId: RT.me });
    } else {
      addMessage({ name: 'sistema', text: 'Você está offline. Conecte-se para usar o chat.', ts: Date.now() });
    }
  }

  function updateOnline(n) {
    Chat.online = n;
    if (dotEl) dotEl.textContent = '● ' + n;
  }

  /* ---------- integração com Realtime ---------- */
  Chat.init = function () {
    if (!RT) return;
    build();

    RT.on('chat', function (d) {
      addMessage({ text: d.text, name: d.name, ts: d.ts, clientId: d.clientId });
    });
    RT.on('presence', function (d) {
      updateOnline(d.online || 0);
    });
    RT.on('connected', function (d) {
      if (dotEl) dotEl.textContent = '● 1';
    });

    // boss mundial é gerenciado pelo js/boss.js
    if (window.Boss && window.Boss.init) {
      try { window.Boss.init(); } catch (e) {}
    }
  };

  function esc(t) {
    var d = document.createElement('div');
    d.textContent = t == null ? '' : String(t);
    return d.innerHTML;
  }

  // init quando o jogo estiver pronto (apos main.js boot)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { Chat.init(); }, 6000); });
  } else {
    setTimeout(function () { Chat.init(); }, 6000);
  }
})();
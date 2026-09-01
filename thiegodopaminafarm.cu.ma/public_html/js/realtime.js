/* ============================================================
   THIEGO DOPAMINA FARM — realtime.js
   Cliente Ably Realtime: chat global, presenca (quem esta
   online) e boss mundial colaborativo.
   Requer o SDK Ably (https://cdn.ably.com/lib/ably.min-1.js)
   e ABLY_KEY configurada no .env (via api/realtime_config.php).
   Se nao configurado, desativa silenciosamente e o jogo
   continua com o polling normal (30-90s).
   ============================================================ */
(function () {
  'use strict';

  var RT = window.Realtime = {
    connected: false,
    provider: null,
    ably: null,
    channel: null,
    presenceChannel: null,
    bossChannel: null,
    listeners: {},
    me: null,
    online: {},        // clientId -> {name, lastSeen}
    boss: null,        // estado do boss mundial
    _enabled: false,
  };

  var MAX_RECONNECT = 30000;

  /* ---------- carregar config e conectar ---------- */
  RT.init = function () {
    if (RT._enabled) return;
    fetch('api/realtime_config.php', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (cfg) {
        if (!cfg || !cfg.enabled) {
          RT._enabled = false;
          return;
        }
        RT.config = cfg;
        RT._enabled = true;
        connect();
      })
      .catch(function () {
        RT._enabled = false;
      });
  };

  function connect() {
    if (!RT._enabled || !RT.config) return;
    if (typeof Ably === 'undefined') {
      setTimeout(connect, 2000);
      return;
    }
    try {
      RT.provider = 'ably';

      // clientId unico: usuario logado ou anonimo persistente em localStorage
      var myClientId = null;
      try {
        if (window.TDFNet && window.TDFNet.user) {
          myClientId = 'tdf_' + window.TDFNet.user.username.replace(/[^A-Za-z0-9_\-]/g, '_');
        } else {
          myClientId = localStorage.getItem('tdf_client_id');
          if (!myClientId) {
            myClientId = 'tdf_anon_' + Math.random().toString(36).slice(2, 10);
            localStorage.setItem('tdf_client_id', myClientId);
          }
        }
      } catch (e) { myClientId = 'tdf_anon_' + Math.random().toString(36).slice(2, 10); }

      RT.ably = new Ably.Realtime({
        authCallback: function (data, callback) {
          fetch(RT.config.tokenEndpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: myClientId }),
          })
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (d && d.ok && d.token) {
                callback(null, d.token);
              } else {
                callback(new Error('token error'));
              }
            })
            .catch(function (err) { callback(err); });
        },
        echoMessages: true,
        autoConnect: true,
        clientId: myClientId,
      });

      RT.ably.connection.on('connected', function () {
        RT.connected = true;
        if (RT.ably.auth.clientId) RT.me = RT.ably.auth.clientId;
        else RT.me = 'tdf_' + Math.random().toString(36).slice(2, 8);
        subscribeChannels();
        emit('connected', { me: RT.me });
      });

      RT.ably.connection.on('closed', function () {
        RT.connected = false;
        emit('disconnected', {});
      });

      RT.ably.connection.on('suspended', function () {
        RT.connected = false;
        emit('disconnected', {});
      });

      RT.ably.connection.on('failed', function () {
        RT.connected = false;
        emit('disconnected', {});
        scheduleReconnect();
      });
    } catch (e) {
      RT._enabled = false;
    }
  }

  function subscribeChannels() {
    // --- chat ---
    RT.channel = RT.ably.channels.get('chat');
    RT.channel.subscribe('message', function (msg) {
      emit('chat', msg.data);
    });
    RT.channel.subscribe('boss', function (msg) {
      emit('boss', msg.data);
    });

    // --- presenca ---
    RT.presenceChannel = RT.ably.channels.get('presence');
    RT.presenceChannel.presence.enter({ name: displayName(), tier: tierNow() });
    RT.presenceChannel.presence.subscribe('enter', function (m) {
      RT.online[m.clientId] = { name: (m.data && m.data.name) || m.clientId, lastSeen: Date.now() };
      emit('presence', { online: countOnline() });
    });
    RT.presenceChannel.presence.subscribe('leave', function (m) {
      delete RT.online[m.clientId];
      emit('presence', { online: countOnline() });
    });
    RT.presenceChannel.presence.subscribe('update', function (m) {
      RT.online[m.clientId] = { name: (m.data && m.data.name) || m.clientId, lastSeen: Date.now() };
      emit('presence', { online: countOnline() });
    });
    // snapshot inicial (API retorna callback, não promise)
    try {
      RT.presenceChannel.presence.get(function (err, members) {
        if (err || !members) return;
        RT.online = {};
        members.forEach(function (m) {
          RT.online[m.clientId] = { name: (m.data && m.data.name) || m.clientId, lastSeen: Date.now() };
        });
        emit('presence', { online: countOnline() });
      });
    } catch (e) { /* ignora */ }

    // --- boss mundial ---
    RT.bossChannel = RT.ably.channels.get('boss');
    RT.bossChannel.presence.enter({ name: displayName(), dps: dpsNow() });
    RT.bossChannel.presence.subscribe('enter', function (m) {
      emit('bossEnter', m.data);
    });
    RT.bossChannel.presence.subscribe('leave', function (m) {
      emit('bossLeave', m.data);
    });
  }

  function displayName() {
    var u = window.TDFNet && window.TDFNet.user;
    return (u && u.username) || 'anônimo';
  }

  function tierNow() {
    var st = window.Game && window.Game.state;
    return (st && st.tier) || 0;
  }

  function dpsNow() {
    var st = window.Game && window.Game.state;
    var s = st && st.settings;
    var l = window.Num ? window.Num.log10(st.totalEarned) : 0;
    return isFinite(l) ? Math.round(l * 100) / 100 : 0;
  }

  /* ---------- enviar chat ---------- */
  RT.sendChat = function (text) {
    if (!RT.connected || !RT.channel) return Promise.reject(new Error('not_connected'));
    var msg = {
      text: String(text).slice(0, 300),
      name: displayName(),
      ts: Date.now(),
      clientId: RT.me,
    };
    return RT.channel.publish('message', msg);
  };

  RT.attackBoss = function (dpsLog10) {
    if (!RT.connected || !RT.bossChannel) return Promise.reject(new Error('not_connected'));
    return RT.bossChannel.publish('attack', {
      name: displayName(),
      dpsLog10: dpsLog10,
      ts: Date.now(),
    });
  };

  /* ---------- reconexao ---------- */
  function scheduleReconnect() {
    if (RT.reconnectTimer) return;
    RT.reconnectTimer = setTimeout(function () {
      RT.reconnectTimer = 0;
      if (!RT.connected && RT._enabled) connect();
    }, MAX_RECONNECT);
  }

  /* ---------- receber (eventos locais) ---------- */
  function emit(event, data) {
    var cbs = RT.listeners[event];
    if (cbs) {
      for (var i = 0; i < cbs.length; i++) {
        try { cbs[i](data); } catch (e) { /* ignora */ }
      }
    }
    var all = RT.listeners['*'];
    if (all) {
      for (var j = 0; j < all.length; j++) {
        try { all[j]({ event: event, data: data }); } catch (e2) { /* ignora */ }
      }
    }
  }

  RT.on = function (event, cb) {
    if (!RT.listeners[event]) RT.listeners[event] = [];
    RT.listeners[event].push(cb);
  };

  RT.off = function (event, cb) {
    var cbs = RT.listeners[event];
    if (!cbs) return;
    RT.listeners[event] = cbs.filter(function (f) { return f !== cb; });
  };

  RT.send = function (type, data) {
    // compat: roteia tipos genericos para canais Ably
    if (type === 'chat') return RT.sendChat(data && data.text);
    if (type === 'boss_attack') return RT.attackBoss(data && data.dpsLog10);
    return Promise.reject(new Error('unknown_type'));
  };

  RT.countOnline = function () { return countOnline(); };
  function countOnline() {
    return Object.keys(RT.online).length;
  }

  RT.destroy = function () {
    RT._enabled = false;
    if (RT.reconnectTimer) { clearTimeout(RT.reconnectTimer); RT.reconnectTimer = 0; }
    if (RT.ably) {
      try { RT.ably.close(); } catch (e) {}
      RT.ably = null;
    }
    RT.connected = false;
    RT.channel = null;
    RT.listeners = {};
  };

  /* ---------- auto-init ---------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(RT.init, 2500); });
  } else {
    setTimeout(RT.init, 2500);
  }
})();
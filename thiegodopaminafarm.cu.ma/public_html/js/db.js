/* ============================================================
   THIEGO DOPAMINA FARM — db.js
   IndexedDB: historico de producao, backup do save, cache
   ============================================================ */
(function () {
  'use strict';

  var DB_NAME = 'TDF_DB';
  var DB_VER = 1;
  var DB = null;

  /* ---------- abrir banco ---------- */
  function open() {
    return new Promise(function (resolve, reject) {
      if (DB) return resolve(DB);
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        // historico de producao (timestamp, log10, tier, prestige)
        if (!db.objectStoreNames.contains('history')) {
          var store = db.createObjectStore('history', { keyPath: 'ts' });
          store.createIndex('tier', 'tier', { unique: false });
        }
        // backup do save (key: 'latest', 'v1', 'v2', ...)
        if (!db.objectStoreNames.contains('saves')) {
          db.createObjectStore('saves', { keyPath: 'id' });
        }
        // cache de dados da API
        if (!db.objectStoreNames.contains('cache')) {
          var cs = db.createObjectStore('cache', { keyPath: 'key' });
          cs.createIndex('expires', 'expires', { unique: false });
        }
      };
      req.onsuccess = function (e) {
        DB = e.target.result;
        resolve(DB);
      };
      req.onerror = function () { reject(req.error); };
    });
  }

  /* ---------- historico de producao ---------- */
  // Grava amostra a cada 60s
  var _sampleAcc = 0;
  var _lastSample = 0;

  function pushSample(state) {
    if (!state) return;
    var now = Date.now();
    if (now - _lastSample < 30000) return; // max 1 a cada 30s
    _lastSample = now;
    var log10 = window.Num ? window.Num.log10(state.totalEarned) : 0;
    var sample = {
      ts: now,
      log10: isFinite(log10) ? Math.round(log10 * 100) / 100 : 0,
      tier: state.tier || 0,
      prestige: state.prestige || 0,
    };
    open().then(function (db) {
      var tx = db.transaction('history', 'readwrite');
      tx.objectStore('history').add(sample);
      // limpa registros com mais de 7 dias
      var cutoff = now - 7 * 86400000;
      var range = IDBKeyRange.upperBound(cutoff);
      tx.objectStore('history').delete(range);
    }).catch(function () {});
  }

  // Obtem historico para grafico
  function getHistory(hours) {
    hours = hours || 24;
    var since = Date.now() - hours * 3600000;
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('history', 'readonly');
        var range = IDBKeyRange.lowerBound(since);
        var req = tx.objectStore('history').getAll(range);
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    }).catch(function () { return []; });
  }

  /* ---------- backup do save ---------- */
  // Mantém no máximo MAX_DATED_BACKUPS cópias datadas (podadas por idade).
  var MAX_DATED_BACKUPS = 20;

  function pruneDatedBackups(store) {
    try {
      var req = store.getAllKeys();
      req.onsuccess = function () {
        var keys = (req.result || [])
          .filter(function (k) { return typeof k === 'string' && k.charAt(0) === 'v' && k !== 'latest'; })
          .map(function (k) { return parseInt(k.slice(1), 10) || 0; })
          .sort(function (a, b) { return b - a; }); // mais novo primeiro
        for (var i = MAX_DATED_BACKUPS; i < keys.length; i++) {
          store.delete('v' + keys[i]);
        }
      };
    } catch (e) {}
  }

  function saveBackup(state) {
    if (!state) return Promise.resolve();
    try {
      var txt = JSON.stringify(state);
      return open().then(function (db) {
        var tx = db.transaction('saves', 'readwrite');
        // salva como 'latest' + versao datada
        tx.objectStore('saves').put({ id: 'latest', data: txt, savedAt: Date.now() });
        tx.objectStore('saves').put({ id: 'v' + Date.now(), data: txt, savedAt: Date.now() });
        pruneDatedBackups(tx.objectStore('saves'));
        return new Promise(function (resolve, reject) {
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
        });
      }).catch(function () {});
    } catch (e) { return Promise.resolve(); }
  }

  function loadBackup() {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('saves', 'readonly');
        var req = tx.objectStore('saves').get('latest');
        req.onsuccess = function () {
          if (req.result && req.result.data) {
            try { resolve(JSON.parse(req.result.data)); }
            catch (e) { resolve(null); }
          } else { resolve(null); }
        };
        req.onerror = function () { reject(null); };
      });
    }).catch(function () { return null; });
  }

  /* ---------- cache de API ---------- */
  function cacheSet(key, data, ttlMs) {
    ttlMs = ttlMs || 300000; // 5 min default
    var entry = { key: key, data: data, expires: Date.now() + ttlMs };
    return open().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction('cache', 'readwrite');
        tx.objectStore('cache').put(entry);
        tx.oncomplete = function () { resolve(); };
      });
    }).catch(function () {});
  }

  function cacheGet(key) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('cache', 'readonly');
        var req = tx.objectStore('cache').get(key);
        req.onsuccess = function () {
          var entry = req.result;
          if (entry && entry.expires > Date.now()) resolve(entry.data);
          else resolve(null);
        };
        req.onerror = function () { reject(null); };
      });
    }).catch(function () { return null; });
  }

  /* ---------- limpeza de cache expirado ---------- */
  function cleanExpired() {
    open().then(function (db) {
      var tx = db.transaction('cache', 'readwrite');
      var idx = tx.objectStore('cache').index('expires');
      var range = IDBKeyRange.upperBound(Date.now());
      idx.openCursor(range).onsuccess = function (e) {
        var cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
    }).catch(function () {});
  }

  // Limpa cache expirado a cada 10 min
  setInterval(cleanExpired, 600000);

  /* ---------- API publica ---------- */
  window.DB = {
    pushSample: pushSample,
    getHistory: getHistory,
    saveBackup: saveBackup,
    loadBackup: loadBackup,
    cacheSet: cacheSet,
    cacheGet: cacheGet,
  };

  // Tick chamado pelo main.js
  window.DB.tick = function (dt, state) {
    _sampleAcc += dt;
    if (_sampleAcc >= 60) {
      _sampleAcc = 0;
      pushSample(state);
    }
  };

  // Save backup chamado junto com o save principal
  window.DB.saveBackup = function (state) {
    _sampleAcc = 0;
    pushSample(state);
    saveBackup(state);
  };
})();
/* ============================================================
   THIEGO DOPAMINA FARM — pwa.js
   Registro do Service Worker + assinatura Push Notification
   ============================================================ */
(function () {
  'use strict';

  var PWA = window.PWA = {
    swReady: false,
    pushSubscribed: false,
    swReg: null,
  };

  /* ---------- registrar service worker ---------- */
  function register() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(function (reg) {
        PWA.swReg = reg;
        PWA.swReady = true;
        if (reg.active) {
          // ja instalado — verifica subscricao
          checkSubscription();
        }
        reg.addEventListener('updatefound', function () {
          var installing = reg.installing;
          if (installing) {
            installing.addEventListener('statechange', function () {
              if (installing.state === 'activated') {
                checkSubscription();
                if (window.UI && window.UI.toast) {
                  window.UI.toast('🔄 Jogo atualizado em segundo plano!', 'info', 3000);
                }
              }
            });
          }
        });
      })
      .catch(function () {});
  }

  /* ---------- verificar / assinar push ---------- */
  function checkSubscription() {
    if (!PWA.swReg) return;
    PWA.swReg.pushManager.getSubscription().then(function (sub) {
      PWA.pushSubscribed = !!sub;
    }).catch(function () {});
  }

  function urlBase64ToUint8Array(base64) {
    var padding = '='.repeat((4 - base64.length % 4) % 4);
    var b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(b64);
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  PWA.subscribe = function (vapidKey) {
    if (!PWA.swReg || PWA.pushSubscribed) return Promise.resolve(false);
    if (!vapidKey) {
      // busca VAPID do servidor
      return fetch('api/push.php', { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.vapid) {
            return doSubscribe(d.vapid);
          }
          return false;
        })
        .catch(function () { return false; });
    }
    return doSubscribe(vapidKey);
  };

  function doSubscribe(vapidKey) {
    return PWA.swReg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    }).then(function (sub) {
      PWA.pushSubscribed = true;
      // envia ao servidor
      return fetch('api/push.php?route=subscribe', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: JSON.parse(JSON.stringify(sub)) }),
      }).then(function (r) { return r.json(); }).then(function () {
        if (window.UI && window.UI.toast) {
          window.UI.toast('🔔 Notificações ativadas!', 'success', 3000);
        }
      }).catch(function () {});
    }).catch(function (err) {
      // Permission denied ou erro — silencioso
      if (err && err.name !== 'NotAllowedError') {
        if (window.UI && window.UI.toast) {
          window.UI.toast('🔕 Notificações bloqueadas pelo navegador', 'warn', 4000);
        }
      }
    });
  }

  // Auto-subscribe quando logado (gesto do usuario = login)
  PWA.subscribeAfterLogin = function () {
    if (!PWA.swReady) {
      // tenta de novo quando o SW estiver pronto
      var check = setInterval(function () {
        if (PWA.swReady) {
          clearInterval(check);
          PWA.subscribe();
        }
      }, 1000);
      setTimeout(function () { clearInterval(check); }, 15000);
      return;
    }
    PWA.subscribe();
  };

  PWA.unsubscribe = function () {
    if (!PWA.swReg || !PWA.pushSubscribed) return Promise.resolve(false);
    return PWA.swReg.pushManager.getSubscription().then(function (sub) {
      if (!sub) { PWA.pushSubscribed = false; return false; }
      return sub.unsubscribe().then(function () {
        PWA.pushSubscribed = false;
        // avisa servidor
        if (window.TDFNet && window.TDFNet.logged) {
          return fetch('api/push.php?route=unsubscribe', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }).then(function () {}).catch(function () {});
        }
      });
    }).catch(function () {});
  };

  /* ---------- boot ---------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', register);
  } else {
    register();
  }
})();
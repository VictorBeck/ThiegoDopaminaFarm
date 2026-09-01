/* ============================================================
   THIEGO DOPAMINA FARM — ai.js
   Missões dinâmicas geradas por IA (via api/ai.php).
   Se o servidor não tiver chave de API, retorna missões
   da lista fixa (fallback) — nunca quebra.
   ============================================================ */
(function () {
  'use strict';

  var AI = window.AI = {
    enabled: false,
    daily: null,
    loaded: false,
  };

  AI.init = function () {
    // verifica se o endpoint existe e já busca a missão do dia
    fetch('api/ai.php?route=daily', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Accept': 'application/json' },
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        AI.enabled = !!(d && d.ok);
        if (d && d.ok && d.data) {
          AI.daily = d.data;
          AI.loaded = true;
          showAIContent(d.data);
        } else {
          // endpoint existe mas sem dados: mostra fallback local
          showAIContent({ title: 'Missão do dia indisponível', desc: 'Volte mais tarde!', reward: '' });
        }
      })
      .catch(function () {
        AI.enabled = false;
        // endpoint inexistente: remove o placeholder
        var box = document.getElementById('ai-content');
        if (box) box.remove();
      });
  };

  AI.fetchDaily = function () {
    return fetch('api/ai.php?route=daily', {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' },
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok && d.data) {
          AI.daily = d.data;
          AI.loaded = true;
          showAIContent(d.data);
          return d.data;
        }
        return null;
      })
      .catch(function () { return null; });
  };

  // Preenche o #ai-content se já tiver dados (chamado pelo renderMissions)
  AI.renderInto = function () {
    if (AI.loaded && AI.daily) {
      showAIContent(AI.daily);
    }
  };

  function showAIContent(data) {
    var container = document.getElementById('ai-content');
    if (!container) return;
    if (data.title) {
      container.innerHTML = '<div class="miss-group-title">MISSÃO DO DIA</div>' +
        '<div class="ai-card"><div class="ai-icon">🤖</div>' +
        '<div class="ai-body"><div class="ai-title">' + esc(data.title) + '</div>' +
        (data.desc ? '<div class="ai-desc">' + esc(data.desc) + '</div>' : '') +
        (data.reward ? '<div class="ai-reward">🎁 ' + esc(data.reward) + '</div>' : '') +
        '</div></div>';
    }
  }

  function esc(t) {
    var d = document.createElement('div');
    d.textContent = t == null ? '' : String(t);
    return d.innerHTML;
  }

  // auto-init após o jogo carregar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(AI.init, 5000); });
  } else {
    setTimeout(AI.init, 5000);
  }
})();
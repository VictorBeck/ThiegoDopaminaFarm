/* ============================================================
   THIEGO DOPAMINA FARM - cosmeticFX.js
   Engine de Temas + Cosmeticos integrados ao Diego.
   TEMAS: body[data-theme] + css/themes.css (tokens scoped +
   camadas de atmosfera fixas atras do app). Sem style inline.
   COSMETICOS: elementos estruturados DENTRO de #farm-btn
   (position:relative), cada um com DOM/animacao propria.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- TEMAS ---------------- */
  var AMBIENCE_ID = 'tdf-ambience';
  var AMBIENCE_HTML =
    '<i class="tdf-amb-bg"></i>' +
    '<i class="tdf-amb-stars"></i>' +
    '<i class="tdf-amb-vignette"></i>';

  function ensureAmbience() {
    var amb = document.getElementById(AMBIENCE_ID);
    if (!amb) {
      amb = document.createElement('div');
      amb.id = AMBIENCE_ID;
      amb.className = 'tdf-ambience';
      amb.innerHTML = AMBIENCE_HTML;
      document.body.appendChild(amb);
    }
    return amb;
  }

  function applyTheme() {
    var s = (window.Game && window.Game.s) || (window.G && window.G.s);
    var THEMES = (window.TDF && window.TDF.THEMES) || (window.T && window.T.THEMES);
    if (!s || !THEMES) return;
    var th = null;
    for (var i = 0; i < THEMES.length; i++) {
      if (THEMES[i].id === s.activeTheme) { th = THEMES[i]; break; }
    }
    var id = th ? th.id : 'classic';
    document.body.setAttribute('data-theme', id);
    ensureAmbience();
    // compat: antigo toggle chamava CP.applyTheme apos trocar activeTheme
    try {
      document.body.style.removeProperty('background');
    } catch (e) { /* noop */ }
    if (window.TDF_onThemeApplied) window.TDF_onThemeApplied(id);
  }

  /* ---------------- COSMETICOS ---------------- */
  // Cada slot recebe um container fixo dentro de #farm-btn.
  // Toda a estrutura visual vem de css/cosmetics.css (v2).
  var FX_BUILDERS = {
    cos_coroa: function (el) {
      el.innerHTML =
        '<span class="cfx-crown">' +
        '<span class="cfx-crown-jewel"></span>' +
        '</span>';
    },
    cos_oculos: function (el) {
      el.innerHTML =
        '<span class="cfx-shades">' +
        '<span class="cfx-shades-lens l"></span>' +
        '<span class="cfx-shades-lens r"></span>' +
        '<span class="cfx-shades-bridge"></span>' +
        '</span>';
    },
    cos_chapeu: function (el) {
      el.innerHTML =
        '<span class="cfx-hat">' +
        '<span class="cfx-hat-brim"></span>' +
        '</span>';
    },
    cos_halo: function (el) {
      el.innerHTML =
        '<span class="cfx-halo">' +
        '<span class="cfx-halo-ring"></span>' +
        '<span class="cfx-halo-rays"></span>' +
        '</span>';
    },
    cos_aura: function (el) {
      el.innerHTML =
        '<span class="cfx-aura cfx-aura--dopamine">' +
        '<span class="cfx-aura-glow"></span>' +
        '<span class="cfx-aura-particles">' +
        '  <i></i><i></i><i></i><i></i><i></i><i></i>' +
        '</span>' +
        '</span>';
    },
    cos_aurora: function (el) {
      el.innerHTML =
        '<span class="cfx-aura cfx-aura--aurora">' +
        '<span class="cfx-aurora-band b1"></span>' +
        '<span class="cfx-aurora-band b2"></span>' +
        '<span class="cfx-aurora-band b3"></span>' +
        '</span>';
    },
    cos_capa: function (el) {
      el.innerHTML =
        '<span class="cfx-cape">' +
        '<span class="cfx-cape-cloth"></span>' +
        '</span>';
    },
    cos_fogo: function (el) {
      el.innerHTML =
        '<span class="cfx-flames">' +
        '<span class="cfx-flame f1"></span>' +
        '<span class="cfx-flame f2"></span>' +
        '<span class="cfx-flame f3"></span>' +
        '<span class="cfx-flame f4"></span>' +
        '<span class="cfx-flame f5"></span>' +
        '</span>';
    },
  };

  function ensureFXLayer(btn, slot) {
    var id = 'cfx-layer-' + slot;
    var layer = btn.querySelector('#' + id);
    if (!layer) {
      layer = document.createElement('span');
      layer.id = id;
      layer.className = 'cfx-layer cfx-layer-' + slot;
      btn.appendChild(layer);
    }
    return layer;
  }

  function applyCosmetics() {
    var s = (window.Game && window.Game.s) || (window.G && window.G.s);
    var COS = (window.TDF && window.TDF.COSMETICS) || (window.T && window.T.COSMETICS);
    var fi = document.getElementById('farm-img');
    if (!fi || !s) return;
    var btn = document.getElementById('farm-btn');
    if (!btn) return;

    // IDEMPOTENTE: so mexe no DOM quando algo muda de fato. Reconstruir
    // sempre dispararia o MutationObserver do boot em loop infinito.
    var slots = ['head', 'aura'];
    var want = {};
    for (var k = 0; k < slots.length; k++) {
      var slot = slots[k];
      var cosId = s.cosmetics ? s.cosmetics[slot] : null;
      if (!cosId) continue;
      var meta = null;
      if (COS) {
        for (var j = 0; j < COS.length; j++) {
          if (COS[j].id === cosId) { meta = COS[j]; break; }
        }
      }
      if (!meta) continue;
      var build = FX_BUILDERS[cosId];
      if (!build) continue; // desconhecido: nao renderiza emoji solto
      want[slot] = cosId;
      var layer = btn.querySelector('#cfx-layer-' + slot);
      if (!layer) {
        layer = document.createElement('span');
        layer.id = 'cfx-layer-' + slot;
        layer.className = 'cfx-layer cfx-layer-' + slot;
        btn.appendChild(layer);
      }
      if (layer.dataset.fx !== cosId) {
        layer.dataset.fx = cosId;
        build(layer);
      }
    }
    // remove camadas de slots que nao sao mais desejados
    var existing = btn.querySelectorAll('.cfx-layer');
    for (var e = 0; e < existing.length; e++) {
      var el = existing[e];
      var elSlot = el.id === 'cfx-layer-head' ? 'head' : (el.id === 'cfx-layer-aura' ? 'aura' : null);
      if (!elSlot || !want[elSlot]) el.remove();
    }
  }

  // reexporta para compat (CP.applyTheme / CP.applyCosmetics)
  function wire() {
    if (window.CP) {
      window.CP.applyTheme = applyTheme;
      window.CP.applyCosmetics = applyCosmetics;
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }

  function boot() {
    // G (window.Game) e T podem ainda nao existir no primeiro load;
    // tenta de novo em curto intervalo ate o estado existir.
    var g = window.Game || window.G;
    if (!(g && g.s)) {
      setTimeout(boot, 300);
      return;
  }
    applyTheme();
    applyCosmetics();
    // reaplica quando a aba farm e (re)construida (buildFarm troca innerHTML)
    var t = document.getElementById('tab-farm');
    if (t && window.MutationObserver) {
      new MutationObserver(function () { applyCosmetics(); }).observe(t, {
        childList: true, subtree: true,
      });
      applyCosmetics();
    }
  }

  wire();
  window.CosmeticFX = { applyTheme: applyTheme, applyCosmetics: applyCosmetics };
})();

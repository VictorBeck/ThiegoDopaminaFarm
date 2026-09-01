/* ============================================================
   THIEGO DOPAMINA FARM — wasm.js (v2 — API extern "C")
   Carrega o motor WASM (RNG, log10, validação) se existir.
   O .wasm usa exports estilo "C" (sem wasm-bindgen).
   Se o .wasm não está compilado, desativa silenciosamente e
   o jogo usa a aritmética JS normal. NUNCA quebra o jogo.
   ============================================================ */
(function () {
  'use strict';

  var WASM = window.WASM = {
    ready: false,
    exports: null,
    instance: null,
  };

  function load() {
    var url = 'wasm/tdf_wasm.wasm';
    if (!window.WebAssembly) return;

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('wasm not found');
        return res.arrayBuffer();
      })
      .then(function (buf) {
        return WebAssembly.instantiate(buf, {});
      })
      .then(function (mod) {
        var e = mod.instance.exports;
        WASM.exports = e;
        WASM.instance = mod.instance;

        // teste de sanidade
        if (typeof e.wasm_sanity !== 'function' || !e.wasm_sanity()) {
          throw new Error('sanity check failed');
        }
        WASM.ready = true;
        testExports();
      })
      .catch(function () {
        WASM.ready = false;
      });
  }

  function testExports() {
    // valida que as funcoes principais existem
    var needed = ['rng_next_f64', 'rng_chance', 'big_add_log10', 'big_mul_log10', 'validate_save_total', 'simulate_run'];
    for (var i = 0; i < needed.length; i++) {
      if (typeof WASM.exports[needed[i]] !== 'function') {
        WASM.ready = false;
        return;
      }
    }
  }

  /* ---------- helpers de alto nível ---------- */
  WASM.validateSave = function (totalEarned, playTime, clicks) {
    if (!WASM.ready) return null;
    try {
      var l = totalEarned && totalEarned.e !== undefined
        ? totalEarned.e + Math.log10(totalEarned.m)
        : Math.log10(totalEarned || 0);
      return WASM.exports.validate_save_total(l, playTime || 0, clicks || 0) === 1;
    } catch (e) { return null; }
  };

  WASM.bigAdd = function (la, lb) {
    if (!WASM.ready) return null;
    try { return WASM.exports.big_add_log10(la, lb); }
    catch (e) { return null; }
  };

  WASM.bigMul = function (la, lb) {
    if (!WASM.ready) return null;
    try { return WASM.exports.big_mul_log10(la, lb); }
    catch (e) { return null; }
  };

  WASM.rngNext = function (seed, step) {
    if (!WASM.ready) return null;
    try { return WASM.exports.rng_next_f64(seed, step); }
    catch (e) { return null; }
  };

  WASM.simulateRun = function (seed, seconds, dpsLog10, clickLog10, critChance, critMult) {
    if (!WASM.ready) return null;
    try {
      return WASM.exports.simulate_run(seed, seconds, dpsLog10, clickLog10, critChance, critMult);
    }
    catch (e) { return null; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
/* ============================================================
   THIEGO DOPAMINA FARM — numbers.js
   Números gigantes: mantissa + expoente ({m, e}), normalizados
   com 1 <= m < 10. Nunca gera Infinity/NaN por matemática.
   ============================================================ */
(function () {
  'use strict';
  const N = window.Num = {};

  const ZERO = { m: 0, e: 0 };
  N.zero = ZERO;
  N.one = { m: 1, e: 0 };

  /* ---------- normalização básica ---------- */
  function norm(a) {
    if (!isFinite(a.m) || !isFinite(a.e) || a.m === 0) return ZERO;
    if (a.m >= 10 || a.m < 1) {
      const d = Math.floor(Math.log10(a.m));
      a.m /= Math.pow(10, d);
      a.e += d;
    }
    return a;
  }

  /* ---------- construtores ---------- */
  N.fromF = function (x) {
    if (typeof x === 'object' && x !== null && typeof x.m === 'number') return norm({ m: x.m, e: x.e || 0 });
    if (typeof x === 'string') return N.parse(x);
    if (!isFinite(x) || x <= 0) return ZERO;
    const e = Math.floor(Math.log10(x));
    return { m: x / Math.pow(10, e), e };
  };

  N.fromLog10 = function (l) {
    if (!isFinite(l)) return ZERO;
    if (l <= 0) return l === 0 ? N.one : ZERO;
    let e = Math.floor(l);
    let m = Math.pow(10, l - e);
    if (m >= 10) { m /= 10; e++; }
    if (m < 1) { m *= 10; e--; }
    return { m, e };
  };

  N.parse = function (s) {
    if (!s || s === '0') return ZERO;
    if (typeof s === 'number') return N.fromF(s);
    const i = s.toLowerCase().indexOf('e');
    if (i > 0) {
      const m = parseFloat(s.slice(0, i));
      const e = parseInt(s.slice(i + 1), 10);
      if (isFinite(m) && isFinite(e)) return norm({ m, e });
    }
    return N.fromF(parseFloat(s));
  };

  N.toF = function (a) {
    if (typeof a === 'number') return a;
    if (!a || a.m === 0) return 0;
    if (a.e >= 308) return Infinity;
    if (a.e < -323) return 0;
    return a.m * Math.pow(10, a.e);
  };

  /* ---------- aritmética ---------- */
  N.add = function (a, b) {
    a = a || ZERO; b = b || ZERO;
    if (a.m === 0) return b;
    if (b.m === 0) return a;
    let hi = a, lo = b;
    if (a.e < b.e) { hi = b; lo = a; }
    const d = hi.e - lo.e;
    if (d >= 16) return hi;
    const m = hi.m + lo.m / Math.pow(10, d);
    return norm({ m, e: hi.e });
  };

  N.sub = function (a, b) { // exige a >= b
    a = a || ZERO; b = b || ZERO;
    if (b.m === 0) return a;
    const d = a.e - b.e;
    if (d >= 16) return a;
    const m = a.m - b.m / Math.pow(10, d);
    if (m <= 0) return ZERO;
    return norm({ m, e: a.e });
  };

  N.mul = function (a, b) {
    a = a || ZERO; b = b || ZERO;
    if (a.m === 0 || b.m === 0) return ZERO;
    return norm({ m: a.m * b.m, e: a.e + b.e });
  };

  N.div = function (a, b) {
    a = a || ZERO; b = b || ZERO;
    if (a.m === 0) return ZERO;
    return norm({ m: a.m / b.m, e: a.e - b.e });
  };

  N.pow = function (a, p) { // p: número comum (pode ser grande)
    a = a || ZERO;
    if (a.m === 0) return ZERO;
    if (p === 0) return N.one;
    if (p === 1) return a;
    const l = a.e * p + Math.log10(a.m) * p;
    return N.fromLog10(l);
  };

  N.log10 = function (a) {
    a = a || ZERO;
    return a.m === 0 ? -Infinity : a.e + Math.log10(a.m);
  };

  N.floor = function (a) {
    a = a || ZERO;
    if (a.m === 0 || a.e < 0) return ZERO;
    if (a.e >= 15) return a; // grande demais para inteiro exato — irrelevante
    const v = a.m * Math.pow(10, a.e);
    return norm({ m: Math.floor(v), e: 0 });
  };

  /* ---------- comparação ---------- */
  N.cmp = function (a, b) {
    a = a || ZERO; b = b || ZERO;
    if (a.m === 0) return b.m === 0 ? 0 : -1;
    if (b.m === 0) return 1;
    if (a.e !== b.e) return a.e < b.e ? -1 : 1;
    if (a.m < b.m) return -1;
    if (a.m > b.m) return 1;
    return 0;
  };
  N.lt = (a, b) => N.cmp(a, b) < 0;
  N.lte = (a, b) => N.cmp(a, b) <= 0;
  N.gt = (a, b) => N.cmp(a, b) > 0;
  N.gte = (a, b) => N.cmp(a, b) >= 0;
  N.eq = (a, b) => N.cmp(a, b) === 0;

  N.min = (a, b) => (N.lte(a, b) ? a : b);
  N.max = (a, b) => (N.gte(a, b) ? a : b);

  /* ---------- exibição ---------- */
  const SUF = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc',
    'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc', 'Vg'];

  function fmtInt(n) {
    return Math.floor(n).toLocaleString('pt-BR');
  }

  N.fmt = function (a, opts) {
    opts = opts || {};
    if (!a || typeof a !== 'object' || typeof a.m !== 'number') a = N.fromF(a);
    if (a.m === 0) return '0';
    const e = a.e;

    if (e < 0) {
      // Valores entre 0 e 1: mostra decimais (0.1, 0.05, 0.001…). Abaixo de 0.001 vira "0".
      if (e < -3) return '0';
      return (a.m * Math.pow(10, e)).toFixed(-e);
    }
    if (e < 3) {
      if (e === 0) return (a.m >= 9.95 ? '10' : a.m.toFixed(1));
      if (e === 1) return String(Math.floor(a.m * 10));
      return String(Math.floor(a.m * 100));
    }

    if (e <= 63) {
      let idx = Math.floor(e / 3);
      let v = a.m * Math.pow(10, e - idx * 3);
      // Evita "999.9B" — sobe de faixa quando arredonda.
      if (v >= 999.95) {
        v /= 1000;
        idx++;
      }
      let d = v >= 100 ? 1 : v >= 10 ? 2 : 2;
      let s = v.toFixed(d).replace(/\.?0+$/, '');
      return opts.space ? s + ' ' + SUF[idx] : s + SUF[idx];
    }

    // Notação científica a partir de 1e66.
    if (e <= 999999) return a.m.toFixed(2) + 'e' + e;
    return a.m.toFixed(2) + '×10^' + fmtInt(e);
  };

  // Formata como a gente escreveria com espaços: "12.4 Qa"
  N.fmtNice = function (a) { return N.fmt(a, { space: true }); };

  /* ---------- serialização ---------- */
  N.ser = function (a) { return !a || a.m === 0 ? '0' : a.m.toPrecision(15) + 'e' + a.e; };
})();
/* ============================================================
   THIEGO DOPAMINA FARM — fx.js
   Partículas em canvas, números flutuantes, flash, shake,
   overlay de transformação/evolução. Sem nenhum asset.
   ============================================================ */
(function () {
  'use strict';
  const FX = window.TDF.Fx = {};

  let canvas, ctx, container, W = 0, H = 0, dpr = 1;
  let enabled = true;
  let animations = true;
  let particles = [];
  let floats = [];
  let toasts = [];
  let shakeUntil = 0, shakePower = 0;
  let flashColor = null, flashUntil = 0;
  let overlay = null;      // {type, start, end, resolve?}
  let paused = false;

  const MAX_PARTICLES = 600;

  FX.setAnimations = function (on) { animations = !!on; if (!animations) { particles = []; } };

  FX.init = function (containerEl) {
    container = containerEl;
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:90;';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => {
      paused = document.hidden;
      if (!paused && typeof lastT !== 'undefined') lastT = performance.now();
    });
  };

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas) { canvas.width = W * dpr; canvas.height = H * dpr; }
  }

  FX.setParticles = function (on) { enabled = !!on; if (!enabled) particles = []; };
  FX.isEnabled = function () { return enabled; };

  /* ---------- partículas ---------- */
  function spawnP(opt) {
    if (!enabled || paused) return;
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push({
      x: opt.x, y: opt.y,
      vx: (opt.vx || 0) + (Math.random() - 0.5) * (opt.spread || 0),
      vy: (opt.vy || 0) + (Math.random() - 0.5) * (opt.spread || 0) - (opt.up || 0),
      g: opt.gravity || 0,
      life: opt.life || 0.7,
      maxLife: opt.life || 0.7,
      size: opt.size || 3 + Math.random() * 3,
      color: opt.color || '#ffd700',
      shape: opt.shape || 'rect',
    });
  }

  FX.burst = function (x, y, opts) {
    if (!animations) return;
    opts = opts || {};
    const n = opts.count || 12;
    x = x == null ? W / 2 : x;
    y = y == null ? H / 2 : y;
    for (let i = 0; i < n; i++) {
      spawnP({
        x: x + (Math.random() - 0.5) * (opts.jitter || 10),
        y: y + (Math.random() - 0.5) * (opts.jitter || 10),
        vx: (Math.random() - 0.5) * (opts.speed || 180),
        vy: -Math.random() * (opts.speed || 180),
        spread: opts.spread, up: opts.up, gravity: opts.gravity,
        life: (opts.life || 0.7) * (0.6 + Math.random() * 0.6),
        size: opts.size, color: opts.color, shape: opts.shape,
      });
    }
  };

  /* ---------- números flutuantes (DOM, acessíveis) ---------- */
  FX.float = function (x, y, str, opts) {
    if (!animations) return;
    opts = opts || {};
    const el = document.createElement('div');
    el.className = 'fx-float' + (opts.cls ? ' ' + opts.cls : '');
    el.textContent = str;
    el.style.cssText =
      'position:fixed;z-index:95;pointer-events:none;' +
      'left:' + (x + (opts.dx || 0)) + 'px;top:' + (y + (opts.dy || 0)) + 'px;' +
      'font-size:' + (opts.size || 20) + 'px;color:' + (opts.color || '#fff') + ';' +
      'text-shadow:0 2px 8px rgba(0,0,0,.8);font-weight:800;' +
      'transform:translate(-50%,-50%);will-change:transform,opacity;';
    if (opts.rotate) el.style.transform += 'rotate(' + opts.rotate + 'deg)';
    if (opts.icon) { el.textContent = ''; el.innerHTML = '<img src="' + opts.icon + '" alt="" style="width:' + (opts.size + 12) + 'px;height:' + (opts.size + 12) + 'px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,.6))">'; }
    if (opts.crit) el.style.fontSize = (opts.size || 20) + 10 + 'px';
    document.body.appendChild(el);
    floatAnimate(el, opts.dy != null ? opts.dy : -80, opts.life || 1.1);
    return el;
  };

  function floatAnimate(el, destY, life) {
    const t0 = performance.now();
    (function frame(now) {
      const t = (now - t0) / 1000;
      const k = Math.min(1, t / life);
      const ease = 1 - Math.pow(1 - k, 3);
      el.style.top = (parseFloat(el.style.top) - (destY < 0 ? 0 : 0)) + 'px';
      el.style.opacity = String(1 - k * k);
      if (k >= 1) { el.remove(); return; }
      // anima via transform para não acumular top
      const startY = parseFloat(el.style.top);
      el.style.top = startY + 'px';
      el.style.transform = 'translate(-50%,' + (-ease * Math.abs(destY)) + 'px)';
      requestAnimationFrame(frame);
    })(t0);
  }

  /* ---------- toasts ---------- */
  const TOAST_ICONS = {
    achievement: '🏆', secret: '🔥', warn: '⚠️', info: '💡', error: '❌', gold: '✨',
  };
  FX.toast = function (msg, kind) {
    kind = kind || 'info';
    const el = document.createElement('div');
    el.className = 'fx-toast toast-' + kind;
    const icon = TOAST_ICONS[kind] || '';
    el.innerHTML = (icon ? '<span class="toast-icon">' + icon + '</span>' : '') + '<span class="toast-msg"></span>';
    el.querySelector('.toast-msg').textContent = msg;
    document.body.appendChild(el);
    toasts.push(el);
    if (toasts.length > 4) { const old = toasts.shift(); old && old.remove(); }
    setTimeout(() => { el.classList.add('toast-out'); setTimeout(() => el.remove(), 400); }, 3500);
  };

  /* ---------- shake / flash ---------- */
  FX.shake = function (power) {
    if (!animations) return;
    shakePower = power;
    shakeUntil = performance.now() + 250;
  };
  FX.flash = function (color, dur) {
    if (!animations) return;
    flashColor = color || '#ffffff';
    flashUntil = performance.now() + (dur || 300);
  };

  /* ---------- overlays ---------- */
  // tipo: 'transform' | 'evo' | 'prestige' | 'glitch'
  FX.overlay = function (type, img, label, sub) {
    if (!animations) return null;
    if (overlay) { clearTimeout(overlay._t); overlay.el && overlay.el.remove(); }
    const el = document.createElement('div');
    el.className = 'fx-overlay ov-' + type;
    if (img) {
      const im = document.createElement('img');
      im.src = img;
      im.className = 'ov-img';
      el.appendChild(im);
    }
    if (label) {
      const l = document.createElement('div');
      l.className = 'ov-label';
      l.innerHTML = '';
      const sp = document.createElement('span');
      sp.textContent = label;
      l.appendChild(sp);
      el.appendChild(l);
    }
    if (sub) {
      const su = document.createElement('div');
      su.className = 'ov-sub';
      su.textContent = sub;
      el.appendChild(su);
    }
    document.body.appendChild(el);
    overlay = el;
    return {
      el: el,
      done: function () { el.classList.add('ov-done'); setTimeout(() => el.remove(), 500); if (overlay === el) overlay = null; },
    };
  };

  /* ---------- loop ---------- */
  FX.update = function (dt) {
    if (enabled) {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += p.g * dt;
      }
    }
  };

  FX.draw = function () {
    if (paused || !ctx || !enabled) {
      if (flashColor && performance.now() < flashUntil) { /* ainda desenhar flash */ }
      else return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (enabled) {
      for (const p of particles) {
        const k = p.life / p.maxLife;
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
      }
      ctx.globalAlpha = 1;
    }

    const now = performance.now();
    if (shakeUntil > now) {
      const k = (shakeUntil - now) / 250;
      const dx = (Math.random() - 0.5) * shakePower * k * 2;
      const dy = (Math.random() - 0.5) * shakePower * k * 2;
      document.body.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    } else if (document.body.style.transform) {
      document.body.style.transform = '';
    }
    if (flashColor && flashUntil > now) {
      ctx.fillStyle = flashColor;
      ctx.globalAlpha = 0.25 * ((flashUntil - now) / 300);
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  };

  // atalhos usados pelo jogo
  FX.spawnFloat = FX.float;
  window.Fx = FX; // alias usado por game.js
})();
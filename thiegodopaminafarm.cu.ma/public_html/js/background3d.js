/* ============================================================
   THIEGO DOPAMINA FARM — background3d.js
   Fundo WebGL leve: campo de estrelas/partículas que evolui
   com o tier da evolução. Degrada com graça (canvas 2D ou nada)
   se WebGL não estiver disponível. Respeita perfMode e
   reducedMotion.
   ============================================================ */
(function () {
  'use strict';

  var BG = window.BG3D = {
    enabled: false,
    tier: 0,
  };

  var canvas = null;
  var gl = null;
  var particles = [];
  var rafId = 0;
  var lastT = 0;
  var running = false;

  var COUNT = 400;
  var COLORS = [
    [255, 215, 0],   // ouro (dopamina)
    [94, 255, 177],  // verde
    [94, 168, 255],  // azul
    [200, 107, 255], // roxo
    [255, 161, 94],  // laranja
    [255, 94, 108],  // vermelho
  ];

  function canUseWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  /* ---------- shaders ---------- */
  var VS = [
    'attribute vec2 aPos;',
    'attribute float aSize;',
    'attribute vec3 aColor;',
    'attribute float aAlpha;',
    'uniform vec2 uRes;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'void main() {',
    '  vec2 p = aPos / uRes * 2.0 - 1.0;',
    '  p.y = -p.y;',
    '  gl_Position = vec4(p, 0.0, 1.0);',
    '  gl_PointSize = aSize;',
    '  vColor = aColor;',
    '  vAlpha = aAlpha;',
    '}'
  ].join('\n');

  var FS = [
    'precision mediump float;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'void main() {',
    '  float d = length(gl_PointCoord - vec2(0.5));',
    '  if (d > 0.5) discard;',
    '  float a = (1.0 - d * 2.0) * vAlpha;',
    '  gl_FragColor = vec4(vColor, a);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function buildProgram() {
    var vs = compile(gl.VERTEX_SHADER, VS);
    var fs = compile(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return null;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    return prog;
  }

  /* ---------- init ---------- */
  BG.init = function () {
    if (running || !document.body) return;
    var st = window.Game && window.Game.state;
    var settings = (st && st.settings) || {};
    if (settings.perfMode || settings.reducedMotion) return;

    // detecta container do jogo
    var app = document.getElementById('app');
    if (!app) return;

    if (!canUseWebGL()) return; // degrada silencioso

    canvas = document.createElement('canvas');
    canvas.id = 'bg3d';
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;opacity:.55;';
    document.body.insertBefore(canvas, document.body.firstChild);
    // garante que o app fique acima
    if (app) app.style.position = 'relative';

    gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) { canvas.remove(); canvas = null; return; }

    var prog = buildProgram();
    if (!prog) { canvas.remove(); canvas = null; gl = null; return; }

    gl.useProgram(prog);
    BG.prog = prog;
    BG.enabled = true;

    resize();
    window.addEventListener('resize', resize);

    // inicializa partículas
    particles = [];
    for (var i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - 0.5) * 0.0004,
        vy: -0.0001 - Math.random() * 0.0003,
        size: 1 + Math.random() * 2.5,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        alpha: 0.3 + Math.random() * 0.6,
        tw: Math.random() * Math.PI * 2,
      });
    }

    // buffers
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    BG.buf = buf;

    var aPos = gl.getAttribLocation(prog, 'aPos');
    var aSize = gl.getAttribLocation(prog, 'aSize');
    var aColor = gl.getAttribLocation(prog, 'aColor');
    var aAlpha = gl.getAttribLocation(prog, 'aAlpha');
    BG.uRes = gl.getUniformLocation(prog, 'uRes');

    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aSize);
    gl.enableVertexAttribArray(aColor);
    gl.enableVertexAttribArray(aAlpha);

    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 28, 0);
    gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, 28, 8);
    gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 28, 12);
    gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, 28, 24);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    running = true;
    lastT = performance.now();
    rafId = requestAnimationFrame(loop);
  };

  function resize() {
    if (!canvas || !gl) return;
    var w = window.innerWidth, h = window.innerHeight;
    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
  }

  /* ---------- tier -> intensidade ---------- */
  function tierEnergy() {
    var st = window.Game && window.Game.state;
    var tier = (st && st.tier) || 0;
    BG.tier = tier;
    return Math.min(1, tier / 8);
  }

  function loop(now) {
    if (!running) return;
    var dt = Math.min(0.05, (now - lastT) / 1000) || 0.016;
    lastT = now;

    var energy = tierEnergy();
    var speedMul = 1 + energy * 3;

    var data = new Float32Array(particles.length * 7);
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.vx * speedMul * dt * 60;
      p.y += p.vy * speedMul * dt * 60;
      p.tw += dt * (1 + energy * 2);
      if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
      if (p.x < -0.05) p.x = 1.05;
      if (p.x > 1.05) p.x = -0.05;

      var o = i * 7;
      data[o] = p.x;
      data[o + 1] = p.y;
      data[o + 2] = p.size * (1 + energy * 1.5);
      data[o + 3] = p.color[0] / 255;
      data[o + 4] = p.color[1] / 255;
      data[o + 5] = p.color[2] / 255;
      data[o + 6] = p.alpha * (0.6 + 0.4 * Math.sin(p.tw)) * (0.7 + energy * 0.3);
    }

    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.uniform2f(BG.uRes, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, particles.length);

    rafId = requestAnimationFrame(loop);
  }

  /* ---------- desligar ---------- */
  BG.destroy = function () {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    if (canvas) { canvas.remove(); canvas = null; }
    gl = null;
    BG.enabled = false;
  };

  // Respeita mudanças de settings em runtime
  BG.sync = function () {
    var st = window.Game && window.Game.state;
    var settings = (st && st.settings) || {};
    if ((settings.perfMode || settings.reducedMotion) && running) BG.destroy();
    else if (!running && !settings.perfMode && !settings.reducedMotion) BG.init();
  };
})();
(function () {
  var canvas = document.getElementById('hero-canvas');
  if (!canvas || typeof canvas.getContext !== 'function') {
    return;
  }

  var ctx = canvas.getContext('2d');
  var reduceMotionQuery = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

  var DPR_CAP = 2;
  var PARTICLE_COUNT = 46;
  var GRID_STEP = 46;
  var LINK_DISTANCE = 130;

  var width = 0;
  var height = 0;
  var dpr = 1;
  var particles = [];
  var rafId = null;
  var colors = readColors();

  function prefersReducedMotion() {
    return !!(reduceMotionQuery && reduceMotionQuery.matches);
  }

  function readColors() {
    var styles = getComputedStyle(document.documentElement);
    var isDark = document.documentElement.dataset.theme === 'dark';
    return {
      isDark: isDark,
      grid: (styles.getPropertyValue('--color-border-subtle') || '#d8dee6').trim(),
      particle: (styles.getPropertyValue('--color-accent') || '#b91c1c').trim(),
      link: (styles.getPropertyValue('--color-accent-glow') || 'rgba(127, 29, 29, 0.18)').trim(),
      gridAlpha: isDark ? 0.16 : 0.22,
      particleAlpha: isDark ? 0.85 : 0.6,
    };
  }

  function makeParticles() {
    particles = [];
    for (var i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: 1.1 + Math.random() * 1.6,
      });
    }
  }

  function resize() {
    var rect = canvas.parentElement.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    makeParticles();
  }

  function drawGrid() {
    ctx.save();
    ctx.strokeStyle = colors.grid;
    ctx.globalAlpha = colors.gridAlpha;
    ctx.lineWidth = 1;
    for (var x = 0; x <= width; x += GRID_STEP) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (var y = 0; y <= height; y += GRID_STEP) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawParticles(animate) {
    ctx.save();
    ctx.fillStyle = colors.particle;
    ctx.strokeStyle = colors.link;

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (animate) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;
      }
    }

    for (var a = 0; a < particles.length; a++) {
      for (var b = a + 1; b < particles.length; b++) {
        var pa = particles[a];
        var pb = particles[b];
        var dx = pa.x - pb.x;
        var dy = pa.y - pb.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < LINK_DISTANCE) {
          ctx.globalAlpha = (1 - dist / LINK_DISTANCE) * 0.5;
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.stroke();
        }
      }
    }

    ctx.globalAlpha = colors.particleAlpha;
    for (var i2 = 0; i2 < particles.length; i2++) {
      var pt = particles[i2];
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function renderFrame(animate) {
    ctx.clearRect(0, 0, width, height);
    drawGrid();
    drawParticles(animate);
  }

  function loop() {
    renderFrame(true);
    rafId = window.requestAnimationFrame(loop);
  }

  function start() {
    stop();
    resize();
    if (prefersReducedMotion()) {
      renderFrame(false);
    } else {
      loop();
    }
  }

  function stop() {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function onThemeChange() {
    colors = readColors();
    if (prefersReducedMotion()) {
      renderFrame(false);
    }
  }

  window.addEventListener('resize', function () {
    resize();
    if (prefersReducedMotion()) {
      renderFrame(false);
    }
  });

  window.addEventListener('themechange', onThemeChange);

  if (reduceMotionQuery && reduceMotionQuery.addEventListener) {
    reduceMotionQuery.addEventListener('change', start);
  }

  window.addEventListener('pagehide', stop);

  start();
})();

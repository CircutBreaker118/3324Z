/**
 * Lift Mechanism showcase — an interactive 3D ring of textured photo panels
 * (drag to rotate) built from the build-progression images already present
 * in the page markup. Lazily loads Three.js from a CDN only once the
 * showcase scrolls into view, and never initializes at all when the visitor
 * prefers reduced motion (the static image grid stays visible instead).
 */
(function () {
  var THREE_VERSION = '0.160.0';
  var THREE_MODULE_URL = 'https://cdn.jsdelivr.net/npm/three@' + THREE_VERSION + '/build/three.module.js';
  var ORBIT_CONTROLS_URL =
    'https://cdn.jsdelivr.net/npm/three@' + THREE_VERSION + '/examples/jsm/controls/OrbitControls.js';

  var section = document.getElementById('lift-showcase');
  var viewer = document.getElementById('lift-showcase-viewer');
  var canvas = document.getElementById('lift-showcase-canvas');
  var loadingEl = document.getElementById('lift-showcase-loading');
  var captionEl = document.getElementById('lift-showcase-caption');
  var grid = document.getElementById('lift-showcase-grid');

  if (!section || !viewer || !canvas || !grid) {
    return;
  }

  function prefersReducedMotion() {
    return !!(
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  if (prefersReducedMotion()) {
    return;
  }

  var panelNodes = Array.prototype.slice.call(grid.querySelectorAll('.cad-showcase__panel'));
  var panelData = panelNodes.map(function (node) {
    var img = node.querySelector('img');
    var labelEl = node.querySelector('.cad-showcase__panel-label');
    var panelCaptionEl = node.querySelector('.cad-showcase__panel-caption');
    return {
      src: img ? img.getAttribute('src') : '',
      alt: img ? img.getAttribute('alt') : '',
      label: labelEl ? labelEl.textContent.trim() : '',
      caption: panelCaptionEl ? panelCaptionEl.textContent.trim() : '',
    };
  });

  if (!panelData.length) {
    return;
  }

  var started = false;
  var disposed = false;

  var state = {
    THREE: null,
    renderer: null,
    scene: null,
    camera: null,
    controls: null,
    rimLight: null,
    keyLight: null,
    fillLight: null,
    ambientLight: null,
    frameMaterials: [],
    ring: null,
    rafId: null,
    resizeObserver: null,
    idleTimer: null,
  };

  function readThemeColors() {
    var styles = getComputedStyle(document.documentElement);
    var isDark = document.documentElement.dataset.theme === 'dark';
    return {
      isDark: isDark,
      accent: (styles.getPropertyValue('--color-accent') || '#b91c1c').trim(),
      accentHover: (styles.getPropertyValue('--color-accent-hover') || '#7f1d1d').trim(),
      bgMuted: (styles.getPropertyValue('--color-bg-muted') || '#e4e8ee').trim(),
    };
  }

  function setEnhanced(isEnhanced) {
    section.classList.toggle('cad-showcase--enhanced', isEnhanced);
  }

  function setLoading(isLoading) {
    if (loadingEl) {
      loadingEl.hidden = !isLoading;
    }
  }

  function setActiveCaption(index) {
    if (!captionEl) return;
    var panel = panelData[index];
    if (!panel) return;
    captionEl.textContent = panel.label + ' — ' + panel.caption;
  }

  function buildScene(THREE, OrbitControls) {
    var renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    var scene = new THREE.Scene();

    var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.4, 7.2);

    var controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.rotateSpeed = 0.55;
    controls.minPolarAngle = Math.PI / 2 - 0.32;
    controls.maxPolarAngle = Math.PI / 2 + 0.14;
    controls.target.set(0, 0, 0);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.7;

    var ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambientLight);

    var keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
    keyLight.position.set(4, 5, 6);
    scene.add(keyLight);

    var fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-5, 2, -3);
    scene.add(fillLight);

    var rimLight = new THREE.PointLight(0xb91c1c, 6, 20, 2);
    rimLight.position.set(0, 1.5, -6);
    scene.add(rimLight);

    var ring = new THREE.Group();
    scene.add(ring);

    var frameMaterials = [];
    var radius = 3.15;
    var count = panelData.length;
    var textureLoader = new THREE.TextureLoader();
    var loaded = 0;

    panelData.forEach(function (panel, index) {
      var angle = (index / count) * Math.PI * 2;
      var isPortrait = index !== count - 1;
      var planeWidth = isPortrait ? 1.9 : 2.35;
      var planeHeight = isPortrait ? 2.53 : 2.18;

      var group = new THREE.Group();
      group.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
      group.rotation.y = angle;

      var frameGeometry = new THREE.BoxGeometry(planeWidth + 0.26, planeHeight + 0.26, 0.1);
      var frameMaterial = new THREE.MeshStandardMaterial({
        color: 0xb7bfca,
        metalness: 0.85,
        roughness: 0.35,
        emissive: new THREE.Color(0xb91c1c),
        emissiveIntensity: 0.28,
      });
      var frameMesh = new THREE.Mesh(frameGeometry, frameMaterial);
      frameMesh.position.z = -0.05;
      group.add(frameMesh);
      frameMaterials.push(frameMaterial);

      var planeGeometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
      var planeMaterial = new THREE.MeshBasicMaterial({ color: 0x1a222d });
      var planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
      planeMesh.position.z = 0.011;
      group.add(planeMesh);

      textureLoader.load(
        panel.src,
        function (texture) {
          texture.colorSpace = THREE.SRGBColorSpace;
          planeMaterial.map = texture;
          planeMaterial.color.set(0xffffff);
          planeMaterial.needsUpdate = true;
          loaded += 1;
          if (loaded >= count) {
            setLoading(false);
            setEnhanced(true);
          }
        },
        undefined,
        function () {
          loaded += 1;
          if (loaded >= count) {
            setLoading(false);
            setEnhanced(true);
          }
        }
      );

      group.userData.normal = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
      group.userData.index = index;
      ring.add(group);
    });

    return {
      renderer: renderer,
      scene: scene,
      camera: camera,
      controls: controls,
      ambientLight: ambientLight,
      keyLight: keyLight,
      fillLight: fillLight,
      rimLight: rimLight,
      ring: ring,
      frameMaterials: frameMaterials,
    };
  }

  function updateActivePanel() {
    if (!state.ring || !state.camera) return;
    var camDir = new state.THREE.Vector3();
    camDir.copy(state.camera.position).setY(0).normalize();

    var best = -Infinity;
    var bestIndex = 0;
    state.ring.children.forEach(function (group) {
      var dot = group.userData.normal.dot(camDir);
      if (dot > best) {
        best = dot;
        bestIndex = group.userData.index;
      }
    });
    setActiveCaption(bestIndex);
  }

  function resize() {
    if (!state.renderer || !state.camera || disposed) return;
    var rect = viewer.getBoundingClientRect();
    var width = Math.max(1, Math.round(rect.width));
    var height = Math.max(1, Math.round(rect.height));
    state.renderer.setSize(width, height, false);
    state.camera.aspect = width / height;
    state.camera.updateProjectionMatrix();
  }

  function animate() {
    if (disposed) return;
    state.controls.update();
    updateActivePanel();
    state.renderer.render(state.scene, state.camera);
    state.rafId = window.requestAnimationFrame(animate);
  }

  function applyThemeColors() {
    if (!state.THREE) return;
    var colors = readThemeColors();
    var accentColor = new state.THREE.Color(colors.accent);
    state.rimLight.color = accentColor;
    state.rimLight.intensity = colors.isDark ? 7 : 4.5;
    state.ambientLight.intensity = colors.isDark ? 0.42 : 0.62;
    state.frameMaterials.forEach(function (mat) {
      mat.emissive = accentColor;
      mat.emissiveIntensity = colors.isDark ? 0.36 : 0.22;
    });
  }

  function onThemeChange() {
    applyThemeColors();
  }

  function pauseAutoRotate() {
    if (!state.controls) return;
    state.controls.autoRotate = false;
    window.clearTimeout(state.idleTimer);
    state.idleTimer = window.setTimeout(function () {
      if (state.controls) state.controls.autoRotate = true;
    }, 2400);
  }

  function cleanup() {
    if (disposed) return;
    disposed = true;

    if (state.rafId !== null) {
      window.cancelAnimationFrame(state.rafId);
    }
    if (state.resizeObserver) {
      state.resizeObserver.disconnect();
    }
    window.removeEventListener('themechange', onThemeChange);

    if (state.controls) state.controls.dispose();

    if (state.ring) {
      state.ring.traverse(function (obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      });
    }

    if (state.renderer) {
      state.renderer.dispose();
      state.renderer.forceContextLoss();
    }
  }

  function startShowcase() {
    if (started || disposed) return;
    started = true;

    Promise.all([import(THREE_MODULE_URL), import(ORBIT_CONTROLS_URL)])
      .then(function (mods) {
        if (disposed) return;
        var THREE = mods[0];
        var OrbitControls = mods[1].OrbitControls;
        state.THREE = THREE;

        var scene = buildScene(THREE, OrbitControls);
        Object.assign(state, scene);

        applyThemeColors();
        resize();
        animate();

        state.controls.addEventListener('start', pauseAutoRotate);

        if (typeof ResizeObserver !== 'undefined') {
          state.resizeObserver = new ResizeObserver(resize);
          state.resizeObserver.observe(viewer);
        } else {
          window.addEventListener('resize', resize);
        }

        window.addEventListener('themechange', onThemeChange);
        window.addEventListener('pagehide', cleanup);
      })
      .catch(function () {
        setLoading(false);
        setEnhanced(false);
      });
  }

  if (typeof IntersectionObserver !== 'undefined') {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            observer.disconnect();
            startShowcase();
          }
        });
      },
      { rootMargin: '160px 0px' }
    );
    observer.observe(section);
  } else {
    startShowcase();
  }
})();

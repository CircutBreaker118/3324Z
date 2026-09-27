/**
 * DUM-E lift mechanism showcase — a real interactive glTF/GLB CAD model
 * viewer built on Three.js. Lazily loads Three.js, GLTFLoader, and
 * OrbitControls from a CDN only once the showcase scrolls into view, then
 * streams in the actual robot.glb model (drag to orbit, scroll/pinch to
 * zoom). Falls back to a static preview image when WebGL is unavailable,
 * the visitor prefers reduced motion, or the model fails to load.
 */
(function () {
  var THREE_VERSION = '0.160.0';
  var THREE_MODULE_URL = 'https://cdn.jsdelivr.net/npm/three@' + THREE_VERSION + '/build/three.module.js';
  var ADDONS_BASE = 'https://cdn.jsdelivr.net/npm/three@' + THREE_VERSION + '/examples/jsm/';
  var GLTF_LOADER_URL = ADDONS_BASE + 'loaders/GLTFLoader.js';
  var DRACO_LOADER_URL = ADDONS_BASE + 'loaders/DRACOLoader.js';
  var DRACO_DECODER_PATH = ADDONS_BASE + 'libs/draco/';
  var ORBIT_CONTROLS_URL = ADDONS_BASE + 'controls/OrbitControls.js';
  var ROOM_ENVIRONMENT_URL = ADDONS_BASE + 'environments/RoomEnvironment.js';

  var section = document.getElementById('lift-showcase');
  var viewer = document.getElementById('lift-showcase-viewer');
  var canvas = document.getElementById('lift-showcase-canvas');
  var loadingEl = document.getElementById('lift-showcase-loading');
  var loadingTextEl = document.getElementById('lift-showcase-loading-text');
  var fallbackEl = document.getElementById('lift-showcase-fallback');

  if (!section || !viewer || !canvas || !fallbackEl) {
    return;
  }

  var modelSrc = section.getAttribute('data-model-src');

  function prefersReducedMotion() {
    return !!(
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function supportsWebGL() {
    try {
      var testCanvas = document.createElement('canvas');
      return !!(
        window.WebGLRenderingContext &&
        (testCanvas.getContext('webgl2') || testCanvas.getContext('webgl'))
      );
    } catch (e) {
      return false;
    }
  }

  if (!modelSrc || prefersReducedMotion() || !supportsWebGL()) {
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
    model: null,
    envRenderTarget: null,
    dracoLoader: null,
    rafId: null,
    resizeObserver: null,
    idleTimer: null,
    liftMesh: null,
    liftAxis: null,
    liftAnimStart: 0,
  };

  // Full up-and-back-down cycle length; a plain sine wave naturally gives
  // an ease-in-out swing with a ~5s "up" half and a ~5s "down" half.
  var LIFT_CYCLE_SECONDS = 10;
  var LIFT_ROTATION_AMPLITUDE = Math.PI / 20; // ~9° each way, ~18° total swing

  function readThemeColors() {
    var styles = getComputedStyle(document.documentElement);
    var isDark = document.documentElement.dataset.theme === 'dark';
    return {
      isDark: isDark,
      accent: (styles.getPropertyValue('--color-accent') || '#b91c1c').trim(),
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

  function setLoadingText(text) {
    if (loadingTextEl) {
      loadingTextEl.textContent = text;
    }
  }

  function showFallback(message) {
    setLoading(false);
    setEnhanced(false);
    if (message && fallbackEl) {
      var textEl = document.getElementById('lift-showcase-fallback-text');
      if (textEl) textEl.textContent = message;
    }
  }

  function buildRenderer(THREE) {
    var renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    return renderer;
  }

  function buildLights(THREE, scene) {
    var ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    var keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(4, 6, 6);
    scene.add(keyLight);

    var fillLight = new THREE.DirectionalLight(0xffffff, 0.9);
    fillLight.position.set(-5, 2, -3);
    scene.add(fillLight);

    var rimLight = new THREE.PointLight(0xb91c1c, 8, 24, 2);
    rimLight.position.set(0, 2, -6);
    scene.add(rimLight);

    return {
      ambientLight: ambientLight,
      keyLight: keyLight,
      fillLight: fillLight,
      rimLight: rimLight,
    };
  }

  /**
   * Robust, outlier-resistant bounds for auto-framing. Real CAD/scan
   * exports often include a handful of far-flung vertices (a thin wire,
   * an antenna, a stray reference point) whose sheer extent would blow up
   * a naive Box3.setFromObject() bounding box and make the whole model
   * frame out as a speck. We sample the mesh's position attribute (in
   * world space) and use the 2nd/98th percentile per axis instead of the
   * true min/max, so the default view frames the visually-dominant body
   * of the model while thin outliers are simply allowed to extend a bit
   * past the edges (the far clip plane still uses the true bounding box,
   * so nothing gets culled — the user can always scroll/zoom out to see
   * the full model).
   */
  function computeRobustBounds(THREE, object) {
    // The model may have been split into separate lift/base meshes (see
    // splitLiftFromModel), so gather samples across *all* meshes rather
    // than just the first one found.
    var meshes = [];
    object.traverse(function (node) {
      if (node.isMesh && node.geometry && node.geometry.attributes.position) {
        meshes.push(node);
      }
    });
    if (!meshes.length) return null;

    // Use one global stride (based on the combined vertex count across
    // all meshes) rather than a per-mesh budget, so a small mesh (like
    // the sparse lift arm) contributes samples in proportion to its
    // actual share of the model's total geometry — exactly as if this
    // were still the single original fused mesh. Otherwise a tiny mesh
    // would get disproportionately over-sampled and skew the percentile
    // framing box.
    var maxSamples = 60000;
    var totalCount = 0;
    meshes.forEach(function (mesh) {
      totalCount += mesh.geometry.attributes.position.count;
    });
    var stride = Math.max(1, Math.floor(totalCount / maxSamples));

    var xs = [];
    var ys = [];
    var zs = [];
    var v = new THREE.Vector3();

    meshes.forEach(function (mesh) {
      var positionAttr = mesh.geometry.attributes.position;
      var count = positionAttr.count;
      mesh.updateWorldMatrix(true, false);

      for (var i = 0; i < count; i += stride) {
        v.set(positionAttr.getX(i), positionAttr.getY(i), positionAttr.getZ(i));
        v.applyMatrix4(mesh.matrixWorld);
        xs.push(v.x);
        ys.push(v.y);
        zs.push(v.z);
      }
    });

    if (!xs.length) return null;

    xs.sort(function (a, b) { return a - b; });
    ys.sort(function (a, b) { return a - b; });
    zs.sort(function (a, b) { return a - b; });

    function percentile(arr, p) {
      var idx = Math.min(arr.length - 1, Math.max(0, Math.round(p * (arr.length - 1))));
      return arr[idx];
    }

    var low = 0.02;
    var high = 0.98;
    var min = new THREE.Vector3(percentile(xs, low), percentile(ys, low), percentile(zs, low));
    var max = new THREE.Vector3(percentile(xs, high), percentile(ys, high), percentile(zs, high));
    return new THREE.Box3(min, max);
  }

  function frameCameraToObject(THREE, camera, controls, object) {
    var fullBox = new THREE.Box3().setFromObject(object);
    var robustBox = computeRobustBounds(THREE, object);
    var frameBox = robustBox && !robustBox.isEmpty() ? robustBox : fullBox;

    var size = frameBox.getSize(new THREE.Vector3());
    var center = frameBox.getCenter(new THREE.Vector3());

    object.position.sub(center);

    var maxDimension = Math.max(size.x, size.y, size.z) || 1;
    var fovRadians = (camera.fov * Math.PI) / 180;
    var distance = (maxDimension / 2) / Math.tan(fovRadians / 2);
    distance *= 1.7;

    // The far clip plane and max zoom-out must still cover the *true*
    // bounding box (including trimmed outliers) so nothing gets culled
    // when the model rotates or the visitor zooms out.
    var fullRadius = fullBox.getSize(new THREE.Vector3()).length() / 2 + center.length();
    var safeFar = Math.max(distance * 20, fullRadius * 4);

    camera.near = Math.max(distance / 100, 0.01);
    camera.far = safeFar;
    camera.position.set(distance * 0.55, distance * 0.42, distance * 0.75);
    camera.updateProjectionMatrix();

    controls.target.set(0, 0, 0);
    controls.minDistance = distance * 0.35;
    controls.maxDistance = Math.max(distance * 2.4, fullRadius * 2.2);
    controls.update();
  }

  /**
   * The robot.glb export is a single fused mesh (no separate lift/base
   * nodes — confirmed by inspecting the glTF JSON chunk directly), so
   * there's no node to animate. To make the lift arm move without
   * touching any CAD geometry, we split that one mesh's *existing*
   * triangles into two groups by a height (local Y) threshold — no
   * vertex is moved, mirrored, or edited, we only partition the
   * unmodified triangle list into "lift" and "base" draw sets.
   *
   * Sampling the vertex distribution (see internal implementation notes)
   * shows a large, completely empty gap in local Y between the dense
   * drivetrain/chassis cluster (~99.5% of vertices) and a sparse tall
   * structure above it (the lift tower/arm, matching the physical
   * four-bar lift visible in the build-progress photos). Because that
   * gap contains zero vertices, splitting on any Y value inside it is
   * guaranteed to never cut a triangle in half.
   */
  function findLocalYGap(positionAttr, count) {
    var maxSamples = 60000;
    var stride = Math.max(1, Math.floor(count / maxSamples));
    var ys = [];
    for (var i = 0; i < count; i += stride) {
      ys.push(positionAttr.getY(i));
    }
    ys.sort(function (a, b) { return a - b; });

    // Ignore the extreme 0.1% at each end so a single far-flung outlier
    // vertex can't masquerade as "the gap".
    var loCut = Math.floor(ys.length * 0.001);
    var hiCut = Math.ceil(ys.length * 0.999);

    var maxGap = 0;
    var gapStart = 0;
    var gapEnd = 0;
    for (var j = loCut; j < hiCut - 1; j++) {
      var gap = ys[j + 1] - ys[j];
      if (gap > maxGap) {
        maxGap = gap;
        gapStart = ys[j];
        gapEnd = ys[j + 1];
      }
    }

    var totalRange = ys[hiCut - 1] - ys[loCut];
    // Require the gap to be a substantial fraction of the whole range —
    // otherwise this mesh doesn't have a clean lift/base separation and
    // we should leave it alone rather than slice through real geometry.
    if (!totalRange || maxGap < totalRange * 0.2) {
      return null;
    }

    return { splitY: (gapStart + gapEnd) / 2, gapStart: gapStart, gapEnd: gapEnd };
  }

  function splitLiftFromModel(THREE, model) {
    var sourceMesh = null;
    model.traverse(function (node) {
      if (!sourceMesh && node.isMesh && node.geometry && node.geometry.attributes.position) {
        sourceMesh = node;
      }
    });
    if (!sourceMesh) return null;

    var geometry = sourceMesh.geometry;
    var positionAttr = geometry.attributes.position;
    var normalAttr = geometry.attributes.normal || null;
    var colorAttr = geometry.attributes.color || null;
    var index = geometry.index;
    var count = positionAttr.count;

    var gap = findLocalYGap(positionAttr, count);
    if (!gap || !index) return null;

    var splitY = gap.splitY;

    // Pass 1: classify every vertex and track the lift group's Y extent.
    var isLift = new Uint8Array(count);
    var liftCount = 0;
    var baseCount = 0;
    var liftMinY = Infinity;
    var liftMaxY = -Infinity;
    for (var i = 0; i < count; i++) {
      var y = positionAttr.getY(i);
      if (y > splitY) {
        isLift[i] = 1;
        liftCount++;
        if (y < liftMinY) liftMinY = y;
        if (y > liftMaxY) liftMaxY = y;
      } else {
        baseCount++;
      }
    }
    if (!liftCount || !baseCount) return null;

    // Pass 2: the pivot is the centroid of the lift group's bottom-most
    // band — i.e. roughly where the tower/arm meets the chassis, the
    // real hinge/four-bar attachment point.
    var pivotBandMaxY = liftMinY + (liftMaxY - liftMinY) * 0.15;
    var pivotSumX = 0;
    var pivotSumY = 0;
    var pivotSumZ = 0;
    var pivotCount = 0;
    for (var p = 0; p < count; p++) {
      if (!isLift[p]) continue;
      var py = positionAttr.getY(p);
      if (py <= pivotBandMaxY) {
        pivotSumX += positionAttr.getX(p);
        pivotSumY += py;
        pivotSumZ += positionAttr.getZ(p);
        pivotCount++;
      }
    }
    if (!pivotCount) return null;
    var pivot = new THREE.Vector3(pivotSumX / pivotCount, pivotSumY / pivotCount, pivotSumZ / pivotCount);

    // Pass 3: build remap tables + new attribute arrays. Lift vertices
    // are stored relative to the pivot so rotating the new mesh's
    // `.position`/`.rotation` swings it around that pivot point.
    var liftRemap = new Int32Array(count).fill(-1);
    var baseRemap = new Int32Array(count).fill(-1);
    var itemSize = positionAttr.itemSize;
    var normalItemSize = normalAttr ? normalAttr.itemSize : 0;
    var colorItemSize = colorAttr ? colorAttr.itemSize : 0;

    var liftPositions = new Float32Array(liftCount * itemSize);
    var basePositions = new Float32Array(baseCount * itemSize);
    var liftNormals = normalAttr ? new Float32Array(liftCount * normalItemSize) : null;
    var baseNormals = normalAttr ? new Float32Array(baseCount * normalItemSize) : null;
    var liftColors = colorAttr ? new Float32Array(liftCount * colorItemSize) : null;
    var baseColors = colorAttr ? new Float32Array(baseCount * colorItemSize) : null;

    var liftCursor = 0;
    var baseCursor = 0;
    for (var k = 0; k < count; k++) {
      if (isLift[k]) {
        liftRemap[k] = liftCursor;
        liftPositions[liftCursor * 3] = positionAttr.getX(k) - pivot.x;
        liftPositions[liftCursor * 3 + 1] = positionAttr.getY(k) - pivot.y;
        liftPositions[liftCursor * 3 + 2] = positionAttr.getZ(k) - pivot.z;
        if (normalAttr) {
          liftNormals[liftCursor * 3] = normalAttr.getX(k);
          liftNormals[liftCursor * 3 + 1] = normalAttr.getY(k);
          liftNormals[liftCursor * 3 + 2] = normalAttr.getZ(k);
        }
        if (colorAttr) {
          liftColors[liftCursor * colorItemSize] = colorAttr.getX(k);
          liftColors[liftCursor * colorItemSize + 1] = colorAttr.getY(k);
          liftColors[liftCursor * colorItemSize + 2] = colorAttr.getZ(k);
          if (colorItemSize === 4) liftColors[liftCursor * colorItemSize + 3] = colorAttr.getW(k);
        }
        liftCursor++;
      } else {
        baseRemap[k] = baseCursor;
        basePositions[baseCursor * 3] = positionAttr.getX(k);
        basePositions[baseCursor * 3 + 1] = positionAttr.getY(k);
        basePositions[baseCursor * 3 + 2] = positionAttr.getZ(k);
        if (normalAttr) {
          baseNormals[baseCursor * 3] = normalAttr.getX(k);
          baseNormals[baseCursor * 3 + 1] = normalAttr.getY(k);
          baseNormals[baseCursor * 3 + 2] = normalAttr.getZ(k);
        }
        if (colorAttr) {
          baseColors[baseCursor * colorItemSize] = colorAttr.getX(k);
          baseColors[baseCursor * colorItemSize + 1] = colorAttr.getY(k);
          baseColors[baseCursor * colorItemSize + 2] = colorAttr.getZ(k);
          if (colorItemSize === 4) baseColors[baseCursor * colorItemSize + 3] = colorAttr.getW(k);
        }
        baseCursor++;
      }
    }

    // Pass 4: split the index/triangle list. The Y-gap guarantees every
    // triangle's three vertices land in the same group, so we only need
    // to check one vertex per triangle.
    var indexArray = index.array;
    var triCount = indexArray.length / 3;
    var liftTriCount = 0;
    for (var t = 0; t < triCount; t++) {
      if (isLift[indexArray[t * 3]]) liftTriCount++;
    }
    var baseTriCount = triCount - liftTriCount;

    var IndexArrayType = count > 65535 ? Uint32Array : Uint16Array;
    var liftIndices = new IndexArrayType(liftTriCount * 3);
    var baseIndices = new IndexArrayType(baseTriCount * 3);
    var liftIdxCursor = 0;
    var baseIdxCursor = 0;
    for (var t2 = 0; t2 < triCount; t2++) {
      var a = indexArray[t2 * 3];
      var b = indexArray[t2 * 3 + 1];
      var c = indexArray[t2 * 3 + 2];
      if (isLift[a]) {
        liftIndices[liftIdxCursor++] = liftRemap[a];
        liftIndices[liftIdxCursor++] = liftRemap[b];
        liftIndices[liftIdxCursor++] = liftRemap[c];
      } else {
        baseIndices[baseIdxCursor++] = baseRemap[a];
        baseIndices[baseIdxCursor++] = baseRemap[b];
        baseIndices[baseIdxCursor++] = baseRemap[c];
      }
    }

    var liftGeometry = new THREE.BufferGeometry();
    liftGeometry.setAttribute('position', new THREE.BufferAttribute(liftPositions, itemSize));
    if (liftNormals) liftGeometry.setAttribute('normal', new THREE.BufferAttribute(liftNormals, normalItemSize));
    if (liftColors) liftGeometry.setAttribute('color', new THREE.BufferAttribute(liftColors, colorItemSize));
    liftGeometry.setIndex(new THREE.BufferAttribute(liftIndices, 1));

    var baseGeometry = new THREE.BufferGeometry();
    baseGeometry.setAttribute('position', new THREE.BufferAttribute(basePositions, itemSize));
    if (baseNormals) baseGeometry.setAttribute('normal', new THREE.BufferAttribute(baseNormals, normalItemSize));
    if (baseColors) baseGeometry.setAttribute('color', new THREE.BufferAttribute(baseColors, colorItemSize));
    baseGeometry.setIndex(new THREE.BufferAttribute(baseIndices, 1));

    var liftMesh = new THREE.Mesh(liftGeometry, sourceMesh.material);
    var baseMesh = new THREE.Mesh(baseGeometry, sourceMesh.material);
    liftMesh.castShadow = baseMesh.castShadow = false;
    liftMesh.receiveShadow = baseMesh.receiveShadow = false;

    // Re-parent both new meshes exactly where the original single mesh
    // sat, matching its local transform, then remove the original.
    liftMesh.position.copy(sourceMesh.position).add(pivot);
    liftMesh.quaternion.copy(sourceMesh.quaternion);
    liftMesh.scale.copy(sourceMesh.scale);
    baseMesh.position.copy(sourceMesh.position);
    baseMesh.quaternion.copy(sourceMesh.quaternion);
    baseMesh.scale.copy(sourceMesh.scale);

    var parent = sourceMesh.parent;
    parent.add(liftMesh);
    parent.add(baseMesh);
    parent.remove(sourceMesh);

    sourceMesh.geometry.dispose();

    // Rotating around local Z swings the tower through the same XY lean
    // plane the physical four-bar lift moves in (confirmed by comparing
    // the lift vertex group's bottom-to-top centroid drift against the
    // build-progress photos, which show a pivoting arm — not a straight
    // vertical slide).
    return { liftMesh: liftMesh, baseMesh: baseMesh, pivot: pivot, axis: 'z' };
  }

  function loadModel(THREE, GLTFLoader, DRACOLoader, scene, camera, controls) {
    var dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    dracoLoader.setDecoderConfig({ type: 'wasm' });
    state.dracoLoader = dracoLoader;

    var loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    setLoading(true);
    setLoadingText('Loading 3D model…');

    loader.load(
      modelSrc,
      function (gltf) {
        if (disposed) return;

        var model = gltf.scene;
        model.traverse(function (node) {
          if (node.isMesh) {
            node.castShadow = false;
            node.receiveShadow = false;
            if (node.material) {
              node.material.envMapIntensity = 1;
            }
          }
        });

        scene.add(model);
        state.model = model;

        var lift = splitLiftFromModel(THREE, model);
        if (lift) {
          state.liftMesh = lift.liftMesh;
          state.liftAxis = lift.axis;
          state.liftAnimStart = performance.now();
        }

        setLoading(false);
        setEnhanced(true);
        resize();
        frameCameraToObject(THREE, camera, controls, model);
      },
      function (progress) {
        if (disposed || !progress || !progress.total) {
          setLoadingText('Loading 3D model…');
          return;
        }
        var percent = Math.min(100, Math.round((progress.loaded / progress.total) * 100));
        setLoadingText('Loading 3D model… ' + percent + '%');
      },
      function () {
        showFallback('The 3D model failed to load — here\u2019s a static preview of the CAD assembly instead.');
      }
    );
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

    // Independent of drag-to-rotate: continuously swing the lift arm up
    // and down around its pivot. Skipped under prefers-reduced-motion so
    // the model stays static (drag-rotate via OrbitControls still works
    // either way, since that update() call above is unconditional).
    if (state.liftMesh && !prefersReducedMotion()) {
      var elapsedSeconds = (performance.now() - state.liftAnimStart) / 1000;
      var phase = (elapsedSeconds / LIFT_CYCLE_SECONDS) * Math.PI * 2;
      var offset = Math.sin(phase) * LIFT_ROTATION_AMPLITUDE;
      state.liftMesh.rotation[state.liftAxis] = offset;
    }

    state.renderer.render(state.scene, state.camera);
    state.rafId = window.requestAnimationFrame(animate);
  }

  function applyThemeColors() {
    if (!state.THREE || !state.rimLight) return;
    var colors = readThemeColors();
    var accentColor = new state.THREE.Color(colors.accent);
    state.rimLight.color = accentColor;
    state.rimLight.intensity = colors.isDark ? 10 : 6;
    state.ambientLight.intensity = colors.isDark ? 0.5 : 0.7;
    if (state.scene) {
      state.scene.background = null;
    }
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
    }, 2800);
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
    window.clearTimeout(state.idleTimer);
    window.removeEventListener('themechange', onThemeChange);

    if (state.controls) state.controls.dispose();

    if (state.model) {
      state.model.traverse(function (obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          var materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.forEach(function (mat) {
            for (var key in mat) {
              if (mat[key] && mat[key].isTexture) {
                mat[key].dispose();
              }
            }
            mat.dispose();
          });
        }
      });
    }

    if (state.envRenderTarget) {
      state.envRenderTarget.dispose();
    }

    if (state.dracoLoader) {
      state.dracoLoader.dispose();
    }

    if (state.renderer) {
      state.renderer.dispose();
      state.renderer.forceContextLoss();
    }
  }

  function startShowcase() {
    if (started || disposed) return;
    started = true;

    setLoading(true);
    setLoadingText('Preparing viewer…');

    Promise.all([
      import(THREE_MODULE_URL),
      import(GLTF_LOADER_URL),
      import(DRACO_LOADER_URL),
      import(ORBIT_CONTROLS_URL),
      import(ROOM_ENVIRONMENT_URL),
    ])
      .then(function (mods) {
        if (disposed) return;
        var THREE = mods[0];
        var GLTFLoader = mods[1].GLTFLoader;
        var DRACOLoader = mods[2].DRACOLoader;
        var OrbitControls = mods[3].OrbitControls;
        var RoomEnvironment = mods[4].RoomEnvironment;
        state.THREE = THREE;

        var renderer = buildRenderer(THREE);
        var scene = new THREE.Scene();

        var pmremGenerator = new THREE.PMREMGenerator(renderer);
        var envRenderTarget = pmremGenerator.fromScene(new RoomEnvironment(renderer), 0.04);
        scene.environment = envRenderTarget.texture;
        pmremGenerator.dispose();
        state.envRenderTarget = envRenderTarget;

        var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
        camera.position.set(3, 2.2, 4.2);

        var controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enablePan = false;
        controls.screenSpacePanning = false;
        controls.enableZoom = true;
        controls.rotateSpeed = 0.55;
        controls.zoomSpeed = 0.7;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.6;
        // Full 360° horizontal spin, but clamp vertical tilt so the camera
        // can never flip upside-down or peek from directly above/below —
        // there's no roll/Z-axis tilt in OrbitControls by default, so this
        // keeps drag strictly to a Y-axis spin + limited X-axis (polar) tilt.
        controls.minAzimuthAngle = -Infinity;
        controls.maxAzimuthAngle = Infinity;
        controls.minPolarAngle = THREE.MathUtils.degToRad(35);
        controls.maxPolarAngle = THREE.MathUtils.degToRad(130);

        var lights = buildLights(THREE, scene);

        Object.assign(state, {
          renderer: renderer,
          scene: scene,
          camera: camera,
          controls: controls,
        }, lights);

        applyThemeColors();
        resize();
        animate();

        loadModel(THREE, GLTFLoader, DRACOLoader, scene, camera, controls);

        controls.addEventListener('start', pauseAutoRotate);

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
        showFallback();
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

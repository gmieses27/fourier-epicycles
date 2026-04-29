/**
 * app.js — Application controller
 *
 * Wires together: UI controls → Curves → DFT → Renderer → AnimationLoop
 *
 * Architecture:
 *   State is a single plain object mutated by event handlers.
 *   requestAnimationFrame drives the render loop.
 *   The DFT is recomputed only when the input signal changes.
 */

(function () {
  'use strict';

  // ── ELEMENTS ────────────────────────────────────────────────────────────

  const mainCanvas     = document.getElementById('main-canvas');
  const specCanvas     = document.getElementById('spectrum-canvas');
  const canvasHint     = document.getElementById('canvas-hint');
  const specSubtitle   = document.getElementById('spectrum-subtitle');

  const presetPanel    = document.getElementById('preset-panel');
  const drawPanel      = document.getElementById('draw-panel');
  const presetSelect   = document.getElementById('preset-select');
  const harmonicSlider = document.getElementById('harmonic-count');
  const speedSlider    = document.getElementById('speed-range');
  const lblHarmonics   = document.getElementById('lbl-harmonics');
  const toggleCircles  = document.getElementById('toggle-circles');
  const toggleColors   = document.getElementById('toggle-colors');
  const toggleFade     = document.getElementById('toggle-fade');
  const btnAnalyze     = document.getElementById('btn-analyze');
  const btnClearDraw   = document.getElementById('btn-clear-draw');
  const convN          = document.getElementById('lbl-conv-n');
  const btnConvPrev    = document.getElementById('btn-conv-prev');
  const btnConvNext    = document.getElementById('btn-conv-next');
  const convStepSpans  = document.querySelectorAll('.conv-steps span');
  const modeTabs       = document.querySelectorAll('.mode-tab');

  const mainCtx = mainCanvas.getContext('2d');
  const specCtx = specCanvas.getContext('2d');

  // ── STATE ───────────────────────────────────────────────────────────────

  const CONV_STEPS = [1, 2, 4, 8, 16, 32, 64, 128, 256];

  const state = {
    mode: 'preset',       // 'preset' | 'draw'
    dft: null,            // sorted DFT bins
    trail: [],            // traced tip positions [{x,y}]
    t: 0,                 // animation time [0,1)
    playing: false,
    nHarmonics: 64,
    speed: speedFromSlider(15),   // matches the slider default of 15
    showCircles: true,
    colorCircles: true,
    fadeTrail: false,
    drawnPoints: [],      // user draw mode
    isDrawing: false,
    convStepIdx: 6,       // index into CONV_STEPS (default 64)
    convMode: false       // true when convergence explorer is active
  };

  // ── SPEED MAPPING ───────────────────────────────────────────────────────
  // Quadratic mapping so the low end of the slider is much slower.
  // Slider 1..100 → speed 0.002..20
  //   value=1  → 0.002  (very slow — one full cycle takes ~4 min at 60fps)
  //   value=15 → 0.45   (comfortable default)
  //   value=50 → 5      (fast)
  //   value=100→ 20     (maximum)
  function speedFromSlider(v) {
    return Math.pow(v / 100, 2) * 20;
  }

  // ── CANVAS RESIZE ───────────────────────────────────────────────────────

  function resizeCanvases() {
    const wrapper = mainCanvas.parentElement;
    const W = wrapper.clientWidth;
    const H = wrapper.clientHeight;
    mainCanvas.width  = W;
    mainCanvas.height = H;

    const specW = specCanvas.parentElement.clientWidth;
    const specH = specCanvas.parentElement.clientHeight - 24;  // minus header
    specCanvas.width  = specW;
    specCanvas.height = specH;
  }

  window.addEventListener('resize', () => {
    resizeCanvases();
    if (state.playing) {
      state.trail = [];
      state.t     = 0;
    }
  });

  // ── DFT ANALYSIS ─────────────────────────────────────────────────────────

  function analyze(pts) {
    const N    = Math.min(pts.length, 512);
    const data = pts.slice(0, N);

    state.dft     = DFT.compute(data);
    state.trail   = [];
    state.t       = 0;
    state.playing = true;
    canvasHint.classList.add('hidden');

    // Update spectrum subtitle
    specSubtitle.textContent = `${N} samples · ${state.dft.length} bins · top ${state.nHarmonics} active`;
  }

  function analyzePreset() {
    const name = presetSelect.value;
    const pts  = Curves.sample(name, 512);
    // Center the points
    let cx = 0, cy = 0;
    pts.forEach(p => { cx += p.x; cy += p.y; });
    cx /= pts.length; cy /= pts.length;
    pts.forEach(p => { p.x -= cx; p.y -= cy; });

    // Scale to fit ~80% of the shorter canvas dimension
    const dim  = Math.min(mainCanvas.width, mainCanvas.height) * 0.4;
    let maxR   = 0;
    pts.forEach(p => { maxR = Math.max(maxR, Math.sqrt(p.x*p.x + p.y*p.y)); });
    if (maxR > 0) pts.forEach(p => { p.x *= dim / maxR; p.y *= dim / maxR; });

    analyze(pts);
  }

  function analyzeDrawn() {
    if (state.drawnPoints.length < 4) return;
    const resampled = Curves.resamplePath(state.drawnPoints, 512);
    // Center
    let cx = 0, cy = 0;
    resampled.forEach(p => { cx += p.x; cy += p.y; });
    cx /= resampled.length; cy /= resampled.length;
    resampled.forEach(p => { p.x -= cx; p.y -= cy; });
    analyze(resampled);
  }

  // ── ANIMATION LOOP ────────────────────────────────────────────────────────

  const DT_BASE = 1 / 512;   // time increment per frame at speed=1

  let lastTime = 0;

  function loop(now) {
    requestAnimationFrame(loop);

    const W = mainCanvas.width;
    const H = mainCanvas.height;
    const nH = state.convMode ? CONV_STEPS[state.convStepIdx] : state.nHarmonics;

    if (state.playing && state.dft) {
      // Step time
      const elapsed = (now - lastTime) / 1000;
      lastTime = now;
      state.t += DT_BASE * state.speed * Math.max(elapsed * 60, 1);
      if (state.t >= 1) {
        state.t -= 1;
        // Do NOT clear the trail — keep the closed curve visible permanently.
        // Trim to a rolling window of one cycle so memory stays bounded.
        const cycleLen = state.dft.length;
        if (state.trail.length > cycleLen + 20) {
          state.trail.splice(0, state.trail.length - cycleLen);
        }
      }

      // Evaluate epicycles
      const { x, y, circles } = DFT.evaluate(state.dft, state.t, nH);
      state.trail.push({ x, y });

      Renderer.drawFrame(mainCtx, {
        circles,
        trail: state.trail,
        showCircles: state.showCircles,
        colorCircles: state.colorCircles,
        fadeTrail: state.fadeTrail,
        W, H
      });

      Renderer.drawSpectrum(specCtx, state.dft, nH,
        specCanvas.width, specCanvas.height);

    } else if (!state.playing && state.mode === 'draw') {
      // Preview drawn strokes
      mainCtx.clearRect(0, 0, W, H);
      mainCtx.fillStyle = '#0d1117';
      mainCtx.fillRect(0, 0, W, H);

      if (state.drawnPoints.length > 1) {
        const half = { x: W/2, y: H/2 };
        mainCtx.beginPath();
        mainCtx.moveTo(state.drawnPoints[0].x + half.x, state.drawnPoints[0].y + half.y);
        for (let i = 1; i < state.drawnPoints.length; i++) {
          mainCtx.lineTo(state.drawnPoints[i].x + half.x, state.drawnPoints[i].y + half.y);
        }
        mainCtx.strokeStyle = 'rgba(88,166,255,0.7)';
        mainCtx.lineWidth = 2;
        mainCtx.stroke();
      }
    }
  }

  // ── DRAW MODE ─────────────────────────────────────────────────────────────

  function getCanvasPos(e) {
    const r   = mainCanvas.getBoundingClientRect();
    const scX = mainCanvas.width  / r.width;
    const scY = mainCanvas.height / r.height;
    const cx  = (e.clientX - r.left) * scX - mainCanvas.width  / 2;
    const cy  = (e.clientY - r.top)  * scY - mainCanvas.height / 2;
    return { x: cx, y: cy };
  }

  mainCanvas.addEventListener('mousedown', e => {
    if (state.mode !== 'draw') return;
    state.isDrawing   = true;
    state.playing     = false;
    state.drawnPoints = [getCanvasPos(e)];
    canvasHint.classList.add('hidden');
  });

  mainCanvas.addEventListener('mousemove', e => {
    if (!state.isDrawing) return;
    state.drawnPoints.push(getCanvasPos(e));
  });

  function closeCurve() {
    if (!state.isDrawing) return;
    state.isDrawing = false;
    // Close the curve by appending the first point so the path is a loop
    if (state.drawnPoints.length > 2) {
      state.drawnPoints.push({ ...state.drawnPoints[0] });
    }
  }

  mainCanvas.addEventListener('mouseup', closeCurve);

  mainCanvas.addEventListener('mouseleave', () => {
    // If the user drags outside the canvas, close the curve there too
    if (state.isDrawing) closeCurve();
  });

  // Touch support
  mainCanvas.addEventListener('touchstart', e => {
    if (state.mode !== 'draw') return;
    e.preventDefault();
    state.isDrawing   = true;
    state.playing     = false;
    state.drawnPoints = [getCanvasPos(e.touches[0])];
    canvasHint.classList.add('hidden');
  }, { passive: false });

  mainCanvas.addEventListener('touchmove', e => {
    if (!state.isDrawing) return;
    e.preventDefault();
    state.drawnPoints.push(getCanvasPos(e.touches[0]));
  }, { passive: false });

  mainCanvas.addEventListener('touchend', () => {
    if (state.isDrawing) closeCurve();
  });

  // ── UI BINDINGS ───────────────────────────────────────────────────────────

  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      modeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.mode = tab.dataset.mode;
      if (state.mode === 'preset') {
        presetPanel.classList.remove('hidden');
        drawPanel.classList.add('hidden');
      } else {
        presetPanel.classList.add('hidden');
        drawPanel.classList.remove('hidden');
        state.playing = false;
        state.drawnPoints = [];
        canvasHint.textContent = 'Draw on the canvas to get started';
        canvasHint.classList.remove('hidden');
      }
    });
  });

  btnAnalyze.addEventListener('click', () => {
    if (state.mode === 'preset') analyzePreset();
    else analyzeDrawn();
  });

  btnClearDraw.addEventListener('click', () => {
    state.drawnPoints = [];
    state.playing     = false;
    canvasHint.textContent = 'Draw on the canvas to get started';
    canvasHint.classList.remove('hidden');
  });

  harmonicSlider.addEventListener('input', () => {
    state.nHarmonics = parseInt(harmonicSlider.value);
    lblHarmonics.textContent = state.nHarmonics;
    state.trail    = [];
    state.t        = 0;
    // Exit convergence mode — the slider is now the source of truth
    state.convMode = false;
    convStepSpans.forEach(s => s.classList.remove('active'));
    convN.textContent = `N=${state.nHarmonics}`;
    if (state.dft) {
      specSubtitle.textContent =
        `${state.dft.length} samples · ${state.dft.length} bins · top ${state.nHarmonics} active`;
    }
  });

  speedSlider.addEventListener('input', () => {
    state.speed = speedFromSlider(parseInt(speedSlider.value));
  });

  toggleCircles.addEventListener('change', () => {
    state.showCircles = toggleCircles.checked;
  });

  toggleColors.addEventListener('change', () => {
    state.colorCircles = toggleColors.checked;
  });

  toggleFade.addEventListener('change', () => {
    state.fadeTrail = toggleFade.checked;
    state.trail     = [];
  });

  // Convergence explorer
  function updateConvDisplay() {
    const n = CONV_STEPS[state.convStepIdx];
    convN.textContent = `N=${n}`;
    convStepSpans.forEach((s, i) => {
      s.classList.toggle('active', i === state.convStepIdx);
    });
    // Sync the harmonic slider to match the convergence step
    const clamped = Math.min(n, parseInt(harmonicSlider.max));
    harmonicSlider.value     = clamped;
    lblHarmonics.textContent = clamped;
    state.nHarmonics = clamped;
    state.convMode   = true;
    state.trail      = [];
    state.t          = 0;
    if (state.dft) {
      specSubtitle.textContent =
        `${state.dft.length} samples · ${state.dft.length} bins · top ${clamped} active`;
    }
  }

  btnConvPrev.addEventListener('click', () => {
    if (state.convStepIdx > 0) { state.convStepIdx--; updateConvDisplay(); }
  });

  btnConvNext.addEventListener('click', () => {
    if (state.convStepIdx < CONV_STEPS.length - 1) { state.convStepIdx++; updateConvDisplay(); }
  });

  convStepSpans.forEach((s, i) => {
    s.addEventListener('click', () => {
      state.convStepIdx = i;
      updateConvDisplay();
      if (!state.dft) analyzePreset();
    });
  });

  // ── KEYBOARD SHORTCUTS ────────────────────────────────────────────────────

  document.addEventListener('keydown', e => {
    switch (e.key) {
      case ' ':
        e.preventDefault();
        state.playing = !state.playing;
        break;
      case 'c':
        toggleCircles.checked = !toggleCircles.checked;
        state.showCircles = toggleCircles.checked;
        break;
      case 'f':
        toggleFade.checked = !toggleFade.checked;
        state.fadeTrail = toggleFade.checked;
        state.trail = [];
        break;
      case 'ArrowRight':
        if (state.convStepIdx < CONV_STEPS.length - 1) {
          state.convStepIdx++;
          updateConvDisplay();
          if (!state.dft) analyzePreset();
        }
        break;
      case 'ArrowLeft':
        if (state.convStepIdx > 0) {
          state.convStepIdx--;
          updateConvDisplay();
          if (!state.dft) analyzePreset();
        }
        break;
    }
  });

  // ── INIT ──────────────────────────────────────────────────────────────────

  resizeCanvases();
  requestAnimationFrame(t => { lastTime = t; loop(t); });

  // Auto-load heart preset immediately
  setTimeout(() => {
    analyzePreset();
  }, 100);

})();

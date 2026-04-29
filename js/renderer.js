/**
 * renderer.js — Canvas rendering for epicycles, paths, and spectrum
 *
 * Two canvases:
 *   1. main-canvas  — the epicycle animation + traced path
 *   2. spectrum-canvas — live bar chart of DFT amplitudes
 *
 * The renderer is designed to be called each animation frame.
 * It does NOT own state — the app.js drives what gets drawn.
 */

const Renderer = (() => {

  // ── COLOR SCHEME ──────────────────────────────────────────────────────────
  // Vivid amber → lime → cyan → magenta sweep at high saturation + lightness.
  // Avoids dark blues/violets that disappear against the #0d1117 background.
  // First circle (dominant frequency) is warm amber; higher freqs go cool.

  function epicycleColor(i, total, alpha = 1.0) {
    // Hue: 40 (amber) → 200 (sky blue) — skips greens intentionally
    // Use a non-linear curve so the first few (most visible) circles stay warm
    const ratio = i / Math.max(total - 1, 1);
    const hue   = 40 + ratio * 220;      // 40° amber → 260° blue-violet
    const sat   = 95 - ratio * 20;       // 95% → 75% (vivid throughout)
    const lit   = 62 - ratio * 10;       // 62% → 52% (bright even at high i)
    return `hsla(${hue.toFixed(1)}, ${sat.toFixed(1)}%, ${lit.toFixed(1)}%, ${alpha})`;
  }

  function spectrumColor(i, total) {
    const ratio = i / Math.max(total - 1, 1);
    const hue   = 40 + ratio * 220;
    return `hsl(${hue.toFixed(1)}, 95%, 58%)`;
  }

  // ── MAIN CANVAS ───────────────────────────────────────────────────────────

  /**
   * Draw one animation frame on the main canvas.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} state — { circles, trail, showCircles, colorCircles, fadeTrail, W, H }
   */
  function drawFrame(ctx, state) {
    const { circles, trail, showCircles, colorCircles, fadeTrail, W, H } = state;

    // Always do a full clear — fade effect is on the trail itself, not the bg
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    if (!circles || circles.length === 0) return;

    const cx = W / 2, cy = H / 2;
    const total = circles.length;

    // Draw the traced path
    if (trail.length > 1) {
      if (fadeTrail) {
        // Gradient along the path: oldest segment = invisible, newest = fully opaque.
        // Draw in 32 opacity buckets so the fade is smooth without a ctx.stroke() per point.
        const n       = trail.length;
        const BUCKETS = 32;
        ctx.lineWidth = 2;
        for (let b = 0; b < BUCKETS; b++) {
          const iStart = Math.floor((b / BUCKETS) * n);
          const iEnd   = Math.floor(((b + 1) / BUCKETS) * n);
          if (iEnd - iStart < 1) continue;
          const alpha = Math.pow((b + 1) / BUCKETS, 1.5);   // ease-in so the tail vanishes smoothly
          ctx.beginPath();
          ctx.moveTo(cx + trail[iStart].x, cy + trail[iStart].y);
          for (let i = iStart + 1; i <= iEnd && i < n; i++) {
            ctx.lineTo(cx + trail[i].x, cy + trail[i].y);
          }
          ctx.strokeStyle = `rgba(240, 232, 208, ${alpha.toFixed(3)})`;
          ctx.stroke();
        }
      } else {
        // Solid trail
        ctx.beginPath();
        ctx.moveTo(cx + trail[0].x, cy + trail[0].y);
        for (let i = 1; i < trail.length; i++) {
          ctx.lineTo(cx + trail[i].x, cy + trail[i].y);
        }
        ctx.strokeStyle = '#f0e8d0';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    if (!showCircles) return;

    // Draw epicycles
    for (let i = 0; i < total; i++) {
      const { cx: ox, cy: oy, r, tx, ty } = circles[i];
      const color = colorCircles ? epicycleColor(i, total) : 'rgba(88,166,255,0.25)';
      const armColor = colorCircles ? epicycleColor(i, total, 0.6) : 'rgba(88,166,255,0.5)';

      // Circle — visible ring, higher alpha for large circles
      const ringAlpha = colorCircles
        ? Math.max(0.18, 0.35 - (i / Math.max(total, 1)) * 0.2)
        : 0.15;
      ctx.beginPath();
      ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
      ctx.strokeStyle = color.replace(/[\d.]+\)$/, `${ringAlpha.toFixed(2)})`);
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Arm (spoke from center to tip)
      ctx.beginPath();
      ctx.moveTo(cx + ox, cy + oy);
      ctx.lineTo(cx + tx, cy + ty);
      ctx.strokeStyle = armColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Tip dot — bright white for final tip, colored for intermediates
      if (i === total - 1) {
        ctx.beginPath();
        ctx.arc(cx + tx, cy + ty, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      } else if (i < 8) {
        // Mark the first few joint positions so the chain is legible
        ctx.beginPath();
        ctx.arc(cx + tx, cy + ty, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = color.replace(/[\d.]+\)$/, '0.7)');
        ctx.fill();
      }
    }
  }

  // ── SPECTRUM CANVAS ───────────────────────────────────────────────────────

  /**
   * Draw the frequency spectrum as a bar chart.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} dft       — full sorted DFT array
   * @param {number} nVisible — how many harmonics are currently active
   * @param {number} W
   * @param {number} H
   */
  function drawSpectrum(ctx, dft, nVisible, W, H) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#161b22';
    ctx.fillRect(0, 0, W, H);

    if (!dft || dft.length === 0) return;

    const maxShow = Math.min(dft.length, 256);
    const barW    = (W / maxShow) * 0.8;
    const gap     = (W / maxShow) * 0.2;
    const maxAmp  = dft[0].amp;   // sorted desc so first is largest

    for (let i = 0; i < maxShow; i++) {
      const amp  = dft[i].amp;
      const norm = maxAmp > 0 ? amp / maxAmp : 0;
      const bH   = norm * (H - 20);
      const x    = i * (barW + gap);

      ctx.fillStyle = i < nVisible
        ? spectrumColor(i, maxShow)
        : 'rgba(48, 54, 61, 0.6)';
      ctx.fillRect(x, H - bH, barW, bH);
    }

    // Active region indicator line
    if (nVisible > 0 && nVisible <= maxShow) {
      const lineX = nVisible * (barW + gap) - gap / 2;
      ctx.beginPath();
      ctx.moveTo(lineX, 0);
      ctx.lineTo(lineX, H);
      ctx.strokeStyle = 'rgba(230, 237, 243, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  return { drawFrame, drawSpectrum, epicycleColor };

})();

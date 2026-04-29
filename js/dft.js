/**
 * dft.js — Discrete Fourier Transform engine
 *
 * Treats the 2D path as a complex signal: z[n] = x[n] + i·y[n].
 *
 * The DFT decomposes this into N complex exponentials:
 *   Z[k] = Σ z[n] · e^(-i·2π·k·n/N)    for k = 0..N-1
 *
 * Each frequency bin k corresponds to an epicycle with:
 *   amplitude  = |Z[k]| / N
 *   phase      = arg(Z[k])
 *   frequency  = k  (rotations per full cycle, signed)
 *
 * Epicycles are sorted by amplitude descending so the most influential
 * circles are drawn first and dominate the visual.
 *
 * Complexity: O(N²) — adequate for N ≤ 2048.
 * For N > 4096 an FFT (Cooley-Tukey) would be needed.
 */

const DFT = (() => {

  const TWO_PI = 2 * Math.PI;

  /**
   * Compute the full DFT of a sampled path.
   *
   * @param {Array<{x,y}>} pts  — N uniformly spaced complex samples
   * @returns {Array<{freq, amp, phase, re, im}>} sorted by amp desc
   */
  function compute(pts) {
    const N = pts.length;
    const result = new Array(N);

    for (let k = 0; k < N; k++) {
      let re = 0, im = 0;
      for (let n = 0; n < N; n++) {
        const angle = (TWO_PI * k * n) / N;
        re += pts[n].x * Math.cos(angle) + pts[n].y * Math.sin(angle);
        im -= pts[n].x * Math.sin(angle) - pts[n].y * Math.cos(angle);
      }
      re /= N;
      im /= N;

      // Map k to signed frequency: negative freqs for k > N/2
      const freq = k <= N / 2 ? k : k - N;

      result[k] = {
        freq,
        amp:   Math.sqrt(re*re + im*im),
        phase: Math.atan2(im, re),
        re,
        im
      };
    }

    // Sort by amplitude descending — biggest circles first
    result.sort((a, b) => b.amp - a.amp);
    return result;
  }

  /**
   * Given the sorted DFT result and a normalized time t in [0, 1],
   * compute the tip position using the first `nHarmonics` epicycles.
   * Returns the tip {x, y} and the array of circle positions for rendering.
   *
   * @param {Array} dft
   * @param {number} t    — normalized time [0,1]
   * @param {number} nHarmonics
   * @returns {{ x, y, circles: Array<{x, y, r}> }}
   */
  function evaluate(dft, t, nHarmonics) {
    const n = Math.min(nHarmonics, dft.length);
    let x = 0, y = 0;
    const circles = new Array(n);

    for (let i = 0; i < n; i++) {
      const { freq, amp, phase } = dft[i];
      const angle = TWO_PI * freq * t + phase;
      const px = x, py = y;
      x += amp * Math.cos(angle);
      y += amp * Math.sin(angle);
      circles[i] = { cx: px, cy: py, r: amp, tx: x, ty: y };
    }

    return { x, y, circles };
  }

  return { compute, evaluate };

})();

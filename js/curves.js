/**
 * curves.js — Parametric curve definitions
 *
 * Each curve is a function t -> {x, y} for t in [0, 2π].
 * All outputs are in the range roughly [-1, 1] before scaling.
 *
 * Curves are sampled at N points and arc-length resampled before DFT
 * to ensure uniform spacing (critical for accurate frequency decomposition).
 */

const Curves = (() => {

  // ── CURVE LIBRARY ──────────────────────────────────────────────────────────

  const library = {

    heart: {
      label: 'Heart',
      fn: t => ({
        x:  16 * Math.pow(Math.sin(t), 3),
        y: -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t))
      }),
      scale: 0.052
    },

    trefoil: {
      label: 'Trefoil Knot',
      fn: t => ({
        x: Math.sin(t) + 2 * Math.sin(2*t),
        y: Math.cos(t) - 2 * Math.cos(2*t)
      }),
      scale: 0.28
    },

    epitrochoid: {
      label: 'Epitrochoid',
      // R=5, r=3, d=5 — classic spirograph family
      fn: t => {
        const R = 5, r = 3, d = 5;
        return {
          x: (R + r) * Math.cos(t) - d * Math.cos((R + r) / r * t),
          y: (R + r) * Math.sin(t) - d * Math.sin((R + r) / r * t)
        };
      },
      scale: 0.072
    },

    rose5: {
      label: 'Rose (k=5)',
      fn: t => {
        const r = Math.cos(5 * t);
        return { x: r * Math.cos(t), y: r * Math.sin(t) };
      },
      scale: 0.9,
      periods: 2   // rose k=5 needs 2 full periods to close
    },

    butterfly: {
      label: 'Butterfly',
      // Temple H. Fay's butterfly curve
      fn: t => {
        const e = Math.E;
        const r = Math.exp(Math.cos(t)) - 2 * Math.cos(4*t) - Math.pow(Math.sin(t/12), 5);
        return { x: r * Math.sin(t), y: -r * Math.cos(t) };
      },
      scale: 0.18,
      periods: 4   // full curve needs t in [0, 4π] but we approximate in [0, 2π] twice
    },

    lissajous: {
      label: 'Lissajous 3:4',
      fn: t => ({
        x: Math.sin(3 * t + Math.PI / 4),
        y: Math.sin(4 * t)
      }),
      scale: 0.85
    },

    star7: {
      label: 'Heptagram Star',
      fn: t => {
        // 7-pointed star via rhodonea-style parameterization
        const r = 0.5 + 0.5 * Math.abs(Math.cos(7 * t / 2));
        return { x: r * Math.cos(t), y: r * Math.sin(t) };
      },
      scale: 0.9,
      periods: 4
    },

    spirograph: {
      label: 'Spirograph',
      // Hypotrochoid: R=7, r=2, d=5
      fn: t => {
        const R = 7, r = 2, d = 5;
        return {
          x: (R - r) * Math.cos(t) + d * Math.cos((R - r) / r * t),
          y: (R - r) * Math.sin(t) - d * Math.sin((R - r) / r * t)
        };
      },
      scale: 0.1,
      periods: 2
    }
  };

  // ── SAMPLING ───────────────────────────────────────────────────────────────

  /**
   * Sample a curve at `n` uniformly spaced t values, then arc-length resample
   * back to `n` points. This ensures equal spacing in path length, which
   * dramatically improves DFT accuracy for non-uniform speed curves.
   */
  function sample(name, n = 512) {
    const def = library[name];
    if (!def) throw new Error(`Unknown curve: ${name}`);

    const periods = def.periods || 1;
    const tMax = 2 * Math.PI * periods;
    const rawN  = n * periods * 4;   // oversample for accurate arc-length

    // Raw sample
    const raw = [];
    for (let i = 0; i < rawN; i++) {
      const t = (i / rawN) * tMax;
      const p = def.fn(t);
      raw.push({ x: p.x * def.scale, y: p.y * def.scale });
    }

    // Arc-length parameterization
    const arcLen = [0];
    for (let i = 1; i < raw.length; i++) {
      const dx = raw[i].x - raw[i-1].x;
      const dy = raw[i].y - raw[i-1].y;
      arcLen.push(arcLen[i-1] + Math.sqrt(dx*dx + dy*dy));
    }
    const totalLen = arcLen[arcLen.length - 1];

    // Resample at n equally spaced arc-length positions
    const pts = [];
    let j = 0;
    for (let i = 0; i < n; i++) {
      const target = (i / n) * totalLen;
      while (j < arcLen.length - 2 && arcLen[j + 1] < target) j++;
      const t_ = arcLen[j+1] === arcLen[j]
        ? 0
        : (target - arcLen[j]) / (arcLen[j+1] - arcLen[j]);
      pts.push({
        x: raw[j].x + t_ * (raw[j+1].x - raw[j].x),
        y: raw[j].y + t_ * (raw[j+1].y - raw[j].y)
      });
    }

    return pts;
  }

  /**
   * From a raw user-drawn array of {x, y} points:
   * arc-length resample to exactly n points.
   */
  function resamplePath(pts, n = 512) {
    if (pts.length < 2) return pts;

    const arcLen = [0];
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i-1].x;
      const dy = pts[i].y - pts[i-1].y;
      arcLen.push(arcLen[i-1] + Math.sqrt(dx*dx + dy*dy));
    }
    const total = arcLen[arcLen.length - 1];

    const result = [];
    let j = 0;
    for (let i = 0; i < n; i++) {
      const target = (i / n) * total;
      while (j < arcLen.length - 2 && arcLen[j+1] < target) j++;
      const t_ = arcLen[j+1] === arcLen[j]
        ? 0
        : (target - arcLen[j]) / (arcLen[j+1] - arcLen[j]);
      result.push({
        x: pts[j].x + t_ * (pts[j+1].x - pts[j].x),
        y: pts[j].y + t_ * (pts[j+1].y - pts[j].y)
      });
    }
    return result;
  }

  return { library, sample, resamplePath };

})();

# Fourier Epicycles

An interactive visualization of the Discrete Fourier Transform using rotating circles (epicycles).

## What this is

Any closed 2D curve can be perfectly reproduced as a sum of rotating circles — each at a different speed, size, and starting angle. This is the geometric interpretation of the Fourier series. This tool makes that decomposition visible and interactive.

The core idea: given N sampled points from a curve, the DFT produces N frequency bins. Each bin defines one epicycle. Stack them in amplitude order, let them rotate simultaneously, and the chain tip traces back the original curve.

## Why it exists

Signal decomposition is foundational in DSP, image compression (JPEG/MP3), and numerical methods. Fourier epicycles turn an abstract mathematical identity into something you can watch happen. Seeing a heart curve reconstruct itself from 256 rotating circles, or watching a star's spiky corners only appear as higher harmonics are added, makes the convergence theorem tangible.

## Features

- **8 mathematical preset curves**: heart, trefoil knot, epitrochoid, rose (k=5), butterfly, Lissajous 3:4, heptagram star, spirograph
- **Arc-length resampling**: ensures uniform point spacing before DFT — critical for accurate frequency decomposition
- **Color-coded epicycles**: hue sweeps from blue → violet by frequency rank; toggleable to flat color
- **Live frequency spectrum**: real-time bar chart of all DFT amplitudes with active-harmonic indicator
- **Convergence explorer**: step through N=1, 2, 4, 8, 16, 32, 64, 128, 256 to watch the approximation sharpen
- **Harmonic count control**: slide from 1 to 256 to see how many circles are needed to recover the shape
- **Speed control**: adjust animation playback speed
- **Freehand draw mode**: draw any closed curve (mouse or touch) and immediately decompose it
- **Fade trail option**: ghosting effect to see the path as it's traced

## Implementation notes

The DFT is computed as O(N²) on a complex signal z[n] = x[n] + i·y[n]. Paths are arc-length resampled to 512 points before analysis. Epicycles are sorted by amplitude descending so the dominant motions are rendered first.

## File structure

```
fourier-epicycles/
├── index.html          — layout and controls
├── start.py            — local dev server (python3 start.py)
├── css/style.css       — dark engineering theme
└── js/
    ├── curves.js       — parametric curve library + arc-length resampler
    ├── dft.js          — DFT engine + epicycle evaluator
    ├── renderer.js     — canvas drawing (epicycles, trail, spectrum)
    └── app.js          — UI controller + animation loop
```

## Usage

```bash
python3 start.py
```

Opens `http://localhost:8080` automatically. No build step, no dependencies.

Alternatively, open `index.html` directly in any modern browser.

Keyboard shortcuts: `Space` — pause/play · `C` — toggle circles · `F` — toggle fade · `← →` — convergence step

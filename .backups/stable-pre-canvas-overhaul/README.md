# Grainy Blobber

Local Vite + TypeScript tool for designing soft grainy backgrounds with two renderers:

- `Canvas Mesh`
- `SVG Wavy`

Preview/output is background-only by default (no CTA text overlay).

## Run

```bash
npm install
npm run dev
```

Open the local URL from Vite (usually `http://localhost:5173`).

## Controls

- Render mode switch (`Canvas Mesh` / `SVG Wavy`)
- Presets: `Itonics Neutral`, `Neon`, `Dark`
- Section height slider in viewport units (`vh`)
- Live color wheels plus hex text inputs for background + 5 palette colors
- Shape styles:
  - Canvas: `Smooth Mesh`, `Opera Dust Blob`, `Particles Neon`, `Center Morph Blob`, `Orbit Blobs`
  - SVG: `Wavy Bands`, `Center Morph Blob`, `Pulse Rings`
- `Center blob size` and `Center X/Y` position controls for both Canvas/SVG center morph styles
- Canvas-only blend mode list (valid `globalCompositeOperation` values)
- `Full-canvas gradient` toggle
- Motion controls (`speed`, `motion amount`, `pause animation`)
- Quality controls (`max DPR`, grain, blur, blob/wave counts)
- Mouse controls (hover on/off, attract/repel mode, strength, radius)
- Particles controls (count, size, link distance) when `Particles Neon` is selected
- Opera Dust controls when `Opera Dust Blob` is selected:
  - `dust intensity`
  - `dust scale`
  - `dust contrast`
  - `lobe count`
  - `morph amount`
  - `paper grain`

If `prefers-reduced-motion` is enabled, animation is paused and a static render is shown.

## Profiling

- Rolling metrics: FPS, frame ms, draw ms, cost score
- `Run 5s benchmark` reports average FPS and worst frame time

## Exports

- Copy embed snippets separately:
  - `Copy HTML`
  - `Copy CSS`
  - `Copy JS`
- Canvas mode:
  - `Download PNG @2x`
  - `Download 10s MP4` (falls back to WebM if MP4 codec is unavailable in your browser)
- SVG mode:
  - `Download SVG`
  - `Copy SVG markup`

Embed snippets are framework-free and module-ready (plain HTML/CSS/JS).

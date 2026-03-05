# Grainy Blobber

Canvas-only local background generator built with Vite + TypeScript.

## What It Includes

- Styles:
  - `Smooth Mesh`
  - `Center Morph Blob`
- Controls:
  - section height (`vh`)
  - live color pickers + hex inputs (background + 5 palette colors)
  - full-canvas gradient toggle
  - blend mode, grain, blur, blob count
  - center blob size + X/Y position
  - speed, motion amount, pause
  - mouse hover interaction (attract/repel, strength, radius)
- Profiling:
  - rolling FPS
  - rolling frame ms
  - rolling draw ms
  - cost score
  - 5s benchmark button
- Export:
  - copy HTML / CSS / JS snippets separately
  - download PNG @2x
  - download 10s MP4 (WebM fallback if MP4 codec is unavailable)
- Presets:
  - built-in themes (`Itonics Neutral`, `Neon`, `Dark`)
  - save/update/delete user presets in `localStorage`
  - import/export preset JSON files

`prefers-reduced-motion` is respected: animation renders static when reduce is enabled.

## Run

```bash
npm install
npm run dev
```

Vite will print the local URL (usually `http://localhost:5173`).

## Build

```bash
npm run build
```

## Stable Restore

A pre-overhaul snapshot is stored in:

`./.backups/stable-pre-canvas-overhaul`

To restore that snapshot:

```bash
./scripts/restore-stable.sh
```

Then reinstall and run:

```bash
npm install
npm run dev
```

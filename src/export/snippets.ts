import type { RenderConfig } from '../renderers/types';

export interface EmbedSnippets {
  html: string;
  css: string;
  js: string;
}

export function buildEmbedSnippets(config: RenderConfig): EmbedSnippets {
  return {
    html: buildHtmlSnippet(),
    css: buildCssSnippet(config),
    js: buildCanvasJsSnippet(config),
  };
}

function buildHtmlSnippet(): string {
  return `<section class="grainy-blobber" id="grainy-blobber"></section>`;
}

function buildCssSnippet(config: RenderConfig): string {
  return `.grainy-blobber {
  position: relative;
  overflow: hidden;
  border-radius: 28px;
  min-height: ${Math.round(config.sectionHeightVh)}vh;
  background: ${config.background};
}

.grainy-blobber canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}`;
}

function buildCanvasJsSnippet(config: RenderConfig): string {
  const cfg = {
    colors: config.colors,
    background: config.background,
    shapeStyle: config.shapeStyle,
    maxDpr: config.maxDpr,
    paused: config.paused,
    speed: config.speed,
    motionIntensity: config.motionIntensity,
    grainOpacity: config.grainOpacity,
    centerBlobScale: config.centerBlobScale,
    centerOffsetX: config.centerOffsetX,
    centerOffsetY: config.centerOffsetY,
    blendMode: config.blendMode,
    fullCanvasGradient: config.fullCanvasGradient,
    mouseInteraction: config.mouseInteraction,
    mouseMode: config.mouseMode,
    mouseStrength: config.mouseStrength,
    mouseRadius: config.mouseRadius,
    blobCount: config.blobCount,
    blurPx: config.blurPx,
  };

  return `const mount = document.getElementById('grainy-blobber');
if (!mount) throw new Error('Missing #grainy-blobber element');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const cfg = ${JSON.stringify(cfg, null, 2)};

const canvas = document.createElement('canvas');
canvas.setAttribute('aria-hidden', 'true');
mount.prepend(canvas);

const ctx = canvas.getContext('2d', { alpha: true });
if (!ctx) throw new Error('Canvas 2D unsupported');

let width = 0;
let height = 0;
let dpr = Math.min(window.devicePixelRatio || 1, Math.max(1, Math.min(3, cfg.maxDpr)));
let t = 0;
let raf = 0;
let last = performance.now();

const pointer = { x: 0, y: 0, inside: false };
const blobs = [];
const noiseTile = makeNoiseTile(150);

function random(min, max) {
  return min + Math.random() * (max - min);
}

function isAnimating() {
  return !reduceMotion && !cfg.paused;
}

function withAlpha(hex, alpha) {
  if (!hex || hex[0] !== '#') return hex;
  const raw = hex.length === 4
    ? '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
    : hex;
  const r = parseInt(raw.slice(1, 3), 16);
  const g = parseInt(raw.slice(3, 5), 16);
  const b = parseInt(raw.slice(5, 7), 16);
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function resolveDpr() {
  return Math.min(window.devicePixelRatio || 1, clamp(cfg.maxDpr, 1, 3));
}

function getMouseOffset(x, y, boost) {
  if (!cfg.mouseInteraction || !pointer.inside) return { x: 0, y: 0 };
  const dx = x - pointer.x;
  const dy = y - pointer.y;
  const dist = Math.hypot(dx, dy);
  const radius = Math.max(20, cfg.mouseRadius);
  if (dist >= radius) return { x: 0, y: 0 };
  const sign = cfg.mouseMode === 'repel' ? 1 : -1;
  const nx = dx / (dist || 1);
  const ny = dy / (dist || 1);
  const force = Math.pow(1 - dist / radius, 2) * cfg.mouseStrength * boost;
  const mag = force * radius * 0.42;
  return { x: nx * mag * sign, y: ny * mag * sign };
}

function reseedBlobs() {
  blobs.length = 0;
  const minDim = Math.max(80, Math.min(width, height));
  for (let i = 0; i < Math.max(2, cfg.blobCount); i += 1) {
    const r = random(minDim * 0.1, minDim * 0.32);
    blobs.push({
      ax: random(r * 0.6, Math.max(r * 0.6 + 2, width - r * 0.6)),
      ay: random(r * 0.6, Math.max(r * 0.6 + 2, height - r * 0.6)),
      r,
      px: random(0, Math.PI * 2),
      py: random(0, Math.PI * 2),
      dx: random(width * 0.04, width * 0.12),
      dy: random(height * 0.04, height * 0.12),
    });
  }
}

function traceMorphPath(cx, cy, radius, phase) {
  const points = 34;
  ctx.beginPath();
  for (let i = 0; i <= points; i += 1) {
    const a = (i / points) * Math.PI * 2;
    const wobble =
      1
      + Math.sin(a * 3 + phase * 1.2) * (0.12 + cfg.motionIntensity * 0.04)
      + Math.cos(a * 5 - phase * 0.8) * (0.05 + cfg.motionIntensity * 0.02);
    const rr = radius * wobble;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawFullGradient() {
  const count = Math.max(3, cfg.colors.length);
  const driftScale = 0.2 * (0.6 + cfg.motionIntensity * 0.5);
  for (let i = 0; i < count; i += 1) {
    const color = cfg.colors[i % cfg.colors.length];
    let x = width * (0.5 + Math.sin(t * 0.55 + i * 1.11) * driftScale);
    let y = height * (0.5 + Math.cos(t * 0.47 + i * 1.37) * driftScale);
    const push = getMouseOffset(x, y, 0.45);
    x += push.x;
    y += push.y;

    const rr = Math.max(width, height) * (0.44 + i * 0.08);
    const g = ctx.createRadialGradient(x, y, rr * 0.1, x, y, rr);
    g.addColorStop(0, withAlpha(color, 0.88));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMesh() {
  ctx.save();
  ctx.globalCompositeOperation = cfg.blendMode;
  ctx.filter = 'blur(' + cfg.blurPx + 'px)';

  blobs.forEach((blob, i) => {
    let x = blob.ax + Math.sin(t + blob.px) * blob.dx * cfg.motionIntensity;
    let y = blob.ay + Math.cos(t * 0.92 + blob.py) * blob.dy * cfg.motionIntensity;
    const push = getMouseOffset(x, y, 0.7);
    x += push.x;
    y += push.y;

    const color = cfg.colors[i % cfg.colors.length];
    const g = ctx.createRadialGradient(x, y, 0, x, y, blob.r);
    g.addColorStop(0, withAlpha(color, 0.92));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, blob.r, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawCenterMorph() {
  ctx.save();
  ctx.globalCompositeOperation = cfg.blendMode;
  ctx.filter = 'blur(' + Math.max(20, cfg.blurPx * 0.6) + 'px)';

  const minDim = Math.min(width, height);
  const baseRadius = minDim * 0.28 * clamp(cfg.centerBlobScale, 0.5, 2);
  const centerOffsetX = width * (clamp(cfg.centerOffsetX, -45, 45) / 100);
  const centerOffsetY = height * (clamp(cfg.centerOffsetY, -45, 45) / 100);
  let cx = width * 0.5 + centerOffsetX + Math.sin(t * 0.35) * width * 0.03 * cfg.motionIntensity;
  let cy = height * 0.5 + centerOffsetY + Math.cos(t * 0.28) * height * 0.03 * cfg.motionIntensity;
  const centerPush = getMouseOffset(cx, cy, 1);
  cx += centerPush.x;
  cy += centerPush.y;

  for (let i = 0; i < Math.max(2, cfg.colors.length); i += 1) {
    const scale = 1 + i * 0.08;
    const phase = t * (0.8 + i * 0.12) + i * 1.27;
    const ox = Math.sin(t * 0.48 + i) * width * 0.02 * cfg.motionIntensity;
    const oy = Math.cos(t * 0.43 + i * 0.9) * height * 0.02 * cfg.motionIntensity;
    const radius = baseRadius * scale;

    traceMorphPath(cx + ox, cy + oy, radius, phase);
    const color = cfg.colors[i % cfg.colors.length];
    const g = ctx.createRadialGradient(cx + ox, cy + oy, radius * 0.12, cx + ox, cy + oy, radius);
    g.addColorStop(0, withAlpha(color, 0.9));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.fill();
  }

  ctx.restore();
}

function drawMouseField() {
  if (!cfg.mouseInteraction || !pointer.inside) return;
  const radius = Math.max(20, cfg.mouseRadius);
  const color = cfg.mouseMode === 'repel'
    ? withAlpha(cfg.colors[0], 0.2)
    : withAlpha(cfg.colors[1] || cfg.colors[0], 0.18);
  const gradient = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = cfg.background;
  ctx.fillRect(0, 0, width, height);

  if (cfg.fullCanvasGradient) {
    ctx.save();
    ctx.globalCompositeOperation = cfg.blendMode;
    ctx.filter = 'blur(' + Math.max(36, cfg.blurPx * 0.7) + 'px)';
    drawFullGradient();
    ctx.restore();
  } else if (cfg.shapeStyle === 'center') {
    drawCenterMorph();
  } else {
    drawMesh();
  }

  drawMouseField();

  const noise = ctx.createPattern(noiseTile, 'repeat');
  if (noise && cfg.grainOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = cfg.grainOpacity;
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = noise;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

function resize() {
  const rect = mount.getBoundingClientRect();
  width = Math.max(2, Math.floor(rect.width));
  height = Math.max(2, Math.floor(rect.height));
  dpr = resolveDpr();
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  reseedBlobs();
}

canvas.addEventListener('pointermove', (event) => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = event.clientX - rect.left;
  pointer.y = event.clientY - rect.top;
  pointer.inside = true;
  if (!isAnimating()) draw();
}, { passive: true });

canvas.addEventListener('pointerleave', () => {
  pointer.inside = false;
  if (!isAnimating()) draw();
}, { passive: true });

function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  t += dt * cfg.speed * 1.35;
  draw();
  raf = requestAnimationFrame(loop);
}

resize();
draw();

if (isAnimating()) {
  raf = requestAnimationFrame(loop);
}

const ro = new ResizeObserver(() => {
  resize();
  draw();
});
ro.observe(mount);

// cleanup example:
// cancelAnimationFrame(raf); ro.disconnect();`;
}

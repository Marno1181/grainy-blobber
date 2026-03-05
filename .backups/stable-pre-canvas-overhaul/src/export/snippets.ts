import type { RenderConfig } from '../renderers/types';

export interface EmbedSnippets {
  html: string;
  css: string;
  js: string;
}

export function buildEmbedSnippets(config: RenderConfig): EmbedSnippets {
  const html = buildHtmlSnippet();
  const css = buildCssSnippet(config);
  const js = config.mode === 'canvas-mesh'
    ? buildCanvasJsSnippet(config)
    : buildSvgJsSnippet(config);

  return { html, css, js };
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

.grainy-blobber canvas,
.grainy-blobber svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

@media (prefers-reduced-motion: reduce) {
  .grainy-blobber canvas,
  .grainy-blobber svg {
    animation: none;
  }
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
    dustIntensity: config.dustIntensity,
    dustScale: config.dustScale,
    dustContrast: config.dustContrast,
    lobeCount: config.lobeCount,
    morphAmount: config.morphAmount,
    centerBlobScale: config.centerBlobScale,
    centerOffsetX: config.centerOffsetX,
    centerOffsetY: config.centerOffsetY,
    paperGrainOpacity: config.paperGrainOpacity,
    blendMode: config.blendMode,
    fullCanvasGradient: config.fullCanvasGradient,
    mouseInteraction: config.mouseInteraction,
    mouseMode: config.mouseMode,
    mouseStrength: config.mouseStrength,
    mouseRadius: config.mouseRadius,
    blobCount: config.blobCount,
    particleCount: config.particleCount,
    particleSize: config.particleSize,
    particleLinkDistance: config.particleLinkDistance,
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
const particles = [];
const lobes = [];

const noiseTile = makeNoiseTile(150);
const paperNoiseTile = makePaperNoiseTile(200);
let dustTile = makeSpeckleTile(180, cfg.dustContrast);

let opera = null;
function ensureOperaBuffers() {
  const lowW = Math.max(80, Math.round(width * 0.5));
  const lowH = Math.max(80, Math.round(height * 0.5));
  if (opera && opera.lowW === lowW && opera.lowH === lowH) {
    return opera;
  }

  const layer = document.createElement('canvas');
  layer.width = lowW;
  layer.height = lowH;
  const layerCtx = layer.getContext('2d');
  const mask = document.createElement('canvas');
  mask.width = lowW;
  mask.height = lowH;
  const maskCtx = mask.getContext('2d');
  const dust = document.createElement('canvas');
  dust.width = lowW;
  dust.height = lowH;
  const dustCtx = dust.getContext('2d');

  if (!layerCtx || !maskCtx || !dustCtx) {
    throw new Error('Canvas 2D unsupported for offscreen layers');
  }

  opera = { lowW, lowH, layer, layerCtx, mask, maskCtx, dust, dustCtx };
  return opera;
}

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

function getScaledMouseOffset(x, y, localW, localH, boost) {
  if (!cfg.mouseInteraction || !pointer.inside) return { x: 0, y: 0 };
  const sx = localW / Math.max(1, width);
  const sy = localH / Math.max(1, height);
  const px = pointer.x * sx;
  const py = pointer.y * sy;
  const dx = x - px;
  const dy = y - py;
  const dist = Math.hypot(dx, dy);
  const radius = Math.max(10, cfg.mouseRadius * ((sx + sy) * 0.5));
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

function reseedLobes() {
  lobes.length = 0;
  const count = Math.round(clamp(cfg.lobeCount, 2, 6));
  for (let i = 0; i < count; i += 1) {
    lobes.push({
      phase: random(0, Math.PI * 2),
      orbit: 0.8 + i * 0.08 + random(-0.1, 0.1),
      size: random(0.72, 1.18),
      swayX: random(5, 26),
      swayY: random(4, 20),
    });
  }
}

function reseedParticles() {
  particles.length = 0;
  const count = Math.round(clamp(cfg.particleCount, 20, 340));
  for (let i = 0; i < count; i += 1) {
    particles.push({
      x: random(0, width),
      y: random(0, height),
      vx: random(-0.2, 0.2),
      vy: random(-0.2, 0.2),
      size: cfg.particleSize * random(0.7, 1.35),
      colorIndex: i % Math.max(1, cfg.colors.length),
      phase: random(0, Math.PI * 2),
      speed: random(0.7, 1.55),
    });
  }
}

function updateParticles(dt) {
  const linkMotion = 0.06 * cfg.motionIntensity;
  const speedScale = 0.7 + cfg.speed * 0.7;

  particles.forEach((p) => {
    const driftX = Math.cos(t * p.speed + p.phase) * linkMotion;
    const driftY = Math.sin(t * p.speed * 0.82 + p.phase) * linkMotion;
    p.vx += driftX * dt * 60;
    p.vy += driftY * dt * 60;

    if (cfg.mouseInteraction && pointer.inside) {
      const dx = pointer.x - p.x;
      const dy = pointer.y - p.y;
      const dist = Math.hypot(dx, dy);
      const radius = Math.max(10, cfg.mouseRadius);
      if (dist < radius) {
        const dir = cfg.mouseMode === 'attract' ? 1 : -1;
        const influence = Math.pow(1 - dist / radius, 2) * cfg.mouseStrength;
        const force = influence * 0.65 * dir;
        p.vx += (dx / (dist || 1)) * force * dt * 60;
        p.vy += (dy / (dist || 1)) * force * dt * 60;
      }
    }

    p.vx *= 0.94;
    p.vy *= 0.94;
    p.x += p.vx * speedScale;
    p.y += p.vy * speedScale;

    if (p.x < 0) {
      p.x = 0;
      p.vx *= -0.65;
    } else if (p.x > width) {
      p.x = width;
      p.vx *= -0.65;
    }

    if (p.y < 0) {
      p.y = 0;
      p.vy *= -0.65;
    } else if (p.y > height) {
      p.y = height;
      p.vy *= -0.65;
    }
  });
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

function drawPaperGrain() {
  if (cfg.paperGrainOpacity <= 0) return;
  const pattern = ctx.createPattern(paperNoiseTile, 'repeat');
  if (!pattern) return;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = clamp(cfg.paperGrainOpacity, 0, 0.25);
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const linkDistance = clamp(cfg.particleLinkDistance, 40, 340);

  for (let i = 0; i < particles.length; i += 1) {
    const a = particles[i];
    for (let j = i + 1; j < particles.length; j += 1) {
      const b = particles[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.hypot(dx, dy);
      if (dist > linkDistance) continue;

      const alpha = Math.pow(1 - dist / linkDistance, 2) * 0.35;
      const color = cfg.colors[(a.colorIndex + b.colorIndex) % cfg.colors.length];
      ctx.strokeStyle = withAlpha(color, alpha);
      ctx.lineWidth = Math.max(0.35, cfg.particleSize * 0.45);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  particles.forEach((p) => {
    const color = cfg.colors[p.colorIndex % cfg.colors.length];
    const core = Math.max(0.3, p.size);
    const glow = Math.max(2.5, p.size * 4.5);

    const gradient = ctx.createRadialGradient(p.x, p.y, core * 0.15, p.x, p.y, glow);
    gradient.addColorStop(0, withAlpha(color, 0.88));
    gradient.addColorStop(1, withAlpha(color, 0));

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, glow, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = withAlpha(color, 0.95);
    ctx.beginPath();
    ctx.arc(p.x, p.y, core, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawOperaDust() {
  const buffers = ensureOperaBuffers();
  const lowW = buffers.lowW;
  const lowH = buffers.lowH;
  const maskCtx = buffers.maskCtx;
  const layerCtx = buffers.layerCtx;
  const dustCtx = buffers.dustCtx;
  const minDim = Math.min(lowW, lowH);
  const centerX = lowW * 0.52;
  const centerY = lowH * 0.59;
  const morph = clamp(cfg.morphAmount, 0, 1);

  maskCtx.clearRect(0, 0, lowW, lowH);
  maskCtx.save();
  maskCtx.filter = 'blur(' + Math.max(14, minDim * 0.09) + 'px)';
  maskCtx.globalAlpha = 0.92;
  maskCtx.fillStyle = '#ffffff';

  for (let i = 0; i < lobes.length; i += 1) {
    const lobe = lobes[i];
    const slow = t * 0.16 * (0.6 + cfg.speed * 0.35);
    const orbit = minDim * (0.09 + i * 0.03) * lobe.orbit;
    let x =
      centerX
      + Math.cos(slow + lobe.phase + i * 0.4) * orbit * morph
      + Math.sin(slow * 0.7 + lobe.phase * 0.8) * lobe.swayX * morph;
    let y =
      centerY
      + Math.sin(slow * 0.82 + lobe.phase - i * 0.35) * orbit * 0.72 * morph
      + Math.cos(slow * 0.64 - lobe.phase * 0.5) * lobe.swayY * morph;

    const push = getScaledMouseOffset(x, y, lowW, lowH, 0.42);
    x += push.x;
    y += push.y;

    const radius = minDim * 0.2 * lobe.size * (0.9 + 0.25 * morph);
    maskCtx.beginPath();
    maskCtx.arc(x, y, radius, 0, Math.PI * 2);
    maskCtx.fill();
  }
  maskCtx.restore();

  layerCtx.clearRect(0, 0, lowW, lowH);
  layerCtx.fillStyle = withAlpha(cfg.colors[0] || '#8894ad', 0.24);
  layerCtx.fillRect(0, 0, lowW, lowH);

  layerCtx.save();
  layerCtx.globalCompositeOperation = 'screen';
  layerCtx.filter = 'blur(' + Math.max(6, minDim * 0.03) + 'px)';
  const colorCount = Math.max(2, cfg.colors.length);
  for (let i = 0; i < colorCount; i += 1) {
    const color = cfg.colors[i % cfg.colors.length];
    const phase = t * (0.11 + i * 0.03) * (0.7 + cfg.speed * 0.28) + i * 0.8;
    const gx = centerX + Math.cos(phase) * minDim * 0.15 * (0.35 + morph * 0.65);
    const gy = centerY + Math.sin(phase * 0.9) * minDim * 0.12 * (0.35 + morph * 0.65);
    const rr = minDim * (0.34 + i * 0.05);
    const g = layerCtx.createRadialGradient(gx, gy, rr * 0.1, gx, gy, rr);
    g.addColorStop(0, withAlpha(color, 0.72));
    g.addColorStop(1, withAlpha(color, 0));
    layerCtx.fillStyle = g;
    layerCtx.beginPath();
    layerCtx.arc(gx, gy, rr, 0, Math.PI * 2);
    layerCtx.fill();
  }
  layerCtx.restore();

  layerCtx.save();
  layerCtx.globalCompositeOperation = 'destination-in';
  layerCtx.drawImage(buffers.mask, 0, 0);
  layerCtx.restore();

  dustCtx.clearRect(0, 0, lowW, lowH);
  const dustPattern = dustCtx.createPattern(dustTile, 'repeat');
  if (dustPattern) {
    dustCtx.save();
    const scale = clamp(cfg.dustScale, 0.5, 3);
    dustCtx.scale(scale, scale);
    dustCtx.globalAlpha = clamp(0.15 + cfg.dustIntensity * 0.95, 0, 1);
    dustCtx.fillStyle = dustPattern;
    dustCtx.fillRect(0, 0, Math.ceil(lowW / scale) + 2, Math.ceil(lowH / scale) + 2);
    dustCtx.restore();
  }

  dustCtx.save();
  dustCtx.globalCompositeOperation = 'destination-in';
  dustCtx.drawImage(buffers.mask, 0, 0);
  dustCtx.restore();

  layerCtx.save();
  layerCtx.globalCompositeOperation = 'overlay';
  layerCtx.globalAlpha = clamp(0.35 + cfg.dustIntensity * 0.75, 0, 1);
  layerCtx.drawImage(buffers.dust, 0, 0);
  layerCtx.restore();

  layerCtx.save();
  layerCtx.globalCompositeOperation = 'source-over';
  layerCtx.filter = 'blur(' + Math.max(2, minDim * 0.01) + 'px)';
  layerCtx.globalAlpha = 0.16;
  layerCtx.drawImage(buffers.mask, 0, 0);
  layerCtx.restore();

  ctx.save();
  ctx.filter = 'blur(' + Math.max(0.6, minDim * 0.005) + 'px)';
  ctx.drawImage(buffers.layer, 0, 0, width, height);
  ctx.restore();
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

function drawOrbit() {
  ctx.save();
  ctx.globalCompositeOperation = cfg.blendMode;
  ctx.filter = 'blur(' + Math.max(20, cfg.blurPx * 0.74) + 'px)';

  let centerX = width * 0.5;
  let centerY = height * 0.5;
  const centerPush = getMouseOffset(centerX, centerY, 1.05);
  centerX += centerPush.x;
  centerY += centerPush.y;

  const minDim = Math.min(width, height);
  const count = Math.max(3, cfg.blobCount);

  for (let i = 0; i < count; i += 1) {
    const orbit = minDim * (0.16 + i * 0.045) * (0.7 + cfg.motionIntensity * 0.35);
    const angle = t * (0.35 + i * 0.035) * (0.8 + cfg.motionIntensity * 0.5) + i * ((Math.PI * 2) / count);
    let x = centerX + Math.cos(angle) * orbit * 1.2;
    let y = centerY + Math.sin(angle * 1.08) * orbit * 0.72;
    const push = getMouseOffset(x, y, 0.8);
    x += push.x;
    y += push.y;

    const r = minDim * Math.max(0.04, 0.12 - i * 0.006);
    const color = cfg.colors[i % cfg.colors.length];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, withAlpha(color, 0.9));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
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

  if (cfg.shapeStyle === 'opera-dust' && !cfg.fullCanvasGradient) {
    drawPaperGrain();
  }

  if (cfg.fullCanvasGradient) {
    ctx.save();
    ctx.globalCompositeOperation = cfg.blendMode;
    ctx.filter = 'blur(' + Math.max(36, cfg.blurPx * 0.7) + 'px)';
    drawFullGradient();
    ctx.restore();
  } else if (cfg.shapeStyle === 'opera-dust') {
    drawOperaDust();
  } else if (cfg.shapeStyle === 'particles') {
    drawParticles();
  } else if (cfg.shapeStyle === 'center') {
    drawCenterMorph();
  } else if (cfg.shapeStyle === 'orbit') {
    drawOrbit();
  } else {
    drawMesh();
  }

  drawMouseField();

  const noise = ctx.createPattern(noiseTile, 'repeat');
  const grainOpacity = cfg.shapeStyle === 'opera-dust'
    ? cfg.grainOpacity * 0.45
    : cfg.grainOpacity;
  if (noise && grainOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = grainOpacity;
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
  reseedParticles();
  reseedLobes();
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
  if (cfg.shapeStyle === 'particles' && !cfg.fullCanvasGradient) {
    updateParticles(dt);
  }
  draw();
  raf = requestAnimationFrame(loop);
}

resize();
reseedLobes();
draw();

if (isAnimating()) {
  raf = requestAnimationFrame(loop);
}

const ro = new ResizeObserver(() => {
  resize();
  draw();
});
ro.observe(mount);

function makeNoiseTile(size) {
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const c = tile.getContext('2d');
  if (!c) return tile;
  const img = c.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  return tile;
}

function makePaperNoiseTile(size) {
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const c = tile.getContext('2d');
  if (!c) return tile;
  const img = c.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const base = 220 + ((Math.random() * 34) | 0);
    img.data[i] = base;
    img.data[i + 1] = base - ((Math.random() * 6) | 0);
    img.data[i + 2] = base - ((Math.random() * 3) | 0);
    img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  return tile;
}

function makeSpeckleTile(size, contrast) {
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const c = tile.getContext('2d');
  if (!c) return tile;
  const img = c.createImageData(size, size);
  const gain = 1 + clamp(contrast, 0, 2) * 4.2;
  for (let i = 0; i < img.data.length; i += 4) {
    const sample = Math.random();
    const boosted = clamp((sample - 0.5) * gain + 0.5, 0, 1);
    let luminance = 0;
    let alpha = 0;
    if (boosted > 0.62) {
      luminance = 255;
      alpha = 120 + ((Math.random() * 120) | 0);
    } else if (boosted < 0.38) {
      luminance = 0;
      alpha = 90 + ((Math.random() * 120) | 0);
    }
    img.data[i] = luminance;
    img.data[i + 1] = luminance;
    img.data[i + 2] = luminance;
    img.data[i + 3] = alpha;
  }
  c.putImageData(img, 0, 0);
  return tile;
}

// cleanup example:
// cancelAnimationFrame(raf); ro.disconnect();`;
}

function buildSvgJsSnippet(config: RenderConfig): string {
  const cfg = {
    colors: config.colors,
    background: config.background,
    shapeStyle: config.shapeStyle,
    paused: config.paused,
    speed: config.speed,
    motionIntensity: config.motionIntensity,
    centerBlobScale: config.centerBlobScale,
    centerOffsetX: config.centerOffsetX,
    centerOffsetY: config.centerOffsetY,
    grainOpacity: config.grainOpacity,
    waveCount: config.waveCount,
    fullCanvasGradient: config.fullCanvasGradient,
    mouseInteraction: config.mouseInteraction,
    mouseMode: config.mouseMode,
    mouseStrength: config.mouseStrength,
    mouseRadius: config.mouseRadius,
  };

  return `const mount = document.getElementById('grainy-blobber');
if (!mount) throw new Error('Missing #grainy-blobber element');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const cfg = ${JSON.stringify(cfg, null, 2)};

const NS = 'http://www.w3.org/2000/svg';
const svg = document.createElementNS(NS, 'svg');
svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
svg.setAttribute('aria-hidden', 'true');
mount.prepend(svg);

const bg = document.createElementNS(NS, 'rect');
const grain = document.createElementNS(NS, 'rect');
const mouseGlow = document.createElementNS(NS, 'circle');
mouseGlow.style.mixBlendMode = 'soft-light';
mouseGlow.setAttribute('opacity', '0');
svg.append(bg);

const defs = document.createElementNS(NS, 'defs');
const filter = document.createElementNS(NS, 'filter');
filter.setAttribute('id', 'grain-filter');
const turbulence = document.createElementNS(NS, 'feTurbulence');
turbulence.setAttribute('type', 'fractalNoise');
turbulence.setAttribute('baseFrequency', '0.85');
turbulence.setAttribute('numOctaves', '2');
filter.appendChild(turbulence);
defs.appendChild(filter);
svg.appendChild(defs);

const layers = document.createElementNS(NS, 'g');
svg.appendChild(layers);
svg.appendChild(mouseGlow);

grain.setAttribute('filter', 'url(#grain-filter)');
grain.setAttribute('fill', '#fff');
svg.append(grain);

let width = 0;
let height = 0;
let t = 0;
let raf = 0;
let last = performance.now();

const pointer = { x: 0, y: 0, inside: false };
const waveNodes = [];
const centerNodes = [];
const ringNodes = [];
const gradientNodes = [];

function random(min, max) {
  return min + Math.random() * (max - min);
}

function resolveShapeStyle() {
  return cfg.shapeStyle === 'center' || cfg.shapeStyle === 'rings' || cfg.shapeStyle === 'waves'
    ? cfg.shapeStyle
    : 'waves';
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
  const mag = force * radius * 0.4;
  return { x: nx * mag * sign, y: ny * mag * sign };
}

function buildWavePath(baseY, amp, freq, phase) {
  const seg = 10;
  const step = width / seg;
  let d = 'M 0 ' + height + ' L 0 ' + baseY;
  for (let i = 0; i < seg; i += 1) {
    const x1 = i * step;
    const x2 = (i + 1) * step;
    const cx = x1 + step / 2;
    const y1 = baseY + Math.sin((x1 / width) * Math.PI * 2 * freq + phase) * amp;
    const y2 = baseY + Math.sin((x2 / width) * Math.PI * 2 * freq + phase) * amp;
    d += ' Q ' + cx + ' ' + ((y1 + y2) / 2) + ' ' + x2 + ' ' + y2;
  }
  return d + ' L ' + width + ' ' + height + ' Z';
}

function buildMorphBlobPath(cx, cy, radius, phase) {
  const seg = 30;
  let d = '';
  for (let i = 0; i <= seg; i += 1) {
    const a = (i / seg) * Math.PI * 2;
    const wobble =
      1
      + Math.sin(a * 3 + phase * 1.2) * (0.12 + cfg.motionIntensity * 0.04)
      + Math.cos(a * 5 - phase * 0.9) * (0.06 + cfg.motionIntensity * 0.02);
    const rr = radius * wobble;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    d += (i === 0 ? 'M ' : ' L ') + x + ' ' + y;
  }
  return d + ' Z';
}

function rebuild() {
  layers.replaceChildren();
  waveNodes.length = 0;
  centerNodes.length = 0;
  ringNodes.length = 0;
  gradientNodes.length = 0;

  if (cfg.fullCanvasGradient) {
    for (let i = 0; i < Math.max(3, cfg.colors.length); i += 1) {
      const ellipse = document.createElementNS(NS, 'ellipse');
      layers.appendChild(ellipse);
      gradientNodes.push({ node: ellipse, px: random(0, Math.PI * 2), py: random(0, Math.PI * 2), mx: random(width * 0.06, width * 0.2), my: random(height * 0.06, height * 0.2) });
    }
    return;
  }

  const shape = resolveShapeStyle();

  if (shape === 'center') {
    for (let i = 0; i < Math.max(2, cfg.colors.length); i += 1) {
      const path = document.createElementNS(NS, 'path');
      layers.appendChild(path);
      centerNodes.push({ node: path, phase: random(0, Math.PI * 2), speed: random(0.6, 1.24), scale: 0.72 + i * 0.12 });
    }
    return;
  }

  if (shape === 'rings') {
    for (let i = 0; i < Math.max(3, cfg.waveCount); i += 1) {
      const ellipse = document.createElementNS(NS, 'ellipse');
      layers.appendChild(ellipse);
      ringNodes.push({ node: ellipse, phase: random(0, Math.PI * 2), speed: random(0.6, 1.25), scale: 0.28 + i * 0.09 });
    }
    return;
  }

  for (let i = 0; i < Math.max(2, cfg.waveCount); i += 1) {
    const path = document.createElementNS(NS, 'path');
    layers.appendChild(path);
    waveNodes.push({ node: path, baseY: 0, amp: 0, freq: random(1.3, 2.8), phase: random(0, Math.PI * 2), speed: random(0.6, 1.3) });
  }
}

function resize() {
  const rect = mount.getBoundingClientRect();
  width = Math.max(2, Math.floor(rect.width));
  height = Math.max(2, Math.floor(rect.height));
  svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  bg.setAttribute('width', String(width));
  bg.setAttribute('height', String(height));
  grain.setAttribute('width', String(width));
  grain.setAttribute('height', String(height));

  waveNodes.forEach((layer, i) => {
    layer.baseY = height * (0.2 + (i / (waveNodes.length + 1)) * 0.72);
    layer.amp = height * random(0.04, 0.1);
  });
}

function drawMouseGlow() {
  if (!cfg.mouseInteraction || !pointer.inside) {
    mouseGlow.setAttribute('opacity', '0');
    return;
  }
  mouseGlow.setAttribute('cx', String(pointer.x));
  mouseGlow.setAttribute('cy', String(pointer.y));
  mouseGlow.setAttribute('r', String(cfg.mouseRadius * 0.52));
  mouseGlow.setAttribute('fill', cfg.mouseMode === 'repel' ? cfg.colors[0] : (cfg.colors[1] || cfg.colors[0]));
  mouseGlow.setAttribute('opacity', '0.22');
}

function draw() {
  bg.setAttribute('fill', cfg.background);
  grain.setAttribute('opacity', String(cfg.grainOpacity));

  if (cfg.fullCanvasGradient) {
    gradientNodes.forEach((layer, i) => {
      let cx = width * 0.5 + Math.sin(t * 0.7 + layer.px) * layer.mx * cfg.motionIntensity;
      let cy = height * 0.5 + Math.cos(t * 0.6 + layer.py) * layer.my * cfg.motionIntensity;
      const push = getMouseOffset(cx, cy, 0.5);
      cx += push.x;
      cy += push.y;
      layer.node.setAttribute('cx', String(cx));
      layer.node.setAttribute('cy', String(cy));
      layer.node.setAttribute('rx', String(width * (0.42 + i * 0.07)));
      layer.node.setAttribute('ry', String(height * (0.3 + i * 0.06)));
      layer.node.setAttribute('fill', cfg.colors[i % cfg.colors.length]);
      layer.node.setAttribute('fill-opacity', '0.42');
    });

    drawMouseGlow();
    return;
  }

  const shape = resolveShapeStyle();

  if (shape === 'center') {
    const centerOffsetX = width * (clamp(cfg.centerOffsetX, -45, 45) / 100);
    const centerOffsetY = height * (clamp(cfg.centerOffsetY, -45, 45) / 100);
    let centerX = width * 0.5 + centerOffsetX + Math.sin(t * 0.3) * width * 0.04 * cfg.motionIntensity;
    let centerY = height * 0.5 + centerOffsetY + Math.cos(t * 0.24) * height * 0.04 * cfg.motionIntensity;
    const cp = getMouseOffset(centerX, centerY, 1);
    centerX += cp.x;
    centerY += cp.y;
    const minDim = Math.min(width, height);

    centerNodes.forEach((layer, i) => {
      const phase = layer.phase + t * layer.speed * (0.7 + cfg.motionIntensity * 0.5);
      const radius = (minDim * 0.22 * layer.scale + minDim * 0.12) * (0.85 + cfg.motionIntensity * 0.15) * clamp(cfg.centerBlobScale, 0.5, 2);
      const cx = centerX + Math.sin(phase * 0.6 + i) * width * 0.02 * cfg.motionIntensity;
      const cy = centerY + Math.cos(phase * 0.5 + i) * height * 0.02 * cfg.motionIntensity;
      layer.node.setAttribute('d', buildMorphBlobPath(cx, cy, radius, phase));
      layer.node.setAttribute('fill', cfg.colors[i % cfg.colors.length]);
      layer.node.setAttribute('fill-opacity', String(0.38 + i * 0.08));
    });

    drawMouseGlow();
    return;
  }

  if (shape === 'rings') {
    let centerX = width * 0.5;
    let centerY = height * 0.5;
    const cp = getMouseOffset(centerX, centerY, 1.15);
    centerX += cp.x;
    centerY += cp.y;
    const stroke = Math.max(10, Math.round(Math.min(width, height) * 0.03));

    ringNodes.forEach((layer, i) => {
      const phase = layer.phase + t * layer.speed * (0.7 + cfg.motionIntensity * 0.5);
      const rx = width * layer.scale * (0.78 + Math.sin(phase * 0.8) * 0.06 * cfg.motionIntensity);
      const ry = height * layer.scale * (0.56 + Math.cos(phase * 0.84) * 0.08 * cfg.motionIntensity);
      const cx = centerX + Math.sin(phase * 0.43) * width * 0.03 * cfg.motionIntensity;
      const cy = centerY + Math.cos(phase * 0.36) * height * 0.03 * cfg.motionIntensity;
      layer.node.setAttribute('cx', String(cx));
      layer.node.setAttribute('cy', String(cy));
      layer.node.setAttribute('rx', String(Math.max(8, rx)));
      layer.node.setAttribute('ry', String(Math.max(8, ry)));
      layer.node.setAttribute('fill', 'none');
      layer.node.setAttribute('stroke', cfg.colors[i % cfg.colors.length]);
      layer.node.setAttribute('stroke-width', String(stroke));
      layer.node.setAttribute('stroke-opacity', String(0.24 + (i / Math.max(1, ringNodes.length)) * 0.26));
    });

    drawMouseGlow();
    return;
  }

  waveNodes.forEach((layer, i) => {
    const phase = layer.phase + t * layer.speed * (0.75 + cfg.motionIntensity * 0.45);
    const amp = layer.amp * (0.7 + cfg.motionIntensity * 0.5);
    layer.node.setAttribute('d', buildWavePath(layer.baseY, amp, layer.freq, phase));
    layer.node.setAttribute('fill', cfg.colors[i % cfg.colors.length]);
    layer.node.setAttribute('fill-opacity', String(0.34 + (i / Math.max(1, waveNodes.length)) * 0.3));
  });

  drawMouseGlow();
}

svg.addEventListener('pointermove', (event) => {
  const rect = svg.getBoundingClientRect();
  pointer.x = event.clientX - rect.left;
  pointer.y = event.clientY - rect.top;
  pointer.inside = true;
  if (reduceMotion || cfg.paused) draw();
}, { passive: true });

svg.addEventListener('pointerleave', () => {
  pointer.inside = false;
  if (reduceMotion || cfg.paused) draw();
}, { passive: true });

function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  t += dt * cfg.speed * 1.25;
  draw();
  raf = requestAnimationFrame(loop);
}

resize();
rebuild();
draw();

if (!reduceMotion && !cfg.paused) {
  raf = requestAnimationFrame(loop);
}

const ro = new ResizeObserver(() => {
  resize();
  rebuild();
  draw();
});
ro.observe(mount);

// cleanup example:
// cancelAnimationFrame(raf); ro.disconnect();`;
}

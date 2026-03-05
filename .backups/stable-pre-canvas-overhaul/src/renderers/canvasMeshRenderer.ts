import { triggerBlobDownload } from '../export/download';
import type {
  ClipRecordOptions,
  ClipRecordResult,
  RenderConfig,
  RendererCallbacks,
  RendererHandle,
} from './types';

interface BlobNode {
  anchorX: number;
  anchorY: number;
  radius: number;
  phaseX: number;
  phaseY: number;
  driftX: number;
  driftY: number;
}

interface ParticleNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  colorIndex: number;
  phase: number;
  speed: number;
}

interface OperaLobe {
  phase: number;
  orbit: number;
  size: number;
  swayX: number;
  swayY: number;
}

interface OperaBuffers {
  lowW: number;
  lowH: number;
  scale: number;
  layer: HTMLCanvasElement;
  layerCtx: CanvasRenderingContext2D;
  mask: HTMLCanvasElement;
  maskCtx: CanvasRenderingContext2D;
  dust: HTMLCanvasElement;
  dustCtx: CanvasRenderingContext2D;
}

interface PointerState {
  x: number;
  y: number;
  inside: boolean;
}

const OPERA_LOW_RES_SCALE = 0.5;

export function createCanvasMeshRenderer(
  mount: HTMLElement,
  initialConfig: RenderConfig,
  callbacks: RendererCallbacks = {},
): RendererHandle {
  const canvas = document.createElement('canvas');
  canvas.className = 'gb-canvas';
  mount.replaceChildren(canvas);

  const maybeCtx = canvas.getContext('2d', { alpha: true });
  if (!maybeCtx) {
    throw new Error('Canvas 2D context is not available in this browser.');
  }
  const ctx: CanvasRenderingContext2D = maybeCtx;

  let config = initialConfig;
  let width = 0;
  let height = 0;
  let dpr = resolveDpr(config.maxDpr);
  let noiseTile = makeNoiseTile(180);
  let paperNoiseTile = makePaperNoiseTile(220);
  let dustTile = makeSpeckleTile(200, config.dustContrast);
  let blobs: BlobNode[] = [];
  let particles: ParticleNode[] = [];
  let operaLobes: OperaLobe[] = [];
  let operaBuffers: OperaBuffers | null = null;
  let rafId = 0;
  let time = 0;
  let lastTs = performance.now();
  const pointer: PointerState = { x: 0, y: 0, inside: false };

  const resizeObserver = new ResizeObserver(() => {
    resize();
    reseedBlobs();
    reseedParticles();
    reseedOperaLobes();
    renderFrame();
  });

  const onPointerMove = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    pointer.inside = true;
    if (!isAnimating(config)) {
      renderFrame();
    }
  };

  const onPointerLeave = () => {
    pointer.inside = false;
    if (!isAnimating(config)) {
      renderFrame();
    }
  };

  canvas.addEventListener('pointermove', onPointerMove, { passive: true });
  canvas.addEventListener('pointerleave', onPointerLeave, { passive: true });

  resizeObserver.observe(mount);
  resize();
  reseedBlobs();
  reseedParticles();
  reseedOperaLobes();
  renderFrame();

  if (isAnimating(config)) {
    startLoop();
  }

  function resize(): void {
    dpr = resolveDpr(config.maxDpr);
    const rect = mount.getBoundingClientRect();
    width = Math.max(2, Math.floor(rect.width));
    height = Math.max(2, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const nextOperaBuffers = ensureOperaBuffers(operaBuffers, width, height);
    operaBuffers = nextOperaBuffers;
  }

  function reseedBlobs(): void {
    const minDim = Math.max(80, Math.min(width, height));
    const total = Math.max(2, config.blobCount);

    blobs = Array.from({ length: total }).map(() => {
      const radius = rand(minDim * 0.1, minDim * 0.32);
      return {
        anchorX: rand(radius * 0.6, Math.max(radius * 0.6 + 2, width - radius * 0.6)),
        anchorY: rand(radius * 0.6, Math.max(radius * 0.6 + 2, height - radius * 0.6)),
        radius,
        phaseX: rand(0, Math.PI * 2),
        phaseY: rand(0, Math.PI * 2),
        driftX: rand(width * 0.04, width * 0.12),
        driftY: rand(height * 0.04, height * 0.12),
      };
    });
  }

  function reseedParticles(): void {
    const count = clampInt(config.particleCount, 20, 340);
    const colorCount = Math.max(1, config.colors.length);
    particles = Array.from({ length: count }).map((_, index) => ({
      x: rand(0, width),
      y: rand(0, height),
      vx: rand(-0.2, 0.2),
      vy: rand(-0.2, 0.2),
      size: config.particleSize * rand(0.7, 1.35),
      colorIndex: index % colorCount,
      phase: rand(0, Math.PI * 2),
      speed: rand(0.7, 1.55),
    }));
  }

  function reseedOperaLobes(): void {
    const count = clampInt(config.lobeCount, 2, 6);
    operaLobes = Array.from({ length: count }).map((_, index) => ({
      phase: rand(0, Math.PI * 2),
      orbit: 0.8 + index * 0.08 + rand(-0.1, 0.1),
      size: rand(0.72, 1.18),
      swayX: rand(5, 26),
      swayY: rand(4, 20),
    }));
  }

  function startLoop(): void {
    if (rafId !== 0 || !isAnimating(config)) {
      return;
    }
    lastTs = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop(): void {
    if (rafId === 0) {
      return;
    }
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function tick(ts: number): void {
    const dt = Math.min(0.033, (ts - lastTs) / 1000);
    lastTs = ts;
    time += dt * config.speed * 1.35;

    if (config.shapeStyle === 'particles' && !config.fullCanvasGradient) {
      updateParticles(dt);
    }

    const drawStart = performance.now();
    renderFrame();
    const drawMs = performance.now() - drawStart;
    callbacks.onFrame?.(drawMs, ts);

    rafId = requestAnimationFrame(tick);
  }

  function updateParticles(dt: number): void {
    const linkMotion = 0.06 * config.motionIntensity;
    const speedScale = 0.7 + config.speed * 0.7;

    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      if (!p) {
        continue;
      }

      const driftX = Math.cos(time * p.speed + p.phase) * linkMotion;
      const driftY = Math.sin(time * p.speed * 0.82 + p.phase) * linkMotion;
      p.vx += driftX * dt * 60;
      p.vy += driftY * dt * 60;

      if (config.mouseInteraction && pointer.inside) {
        const dx = pointer.x - p.x;
        const dy = pointer.y - p.y;
        const dist = Math.hypot(dx, dy);
        const radius = Math.max(10, config.mouseRadius);

        if (dist < radius) {
          const dir = config.mouseMode === 'attract' ? 1 : -1;
          const influence = Math.pow(1 - dist / radius, 2) * config.mouseStrength;
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
    }
  }

  function renderFrame(targetCtx: CanvasRenderingContext2D = ctx, targetW = width, targetH = height): void {
    targetCtx.save();
    targetCtx.clearRect(0, 0, targetW, targetH);

    targetCtx.fillStyle = config.background;
    targetCtx.fillRect(0, 0, targetW, targetH);

    if (config.shapeStyle === 'opera-dust' && !config.fullCanvasGradient) {
      drawPaperGrain(targetCtx, targetW, targetH);
    }

    if (config.fullCanvasGradient) {
      drawGradientField(targetCtx, targetW, targetH);
    } else if (config.shapeStyle === 'opera-dust') {
      drawOperaDustBlob(targetCtx, targetW, targetH);
    } else if (config.shapeStyle === 'particles') {
      drawParticleField(targetCtx, targetW, targetH);
    } else if (config.shapeStyle === 'center') {
      drawCenterMorphBlob(targetCtx, targetW, targetH);
    } else if (config.shapeStyle === 'orbit') {
      drawOrbitBlobs(targetCtx, targetW, targetH);
    } else {
      drawBlobMesh(targetCtx, targetW, targetH);
    }

    drawMouseField(targetCtx, targetW, targetH);

    const grainOpacity = config.shapeStyle === 'opera-dust'
      ? config.grainOpacity * 0.45
      : config.grainOpacity;
    drawGrain(targetCtx, targetW, targetH, grainOpacity);

    targetCtx.restore();
  }

  function drawOperaDustBlob(targetCtx: CanvasRenderingContext2D, targetW: number, targetH: number): void {
    const buffers = ensureOperaBuffers(operaBuffers, targetW, targetH);
    operaBuffers = buffers;

    const { layer, layerCtx, mask, maskCtx, dust, dustCtx, lowW, lowH } = buffers;
    const minDim = Math.min(lowW, lowH);
    const centerX = lowW * 0.52;
    const centerY = lowH * 0.59;
    const morph = clamp(config.morphAmount, 0, 1);

    maskCtx.clearRect(0, 0, lowW, lowH);
    maskCtx.save();
    maskCtx.filter = `blur(${Math.max(14, minDim * 0.09)}px)`;
    maskCtx.globalAlpha = 0.92;
    maskCtx.fillStyle = '#ffffff';

    for (let i = 0; i < operaLobes.length; i += 1) {
      const lobe = operaLobes[i];
      if (!lobe) {
        continue;
      }

      const slowTime = time * 0.16 * (0.6 + config.speed * 0.35);
      const orbitRadius = minDim * (0.09 + i * 0.03) * lobe.orbit;
      let x =
        centerX
        + Math.cos(slowTime + lobe.phase + i * 0.4) * orbitRadius * morph
        + Math.sin(slowTime * 0.7 + lobe.phase * 0.8) * lobe.swayX * morph;
      let y =
        centerY
        + Math.sin(slowTime * 0.82 + lobe.phase - i * 0.35) * orbitRadius * 0.72 * morph
        + Math.cos(slowTime * 0.64 - lobe.phase * 0.5) * lobe.swayY * morph;

      const push = getScaledMouseOffset(
        x,
        y,
        lowW,
        lowH,
        targetW,
        targetH,
        0.42,
      );
      x += push.x;
      y += push.y;

      const radius = minDim * 0.2 * lobe.size * (0.9 + 0.25 * morph);
      maskCtx.beginPath();
      maskCtx.arc(x, y, radius, 0, Math.PI * 2);
      maskCtx.fill();
    }
    maskCtx.restore();

    layerCtx.clearRect(0, 0, lowW, lowH);
    layerCtx.fillStyle = withAlpha(config.colors[0] ?? '#8894ad', 0.24);
    layerCtx.fillRect(0, 0, lowW, lowH);

    layerCtx.save();
    layerCtx.globalCompositeOperation = 'screen';
    layerCtx.filter = `blur(${Math.max(6, minDim * 0.03)}px)`;
    const colorCount = Math.max(2, config.colors.length);
    for (let i = 0; i < colorCount; i += 1) {
      const color = config.colors[i % config.colors.length] ?? '#7f8aa6';
      const phase = time * (0.11 + i * 0.03) * (0.7 + config.speed * 0.28) + i * 0.8;
      const gx = centerX + Math.cos(phase) * minDim * 0.15 * (0.35 + morph * 0.65);
      const gy = centerY + Math.sin(phase * 0.9) * minDim * 0.12 * (0.35 + morph * 0.65);
      const radius = minDim * (0.34 + i * 0.05);
      const gradient = layerCtx.createRadialGradient(gx, gy, radius * 0.1, gx, gy, radius);
      gradient.addColorStop(0, withAlpha(color, 0.72));
      gradient.addColorStop(1, withAlpha(color, 0));

      layerCtx.fillStyle = gradient;
      layerCtx.beginPath();
      layerCtx.arc(gx, gy, radius, 0, Math.PI * 2);
      layerCtx.fill();
    }
    layerCtx.restore();

    layerCtx.save();
    layerCtx.globalCompositeOperation = 'destination-in';
    layerCtx.drawImage(mask, 0, 0);
    layerCtx.restore();

    dustCtx.clearRect(0, 0, lowW, lowH);
    const pattern = dustCtx.createPattern(dustTile, 'repeat');
    if (pattern) {
      dustCtx.save();
      const scale = clamp(config.dustScale, 0.5, 3);
      dustCtx.scale(scale, scale);
      dustCtx.globalAlpha = clamp(0.15 + config.dustIntensity * 0.95, 0, 1);
      dustCtx.fillStyle = pattern;
      dustCtx.fillRect(0, 0, Math.ceil(lowW / scale) + 2, Math.ceil(lowH / scale) + 2);
      dustCtx.restore();
    }

    dustCtx.save();
    dustCtx.globalCompositeOperation = 'destination-in';
    dustCtx.drawImage(mask, 0, 0);
    dustCtx.restore();

    layerCtx.save();
    layerCtx.globalCompositeOperation = 'overlay';
    layerCtx.globalAlpha = clamp(0.35 + config.dustIntensity * 0.75, 0, 1);
    layerCtx.drawImage(dust, 0, 0);
    layerCtx.restore();

    layerCtx.save();
    layerCtx.globalCompositeOperation = 'source-over';
    layerCtx.filter = `blur(${Math.max(2, minDim * 0.01)}px)`;
    layerCtx.globalAlpha = 0.16;
    layerCtx.drawImage(mask, 0, 0);
    layerCtx.restore();

    targetCtx.save();
    targetCtx.imageSmoothingEnabled = true;
    targetCtx.filter = `blur(${Math.max(0.6, minDim * 0.005)}px)`;
    targetCtx.drawImage(layer, 0, 0, targetW, targetH);
    targetCtx.restore();
  }

  function drawParticleField(targetCtx: CanvasRenderingContext2D, targetW: number, targetH: number): void {
    const linkDistance = clamp(config.particleLinkDistance, 40, 340);

    targetCtx.save();
    targetCtx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < particles.length; i += 1) {
      const a = particles[i];
      if (!a) {
        continue;
      }

      for (let j = i + 1; j < particles.length; j += 1) {
        const b = particles[j];
        if (!b) {
          continue;
        }

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);

        if (dist > linkDistance) {
          continue;
        }

        const alpha = Math.pow(1 - dist / linkDistance, 2) * 0.35;
        const color = config.colors[(a.colorIndex + b.colorIndex) % config.colors.length] ?? '#00f5ff';

        targetCtx.strokeStyle = withAlpha(color, alpha);
        targetCtx.lineWidth = Math.max(0.35, config.particleSize * 0.45);
        targetCtx.beginPath();
        targetCtx.moveTo(a.x, a.y);
        targetCtx.lineTo(b.x, b.y);
        targetCtx.stroke();
      }
    }

    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      if (!p) {
        continue;
      }

      const color = config.colors[p.colorIndex % config.colors.length] ?? '#00f5ff';
      const core = Math.max(0.3, p.size);
      const glow = Math.max(2.5, p.size * 4.5);

      const gradient = targetCtx.createRadialGradient(p.x, p.y, core * 0.15, p.x, p.y, glow);
      gradient.addColorStop(0, withAlpha(color, 0.88));
      gradient.addColorStop(1, withAlpha(color, 0));

      targetCtx.fillStyle = gradient;
      targetCtx.beginPath();
      targetCtx.arc(p.x, p.y, glow, 0, Math.PI * 2);
      targetCtx.fill();

      targetCtx.fillStyle = withAlpha(color, 0.95);
      targetCtx.beginPath();
      targetCtx.arc(p.x, p.y, core, 0, Math.PI * 2);
      targetCtx.fill();
    }

    targetCtx.restore();

    targetCtx.save();
    targetCtx.globalCompositeOperation = 'source-over';
    targetCtx.fillStyle = withAlpha(config.background, 0.1);
    targetCtx.fillRect(0, 0, targetW, targetH);
    targetCtx.restore();
  }

  function drawGradientField(targetCtx: CanvasRenderingContext2D, targetW: number, targetH: number): void {
    targetCtx.save();
    targetCtx.globalCompositeOperation = config.blendMode;
    targetCtx.filter = `blur(${Math.max(36, config.blurPx * 0.7)}px)`;

    const count = Math.max(3, config.colors.length);
    const driftScale = 0.2 * (0.6 + config.motionIntensity * 0.5);
    for (let i = 0; i < count; i += 1) {
      const color = config.colors[i % config.colors.length] ?? '#3b82f6';
      const nx = 0.5 + Math.sin(time * 0.55 + i * 1.11) * driftScale;
      const ny = 0.5 + Math.cos(time * 0.47 + i * 1.37) * driftScale;
      let cx = nx * targetW;
      let cy = ny * targetH;
      const radius = Math.max(targetW, targetH) * (0.46 + i * 0.08);

      const push = getMouseOffset(cx, cy, 0.45);
      cx += push.x;
      cy += push.y;

      const gradient = targetCtx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
      gradient.addColorStop(0, withAlpha(color, 0.88));
      gradient.addColorStop(1, withAlpha(color, 0));

      targetCtx.fillStyle = gradient;
      targetCtx.beginPath();
      targetCtx.arc(cx, cy, radius, 0, Math.PI * 2);
      targetCtx.fill();
    }

    targetCtx.restore();
  }

  function drawBlobMesh(targetCtx: CanvasRenderingContext2D, targetW: number, targetH: number): void {
    targetCtx.save();
    targetCtx.globalCompositeOperation = config.blendMode;
    targetCtx.filter = `blur(${config.blurPx}px)`;

    for (let i = 0; i < blobs.length; i += 1) {
      const blob = blobs[i];
      if (!blob) {
        continue;
      }

      let x = blob.anchorX + Math.sin(time + blob.phaseX) * blob.driftX * config.motionIntensity;
      let y = blob.anchorY + Math.cos(time * 0.92 + blob.phaseY) * blob.driftY * config.motionIntensity;
      const push = getMouseOffset(x, y, 0.7);
      x += push.x;
      y += push.y;

      const color = config.colors[i % config.colors.length] ?? '#3b82f6';
      const gradient = targetCtx.createRadialGradient(x, y, 0, x, y, blob.radius);
      gradient.addColorStop(0, withAlpha(color, 0.92));
      gradient.addColorStop(1, withAlpha(color, 0));

      targetCtx.fillStyle = gradient;
      targetCtx.beginPath();
      targetCtx.arc(x, y, blob.radius, 0, Math.PI * 2);
      targetCtx.fill();
    }

    targetCtx.restore();

    targetCtx.save();
    targetCtx.globalCompositeOperation = 'source-over';
    targetCtx.fillStyle = withAlpha(config.background, 0.16);
    targetCtx.fillRect(0, 0, targetW, targetH);
    targetCtx.restore();
  }

  function drawCenterMorphBlob(targetCtx: CanvasRenderingContext2D, targetW: number, targetH: number): void {
    targetCtx.save();
    targetCtx.globalCompositeOperation = config.blendMode;
    targetCtx.filter = `blur(${Math.max(20, config.blurPx * 0.6)}px)`;

    const minDim = Math.min(targetW, targetH);
    const baseRadius = minDim * 0.28 * clamp(config.centerBlobScale, 0.5, 2);
    const offsetX = targetW * (clamp(config.centerOffsetX, -45, 45) / 100);
    const offsetY = targetH * (clamp(config.centerOffsetY, -45, 45) / 100);
    let centerX = targetW * 0.5 + offsetX + Math.sin(time * 0.35) * targetW * 0.03 * config.motionIntensity;
    let centerY = targetH * 0.5 + offsetY + Math.cos(time * 0.28) * targetH * 0.03 * config.motionIntensity;
    const centerPush = getMouseOffset(centerX, centerY, 1);
    centerX += centerPush.x;
    centerY += centerPush.y;

    const layers = Math.max(2, config.colors.length);
    for (let i = 0; i < layers; i += 1) {
      const color = config.colors[i % config.colors.length] ?? '#3b82f6';
      const scale = 1 + i * 0.08;
      const phase = time * (0.8 + i * 0.12) + i * 1.27;
      const offsetX = Math.sin(time * 0.48 + i) * targetW * 0.02 * config.motionIntensity;
      const offsetY = Math.cos(time * 0.43 + i * 0.9) * targetH * 0.02 * config.motionIntensity;
      const radius = baseRadius * scale;

      targetCtx.beginPath();
      traceMorphPath(targetCtx, centerX + offsetX, centerY + offsetY, radius, phase, config.motionIntensity);

      const gradient = targetCtx.createRadialGradient(
        centerX + offsetX,
        centerY + offsetY,
        radius * 0.12,
        centerX + offsetX,
        centerY + offsetY,
        radius,
      );
      gradient.addColorStop(0, withAlpha(color, 0.9));
      gradient.addColorStop(1, withAlpha(color, 0));
      targetCtx.fillStyle = gradient;
      targetCtx.fill();
    }

    targetCtx.restore();
  }

  function drawOrbitBlobs(targetCtx: CanvasRenderingContext2D, targetW: number, targetH: number): void {
    targetCtx.save();
    targetCtx.globalCompositeOperation = config.blendMode;
    targetCtx.filter = `blur(${Math.max(20, config.blurPx * 0.74)}px)`;

    let centerX = targetW * 0.5;
    let centerY = targetH * 0.5;
    const minDim = Math.min(targetW, targetH);
    const count = Math.max(3, config.blobCount);

    const centerPush = getMouseOffset(centerX, centerY, 1.05);
    centerX += centerPush.x;
    centerY += centerPush.y;

    for (let i = 0; i < count; i += 1) {
      const orbitRadius = minDim * (0.16 + i * 0.045) * (0.7 + config.motionIntensity * 0.35);
      const angle = time * (0.35 + i * 0.035) * (0.8 + config.motionIntensity * 0.5) + i * ((Math.PI * 2) / count);
      let x = centerX + Math.cos(angle) * orbitRadius * 1.2;
      let y = centerY + Math.sin(angle * 1.08) * orbitRadius * 0.72;
      const blobRadius = minDim * clamp(0.12 - i * 0.006, 0.04, 0.14);
      const push = getMouseOffset(x, y, 0.8);
      x += push.x;
      y += push.y;

      const color = config.colors[i % config.colors.length] ?? '#3b82f6';
      const gradient = targetCtx.createRadialGradient(x, y, 0, x, y, blobRadius);
      gradient.addColorStop(0, withAlpha(color, 0.9));
      gradient.addColorStop(1, withAlpha(color, 0));

      targetCtx.fillStyle = gradient;
      targetCtx.beginPath();
      targetCtx.arc(x, y, blobRadius, 0, Math.PI * 2);
      targetCtx.fill();
    }

    const core = targetCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, minDim * 0.24);
    core.addColorStop(0, withAlpha(config.colors[0] ?? '#3b82f6', 0.7));
    core.addColorStop(1, withAlpha(config.colors[0] ?? '#3b82f6', 0));
    targetCtx.fillStyle = core;
    targetCtx.beginPath();
    targetCtx.arc(centerX, centerY, minDim * 0.24, 0, Math.PI * 2);
    targetCtx.fill();

    targetCtx.restore();
  }

  function drawMouseField(targetCtx: CanvasRenderingContext2D, targetW: number, targetH: number): void {
    if (!config.mouseInteraction || !pointer.inside) {
      return;
    }

    const radius = Math.max(20, config.mouseRadius);
    const color = config.mouseMode === 'repel'
      ? withAlpha(config.colors[0] ?? '#ffffff', 0.2)
      : withAlpha(config.colors[1] ?? '#ffffff', 0.18);

    const gradient = targetCtx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    targetCtx.save();
    targetCtx.globalCompositeOperation = 'soft-light';
    targetCtx.fillStyle = gradient;
    targetCtx.fillRect(0, 0, targetW, targetH);
    targetCtx.restore();
  }

  function drawPaperGrain(targetCtx: CanvasRenderingContext2D, targetW: number, targetH: number): void {
    if (config.paperGrainOpacity <= 0) {
      return;
    }
    const pattern = targetCtx.createPattern(paperNoiseTile, 'repeat');
    if (!pattern) {
      return;
    }

    targetCtx.save();
    targetCtx.globalCompositeOperation = 'multiply';
    targetCtx.globalAlpha = clamp(config.paperGrainOpacity, 0, 0.25);
    targetCtx.fillStyle = pattern;
    targetCtx.fillRect(0, 0, targetW, targetH);
    targetCtx.restore();
  }

  function drawGrain(targetCtx: CanvasRenderingContext2D, targetW: number, targetH: number, opacity: number): void {
    const pattern = targetCtx.createPattern(noiseTile, 'repeat');
    if (!pattern || opacity <= 0) {
      return;
    }

    targetCtx.save();
    targetCtx.globalAlpha = opacity;
    targetCtx.globalCompositeOperation = 'soft-light';
    targetCtx.fillStyle = pattern;
    targetCtx.fillRect(0, 0, targetW, targetH);
    targetCtx.restore();
  }

  function getMouseOffset(x: number, y: number, falloffBoost: number): { x: number; y: number } {
    if (!config.mouseInteraction || !pointer.inside) {
      return { x: 0, y: 0 };
    }

    const dx = x - pointer.x;
    const dy = y - pointer.y;
    const distance = Math.hypot(dx, dy);
    const radius = Math.max(20, config.mouseRadius);
    if (distance >= radius) {
      return { x: 0, y: 0 };
    }

    const direction = config.mouseMode === 'repel' ? 1 : -1;
    const normalizedX = dx / (distance || 1);
    const normalizedY = dy / (distance || 1);
    const influence = Math.pow(1 - distance / radius, 2) * config.mouseStrength * falloffBoost;
    const magnitude = influence * radius * 0.42;

    return {
      x: normalizedX * magnitude * direction,
      y: normalizedY * magnitude * direction,
    };
  }

  function getScaledMouseOffset(
    x: number,
    y: number,
    localWidth: number,
    localHeight: number,
    sourceWidth: number,
    sourceHeight: number,
    falloffBoost: number,
  ): { x: number; y: number } {
    if (!config.mouseInteraction || !pointer.inside) {
      return { x: 0, y: 0 };
    }

    const scaleX = localWidth / Math.max(1, sourceWidth);
    const scaleY = localHeight / Math.max(1, sourceHeight);
    const pointerX = pointer.x * scaleX;
    const pointerY = pointer.y * scaleY;
    const dx = x - pointerX;
    const dy = y - pointerY;
    const distance = Math.hypot(dx, dy);
    const radius = Math.max(10, config.mouseRadius * ((scaleX + scaleY) * 0.5));
    if (distance >= radius) {
      return { x: 0, y: 0 };
    }

    const direction = config.mouseMode === 'repel' ? 1 : -1;
    const normalizedX = dx / (distance || 1);
    const normalizedY = dy / (distance || 1);
    const influence = Math.pow(1 - distance / radius, 2) * config.mouseStrength * falloffBoost;
    const magnitude = influence * radius * 0.42;

    return {
      x: normalizedX * magnitude * direction,
      y: normalizedY * magnitude * direction,
    };
  }

  function update(next: RenderConfig): void {
    const previous = config;
    config = next;

    const needsBlobReseed =
      previous.blobCount !== next.blobCount
      || previous.shapeStyle !== next.shapeStyle
      || previous.fullCanvasGradient !== next.fullCanvasGradient;

    const needsParticleReseed =
      previous.particleCount !== next.particleCount
      || previous.particleSize !== next.particleSize
      || previous.shapeStyle !== next.shapeStyle;

    const needsOperaReseed =
      previous.lobeCount !== next.lobeCount
      || previous.shapeStyle !== next.shapeStyle;

    if (needsBlobReseed) {
      reseedBlobs();
    }
    if (needsParticleReseed) {
      reseedParticles();
    }
    if (needsOperaReseed) {
      reseedOperaLobes();
    }
    if (previous.dustContrast !== next.dustContrast) {
      dustTile = makeSpeckleTile(200, next.dustContrast);
    }
    if (previous.maxDpr !== next.maxDpr) {
      resize();
    }

    if (next.shapeStyle === 'opera-dust' && next.paperGrainOpacity > 0 && previous.paperGrainOpacity === 0) {
      paperNoiseTile = makePaperNoiseTile(220);
    }

    const wasAnimating = isAnimating(previous);
    const shouldAnimate = isAnimating(next);

    if (!shouldAnimate && wasAnimating) {
      stopLoop();
      renderFrame();
      return;
    }

    if (shouldAnimate && !wasAnimating) {
      startLoop();
      return;
    }

    if (!shouldAnimate) {
      renderFrame();
    }
  }

  async function downloadPng2x(filename: string): Promise<void> {
    if (width < 2 || height < 2) {
      return;
    }

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = width * 2;
    exportCanvas.height = height * 2;
    const exportCtx = exportCanvas.getContext('2d', { alpha: true });
    if (!exportCtx) {
      return;
    }

    exportCtx.setTransform(2, 0, 0, 2, 0, 0);
    renderFrame(exportCtx, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      exportCanvas.toBlob((nextBlob) => resolve(nextBlob), 'image/png', 1);
    });

    if (!blob) {
      return;
    }

    triggerBlobDownload(blob, filename);
  }

  async function recordClip(options: ClipRecordOptions = {}): Promise<ClipRecordResult | null> {
    if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
      return null;
    }

    const durationMs = clampInt(options.durationMs ?? 10_000, 1_000, 60_000);
    const fps = clamp(options.fps ?? 30, 12, 60);
    const mimeType = resolveClipMimeType(
      options.preferMp4 ?? true,
      options.allowWebmFallback ?? true,
    );

    if (!mimeType) {
      return null;
    }

    renderFrame();

    const stream = canvas.captureStream(fps);
    const chunks: BlobPart[] = [];

    return await new Promise<ClipRecordResult | null>((resolve, reject) => {
      let done = false;
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 8_000_000,
      });

      const finish = (result: ClipRecordResult | null): void => {
        if (done) {
          return;
        }
        done = true;
        stream.getTracks().forEach((track) => track.stop());
        resolve(result);
      };

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onerror = () => {
        if (done) {
          return;
        }
        done = true;
        stream.getTracks().forEach((track) => track.stop());
        reject(new Error('Video recording failed in this browser.'));
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        if (!blob.size) {
          finish(null);
          return;
        }
        finish({
          blob,
          mimeType,
          durationMs,
        });
      };

      mediaRecorder.start(220);
      window.setTimeout(() => {
        if (mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
      }, durationMs);
    });
  }

  function destroy(): void {
    stopLoop();
    resizeObserver.disconnect();
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    canvas.remove();
  }

  return {
    update,
    destroy,
    downloadPng2x,
    recordClip,
  };
}

function ensureOperaBuffers(existing: OperaBuffers | null, width: number, height: number): OperaBuffers {
  const lowW = Math.max(80, Math.round(width * OPERA_LOW_RES_SCALE));
  const lowH = Math.max(80, Math.round(height * OPERA_LOW_RES_SCALE));

  if (existing && existing.lowW === lowW && existing.lowH === lowH) {
    return existing;
  }

  const layer = document.createElement('canvas');
  layer.width = lowW;
  layer.height = lowH;
  const layerCtx = get2dContext(layer);

  const mask = document.createElement('canvas');
  mask.width = lowW;
  mask.height = lowH;
  const maskCtx = get2dContext(mask);

  const dust = document.createElement('canvas');
  dust.width = lowW;
  dust.height = lowH;
  const dustCtx = get2dContext(dust);

  return {
    lowW,
    lowH,
    scale: OPERA_LOW_RES_SCALE,
    layer,
    layerCtx,
    mask,
    maskCtx,
    dust,
    dustCtx,
  };
}

function traceMorphPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  phase: number,
  motionIntensity: number,
): void {
  const points = 34;
  for (let i = 0; i <= points; i += 1) {
    const t = (i / points) * Math.PI * 2;
    const wobble =
      1
      + Math.sin(t * 3 + phase * 1.2) * (0.12 + motionIntensity * 0.04)
      + Math.cos(t * 5 - phase * 0.8) * (0.05 + motionIntensity * 0.02);
    const r = radius * wobble;
    const x = cx + Math.cos(t) * r;
    const y = cy + Math.sin(t) * r;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
}

function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    throw new Error('Canvas 2D context is not available in this browser.');
  }
  return ctx;
}

function isAnimating(config: RenderConfig): boolean {
  return !config.reducedMotion && !config.paused;
}

function resolveDpr(maxDpr: number): number {
  return Math.min(window.devicePixelRatio || 1, clamp(maxDpr, 1, 3));
}

function resolveClipMimeType(preferMp4: boolean, allowWebmFallback: boolean): string | null {
  if (typeof MediaRecorder === 'undefined') {
    return null;
  }

  const mp4Candidates = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    'video/mp4;codecs=h264',
    'video/mp4',
  ];
  const webmCandidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];

  const ordered = preferMp4
    ? [...mp4Candidates, ...(allowWebmFallback ? webmCandidates : [])]
    : [...webmCandidates, ...mp4Candidates];

  for (let i = 0; i < ordered.length; i += 1) {
    const candidate = ordered[i];
    if (candidate && MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return null;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}

function makeNoiseTile(size: number): HTMLCanvasElement {
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;

  const tileCtx = get2dContext(tile);
  const imageData = tileCtx.createImageData(size, size);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const value = (Math.random() * 255) | 0;
    imageData.data[i] = value;
    imageData.data[i + 1] = value;
    imageData.data[i + 2] = value;
    imageData.data[i + 3] = 255;
  }
  tileCtx.putImageData(imageData, 0, 0);

  return tile;
}

function makePaperNoiseTile(size: number): HTMLCanvasElement {
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;

  const tileCtx = get2dContext(tile);
  const imageData = tileCtx.createImageData(size, size);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const base = 220 + ((Math.random() * 34) | 0);
    imageData.data[i] = base;
    imageData.data[i + 1] = base - ((Math.random() * 6) | 0);
    imageData.data[i + 2] = base - ((Math.random() * 3) | 0);
    imageData.data[i + 3] = 255;
  }
  tileCtx.putImageData(imageData, 0, 0);

  return tile;
}

function makeSpeckleTile(size: number, contrast: number): HTMLCanvasElement {
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;

  const tileCtx = get2dContext(tile);
  const imageData = tileCtx.createImageData(size, size);
  const gain = 1 + clamp(contrast, 0, 2) * 4.2;

  for (let i = 0; i < imageData.data.length; i += 4) {
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

    imageData.data[i] = luminance;
    imageData.data[i + 1] = luminance;
    imageData.data[i + 2] = luminance;
    imageData.data[i + 3] = alpha;
  }

  tileCtx.putImageData(imageData, 0, 0);
  return tile;
}

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
    const normalized = normalizeHex(color);
    const r = Number.parseInt(normalized.slice(1, 3), 16);
    const g = Number.parseInt(normalized.slice(3, 5), 16);
    const b = Number.parseInt(normalized.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return color;
}

function normalizeHex(value: string): string {
  if (value.length === 4) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return value;
}

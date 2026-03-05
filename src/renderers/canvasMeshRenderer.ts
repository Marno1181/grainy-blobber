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

interface PointerState {
  x: number;
  y: number;
  inside: boolean;
}

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
  let blobs: BlobNode[] = [];
  let rafId = 0;
  let time = 0;
  let lastTs = performance.now();
  const pointer: PointerState = { x: 0, y: 0, inside: false };

  const resizeObserver = new ResizeObserver(() => {
    resize();
    reseedBlobs();
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

    const drawStart = performance.now();
    renderFrame();
    const drawMs = performance.now() - drawStart;
    callbacks.onFrame?.(drawMs, ts);

    rafId = requestAnimationFrame(tick);
  }

  function renderFrame(targetCtx: CanvasRenderingContext2D = ctx, targetW = width, targetH = height): void {
    targetCtx.save();
    targetCtx.clearRect(0, 0, targetW, targetH);

    targetCtx.fillStyle = config.background;
    targetCtx.fillRect(0, 0, targetW, targetH);

    if (config.fullCanvasGradient) {
      drawGradientField(targetCtx, targetW, targetH);
    } else if (config.shapeStyle === 'center') {
      drawCenterMorphBlob(targetCtx, targetW, targetH);
    } else {
      drawBlobMesh(targetCtx, targetW, targetH);
    }

    drawMouseField(targetCtx, targetW, targetH);
    drawGrain(targetCtx, targetW, targetH, config.grainOpacity);
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
      const layerOffsetX = Math.sin(time * 0.48 + i) * targetW * 0.02 * config.motionIntensity;
      const layerOffsetY = Math.cos(time * 0.43 + i * 0.9) * targetH * 0.02 * config.motionIntensity;
      const radius = baseRadius * scale;

      targetCtx.beginPath();
      traceMorphPath(targetCtx, centerX + layerOffsetX, centerY + layerOffsetY, radius, phase, config.motionIntensity);

      const gradient = targetCtx.createRadialGradient(
        centerX + layerOffsetX,
        centerY + layerOffsetY,
        radius * 0.12,
        centerX + layerOffsetX,
        centerY + layerOffsetY,
        radius,
      );
      gradient.addColorStop(0, withAlpha(color, 0.9));
      gradient.addColorStop(1, withAlpha(color, 0));
      targetCtx.fillStyle = gradient;
      targetCtx.fill();
    }

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

  function update(next: RenderConfig): void {
    const previous = config;
    config = next;

    if (previous.blobCount !== next.blobCount) {
      reseedBlobs();
    }
    if (previous.maxDpr !== next.maxDpr) {
      resize();
      reseedBlobs();
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
      const recorder = new MediaRecorder(stream, {
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

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = () => {
        if (done) {
          return;
        }
        done = true;
        stream.getTracks().forEach((track) => track.stop());
        reject(new Error('Video recording failed in this browser.'));
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        if (!blob.size) {
          finish(null);
          return;
        }
        finish({ blob, mimeType, durationMs });
      };

      recorder.start(220);
      window.setTimeout(() => {
        if (recorder.state !== 'inactive') {
          recorder.stop();
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

  const tileCtx = tile.getContext('2d', { alpha: true });
  if (!tileCtx) {
    return tile;
  }

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

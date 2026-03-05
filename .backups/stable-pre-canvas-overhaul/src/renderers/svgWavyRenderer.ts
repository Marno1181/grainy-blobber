import { triggerTextDownload } from '../export/download';
import type { RenderConfig, RendererCallbacks, RendererHandle, SvgShapeStyle } from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface WaveLayer {
  path: SVGPathElement;
  baseY: number;
  amplitude: number;
  frequency: number;
  phase: number;
  speedScale: number;
}

interface GradientLayer {
  ellipse: SVGEllipseElement;
  phaseX: number;
  phaseY: number;
  motionX: number;
  motionY: number;
}

interface CenterLayer {
  path: SVGPathElement;
  phase: number;
  radiusScale: number;
  speedScale: number;
}

interface RingLayer {
  ellipse: SVGEllipseElement;
  phase: number;
  radiusScale: number;
  speedScale: number;
}

interface PointerState {
  x: number;
  y: number;
  inside: boolean;
}

export function createSvgWavyRenderer(
  mount: HTMLElement,
  initialConfig: RenderConfig,
  callbacks: RendererCallbacks = {},
): RendererHandle {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('gb-svg');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');

  const defs = document.createElementNS(SVG_NS, 'defs');
  svg.appendChild(defs);

  const grainFilterId = `gb-grain-${cryptoRandomId()}`;
  defs.appendChild(createGrainFilter(grainFilterId));

  const blurFilterId = `gb-blur-${cryptoRandomId()}`;
  defs.appendChild(createSoftBlurFilter(blurFilterId));

  const backgroundRect = document.createElementNS(SVG_NS, 'rect');
  backgroundRect.setAttribute('x', '0');
  backgroundRect.setAttribute('y', '0');
  svg.appendChild(backgroundRect);

  const layersGroup = document.createElementNS(SVG_NS, 'g');
  svg.appendChild(layersGroup);

  const mouseGlow = document.createElementNS(SVG_NS, 'circle');
  mouseGlow.setAttribute('opacity', '0');
  mouseGlow.style.mixBlendMode = 'soft-light';
  svg.appendChild(mouseGlow);

  const grainRect = document.createElementNS(SVG_NS, 'rect');
  grainRect.setAttribute('x', '0');
  grainRect.setAttribute('y', '0');
  grainRect.setAttribute('filter', `url(#${grainFilterId})`);
  grainRect.setAttribute('fill', '#ffffff');
  svg.appendChild(grainRect);

  mount.replaceChildren(svg);

  let config = initialConfig;
  let width = 0;
  let height = 0;
  let time = 0;
  let lastTs = performance.now();
  let rafId = 0;
  let waveLayers: WaveLayer[] = [];
  let gradientLayers: GradientLayer[] = [];
  let centerLayers: CenterLayer[] = [];
  let ringLayers: RingLayer[] = [];
  const pointer: PointerState = { x: 0, y: 0, inside: false };

  const resizeObserver = new ResizeObserver(() => {
    resize();
    rebuildLayers();
    render();
  });

  const onPointerMove = (event: PointerEvent) => {
    const rect = svg.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    pointer.inside = true;
    if (config.reducedMotion || config.paused) {
      render();
    }
  };

  const onPointerLeave = () => {
    pointer.inside = false;
    if (config.reducedMotion || config.paused) {
      render();
    }
  };

  svg.addEventListener('pointermove', onPointerMove, { passive: true });
  svg.addEventListener('pointerleave', onPointerLeave, { passive: true });

  resizeObserver.observe(mount);
  resize();
  rebuildLayers();
  render();

  if (!config.reducedMotion && !config.paused) {
    startLoop();
  }

  function resize(): void {
    const rect = mount.getBoundingClientRect();
    width = Math.max(2, Math.floor(rect.width));
    height = Math.max(2, Math.floor(rect.height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    backgroundRect.setAttribute('width', String(width));
    backgroundRect.setAttribute('height', String(height));
    grainRect.setAttribute('width', String(width));
    grainRect.setAttribute('height', String(height));
  }

  function rebuildLayers(): void {
    waveLayers = [];
    gradientLayers = [];
    centerLayers = [];
    ringLayers = [];
    layersGroup.replaceChildren();

    if (config.fullCanvasGradient) {
      const total = Math.max(3, config.colors.length);
      for (let i = 0; i < total; i += 1) {
        const ellipse = document.createElementNS(SVG_NS, 'ellipse');
        ellipse.setAttribute('filter', `url(#${blurFilterId})`);
        ellipse.style.mixBlendMode = 'screen';
        layersGroup.appendChild(ellipse);

        gradientLayers.push({
          ellipse,
          phaseX: rand(0, Math.PI * 2),
          phaseY: rand(0, Math.PI * 2),
          motionX: rand(width * 0.06, width * 0.2),
          motionY: rand(height * 0.06, height * 0.2),
        });
      }
      return;
    }

    const shape = resolveSvgShapeStyle(config.shapeStyle);

    if (shape === 'center') {
      const count = Math.max(2, config.colors.length);
      for (let i = 0; i < count; i += 1) {
        const path = document.createElementNS(SVG_NS, 'path');
        path.style.mixBlendMode = 'screen';
        path.setAttribute('filter', `url(#${blurFilterId})`);
        layersGroup.appendChild(path);

        centerLayers.push({
          path,
          phase: rand(0, Math.PI * 2),
          radiusScale: 0.72 + i * 0.12,
          speedScale: rand(0.6, 1.24),
        });
      }
      return;
    }

    if (shape === 'rings') {
      const count = Math.max(3, config.waveCount);
      for (let i = 0; i < count; i += 1) {
        const ellipse = document.createElementNS(SVG_NS, 'ellipse');
        ellipse.style.mixBlendMode = 'screen';
        ellipse.setAttribute('filter', `url(#${blurFilterId})`);
        layersGroup.appendChild(ellipse);

        ringLayers.push({
          ellipse,
          phase: rand(0, Math.PI * 2),
          radiusScale: 0.28 + i * 0.09,
          speedScale: rand(0.6, 1.25),
        });
      }
      return;
    }

    const count = Math.max(2, config.waveCount);
    for (let i = 0; i < count; i += 1) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.style.mixBlendMode = 'screen';
      layersGroup.appendChild(path);

      waveLayers.push({
        path,
        baseY: height * (0.2 + (i / (count + 1)) * 0.72),
        amplitude: height * rand(0.04, 0.1),
        frequency: rand(1.3, 2.8),
        phase: rand(0, Math.PI * 2),
        speedScale: rand(0.6, 1.3),
      });
    }
  }

  function startLoop(): void {
    if (rafId !== 0 || config.reducedMotion || config.paused) {
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
    time += dt * config.speed * 1.25;

    const drawStart = performance.now();
    render();
    const drawMs = performance.now() - drawStart;
    callbacks.onFrame?.(drawMs, ts);

    rafId = requestAnimationFrame(tick);
  }

  function render(): void {
    backgroundRect.setAttribute('fill', config.background);
    grainRect.setAttribute('opacity', `${config.grainOpacity}`);

    if (config.fullCanvasGradient) {
      renderFullGradient();
    } else {
      const shape = resolveSvgShapeStyle(config.shapeStyle);
      if (shape === 'center') {
        renderCenterMorph();
      } else if (shape === 'rings') {
        renderPulseRings();
      } else {
        renderWaves();
      }
    }

    renderMouseGlow();
  }

  function renderFullGradient(): void {
    for (let i = 0; i < gradientLayers.length; i += 1) {
      const layer = gradientLayers[i];
      if (!layer) {
        continue;
      }

      const color = config.colors[i % config.colors.length] ?? '#3b82f6';
      let cx = width * 0.5 + Math.sin(time * 0.7 + layer.phaseX) * layer.motionX * config.motionIntensity;
      let cy = height * 0.5 + Math.cos(time * 0.6 + layer.phaseY) * layer.motionY * config.motionIntensity;
      const push = getMouseOffset(cx, cy, 0.5);
      cx += push.x;
      cy += push.y;

      const rx = width * (0.42 + i * 0.07);
      const ry = height * (0.3 + i * 0.06);

      layer.ellipse.setAttribute('cx', String(cx));
      layer.ellipse.setAttribute('cy', String(cy));
      layer.ellipse.setAttribute('rx', String(rx));
      layer.ellipse.setAttribute('ry', String(ry));
      layer.ellipse.setAttribute('fill', color);
      layer.ellipse.setAttribute('fill-opacity', '0.42');
    }
  }

  function renderWaves(): void {
    for (let i = 0; i < waveLayers.length; i += 1) {
      const layer = waveLayers[i];
      if (!layer) {
        continue;
      }
      const color = config.colors[i % config.colors.length] ?? '#3b82f6';
      const phase = layer.phase + time * layer.speedScale * (0.75 + config.motionIntensity * 0.45);
      const d = buildWavePath(
        width,
        height,
        layer.baseY,
        layer.amplitude * (0.7 + config.motionIntensity * 0.5),
        layer.frequency,
        phase,
      );

      layer.path.setAttribute('d', d);
      layer.path.setAttribute('fill', color);
      layer.path.setAttribute('fill-opacity', `${0.35 + (i / Math.max(waveLayers.length, 1)) * 0.3}`);
    }
  }

  function renderCenterMorph(): void {
    const offsetX = width * (clamp(config.centerOffsetX, -45, 45) / 100);
    const offsetY = height * (clamp(config.centerOffsetY, -45, 45) / 100);
    let centerX = width * 0.5 + offsetX + Math.sin(time * 0.3) * width * 0.04 * config.motionIntensity;
    let centerY = height * 0.5 + offsetY + Math.cos(time * 0.24) * height * 0.04 * config.motionIntensity;
    const centerPush = getMouseOffset(centerX, centerY, 1);
    centerX += centerPush.x;
    centerY += centerPush.y;

    const minDim = Math.min(width, height);

    for (let i = 0; i < centerLayers.length; i += 1) {
      const layer = centerLayers[i];
      if (!layer) {
        continue;
      }

      const color = config.colors[i % config.colors.length] ?? '#3b82f6';
      const phase = layer.phase + time * layer.speedScale * (0.7 + config.motionIntensity * 0.5);
      const radius =
        (minDim * 0.22 * layer.radiusScale + minDim * 0.12)
        * (0.85 + config.motionIntensity * 0.15)
        * clamp(config.centerBlobScale, 0.5, 2);
      const cx = centerX + Math.sin(phase * 0.6 + i) * width * 0.02 * config.motionIntensity;
      const cy = centerY + Math.cos(phase * 0.5 + i) * height * 0.02 * config.motionIntensity;

      layer.path.setAttribute('d', buildMorphBlobPath(cx, cy, radius, phase, config.motionIntensity));
      layer.path.setAttribute('fill', color);
      layer.path.setAttribute('fill-opacity', `${0.38 + i * 0.08}`);
    }
  }

  function renderPulseRings(): void {
    let centerX = width * 0.5;
    let centerY = height * 0.5;
    const centerPush = getMouseOffset(centerX, centerY, 1.15);
    centerX += centerPush.x;
    centerY += centerPush.y;

    const stroke = Math.max(10, Math.round(Math.min(width, height) * 0.03));

    for (let i = 0; i < ringLayers.length; i += 1) {
      const layer = ringLayers[i];
      if (!layer) {
        continue;
      }
      const color = config.colors[i % config.colors.length] ?? '#3b82f6';
      const phase = layer.phase + time * layer.speedScale * (0.7 + config.motionIntensity * 0.5);
      const rx = width * layer.radiusScale * (0.78 + Math.sin(phase * 0.8) * 0.06 * config.motionIntensity);
      const ry = height * layer.radiusScale * (0.56 + Math.cos(phase * 0.84) * 0.08 * config.motionIntensity);
      const cx = centerX + Math.sin(phase * 0.43) * width * 0.03 * config.motionIntensity;
      const cy = centerY + Math.cos(phase * 0.36) * height * 0.03 * config.motionIntensity;

      layer.ellipse.setAttribute('cx', String(cx));
      layer.ellipse.setAttribute('cy', String(cy));
      layer.ellipse.setAttribute('rx', String(Math.max(8, rx)));
      layer.ellipse.setAttribute('ry', String(Math.max(8, ry)));
      layer.ellipse.setAttribute('fill', 'none');
      layer.ellipse.setAttribute('stroke', color);
      layer.ellipse.setAttribute('stroke-width', String(stroke));
      layer.ellipse.setAttribute('stroke-opacity', `${0.24 + (i / Math.max(ringLayers.length, 1)) * 0.26}`);
    }
  }

  function renderMouseGlow(): void {
    if (!config.mouseInteraction || !pointer.inside) {
      mouseGlow.setAttribute('opacity', '0');
      return;
    }

    const color = config.mouseMode === 'repel'
      ? config.colors[0] ?? '#ffffff'
      : config.colors[1] ?? '#ffffff';

    mouseGlow.setAttribute('cx', String(pointer.x));
    mouseGlow.setAttribute('cy', String(pointer.y));
    mouseGlow.setAttribute('r', String(config.mouseRadius * 0.52));
    mouseGlow.setAttribute('fill', color);
    mouseGlow.setAttribute('opacity', '0.22');
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
    const magnitude = influence * radius * 0.4;

    return {
      x: normalizedX * magnitude * direction,
      y: normalizedY * magnitude * direction,
    };
  }

  function update(next: RenderConfig): void {
    const previous = config;
    config = next;

    const needsRebuild =
      previous.waveCount !== next.waveCount
      || previous.fullCanvasGradient !== next.fullCanvasGradient
      || previous.shapeStyle !== next.shapeStyle
      || previous.colors.length !== next.colors.length;

    if (needsRebuild) {
      rebuildLayers();
    }

    const wasAnimating = !previous.reducedMotion && !previous.paused;
    const shouldAnimate = !next.reducedMotion && !next.paused;

    if (!shouldAnimate && wasAnimating) {
      stopLoop();
      render();
      return;
    }

    if (shouldAnimate && !wasAnimating) {
      startLoop();
      return;
    }

    if (!shouldAnimate) {
      render();
    }
  }

  function getSvgMarkup(): string {
    return svg.outerHTML;
  }

  function downloadSvg(filename: string): void {
    triggerTextDownload(getSvgMarkup(), filename, 'image/svg+xml;charset=utf-8');
  }

  function destroy(): void {
    stopLoop();
    resizeObserver.disconnect();
    svg.removeEventListener('pointermove', onPointerMove);
    svg.removeEventListener('pointerleave', onPointerLeave);
    svg.remove();
  }

  return {
    update,
    destroy,
    getSvgMarkup,
    downloadSvg,
  };
}

function buildWavePath(
  width: number,
  height: number,
  baseY: number,
  amplitude: number,
  frequency: number,
  phase: number,
): string {
  const segments = 10;
  const step = width / segments;

  let d = `M 0 ${height} L 0 ${baseY}`;
  for (let i = 0; i < segments; i += 1) {
    const x1 = i * step;
    const x2 = (i + 1) * step;
    const cx = x1 + step / 2;

    const y1 = baseY + Math.sin(((x1 / width) * Math.PI * 2 * frequency) + phase) * amplitude;
    const y2 = baseY + Math.sin(((x2 / width) * Math.PI * 2 * frequency) + phase) * amplitude;
    const cy = (y1 + y2) / 2;

    d += ` Q ${cx} ${cy} ${x2} ${y2}`;
  }

  d += ` L ${width} ${height} Z`;
  return d;
}

function buildMorphBlobPath(
  cx: number,
  cy: number,
  radius: number,
  phase: number,
  motionIntensity: number,
): string {
  const segments = 30;
  let d = '';

  for (let i = 0; i <= segments; i += 1) {
    const t = (i / segments) * Math.PI * 2;
    const wobble =
      1
      + Math.sin(t * 3 + phase * 1.2) * (0.12 + motionIntensity * 0.04)
      + Math.cos(t * 5 - phase * 0.9) * (0.06 + motionIntensity * 0.02);
    const r = radius * wobble;
    const x = cx + Math.cos(t) * r;
    const y = cy + Math.sin(t) * r;

    if (i === 0) {
      d = `M ${x} ${y}`;
    } else {
      d += ` L ${x} ${y}`;
    }
  }

  d += ' Z';
  return d;
}

function createGrainFilter(id: string): SVGFilterElement {
  const filter = document.createElementNS(SVG_NS, 'filter');
  filter.setAttribute('id', id);
  filter.setAttribute('x', '0');
  filter.setAttribute('y', '0');
  filter.setAttribute('width', '100%');
  filter.setAttribute('height', '100%');

  const turbulence = document.createElementNS(SVG_NS, 'feTurbulence');
  turbulence.setAttribute('type', 'fractalNoise');
  turbulence.setAttribute('baseFrequency', '0.85');
  turbulence.setAttribute('numOctaves', '2');
  turbulence.setAttribute('seed', '3');
  turbulence.setAttribute('stitchTiles', 'stitch');

  const saturation = document.createElementNS(SVG_NS, 'feColorMatrix');
  saturation.setAttribute('type', 'saturate');
  saturation.setAttribute('values', '0');

  const alphaTransfer = document.createElementNS(SVG_NS, 'feComponentTransfer');
  const funcAlpha = document.createElementNS(SVG_NS, 'feFuncA');
  funcAlpha.setAttribute('type', 'table');
  funcAlpha.setAttribute('tableValues', '0 0.65');
  alphaTransfer.appendChild(funcAlpha);

  filter.append(turbulence, saturation, alphaTransfer);
  return filter;
}

function createSoftBlurFilter(id: string): SVGFilterElement {
  const filter = document.createElementNS(SVG_NS, 'filter');
  filter.setAttribute('id', id);
  filter.setAttribute('x', '-30%');
  filter.setAttribute('y', '-30%');
  filter.setAttribute('width', '160%');
  filter.setAttribute('height', '160%');

  const gaussian = document.createElementNS(SVG_NS, 'feGaussianBlur');
  gaussian.setAttribute('stdDeviation', '46');
  filter.appendChild(gaussian);

  return filter;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cryptoRandomId(): string {
  if ('randomUUID' in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }
  return `${Math.random().toString(16).slice(2, 10)}`;
}

function resolveSvgShapeStyle(shapeStyle: string): SvgShapeStyle {
  if (shapeStyle === 'center' || shapeStyle === 'rings' || shapeStyle === 'waves') {
    return shapeStyle;
  }
  return 'waves';
}

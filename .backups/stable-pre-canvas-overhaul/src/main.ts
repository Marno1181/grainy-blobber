import './style.css';

import { copyText } from './export/clipboard';
import { triggerBlobDownload } from './export/download';
import { buildEmbedSnippets } from './export/snippets';
import { PerfMonitor, type RollingPerfStats } from './perf/perfMonitor';
import { CANVAS_BLEND_MODES, PRESETS, PRESET_ORDER } from './renderers/presets';
import { createCanvasMeshRenderer } from './renderers/canvasMeshRenderer';
import { createSvgWavyRenderer } from './renderers/svgWavyRenderer';
import type {
  CanvasBlendMode,
  CanvasShapeStyle,
  MouseMode,
  PresetId,
  RenderConfig,
  RenderMode,
  RendererHandle,
  SvgShapeStyle,
} from './renderers/types';

const PALETTE_SIZE = 5;

interface AppState {
  mode: RenderMode;
  presetId: PresetId;
  colors: string[];
  background: string;
  sectionHeightVh: number;
  canvasShapeStyle: CanvasShapeStyle;
  svgShapeStyle: SvgShapeStyle;
  maxDpr: number;
  paused: boolean;
  speed: number;
  motionIntensity: number;
  grainOpacity: number;
  dustIntensity: number;
  dustScale: number;
  dustContrast: number;
  lobeCount: number;
  morphAmount: number;
  centerBlobScale: number;
  centerOffsetX: number;
  centerOffsetY: number;
  paperGrainOpacity: number;
  blendMode: CanvasBlendMode;
  fullCanvasGradient: boolean;
  mouseInteraction: boolean;
  mouseMode: MouseMode;
  mouseStrength: number;
  mouseRadius: number;
  blobCount: number;
  particleCount: number;
  particleSize: number;
  particleLinkDistance: number;
  blurPx: number;
  waveCount: number;
  reducedMotion: boolean;
}

const appRoot = queryEl<HTMLDivElement>('#app');

appRoot.innerHTML = `
  <div class="gb-app">
    <aside class="gb-panel">
      <h1>Grainy Blobber</h1>
      <p class="gb-subtitle">Background-only gradient motion tool with canvas and SVG renderers.</p>

      <label>
        <span>Render mode</span>
        <select id="modeSelect"></select>
      </label>

      <label>
        <span>Preset</span>
        <select id="presetSelect"></select>
      </label>

      <label>
        <span>Section height <strong id="sectionHeightValue">58vh</strong></span>
        <input id="sectionHeightRange" type="range" min="30" max="100" step="1" value="58" />
      </label>

      <label data-mode-only="canvas-mesh">
        <span>Style</span>
        <select id="canvasShapeSelect"></select>
      </label>

      <label data-mode-only="svg-wavy">
        <span>SVG shape</span>
        <select id="svgShapeSelect"></select>
      </label>

      <div class="gb-color-grid">
        <label class="gb-color-field">
          <span>Background</span>
          <div class="gb-color-input-row">
            <input id="backgroundColorInput" type="color" />
            <input
              id="backgroundHexInput"
              class="gb-hex-input"
              type="text"
              value="#08111f"
              maxlength="7"
              spellcheck="false"
              autocapitalize="off"
              autocomplete="off"
            />
          </div>
        </label>
        <label class="gb-color-field">
          <span>Color 1</span>
          <div class="gb-color-input-row">
            <input id="colorInput0" type="color" />
            <input id="colorHexInput0" class="gb-hex-input" type="text" value="#00f5ff" maxlength="7" spellcheck="false" autocapitalize="off" autocomplete="off" />
          </div>
        </label>
        <label class="gb-color-field">
          <span>Color 2</span>
          <div class="gb-color-input-row">
            <input id="colorInput1" type="color" />
            <input id="colorHexInput1" class="gb-hex-input" type="text" value="#ff2e9f" maxlength="7" spellcheck="false" autocapitalize="off" autocomplete="off" />
          </div>
        </label>
        <label class="gb-color-field">
          <span>Color 3</span>
          <div class="gb-color-input-row">
            <input id="colorInput2" type="color" />
            <input id="colorHexInput2" class="gb-hex-input" type="text" value="#7cff00" maxlength="7" spellcheck="false" autocapitalize="off" autocomplete="off" />
          </div>
        </label>
        <label class="gb-color-field">
          <span>Color 4</span>
          <div class="gb-color-input-row">
            <input id="colorInput3" type="color" />
            <input id="colorHexInput3" class="gb-hex-input" type="text" value="#4d8dff" maxlength="7" spellcheck="false" autocapitalize="off" autocomplete="off" />
          </div>
        </label>
        <label class="gb-color-field">
          <span>Color 5</span>
          <div class="gb-color-input-row">
            <input id="colorInput4" type="color" />
            <input id="colorHexInput4" class="gb-hex-input" type="text" value="#00f5ff" maxlength="7" spellcheck="false" autocapitalize="off" autocomplete="off" />
          </div>
        </label>
      </div>

      <label data-mode-only="canvas-mesh" data-canvas-shape-only="mesh,center,orbit">
        <span>Blend mode</span>
        <select id="blendModeSelect"></select>
      </label>

      <label data-canvas-shape-only="center" data-svg-shape-only="center">
        <span>Center blob size <strong id="centerBlobScaleValue">1.00</strong></span>
        <input id="centerBlobScaleRange" type="range" min="0.5" max="2" step="0.05" value="1" />
      </label>

      <label data-canvas-shape-only="center" data-svg-shape-only="center">
        <span>Center X <strong id="centerOffsetXValue">0%</strong></span>
        <input id="centerOffsetXRange" type="range" min="-45" max="45" step="1" value="0" />
      </label>

      <label data-canvas-shape-only="center" data-svg-shape-only="center">
        <span>Center Y <strong id="centerOffsetYValue">0%</strong></span>
        <input id="centerOffsetYRange" type="range" min="-45" max="45" step="1" value="0" />
      </label>

      <label class="gb-checkbox">
        <input id="fullGradientToggle" type="checkbox" />
        <span>Full-canvas gradient</span>
      </label>

      <label>
        <span>Speed <strong id="speedValue">1.00</strong></span>
        <input id="speedRange" type="range" min="0.1" max="3" step="0.05" value="1.0" />
      </label>

      <label>
        <span>Max DPR <strong id="maxDprValue">2.00</strong></span>
        <input id="maxDprRange" type="range" min="1" max="3" step="0.25" value="2" />
      </label>

      <label class="gb-checkbox">
        <input id="pauseToggle" type="checkbox" />
        <span>Pause animation</span>
      </label>

      <label data-canvas-shape-not="opera-dust">
        <span>Motion amount <strong id="motionValue">1.70</strong></span>
        <input id="motionRange" type="range" min="0.3" max="3" step="0.05" value="1.7" />
      </label>

      <label>
        <span>Grain opacity <strong id="grainValue">0.12</strong></span>
        <input id="grainRange" type="range" min="0" max="0.35" step="0.01" value="0.12" />
      </label>

      <label>
        <span>Mouse mode</span>
        <select id="mouseModeSelect"></select>
      </label>

      <label class="gb-checkbox">
        <input id="mouseToggle" type="checkbox" checked />
        <span>Mouse hover effect</span>
      </label>

      <label>
        <span>Mouse strength <strong id="mouseStrengthValue">1.00</strong></span>
        <input id="mouseStrengthRange" type="range" min="0" max="2.5" step="0.05" value="1" />
      </label>

      <label>
        <span>Mouse radius <strong id="mouseRadiusValue">240</strong></span>
        <input id="mouseRadiusRange" type="range" min="60" max="520" step="10" value="240" />
      </label>

      <label data-mode-only="canvas-mesh" data-canvas-shape-only="particles">
        <span>Particle count <strong id="particleCountValue">130</strong></span>
        <input id="particleCountRange" type="range" min="20" max="300" step="10" value="130" />
      </label>

      <label data-mode-only="canvas-mesh" data-canvas-shape-only="particles">
        <span>Particle size <strong id="particleSizeValue">1.6</strong></span>
        <input id="particleSizeRange" type="range" min="0.6" max="4" step="0.1" value="1.6" />
      </label>

      <label data-mode-only="canvas-mesh" data-canvas-shape-only="particles">
        <span>Link distance <strong id="particleLinkValue">160</strong></span>
        <input id="particleLinkRange" type="range" min="60" max="280" step="10" value="160" />
      </label>

      <label data-mode-only="canvas-mesh" data-canvas-shape-only="mesh,orbit">
        <span>Blob count <strong id="blobValue">5</strong></span>
        <input id="blobRange" type="range" min="2" max="12" step="1" value="5" />
      </label>

      <label data-mode-only="canvas-mesh" data-canvas-shape-only="mesh,center,orbit">
        <span>Blur px <strong id="blurValue">110</strong></span>
        <input id="blurRange" type="range" min="20" max="200" step="1" value="110" />
      </label>

      <label data-mode-only="canvas-mesh" data-canvas-shape-only="opera-dust">
        <span>Dust intensity <strong id="dustIntensityValue">0.72</strong></span>
        <input id="dustIntensityRange" type="range" min="0" max="1" step="0.01" value="0.72" />
      </label>

      <label data-mode-only="canvas-mesh" data-canvas-shape-only="opera-dust">
        <span>Dust scale <strong id="dustScaleValue">1.30</strong></span>
        <input id="dustScaleRange" type="range" min="0.5" max="3" step="0.05" value="1.3" />
      </label>

      <label data-mode-only="canvas-mesh" data-canvas-shape-only="opera-dust">
        <span>Dust contrast <strong id="dustContrastValue">1.15</strong></span>
        <input id="dustContrastRange" type="range" min="0" max="2" step="0.05" value="1.15" />
      </label>

      <label data-mode-only="canvas-mesh" data-canvas-shape-only="opera-dust">
        <span>Lobe count <strong id="lobeCountValue">4</strong></span>
        <input id="lobeCountRange" type="range" min="2" max="6" step="1" value="4" />
      </label>

      <label data-mode-only="canvas-mesh" data-canvas-shape-only="opera-dust">
        <span>Morph amount <strong id="morphAmountValue">0.35</strong></span>
        <input id="morphAmountRange" type="range" min="0" max="1" step="0.01" value="0.35" />
      </label>

      <label data-mode-only="canvas-mesh" data-canvas-shape-only="opera-dust">
        <span>Paper grain <strong id="paperGrainValue">0.08</strong></span>
        <input id="paperGrainRange" type="range" min="0" max="0.25" step="0.01" value="0.08" />
      </label>

      <label data-mode-only="svg-wavy" data-svg-shape-only="waves,rings">
        <span>Wave layers <strong id="waveValue">4</strong></span>
        <input id="waveRange" type="range" min="2" max="10" step="1" value="4" />
      </label>

      <div class="gb-actions">
        <button id="benchmarkBtn" type="button">Run 5s benchmark</button>
      </div>

      <div class="gb-actions gb-export-copy">
        <button id="copyHtmlBtn" type="button">Copy HTML</button>
        <button id="copyCssBtn" type="button">Copy CSS</button>
        <button id="copyJsBtn" type="button">Copy JS</button>
      </div>

      <div class="gb-actions gb-export-mode">
        <button id="downloadPngBtn" type="button">Download PNG @2x</button>
        <button id="downloadSvgBtn" type="button">Download SVG</button>
        <button id="copySvgBtn" type="button">Copy SVG markup</button>
        <button id="downloadVideoBtn" type="button">Download 10s MP4</button>
      </div>

      <p id="statusLine" class="gb-status" role="status" aria-live="polite">Ready.</p>
    </aside>

    <main class="gb-main">
      <section class="gb-preview-shell">
        <div class="gb-stage" id="stage">
          <div class="gb-render-layer" id="renderLayer" aria-hidden="true"></div>
        </div>
      </section>

      <section class="gb-metrics">
        <h2>Profiling</h2>
        <div class="gb-metric-grid">
          <article>
            <h3>Rolling FPS</h3>
            <p id="fpsValue">0.0</p>
          </article>
          <article>
            <h3>Rolling frame ms</h3>
            <p id="frameValue">0.00</p>
          </article>
          <article>
            <h3>Rolling draw ms</h3>
            <p id="drawValue">0.00</p>
          </article>
          <article>
            <h3>Cost score</h3>
            <p id="costValue">0</p>
          </article>
        </div>
        <p id="benchmarkResult" class="gb-benchmark">Benchmark idle.</p>
        <p id="motionNote" class="gb-motion-note"></p>
      </section>
    </main>
  </div>
`;

const modeSelect = queryEl<HTMLSelectElement>('#modeSelect');
const presetSelect = queryEl<HTMLSelectElement>('#presetSelect');
const sectionHeightRange = queryEl<HTMLInputElement>('#sectionHeightRange');
const canvasShapeSelect = queryEl<HTMLSelectElement>('#canvasShapeSelect');
const svgShapeSelect = queryEl<HTMLSelectElement>('#svgShapeSelect');
const backgroundColorInput = queryEl<HTMLInputElement>('#backgroundColorInput');
const backgroundHexInput = queryEl<HTMLInputElement>('#backgroundHexInput');
const colorInputs = Array.from({ length: PALETTE_SIZE }, (_, index) => queryEl<HTMLInputElement>(`#colorInput${index}`));
const colorHexInputs = Array.from({ length: PALETTE_SIZE }, (_, index) => queryEl<HTMLInputElement>(`#colorHexInput${index}`));
const blendModeSelect = queryEl<HTMLSelectElement>('#blendModeSelect');
const fullGradientToggle = queryEl<HTMLInputElement>('#fullGradientToggle');
const speedRange = queryEl<HTMLInputElement>('#speedRange');
const maxDprRange = queryEl<HTMLInputElement>('#maxDprRange');
const pauseToggle = queryEl<HTMLInputElement>('#pauseToggle');
const motionRange = queryEl<HTMLInputElement>('#motionRange');
const grainRange = queryEl<HTMLInputElement>('#grainRange');
const mouseToggle = queryEl<HTMLInputElement>('#mouseToggle');
const mouseModeSelect = queryEl<HTMLSelectElement>('#mouseModeSelect');
const mouseStrengthRange = queryEl<HTMLInputElement>('#mouseStrengthRange');
const mouseRadiusRange = queryEl<HTMLInputElement>('#mouseRadiusRange');
const particleCountRange = queryEl<HTMLInputElement>('#particleCountRange');
const particleSizeRange = queryEl<HTMLInputElement>('#particleSizeRange');
const particleLinkRange = queryEl<HTMLInputElement>('#particleLinkRange');
const blobRange = queryEl<HTMLInputElement>('#blobRange');
const blurRange = queryEl<HTMLInputElement>('#blurRange');
const centerBlobScaleRange = queryEl<HTMLInputElement>('#centerBlobScaleRange');
const centerOffsetXRange = queryEl<HTMLInputElement>('#centerOffsetXRange');
const centerOffsetYRange = queryEl<HTMLInputElement>('#centerOffsetYRange');
const dustIntensityRange = queryEl<HTMLInputElement>('#dustIntensityRange');
const dustScaleRange = queryEl<HTMLInputElement>('#dustScaleRange');
const dustContrastRange = queryEl<HTMLInputElement>('#dustContrastRange');
const lobeCountRange = queryEl<HTMLInputElement>('#lobeCountRange');
const morphAmountRange = queryEl<HTMLInputElement>('#morphAmountRange');
const paperGrainRange = queryEl<HTMLInputElement>('#paperGrainRange');
const waveRange = queryEl<HTMLInputElement>('#waveRange');

const speedValue = queryEl<HTMLElement>('#speedValue');
const sectionHeightValue = queryEl<HTMLElement>('#sectionHeightValue');
const maxDprValue = queryEl<HTMLElement>('#maxDprValue');
const motionValue = queryEl<HTMLElement>('#motionValue');
const grainValue = queryEl<HTMLElement>('#grainValue');
const mouseStrengthValue = queryEl<HTMLElement>('#mouseStrengthValue');
const mouseRadiusValue = queryEl<HTMLElement>('#mouseRadiusValue');
const particleCountValue = queryEl<HTMLElement>('#particleCountValue');
const particleSizeValue = queryEl<HTMLElement>('#particleSizeValue');
const particleLinkValue = queryEl<HTMLElement>('#particleLinkValue');
const blobValue = queryEl<HTMLElement>('#blobValue');
const blurValue = queryEl<HTMLElement>('#blurValue');
const centerBlobScaleValue = queryEl<HTMLElement>('#centerBlobScaleValue');
const centerOffsetXValue = queryEl<HTMLElement>('#centerOffsetXValue');
const centerOffsetYValue = queryEl<HTMLElement>('#centerOffsetYValue');
const dustIntensityValue = queryEl<HTMLElement>('#dustIntensityValue');
const dustScaleValue = queryEl<HTMLElement>('#dustScaleValue');
const dustContrastValue = queryEl<HTMLElement>('#dustContrastValue');
const lobeCountValue = queryEl<HTMLElement>('#lobeCountValue');
const morphAmountValue = queryEl<HTMLElement>('#morphAmountValue');
const paperGrainValue = queryEl<HTMLElement>('#paperGrainValue');
const waveValue = queryEl<HTMLElement>('#waveValue');

const benchmarkBtn = queryEl<HTMLButtonElement>('#benchmarkBtn');
const copyHtmlBtn = queryEl<HTMLButtonElement>('#copyHtmlBtn');
const copyCssBtn = queryEl<HTMLButtonElement>('#copyCssBtn');
const copyJsBtn = queryEl<HTMLButtonElement>('#copyJsBtn');
const downloadPngBtn = queryEl<HTMLButtonElement>('#downloadPngBtn');
const downloadSvgBtn = queryEl<HTMLButtonElement>('#downloadSvgBtn');
const copySvgBtn = queryEl<HTMLButtonElement>('#copySvgBtn');
const downloadVideoBtn = queryEl<HTMLButtonElement>('#downloadVideoBtn');

const statusLine = queryEl<HTMLElement>('#statusLine');
const benchmarkResult = queryEl<HTMLElement>('#benchmarkResult');
const fpsValue = queryEl<HTMLElement>('#fpsValue');
const frameValue = queryEl<HTMLElement>('#frameValue');
const drawValue = queryEl<HTMLElement>('#drawValue');
const costValue = queryEl<HTMLElement>('#costValue');
const motionNote = queryEl<HTMLElement>('#motionNote');

const stageElement = queryEl<HTMLElement>('#stage');
const renderLayer = queryEl<HTMLElement>('#renderLayer');

const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

const initialPreset = PRESETS.neon;

const state: AppState = {
  mode: 'canvas-mesh',
  presetId: initialPreset.id,
  colors: normalizePalette(initialPreset.colors),
  background: normalizeHexColor(initialPreset.background, '#08111f'),
  sectionHeightVh: 58,
  canvasShapeStyle: 'mesh',
  svgShapeStyle: 'waves',
  maxDpr: 2,
  paused: false,
  speed: 1,
  motionIntensity: 1.7,
  grainOpacity: initialPreset.defaultGrainOpacity,
  dustIntensity: 0.72,
  dustScale: 1.3,
  dustContrast: 1.15,
  lobeCount: 4,
  morphAmount: 0.35,
  centerBlobScale: 1,
  centerOffsetX: 0,
  centerOffsetY: 0,
  paperGrainOpacity: 0.08,
  blendMode: initialPreset.defaultBlendMode,
  fullCanvasGradient: false,
  mouseInteraction: true,
  mouseMode: 'repel',
  mouseStrength: 1,
  mouseRadius: 240,
  blobCount: 5,
  particleCount: 130,
  particleSize: 1.6,
  particleLinkDistance: 160,
  blurPx: 110,
  waveCount: 4,
  reducedMotion: reduceMotionQuery.matches,
};

const perfMonitor = new PerfMonitor();
let renderer: RendererHandle | null = null;
let benchmarkRunning = false;

setupSelects();
syncControlsFromState();
applyStageHeight();
applyControlVisibility();
updateMotionNote();
rebuildRenderer();
startPerfTicker();

modeSelect.addEventListener('change', () => {
  state.mode = modeSelect.value as RenderMode;
  applyControlVisibility();
  rebuildRenderer();
});

presetSelect.addEventListener('change', () => {
  state.presetId = presetSelect.value as PresetId;
  const preset = PRESETS[state.presetId];
  state.colors = normalizePalette(preset.colors);
  state.background = normalizeHexColor(preset.background, state.background);
  state.blendMode = preset.defaultBlendMode;
  state.grainOpacity = preset.defaultGrainOpacity;
  syncControlsFromState();
  updateRenderer();
});

sectionHeightRange.addEventListener('input', () => {
  state.sectionHeightVh = parseIntValue(sectionHeightRange.value, state.sectionHeightVh);
  syncValueLabels();
  applyStageHeight();
});

canvasShapeSelect.addEventListener('change', () => {
  state.canvasShapeStyle = canvasShapeSelect.value as CanvasShapeStyle;
  applyControlVisibility();
  updateRenderer();
});

svgShapeSelect.addEventListener('change', () => {
  state.svgShapeStyle = svgShapeSelect.value as SvgShapeStyle;
  applyControlVisibility();
  updateRenderer();
});

backgroundColorInput.addEventListener('input', () => {
  state.background = normalizeHexColor(backgroundColorInput.value, state.background);
  backgroundHexInput.value = state.background;
  updateRenderer();
});

colorInputs.forEach((input, index) => {
  input.addEventListener('input', () => {
    state.colors[index] = normalizeHexColor(input.value, state.colors[index] ?? '#3b82f6');
    const hexInput = colorHexInputs[index];
    if (hexInput) {
      hexInput.value = state.colors[index] ?? '#3b82f6';
    }
    updateRenderer();
  });
});

bindHexColorInput(backgroundHexInput, () => state.background, (next) => {
  state.background = next;
  backgroundColorInput.value = next;
  updateRenderer();
});

colorHexInputs.forEach((hexInput, index) => {
  bindHexColorInput(hexInput, () => state.colors[index] ?? '#3b82f6', (next) => {
    state.colors[index] = next;
    const colorInput = colorInputs[index];
    if (colorInput) {
      colorInput.value = next;
    }
    updateRenderer();
  });
});

blendModeSelect.addEventListener('change', () => {
  state.blendMode = blendModeSelect.value as CanvasBlendMode;
  updateRenderer();
});

fullGradientToggle.addEventListener('change', () => {
  state.fullCanvasGradient = fullGradientToggle.checked;
  updateRenderer();
});

speedRange.addEventListener('input', () => {
  state.speed = parseFloatValue(speedRange.value, state.speed);
  syncValueLabels();
  updateRenderer();
});

maxDprRange.addEventListener('input', () => {
  state.maxDpr = parseFloatValue(maxDprRange.value, state.maxDpr);
  syncValueLabels();
  updateRenderer();
});

pauseToggle.addEventListener('change', () => {
  state.paused = pauseToggle.checked;
  updateRenderer();
  updateMotionNote();
});

motionRange.addEventListener('input', () => {
  state.motionIntensity = parseFloatValue(motionRange.value, state.motionIntensity);
  syncValueLabels();
  updateRenderer();
});

grainRange.addEventListener('input', () => {
  state.grainOpacity = parseFloatValue(grainRange.value, state.grainOpacity);
  syncValueLabels();
  updateRenderer();
});

mouseToggle.addEventListener('change', () => {
  state.mouseInteraction = mouseToggle.checked;
  updateRenderer();
});

mouseModeSelect.addEventListener('change', () => {
  state.mouseMode = mouseModeSelect.value as MouseMode;
  updateRenderer();
});

mouseStrengthRange.addEventListener('input', () => {
  state.mouseStrength = parseFloatValue(mouseStrengthRange.value, state.mouseStrength);
  syncValueLabels();
  updateRenderer();
});

mouseRadiusRange.addEventListener('input', () => {
  state.mouseRadius = parseIntValue(mouseRadiusRange.value, state.mouseRadius);
  syncValueLabels();
  updateRenderer();
});

particleCountRange.addEventListener('input', () => {
  state.particleCount = parseIntValue(particleCountRange.value, state.particleCount);
  syncValueLabels();
  updateRenderer();
});

particleSizeRange.addEventListener('input', () => {
  state.particleSize = parseFloatValue(particleSizeRange.value, state.particleSize);
  syncValueLabels();
  updateRenderer();
});

particleLinkRange.addEventListener('input', () => {
  state.particleLinkDistance = parseIntValue(particleLinkRange.value, state.particleLinkDistance);
  syncValueLabels();
  updateRenderer();
});

blobRange.addEventListener('input', () => {
  state.blobCount = parseIntValue(blobRange.value, state.blobCount);
  syncValueLabels();
  updateRenderer();
});

blurRange.addEventListener('input', () => {
  state.blurPx = parseIntValue(blurRange.value, state.blurPx);
  syncValueLabels();
  updateRenderer();
});

centerBlobScaleRange.addEventListener('input', () => {
  state.centerBlobScale = parseFloatValue(centerBlobScaleRange.value, state.centerBlobScale);
  syncValueLabels();
  updateRenderer();
});

centerOffsetXRange.addEventListener('input', () => {
  state.centerOffsetX = parseIntValue(centerOffsetXRange.value, state.centerOffsetX);
  syncValueLabels();
  updateRenderer();
});

centerOffsetYRange.addEventListener('input', () => {
  state.centerOffsetY = parseIntValue(centerOffsetYRange.value, state.centerOffsetY);
  syncValueLabels();
  updateRenderer();
});

dustIntensityRange.addEventListener('input', () => {
  state.dustIntensity = parseFloatValue(dustIntensityRange.value, state.dustIntensity);
  syncValueLabels();
  updateRenderer();
});

dustScaleRange.addEventListener('input', () => {
  state.dustScale = parseFloatValue(dustScaleRange.value, state.dustScale);
  syncValueLabels();
  updateRenderer();
});

dustContrastRange.addEventListener('input', () => {
  state.dustContrast = parseFloatValue(dustContrastRange.value, state.dustContrast);
  syncValueLabels();
  updateRenderer();
});

lobeCountRange.addEventListener('input', () => {
  state.lobeCount = parseIntValue(lobeCountRange.value, state.lobeCount);
  syncValueLabels();
  updateRenderer();
});

morphAmountRange.addEventListener('input', () => {
  state.morphAmount = parseFloatValue(morphAmountRange.value, state.morphAmount);
  syncValueLabels();
  updateRenderer();
});

paperGrainRange.addEventListener('input', () => {
  state.paperGrainOpacity = parseFloatValue(paperGrainRange.value, state.paperGrainOpacity);
  syncValueLabels();
  updateRenderer();
});

waveRange.addEventListener('input', () => {
  state.waveCount = parseIntValue(waveRange.value, state.waveCount);
  syncValueLabels();
  updateRenderer();
});

benchmarkBtn.addEventListener('click', async () => {
  if (benchmarkRunning) {
    return;
  }

  benchmarkRunning = true;
  benchmarkBtn.disabled = true;
  benchmarkResult.textContent = 'Running benchmark for 5 seconds...';

  try {
    const result = await perfMonitor.runBenchmark(5000);
    if (result.samples === 0) {
      benchmarkResult.textContent = 'No frame samples captured. Disable reduced-motion and unpause animation for benchmarks.';
    } else {
      benchmarkResult.textContent = `5s benchmark: avg ${result.averageFps.toFixed(1)} FPS, worst frame ${result.worstFrameMs.toFixed(2)} ms.`;
    }
  } catch (error) {
    benchmarkResult.textContent = error instanceof Error ? error.message : 'Benchmark failed.';
  } finally {
    benchmarkRunning = false;
    benchmarkBtn.disabled = false;
  }
});

copyHtmlBtn.addEventListener('click', async () => {
  await copySnippet('html');
});

copyCssBtn.addEventListener('click', async () => {
  await copySnippet('css');
});

copyJsBtn.addEventListener('click', async () => {
  await copySnippet('js');
});

downloadPngBtn.addEventListener('click', async () => {
  if (!renderer?.downloadPng2x) {
    setStatus('PNG export is only available in Canvas Mesh mode.');
    return;
  }

  await renderer.downloadPng2x('grainy-blobber-2x.png');
  setStatus('Downloaded PNG @2x.');
});

downloadSvgBtn.addEventListener('click', () => {
  if (!renderer?.downloadSvg) {
    setStatus('SVG export is only available in SVG Wavy mode.');
    return;
  }

  renderer.downloadSvg('grainy-blobber.svg');
  setStatus('Downloaded SVG.');
});

copySvgBtn.addEventListener('click', async () => {
  if (!renderer?.getSvgMarkup) {
    setStatus('SVG markup copy is only available in SVG Wavy mode.');
    return;
  }

  await copyText(renderer.getSvgMarkup());
  setStatus('Copied SVG markup.');
});

downloadVideoBtn.addEventListener('click', async () => {
  if (!renderer?.recordClip) {
    setStatus('Video export is only available in Canvas Mesh mode.');
    return;
  }

  downloadVideoBtn.disabled = true;
  setStatus('Recording 10 second clip...');

  try {
    const clip = await renderer.recordClip({
      durationMs: 10_000,
      fps: 30,
      preferMp4: true,
      allowWebmFallback: true,
    });

    if (!clip) {
      setStatus('Video export is not supported in this browser.');
      return;
    }

    const extension = clip.mimeType.includes('mp4') ? 'mp4' : 'webm';
    triggerBlobDownload(clip.blob, `grainy-blobber-10s.${extension}`);

    if (extension === 'mp4') {
      setStatus('Downloaded 10s MP4 clip.');
    } else {
      setStatus('Downloaded 10s WebM clip. MP4 is not supported by this browser.');
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Video export failed.');
  } finally {
    downloadVideoBtn.disabled = false;
  }
});

reduceMotionQuery.addEventListener('change', (event) => {
  state.reducedMotion = event.matches;
  updateMotionNote();
  rebuildRenderer();
});

function setupSelects(): void {
  modeSelect.innerHTML = `
    <option value="canvas-mesh">Canvas Mesh</option>
    <option value="svg-wavy">SVG Wavy</option>
  `;

  const presetOptions = PRESET_ORDER
    .map((presetId) => {
      const preset = PRESETS[presetId];
      return `<option value="${preset.id}">${preset.label}</option>`;
    })
    .join('');
  presetSelect.innerHTML = presetOptions;

  canvasShapeSelect.innerHTML = `
    <option value="mesh">Smooth Mesh</option>
    <option value="opera-dust">Opera Dust Blob</option>
    <option value="particles">Particles Neon</option>
    <option value="center">Center Morph Blob</option>
    <option value="orbit">Orbit Blobs</option>
  `;

  svgShapeSelect.innerHTML = `
    <option value="waves">Wavy Bands</option>
    <option value="center">Center Morph Blob</option>
    <option value="rings">Pulse Rings</option>
  `;

  mouseModeSelect.innerHTML = `
    <option value="repel">Repel</option>
    <option value="attract">Attract</option>
  `;

  const blendOptions = CANVAS_BLEND_MODES
    .map((mode) => `<option value="${mode.value}">${mode.label}</option>`)
    .join('');
  blendModeSelect.innerHTML = blendOptions;
}

function syncControlsFromState(): void {
  modeSelect.value = state.mode;
  presetSelect.value = state.presetId;
  sectionHeightRange.value = String(state.sectionHeightVh);
  canvasShapeSelect.value = state.canvasShapeStyle;
  svgShapeSelect.value = state.svgShapeStyle;
  const normalizedBackground = normalizeHexColor(state.background, '#f3f4f6');
  backgroundColorInput.value = normalizedBackground;
  backgroundHexInput.value = normalizedBackground;

  colorInputs.forEach((input, index) => {
    const normalizedColor = normalizeHexColor(state.colors[index] ?? '#3b82f6', '#3b82f6');
    input.value = normalizedColor;
    const hexInput = colorHexInputs[index];
    if (hexInput) {
      hexInput.value = normalizedColor;
    }
  });

  blendModeSelect.value = state.blendMode;
  fullGradientToggle.checked = state.fullCanvasGradient;
  speedRange.value = state.speed.toFixed(2);
  maxDprRange.value = state.maxDpr.toFixed(2);
  pauseToggle.checked = state.paused;
  motionRange.value = state.motionIntensity.toFixed(2);
  grainRange.value = state.grainOpacity.toFixed(2);
  dustIntensityRange.value = state.dustIntensity.toFixed(2);
  dustScaleRange.value = state.dustScale.toFixed(2);
  dustContrastRange.value = state.dustContrast.toFixed(2);
  lobeCountRange.value = String(state.lobeCount);
  morphAmountRange.value = state.morphAmount.toFixed(2);
  paperGrainRange.value = state.paperGrainOpacity.toFixed(2);
  mouseToggle.checked = state.mouseInteraction;
  mouseModeSelect.value = state.mouseMode;
  mouseStrengthRange.value = state.mouseStrength.toFixed(2);
  mouseRadiusRange.value = String(state.mouseRadius);
  particleCountRange.value = String(state.particleCount);
  particleSizeRange.value = state.particleSize.toFixed(1);
  particleLinkRange.value = String(state.particleLinkDistance);
  blobRange.value = String(state.blobCount);
  blurRange.value = String(state.blurPx);
  centerBlobScaleRange.value = state.centerBlobScale.toFixed(2);
  centerOffsetXRange.value = String(state.centerOffsetX);
  centerOffsetYRange.value = String(state.centerOffsetY);
  waveRange.value = String(state.waveCount);
  syncValueLabels();
}

function syncValueLabels(): void {
  speedValue.textContent = state.speed.toFixed(2);
  sectionHeightValue.textContent = `${state.sectionHeightVh}vh`;
  maxDprValue.textContent = state.maxDpr.toFixed(2);
  motionValue.textContent = state.motionIntensity.toFixed(2);
  grainValue.textContent = state.grainOpacity.toFixed(2);
  dustIntensityValue.textContent = state.dustIntensity.toFixed(2);
  dustScaleValue.textContent = state.dustScale.toFixed(2);
  dustContrastValue.textContent = state.dustContrast.toFixed(2);
  lobeCountValue.textContent = String(state.lobeCount);
  morphAmountValue.textContent = state.morphAmount.toFixed(2);
  paperGrainValue.textContent = state.paperGrainOpacity.toFixed(2);
  mouseStrengthValue.textContent = state.mouseStrength.toFixed(2);
  mouseRadiusValue.textContent = String(state.mouseRadius);
  particleCountValue.textContent = String(state.particleCount);
  particleSizeValue.textContent = state.particleSize.toFixed(1);
  particleLinkValue.textContent = String(state.particleLinkDistance);
  blobValue.textContent = String(state.blobCount);
  blurValue.textContent = String(state.blurPx);
  centerBlobScaleValue.textContent = state.centerBlobScale.toFixed(2);
  centerOffsetXValue.textContent = `${state.centerOffsetX}%`;
  centerOffsetYValue.textContent = `${state.centerOffsetY}%`;
  waveValue.textContent = String(state.waveCount);
}

function applyControlVisibility(): void {
  const controlNodes = appRoot.querySelectorAll<HTMLElement>(
    '[data-mode-only], [data-canvas-shape-only], [data-canvas-shape-not], [data-svg-shape-only], [data-svg-shape-not]',
  );

  controlNodes.forEach((node) => {
    let visible = true;

    const targetMode = node.dataset.modeOnly as RenderMode | undefined;
    if (targetMode) {
      visible = visible && targetMode === state.mode;
    }

    const canvasShapeOnly = parseVisibilityList(node.dataset.canvasShapeOnly);
    if (canvasShapeOnly.length > 0 && state.mode === 'canvas-mesh') {
      visible = visible && canvasShapeOnly.includes(state.canvasShapeStyle);
    }

    const canvasShapeNot = parseVisibilityList(node.dataset.canvasShapeNot);
    if (canvasShapeNot.length > 0 && state.mode === 'canvas-mesh') {
      visible = visible && !canvasShapeNot.includes(state.canvasShapeStyle);
    }

    const svgShapeOnly = parseVisibilityList(node.dataset.svgShapeOnly);
    if (svgShapeOnly.length > 0 && state.mode === 'svg-wavy') {
      visible = visible && svgShapeOnly.includes(state.svgShapeStyle);
    }

    const svgShapeNot = parseVisibilityList(node.dataset.svgShapeNot);
    if (svgShapeNot.length > 0 && state.mode === 'svg-wavy') {
      visible = visible && !svgShapeNot.includes(state.svgShapeStyle);
    }

    node.hidden = !visible;
  });

  downloadPngBtn.hidden = state.mode !== 'canvas-mesh';
  downloadSvgBtn.hidden = state.mode !== 'svg-wavy';
  copySvgBtn.hidden = state.mode !== 'svg-wavy';
  downloadVideoBtn.hidden = state.mode !== 'canvas-mesh';
}

function applyStageHeight(): void {
  const vh = clamp(state.sectionHeightVh, 30, 100);
  stageElement.style.minHeight = `${vh}vh`;
}

function updateMotionNote(): void {
  if (state.reducedMotion) {
    motionNote.textContent = 'Reduced-motion is enabled. Animation is paused and renderers stay static.';
    return;
  }

  if (state.paused) {
    motionNote.textContent = 'Animation is manually paused.';
    return;
  }

  motionNote.textContent = 'Hover over the preview to push or pull the field.';
}

function buildRenderConfig(): RenderConfig {
  return {
    mode: state.mode,
    preset: PRESETS[state.presetId],
    colors: normalizePalette(state.colors),
    background: normalizeHexColor(state.background, PRESETS[state.presetId].background),
    sectionHeightVh: state.sectionHeightVh,
    shapeStyle: state.mode === 'canvas-mesh' ? state.canvasShapeStyle : state.svgShapeStyle,
    maxDpr: state.maxDpr,
    paused: state.paused,
    speed: state.speed,
    motionIntensity: state.motionIntensity,
    grainOpacity: state.grainOpacity,
    dustIntensity: state.dustIntensity,
    dustScale: state.dustScale,
    dustContrast: state.dustContrast,
    lobeCount: state.lobeCount,
    morphAmount: state.morphAmount,
    centerBlobScale: state.centerBlobScale,
    centerOffsetX: state.centerOffsetX,
    centerOffsetY: state.centerOffsetY,
    paperGrainOpacity: state.paperGrainOpacity,
    blendMode: state.blendMode,
    fullCanvasGradient: state.fullCanvasGradient,
    mouseInteraction: state.mouseInteraction,
    mouseMode: state.mouseMode,
    mouseStrength: state.mouseStrength,
    mouseRadius: state.mouseRadius,
    blobCount: state.blobCount,
    particleCount: state.particleCount,
    particleSize: state.particleSize,
    particleLinkDistance: state.particleLinkDistance,
    blurPx: state.blurPx,
    waveCount: state.waveCount,
    reducedMotion: state.reducedMotion,
  };
}

function rebuildRenderer(): void {
  renderer?.destroy();
  renderer = null;

  const config = buildRenderConfig();
  if (config.mode === 'canvas-mesh') {
    renderer = createCanvasMeshRenderer(renderLayer, config, {
      onFrame: (drawMs, timestamp) => {
        perfMonitor.addFrame(drawMs, timestamp);
      },
    });
  } else {
    renderer = createSvgWavyRenderer(renderLayer, config, {
      onFrame: (drawMs, timestamp) => {
        perfMonitor.addFrame(drawMs, timestamp);
      },
    });
  }

  setStatus(`${config.mode === 'canvas-mesh' ? 'Canvas Mesh' : 'SVG Wavy'} renderer ready.`);
}

function updateRenderer(): void {
  const config = buildRenderConfig();
  if (!renderer) {
    rebuildRenderer();
    return;
  }

  renderer.update(config);
}

function startPerfTicker(): void {
  const update = () => {
    const stats = perfMonitor.getRollingStats();
    const config = buildRenderConfig();
    fpsValue.textContent = stats.fps.toFixed(1);
    frameValue.textContent = stats.frameMs.toFixed(2);
    drawValue.textContent = stats.drawMs.toFixed(2);
    costValue.textContent = `${estimateCostScore(stats, config)}`;

    window.setTimeout(update, 240);
  };

  update();
}

async function copySnippet(kind: keyof ReturnType<typeof buildEmbedSnippets>): Promise<void> {
  const snippets = buildEmbedSnippets(buildRenderConfig());
  const content = snippets[kind];

  await copyText(content);
  setStatus(`Copied ${kind.toUpperCase()} snippet.`);
}

function estimateCostScore(stats: RollingPerfStats, config: RenderConfig): number {
  const measuredDrawWeight = clamp(stats.drawMs / 16.67, 0, 2.8);
  const measuredFrameWeight = clamp(stats.frameMs / 16.67, 0, 2.8);
  const measuredFpsPenalty = clamp((60 - stats.fps) / 60, 0, 1.8);

  const dprWeight = clamp(config.maxDpr / 2, 0.5, 1.6);
  const blurWeight = config.mode === 'canvas-mesh' ? clamp(config.blurPx / 170, 0, 1.25) : 0.45;
  const lobeWeight = config.mode === 'canvas-mesh' && config.shapeStyle === 'opera-dust'
    ? clamp(config.lobeCount / 6, 0.3, 1.2)
    : 0.35;
  const dustWeight = config.mode === 'canvas-mesh' && config.shapeStyle === 'opera-dust'
    ? clamp((config.dustScale - 0.5) / 2.5, 0, 1.1)
    : 0.3;

  const rawScore =
    measuredDrawWeight * 33
    + measuredFrameWeight * 20
    + measuredFpsPenalty * 22
    + dprWeight * 8
    + blurWeight * 7
    + lobeWeight * 6
    + dustWeight * 4;

  return Math.round(clamp(rawScore, 0, 100));
}

function setStatus(message: string): void {
  statusLine.textContent = message;
}

function bindHexColorInput(
  input: HTMLInputElement,
  getCurrent: () => string,
  apply: (next: string) => void,
): void {
  const commit = (): void => {
    const parsed = parseHexColorInput(input.value);
    if (!parsed) {
      input.value = getCurrent();
      return;
    }
    if (parsed !== getCurrent()) {
      apply(parsed);
    }
    input.value = parsed;
  };

  input.addEventListener('input', () => {
    const parsed = parseHexColorInput(input.value);
    if (!parsed || parsed === getCurrent()) {
      return;
    }
    apply(parsed);
  });

  input.addEventListener('change', commit);
  input.addEventListener('blur', () => {
    input.value = parseHexColorInput(input.value) ?? getCurrent();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    commit();
    input.blur();
  });
}

function parseVisibilityList(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function normalizePalette(colors: string[]): string[] {
  const fallback = PRESETS.neon.colors;
  const normalized = Array.from({ length: PALETTE_SIZE }, (_, index) => {
    const raw = colors[index] ?? fallback[index % fallback.length] ?? '#3b82f6';
    return normalizeHexColor(raw, '#3b82f6');
  });
  return normalized;
}

function parseHexColorInput(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const candidate = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(candidate)) {
    return null;
  }

  return normalizeHexColor(candidate, '#000000');
}

function normalizeHexColor(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
    return fallback;
  }

  if (trimmed.length === 4) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toLowerCase();
  }

  return trimmed.toLowerCase();
}

function parseFloatValue(raw: string, fallback: number): number {
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

function parseIntValue(raw: string, fallback: number): number {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function queryEl<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

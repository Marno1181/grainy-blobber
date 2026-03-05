import './style.css';

import { copyText } from './export/clipboard';
import { triggerBlobDownload } from './export/download';
import { buildEmbedSnippets } from './export/snippets';
import { PerfMonitor, type RollingPerfStats } from './perf/perfMonitor';
import { CANVAS_BLEND_MODES, PRESETS, PRESET_ORDER } from './renderers/presets';
import { createCanvasMeshRenderer } from './renderers/canvasMeshRenderer';
import type {
  CanvasBlendMode,
  CanvasShapeStyle,
  MouseMode,
  PresetId,
  RenderConfig,
  RendererHandle,
} from './renderers/types';

const PALETTE_SIZE = 5;
const USER_PRESETS_STORAGE_KEY = 'grainy_blobber_user_presets_v1';

interface AppState {
  presetId: PresetId;
  colors: string[];
  background: string;
  sectionHeightVh: number;
  shapeStyle: CanvasShapeStyle;
  maxDpr: number;
  paused: boolean;
  speed: number;
  motionIntensity: number;
  grainOpacity: number;
  centerBlobScale: number;
  centerOffsetX: number;
  centerOffsetY: number;
  blendMode: CanvasBlendMode;
  fullCanvasGradient: boolean;
  mouseInteraction: boolean;
  mouseMode: MouseMode;
  mouseStrength: number;
  mouseRadius: number;
  blobCount: number;
  blurPx: number;
  reducedMotion: boolean;
}

interface PresetSnapshot {
  presetId: PresetId;
  colors: string[];
  background: string;
  sectionHeightVh: number;
  shapeStyle: CanvasShapeStyle;
  maxDpr: number;
  paused: boolean;
  speed: number;
  motionIntensity: number;
  grainOpacity: number;
  centerBlobScale: number;
  centerOffsetX: number;
  centerOffsetY: number;
  blendMode: CanvasBlendMode;
  fullCanvasGradient: boolean;
  mouseInteraction: boolean;
  mouseMode: MouseMode;
  mouseStrength: number;
  mouseRadius: number;
  blobCount: number;
  blurPx: number;
}

interface SavedPreset {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  snapshot: PresetSnapshot;
}

const appRoot = queryEl<HTMLDivElement>('#app');
appRoot.innerHTML = buildAppShellHtml();

const builtinPresetSelect = queryEl<HTMLSelectElement>('#builtinPresetSelect');
const savedPresetSelect = queryEl<HTMLSelectElement>('#savedPresetSelect');
const presetNameInput = queryEl<HTMLInputElement>('#presetNameInput');
const savePresetBtn = queryEl<HTMLButtonElement>('#savePresetBtn');
const updatePresetBtn = queryEl<HTMLButtonElement>('#updatePresetBtn');
const deletePresetBtn = queryEl<HTMLButtonElement>('#deletePresetBtn');
const exportPresetBtn = queryEl<HTMLButtonElement>('#exportPresetBtn');
const importPresetBtn = queryEl<HTMLButtonElement>('#importPresetBtn');
const importPresetFile = queryEl<HTMLInputElement>('#importPresetFile');
const resetStyleBtn = queryEl<HTMLButtonElement>('#resetStyleBtn');
const resetAllBtn = queryEl<HTMLButtonElement>('#resetAllBtn');

const sectionHeightRange = queryEl<HTMLInputElement>('#sectionHeightRange');
const shapeSelect = queryEl<HTMLSelectElement>('#shapeSelect');
const fullGradientToggle = queryEl<HTMLInputElement>('#fullGradientToggle');
const blendModeSelect = queryEl<HTMLSelectElement>('#blendModeSelect');
const backgroundColorInput = queryEl<HTMLInputElement>('#backgroundColorInput');
const backgroundHexInput = queryEl<HTMLInputElement>('#backgroundHexInput');
const colorInputs = Array.from({ length: PALETTE_SIZE }, (_, index) => queryEl<HTMLInputElement>(`#colorInput${index}`));
const colorHexInputs = Array.from({ length: PALETTE_SIZE }, (_, index) => queryEl<HTMLInputElement>(`#colorHexInput${index}`));

const speedRange = queryEl<HTMLInputElement>('#speedRange');
const motionRange = queryEl<HTMLInputElement>('#motionRange');
const maxDprRange = queryEl<HTMLInputElement>('#maxDprRange');
const pauseToggle = queryEl<HTMLInputElement>('#pauseToggle');

const grainRange = queryEl<HTMLInputElement>('#grainRange');
const blurRange = queryEl<HTMLInputElement>('#blurRange');
const blobRange = queryEl<HTMLInputElement>('#blobRange');

const centerBlobScaleRange = queryEl<HTMLInputElement>('#centerBlobScaleRange');
const centerOffsetXRange = queryEl<HTMLInputElement>('#centerOffsetXRange');
const centerOffsetYRange = queryEl<HTMLInputElement>('#centerOffsetYRange');

const mouseToggle = queryEl<HTMLInputElement>('#mouseToggle');
const mouseModeSelect = queryEl<HTMLSelectElement>('#mouseModeSelect');
const mouseStrengthRange = queryEl<HTMLInputElement>('#mouseStrengthRange');
const mouseRadiusRange = queryEl<HTMLInputElement>('#mouseRadiusRange');

const sectionHeightValue = queryEl<HTMLElement>('#sectionHeightValue');
const speedValue = queryEl<HTMLElement>('#speedValue');
const motionValue = queryEl<HTMLElement>('#motionValue');
const maxDprValue = queryEl<HTMLElement>('#maxDprValue');
const grainValue = queryEl<HTMLElement>('#grainValue');
const blurValue = queryEl<HTMLElement>('#blurValue');
const blobValue = queryEl<HTMLElement>('#blobValue');
const centerBlobScaleValue = queryEl<HTMLElement>('#centerBlobScaleValue');
const centerOffsetXValue = queryEl<HTMLElement>('#centerOffsetXValue');
const centerOffsetYValue = queryEl<HTMLElement>('#centerOffsetYValue');
const mouseStrengthValue = queryEl<HTMLElement>('#mouseStrengthValue');
const mouseRadiusValue = queryEl<HTMLElement>('#mouseRadiusValue');

const benchmarkBtn = queryEl<HTMLButtonElement>('#benchmarkBtn');
const copyHtmlBtn = queryEl<HTMLButtonElement>('#copyHtmlBtn');
const copyCssBtn = queryEl<HTMLButtonElement>('#copyCssBtn');
const copyJsBtn = queryEl<HTMLButtonElement>('#copyJsBtn');
const downloadPngBtn = queryEl<HTMLButtonElement>('#downloadPngBtn');
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

const perfMonitor = new PerfMonitor();
let renderer: RendererHandle | null = null;
let benchmarkRunning = false;
let savedPresets: SavedPreset[] = loadSavedPresets();
let selectedSavedPresetId = '';

const state: AppState = {
  ...defaultSnapshot(),
  reducedMotion: reduceMotionQuery.matches,
};

setupSelects();
syncControlsFromState();
refreshSavedPresetOptions();
applyShapeVisibility();
applyStageHeight();
updateMotionNote();
rebuildRenderer();
startPerfTicker();

builtinPresetSelect.addEventListener('change', () => {
  const presetId = builtinPresetSelect.value as PresetId;
  applyBuiltInPreset(presetId);
  selectedSavedPresetId = '';
  savedPresetSelect.value = '';
  syncControlsFromState();
  applyShapeVisibility();
  updateRenderer();
  setStatus(`Applied built-in theme "${PRESETS[presetId].label}".`);
});

savedPresetSelect.addEventListener('change', () => {
  selectedSavedPresetId = savedPresetSelect.value;
  if (!selectedSavedPresetId) {
    return;
  }
  const selected = savedPresets.find((preset) => preset.id === selectedSavedPresetId);
  if (!selected) {
    return;
  }
  applySnapshot(selected.snapshot);
  presetNameInput.value = selected.name;
  syncControlsFromState();
  applyShapeVisibility();
  applyStageHeight();
  updateRenderer();
  setStatus(`Loaded preset "${selected.name}".`);
});

savePresetBtn.addEventListener('click', () => {
  const name = presetNameInput.value.trim() || `Preset ${savedPresets.length + 1}`;
  const now = new Date().toISOString();
  const preset: SavedPreset = {
    id: makePresetId(),
    name,
    createdAt: now,
    updatedAt: now,
    snapshot: snapshotFromState(state),
  };
  savedPresets = [preset, ...savedPresets];
  persistSavedPresets(savedPresets);
  selectedSavedPresetId = preset.id;
  refreshSavedPresetOptions(selectedSavedPresetId);
  setStatus(`Saved preset "${name}".`);
});

updatePresetBtn.addEventListener('click', () => {
  if (!selectedSavedPresetId) {
    setStatus('Select a saved preset first.');
    return;
  }

  const index = savedPresets.findIndex((preset) => preset.id === selectedSavedPresetId);
  if (index < 0) {
    setStatus('Selected preset no longer exists.');
    return;
  }

  const current = savedPresets[index];
  if (!current) {
    return;
  }

  const name = presetNameInput.value.trim() || current.name;
  savedPresets[index] = {
    ...current,
    name,
    updatedAt: new Date().toISOString(),
    snapshot: snapshotFromState(state),
  };
  persistSavedPresets(savedPresets);
  refreshSavedPresetOptions(selectedSavedPresetId);
  setStatus(`Updated preset "${name}".`);
});

deletePresetBtn.addEventListener('click', () => {
  if (!selectedSavedPresetId) {
    setStatus('Select a saved preset first.');
    return;
  }

  const target = savedPresets.find((preset) => preset.id === selectedSavedPresetId);
  if (!target) {
    return;
  }
  savedPresets = savedPresets.filter((preset) => preset.id !== selectedSavedPresetId);
  persistSavedPresets(savedPresets);
  selectedSavedPresetId = '';
  refreshSavedPresetOptions();
  setStatus(`Deleted preset "${target.name}".`);
});

exportPresetBtn.addEventListener('click', () => {
  const selected = selectedSavedPresetId
    ? savedPresets.find((preset) => preset.id === selectedSavedPresetId)
    : null;

  const payload = selected ?? {
    id: makePresetId(),
    name: presetNameInput.value.trim() || 'Current Preset',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    snapshot: snapshotFromState(state),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const slug = slugifyFilename(payload.name);
  triggerBlobDownload(blob, `${slug}.json`);
  setStatus(`Exported preset JSON (${payload.name}).`);
});

importPresetBtn.addEventListener('click', () => {
  importPresetFile.click();
});

importPresetFile.addEventListener('change', async () => {
  const file = importPresetFile.files?.[0];
  importPresetFile.value = '';
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;
    const imported = normalizeImportedPresets(parsed);
    if (imported.length === 0) {
      setStatus('No valid presets found in file.');
      return;
    }

    const byId = new Map(savedPresets.map((preset) => [preset.id, preset]));
    imported.forEach((preset) => byId.set(preset.id, preset));
    savedPresets = Array.from(byId.values()).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    persistSavedPresets(savedPresets);
    selectedSavedPresetId = imported[0]?.id ?? '';
    refreshSavedPresetOptions(selectedSavedPresetId);
    setStatus(`Imported ${imported.length} preset(s).`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Failed to import presets.');
  }
});

resetStyleBtn.addEventListener('click', () => {
  resetCurrentStyle();
  syncControlsFromState();
  applyShapeVisibility();
  updateRenderer();
  setStatus(`Reset ${state.shapeStyle === 'center' ? 'Center Morph' : 'Smooth Mesh'} controls.`);
});

resetAllBtn.addEventListener('click', () => {
  const reducedMotion = state.reducedMotion;
  const fallback = defaultSnapshot();
  Object.assign(state, fallback, { reducedMotion });
  selectedSavedPresetId = '';
  refreshSavedPresetOptions();
  syncControlsFromState();
  applyShapeVisibility();
  applyStageHeight();
  updateMotionNote();
  rebuildRenderer();
  setStatus('Reset all controls to defaults.');
});

sectionHeightRange.addEventListener('input', () => {
  state.sectionHeightVh = parseIntValue(sectionHeightRange.value, state.sectionHeightVh);
  syncValueLabels();
  applyStageHeight();
});

shapeSelect.addEventListener('change', () => {
  state.shapeStyle = shapeSelect.value as CanvasShapeStyle;
  applyShapeVisibility();
  updateRenderer();
});

fullGradientToggle.addEventListener('change', () => {
  state.fullCanvasGradient = fullGradientToggle.checked;
  updateRenderer();
});

blendModeSelect.addEventListener('change', () => {
  state.blendMode = blendModeSelect.value as CanvasBlendMode;
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

speedRange.addEventListener('input', () => {
  state.speed = parseFloatValue(speedRange.value, state.speed);
  syncValueLabels();
  updateRenderer();
});

motionRange.addEventListener('input', () => {
  state.motionIntensity = parseFloatValue(motionRange.value, state.motionIntensity);
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

grainRange.addEventListener('input', () => {
  state.grainOpacity = parseFloatValue(grainRange.value, state.grainOpacity);
  syncValueLabels();
  updateRenderer();
});

blurRange.addEventListener('input', () => {
  state.blurPx = parseIntValue(blurRange.value, state.blurPx);
  syncValueLabels();
  updateRenderer();
});

blobRange.addEventListener('input', () => {
  state.blobCount = parseIntValue(blobRange.value, state.blobCount);
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
      benchmarkResult.textContent = 'No frame samples captured. Disable reduced-motion and unpause animation.';
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
    setStatus('PNG export unavailable.');
    return;
  }

  await renderer.downloadPng2x('grainy-blobber-2x.png');
  setStatus('Downloaded PNG @2x.');
});

downloadVideoBtn.addEventListener('click', async () => {
  if (!renderer?.recordClip) {
    setStatus('Video export unavailable.');
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
    setStatus(extension === 'mp4' ? 'Downloaded 10s MP4 clip.' : 'Downloaded 10s WebM clip (MP4 unsupported).');
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
  const builtins = PRESET_ORDER
    .map((presetId) => {
      const preset = PRESETS[presetId];
      return `<option value="${preset.id}">${preset.label}</option>`;
    })
    .join('');
  builtinPresetSelect.innerHTML = builtins;

  shapeSelect.innerHTML = `
    <option value="mesh">Smooth Mesh</option>
    <option value="center">Center Morph Blob</option>
  `;

  mouseModeSelect.innerHTML = `
    <option value="repel">Repel</option>
    <option value="attract">Attract</option>
  `;

  blendModeSelect.innerHTML = CANVAS_BLEND_MODES
    .map((mode) => `<option value="${mode.value}">${mode.label}</option>`)
    .join('');
}

function refreshSavedPresetOptions(selectedId = selectedSavedPresetId): void {
  const options = [
    '<option value="">None selected</option>',
    ...savedPresets.map((preset) => `<option value="${preset.id}">${escapeHtml(preset.name)}</option>`),
  ];
  savedPresetSelect.innerHTML = options.join('');
  savedPresetSelect.value = selectedId;
  selectedSavedPresetId = savedPresetSelect.value;
}

function syncControlsFromState(): void {
  builtinPresetSelect.value = state.presetId;
  sectionHeightRange.value = String(state.sectionHeightVh);
  shapeSelect.value = state.shapeStyle;
  fullGradientToggle.checked = state.fullCanvasGradient;
  blendModeSelect.value = state.blendMode;

  const normalizedBackground = normalizeHexColor(state.background, PRESETS[state.presetId].background);
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

  speedRange.value = state.speed.toFixed(2);
  motionRange.value = state.motionIntensity.toFixed(2);
  maxDprRange.value = state.maxDpr.toFixed(2);
  pauseToggle.checked = state.paused;

  grainRange.value = state.grainOpacity.toFixed(2);
  blurRange.value = String(state.blurPx);
  blobRange.value = String(state.blobCount);

  centerBlobScaleRange.value = state.centerBlobScale.toFixed(2);
  centerOffsetXRange.value = String(state.centerOffsetX);
  centerOffsetYRange.value = String(state.centerOffsetY);

  mouseToggle.checked = state.mouseInteraction;
  mouseModeSelect.value = state.mouseMode;
  mouseStrengthRange.value = state.mouseStrength.toFixed(2);
  mouseRadiusRange.value = String(state.mouseRadius);

  syncValueLabels();
}

function syncValueLabels(): void {
  sectionHeightValue.textContent = `${state.sectionHeightVh}vh`;
  speedValue.textContent = state.speed.toFixed(2);
  motionValue.textContent = state.motionIntensity.toFixed(2);
  maxDprValue.textContent = state.maxDpr.toFixed(2);
  grainValue.textContent = state.grainOpacity.toFixed(2);
  blurValue.textContent = String(state.blurPx);
  blobValue.textContent = String(state.blobCount);
  centerBlobScaleValue.textContent = state.centerBlobScale.toFixed(2);
  centerOffsetXValue.textContent = `${state.centerOffsetX}%`;
  centerOffsetYValue.textContent = `${state.centerOffsetY}%`;
  mouseStrengthValue.textContent = state.mouseStrength.toFixed(2);
  mouseRadiusValue.textContent = String(state.mouseRadius);
}

function applyShapeVisibility(): void {
  const shapeOnlyNodes = appRoot.querySelectorAll<HTMLElement>('[data-shape-only]');
  shapeOnlyNodes.forEach((node) => {
    const allowed = parseVisibilityList(node.dataset.shapeOnly);
    node.hidden = allowed.length > 0 && !allowed.includes(state.shapeStyle);
  });

  const shapeNotNodes = appRoot.querySelectorAll<HTMLElement>('[data-shape-not]');
  shapeNotNodes.forEach((node) => {
    const excluded = parseVisibilityList(node.dataset.shapeNot);
    node.hidden = excluded.length > 0 && excluded.includes(state.shapeStyle);
  });
}

function applyStageHeight(): void {
  const vh = clamp(state.sectionHeightVh, 30, 100);
  stageElement.style.minHeight = `${vh}vh`;
}

function updateMotionNote(): void {
  if (state.reducedMotion) {
    motionNote.textContent = 'Reduced-motion is enabled. Animation is paused and renderer stays static.';
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
    preset: PRESETS[state.presetId],
    colors: normalizePalette(state.colors),
    background: normalizeHexColor(state.background, PRESETS[state.presetId].background),
    sectionHeightVh: state.sectionHeightVh,
    shapeStyle: state.shapeStyle,
    maxDpr: state.maxDpr,
    paused: state.paused,
    speed: state.speed,
    motionIntensity: state.motionIntensity,
    grainOpacity: state.grainOpacity,
    centerBlobScale: state.centerBlobScale,
    centerOffsetX: state.centerOffsetX,
    centerOffsetY: state.centerOffsetY,
    blendMode: state.blendMode,
    fullCanvasGradient: state.fullCanvasGradient,
    mouseInteraction: state.mouseInteraction,
    mouseMode: state.mouseMode,
    mouseStrength: state.mouseStrength,
    mouseRadius: state.mouseRadius,
    blobCount: state.blobCount,
    blurPx: state.blurPx,
    reducedMotion: state.reducedMotion,
  };
}

function rebuildRenderer(): void {
  renderer?.destroy();
  renderer = null;

  renderer = createCanvasMeshRenderer(renderLayer, buildRenderConfig(), {
    onFrame: (drawMs, timestamp) => {
      perfMonitor.addFrame(drawMs, timestamp);
    },
  });

  setStatus('Canvas renderer ready.');
}

function updateRenderer(): void {
  if (!renderer) {
    rebuildRenderer();
    return;
  }
  renderer.update(buildRenderConfig());
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
  await copyText(snippets[kind]);
  setStatus(`Copied ${kind.toUpperCase()} snippet.`);
}

function applyBuiltInPreset(presetId: PresetId): void {
  const preset = PRESETS[presetId];
  state.presetId = presetId;
  state.colors = normalizePalette(preset.colors);
  state.background = normalizeHexColor(preset.background, state.background);
  state.blendMode = preset.defaultBlendMode;
  state.grainOpacity = preset.defaultGrainOpacity;
}

function resetCurrentStyle(): void {
  if (state.shapeStyle === 'center') {
    state.centerBlobScale = 1;
    state.centerOffsetX = 0;
    state.centerOffsetY = 0;
    state.motionIntensity = 1.5;
    state.blurPx = 110;
    return;
  }

  state.blobCount = 5;
  state.blurPx = 110;
  state.motionIntensity = 1.7;
}

function applySnapshot(snapshot: PresetSnapshot): void {
  state.presetId = snapshot.presetId;
  state.colors = normalizePalette(snapshot.colors);
  state.background = normalizeHexColor(snapshot.background, state.background);
  state.sectionHeightVh = clampInt(snapshot.sectionHeightVh, 30, 100);
  state.shapeStyle = snapshot.shapeStyle;
  state.maxDpr = clamp(snapshot.maxDpr, 1, 3);
  state.paused = snapshot.paused;
  state.speed = clamp(snapshot.speed, 0.1, 3);
  state.motionIntensity = clamp(snapshot.motionIntensity, 0.1, 3);
  state.grainOpacity = clamp(snapshot.grainOpacity, 0, 0.35);
  state.centerBlobScale = clamp(snapshot.centerBlobScale, 0.5, 2);
  state.centerOffsetX = clampInt(snapshot.centerOffsetX, -45, 45);
  state.centerOffsetY = clampInt(snapshot.centerOffsetY, -45, 45);
  state.blendMode = snapshot.blendMode;
  state.fullCanvasGradient = snapshot.fullCanvasGradient;
  state.mouseInteraction = snapshot.mouseInteraction;
  state.mouseMode = snapshot.mouseMode;
  state.mouseStrength = clamp(snapshot.mouseStrength, 0, 2.5);
  state.mouseRadius = clampInt(snapshot.mouseRadius, 60, 520);
  state.blobCount = clampInt(snapshot.blobCount, 2, 12);
  state.blurPx = clampInt(snapshot.blurPx, 20, 200);
}

function snapshotFromState(input: AppState): PresetSnapshot {
  return {
    presetId: input.presetId,
    colors: normalizePalette(input.colors),
    background: normalizeHexColor(input.background, PRESETS[input.presetId].background),
    sectionHeightVh: clampInt(input.sectionHeightVh, 30, 100),
    shapeStyle: input.shapeStyle,
    maxDpr: clamp(input.maxDpr, 1, 3),
    paused: input.paused,
    speed: clamp(input.speed, 0.1, 3),
    motionIntensity: clamp(input.motionIntensity, 0.1, 3),
    grainOpacity: clamp(input.grainOpacity, 0, 0.35),
    centerBlobScale: clamp(input.centerBlobScale, 0.5, 2),
    centerOffsetX: clampInt(input.centerOffsetX, -45, 45),
    centerOffsetY: clampInt(input.centerOffsetY, -45, 45),
    blendMode: input.blendMode,
    fullCanvasGradient: input.fullCanvasGradient,
    mouseInteraction: input.mouseInteraction,
    mouseMode: input.mouseMode,
    mouseStrength: clamp(input.mouseStrength, 0, 2.5),
    mouseRadius: clampInt(input.mouseRadius, 60, 520),
    blobCount: clampInt(input.blobCount, 2, 12),
    blurPx: clampInt(input.blurPx, 20, 200),
  };
}

function defaultSnapshot(): PresetSnapshot {
  const preset = PRESETS.neon;
  return {
    presetId: preset.id,
    colors: normalizePalette(preset.colors),
    background: normalizeHexColor(preset.background, '#08111f'),
    sectionHeightVh: 58,
    shapeStyle: 'mesh',
    maxDpr: 2,
    paused: false,
    speed: 1,
    motionIntensity: 1.7,
    grainOpacity: preset.defaultGrainOpacity,
    centerBlobScale: 1,
    centerOffsetX: 0,
    centerOffsetY: 0,
    blendMode: preset.defaultBlendMode,
    fullCanvasGradient: false,
    mouseInteraction: true,
    mouseMode: 'repel',
    mouseStrength: 1,
    mouseRadius: 240,
    blobCount: 5,
    blurPx: 110,
  };
}

function estimateCostScore(stats: RollingPerfStats, config: RenderConfig): number {
  const measuredDrawWeight = clamp(stats.drawMs / 16.67, 0, 2.8);
  const measuredFrameWeight = clamp(stats.frameMs / 16.67, 0, 2.8);
  const measuredFpsPenalty = clamp((60 - stats.fps) / 60, 0, 1.8);

  const dprWeight = clamp(config.maxDpr / 2, 0.5, 1.6);
  const blurWeight = clamp(config.blurPx / 170, 0, 1.25);
  const blobWeight = config.shapeStyle === 'mesh'
    ? clamp(config.blobCount / 12, 0.2, 1.1)
    : 0.65;

  const rawScore =
    measuredDrawWeight * 34
    + measuredFrameWeight * 20
    + measuredFpsPenalty * 24
    + dprWeight * 10
    + blurWeight * 8
    + blobWeight * 4;

  return Math.round(clamp(rawScore, 0, 100));
}

function setStatus(message: string): void {
  statusLine.textContent = message;
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

function normalizePalette(colors: string[]): string[] {
  const fallback = PRESETS.neon.colors;
  return Array.from({ length: PALETTE_SIZE }, (_, index) => {
    const raw = colors[index] ?? fallback[index % fallback.length] ?? '#3b82f6';
    return normalizeHexColor(raw, '#3b82f6');
  });
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

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function makePresetId(): string {
  if ('randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `preset-${Math.random().toString(16).slice(2, 10)}`;
}

function slugifyFilename(value: string): string {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'grainy-blobber-preset';
}

function loadSavedPresets(): SavedPreset[] {
  const raw = window.localStorage.getItem(USER_PRESETS_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeImportedPresets(parsed);
  } catch {
    return [];
  }
}

function persistSavedPresets(presets: SavedPreset[]): void {
  window.localStorage.setItem(USER_PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

function normalizeImportedPresets(raw: unknown): SavedPreset[] {
  const items: unknown[] = Array.isArray(raw) ? raw : [raw];
  const normalized: SavedPreset[] = [];

  for (let i = 0; i < items.length; i += 1) {
    const candidate = items[i];
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }

    const obj = candidate as Record<string, unknown>;
    const maybeSnapshot = (obj.snapshot ?? obj) as Record<string, unknown>;
    const parsedSnapshot = parseSnapshot(maybeSnapshot);
    if (!parsedSnapshot) {
      continue;
    }

    const id = typeof obj.id === 'string' && obj.id.length > 0 ? obj.id : makePresetId();
    const name = typeof obj.name === 'string' && obj.name.trim().length > 0 ? obj.name.trim() : `Imported ${normalized.length + 1}`;
    const createdAt = typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString();
    const updatedAt = typeof obj.updatedAt === 'string' ? obj.updatedAt : new Date().toISOString();

    normalized.push({
      id,
      name,
      createdAt,
      updatedAt,
      snapshot: parsedSnapshot,
    });
  }

  return normalized;
}

function parseSnapshot(raw: Record<string, unknown>): PresetSnapshot | null {
  const presetId = typeof raw.presetId === 'string' && raw.presetId in PRESETS
    ? (raw.presetId as PresetId)
    : PRESET_ORDER[0];

  const fallback = defaultSnapshot();
  const colors = Array.isArray(raw.colors) ? raw.colors.map((value) => String(value)) : fallback.colors;

  const shapeStyle = raw.shapeStyle === 'center' ? 'center' : 'mesh';
  const mouseMode: MouseMode = raw.mouseMode === 'attract' ? 'attract' : 'repel';

  return {
    presetId,
    colors: normalizePalette(colors),
    background: normalizeHexColor(String(raw.background ?? fallback.background), fallback.background),
    sectionHeightVh: clampInt(Number(raw.sectionHeightVh ?? fallback.sectionHeightVh), 30, 100),
    shapeStyle,
    maxDpr: clamp(Number(raw.maxDpr ?? fallback.maxDpr), 1, 3),
    paused: Boolean(raw.paused ?? fallback.paused),
    speed: clamp(Number(raw.speed ?? fallback.speed), 0.1, 3),
    motionIntensity: clamp(Number(raw.motionIntensity ?? fallback.motionIntensity), 0.1, 3),
    grainOpacity: clamp(Number(raw.grainOpacity ?? fallback.grainOpacity), 0, 0.35),
    centerBlobScale: clamp(Number(raw.centerBlobScale ?? fallback.centerBlobScale), 0.5, 2),
    centerOffsetX: clampInt(Number(raw.centerOffsetX ?? fallback.centerOffsetX), -45, 45),
    centerOffsetY: clampInt(Number(raw.centerOffsetY ?? fallback.centerOffsetY), -45, 45),
    blendMode: (CANVAS_BLEND_MODES.some((item) => item.value === raw.blendMode)
      ? raw.blendMode
      : fallback.blendMode) as CanvasBlendMode,
    fullCanvasGradient: Boolean(raw.fullCanvasGradient ?? fallback.fullCanvasGradient),
    mouseInteraction: Boolean(raw.mouseInteraction ?? fallback.mouseInteraction),
    mouseMode,
    mouseStrength: clamp(Number(raw.mouseStrength ?? fallback.mouseStrength), 0, 2.5),
    mouseRadius: clampInt(Number(raw.mouseRadius ?? fallback.mouseRadius), 60, 520),
    blobCount: clampInt(Number(raw.blobCount ?? fallback.blobCount), 2, 12),
    blurPx: clampInt(Number(raw.blurPx ?? fallback.blurPx), 20, 200),
  };
}

function buildColorFieldsHtml(): string {
  const rows = [
    {
      label: 'Background',
      colorId: 'backgroundColorInput',
      hexId: 'backgroundHexInput',
      defaultValue: PRESETS.neon.background,
      full: true,
    },
    ...Array.from({ length: PALETTE_SIZE }, (_, index) => ({
      label: `Color ${index + 1}`,
      colorId: `colorInput${index}`,
      hexId: `colorHexInput${index}`,
      defaultValue: PRESETS.neon.colors[index % PRESETS.neon.colors.length] ?? '#3b82f6',
      full: false,
    })),
  ];

  return rows
    .map((row) => {
      const cls = row.full ? 'gb-color-field gb-color-field--full' : 'gb-color-field';
      return `
        <label class="${cls}">
          <span>${row.label}</span>
          <div class="gb-color-input-row">
            <input id="${row.colorId}" type="color" />
            <input id="${row.hexId}" class="gb-hex-input" type="text" value="${row.defaultValue}" maxlength="7" spellcheck="false" autocapitalize="off" autocomplete="off" />
          </div>
        </label>
      `;
    })
    .join('');
}

function buildAppShellHtml(): string {
  return `
  <div class="gb-app">
    <aside class="gb-panel">
      <header class="gb-panel-head">
        <h1>Grainy Blobber</h1>
        <p class="gb-subtitle">Canvas-only gradient background generator.</p>
      </header>

      <section class="gb-preset-strip">
        <label>
          <span>Built-in Theme</span>
          <select id="builtinPresetSelect"></select>
        </label>

        <label>
          <span>Saved Presets</span>
          <select id="savedPresetSelect"></select>
        </label>

        <div class="gb-inline-row">
          <input id="presetNameInput" class="gb-text-input" type="text" placeholder="Preset name" maxlength="64" />
          <button id="savePresetBtn" type="button">Save New</button>
        </div>

        <div class="gb-inline-row gb-inline-row--small">
          <button id="updatePresetBtn" type="button">Update</button>
          <button id="deletePresetBtn" type="button">Delete</button>
          <button id="exportPresetBtn" type="button">Export</button>
          <button id="importPresetBtn" type="button">Import</button>
          <input id="importPresetFile" type="file" accept=".json,application/json" hidden />
        </div>

        <div class="gb-inline-row gb-inline-row--small">
          <button id="resetStyleBtn" type="button">Reset Style</button>
          <button id="resetAllBtn" type="button">Reset All</button>
        </div>
      </section>

      <details class="gb-group" open>
        <summary>Layout</summary>
        <label>
          <span>Section height <strong id="sectionHeightValue">58vh</strong></span>
          <input id="sectionHeightRange" type="range" min="30" max="100" step="1" value="58" />
        </label>
      </details>

      <details class="gb-group" open>
        <summary>Style</summary>
        <label>
          <span>Style</span>
          <select id="shapeSelect"></select>
        </label>

        <label data-shape-only="center">
          <span>Center blob size <strong id="centerBlobScaleValue">1.00</strong></span>
          <input id="centerBlobScaleRange" type="range" min="0.5" max="2" step="0.05" value="1" />
        </label>

        <label data-shape-only="center">
          <span>Center X <strong id="centerOffsetXValue">0%</strong></span>
          <input id="centerOffsetXRange" type="range" min="-45" max="45" step="1" value="0" />
        </label>

        <label data-shape-only="center">
          <span>Center Y <strong id="centerOffsetYValue">0%</strong></span>
          <input id="centerOffsetYRange" type="range" min="-45" max="45" step="1" value="0" />
        </label>

        <label data-shape-only="mesh">
          <span>Blob count <strong id="blobValue">5</strong></span>
          <input id="blobRange" type="range" min="2" max="12" step="1" value="5" />
        </label>

        <label>
          <span>Blur px <strong id="blurValue">110</strong></span>
          <input id="blurRange" type="range" min="20" max="200" step="1" value="110" />
        </label>

        <label class="gb-checkbox">
          <input id="fullGradientToggle" type="checkbox" />
          <span>Full-canvas gradient</span>
        </label>
      </details>

      <details class="gb-group" open>
        <summary>Colors</summary>
        <div class="gb-color-grid">
          ${buildColorFieldsHtml()}
        </div>
      </details>

      <details class="gb-group" open>
        <summary>Motion</summary>
        <label>
          <span>Speed <strong id="speedValue">1.00</strong></span>
          <input id="speedRange" type="range" min="0.1" max="3" step="0.05" value="1.0" />
        </label>

        <label>
          <span>Motion amount <strong id="motionValue">1.70</strong></span>
          <input id="motionRange" type="range" min="0.1" max="3" step="0.05" value="1.7" />
        </label>

        <label>
          <span>Max DPR <strong id="maxDprValue">2.00</strong></span>
          <input id="maxDprRange" type="range" min="1" max="3" step="0.25" value="2" />
        </label>

        <label class="gb-checkbox">
          <input id="pauseToggle" type="checkbox" />
          <span>Pause animation</span>
        </label>
      </details>

      <details class="gb-group" open>
        <summary>Texture</summary>
        <label>
          <span>Blend mode</span>
          <select id="blendModeSelect"></select>
        </label>

        <label>
          <span>Grain opacity <strong id="grainValue">0.12</strong></span>
          <input id="grainRange" type="range" min="0" max="0.35" step="0.01" value="0.12" />
        </label>
      </details>

      <details class="gb-group" open>
        <summary>Interaction</summary>
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
      </details>

      <details class="gb-group gb-group--export" open>
        <summary>Export</summary>
        <div class="gb-actions gb-export-copy">
          <button id="copyHtmlBtn" type="button">Copy HTML</button>
          <button id="copyCssBtn" type="button">Copy CSS</button>
          <button id="copyJsBtn" type="button">Copy JS</button>
        </div>

        <div class="gb-actions gb-export-mode">
          <button id="downloadPngBtn" type="button">Download PNG @2x</button>
          <button id="downloadVideoBtn" type="button">Download 10s MP4</button>
        </div>

        <p id="statusLine" class="gb-status" role="status" aria-live="polite">Ready.</p>
      </details>
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
        <div class="gb-actions">
          <button id="benchmarkBtn" type="button">Run 5s benchmark</button>
        </div>
        <p id="benchmarkResult" class="gb-benchmark">Benchmark idle.</p>
        <p id="motionNote" class="gb-motion-note"></p>
      </section>
    </main>
  </div>
  `;
}

function queryEl<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

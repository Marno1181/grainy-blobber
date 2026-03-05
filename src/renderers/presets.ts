import type { CanvasBlendMode, GrainPreset, PresetId } from './types';

export const PRESETS: Record<PresetId, GrainPreset> = {
  'itonics-neutral': {
    id: 'itonics-neutral',
    label: 'Itonics Neutral',
    background: '#f3f4f6',
    colors: ['#0b1220', '#3b82f6', '#a1a1aa', '#f5f5f5'],
    defaultBlendMode: 'lighter',
    defaultGrainOpacity: 0.12,
  },
  neon: {
    id: 'neon',
    label: 'Neon',
    background: '#08111f',
    colors: ['#00f5ff', '#ff2e9f', '#7cff00', '#4d8dff'],
    defaultBlendMode: 'screen',
    defaultGrainOpacity: 0.16,
  },
  dark: {
    id: 'dark',
    label: 'Dark',
    background: '#0c0d12',
    colors: ['#101420', '#253356', '#4e5b7a', '#7f8aa6'],
    defaultBlendMode: 'soft-light',
    defaultGrainOpacity: 0.1,
  },
};

export const PRESET_ORDER: PresetId[] = ['itonics-neutral', 'neon', 'dark'];

export const CANVAS_BLEND_MODES: ReadonlyArray<{ value: CanvasBlendMode; label: string }> = [
  { value: 'source-over', label: 'Source Over' },
  { value: 'lighter', label: 'Lighter' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'hard-light', label: 'Hard Light' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
];

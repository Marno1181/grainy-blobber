export type PresetId = 'itonics-neutral' | 'neon' | 'dark';

export type CanvasShapeStyle = 'mesh' | 'center';

export type MouseMode = 'repel' | 'attract';

export type CanvasBlendMode =
  | 'source-over'
  | 'lighter'
  | 'screen'
  | 'overlay'
  | 'multiply'
  | 'soft-light'
  | 'hard-light'
  | 'color-dodge'
  | 'difference'
  | 'exclusion';

export interface GrainPreset {
  id: PresetId;
  label: string;
  background: string;
  colors: string[];
  defaultBlendMode: CanvasBlendMode;
  defaultGrainOpacity: number;
}

export interface RenderConfig {
  preset: GrainPreset;
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

export interface RendererCallbacks {
  onFrame?: (drawMs: number, timestamp: number) => void;
}

export interface ClipRecordOptions {
  durationMs?: number;
  fps?: number;
  preferMp4?: boolean;
  allowWebmFallback?: boolean;
}

export interface ClipRecordResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export interface RendererHandle {
  update: (next: RenderConfig) => void;
  destroy: () => void;
  downloadPng2x?: (filename: string) => Promise<void>;
  recordClip?: (options?: ClipRecordOptions) => Promise<ClipRecordResult | null>;
}

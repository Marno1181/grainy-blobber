export interface RollingPerfStats {
  fps: number;
  frameMs: number;
  drawMs: number;
  samples: number;
}

export interface BenchmarkResult {
  averageFps: number;
  worstFrameMs: number;
  samples: number;
  durationMs: number;
}

interface FrameSample {
  ts: number;
  drawMs: number;
}

interface ActiveBenchmark {
  endTs: number;
  startTs: number;
  lastTs: number | null;
  intervalTotal: number;
  intervalCount: number;
  worstFrameMs: number;
  resolve: (result: BenchmarkResult) => void;
}

export class PerfMonitor {
  private readonly rollingWindowMs: number;

  private readonly samples: FrameSample[] = [];

  private benchmark: ActiveBenchmark | null = null;

  constructor(rollingWindowMs = 2200) {
    this.rollingWindowMs = rollingWindowMs;
  }

  addFrame(drawMs: number, ts: number): void {
    this.samples.push({ ts, drawMs });
    this.trim(ts);

    if (!this.benchmark) {
      return;
    }

    if (this.benchmark.lastTs !== null) {
      const interval = ts - this.benchmark.lastTs;
      this.benchmark.intervalTotal += interval;
      this.benchmark.intervalCount += 1;
      this.benchmark.worstFrameMs = Math.max(this.benchmark.worstFrameMs, interval);
    }

    this.benchmark.lastTs = ts;

    if (ts >= this.benchmark.endTs) {
      this.finishBenchmark(ts);
    }
  }

  getRollingStats(nowTs = performance.now()): RollingPerfStats {
    this.trim(nowTs);
    if (this.samples.length === 0) {
      return {
        fps: 0,
        frameMs: 0,
        drawMs: 0,
        samples: 0,
      };
    }

    const firstTs = this.samples[0]?.ts ?? nowTs;
    const lastTs = this.samples[this.samples.length - 1]?.ts ?? nowTs;
    const elapsedMs = Math.max(1, lastTs - firstTs);

    let frameMs = 0;
    if (this.samples.length > 1) {
      let intervalSum = 0;
      for (let i = 1; i < this.samples.length; i += 1) {
        const prev = this.samples[i - 1];
        const current = this.samples[i];
        if (!prev || !current) {
          continue;
        }
        intervalSum += Math.max(0, current.ts - prev.ts);
      }
      frameMs = intervalSum / (this.samples.length - 1);
    }

    const fps = this.samples.length > 1
      ? ((this.samples.length - 1) / elapsedMs) * 1000
      : 0;

    let drawSum = 0;
    for (let i = 0; i < this.samples.length; i += 1) {
      drawSum += this.samples[i]?.drawMs ?? 0;
    }
    const avgDrawMs = drawSum / this.samples.length;

    return {
      fps,
      frameMs,
      drawMs: avgDrawMs,
      samples: this.samples.length,
    };
  }

  runBenchmark(durationMs = 5000): Promise<BenchmarkResult> {
    if (this.benchmark) {
      return Promise.reject(new Error('A benchmark is already running.'));
    }

    const startTs = performance.now();
    return new Promise((resolve) => {
      this.benchmark = {
        startTs,
        endTs: startTs + durationMs,
        lastTs: null,
        intervalTotal: 0,
        intervalCount: 0,
        worstFrameMs: 0,
        resolve,
      };

      window.setTimeout(() => {
        if (this.benchmark) {
          this.finishBenchmark(performance.now());
        }
      }, durationMs + 120);
    });
  }

  private finishBenchmark(endTs: number): void {
    if (!this.benchmark) {
      return;
    }

    const active = this.benchmark;
    this.benchmark = null;

    const durationMs = Math.max(0, endTs - active.startTs);
    const averageFps = active.intervalCount > 0
      ? (active.intervalCount / active.intervalTotal) * 1000
      : 0;

    active.resolve({
      averageFps,
      worstFrameMs: active.worstFrameMs,
      samples: active.intervalCount,
      durationMs,
    });
  }

  private trim(nowTs: number): void {
    const cutoff = nowTs - this.rollingWindowMs;
    while (this.samples.length > 0 && (this.samples[0]?.ts ?? 0) < cutoff) {
      this.samples.shift();
    }
  }
}

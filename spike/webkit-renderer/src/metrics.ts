/** Frame-time ring + percentile helpers (mirrors host.ts's §12.1 probe:
 * rolling deltaMS samples off the Pixi ticker). */

export function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!
}

export class FrameProbe {
  #ring: number[] = []
  #max: number
  constructor(max = 600) {
    this.#max = max
  }

  push(deltaMS: number): void {
    this.#ring.push(deltaMS)
    if (this.#ring.length > this.#max) this.#ring.shift()
  }

  /** Rolling stats over the ring (recent ~seconds of frames). */
  rolling(): { fps: number; p50: number; p95: number; frames: number } {
    if (this.#ring.length === 0) return { fps: 0, p50: 0, p95: 0, frames: 0 }
    const sorted = [...this.#ring].sort((a, b) => a - b)
    const p50 = percentile(sorted, 0.5)
    return {
      fps: p50 > 0 ? 1000 / p50 : 0,
      p50,
      p95: percentile(sorted, 0.95),
      frames: sorted.length,
    }
  }
}

/** Accumulates every frame time during a sweep window for the summary. */
export class SweepAccumulator {
  #samples: number[] = []
  push(deltaMS: number): void {
    this.#samples.push(deltaMS)
  }
  reset(): void {
    this.#samples = []
  }
  summary(): {
    frames: number
    meanFps: number
    p50Ms: number
    p95Ms: number
    p99Ms: number
    maxMs: number
    longFrames: number
  } {
    const s = this.#samples
    if (s.length === 0) {
      return { frames: 0, meanFps: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, longFrames: 0 }
    }
    const sorted = [...s].sort((a, b) => a - b)
    const total = s.reduce((a, b) => a + b, 0)
    // Mean FPS = frames rendered per second of wall time in the window.
    const meanFps = total > 0 ? (s.length * 1000) / total : 0
    return {
      frames: s.length,
      meanFps: round(meanFps, 1),
      p50Ms: round(percentile(sorted, 0.5), 2),
      p95Ms: round(percentile(sorted, 0.95), 2),
      p99Ms: round(percentile(sorted, 0.99), 2),
      maxMs: round(sorted[sorted.length - 1]!, 2),
      // Frames over 33ms (below ~30fps) — the jank count.
      longFrames: s.filter((d) => d > 33).length,
    }
  }
}

export function round(n: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

/** Frame-time and heap collection for one scenario run. */

export interface ScenarioResult {
  renderer: string
  scenario: string
  frames: number
  avgMs: number
  p95Ms: number
  maxMs: number
  heapStartMB: number | null
  heapPeakMB: number | null
  heapEndMB: number | null
  commits: number
  expectedCommits: number
  ok: boolean
  error?: string
}

interface PerformanceMemory {
  usedJSHeapSize: number
}

export function usedHeapMB(): number | null {
  const mem = (performance as unknown as { memory?: PerformanceMemory }).memory
  if (!mem) return null
  return Math.round((mem.usedJSHeapSize / 1048576) * 10) / 10
}

export class FrameCollector {
  private durations: number[] = []
  private last: number | null = null
  private peakHeap: number | null = null

  frame(now: number): void {
    if (this.last !== null) this.durations.push(now - this.last)
    this.last = now
    if (this.durations.length % 20 === 0) {
      const heap = usedHeapMB()
      if (heap !== null) this.peakHeap = Math.max(this.peakHeap ?? 0, heap)
    }
  }

  summarize(): { frames: number; avgMs: number; p95Ms: number; maxMs: number; heapPeakMB: number | null } {
    const d = [...this.durations].sort((a, b) => a - b)
    const n = d.length
    const round = (v: number) => Math.round(v * 100) / 100
    if (n === 0) return { frames: 0, avgMs: 0, p95Ms: 0, maxMs: 0, heapPeakMB: this.peakHeap }
    const avg = d.reduce((s, v) => s + v, 0) / n
    const p95 = d[Math.min(n - 1, Math.floor(n * 0.95))] ?? 0
    const max = d[n - 1] ?? 0
    return { frames: n, avgMs: round(avg), p95Ms: round(p95), maxMs: round(max), heapPeakMB: this.peakHeap }
  }
}

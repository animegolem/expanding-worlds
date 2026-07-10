import type { Camera } from '@ew/canvas-engine'

/**
 * Scripted 30s stress sweep. Drives the camera programmatically through
 * three phases that each hammer a different part of the render path:
 *
 *  1. Serpentine PAN across the whole board at a wide zoom — maximum
 *     visible items, so per-frame draw + culling churn dominates.
 *  2. ZOOM oscillation on the board center — texture residency + mip
 *     sampling churn as images cross the resident band in and out.
 *  3. Diagonal PAN at mid zoom — residency enter/leave thrash at the
 *     hysteresis edge, the worst case for texture upload spikes.
 *
 * Every camera write goes through camera.set(), which fires onChanged →
 * the host-equivalent applyTo + cull. Frame times are sampled by the
 * ticker in main.ts (this loop only steers the camera).
 */

export interface SweepPhase {
  name: string
  fromMs: number
  toMs: number
}

export interface SweepOptions {
  camera: Camera
  bounds: { x: number; y: number; width: number; height: number }
  viewport: () => { width: number; height: number }
  durationMs: number
  onProgress?: (frac: number) => void
}

export interface SweepResult {
  phases: SweepPhase[]
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Triangle wave in [0,1] with `cycles` full back-and-forths over t∈[0,1]. */
function triangle(t: number, cycles: number): number {
  const p = (t * cycles) % 1
  return p < 0.5 ? p * 2 : 2 - p * 2
}

export function runSweep(opts: SweepOptions): Promise<SweepResult> {
  const { camera, bounds, viewport, durationMs, onProgress } = opts
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2

  // Wide zoom: whole board fits the viewport (with margin). Close zoom:
  // several images fill the screen (heavy texel load per image).
  const vp = viewport()
  const wideZoom = Math.min(vp.width / (bounds.width * 1.2), vp.height / (bounds.height * 1.2))
  const midZoom = wideZoom * 3
  const closeZoom = wideZoom * 8

  const phases: SweepPhase[] = [
    { name: 'pan-wide', fromMs: 0, toMs: durationMs / 3 },
    { name: 'zoom-oscillate', fromMs: durationMs / 3, toMs: (2 * durationMs) / 3 },
    { name: 'pan-diagonal-mid', fromMs: (2 * durationMs) / 3, toMs: durationMs },
  ]

  return new Promise((resolve) => {
    const start = performance.now()
    function frame(now: number): void {
      const elapsed = now - start
      const frac = Math.min(1, elapsed / durationMs)
      const v = viewport()

      if (elapsed < phases[1]!.fromMs) {
        // Phase 1: serpentine pan across the board at wide zoom.
        const zoom = wideZoom
        const t = elapsed / (phases[0]!.toMs - phases[0]!.fromMs)
        const tx = triangle(t, 3) // 3 horizontal sweeps
        const ty = t // slow vertical drift top→bottom
        const worldX = lerp(bounds.x, bounds.x + bounds.width, tx)
        const worldY = lerp(bounds.y, bounds.y + bounds.height, ty)
        camera.set({ x: worldX - v.width / 2 / zoom, y: worldY - v.height / 2 / zoom, zoom })
      } else if (elapsed < phases[2]!.fromMs) {
        // Phase 2: zoom in/out on board center.
        const t = (elapsed - phases[1]!.fromMs) / (phases[1]!.toMs - phases[1]!.fromMs)
        const k = triangle(t, 3) // 3 zoom cycles
        const zoom = lerp(wideZoom, closeZoom, k)
        camera.set({ x: cx - v.width / 2 / zoom, y: cy - v.height / 2 / zoom, zoom })
      } else {
        // Phase 3: diagonal pan at mid zoom (residency thrash).
        const t = (elapsed - phases[2]!.fromMs) / (phases[2]!.toMs - phases[2]!.fromMs)
        const zoom = midZoom
        const d = triangle(t, 2)
        const worldX = lerp(bounds.x, bounds.x + bounds.width, d)
        const worldY = lerp(bounds.y, bounds.y + bounds.height, d)
        camera.set({ x: worldX - v.width / 2 / zoom, y: worldY - v.height / 2 / zoom, zoom })
      }

      onProgress?.(frac)
      if (elapsed < durationMs) requestAnimationFrame(frame)
      else resolve({ phases })
    }
    requestAnimationFrame(frame)
  })
}

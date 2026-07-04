import type { Op, RendererAdapter, Scene } from './adapter'
import type { Scenario } from './scenarios'
import type { SceneKey } from './fixtures'
import { FrameCollector, usedHeapMB, type ScenarioResult } from './metrics'
import { clearTextureCache } from './textures'

const nextFrame = (): Promise<number> => new Promise((r) => requestAnimationFrame(r))

async function idleFrames(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await nextFrame()
}

/**
 * Drives one scenario against one adapter: one op per animation frame,
 * frame times collected throughout, heap sampled before, at peak, and
 * after unmount + settle.
 */
export async function runScenario(
  adapter: RendererAdapter,
  scenario: Scenario,
  scenes: Record<SceneKey, Scene>,
  host: HTMLElement,
  view: { w: number; h: number },
): Promise<ScenarioResult> {
  const base: Omit<ScenarioResult, 'frames' | 'avgMs' | 'p95Ms' | 'maxMs' | 'heapPeakMB'> & {
    frames: number
    avgMs: number
    p95Ms: number
    maxMs: number
    heapPeakMB: number | null
  } = {
    renderer: adapter.name,
    scenario: scenario.name,
    frames: 0,
    avgMs: 0,
    p95Ms: 0,
    maxMs: 0,
    heapStartMB: usedHeapMB(),
    heapPeakMB: null,
    heapEndMB: null,
    commits: 0,
    expectedCommits: scenario.expectedCommits,
    ok: false,
  }

  let commits = 0
  const collector = new FrameCollector()

  try {
    await adapter.mount(host, view.w, view.h)
    await adapter.loadScene(scenes[scenario.sceneKey])
    await idleFrames(10)

    for (const op of scenario.ops) {
      if (op.t === 'wait') {
        for (let i = 0; i < op.frames; i++) collector.frame(await nextFrame())
        continue
      }
      if (op.t === 'commitGesture') commits++
      if (op.t === 'loadScene') {
        await adapter.loadScene(scenes[op.sceneKey as SceneKey])
      } else {
        adapter.applyOp(op as Op)
      }
      collector.frame(await nextFrame())
    }

    const summary = collector.summarize()
    await adapter.unmount()
    clearTextureCache()
    await idleFrames(30)

    return {
      ...base,
      ...summary,
      heapEndMB: usedHeapMB(),
      commits,
      ok: commits === scenario.expectedCommits,
    }
  } catch (err) {
    try {
      await adapter.unmount()
    } catch {
      /* already broken; surface the original error */
    }
    return { ...base, commits, error: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err) }
  }
}

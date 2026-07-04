import { buildScenes, scenesChecksum, VIEW, type SceneKey } from './fixtures'
import { buildScenarios } from './scenarios'
import { runScenario } from './runner'
import { adapters } from './registry'
import type { ScenarioResult } from './metrics'

const SEED = 20260703

const scenes = buildScenes(SEED)
const scenarios = buildScenarios((key: SceneKey) => ({
  images: scenes[key].images.map((i) => i.id),
  pins: scenes[key].pins.map((p) => p.id),
}))

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel)
  if (!el) throw new Error(`missing element ${sel}`)
  return el
}

const host = $('#host')
const log = $('#log')
const out = $('#out')
const select = $<HTMLSelectElement>('#adapter')
const runBtn = $<HTMLButtonElement>('#run-all')
const dlBtn = $<HTMLButtonElement>('#download')

for (const name of Object.keys(adapters)) {
  const opt = document.createElement('option')
  opt.value = name
  opt.textContent = name
  select.appendChild(opt)
}

let lastResults: ScenarioResult[] = []

function logLine(text: string, cls: string): HTMLElement {
  const div = document.createElement('div')
  div.textContent = text
  div.className = cls
  log.appendChild(div)
  return div
}

export async function runAll(adapterName: string): Promise<ScenarioResult[]> {
  const factory = adapters[adapterName]
  if (!factory) throw new Error(`unknown adapter: ${adapterName}`)
  log.replaceChildren()
  out.textContent = ''
  const results: ScenarioResult[] = []
  for (const scenario of scenarios) {
    const line = logLine(`▶ ${scenario.name}`, 'running')
    const adapter = await factory()
    const result = await runScenario(adapter, scenario, scenes, host, VIEW)
    results.push(result)
    line.textContent = result.error
      ? `✗ ${scenario.name}: ${result.error.split('\n')[0]}`
      : `✓ ${scenario.name} avg ${result.avgMs}ms p95 ${result.p95Ms}ms`
    line.className = result.error ? 'fail' : 'done'
  }
  lastResults = results
  out.textContent = JSON.stringify(results, null, 2)
  dlBtn.disabled = false
  return results
}

runBtn.addEventListener('click', () => {
  void runAll(select.value)
})

dlBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(lastResults, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `spike-results-${select.value}-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(a.href)
})

declare global {
  interface Window {
    __spike: {
      seed: number
      runAll: (adapterName: string) => Promise<ScenarioResult[]>
      checksum: () => string
      checksumFresh: (seed: number) => string
      scenarioCount: number
      adapterNames: () => string[]
    }
  }
}

window.__spike = {
  seed: SEED,
  runAll,
  checksum: () => scenesChecksum(scenes),
  checksumFresh: (seed: number) => scenesChecksum(buildScenes(seed)),
  scenarioCount: scenarios.length,
  adapterNames: () => Object.keys(adapters),
}

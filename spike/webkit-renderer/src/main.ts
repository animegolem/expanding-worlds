import { Application } from 'pixi.js'
import {
  Camera,
  Culler,
  createDefaultRegistry,
  createScenePlanes,
  SceneSync,
  setPlacementTextureResident,
  TextureBudget,
  type RendererResources,
} from '@ew/canvas-engine'
import { loadSyntheticTexture } from './textures'
import { buildScene, type BuiltScene } from './scene'
import { FrameProbe, round, SweepAccumulator } from './metrics'
import { runSweep } from './sweep'
import { makeSyntheticRedraw, TieredTextureBudget } from './tiering'

/**
 * AI-IMP-217 harness. Mounts the REAL @ew/canvas-engine render path
 * (planes → SceneSync → default renderer registry → TextureBudget →
 * Culler → Camera) against a synthetic board, wires host-equivalent
 * pan/zoom input, and runs a scripted 30s stress sweep that emits a
 * copyable JSON summary. Measurement discipline (EPIC-004): the JSON
 * carries device/browser/DPR/GL beside every number.
 */

const hostEl = document.getElementById('host') as HTMLElement
const els = {
  fps: document.getElementById('fps')!,
  p95: document.getElementById('p95')!,
  p50: document.getElementById('p50')!,
  dpr: document.getElementById('dpr')!,
  texmem: document.getElementById('texmem')!,
  resident: document.getElementById('resident')!,
  gl: document.getElementById('gl')!,
  count: document.getElementById('count') as HTMLInputElement,
  rebuild: document.getElementById('rebuild') as HTMLButtonElement,
  run: document.getElementById('run') as HTMLButtonElement,
  copy: document.getElementById('copy') as HTMLButtonElement,
  status: document.getElementById('sweep-status')!,
  json: document.getElementById('json') as HTMLTextAreaElement,
  mode: document.getElementById('mode') as HTMLSelectElement,
  budget: document.getElementById('budget') as HTMLInputElement,
}

function detectBrowser(): string {
  const ua = navigator.userAgent
  if (/Edg\//.test(ua)) return 'Edge'
  if (/Chrome\/|Chromium\//.test(ua) && !/OPR\//.test(ua)) return 'Chromium'
  if (/Firefox\//.test(ua)) return 'Firefox'
  // Safari reports "Version/x Safari/y" and no Chrome token.
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'Safari'
  return 'unknown'
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${round(bytes / 1024, 1)} KB`
  return `${round(bytes / (1024 * 1024), 1)} MB`
}

async function main(): Promise<void> {
  const app = new Application()
  await app.init({
    resizeTo: hostEl,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    background: '#1e1e22',
  })
  hostEl.appendChild(app.canvas)
  ;(window as unknown as { __app: Application }).__app = app

  // AI-IMP-241 mode flags (query string, so the driver can sweep both
  // modes headless): ?mode=tiered|off & ?budget=<MB> & ?count=<N>. Off
  // is the 217 baseline path, untouched — the sibling Tauri copy sees it
  // unchanged.
  const params = new URLSearchParams(location.search)
  const mode: 'off' | 'tiered' = params.get('mode') === 'tiered' ? 'tiered' : 'off'
  const budgetMB = Math.max(64, Number(params.get('budget') ?? 1536) || 1536)
  const budgetBytes = budgetMB * 1024 * 1024
  const dpr = window.devicePixelRatio || 1
  const queryCount = Number(params.get('count'))
  if (Number.isFinite(queryCount) && queryCount >= 1) els.count.value = String(Math.round(queryCount))
  // Reflect the active mode/budget in the controls; changing them reloads
  // with the new query (a fresh budget is cleanest for a comparison run).
  els.mode.value = mode
  els.budget.value = String(budgetMB)
  const reloadWith = (): void => {
    const next = new URLSearchParams(location.search)
    next.set('mode', els.mode.value)
    next.set('budget', els.budget.value)
    next.set('count', els.count.value)
    location.search = next.toString()
  }
  els.mode.addEventListener('change', reloadWith)
  els.budget.addEventListener('change', reloadWith)

  const planes = createScenePlanes()
  app.stage.addChild(planes.world, planes.overlay)
  const registry = createDefaultRegistry()
  const textureBudget = new TextureBudget(loadSyntheticTexture)
  const tiered = mode === 'tiered' ? new TieredTextureBudget(budgetBytes) : null
  // Both budgets share acquire/release/stats/releaseAll shapes.
  const budget = tiered ?? textureBudget

  // Same shape host.ts builds — the texture budget path (lazy residency)
  // is the interesting one for a large board, so we wire `textures`.
  const resources: RendererResources = {
    loadTexture: loadSyntheticTexture,
    textures: {
      acquire: (hash, url) => budget.acquire(hash, url),
      release: (hash) => budget.release(hash),
    },
    resolveObject: (id) => sync.get(id),
    getZoom: () => camera.zoom,
  }

  const sync: SceneSync = new SceneSync(planes.content, registry, resources)
  const camera = new Camera()

  const culler = new Culler(sync, camera, {
    onEnterResidency: (id, item) => {
      const object = sync.get(id)
      if (object && item.itemKind === 'placement') {
        setPlacementTextureResident(object, item, resources, true)
      }
    },
    onLeaveResidency: (id, item) => {
      const object = sync.get(id)
      if (object && item.itemKind === 'placement') {
        setPlacementTextureResident(object, item, resources, false)
      }
    },
  })

  const viewport = () => ({ width: hostEl.clientWidth, height: hostEl.clientHeight })

  let built: BuiltScene

  // Cull on a rAF debounce, exactly like host.ts's scheduleCull —
  // toggling object.renderable synchronously on every camera.set (a
  // storm during the sweep) corrupts Pixi's render-group state mid-frame
  // (isInteractive/updateRenderable throws). One cull per frame is what
  // the real host does and is plenty for residency tracking.
  // AI-IMP-241: redraw a resident image body with a swapped tier texture
  // (radius 0 / no crop for the synthetic scene).
  const redraw = makeSyntheticRedraw((id) => sync.get(id))

  let cullQueued = false
  function scheduleCull(): void {
    if (cullQueued) return
    cullQueued = true
    requestAnimationFrame(() => {
      cullQueued = false
      // Tiered mode: decide per-texture caps BEFORE the Culler fires its
      // residency grants (so acquire reads the right tier), run the cull,
      // then swap/evict + fold the metrics.
      if (tiered) tiered.planTiers(built.items, camera, viewport(), dpr)
      culler.apply(built.items, viewport())
      if (tiered) {
        const resident: Array<{ id: string; hash: string }> = []
        for (const item of built.items) {
          if (item.itemKind !== 'placement' || !culler.isResident(item.id)) continue
          const p = item as { appearanceKind?: string; assetContentHash?: string | null }
          if (p.appearanceKind === 'image' && p.assetContentHash) {
            resident.push({ id: item.id, hash: p.assetContentHash })
          }
        }
        tiered.commit(resident, redraw, performance.now())
      }
    })
  }

  // Camera change → reapply the world transform now (cheap, no render
  // mutation), defer the cull to the next frame.
  camera.onChanged(() => {
    camera.applyTo(planes.world)
    scheduleCull()
  })

  function loadScene(count: number): void {
    built = buildScene(count)
    sync.apply(built.items)
    // Frame the whole board to start, like a fresh board open — this
    // camera write fires onChanged, which runs the first cull pass and
    // grants residency to the on-screen images.
    camera.fitBounds(built.bounds, viewport(), 80)
  }

  loadScene(clampCount(Number(els.count.value)))

  // ---- host-equivalent input (copied minimal handlers from host.ts) ----
  const local = (e: PointerEvent | WheelEvent) => {
    const b = app.canvas.getBoundingClientRect()
    return { x: e.clientX - b.left, y: e.clientY - b.top }
  }
  const WHEEL_ZOOM_SPEED = 0.0015 // Cmd+wheel; ~×1.2 per 120px notch
  const PINCH_ZOOM_SPEED = 0.01 // ctrl-flagged pinch deltas run 1–10px
  app.canvas.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      e.preventDefault()
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? app.canvas.clientHeight || 800 : 1
      const dx = e.deltaX * unit
      const dy = e.deltaY * unit
      if (e.ctrlKey || e.metaKey) {
        const speed = e.ctrlKey ? PINCH_ZOOM_SPEED : WHEEL_ZOOM_SPEED
        camera.zoomAt(local(e), Math.exp(-dy * speed))
      } else {
        camera.panByScreen(-dx, -dy)
      }
    },
    { passive: false },
  )
  let dragging = false
  let last = { x: 0, y: 0 }
  app.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    dragging = true
    last = { x: e.clientX, y: e.clientY }
    app.canvas.setPointerCapture(e.pointerId)
  })
  app.canvas.addEventListener('pointermove', (e: PointerEvent) => {
    if (!dragging) return
    camera.panByScreen(e.clientX - last.x, e.clientY - last.y)
    last = { x: e.clientX, y: e.clientY }
  })
  const endDrag = (e: PointerEvent) => {
    dragging = false
    try {
      app.canvas.releasePointerCapture(e.pointerId)
    } catch {
      /* pointer already released */
    }
  }
  app.canvas.addEventListener('pointerup', endDrag)
  app.canvas.addEventListener('pointercancel', endDrag)

  // ---- metrics loop ----
  const probe = new FrameProbe(600)
  const sweepAcc = new SweepAccumulator()
  let sweeping = false
  let tickCount = 0
  app.ticker.add(() => {
    tickCount++
    const dt = app.ticker.deltaMS
    probe.push(dt)
    if (sweeping) sweepAcc.push(dt)
  })
  ;(window as unknown as { __diag: () => unknown }).__diag = () => ({
    tickCount,
    started: app.ticker.started,
    maxFPS: app.ticker.maxFPS,
  })

  function glInfo(): { type: string; renderer: string } {
    const gl = (app.renderer as unknown as { gl?: WebGL2RenderingContext }).gl
    if (!gl) return { type: 'unknown', renderer: 'unknown' }
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = info
      ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER))
    return { type: 'webgl', renderer }
  }
  const gl = glInfo()
  els.gl.textContent = gl.renderer
  els.dpr.textContent = String(window.devicePixelRatio || 1)
  els.status.textContent = `Mode: ${mode}${tiered ? ` · budget ${budgetMB} MB` : ''}`

  setInterval(() => {
    const r = probe.rolling()
    els.fps.textContent = r.fps.toFixed(0)
    els.fps.className = r.fps >= 55 ? 'good' : r.fps >= 30 ? 'warn' : 'bad'
    els.p95.textContent = r.p95.toFixed(1)
    els.p50.textContent = r.p50.toFixed(1)
    const ts = budget.stats()
    const tierNote = tiered ? ` · peak ${fmtBytes(tiered.metrics().peakResidentBytes)}` : ''
    els.texmem.textContent = `${fmtBytes(ts.residentBytes)} live${tierNote}`
    const cs = culler.stats(built.items)
    els.resident.textContent = `${cs.resident} / ${cs.total} (rend ${cs.renderable})`
  }, 250)

  // ---- controls ----
  function clampCount(n: number): number {
    if (!Number.isFinite(n)) return 100
    return Math.max(1, Math.min(2000, Math.round(n)))
  }
  els.rebuild.addEventListener('click', () => {
    sync.clear()
    culler.reset()
    budget.releaseAll()
    tiered?.resetMetrics()
    loadScene(clampCount(Number(els.count.value)))
  })

  els.run.addEventListener('click', async () => {
    if (sweeping) return
    els.run.disabled = true
    els.copy.disabled = true
    els.json.style.display = 'none'
    sweepAcc.reset()
    tiered?.resetMetrics()
    sweeping = true
    const startStats = budget.stats()
    const result = await runSweep({
      camera,
      bounds: built.bounds,
      viewport,
      durationMs: 30000,
      onProgress: (frac) => {
        els.status.textContent = `Sweep running… ${(frac * 100).toFixed(0)}%`
      },
    })
    sweeping = false
    const perf = sweepAcc.summary()
    const endStats = budget.stats()
    // AI-IMP-241 tiering block. Off mode reports the baseline (everything
    // full-res, no swaps) so the two rows compare directly.
    const tierMetrics = tiered
      ? tiered.metrics()
      : {
          peakResidentBytes: Math.max(startStats.residentBytes, endStats.residentBytes),
          swapCount: 0,
          swapWorstMs: 0,
          tierHistogram: { full: 100, '1024': 0, '512': 0, '256': 0 },
          budgetBytes: 0,
        }
    const summary = {
      spike: 'AI-IMP-241 texture-budget-tiers',
      mode,
      device: {
        browser: detectBrowser(),
        userAgent: navigator.userAgent,
        dpr: window.devicePixelRatio || 1,
        viewport: viewport(),
        hardwareConcurrency: navigator.hardwareConcurrency ?? null,
        deviceMemoryGB: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null,
      },
      gl,
      scene: {
        images: clampCount(Number(els.count.value)),
        totalItems: built.items.length,
      },
      sweep: {
        durationMs: 30000,
        phases: result.phases,
        ...perf,
      },
      texture: {
        maxResidentBytes: Math.max(startStats.residentBytes, endStats.residentBytes),
        endResidentBytes: endStats.residentBytes,
        endIdleBytes: endStats.idleBytes,
        endTextureCount: endStats.textures,
      },
      tiering: {
        mode,
        budgetMB: tiered ? budgetMB : null,
        peakResidentBytes: tierMetrics.peakResidentBytes,
        swapCount: tierMetrics.swapCount,
        swapWorstMs: tierMetrics.swapWorstMs,
        tierHistogram: tierMetrics.tierHistogram,
      },
      generatedAt: new Date().toISOString(),
    }
    els.json.value = JSON.stringify(summary, null, 2)
    els.json.style.display = 'block'
    els.status.textContent =
      `Done — mean ${perf.meanFps} fps · p95 ${perf.p95Ms} ms · ${perf.longFrames} long frames`
    els.run.disabled = false
    els.copy.disabled = false
  })

  els.copy.addEventListener('click', async () => {
    els.json.select()
    try {
      await navigator.clipboard.writeText(els.json.value)
      els.status.textContent = 'Copied to clipboard.'
    } catch {
      document.execCommand('copy')
      els.status.textContent = 'Selected — press ⌘/Ctrl+C to copy.'
    }
  })
}

void main()

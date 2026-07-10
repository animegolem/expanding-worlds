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
import { invoke } from '@tauri-apps/api/core'
import { loadAssetTexture, prewarmScene, probeAssetProtocol, sceneFetchSummary } from './assets'
import { benchEcho } from './ipc-bench'
import { buildScene, type BuiltScene } from './scene'
import { FrameProbe, round, SweepAccumulator } from './metrics'
import { runSweep } from './sweep'

/**
 * AI-IMP-240 Tauri-shell harness. Same ENGINE path as the 217 WebKit
 * harness (planes → SceneSync → default registry → TextureBudget →
 * Culler → Camera, host-equivalent pan/zoom), but running inside a
 * Tauri v2 WKWebView shell with textures streamed through Tauri's asset
 * protocol and a Rust echo IPC command measured alongside. Auto-runs the
 * full suite (asset probe → IPC bench → 30 s sweep) and posts the result
 * JSON to Rust (`report_result`) so a headless dev run is capturable.
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
}

function detectBrowser(): string {
  const ua = navigator.userAgent
  if (/Edg\//.test(ua)) return 'Edge'
  if (/Chrome\/|Chromium\//.test(ua) && !/OPR\//.test(ua)) return 'Chromium'
  if (/Firefox\//.test(ua)) return 'Firefox'
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'Safari'
  // Tauri macOS WKWebView reports a Safari-family UA but often without a
  // Version/ token; label it explicitly.
  if (/AppleWebKit\//.test(ua)) return 'WKWebView (Tauri)'
  return 'unknown'
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${round(bytes / 1024, 1)} KB`
  return `${round(bytes / (1024 * 1024), 1)} MB`
}

function clampCount(n: number): number {
  if (!Number.isFinite(n)) return 100
  return Math.max(1, Math.min(2000, Math.round(n)))
}

async function main(): Promise<void> {
  // Config from Rust (env-driven): image count, autorun flag, result name.
  const cfg = await invoke<{ images: number; autorun: boolean; resultName: string }>(
    'sweep_config',
  ).catch(() => ({ images: 100, autorun: false, resultName: 'sweep' }))
  els.count.value = String(cfg.images)

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

  const planes = createScenePlanes()
  app.stage.addChild(planes.world, planes.overlay)
  const registry = createDefaultRegistry()
  // The engine loader is the asset-protocol loader — the whole risk-#1 path.
  const textureBudget = new TextureBudget(loadAssetTexture)

  const resources: RendererResources = {
    loadTexture: loadAssetTexture,
    textures: {
      acquire: (hash, url) => textureBudget.acquire(hash, url),
      release: (hash) => textureBudget.release(hash),
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

  // rAF-debounced cull, exactly like host.ts / the 217 harness. Load-bearing:
  // synchronous culls during the sweep storm corrupt Pixi 8 render groups.
  let cullQueued = false
  function scheduleCull(): void {
    if (cullQueued) return
    cullQueued = true
    requestAnimationFrame(() => {
      cullQueued = false
      culler.apply(built.items, viewport())
    })
  }

  camera.onChanged(() => {
    camera.applyTo(planes.world)
    scheduleCull()
  })

  function loadScene(count: number): void {
    built = buildScene(count)
    sync.apply(built.items)
    camera.fitBounds(built.bounds, viewport(), 80)
  }

  loadScene(clampCount(Number(els.count.value)))

  // ---- host-equivalent input (copied minimal handlers from host.ts) ----
  const local = (e: PointerEvent | WheelEvent) => {
    const b = app.canvas.getBoundingClientRect()
    return { x: e.clientX - b.left, y: e.clientY - b.top }
  }
  const WHEEL_ZOOM_SPEED = 0.0015
  const PINCH_ZOOM_SPEED = 0.01
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
  app.ticker.add(() => {
    const dt = app.ticker.deltaMS
    probe.push(dt)
    if (sweeping) sweepAcc.push(dt)
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

  setInterval(() => {
    const r = probe.rolling()
    els.fps.textContent = r.fps.toFixed(0)
    els.fps.className = r.fps >= 55 ? 'good' : r.fps >= 30 ? 'warn' : 'bad'
    els.p95.textContent = r.p95.toFixed(1)
    els.p50.textContent = r.p50.toFixed(1)
    const ts = textureBudget.stats()
    els.texmem.textContent = `${fmtBytes(ts.residentBytes)} live · ${fmtBytes(ts.idleBytes)} idle`
    if (built) {
      const cs = culler.stats(built.items)
      els.resident.textContent = `${cs.resident} / ${cs.total} (rend ${cs.renderable})`
    }
  }, 250)

  // ---- the full suite: asset probe + IPC bench + 30 s sweep ----
  async function runSuite(): Promise<Record<string, unknown>> {
    const images = clampCount(Number(els.count.value))

    els.status.textContent = 'Probing asset protocol…'
    const assetProtocol = await probeAssetProtocol(images, (f) => {
      els.status.textContent = `Probing asset protocol… ${(f * 100).toFixed(0)}%`
    })

    els.status.textContent = 'IPC echo bench…'
    const ipc = {
      echo1KB: await benchEcho(1024, 100),
      echo1MB: await benchEcho(1024 * 1024, 50),
    }

    els.status.textContent = 'Pre-writing scene textures…'
    await prewarmScene(images, (f) => {
      els.status.textContent = `Pre-writing scene textures… ${(f * 100).toFixed(0)}%`
    })

    sweepAcc.reset()
    sweeping = true
    const startStats = textureBudget.stats()
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
    const endStats = textureBudget.stats()

    const summary = {
      spike: 'AI-IMP-240 tauri-shell',
      shell: 'Tauri v2 (WKWebView) — dev mode',
      device: {
        browser: detectBrowser(),
        userAgent: navigator.userAgent,
        dpr: window.devicePixelRatio || 1,
        viewport: viewport(),
        hardwareConcurrency: navigator.hardwareConcurrency ?? null,
        deviceMemoryGB: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null,
      },
      gl,
      scene: { images, totalItems: built.items.length },
      sweep: { durationMs: 30000, phases: result.phases, ...perf },
      texture: {
        maxResidentBytes: Math.max(startStats.residentBytes, endStats.residentBytes),
        endResidentBytes: endStats.residentBytes,
        endIdleBytes: endStats.idleBytes,
        endTextureCount: endStats.textures,
      },
      assetProtocol,
      sceneFetchThroughProtocol: sceneFetchSummary(),
      ipc,
      generatedAt: new Date().toISOString(),
    }
    els.json.value = JSON.stringify(summary, null, 2)
    els.json.style.display = 'block'
    els.status.textContent =
      `Done — mean ${perf.meanFps} fps · p95 ${perf.p95Ms} ms · ${perf.longFrames} long frames`
    els.run.disabled = false
    els.copy.disabled = false
    return summary
  }

  els.rebuild.addEventListener('click', () => {
    sync.clear()
    culler.reset()
    textureBudget.releaseAll()
    loadScene(clampCount(Number(els.count.value)))
  })

  els.run.addEventListener('click', async () => {
    if (sweeping) return
    els.run.disabled = true
    els.copy.disabled = true
    els.json.style.display = 'none'
    await runSuite()
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

  // Headless auto-run: run the suite once and post the JSON to Rust so a
  // scripted `tauri dev` launch is capturable without a human clicking.
  if (cfg.autorun) {
    els.run.disabled = true
    els.copy.disabled = true
    // let the first frames settle / GL warm before measuring
    setTimeout(async () => {
      const summary = await runSuite()
      try {
        await invoke('report_result', {
          name: cfg.resultName,
          json: JSON.stringify(summary, null, 2),
        })
        els.status.textContent += ' · reported'
      } catch (e) {
        els.status.textContent += ` · report failed: ${String(e)}`
      }
    }, 800)
  }
}

void main()

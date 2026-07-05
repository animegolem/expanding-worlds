import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type Page } from '@playwright/test'
import type { EwApi } from '../src/preload/index'

declare global {
  interface Window {
    ew: EwApi
  }
}

/**
 * §12.1 engineering targets (AI-IMP-023). These are interaction-
 * collapse tripwires, not product guarantees: the renderer spike held
 * p95 ≤ 9.3 ms on this class of machine, so a p95 beyond P95_LIMIT_MS
 * during interaction means something structural regressed.
 *
 * Benchmark lesson (EPIC-001): numbers off software GL are noise —
 * the suite refuses to run on SwiftShader/llvmpipe rather than record
 * meaningless figures.
 */

const P95_LIMIT_MS = 25

test.describe.configure({ mode: 'serial' })
test.setTimeout(240_000)

async function launch() {
  const projectDir = mkdtempSync(join(tmpdir(), 'ew-e2e-perf-'))
  const app = await electron.launch({
    args: ['out/main/index.cjs'],
    env: { ...process.env, EW_PROJECT_DIR: projectDir },
  })
  const win = await app.firstWindow()
  await win.waitForFunction(() => window.__ewDebug !== undefined)
  const gl = await win.evaluate(() => window.__ewDebug!.glInfo())
  const software = /swiftshader|llvmpipe|software/i.test(gl.renderer)
  if (software) {
    throw new Error(
      `Refusing to benchmark on software GL ("${gl.renderer}"): §12.1 numbers would be noise. ` +
        'Run on a hardware-accelerated machine (EPIC-001 benchmark lesson).',
    )
  }
  return { app, win }
}

/** Seeds N nodes+placements in one page round trip per batch. */
async function seedPins(
  win: Page,
  count: number,
  opts: { canvasId?: string; appearance?: unknown; spreadX?: number; spreadY?: number } = {},
): Promise<void> {
  await win.evaluate(
    async ({ count, canvasId, appearance, spreadX, spreadY }) => {
      const project = await window.ew.project.query('getProject')
      if (!project.ok) throw new Error(project.message)
      const { id: projectId } = project.result as { id: string }
      const target = canvasId ?? window.__ewDebug!.canvasId()
      for (let i = 0; i < count; i += 1) {
        const result = await window.ew.project.execute({
          commandId: crypto.randomUUID(),
          projectId,
          commandType: 'CreatePin',
          commandVersion: 1,
          issuedAt: new Date().toISOString(),
          payload: {
            nodeId: crypto.randomUUID(),
            canvasId: target,
            placementId: crypto.randomUUID(),
            x: (i % 25) * spreadX,
            y: Math.floor(i / 25) * spreadY,
            appearance: appearance ?? { kind: 'dot', color: '#4a90d9' },
          },
        })
        if (result.status !== 'committed') throw new Error(`seed pin ${i}: ${result.status}`)
      }
    },
    {
      count,
      canvasId: opts.canvasId ?? null,
      appearance: opts.appearance ?? null,
      spreadX: opts.spreadX ?? 60,
      spreadY: opts.spreadY ?? 60,
    },
  )
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

async function interactAndMeasure(win: Page, box: Box) {
  await win.evaluate(() => window.__ewDebug!.resetFrameStats())
  // Pan (space-drag), zoom at cursor, marquee — the §12.3 workload.
  await win.keyboard.down('Space')
  await win.mouse.move(box.x + 400, box.y + 300)
  await win.mouse.down()
  await win.mouse.move(box.x + 100, box.y + 150, { steps: 25 })
  await win.mouse.move(box.x + 500, box.y + 400, { steps: 25 })
  await win.mouse.up()
  await win.keyboard.up('Space')
  // §6.9 mapping: plain wheel pans, ctrl-wheel zooms — do both.
  for (let i = 0; i < 3; i += 1) await win.mouse.wheel(0, -120)
  for (let i = 0; i < 3; i += 1) await win.mouse.wheel(0, 120)
  await win.keyboard.down('Control')
  for (let i = 0; i < 6; i += 1) await win.mouse.wheel(0, -120)
  for (let i = 0; i < 6; i += 1) await win.mouse.wheel(0, 120)
  await win.keyboard.up('Control')
  await win.mouse.move(box.x + 60, box.y + 60)
  await win.mouse.down()
  await win.mouse.move(box.x + 700, box.y + 500, { steps: 25 })
  await win.mouse.up()
  return win.evaluate(() => window.__ewDebug!.frameStats())
}

test('500 pins: interaction stays under the collapse threshold', async () => {
  const { app, win } = await launch()
  await seedPins(win, 500)
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 500)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  const stats = await interactAndMeasure(win, box)
  expect(stats.frames).toBeGreaterThan(30)
  expect(stats.p95, `p95 ${stats.p95.toFixed(1)}ms over 500 pins`).toBeLessThan(P95_LIMIT_MS)

  // Culling holds: zoomed in on a corner, most pins stop rendering.
  await win.mouse.move(box.x + 100, box.y + 100)
  await win.keyboard.down('Control')
  for (let i = 0; i < 10; i += 1) await win.mouse.wheel(0, -240)
  await win.keyboard.up('Control')
  await win.waitForFunction(() => {
    const s = window.__ewDebug!.cullStats()
    return s.total === 500 && s.renderable < 100
  })
  await app.close()
})

test('150 visible images + 1,000 stress icons + decorations; memory releases on swap', async () => {
  const { app, win } = await launch()
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // One 512×512 generated PNG, imported once, shared by 150 nodes —
  // dedupe keeps one blob; each placement still uploads/holds the
  // texture through the budget.
  const assetId = await win.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')!
    for (let i = 0; i < 64; i += 1) {
      ctx.fillStyle = `hsl(${(i * 47) % 360} 70% 50%)`
      ctx.fillRect((i % 8) * 64, Math.floor(i / 8) * 64, 64, 64)
    }
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const imported = await window.ew.project.importAsset({
      bytes,
      originalFilename: 'perf-512.png',
    })
    if (!('assetId' in imported) || !imported.assetId) throw new Error('import failed')
    return imported.assetId
  })
  await seedPins(win, 150, {
    appearance: { kind: 'image', assetId, crop: null },
    spreadX: 90,
    spreadY: 90,
  })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 150)
  // Zoom to fit so all 150 are simultaneously visible (§12.1).
  await win.getByTestId('zoom-fit').click()
  await win.waitForFunction(() => {
    const s = window.__ewDebug!.cullStats()
    return s.renderable === 150
  })
  const imageStats = await interactAndMeasure(win, box)
  expect(imageStats.p95, `p95 ${imageStats.p95.toFixed(1)}ms over 150 images`).toBeLessThan(
    P95_LIMIT_MS,
  )
  const resident = await win.evaluate(() => window.__ewDebug!.textureStats())
  expect(resident.residentBytes).toBeGreaterThan(0)

  // Stress canvas: 1,000 icons + 300 decorations on a second canvas.
  const stressCanvasId = await win.evaluate(async () => {
    const project = await window.ew.project.query('getProject')
    if (!project.ok) throw new Error(project.message)
    const { id: projectId } = project.result as { id: string }
    const run = async (commandType: string, payload: unknown) => {
      const result = await window.ew.project.execute({
        commandId: crypto.randomUUID(),
        projectId,
        commandType,
        commandVersion: 1,
        issuedAt: new Date().toISOString(),
        payload,
      })
      if (result.status !== 'committed') throw new Error(`${commandType}: ${result.status}`)
      return result
    }
    const nodeId = crypto.randomUUID()
    await run('CreateNode', { nodeId })
    const canvasId = crypto.randomUUID()
    await run('CreateCanvas', { canvasId, nodeId })
    for (let i = 0; i < 300; i += 1) {
      await run('CreateDecoration', {
        decorationId: crypto.randomUUID(),
        canvasId,
        kind: i % 3 === 0 ? 'shape' : i % 3 === 1 ? 'line' : 'text',
        data:
          i % 3 === 0
            ? { shape: 'rect', x: (i % 20) * 70, y: Math.floor(i / 20) * 70, width: 40, height: 40, stroke: '#dde3ea', strokeWidth: 2 }
            : i % 3 === 1
              ? { x1: (i % 20) * 70, y1: Math.floor(i / 20) * 70, x2: (i % 20) * 70 + 50, y2: Math.floor(i / 20) * 70 + 30, stroke: '#dde3ea', strokeWidth: 2 }
              : { x: (i % 20) * 70, y: Math.floor(i / 20) * 70, text: `t${i}`, fontSize: 14, color: '#dde3ea' },
      })
    }
    return canvasId
  })
  await seedPins(win, 1000, {
    canvasId: stressCanvasId,
    appearance: { kind: 'icon', icon: 'pin' },
    spreadX: 45,
    spreadY: 45,
  })

  // Swap to the stress canvas: §12.2 memory release — every image
  // texture from the previous canvas must leave the budget.
  await win.evaluate((id) => window.__ewDebug!.openCanvas(id), stressCanvasId)
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1000)
  await win.waitForFunction(() => {
    const s = window.__ewDebug!.textureStats()
    return s.residentBytes === 0 && s.idleBytes === 0
  })
  await win.getByTestId('zoom-fit').click()
  const stressStats = await interactAndMeasure(win, box)
  expect(
    stressStats.p95,
    `p95 ${stressStats.p95.toFixed(1)}ms over 1,000 icons + 300 decorations`,
  ).toBeLessThan(P95_LIMIT_MS)

  // Fast return navigation (§12.1): swap back, scene rebuilds.
  await win.evaluate(async () => {
    const project = await window.ew.project.query('getProject')
    if (!project.ok) throw new Error(project.message)
    const { rootNodeId } = project.result as { rootNodeId: string }
    const canvas = await window.ew.project.query('getCanvasByNode', { nodeId: rootNodeId })
    if (!canvas.ok) throw new Error(canvas.message)
    await window.__ewDebug!.openCanvas((canvas.result as { id: string }).id)
  })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 150)
  await app.close()
})

test('oversized background renders tiled with the original untouched', async () => {
  const { app, win } = await launch()
  // 17000×2000: beyond the 16384 texture cap of every current GPU, so
  // the tiled path activates live on any hardware (§12.2).
  const result = await win.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 17000
    canvas.height = 2000
    const ctx = canvas.getContext('2d')!
    const grad = ctx.createLinearGradient(0, 0, 17000, 2000)
    grad.addColorStop(0, '#123')
    grad.addColorStop(1, '#654')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 17000, 2000)
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('')
    const imported = await window.ew.project.importAsset({
      bytes,
      originalFilename: 'huge-map.png',
    })
    if (!('assetId' in imported) || !imported.assetId) throw new Error('import failed')
    const project = await window.ew.project.query('getProject')
    if (!project.ok) throw new Error(project.message)
    const { id: projectId } = project.result as { id: string }
    const set = await window.ew.project.execute({
      commandId: crypto.randomUUID(),
      projectId,
      commandType: 'SetCanvasBackground',
      commandVersion: 1,
      issuedAt: new Date().toISOString(),
      payload: {
        canvasId: window.__ewDebug!.canvasId(),
        assetId: imported.assetId,
        settings: { x: 0, y: 0, scale: 1, opacity: 1 },
      },
    })
    return { set: set.status, assetId: imported.assetId, digest, byteLength: bytes.byteLength }
  })
  expect(result.set).toBe('committed')

  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.backgroundTiled()), { timeout: 15_000 })
    .toBe(true)

  // The original asset stays canonical and byte-identical after tiled
  // rendering (§6.7): re-fetch the managed blob and compare digests.
  const roundTrip = await win.evaluate(async (expected) => {
    const response = await fetch(`ew-asset://${expected.digest}`)
    if (!response.ok) return { ok: false as const, status: response.status }
    const bytes = new Uint8Array(await response.arrayBuffer())
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('')
    return {
      ok: true as const,
      byteLength: bytes.byteLength,
      matches: digest === expected.digest,
    }
  }, { digest: result.digest })
  expect(roundTrip).toMatchObject({ ok: true, byteLength: result.byteLength, matches: true })

  await app.close()
})

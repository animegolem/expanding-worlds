import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, runQuery } from './helpers'

/**
 * AI-IMP-177 acceptance: renderer read-models that refresh only on a
 * real command commit (`project.onChanged`) used to go stale across
 * events that fire NO such commit.
 *
 * 1. Board-tooling's cached background refreshed only on onChanged, but
 *    openCanvas fires no project-changed event — so after navigating a
 *    board WITH a backdrop onto one WITHOUT, the board menu still gated
 *    its backdrop verbs on the previous board's asset, and Reset/Edit
 *    would durably write that asset onto the current board. The cache
 *    now re-fetches on scene-applied (every navigation), and a guard
 *    refuses any cache that predates the live canvas.
 *
 * 2. The frame sort chip re-read its flag only when the selected frame
 *    ID changed, so toggling the setting from the Dock while the frame
 *    stayed selected left the chip stale. It now re-reads on the
 *    settings broadcast.
 */

async function backgroundAssetId(win: Page, canvasId: string): Promise<string | null> {
  const scene = await runQuery<{ background: { assetId: string | null } | null }>(
    win,
    'getCanvasScene',
    { canvasId },
  )
  return scene.background?.assetId ?? null
}

/** Import a solid 8×8 PNG through the staged pipeline; returns the id. */
async function importPng(win: Page, color: string): Promise<string> {
  return win.evaluate(async (fill) => {
    const canvas = document.createElement('canvas')
    canvas.width = 8
    canvas.height = 8
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = fill
    ctx.fillRect(0, 0, 8, 8)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
    )
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const imported = await window.ew.project.importAsset({
      bytes,
      originalFilename: `bg-${fill.replace('#', '')}.png`,
    })
    if (!imported.ok) throw new Error(imported.message)
    return imported.assetId
  }, color)
}

test('backdrop verbs never carry a stale board’s asset across navigation (M-02)', async () => {
  const { app, win } = await launchApp('ew-e2e-stale-backdrop-')
  try {
    const box = (await win.getByTestId('canvas-host').boundingBox())!
    const boardA = await win.evaluate(() => window.__ewDebug!.canvasId())

    // Board B: a second, empty canvas reachable only via openCanvas.
    const nodeB = crypto.randomUUID()
    const boardB = crypto.randomUUID()
    await exec(win, 'CreateNode', { nodeId: nodeB })
    await exec(win, 'CreateCanvas', { canvasId: boardB, nodeId: nodeB })

    // Give board A a backdrop image; the commit's onChanged primes the
    // board-tooling cache with A's asset.
    const assetA = await importPng(win, '#cc3344')
    await exec(win, 'SetCanvasBackground', {
      canvasId: boardA,
      assetId: assetA,
      settings: { x: 0, y: 0, scale: 1, opacity: 1 },
    })
    await expect.poll(() => backgroundAssetId(win, boardA)).toBe(assetA)

    // On A the backdrop family is LIVE (proves the cache holds A's bg).
    await win.mouse.click(box.x + 950, box.y + 620, { button: 'right' })
    await expect(win.getByTestId('context-menu')).toBeVisible()
    expect(await win.getByTestId('context-menu').getAttribute('data-kind')).toBe('board')
    await expect(win.getByTestId('ctx-reset-backdrop')).not.toHaveAttribute('aria-disabled', 'true')
    await expect(win.getByTestId('ctx-edit-backdrop')).not.toHaveAttribute('aria-disabled', 'true')
    await expect(win.getByTestId('ctx-set-backdrop')).toHaveText('Replace backdrop…')
    await win.keyboard.press('Escape')
    await expect(win.getByTestId('context-menu')).toBeHidden()

    // Navigate A→B by ordinary means (openCanvas — fires no onChanged),
    // touching nothing.
    await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Board B'), { id: boardB })
    await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(boardB)

    // Right-click empty board B: the backdrop verbs are DISABLED (B has
    // no backdrop) and Set reads "Set backdrop image…", never the stale
    // "Replace…" — the cache followed the navigation.
    await win.mouse.click(box.x + 950, box.y + 620, { button: 'right' })
    await expect(win.getByTestId('context-menu')).toBeVisible()
    expect(await win.getByTestId('context-menu').getAttribute('data-kind')).toBe('board')
    await expect(win.getByTestId('ctx-set-backdrop')).toHaveText('Set backdrop image…')
    await expect(win.getByTestId('ctx-reset-backdrop')).toHaveAttribute('aria-disabled', 'true')
    await expect(win.getByTestId('ctx-edit-backdrop')).toHaveAttribute('aria-disabled', 'true')
    await expect(win.getByTestId('ctx-remove-backdrop')).toHaveAttribute('aria-disabled', 'true')

    // And no Reset could have written A's asset onto B: B stays empty.
    expect(await backgroundAssetId(win, boardB)).toBeNull()
    // A is untouched.
    expect(await backgroundAssetId(win, boardA)).toBe(assetA)
  } finally {
    await app.close()
  }
})

test('frame sort chip tracks the live setting toggled from the Dock (Codex P3)', async () => {
  const { app, win } = await launchApp('ew-e2e-stale-sortchip-')
  try {
    await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))

    // Draw a frame spanning world 100..400 (center 250,250).
    await win.getByTestId('tool-frame').click()
    const canvas = win.locator('[data-testid="canvas-host"] canvas')
    const rect = (await canvas.boundingBox())!
    const screen = (wx: number, wy: number) => ({ x: rect.x + wx, y: rect.y + wy })
    const a = screen(100, 100)
    const b = screen(400, 400)
    await win.mouse.move(a.x, a.y)
    await win.mouse.down()
    await win.mouse.move(b.x, b.y, { steps: 6 })
    await win.mouse.up()
    await win.getByTestId('tool-select').click()

    // Select the frame (frames select on their wash) → the charm bar and
    // its sort chip appear, showing the default ON state.
    const center = screen(250, 250)
    await win.mouse.click(center.x, center.y)
    await expect.poll(() => win.evaluate(() => window.__ewDebug!.selection().length)).toBe(1)
    await expect(win.getByTestId('charm-bar')).toBeVisible()
    const chip = win.getByTestId('charm-frame-sort-on-drop')
    await expect(chip).toHaveText('▦ grid')

    // Toggle sort-on-drop from the DOCK (a different surface) without
    // reselecting the frame; the setting broadcast reaches the chip and
    // it flips live — the exact staleness the fix closes.
    await expect(win.getByTestId('frame-sort-on-drop')).toBeVisible()
    await win.getByTestId('frame-sort-on-drop').click()
    await expect(chip).toHaveText('◇ float')

    // Toggle back: the chip tracks the setting in both directions.
    await win.getByTestId('frame-sort-on-drop').click()
    await expect(chip).toHaveText('▦ grid')
  } finally {
    await app.close()
  }
})

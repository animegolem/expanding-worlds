import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import type { EwApi } from '../src/preload/index'

declare global {
  interface Window {
    ew: EwApi
  }
}

/**
 * AI-IMP-044 acceptance: the CodeMirror note pane with §10.2 autosave
 * gestures — one UpdateNote per editing burst, note-switch and quit
 * flushes, editor-local undo staying out of the structural stack, and
 * the canvas entry points.
 */

async function launch(projectDir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({
    args: ['out/main/index.cjs'],
    env: { ...process.env, EW_PROJECT_DIR: projectDir },
  })
  const win = await app.firstWindow()
  await expect(win.getByTestId('canvas-host')).toBeVisible()
  await win.waitForFunction(() => window.__ewDebug !== undefined)
  return { app, win }
}

/** Create a note + dot node + placement; returns ids. */
async function seedPlacedNote(
  win: Page,
  title: string,
  body: string,
  at: { x: number; y: number },
): Promise<{ noteId: string; nodeId: string }> {
  return win.evaluate(
    async ({ title, body, at }) => {
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
      }
      const noteId = crypto.randomUUID()
      const nodeId = crypto.randomUUID()
      await run('CreateNote', { noteId, title, body })
      await run('CreatePin', {
        nodeId,
        canvasId: window.__ewDebug!.canvasId(),
        placementId: crypto.randomUUID(),
        x: at.x,
        y: at.y,
        appearance: { kind: 'dot', color: '#ff7700' },
        note: { kind: 'attach', noteId },
      })
      return { noteId, nodeId }
    },
    { title, body, at },
  )
}

async function projectRevision(win: Page): Promise<number> {
  const result = await win.evaluate(() => window.ew.project.query('getProject'))
  if (!result.ok) throw new Error(result.message)
  return (result.result as { revision: number }).revision
}

async function noteBody(win: Page, noteId: string): Promise<string> {
  const result = await win.evaluate((id) => window.ew.project.query('getNote', { noteId: id }), noteId)
  if (!result.ok) throw new Error(result.message)
  return (result.result as { body: string }).body
}

test('note pane opens on double-click and a typing burst commits one UpdateNote', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'ew-e2e-notes-'))
  const { app, win } = await launch(projectDir)
  const { noteId } = await seedPlacedNote(win, 'Kestrel', 'a small hawk', { x: 300, y: 240 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)

  // Entry point: select-tool double-click on the placement (default
  // camera maps world 1:1 to canvas-local pixels).
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.dblclick(box.x + 300, box.y + 240)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Kestrel/)
  await expect(win.getByTestId('note-editor')).toBeVisible()
  await expect(win.getByTestId('note-editor')).toContainText('a small hawk')

  // One burst of typing → exactly one UpdateNote (one revision step).
  const before = await projectRevision(win)
  await win.locator('.cm-content').click()
  await win.keyboard.press('End')
  await win.keyboard.type(' that hunts from a hover')
  await expect(win.getByTestId('note-pane-dirty')).toBeVisible()
  // The idle debounce (1.5 s) commits without any further gesture.
  await expect(win.getByTestId('note-pane-dirty')).toBeHidden({ timeout: 5_000 })

  expect(await projectRevision(win)).toBe(before + 1)
  expect(await noteBody(win, noteId)).toBe('a small hawk that hunts from a hover')

  // Editor-local undo (invariant 30): Mod-z reverts the buffer via
  // CodeMirror history without touching the structural stack.
  const revBeforeUndo = await projectRevision(win)
  await win.locator('.cm-content').click()
  await win.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
  await expect(win.getByTestId('note-editor')).not.toContainText('hover')
  expect(await projectRevision(win)).toBe(revBeforeUndo)

  await app.close()
})

test('node menu Open Note loads the pane', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'ew-e2e-notes-menu-'))
  const { app, win } = await launch(projectDir)
  await seedPlacedNote(win, 'Harbor', 'stone quay', { x: 260, y: 200 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)

  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.click(box.x + 260, box.y + 200, { button: 'right' })
  await win.getByTestId('node-menu-open-note').click()
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Harbor/)
  await expect(win.getByTestId('note-editor')).toContainText('stone quay')

  await app.close()
})

test('wiki-link states render live, sweep effects refresh, suggestions complete (AI-IMP-045)', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'ew-e2e-notes-links-'))
  const { app, win } = await launch(projectDir)

  // Seed: bound, bound-trashed, unresolved, and broken targets, all
  // referenced from one source note placed on the canvas.
  const { logId } = await win.evaluate(async () => {
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
    }
    const harborId = crypto.randomUUID()
    const reefId = crypto.randomUUID()
    const doomedId = crypto.randomUUID()
    const logId = crypto.randomUUID()
    await run('CreateNote', { noteId: harborId, title: 'Harbor' })
    await run('CreateNote', { noteId: reefId, title: 'Reef' })
    await run('CreateNote', { noteId: doomedId, title: 'Doomed' })
    await run('CreateNote', {
      noteId: logId,
      title: 'Log',
      body: 'see [[Harbor]] and [[Reef]] and [[Missing]] and [[Doomed]] and [[Kraken]]',
    })
    await run('TrashNote', { noteId: reefId })
    await run('TrashNote', { noteId: doomedId })
    await run('PurgeRecord', { kind: 'note', id: doomedId })
    await run('CreatePin', {
      nodeId: crypto.randomUUID(),
      canvasId: window.__ewDebug!.canvasId(),
      placementId: crypto.randomUUID(),
      x: 300,
      y: 240,
      appearance: { kind: 'dot', color: '#ff7700' },
      note: { kind: 'attach', noteId: logId },
    })
    return { logId }
  })
  expect(logId).toBeTruthy()
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)

  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.dblclick(box.x + 300, box.y + 240)
  await expect(win.getByTestId('note-editor')).toContainText('Harbor')

  // Four visually distinct states from one body (§7.1).
  const stateOf = (title: string) =>
    win.locator(`.cm-content [data-link-title="${title}"]`).first()
  await expect(stateOf('Harbor')).toHaveAttribute('data-link-state', 'bound')
  await expect(stateOf('Reef')).toHaveAttribute('data-link-state', 'bound-trashed')
  await expect(stateOf('Missing')).toHaveAttribute('data-link-state', 'unresolved')
  await expect(stateOf('Doomed')).toHaveAttribute('data-link-state', 'broken')

  // Sweep visibility: creating "Missing" elsewhere re-renders the
  // open editor; the purged "Doomed" key MUST stay broken even though
  // an active note with that title now exists (invariant 27).
  await win.evaluate(async () => {
    const project = await window.ew.project.query('getProject')
    if (!project.ok) throw new Error(project.message)
    const { id: projectId } = project.result as { id: string }
    for (const title of ['Missing', 'Doomed']) {
      const result = await window.ew.project.execute({
        commandId: crypto.randomUUID(),
        projectId,
        commandType: 'CreateNote',
        commandVersion: 1,
        issuedAt: new Date().toISOString(),
        payload: { noteId: crypto.randomUUID(), title },
      })
      if (result.status !== 'committed') throw new Error(`CreateNote ${title}: ${result.status}`)
    }
  })
  await expect(stateOf('Missing')).toHaveAttribute('data-link-state', 'bound')
  await expect(stateOf('Doomed')).toHaveAttribute('data-link-state', 'broken')

  // Suggestions: phantom entries carry the indicator + reference
  // count; picking one completes a well-formed token that renders
  // bound live, before any save.
  await win.locator('.cm-content').click()
  await win.keyboard.press('Control+End')
  await win.keyboard.press('Enter')
  await win.keyboard.type('[[Kra')
  const tooltip = win.locator('.cm-tooltip-autocomplete')
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toContainText('Kraken')
  await expect(tooltip).toContainText('phantom · 1 ref')

  await win.keyboard.type('') // settle
  await win.keyboard.press('Escape')
  await win.keyboard.type('ken]]') // finish the token by hand: unresolved phantom
  await expect(win.locator('.cm-content [data-link-title="Kraken"]')).toHaveCount(2)

  // Pick from the list for a real note and verify live bound state.
  await win.keyboard.press('Enter')
  await win.keyboard.type('[[Har')
  await expect(tooltip).toBeVisible()
  await tooltip.getByText('Harbor', { exact: true }).click()
  await expect(stateOf('Harbor')).toHaveAttribute('data-link-state', 'bound')
  await expect(win.locator('.cm-content [data-link-title="Harbor"]')).toHaveCount(2)
  const completed = await win.evaluate(() =>
    document.querySelector('.cm-content')?.textContent?.includes('[[Harbor]]'),
  )
  expect(completed).toBe(true)

  await app.close()
})

test('an edit inside its debounce window survives quit (§10.2 quit flush)', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'ew-e2e-notes-quit-'))
  const first = await launch(projectDir)
  const { noteId } = await seedPlacedNote(first.win, 'Reef', '', { x: 300, y: 240 })
  await first.win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)

  const box = (await first.win.getByTestId('canvas-host').boundingBox())!
  await first.win.mouse.dblclick(box.x + 300, box.y + 240)
  await expect(first.win.getByTestId('note-editor')).toBeVisible()
  await first.win.locator('.cm-content').click()
  await first.win.keyboard.type('coral heads at low tide')
  await expect(first.win.getByTestId('note-pane-dirty')).toBeVisible()

  // Close through the real window-close chain (flush interception),
  // not a force-kill: main asks the renderer to flush, then quits.
  const closed = first.app.waitForEvent('close')
  await first.app.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) win.close()
  })
  await closed

  const second = await launch(projectDir)
  expect(await noteBody(second.win, noteId)).toBe('coral heads at low tide')
  await second.app.close()
})

import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, launchAppInDir, revision, runQuery, seedPlacedNote } from './helpers'

/**
 * AI-IMP-044 acceptance: the note pane (TipTap since AI-IMP-146) with §10.2 autosave
 * gestures — one UpdateNote per editing burst, note-switch and quit
 * flushes, editor-local undo staying out of the structural stack, and
 * the canvas entry points. Envelope plumbing lives in ./helpers
 * (AI-IMP-057).
 */

async function noteBody(win: Page, noteId: string): Promise<string> {
  const note = await runQuery<{ body: string }>(win, 'getNote', { noteId })
  return note.body
}

test('note pane opens on double-click and a typing burst commits one UpdateNote', async () => {
  const { app, win } = await launchApp('ew-e2e-notes-')
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
  const before = await revision(win)
  await win.locator('[data-testid="note-editor-content"]').click()
  await win.keyboard.press('End')
  await win.keyboard.type(' that hunts from a hover')
  await expect(win.getByTestId('note-pane-dirty')).toBeVisible()
  // The idle debounce (1.5 s) commits without any further gesture.
  await expect(win.getByTestId('note-pane-dirty')).toBeHidden({ timeout: 10_000 })

  expect(await revision(win)).toBe(before + 1)
  expect(await noteBody(win, noteId)).toBe('a small hawk that hunts from a hover')

  // Editor-local undo (invariant 30): Mod-z reverts the buffer via
  // the editor's local history without touching the structural stack.
  const revBeforeUndo = await revision(win)
  await win.locator('[data-testid="note-editor-content"]').click()
  await win.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
  await expect(win.getByTestId('note-editor')).not.toContainText('hover')
  expect(await revision(win)).toBe(revBeforeUndo)

  await app.close()
})

test('node menu Open Note loads the pane', async () => {
  const { app, win } = await launchApp('ew-e2e-notes-menu-')
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
  const { app, win } = await launchApp('ew-e2e-notes-links-')

  // Seed: bound, bound-trashed, unresolved, and broken targets, all
  // referenced from one source note placed on the canvas.
  const reefId = crypto.randomUUID()
  const doomedId = crypto.randomUUID()
  const logId = crypto.randomUUID()
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  await exec(win, 'CreateNote', { noteId: crypto.randomUUID(), title: 'Harbor' })
  await exec(win, 'CreateNote', { noteId: reefId, title: 'Reef' })
  await exec(win, 'CreateNote', { noteId: doomedId, title: 'Doomed' })
  await exec(win, 'CreateNote', {
    noteId: logId,
    title: 'Log',
    body: 'see [[Harbor]] and [[Reef]] and [[Missing]] and [[Doomed]] and [[Kraken]]',
  })
  await exec(win, 'TrashNote', { noteId: reefId })
  await exec(win, 'TrashNote', { noteId: doomedId })
  await exec(win, 'PurgeRecord', { kind: 'note', id: doomedId })
  await exec(win, 'CreatePin', {
    nodeId: crypto.randomUUID(),
    canvasId,
    placementId: crypto.randomUUID(),
    x: 300,
    y: 240,
    appearance: { kind: 'dot', color: '#ff7700' },
    note: { kind: 'attach', noteId: logId },
  })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)

  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.dblclick(box.x + 300, box.y + 240)
  await expect(win.getByTestId('note-editor')).toContainText('Harbor')

  // Four visually distinct states from one body (§7.1).
  const stateOf = (title: string) =>
    win.locator(`[data-testid="note-editor-content"] [data-link-title="${title}"]`).first()
  await expect(stateOf('Harbor')).toHaveAttribute('data-link-state', 'bound')
  await expect(stateOf('Reef')).toHaveAttribute('data-link-state', 'bound-trashed')
  await expect(stateOf('Missing')).toHaveAttribute('data-link-state', 'unresolved')
  await expect(stateOf('Doomed')).toHaveAttribute('data-link-state', 'broken')

  // Sweep visibility: creating "Missing" elsewhere re-renders the
  // open editor; the purged "Doomed" key MUST stay broken even though
  // an active note with that title now exists (invariant 27).
  await exec(win, 'CreateNote', { noteId: crypto.randomUUID(), title: 'Missing' })
  await exec(win, 'CreateNote', { noteId: crypto.randomUUID(), title: 'Doomed' })
  await expect(stateOf('Missing')).toHaveAttribute('data-link-state', 'bound')
  await expect(stateOf('Doomed')).toHaveAttribute('data-link-state', 'broken')

  // Suggestions: phantom entries carry the indicator + reference
  // count; picking one completes a well-formed token that renders
  // bound live, before any save.
  await win.locator('[data-testid="note-editor-content"]').click()
  await win.keyboard.press('Control+End')
  await win.keyboard.press('Enter')
  await win.keyboard.type('[[Kra')
  const tooltip = win.locator('[data-testid="note-suggestions"]')
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toContainText('Kraken')
  await expect(tooltip).toContainText('phantom · 1 ref')

  await win.keyboard.type('') // settle
  await win.keyboard.press('Escape')
  await win.keyboard.type('ken]]') // finish the token by hand: unresolved phantom
  await expect(win.locator('[data-testid="note-editor-content"] [data-link-title="Kraken"]')).toHaveCount(2)

  // Pick from the list for a real note and verify live bound state.
  await win.keyboard.press('Enter')
  await win.keyboard.type('[[Har')
  await expect(tooltip).toBeVisible()
  await tooltip.getByText('Harbor', { exact: true }).click()
  await expect(stateOf('Harbor')).toHaveAttribute('data-link-state', 'bound')
  await expect(win.locator('[data-testid="note-editor-content"] [data-link-title="Harbor"]')).toHaveCount(2)
  const completed = await win.evaluate(() =>
    document.querySelector('[data-testid="note-editor-content"]')?.textContent?.includes('[[Harbor]]'),
  )
  expect(completed).toBe(true)

  await app.close()
})

test('phantom view aggregates references; Create and Place binds project-wide in one command (§17-14)', async () => {
  const { app, win } = await launchApp('ew-e2e-phantom-')
  const { noteId: aId } = await seedPlacedNote(win, 'A', 'hunts the [[Kestrel]] ridge', {
    x: 300,
    y: 240,
  })
  const bId = crypto.randomUUID()
  const cId = crypto.randomUUID()
  await exec(win, 'CreateNote', { noteId: bId, title: 'B', body: 'the [[Kestrel]] again' })
  await exec(win, 'CreateNote', { noteId: cId, title: 'C', body: 'always the [[Kestrel]]' })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)

  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.dblclick(box.x + 300, box.y + 240)
  await expect(win.getByTestId('note-editor')).toContainText('Kestrel')

  // Activate the unresolved token → one aggregated phantom view.
  const token = win.locator('[data-testid="note-editor-content"] [data-link-title="Kestrel"]')
  await token.click({ modifiers: ['ControlOrMeta'] })
  await expect(win.getByTestId('phantom-view')).toBeVisible()
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Kestrel/)
  await expect(win.getByTestId('phantom-view')).toContainText('3 references')
  await expect(win.getByTestId('phantom-sources')).toContainText('C')
  await expect(win.getByTestId('phantom-sources')).toContainText('A')
  await expect(win.getByTestId('phantom-sources')).toContainText('B')

  // Dismissing persists nothing (invariant 28).
  const revBefore = await revision(win)
  await win.getByTestId('phantom-dismiss').click()
  await expect(win.getByTestId('phantom-view')).toBeHidden()
  expect(await revision(win)).toBe(revBefore)

  // Create and Place: one command commits note + node + appearance +
  // placement, and the sweep binds BOTH sources project-wide.
  await expect(win.getByTestId('note-editor')).toContainText('Kestrel')
  await win.locator('[data-testid="note-editor-content"] [data-link-title="Kestrel"]').click({
    modifiers: ['ControlOrMeta'],
  })
  await expect(win.getByTestId('phantom-view')).toBeVisible()
  // Typed draft rides along with Create and Place (AI-IMP-058); the
  // click must not race a blur-materialize (that path is gone).
  await win.getByTestId('phantom-draft').fill('seen over the ridge at dusk')
  await win.getByTestId('phantom-create-and-place').click()
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Kestrel/)
  await expect(win.getByTestId('note-editor')).toBeVisible()
  await expect(win.getByTestId('note-editor')).toContainText('seen over the ridge at dusk')
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 2)
  expect(await revision(win)).toBe(revBefore + 1)

  for (const id of [aId, bId, cId]) {
    const links = await runQuery<Array<{ state: string }>>(win, 'getNoteLinks', { noteId: id })
    expect(links[0]!.state).toBe('bound')
  }

  await app.close()
})

test('typing into the phantom body materializes on the first committed burst (§7.2-1)', async () => {
  const { app, win } = await launchApp('ew-e2e-phantom-edit-')
  await seedPlacedNote(win, 'A', 'a [[Wisp]] in the marsh', { x: 300, y: 240 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)

  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.dblclick(box.x + 300, box.y + 240)
  await win.locator('[data-testid="note-editor-content"] [data-link-title="Wisp"]').click({
    modifiers: ['ControlOrMeta'],
  })
  await expect(win.getByTestId('phantom-view')).toBeVisible()

  await win.getByTestId('phantom-draft').fill('born of marsh light')
  // The first committed burst (idle debounce) creates the note with
  // the typed content and the pane swaps to the real editor.
  await expect(win.getByTestId('note-editor')).toBeVisible({ timeout: 10_000 })
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Wisp/)
  await expect(win.getByTestId('note-editor')).toContainText('born of marsh light')

  // The source token bound in the same command (sweep).
  await win.mouse.dblclick(box.x + 300, box.y + 240)
  await expect(win.locator('[data-testid="note-editor-content"] [data-link-title="Wisp"]')).toHaveAttribute(
    'data-link-state',
    'bound',
  )
  await app.close()
})

test('rename flushes dirty buffers, rewrites transactionally, folds into local undo (§17-15)', async () => {
  const { app, win } = await launchApp('ew-e2e-rename-')
  const { noteId: oldId } = await seedPlacedNote(win, 'Old', 'the original', { x: 500, y: 240 })
  const { noteId: aId } = await seedPlacedNote(win, 'A', 'x [[Old]] y [[NewName]] z', {
    x: 300,
    y: 240,
  })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 2)

  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.dblclick(box.x + 300, box.y + 240)
  await expect(win.locator('[data-testid="note-editor-content"] [data-link-title="Old"]')).toHaveAttribute(
    'data-link-state',
    'bound',
  )
  await expect(win.locator('[data-testid="note-editor-content"] [data-link-title="NewName"]')).toHaveAttribute(
    'data-link-state',
    'unresolved',
  )

  // Dirty buffer inside its debounce window at rename time.
  await win.locator('[data-testid="note-editor-content"]').click()
  await win.keyboard.press('Control+End')
  await win.keyboard.type(' tail')
  await expect(win.getByTestId('note-pane-dirty')).toBeVisible()

  // Rename from another surface (the node-menu path dispatches this
  // same event); the pane flushes BEFORE the rewrite (§10.2).
  await win.evaluate(
    ({ oldId }) =>
      window.dispatchEvent(
        new CustomEvent('ew-rename-note', { detail: { noteId: oldId, title: 'NewName' } }),
      ),
    { oldId },
  )

  // The rewrite + sweep land in the open editor as an external
  // change: rewritten token AND the pre-existing unresolved token
  // both read NewName and render bound; the typed text survived.
  await expect(win.locator('[data-testid="note-editor-content"] [data-link-title="NewName"]')).toHaveCount(2, {
    timeout: 10_000,
  })
  for (const token of await win
    .locator('[data-testid="note-editor-content"] [data-link-title="NewName"]')
    .all())
    await expect(token).toHaveAttribute('data-link-state', 'bound')
  await expect(win.getByTestId('note-editor')).toContainText('z tail')
  // The rewrite is transactional; §7.8: the rename is also a system
  // body touch, so this placed note now carries a metadata block at the
  // tail. The prose is the re-keyed body; the editor shows prose only.
  const aBody = await noteBody(win, aId)
  expect(aBody).toMatch(/^x \[\[NewName\]\] y \[\[NewName\]\] z tail(\n\n---\n|$)/)
  expect(aBody).toContain('## Placements')
  await expect(win.getByTestId('note-editor')).not.toContainText('Placements')

  // Folded into LOCAL undo: one undo steps back through the rewrite
  // (no wholesale document swap), redo reapplies it.
  await win.locator('[data-testid="note-editor-content"]').click()
  const undo = process.platform === 'darwin' ? 'Meta+z' : 'Control+z'
  // The editor's history keymap binds redo to Mod-Shift-z on mac but Ctrl-y
  // elsewhere — Ctrl+Shift+z is a silent no-op on Linux runners.
  const redo = process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+y'
  await win.keyboard.press(undo)
  await expect(win.locator('[data-testid="note-editor-content"] [data-link-title="Old"]')).toHaveCount(1)
  await win.keyboard.press(redo)
  await expect(win.locator('[data-testid="note-editor-content"] [data-link-title="NewName"]')).toHaveCount(2)

  await app.close()
})

test('title collisions retain the draft and offer per-flow actions (§7.7)', async () => {
  const { app, win } = await launchApp('ew-e2e-conflict-')
  const { noteId: alphaId } = await seedPlacedNote(win, 'Alpha', 'first', { x: 300, y: 240 })
  const goneId = crypto.randomUUID()
  await exec(win, 'CreateNote', { noteId: crypto.randomUUID(), title: 'Beta' })
  await exec(win, 'CreateNote', { noteId: goneId, title: 'Gone' })
  await exec(win, 'TrashNote', { noteId: goneId })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)

  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.dblclick(box.x + 300, box.y + 240)
  const title = win.getByTestId('note-title-input')
  await expect(title).toHaveValue('Alpha')

  // Active conflict: Open Conflicting Note + Choose Different Title,
  // never a silent redirect; the draft survives.
  await title.fill('Beta')
  await title.press('Enter')
  const dialog = win.getByTestId('title-conflict-dialog')
  await expect(dialog).toBeVisible()
  await expect(win.getByTestId('conflict-open-existing')).toBeVisible()
  await expect(win.getByTestId('conflict-restore-existing')).toBeHidden()
  await win.getByTestId('conflict-choose-different').click()
  await expect(dialog).toBeHidden()
  await expect(title).toHaveValue('Beta')
  expect(await runQuery(win, 'getNote', { noteId: alphaId })).toMatchObject({ title: 'Alpha' })

  // Trashed conflict additionally offers Restore Existing Note.
  await title.fill('Gone')
  await title.press('Enter')
  await expect(dialog).toBeVisible()
  await win.getByTestId('conflict-restore-existing').click()
  await expect(dialog).toBeHidden()
  await expect(title).toHaveValue('Gone')
  await expect
    .poll(async () =>
      (await runQuery<Array<{ title: string }>>(win, 'listNotes')).map((n) => n.title),
    )
    .toContain('Gone')

  // Linkability validation: structured error, draft retained.
  await title.fill('Bad[Title')
  await title.press('Enter')
  await expect(win.getByTestId('note-pane-error')).toBeVisible()
  await expect(title).toHaveValue('Bad[Title')

  await app.close()
})

test('bound activation loads the note and resolves space by location count (§17-13, §7.3)', async () => {
  const { app, win } = await launchApp('ew-e2e-activate-')
  const { noteId: alphaId, nodeId: alphaNode } = await seedPlacedNote(win, 'Alpha', 'target', {
    x: 500,
    y: 300,
  })
  const { noteId: sId } = await seedPlacedNote(win, 'S', 'go [[Alpha]] or [[NoWhere]]', {
    x: 250,
    y: 200,
  })
  await exec(win, 'CreateNote', { noteId: crypto.randomUUID(), title: 'NoWhere' })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 2)

  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.dblclick(box.x + 250, box.y + 200)
  await expect(win.getByTestId('note-editor')).toContainText('Alpha')

  // One location on the active canvas: note loads, camera flies,
  // the placement highlights (poll — the flight is eased).
  const alphaUses = await runQuery<{
    canvases: Array<{ nodes: Array<{ placements: Array<{ placementId: string }> }> }>
  }>(win, 'getNoteUses', { noteId: alphaId })
  const alphaPlacement = alphaUses.canvases[0]!.nodes[0]!.placements[0]!.placementId
  await win.locator('[data-testid="note-editor-content"] [data-link-title="Alpha"]').click({
    modifiers: ['ControlOrMeta'],
  })
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Alpha/)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.selection()))
    .toContain(alphaPlacement)
  await expect
    .poll(async () => {
      const camera = await win.evaluate(() => window.__ewDebug!.camera())
      return Math.abs(camera.x) > 1 || Math.abs(camera.y) > 1 || Math.abs(camera.zoom - 1) > 0.01
    })
    .toBe(true)

  // Zero locations: note loads, canvas untouched, non-blocking notice.
  await win.evaluate((id) => {
    window.dispatchEvent(new CustomEvent('ew-open-note', { detail: { noteId: id } }))
  }, sId)
  await expect(win.getByTestId('note-editor')).toContainText('NoWhere')
  await win.locator('[data-testid="note-editor-content"] [data-link-title="NoWhere"]').click({
    modifiers: ['ControlOrMeta'],
  })
  await expect(win.getByTestId('note-pane-title')).toHaveText(/NoWhere/)
  await expect(win.getByTestId('board-notice')).toContainText('no placed locations')
  await win.getByTestId('board-notice-dismiss').click()

  // Many locations: the link-anchored chooser (§7.3/§7.4 rev 0.17,
  // AI-IMP-065) — viewport untouched until a row is chosen.
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()),
    nodeId: alphaNode,
    x: 900,
    y: 700,
  })
  await win.evaluate((id) => {
    window.dispatchEvent(new CustomEvent('ew-open-note', { detail: { noteId: id } }))
  }, sId)
  await expect(win.getByTestId('note-editor')).toContainText('Alpha')
  // Let any in-flight camera animation land before sampling (eased
  // camera: never read synchronously — EPIC-010 lesson).
  await expect
    .poll(() =>
      win.evaluate(async () => {
        const a = window.__ewDebug!.camera()
        await new Promise((resolve) => setTimeout(resolve, 150))
        const b = window.__ewDebug!.camera()
        return a.x === b.x && a.y === b.y && a.zoom === b.zoom
      }),
    )
    .toBe(true)
  const cameraBefore = await win.evaluate(() => window.__ewDebug!.camera())
  await win.locator('[data-testid="note-editor-content"] [data-link-title="Alpha"]').click({
    modifiers: ['ControlOrMeta'],
  })
  await expect(win.getByTestId('location-chooser')).toBeVisible()
  await expect(win.locator('[data-testid="chooser-row"]')).toHaveCount(2)
  expect(await win.evaluate(() => window.__ewDebug!.camera())).toEqual(cameraBefore)

  // Escape keeps the viewport and dismisses; re-open and choose.
  // (Text-first activation already switched the editor to Alpha, so
  // reopen the SOURCE note to click its link again.)
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('location-chooser')).toHaveCount(0)
  expect(await win.evaluate(() => window.__ewDebug!.camera())).toEqual(cameraBefore)
  await win.evaluate((id) => {
    window.dispatchEvent(new CustomEvent('ew-open-note', { detail: { noteId: id } }))
  }, sId)
  await expect(win.getByTestId('note-editor')).toContainText('NoWhere')
  await win.locator('[data-testid="note-editor-content"] [data-link-title="Alpha"]').click({
    modifiers: ['ControlOrMeta'],
  })
  await win.locator('[data-testid="chooser-row"]').last().click()
  await expect(win.getByTestId('location-chooser')).toHaveCount(0)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.selection().length))
    .toBe(1)

  await app.close()
})

test('trashed and broken links offer explicit recovery (§17-22)', async () => {
  const { app, win } = await launchApp('ew-e2e-degraded-')
  // The source binds BEFORE the purges, so the purge converts its
  // bound records to broken; the recreated Wraith proves broken
  // records never re-bind by title (invariant 27).
  const reefId = crypto.randomUUID()
  const wraithId = crypto.randomUUID()
  const ghostId = crypto.randomUUID()
  const sId = crypto.randomUUID()
  await exec(win, 'CreateNote', { noteId: reefId, title: 'Reef' })
  await exec(win, 'CreateNote', { noteId: wraithId, title: 'Wraith' })
  await exec(win, 'CreateNote', { noteId: ghostId, title: 'Ghost' })
  await exec(win, 'CreateNote', {
    noteId: sId,
    title: 'S',
    body: 'dive [[Reef]] near [[Wraith]] and [[Ghost]]',
  })
  await exec(win, 'CreatePin', {
    nodeId: crypto.randomUUID(),
    canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()),
    placementId: crypto.randomUUID(),
    x: 300,
    y: 240,
    appearance: { kind: 'dot', color: '#ff7700' },
    note: { kind: 'attach', noteId: sId },
  })
  await exec(win, 'TrashNote', { noteId: reefId })
  await exec(win, 'TrashNote', { noteId: wraithId })
  await exec(win, 'PurgeRecord', { kind: 'note', id: wraithId })
  await exec(win, 'TrashNote', { noteId: ghostId })
  await exec(win, 'PurgeRecord', { kind: 'note', id: ghostId })
  await exec(win, 'CreateNote', { noteId: crypto.randomUUID(), title: 'Wraith' })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)

  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.dblclick(box.x + 300, box.y + 240)

  // Broken with an active title_key match → Relink flips the records.
  await expect(win.locator('[data-testid="note-editor-content"] [data-link-title="Wraith"]')).toHaveAttribute(
    'data-link-state',
    'broken',
  )
  await win.locator('[data-testid="note-editor-content"] [data-link-title="Wraith"]').click({
    modifiers: ['ControlOrMeta'],
  })
  await expect(win.getByTestId('broken-link-panel')).toBeVisible()
  await win.getByTestId('broken-relink').click()
  await expect(win.locator('[data-testid="note-editor-content"] [data-link-title="Wraith"]')).toHaveAttribute(
    'data-link-state',
    'bound',
    { timeout: 10_000 },
  )

  // Broken with no match → Create Note from the display text; the
  // created note opens.
  await win.locator('[data-testid="note-editor-content"] [data-link-title="Ghost"]').click({
    modifiers: ['ControlOrMeta'],
  })
  await expect(win.getByTestId('broken-link-panel')).toBeVisible()
  await win.getByTestId('broken-create').click()
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Ghost/)

  // Back in S, the Ghost token is bound now; Reef is bound-trashed →
  // In Trash, read-only, Restore re-enables editing.
  await win.evaluate((id) => {
    window.dispatchEvent(new CustomEvent('ew-open-note', { detail: { noteId: id } }))
  }, sId)
  await expect(win.locator('[data-testid="note-editor-content"] [data-link-title="Ghost"]')).toHaveAttribute(
    'data-link-state',
    'bound',
  )
  await expect(win.locator('[data-testid="note-editor-content"] [data-link-title="Reef"]')).toHaveAttribute(
    'data-link-state',
    'bound-trashed',
  )
  await win.locator('[data-testid="note-editor-content"] [data-link-title="Reef"]').click({
    modifiers: ['ControlOrMeta'],
  })
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Reef/)
  await expect(win.getByTestId('note-in-trash')).toBeVisible()
  await expect(win.locator('[data-testid="note-editor-content"]')).toHaveAttribute('contenteditable', 'false')
  await win.getByTestId('note-restore').click()
  await expect(win.getByTestId('note-in-trash')).toBeHidden()
  await expect(win.locator('[data-testid="note-editor-content"]')).toHaveAttribute('contenteditable', 'true')

  await app.close()
})

async function seedBarePin(win: Page, at: { x: number; y: number }): Promise<string> {
  const nodeId = crypto.randomUUID()
  await exec(win, 'CreatePin', {
    nodeId,
    canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()),
    placementId: crypto.randomUUID(),
    x: at.x,
    y: at.y,
    appearance: { kind: 'dot', color: '#ff7700' },
  })
  return nodeId
}

async function nodeNoteId(win: Page, nodeId: string): Promise<string | null> {
  const node = await runQuery<{ noteId: string | null }>(win, 'getNode', { nodeId })
  return node.noteId
}

test('attach, share, detach, and make independent (§17-6/7/17)', async () => {
  const { app, win } = await launchApp('ew-e2e-attach-')
  const n1 = await seedBarePin(win, { x: 300, y: 240 })
  const n2 = await seedBarePin(win, { x: 500, y: 300 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 2)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Attach a NEW note to the first bare node; the placement label
  // shows the title (§17-6).
  await win.mouse.click(box.x + 300, box.y + 240, { button: 'right' })
  await win.getByTestId('node-menu-attach-new').click()
  await win.getByTestId('node-menu-title-input').fill('Ash')
  await win.getByTestId('node-menu-title-confirm').click()
  await expect.poll(() => nodeNoteId(win, n1)).not.toBeNull()
  const ashId = (await nodeNoteId(win, n1))!
  await expect
    .poll(async () => {
      const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
      const scene = await runQuery<{ items: Array<{ noteTitle?: string | null }> }>(
        win,
        'getCanvasScene',
        { canvasId },
      )
      return scene.items.map((item) => item.noteTitle ?? null)
    })
    .toContain('Ash')
  await exec(win, 'UpdateNote', { noteId: ashId, body: 'ember lore' })

  // Share the note with the second node through the search picker
  // (§17-7): independent nodes, one note.
  await win.mouse.click(box.x + 500, box.y + 300, { button: 'right' })
  await win.getByTestId('node-menu-attach-existing').click()
  await win.getByTestId('attach-picker-query').fill('As')
  await win.getByTestId('attach-picker-results').getByText('Ash').click()
  await expect.poll(() => nodeNoteId(win, n2)).toBe(ashId)

  // Detach removes only the reference (§17-17 first half).
  await win.mouse.click(box.x + 500, box.y + 300, { button: 'right' })
  await win.getByTestId('node-menu-detach').click()
  await expect.poll(() => nodeNoteId(win, n2)).toBeNull()
  expect(await noteBody(win, ashId)).toBe('ember lore')

  // Re-attach, then Make Note Independent: copied body, new unique
  // title, other use untouched (§17-17 second half).
  await win.mouse.click(box.x + 500, box.y + 300, { button: 'right' })
  await win.getByTestId('node-menu-attach-existing').click()
  await win.getByTestId('attach-picker-query').fill('Ash')
  await win.getByTestId('attach-picker-results').getByText('Ash').click()
  await expect.poll(() => nodeNoteId(win, n2)).toBe(ashId)
  await win.mouse.click(box.x + 500, box.y + 300, { button: 'right' })
  await win.getByTestId('node-menu-make-independent').click()
  await win.getByTestId('node-menu-title-input').fill('Ash Copy')
  await win.getByTestId('node-menu-title-confirm').click()
  await expect.poll(() => nodeNoteId(win, n2)).not.toBe(ashId)
  const copyId = (await nodeNoteId(win, n2))!
  expect(await noteBody(win, copyId)).toBe('ember lore')
  expect(await nodeNoteId(win, n1)).toBe(ashId)

  await app.close()
})

test('Uses sidebar groups locations and places unplaced material (§7.4, §6.10)', async () => {
  const { app, win } = await launchApp('ew-e2e-uses-')
  const { noteId: ashId } = await seedPlacedNote(win, 'Ash', 'ember lore', { x: 300, y: 240 })
  // A second node shares the note but has no placement (Unplaced).
  const shareNodeId = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: shareNodeId })
  await exec(win, 'AttachNoteToNode', { nodeId: shareNodeId, noteId: ashId })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)

  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.dblclick(box.x + 300, box.y + 240)
  await expect(win.getByTestId('note-editor')).toContainText('ember lore')
  await win.getByTestId('uses-toggle').click()
  await expect(win.getByTestId('uses-sidebar')).toBeVisible()
  await expect(win.getByTestId('uses-sidebar')).toContainText('Root canvas')
  await expect(win.locator('[data-testid="uses-node"]')).toHaveCount(1)
  await expect(win.locator('[data-testid="uses-place-node"]')).toHaveCount(1)

  // Place the unplaced node at view center; the sidebar regroups.
  await win.getByTestId('uses-place-node').click()
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 2)
  await expect(win.locator('[data-testid="uses-node"]')).toHaveCount(2)
  await expect(win.locator('[data-testid="uses-place-node"]')).toHaveCount(0)

  // Selecting a group centers and selects its placements.
  await win.locator('[data-testid="uses-node"]').first().click()
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.selection().length))
    .toBeGreaterThan(0)

  // Zero-node note: Place on Current Canvas creates node + dot +
  // placement in one command and the labeled dot appears (§6.10).
  const loneId = crypto.randomUUID()
  await exec(win, 'CreateNote', { noteId: loneId, title: 'Lone' })
  await win.evaluate((id) => {
    window.dispatchEvent(new CustomEvent('ew-open-note', { detail: { noteId: id } }))
  }, loneId)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Lone/)
  await expect(win.getByTestId('uses-place-note')).toBeVisible()
  await win.getByTestId('uses-place-note').click()
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 3)
  await expect
    .poll(async () => {
      const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
      const scene = await runQuery<{ items: Array<{ noteTitle?: string | null }> }>(
        win,
        'getCanvasScene',
        { canvasId },
      )
      return scene.items.map((item) => item.noteTitle ?? null)
    })
    .toContain('Lone')
  expect(await runQuery(win, 'getNoteUses', { noteId: loneId })).toMatchObject({
    totalPlacements: 1,
  })

  await app.close()
})

test('an edit inside its debounce window survives quit (§10.2 quit flush)', async () => {
  const first = await launchApp('ew-e2e-notes-quit-')
  const { noteId } = await seedPlacedNote(first.win, 'Reef', '', { x: 300, y: 240 })
  await first.win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)

  const box = (await first.win.getByTestId('canvas-host').boundingBox())!
  await first.win.mouse.dblclick(box.x + 300, box.y + 240)
  await expect(first.win.getByTestId('note-editor')).toBeVisible()
  await first.win.locator('[data-testid="note-editor-content"]').click()
  await first.win.keyboard.type('coral heads at low tide')
  await expect(first.win.getByTestId('note-pane-dirty')).toBeVisible()

  // Close through the real window-close chain (flush interception),
  // not a force-kill: main asks the renderer to flush, then quits.
  const closed = first.app.waitForEvent('close')
  await first.app.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) win.close()
  })
  await closed

  const second = await launchAppInDir(first.projectDir)
  expect(await noteBody(second.win, noteId)).toBe('coral heads at low tide')
  await second.app.close()
})

test('double-clicking the label renames the note in place (AI-IMP-056)', async () => {
  const { app, win } = await launchApp('ew-e2e-label-rename-')
  const renameNoteId = crypto.randomUUID()
  const renameNodeId = crypto.randomUUID()
  await exec(win, 'CreateNote', { noteId: renameNoteId, title: 'Ash' })
  await exec(win, 'CreateNode', { nodeId: renameNodeId })
  await exec(win, 'SetNodeAppearance', {
    nodeId: renameNodeId,
    appearance: { kind: 'dot', color: '#ff7700' },
  })
  await exec(win, 'AttachNoteToNode', { nodeId: renameNodeId, noteId: renameNoteId })
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()),
    nodeId: renameNodeId,
    x: 300,
    y: 300,
    width: 200,
    height: 150,
  })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)

  // Label band: fontSize = 150 × 0.14 = 21; top = 300 + 75 + 21×0.35.
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.dblclick(box.x + 300, box.y + 393)
  const input = win.getByTestId('label-rename-input')
  await expect(input).toBeVisible()
  await expect(input).toHaveValue('Ash')
  await input.fill('Cinder')
  await input.press('Enter')

  // The rename propagates: scene label, pane title (via the seam).
  await expect
    .poll(async () => {
      const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
      const scene = await runQuery<{ items: Array<{ noteTitle?: string | null }> }>(
        win,
        'getCanvasScene',
        { canvasId },
      )
      return scene.items.find((item) => item.noteTitle)?.noteTitle ?? null
    })
    .toBe('Cinder')

  // Body double-click still opens the note (unchanged behavior).
  await win.mouse.dblclick(box.x + 300, box.y + 300)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Cinder/)

  await app.close()
})

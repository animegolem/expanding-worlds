import { expect, test, type Page } from '@playwright/test'
import { openAppMenu, exec, launchApp, launchAppInDir, runQuery } from './helpers'

interface PlacementRow {
  id: string
  caption: string | null
  noteId: string | null
}

interface NoteRow {
  id: string
  title: string
  body: string
  lifecycleState: 'active' | 'trashed'
}

async function pngAsset(win: Page): Promise<string> {
  return win.evaluate(async () => {
    const canvas = new OffscreenCanvas(12, 8)
    const context = canvas.getContext('2d')!
    context.fillStyle = 'rgb(35, 105, 210)'
    context.fillRect(0, 0, 12, 8)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    const result = await window.ew.project.importAsset({
      bytes: new Uint8Array(await blob.arrayBuffer()),
      originalFilename: 'caption-blue.png',
    })
    if (!result.ok) throw new Error(result.message)
    return result.assetId
  })
}

async function scenePlacements(win: Page): Promise<PlacementRow[]> {
  const scene = await runQuery<{ items: Array<Record<string, unknown>> }>(
    win,
    'getCanvasScene',
    { canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()) },
  )
  return scene.items
    .filter((item) => item['itemKind'] === 'placement')
    .map((item) => ({
      id: item['id'] as string,
      caption: item['caption'] as string | null,
      noteId: item['noteId'] as string | null,
    }))
}

async function captionOf(win: Page, placementId: string): Promise<string | null | undefined> {
  return (await scenePlacements(win)).find((placement) => placement.id === placementId)?.caption
}

async function labels(win: Page): Promise<string[]> {
  return win.evaluate(() =>
    [...window.__ewGestureDebug!.labelTexts()]
      .map((text) => text.replace(/\s+/g, ' '))
      .sort(),
  )
}

async function openCaptionFromMenu(
  win: Page,
  at: { x: number; y: number },
  expectedLabel: 'Add caption…' | 'Edit caption…',
): Promise<void> {
  const host = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.click(host.x + at.x, host.y + at.y, { button: 'right' })
  const row = win.getByTestId('ctx-caption')
  await expect(row).toHaveText(expectedLabel)
  await row.click()
  await expect(win.getByTestId('caption-editor')).toBeVisible()
}

async function pinEngagement(win: Page): Promise<void> {
  await win.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('ew-test-set-engagement', { detail: { engaged: true, hold: true } }),
    )
  })
}

async function seedCaptionedImage(
  win: Page,
  at: { x: number; y: number },
  caption: string,
  attached?: { noteId: string; title: string; body?: string },
): Promise<{ nodeId: string; placementId: string }> {
  const nodeId = crypto.randomUUID()
  const placementId = crypto.randomUUID()
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  const assetId = await pngAsset(win)
  await exec(win, 'CreateNode', { nodeId })
  if (attached) {
    await exec(win, 'CreateNote', {
      noteId: attached.noteId,
      title: attached.title,
      body: attached.body ?? '',
    })
    await exec(win, 'AttachNoteToNode', { nodeId, noteId: attached.noteId })
  }
  await exec(win, 'SetNodeAppearance', {
    nodeId,
    appearance: { kind: 'image', assetId, crop: null },
  })
  await exec(win, 'CreatePlacement', {
    placementId,
    canvasId,
    nodeId,
    x: at.x,
    y: at.y,
    width: 240,
    height: 160,
  })
  await exec(win, 'SetPlacementCaption', { placementId, caption })
  await expect.poll(() => captionOf(win, placementId)).toBe(caption)
  return { nodeId, placementId }
}

async function openPromoteFromMenu(
  win: Page,
  at: { x: number; y: number },
): Promise<void> {
  const host = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.click(host.x + at.x, host.y + at.y, { button: 'right' })
  await win.getByTestId('ctx-promote-caption').click()
}

async function nodeNoteId(win: Page, nodeId: string): Promise<string | null> {
  const node = await runQuery<{ noteId: string | null }>(win, 'getNode', { nodeId })
  return node.noteId
}

async function note(win: Page, noteId: string): Promise<NoteRow> {
  return runQuery<NoteRow>(win, 'getNote', { noteId })
}

test('caption is placement-local, replaces its title label, persists, stays out of outline, and is one undo', async () => {
  const launched = await launchApp('ew-e2e-caption-')
  let app = launched.app
  let win = launched.win
  const { projectDir } = launched
  const firstAt = { x: 320, y: 260 }
  const secondAt = { x: 700, y: 260 }
  const nodeId = crypto.randomUUID()
  const noteId = crypto.randomUUID()
  const firstPlacementId = crypto.randomUUID()
  const secondPlacementId = crypto.randomUUID()
  const title = 'Blue reference title'
  const thought = 'I like the blue'

  try {
    const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
    const assetId = await pngAsset(win)
    await exec(win, 'CreateNode', { nodeId })
    await exec(win, 'CreateNote', { noteId, title, body: '' })
    await exec(win, 'AttachNoteToNode', { nodeId, noteId })
    await exec(win, 'SetNodeAppearance', {
      nodeId,
      appearance: { kind: 'image', assetId, crop: null },
    })
    await exec(win, 'CreatePlacement', {
      placementId: firstPlacementId,
      canvasId,
      nodeId,
      x: firstAt.x,
      y: firstAt.y,
      width: 240,
      height: 160,
    })
    await exec(win, 'CreatePlacement', {
      placementId: secondPlacementId,
      canvasId,
      nodeId,
      x: secondAt.x,
      y: secondAt.y,
      width: 240,
      height: 160,
    })
    await expect.poll(() => scenePlacements(win)).toHaveLength(2)
    await expect.poll(() => labels(win)).toEqual([title, title])

    await openCaptionFromMenu(win, firstAt, 'Add caption…')
    await win.getByTestId('caption-editor').fill(thought)
    await win.getByTestId('caption-editor').press('Enter')
    await expect.poll(() => captionOf(win, firstPlacementId)).toBe(thought)
    expect(await captionOf(win, secondPlacementId)).toBeNull()
    // The caption occupies the first placement text slot; its title is
    // not stacked. The second placement of the same node keeps its title.
    await expect.poll(() => labels(win)).toEqual([thought, title].sort())

    const outline = await runQuery<unknown>(win, 'getOutlineTree')
    expect(JSON.stringify(outline)).not.toContain(thought)

    await expect.poll(() => win.evaluate(() => window.__ewUndo !== undefined)).toBe(true)
    await win.evaluate(() => window.__ewUndo!.undo())
    await expect.poll(() => captionOf(win, firstPlacementId)).toBeNull()
    await expect.poll(() => labels(win)).toEqual([title, title])

    // Put it back through the same user-facing verb, then prove the
    // placement property survives a full app restart.
    await openCaptionFromMenu(win, firstAt, 'Add caption…')
    await win.getByTestId('caption-editor').fill(thought)
    await win.getByTestId('caption-editor').press('Enter')
    await expect.poll(() => captionOf(win, firstPlacementId)).toBe(thought)
    await app.close()

    const relaunched = await launchAppInDir(projectDir)
    app = relaunched.app
    win = relaunched.win
    await expect.poll(() => captionOf(win, firstPlacementId)).toBe(thought)
    await expect.poll(() => labels(win)).toEqual([thought, title].sort())

    // Edit pre-fills; committing empty clears. This also proves the menu
    // reflects the live Add/Edit state.
    await openCaptionFromMenu(win, firstAt, 'Edit caption…')
    await expect(win.getByTestId('caption-editor')).toHaveValue(thought)
    await win.getByTestId('caption-editor').fill('')
    await win.getByTestId('caption-editor').press('Enter')
    await expect.poll(() => captionOf(win, firstPlacementId)).toBeNull()

    // The image-only charm is the second entry surface and opens the
    // same editor instance. (The engagement clock is pinned for hidden
    // windows so the faded charm layer stays pointer-active.)
    await pinEngagement(win)
    const host = (await win.getByTestId('canvas-host').boundingBox())!
    await win.mouse.click(host.x + firstAt.x, host.y + firstAt.y)
    await expect(win.getByTestId('charm-caption')).toBeVisible()
    await win.getByTestId('charm-caption').click()
    await expect(win.getByTestId('caption-editor')).toBeVisible()
    await win.getByTestId('caption-editor').fill('Charm thought')
    await win.getByTestId('caption-editor').press('Enter')
    await expect.poll(() => captionOf(win, firstPlacementId)).toBe('Charm thought')
    expect(await captionOf(win, secondPlacementId)).toBeNull()
  } finally {
    await app.close().catch(() => undefined)
  }
})

test('caption promotion undo → redo → undo preserves the same edited note', async () => {
  const { app, win } = await launchApp('ew-e2e-caption-promote-title-')
  const at = { x: 360, y: 280 }
  const caption = 'hazy overgrown vines'

  try {
    await expect.poll(() => win.evaluate(() => window.__ewUndo !== undefined)).toBe(true)
    const seeded = await seedCaptionedImage(win, at, caption)

    await openPromoteFromMenu(win, at)
    await expect(win.getByTestId('promote-caption-dialog')).toBeVisible()
    await win.getByTestId('promote-caption-title').click()

    await expect.poll(() => nodeNoteId(win, seeded.nodeId)).not.toBeNull()
    const noteId = (await nodeNoteId(win, seeded.nodeId))!
    expect(await note(win, noteId)).toMatchObject({
      title: caption,
      body: '',
      lifecycleState: 'active',
    })
    await expect.poll(() => captionOf(win, seeded.placementId)).toBeNull()
    await expect.poll(() => labels(win)).toContain(caption)
    expect(await win.evaluate(() => window.__ewUndo!.undoDepth())).toBe(1)

    await exec(win, 'UpdateNote', { noteId, body: 'edited after promotion' })

    await win.evaluate(() => window.__ewUndo!.undo())
    await expect.poll(() => nodeNoteId(win, seeded.nodeId)).toBeNull()
    await expect.poll(() => captionOf(win, seeded.placementId)).toBe(caption)
    await expect.poll(() => note(win, noteId)).toMatchObject({ lifecycleState: 'trashed' })
    expect(await win.evaluate(() => window.__ewUndo!.redoDepth())).toBe(1)

    await win.evaluate(() => window.__ewUndo!.redo())
    await expect.poll(() => nodeNoteId(win, seeded.nodeId)).toBe(noteId)
    await expect.poll(() => captionOf(win, seeded.placementId)).toBeNull()
    expect(await note(win, noteId)).toMatchObject({
      title: caption,
      body: 'edited after promotion',
      lifecycleState: 'active',
    })

    await win.evaluate(() => window.__ewUndo!.undo())
    await expect.poll(() => nodeNoteId(win, seeded.nodeId)).toBeNull()
    await expect.poll(() => captionOf(win, seeded.placementId)).toBe(caption)
    expect(await note(win, noteId)).toMatchObject({
      body: 'edited after promotion',
      lifecycleState: 'trashed',
    })
  } finally {
    await app.close().catch(() => undefined)
  }
})

test('body routing remembers the app-tier choice and skips the next routing choice', async () => {
  const { app, win } = await launchApp('ew-e2e-caption-promote-body-')
  const firstAt = { x: 320, y: 250 }
  const secondAt = { x: 700, y: 250 }

  try {
    const first = await seedCaptionedImage(win, firstAt, 'blue against the moss')
    await openPromoteFromMenu(win, firstAt)
    await win.getByTestId('promote-caption-body').click()
    await win.getByTestId('promote-caption-body-title').fill('Color study')
    await win.getByTestId('promote-caption-remember').check()
    await win.getByTestId('promote-caption-submit-body').click()

    await expect.poll(() => nodeNoteId(win, first.nodeId)).not.toBeNull()
    const firstNote = (await nodeNoteId(win, first.nodeId))!
    expect(await note(win, firstNote)).toMatchObject({
      title: 'Color study',
      body: 'blue against the moss',
    })
    await expect.poll(() => captionOf(win, first.placementId)).toBeNull()

    const stored = await win.evaluate(() => window.ew.settings.appAll())
    expect(stored['captionPromotionRouting']).toBe('body')

    const second = await seedCaptionedImage(win, secondAt, 'soft edge in the distance')
    await pinEngagement(win)
    const host = (await win.getByTestId('canvas-host').boundingBox())!
    await win.mouse.click(host.x + secondAt.x, host.y + secondAt.y)
    await expect(win.getByTestId('charm-promote-caption')).toBeVisible()
    await win.getByTestId('charm-promote-caption').click()
    await expect(win.getByTestId('promote-caption-body-title')).toBeVisible()
    await expect(win.getByTestId('promote-caption-title')).toHaveCount(0)
    await expect(win.getByTestId('promote-caption-body')).toHaveCount(0)
    await win.getByTestId('promote-caption-body-title').fill('Distance study')
    await win.getByTestId('promote-caption-submit-body').click()

    await expect.poll(() => nodeNoteId(win, second.nodeId)).not.toBeNull()
    const secondNote = (await nodeNoteId(win, second.nodeId))!
    expect(await note(win, secondNote)).toMatchObject({
      title: 'Distance study',
      body: 'soft edge in the distance',
    })

    await openAppMenu(win)
    await win.getByTestId('menu-settings').click()
    await expect(win.getByTestId('settings-row-caption-promotion-routing')).toBeVisible()
    await expect(win.getByTestId('settings-caption-promotion-routing-body')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await win.getByTestId('settings-caption-promotion-routing-ask').click()
    await expect(win.getByTestId('settings-caption-promotion-routing-ask')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  } finally {
    await app.close().catch(() => undefined)
  }
})

test('promotion prints its disabled reason and active conflicts retain the caption', async () => {
  const { app, win } = await launchApp('ew-e2e-caption-promote-conflict-')
  const notedAt = { x: 300, y: 250 }
  const conflictAt = { x: 700, y: 250 }

  try {
    const attachedNoteId = crypto.randomUUID()
    await seedCaptionedImage(win, notedAt, 'placement-local thought', {
      noteId: attachedNoteId,
      title: 'Already attached',
    })
    const host = (await win.getByTestId('canvas-host').boundingBox())!
    await win.mouse.click(host.x + notedAt.x, host.y + notedAt.y, { button: 'right' })
    const disabled = win.getByTestId('ctx-promote-caption')
    await expect(disabled).toHaveAttribute('aria-disabled', 'true')
    await expect(disabled).toHaveAttribute(
      'aria-label',
      'Promote to note: This item already has a note',
    )
    await expect(win.getByTestId('ctx-promote-caption-reason')).toHaveText(
      'This item already has a note',
    )
    await expect(win.getByTestId('ctx-promote-caption-reason')).toBeVisible()
    await win.keyboard.press('Escape')

    const existingNoteId = crypto.randomUUID()
    await exec(win, 'CreateNote', { noteId: existingNoteId, title: 'Taken title', body: '' })
    const conflicted = await seedCaptionedImage(win, conflictAt, 'Taken title')
    await openPromoteFromMenu(win, conflictAt)
    await win.getByTestId('promote-caption-title').click()

    await expect(win.getByTestId('title-conflict-dialog')).toBeVisible()
    await expect(win.getByTestId('conflict-use-existing')).toHaveCount(0)
    await expect(win.getByTestId('conflict-open-existing')).toBeVisible()
    await win.getByTestId('conflict-choose-different').click()
    await expect(win.getByTestId('caption-editor')).toBeVisible()
    await expect(win.getByTestId('caption-editor')).toHaveValue('Taken title')
    expect(await nodeNoteId(win, conflicted.nodeId)).toBeNull()
    expect(await captionOf(win, conflicted.placementId)).toBe('Taken title')
  } finally {
    await app.close().catch(() => undefined)
  }
})

test('body conflict restores the existing note, while an invalid title never clears', async () => {
  const { app, win } = await launchApp('ew-e2e-caption-promote-recovery-')
  const bodyAt = { x: 300, y: 250 }
  const invalidAt = { x: 700, y: 250 }

  try {
    const trashedNoteId = crypto.randomUUID()
    await exec(win, 'CreateNote', { noteId: trashedNoteId, title: 'Recovered title', body: '' })
    await exec(win, 'TrashNote', { noteId: trashedNoteId })
    const body = await seedCaptionedImage(win, bodyAt, 'caption remains on conflict')
    await openPromoteFromMenu(win, bodyAt)
    await win.getByTestId('promote-caption-body').click()
    await win.getByTestId('promote-caption-body-title').fill('Recovered title')
    await win.getByTestId('promote-caption-submit-body').click()
    await expect(win.getByTestId('title-conflict-dialog')).toBeVisible()
    await expect(win.getByTestId('conflict-use-existing')).toHaveCount(0)
    await expect(win.getByTestId('conflict-restore-existing')).toBeVisible()
    await win.getByTestId('conflict-choose-different').click()
    await expect(win.getByTestId('promote-caption-body-title')).toHaveValue('Recovered title')
    await win.getByTestId('promote-caption-submit-body').click()
    await expect(win.getByTestId('title-conflict-dialog')).toBeVisible()
    await win.getByTestId('conflict-restore-existing').click()
    await expect.poll(() => note(win, trashedNoteId)).toMatchObject({ lifecycleState: 'active' })
    expect(await nodeNoteId(win, body.nodeId)).toBeNull()
    expect(await captionOf(win, body.placementId)).toBe('caption remains on conflict')
    const panelClose = win.getByTestId('panel-close')
    if (await panelClose.isVisible().catch(() => false)) await panelClose.click()

    const invalidCaption = 'first line\nsecond line'
    const invalid = await seedCaptionedImage(win, invalidAt, invalidCaption)
    await openPromoteFromMenu(win, invalidAt)
    await win.getByTestId('promote-caption-title').click()
    await expect(win.getByTestId('promote-caption-error')).toContainText('title may not contain')
    expect(await nodeNoteId(win, invalid.nodeId)).toBeNull()
    expect(await captionOf(win, invalid.placementId)).toBe(invalidCaption)
  } finally {
    await app.close().catch(() => undefined)
  }
})

test('remembered title routing skips the chooser and Settings can reset it', async () => {
  const { app, win } = await launchApp('ew-e2e-caption-promote-remember-title-')
  const firstAt = { x: 300, y: 250 }
  const secondAt = { x: 700, y: 250 }
  try {
    const first = await seedCaptionedImage(win, firstAt, 'first remembered title')
    await openPromoteFromMenu(win, firstAt)
    await win.getByTestId('promote-caption-remember').check()
    await win.getByTestId('promote-caption-title').click()
    await expect.poll(() => nodeNoteId(win, first.nodeId)).not.toBeNull()

    const second = await seedCaptionedImage(win, secondAt, 'second remembered title')
    await openPromoteFromMenu(win, secondAt)
    await expect(win.getByTestId('promote-caption-dialog')).toHaveCount(0)
    await expect.poll(() => nodeNoteId(win, second.nodeId)).not.toBeNull()
    await expect.poll(() => captionOf(win, second.placementId)).toBeNull()

    await openAppMenu(win)
    await win.getByTestId('menu-settings').click()
    await win.getByTestId('settings-caption-promotion-routing-ask').click()
    await expect(win.getByTestId('settings-caption-promotion-routing-ask')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  } finally {
    await app.close()
  }
})

test('promotion is fail-stop at both command stages', async () => {
  const { app, win } = await launchApp('ew-e2e-caption-promote-fail-stop-')
  const createAt = { x: 300, y: 250 }
  const clearAt = { x: 700, y: 250 }
  try {
    await expect.poll(() => win.evaluate(() => window.__ewUndo !== undefined)).toBe(true)
    const createFailure = await seedCaptionedImage(win, createAt, 'create must refuse cleanly')
    const beforeCreate = await win.evaluate(() => window.__ewUndo!.undoDepth())
    await win.evaluate(() => window.__ewDebug!.failNextCommand('CreateNoteAndAttach'))
    await openPromoteFromMenu(win, createAt)
    await win.getByTestId('promote-caption-title').click()
    await expect(win.getByTestId('promote-caption-error')).toBeVisible()
    expect(await nodeNoteId(win, createFailure.nodeId)).toBeNull()
    expect(await captionOf(win, createFailure.placementId)).toBe('create must refuse cleanly')
    expect(await win.evaluate(() => window.__ewUndo!.undoDepth())).toBe(beforeCreate)
    await win.keyboard.press('Escape')

    const clearFailure = await seedCaptionedImage(win, clearAt, 'clear must refuse cleanly')
    const beforeClear = await win.evaluate(() => window.__ewUndo!.undoDepth())
    await win.evaluate(() => window.__ewDebug!.failNextCommand('SetPlacementCaption'))
    await openPromoteFromMenu(win, clearAt)
    await win.getByTestId('promote-caption-title').click()
    await expect(win.getByTestId('promote-caption-error')).toContainText(
      'note was created, but its caption could not be cleared',
    )
    await expect.poll(() => nodeNoteId(win, clearFailure.nodeId)).not.toBeNull()
    expect(await captionOf(win, clearFailure.placementId)).toBe('clear must refuse cleanly')
    expect(await win.evaluate(() => window.__ewUndo!.undoDepth())).toBe(beforeClear + 1)

    await win.evaluate(() => window.__ewUndo!.undo())
    await expect.poll(() => nodeNoteId(win, clearFailure.nodeId)).toBeNull()
    expect(await captionOf(win, clearFailure.placementId)).toBe('clear must refuse cleanly')
  } finally {
    await app.close()
  }
})

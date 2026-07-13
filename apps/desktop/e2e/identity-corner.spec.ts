import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, runQuery } from './helpers'

const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQAB' +
  'h6FO1AAAAABJRU5ErkJggg=='

interface Preview {
  appearanceKind: string | null
  assetContentHash: string | null
  noteTitle: string | null
  noteExcerpt: string | null
  places: Array<{ placementId: string; canvasId: string; canvasLabel: string }>
}

async function preview(win: Page, nodeId: string): Promise<Preview> {
  return runQuery<Preview>(win, 'getOutlinePreview', { kind: 'node', nodeId })
}

async function dispatchImage(win: Page, kind: 'drop' | 'paste', color: string): Promise<void> {
  await win.getByTestId('identity-profile-slot').evaluate(
    async (slot, input) => {
      const canvas = new OffscreenCanvas(4, 4)
      const context = canvas.getContext('2d')!
      context.fillStyle = input.color
      context.fillRect(0, 0, 4, 4)
      const blob = await canvas.convertToBlob({ type: 'image/png' })
      const file = new File([blob], `${input.kind}.png`, { type: 'image/png' })
      const transfer = new DataTransfer()
      transfer.items.add(file)
      if (input.kind === 'drop') {
        slot.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }))
        slot.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
      } else {
        slot.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }))
      }
    },
    { kind, color },
  )
}

test('◎ owns the world face, note, places flight, and owner-note deferral (AI-IMP-295)', async () => {
  const { app, win } = await launchApp('ew-e2e-identity-')
  try {
    const rootCanvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
    const ownerNodeId = crypto.randomUUID()
    const ownerNoteId = crypto.randomUUID()
    const worldCanvasId = crypto.randomUUID()
    const placementId = crypto.randomUUID()
    await exec(win, 'CreateNote', {
      noteId: ownerNoteId,
      title: 'Salt World',
      body: 'A quiet harbor carried in the world itself.',
    })
    await exec(win, 'CreateNode', { nodeId: ownerNodeId })
    await exec(win, 'AttachNoteToNode', { nodeId: ownerNodeId, noteId: ownerNoteId })
    await exec(win, 'CreateCanvas', { canvasId: worldCanvasId, nodeId: ownerNodeId })
    await exec(win, 'CreatePlacement', {
      placementId, canvasId: rootCanvasId, nodeId: ownerNodeId,
      x: 420, y: 300, width: 160, height: 100,
    })
    await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Salt World'), { id: worldCanvasId })
    await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(worldCanvasId)

    const camera = await win.evaluate(() => window.__ewDebug!.camera())
    await win.getByTestId('identity-corner-button').click()
    await expect(win.getByTestId('identity-corner-panel')).toBeVisible()
    await expect(win.getByTestId('identity-corner-panel')).toContainText('Salt World')
    await expect(win.getByTestId('identity-note')).toContainText('A quiet harbor')
    await expect(win.getByTestId('identity-place')).toHaveCount(1)

    const beforeKind = (await preview(win, ownerNodeId)).appearanceKind
    await win.getByTestId('identity-profile-input').setInputFiles({
      name: 'salt-face.png', mimeType: 'image/png',
      buffer: Buffer.from(PNG_1X1_BASE64, 'base64'),
    })
    await expect.poll(async () => (await preview(win, ownerNodeId)).appearanceKind).toBe('image')
    await win.evaluate(() => window.__ewUndo!.undo())
    await expect.poll(async () => (await preview(win, ownerNodeId)).appearanceKind).toBe(beforeKind)

    await dispatchImage(win, 'drop', 'rgb(20, 120, 180)')
    await expect.poll(async () => (await preview(win, ownerNodeId)).appearanceKind).toBe('image')
    const droppedHash = (await preview(win, ownerNodeId)).assetContentHash
    await dispatchImage(win, 'paste', 'rgb(180, 80, 40)')
    await expect.poll(async () => (await preview(win, ownerNodeId)).assetContentHash).not.toBe(droppedHash)

    const buttonHash = (await preview(win, ownerNodeId)).assetContentHash
    await win.getByTestId('identity-corner-button').evaluate((button) => {
      const transfer = new DataTransfer()
      transfer.items.add(new File(['not an image'], 'ignored.txt', { type: 'text/plain' }))
      button.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    })
    await expect.poll(async () => (await preview(win, ownerNodeId)).assetContentHash).toBe(buttonHash)

    await win.keyboard.press('Escape')
    await expect(win.getByTestId('identity-corner-panel')).toHaveCount(0)
    expect(await win.evaluate(() => window.__ewDebug!.camera())).toEqual(camera)

    await win.getByTestId('identity-corner-button').click()
    await win.getByTestId('identity-place').click()
    await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(rootCanvasId)
    await expect.poll(() => win.evaluate(() => window.__ewDebug!.selection())).toEqual([placementId])
    await win.keyboard.press('ControlOrMeta+BracketLeft')
    await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(worldCanvasId)

    await win.getByTestId('identity-corner-button').click()
    await win.getByTestId('identity-edit-note').click()
    await expect(win.getByTestId('note-pane-title')).toHaveText(/Salt World/)
    await expect(win.getByTestId('uses-identity-deferral')).toBeVisible()
    await expect(win.getByTestId('uses-toggle')).toHaveCount(0)
    await win.getByTestId('uses-identity-deferral').click()
    await expect(win.getByTestId('identity-corner-panel')).toBeVisible()
  } finally {
    await app.close()
  }
})

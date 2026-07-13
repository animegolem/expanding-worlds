// @vitest-environment jsdom
import type { ScenePlacement } from '@ew/canvas-engine'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasHostHandle } from './host'
import { attachCaptionEditor } from './caption-editor'
import { requestCaptionEditor } from './caption-request'

// Keep this DOM-unit test GPU-free: the editor needs only the placement
// body bounds, not Pixi's canvas initialization.
vi.mock('@ew/canvas-engine', () => ({
  itemWorldAABB: (item: ScenePlacement) => ({
    x: item.x,
    y: item.y,
    width: item.width ?? 1,
    height: item.height ?? 1,
  }),
}))

function placement(overrides: Partial<ScenePlacement> = {}): ScenePlacement {
  return {
    itemKind: 'placement',
    id: 'placement-1',
    nodeId: 'node-1',
    x: 10,
    y: 20,
    width: 160,
    height: 90,
    scale: 1,
    rotation: 0,
    flipX: 0,
    flipY: 0,
    renderOrder: 1,
    labelVisible: 1,
    caption: null,
    locked: 0,
    appearanceKind: 'image',
    appearanceColor: null,
    appearanceIcon: null,
    appearanceAssetId: 'asset-1',
    appearanceCrop: null,
    noteTitle: 'Title',
    noteId: 'note-1',
    childCanvasId: null,
    assetContentHash: 'hash',
    assetMimeType: 'image/png',
    assetWidth: 160,
    assetHeight: 90,
    ...overrides,
  }
}

function harness(initial: ScenePlacement = placement()) {
  let current = initial
  const execute = vi.fn(async () => ({ status: 'committed', revision: 2, inverse: null }))
  const captionPop = vi.fn()
  const whenSceneApplied = vi.fn(async () => {})
  const element = document.createElement('div')
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }),
  })
  document.body.appendChild(element)
  const host = {
    controller: {
      items: () => [current],
      camera: {
        worldToScreen: ({ x, y }: { x: number; y: number }) => ({ x, y }),
        onChanged: () => () => {},
      },
    },
    gateway: { execute },
    beats: { captionPop },
    whenSceneApplied,
    onSceneApplied: () => () => {},
  } as unknown as CanvasHostHandle
  const errors: string[] = []
  const handle = attachCaptionEditor(host, element, (message) => errors.push(message))
  return {
    element,
    execute,
    captionPop,
    whenSceneApplied,
    errors,
    handle,
    setPlacement(next: ScenePlacement) {
      current = next
    },
  }
}

beforeEach(() => {
  document.body.replaceChildren()
})

describe('placement caption editor (§4.5)', () => {
  it('commits one normalized command on Enter and does not impose a UTF-16 maxLength', async () => {
    const h = harness()
    requestCaptionEditor('placement-1')
    await Promise.resolve()
    const editor = h.element.querySelector<HTMLTextAreaElement>('[data-testid="caption-editor"]')!
    expect(editor.maxLength).toBe(-1)
    editor.value = '  I like the blue  '
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => expect(h.execute).toHaveBeenCalledTimes(1))
    expect(h.execute).toHaveBeenCalledWith('SetPlacementCaption', {
      placementId: 'placement-1',
      caption: 'I like the blue',
    })
    await vi.waitFor(() => expect(h.captionPop).toHaveBeenCalledWith(['placement-1']))
    expect(h.whenSceneApplied).toHaveBeenCalledWith({ revision: 2 })
    h.handle.destroy()
  })

  it('discards on Escape without a blur-triggered commit', async () => {
    const h = harness(placement({ caption: 'before' }))
    requestCaptionEditor('placement-1')
    await Promise.resolve()
    const editor = h.element.querySelector<HTMLTextAreaElement>('[data-testid="caption-editor"]')!
    editor.value = 'after'
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    editor.dispatchEvent(new FocusEvent('blur'))
    await Promise.resolve()
    expect(h.execute).not.toHaveBeenCalled()
    expect(editor.style.display).toBe('none')
    h.handle.destroy()
  })

  it('prefills an existing caption and commits empty text as removal on click-away', async () => {
    const h = harness(placement({ caption: 'before' }))
    requestCaptionEditor('placement-1')
    await Promise.resolve()
    const editor = h.element.querySelector<HTMLTextAreaElement>('[data-testid="caption-editor"]')!
    expect(editor.value).toBe('before')
    editor.value = '   '
    editor.dispatchEvent(new FocusEvent('blur'))
    await vi.waitFor(() => expect(h.execute).toHaveBeenCalledTimes(1))
    expect(h.execute).toHaveBeenCalledWith('SetPlacementCaption', {
      placementId: 'placement-1',
      caption: null,
    })
    expect(h.captionPop).not.toHaveBeenCalled()
    h.handle.destroy()
  })

  it('does not replay the birth beat when editing an existing caption', async () => {
    const h = harness(placement({ caption: 'before' }))
    requestCaptionEditor('placement-1')
    await Promise.resolve()
    const editor = h.element.querySelector<HTMLTextAreaElement>('[data-testid="caption-editor"]')!
    editor.value = 'after'
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => expect(h.execute).toHaveBeenCalledTimes(1))
    expect(h.captionPop).not.toHaveBeenCalled()
    expect(h.whenSceneApplied).not.toHaveBeenCalled()
    h.handle.destroy()
  })

  it('keeps refused text open and reports the command failure', async () => {
    const h = harness()
    h.execute.mockImplementationOnce(
      async () =>
        ({
          status: 'error',
          code: 'VALIDATION_FAILED',
          message: 'caption is too long',
        }) as never,
    )
    requestCaptionEditor('placement-1')
    await Promise.resolve()
    const editor = h.element.querySelector<HTMLTextAreaElement>('[data-testid="caption-editor"]')!
    editor.value = 'keep my draft'
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => expect(h.errors).toEqual(['Set caption failed: caption is too long']))
    expect(editor.value).toBe('keep my draft')
    expect(editor.style.display).not.toBe('none')
    h.handle.destroy()
  })

  it('does not let a stale commit completion close a newer caption editor', async () => {
    const h = harness()
    let settleFirst!: () => void
    h.execute.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settleFirst = () =>
            resolve({ status: 'committed', revision: 2, inverse: null })
        }),
    )
    requestCaptionEditor('placement-1')
    await Promise.resolve()
    const editor = h.element.querySelector<HTMLTextAreaElement>('[data-testid="caption-editor"]')!
    editor.value = 'first draft'
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => expect(h.execute).toHaveBeenCalledTimes(1))

    h.setPlacement(placement({ id: 'placement-2', caption: 'second draft' }))
    requestCaptionEditor('placement-2')
    await Promise.resolve()
    expect(editor.value).toBe('second draft')

    settleFirst()
    await Promise.resolve()
    expect(editor.style.display).not.toBe('none')
    expect(editor.value).toBe('second draft')
    h.handle.destroy()
  })
})

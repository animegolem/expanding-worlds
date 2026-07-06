import { uuidv7 } from '@ew/domain'
import { hitTest, type CanvasScene, type SceneItem } from '@ew/canvas-engine'
import type { CommandResult } from '@ew/commands'
import { requestAttachNote, requestOpenNote, requestRenameNote } from '../note/open-note'
import type { CanvasHostHandle } from './host'

/**
 * Node context menu (RFC-0001 §6.6, AI-IMP-020): right-clicking a
 * placement offers Attach Note (new or existing), Detach Note, and
 * Make Note Independent on the placement's node, using the existing
 * note/node commands. A minimal absolutely-positioned menu; Electron
 * has no window.prompt, so title entry is an inline input.
 */

export interface NodeMenuHandle {
  destroy(): void
}

interface Point {
  x: number
  y: number
}

async function runQuery<T>(name: string, args?: unknown): Promise<T> {
  const response = await window.ew.project.query(name, args)
  if (!response.ok) throw new Error(`${name} failed: ${response.code} ${response.message}`)
  return response.result as T
}

function describeFailure(what: string, result: CommandResult): string {
  if (result.status === 'error') return `${what} failed: ${result.message}`
  if (result.status === 'conflict') return `${what} failed: the project changed underneath (retry)`
  return `${what} failed: ${result.status}`
}

export function attachNodeMenu(
  host: CanvasHostHandle,
  element: HTMLElement,
  onError: (message: string) => void,
): NodeMenuHandle {
  let menu: HTMLDivElement | null = null

  function closeMenu(): void {
    menu?.remove()
    menu = null
    document.removeEventListener('pointerdown', onOutsidePointer, true)
    document.removeEventListener('keydown', onKeyDown, true)
  }

  const onOutsidePointer = (event: PointerEvent): void => {
    if (menu && !menu.contains(event.target as Node)) closeMenu()
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') closeMenu()
  }

  async function execute(commandType: string, payload: unknown): Promise<boolean> {
    const result = await host.gateway.execute(commandType, payload)
    if (result.status !== 'committed') {
      onError(describeFailure(commandType, result))
      return false
    }
    return true
  }

  function addEntry(label: string, testId: string, onPick: () => void): void {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.dataset['testid'] = testId
    button.style.cssText =
      'display:block;width:100%;text-align:left;padding:4px 12px;border:none;' +
      'background:transparent;color:var(--ew-text-dialog);font:inherit;cursor:pointer;'
    button.addEventListener('mouseenter', () => (button.style.background = 'var(--ew-surface-control-hover)'))
    button.addEventListener('mouseleave', () => (button.style.background = 'transparent'))
    button.addEventListener('click', onPick)
    menu?.appendChild(button)
  }

  /** Swap the menu content for an inline title input + confirm. */
  function promptTitle(placeholder: string, onConfirm: (title: string) => void): void {
    if (!menu) return
    menu.replaceChildren()
    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = placeholder
    input.dataset['testid'] = 'node-menu-title-input'
    input.style.cssText =
      'display:block;margin:8px;padding:4px 6px;width:200px;font:inherit;' +
      'background:var(--ew-surface-solid);color:var(--ew-text-dialog);border:1px solid var(--ew-border-control);border-radius:3px;'
    const confirm = document.createElement('button')
    confirm.type = 'button'
    confirm.textContent = 'OK'
    confirm.dataset['testid'] = 'node-menu-title-confirm'
    confirm.style.cssText =
      'display:block;margin:0 8px 8px;padding:3px 12px;font:inherit;cursor:pointer;'
    const submit = (): void => {
      const title = input.value.trim()
      if (title.length === 0) return
      closeMenu()
      onConfirm(title)
    }
    confirm.addEventListener('click', submit)
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit()
      event.stopPropagation()
    })
    menu.append(input, confirm)
    input.focus()
  }

  function openMenu(local: Point, nodeId: string, noteId: string | null): void {
    closeMenu()
    menu = document.createElement('div')
    menu.dataset['testid'] = 'node-menu'
    menu.style.cssText =
      `position:absolute;left:${local.x}px;top:${local.y}px;z-index:30;min-width:180px;` +
      'padding:4px 0;background:var(--ew-surface-modal);border:1px solid var(--ew-border-control);border-radius:4px;' +
      'box-shadow:0 4px 12px var(--ew-menu-shadow);font-size:0.85rem;'

    if (noteId === null) {
      addEntry('Attach New Note…', 'node-menu-attach-new', () => {
        promptTitle('New note title', (title) => {
          const newNoteId = uuidv7()
          void execute('CreateNote', { noteId: newNoteId, title }).then((ok) => {
            if (ok) void execute('AttachNoteToNode', { nodeId, noteId: newNoteId })
          })
        })
      })
      // Search-or-create picker (AI-IMP-049) replaces the old
      // exact-title prompt.
      addEntry('Attach Existing Note…', 'node-menu-attach-existing', () => {
        closeMenu()
        requestAttachNote(nodeId)
      })
    } else {
      addEntry('Open Note', 'node-menu-open-note', () => {
        closeMenu()
        requestOpenNote(noteId)
      })
      // Routed through the note pane so the §10.2 dirty-buffer flush
      // always precedes the rewrite (AI-IMP-047).
      addEntry('Rename Note…', 'node-menu-rename-note', () => {
        promptTitle('New title', (title) => requestRenameNote(noteId, title))
      })
      addEntry('Detach Note', 'node-menu-detach', () => {
        closeMenu()
        void execute('DetachNoteFromNode', { nodeId })
      })
      addEntry('Make Note Independent…', 'node-menu-make-independent', () => {
        promptTitle('New unique title', (newTitle) => {
          void execute('MakeNoteIndependent', {
            nodeId,
            newNoteId: uuidv7(),
            newTitle,
          })
        })
      })
    }

    element.appendChild(menu)
    document.addEventListener('pointerdown', onOutsidePointer, true)
    document.addEventListener('keydown', onKeyDown, true)
  }

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
    const bounds = element.getBoundingClientRect()
    const local = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    void (async () => {
      // Prefer the current single-placement selection; otherwise hit
      // test the fresh scene at the click point.
      let placement = host.controller
        .selectedItems()
        .find((item): item is Extract<SceneItem, { itemKind: 'placement' }> => {
          return item.itemKind === 'placement'
        })
      if (!placement) {
        const scene = await runQuery<CanvasScene | null>('getCanvasScene', {
          canvasId: host.canvasId,
        })
        if (!scene) return
        const world = host.controller.camera.screenToWorld(local)
        const hit = hitTest(world, scene.items)
        if (hit?.itemKind === 'placement') placement = hit
      }
      if (!placement) return
      const node = await runQuery<{ id: string; noteId: string | null } | null>('getNode', {
        nodeId: placement.nodeId,
      })
      if (!node) return
      openMenu(local, node.id, node.noteId)
    })()
  }

  element.addEventListener('contextmenu', onContextMenu)
  return {
    destroy() {
      closeMenu()
      element.removeEventListener('contextmenu', onContextMenu)
    },
  }
}

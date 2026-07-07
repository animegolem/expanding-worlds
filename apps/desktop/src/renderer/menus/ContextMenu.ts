/**
 * The ONE context-menu surface (RFC §8.4 rev 0.55, AI-IMP-136). A
 * right-click on the board resolves through the live hit-test — an item
 * hit opens the item menu, empty board opens the board menu — and the
 * ratified grammar is rendered from {@link menuFor}: grouped verb rows,
 * mono shortcut chips, destructive last behind a divider, no tooltips
 * on rows (§8.2). Visual kin of chrome/MenuPopover.svelte: same
 * surface/border tokens, 7px radius, row anatomy. Mounted into the
 * canvas-host element and clamp-and-flipped into the free region (§8.8,
 * the tooltip's clamp generalized here).
 *
 * This replaces the old canvas/node-menu.ts: the item menu's "note"
 * verb surfaces the shipped note-lifecycle rows (open / attach / detach
 * / rename / make-independent) reusing node-menu's testids, so their
 * e2e coverage rides along and no shipped feature regresses.
 *
 * Every enabled verb dispatches ONE existing undoable command through
 * its action (this ticket builds NO new domain commands); verbs whose
 * command does not exist yet render as disabled coming-soon rows.
 */
import { hitTest, type ReorderOp, type ScenePlacement } from '@ew/canvas-engine'
import { uuidv7 } from '@ew/domain'
import type { CommandResult } from '@ew/commands'
import type { CanvasHostHandle } from '../canvas/host'
import type { BoardTooling } from '../canvas/board-tooling'
import { navigateTo } from '../chrome/navigation'
import { requestCharmPopover } from '../canvas/charms-ui'
import {
  requestAttachNote,
  requestOpenNote,
  requestRenameNote,
} from '../note/open-note'
import { openCornerPanel } from '../note/panels'
import { formatBinding } from '../keys/registry'
import { themeTokenValue } from '../theme'
import {
  menuFor,
  type BoardSubject,
  type ItemSubject,
  type MenuActions,
  type MenuGroup,
  type MenuItem,
} from './inventory'

export interface ContextMenuHandle {
  destroy(): void
}

function describeFailure(what: string, result: CommandResult): string {
  if (result.status === 'error') return `${what} failed: ${result.message}`
  if (result.status === 'conflict') return `${what} failed: the project changed underneath (retry)`
  return `${what} failed: ${result.status}`
}

export function attachContextMenu(
  host: CanvasHostHandle,
  element: HTMLElement,
  onError: (message: string) => void,
  tooling: BoardTooling,
): ContextMenuHandle {
  let menu: HTMLDivElement | null = null
  /** Enabled, focusable rows in the currently open menu, in order. */
  let rows: HTMLButtonElement[] = []
  let focusIndex = -1

  // Hidden file input for "Set / Replace backdrop…" (§6.7). Kept in the
  // DOM (opacity 0) so e2e setInputFiles can reach it, mirroring the
  // title strip's bg-file-input.
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'image/*'
  fileInput.dataset['testid'] = 'ctx-backdrop-file-input'
  fileInput.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;'
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (file) void tooling.setBackgroundFromFile(file)
  })
  element.appendChild(fileInput)

  function close(): void {
    menu?.remove()
    menu = null
    rows = []
    focusIndex = -1
    document.removeEventListener('pointerdown', onOutsidePointer, true)
    document.removeEventListener('keydown', onMenuKeyDown, true)
  }

  const onOutsidePointer = (event: PointerEvent): void => {
    if (menu && !menu.contains(event.target as Node)) close()
  }

  const onMenuKeyDown = (event: KeyboardEvent): void => {
    if (!menu) return
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        close()
        break
      case 'ArrowDown':
        event.preventDefault()
        moveFocus(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        moveFocus(-1)
        break
      case 'Home':
        event.preventDefault()
        focusRow(0)
        break
      case 'End':
        event.preventDefault()
        focusRow(rows.length - 1)
        break
      case 'Enter':
      case ' ':
        if (focusIndex >= 0 && rows[focusIndex]) {
          event.preventDefault()
          rows[focusIndex]!.click()
        }
        break
    }
  }

  function moveFocus(delta: number): void {
    if (rows.length === 0) return
    const next = focusIndex < 0 ? (delta > 0 ? 0 : rows.length - 1) : focusIndex + delta
    focusRow((next + rows.length) % rows.length)
  }

  function focusRow(index: number): void {
    focusIndex = index
    rows[index]?.focus()
  }

  // ---------------------------------------------------- rendering

  function makeShell(kind: 'item' | 'board'): HTMLDivElement {
    const root = document.createElement('div')
    root.dataset['testid'] = 'context-menu'
    root.dataset['kind'] = kind
    root.setAttribute('role', 'menu')
    root.style.cssText =
      'position:absolute;z-index:520;display:flex;flex-direction:column;gap:0.2rem;' +
      'min-width:190px;padding:0.35rem;background:var(--ew-surface-menu);' +
      'border:1px solid var(--ew-border);border-radius:7px;white-space:nowrap;' +
      'box-shadow:0 6px 18px var(--ew-menu-shadow);pointer-events:auto;font-size:0.78rem;'
    return root
  }

  function divider(parent: HTMLElement): void {
    const line = document.createElement('div')
    line.setAttribute('role', 'separator')
    line.style.cssText = 'height:1px;margin:0.15rem 0.2rem;background:var(--ew-border);'
    parent.appendChild(line)
  }

  function renderRow(parent: HTMLElement, item: MenuItem): void {
    if (item.colorRow) {
      renderColorRow(parent, item)
      return
    }
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('role', 'menuitem')
    button.dataset['testid'] = item.testid ?? `ctx-${item.id}`
    const disabled = item.disabledReason !== undefined
    button.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;gap:1.2rem;' +
      'padding:0.25rem 0.6rem;text-align:left;background:transparent;border:none;' +
      'border-radius:4px;font:inherit;cursor:' +
      (disabled ? 'default' : 'pointer') +
      ';color:' +
      (item.danger ? 'var(--ew-danger-text)' : 'var(--ew-text)') +
      ';'
    // §8.2: NO tooltip chip on menu rows. A disabled coming-soon row is
    // greyed and names its reason only to assistive tech (aria-label).
    if (disabled) {
      button.style.opacity = '0.45'
      button.setAttribute('aria-disabled', 'true')
      button.setAttribute('aria-label', item.disabledReason!)
    }

    const label = document.createElement('span')
    label.textContent = item.label
    button.appendChild(label)

    if (item.submenu) {
      const marker = document.createElement('span')
      marker.textContent = '▸'
      marker.style.cssText = 'opacity:0.6;'
      button.appendChild(marker)
    } else if (item.shortcutId) {
      const chip = document.createElement('span')
      chip.textContent = formatBinding(item.shortcutId)
      chip.style.cssText = 'opacity:0.55;font-family:ui-monospace,monospace;font-size:0.72rem;'
      button.appendChild(chip)
    }

    if (!disabled) {
      button.addEventListener('mouseenter', () => {
        button.style.background = 'var(--ew-surface-raised)'
        focusIndex = rows.indexOf(button)
      })
      button.addEventListener('mouseleave', () => (button.style.background = 'transparent'))
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        if (item.submenu) return // submenu opening handled below
        // keepOpen rows (the inline title prompt) transform the panel in
        // place, so `run` owns teardown; everything else dismisses first.
        if (!item.keepOpen) close()
        item.run?.()
      })
      rows.push(button)
    }
    parent.appendChild(button)

    if (item.submenu && !disabled) {
      // Basic family flyout (no core inventory uses it yet; present so
      // 137's Align/Sort families render without new surface work).
      wireSubmenu(button, item)
    }
  }

  function wireSubmenu(anchor: HTMLButtonElement, item: MenuItem): void {
    let open: HTMLDivElement | null = null
    const closeSub = (): void => {
      open?.remove()
      open = null
    }
    anchor.addEventListener('click', (event) => {
      event.stopPropagation()
      if (open) {
        closeSub()
        return
      }
      const panel = document.createElement('div')
      panel.dataset['testid'] = `ctx-submenu-${item.id}`
      panel.setAttribute('role', 'menu')
      panel.style.cssText =
        'position:absolute;z-index:521;display:flex;flex-direction:column;gap:0.2rem;' +
        'min-width:170px;padding:0.35rem;background:var(--ew-surface-menu);' +
        'border:1px solid var(--ew-border);border-radius:7px;box-shadow:0 6px 18px var(--ew-menu-shadow);'
      for (const child of item.submenu!) renderRow(panel, child)
      const rect = anchor.getBoundingClientRect()
      const hostRect = element.getBoundingClientRect()
      panel.style.left = `${rect.right - hostRect.left}px`
      panel.style.top = `${rect.top - hostRect.top}px`
      element.appendChild(panel)
      open = panel
    })
  }

  function renderColorRow(parent: HTMLElement, item: MenuItem): void {
    const wrap = document.createElement('div')
    wrap.dataset['testid'] = item.testid ?? `ctx-${item.id}`
    wrap.style.cssText =
      'display:flex;align-items:center;gap:0.3rem;flex-wrap:wrap;padding:0.2rem 0.5rem;'
    const spec = item.colorRow!
    for (const token of spec.swatchTokens) {
      const name = token.replace('--ew-canvas-flat-', '')
      const swatch = document.createElement('button')
      swatch.type = 'button'
      swatch.dataset['testid'] = `ctx-backdrop-color-${name}`
      swatch.setAttribute('aria-label', `Backdrop color ${name}`)
      swatch.style.cssText =
        'width:18px;height:18px;padding:0;border-radius:4px;cursor:pointer;' +
        `border:1px solid var(--ew-border-strong);background:var(${token});`
      swatch.addEventListener('click', (event) => {
        event.stopPropagation()
        close()
        spec.onPick(themeTokenValue(token))
      })
      wrap.appendChild(swatch)
    }
    // OS picker for arbitrary colors (§6.7).
    const picker = document.createElement('input')
    picker.type = 'color'
    picker.dataset['testid'] = 'ctx-backdrop-color-picker'
    picker.style.cssText =
      'width:22px;height:20px;padding:0;border:1px solid var(--ew-border-strong);background:transparent;cursor:pointer;'
    picker.addEventListener('change', () => {
      close()
      spec.onPick(picker.value)
    })
    picker.addEventListener('click', (event) => event.stopPropagation())
    wrap.appendChild(picker)
    // Clear back to the theme default.
    const clear = document.createElement('button')
    clear.type = 'button'
    clear.dataset['testid'] = 'ctx-backdrop-color-clear'
    clear.textContent = 'clear'
    clear.style.cssText =
      'padding:0.1rem 0.4rem;font:inherit;font-size:0.7rem;cursor:pointer;color:var(--ew-text);' +
      'background:var(--ew-surface-raised);border:1px solid var(--ew-border-strong);border-radius:4px;'
    clear.addEventListener('click', (event) => {
      event.stopPropagation()
      close()
      spec.onPick(null)
    })
    wrap.appendChild(clear)
    parent.appendChild(wrap)
  }

  /** node-menu's inline title prompt, ported (§6.6 flows). Swaps the
   * whole menu for an input + OK; the same testids keep the note e2e
   * green. */
  function promptTitle(placeholder: string, onConfirm: (title: string) => void): void {
    if (!menu) return
    menu.replaceChildren()
    rows = []
    focusIndex = -1
    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = placeholder
    input.dataset['testid'] = 'node-menu-title-input'
    input.style.cssText =
      'display:block;margin:0.3rem;padding:0.25rem 0.4rem;width:200px;font:inherit;' +
      'background:var(--ew-surface-input);color:var(--ew-text);' +
      'border:1px solid var(--ew-border-strong);border-radius:4px;'
    const confirm = document.createElement('button')
    confirm.type = 'button'
    confirm.textContent = 'OK'
    confirm.dataset['testid'] = 'node-menu-title-confirm'
    confirm.style.cssText =
      'display:block;margin:0 0.3rem 0.3rem;padding:0.2rem 0.7rem;font:inherit;cursor:pointer;' +
      'background:var(--ew-surface-raised);color:var(--ew-text);border:1px solid var(--ew-border-strong);border-radius:4px;'
    const submit = (): void => {
      const title = input.value.trim()
      if (title.length === 0) return
      close()
      onConfirm(title)
    }
    confirm.addEventListener('click', submit)
    input.addEventListener('keydown', (event) => {
      event.stopPropagation()
      if (event.key === 'Enter') submit()
      else if (event.key === 'Escape') close()
    })
    menu.append(input, confirm)
    input.focus()
  }

  function render(kind: 'item' | 'board', groups: MenuGroup[], at: { x: number; y: number }): void {
    close()
    menu = makeShell(kind)
    rows = []
    focusIndex = -1
    groups.forEach((group, index) => {
      if (index > 0) divider(menu!)
      for (const item of group.items) renderRow(menu!, item)
    })
    element.appendChild(menu)
    clampInto(menu, at)
    document.addEventListener('pointerdown', onOutsidePointer, true)
    document.addEventListener('keydown', onMenuKeyDown, true)
  }

  /** §8.8: clamp-and-flip into the host's free region (the tooltip's
   * logic generalized) so the menu never spills past an edge. */
  function clampInto(node: HTMLDivElement, at: { x: number; y: number }): void {
    const host = element.getBoundingClientRect()
    const size = node.getBoundingClientRect()
    let x = at.x
    let y = at.y
    if (x + size.width > host.width - 4) x = Math.max(4, at.x - size.width)
    if (y + size.height > host.height - 4) y = Math.max(4, host.height - size.height - 4)
    node.style.left = `${x}px`
    node.style.top = `${y}px`
  }

  // ---------------------------------------------------- actions

  async function execute(commandType: string, payload: unknown): Promise<boolean> {
    const result = await host.gateway.execute(commandType, payload)
    if (result.status !== 'committed') {
      onError(describeFailure(commandType, result))
      return false
    }
    return true
  }

  function itemActions(p: ScenePlacement): MenuActions {
    const stub = (): void => {}
    return {
      flip: (axis) => void execute('FlipPlacement', { placementId: p.id, axis }),
      openAppearance: () => requestCharmPopover(p.id, 'appearance'),
      openTags: () => requestCharmPopover(p.id, 'tags'),
      openNote: () => {
        if (p.noteId) requestOpenNote(p.noteId)
      },
      attachNewNote: () =>
        promptTitle('New note title', (title) =>
          void execute('CreateNoteAndAttach', { nodeId: p.nodeId, noteId: uuidv7(), title }),
        ),
      attachExistingNote: () => requestAttachNote(p.nodeId),
      renameNote: () => {
        if (p.noteId) {
          const noteId = p.noteId
          promptTitle('New title', (title) => requestRenameNote(noteId, title))
        }
      },
      detachNote: () => void execute('DetachNoteFromNode', { nodeId: p.nodeId }),
      makeNoteIndependent: () =>
        promptTitle('New unique title', (newTitle) =>
          void execute('MakeNoteIndependent', {
            nodeId: p.nodeId,
            newNoteId: uuidv7(),
            newTitle,
          }),
        ),
      toggleHideLabel: () =>
        void execute('SetPlacementLabelVisibility', {
          placementId: p.id,
          visible: p.labelVisible !== 1,
        }),
      toggleLock: () =>
        void execute('SetPlacementLock', { placementId: p.id, locked: p.locked !== 1 }),
      setAsBackdrop: () => void tooling.setBackgroundFromSelection(),
      openAsBoard: () => void openAsBoard(p),
      reorder: (op: ReorderOp) => void tooling.reorder(op),
      deleteItem: () => void deleteItem(p),
      // board-only members unused for an item subject.
      selectAll: stub,
      zoomToFit: stub,
      setBackdropFromFile: stub,
      editBackdropPosition: stub,
      resetBackdrop: stub,
      removeBackdrop: stub,
      setBackdropColor: stub,
      openBoardNote: stub,
    }
  }

  async function openAsBoard(p: ScenePlacement): Promise<void> {
    if (p.childCanvasId) {
      await navigateTo(p.childCanvasId, p.noteTitle ?? 'Board')
      return
    }
    const canvasId = uuidv7()
    if (await execute('CreateCanvas', { canvasId, nodeId: p.nodeId })) {
      await navigateTo(canvasId, p.noteTitle ?? 'Board')
    }
  }

  async function deleteItem(p: ScenePlacement): Promise<void> {
    if (await execute('DeleteContent', {
      canvasId: host.canvasId,
      placementIds: [p.id],
      decorationIds: [],
    })) {
      host.controller.selection.clear()
    }
  }

  function boardActions(): MenuActions {
    const stub = (): void => {}
    return {
      flip: stub,
      openAppearance: stub,
      openTags: stub,
      openNote: stub,
      attachNewNote: stub,
      attachExistingNote: stub,
      renameNote: stub,
      detachNote: stub,
      makeNoteIndependent: stub,
      toggleHideLabel: stub,
      toggleLock: stub,
      setAsBackdrop: stub,
      openAsBoard: stub,
      reorder: stub,
      deleteItem: stub,
      selectAll: () => selectAllBoard(),
      zoomToFit: () => tooling.zoomToFit(),
      setBackdropFromFile: () => fileInput.click(),
      editBackdropPosition: () => tooling.enterBackgroundEdit(),
      resetBackdrop: () => void tooling.resetBackgroundTransform(),
      removeBackdrop: () => void tooling.removeBackground(),
      setBackdropColor: (color) => void tooling.setBackgroundColor(color),
      openBoardNote: () => void openBoardNote(),
    }
  }

  /** Mirrors gestures-ui.selectAll: every selectable item, locked or
   * hidden decorations excluded (§6.9). */
  function selectAllBoard(): void {
    const ids = host.controller
      .items()
      .filter(
        (item) => !(item.itemKind === 'decoration' && (item.locked === 1 || item.hidden === 1)),
      )
      .map((item) => item.id)
    host.controller.selection.set(ids)
  }

  async function openBoardNote(): Promise<void> {
    const sceneResponse = await window.ew.project.query('getCanvasScene', {
      canvasId: host.canvasId,
    })
    if (!sceneResponse.ok || sceneResponse.result === null) return
    const nodeId = (sceneResponse.result as { nodeId: string }).nodeId
    const nodeResponse = await window.ew.project.query('getNode', { nodeId })
    const noteId = nodeResponse.ok
      ? ((nodeResponse.result as { noteId: string | null } | null)?.noteId ?? null)
      : null
    openCornerPanel(nodeId, noteId)
  }

  // ---------------------------------------------------- routing

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
    const bounds = element.getBoundingClientRect()
    const at = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    const world = host.controller.camera.screenToWorld(at)
    const hit = hitTest(world, host.controller.items())
    if (hit && hit.itemKind === 'placement') {
      // Select the item so its charm popovers, z-order, and set-as-
      // backdrop all act on it, then open the item menu.
      host.controller.selection.set([hit.id])
      const subject: ItemSubject = {
        kind: 'item',
        hasNote: hit.noteId !== null,
        locked: hit.locked === 1,
        labelVisible: hit.labelVisible === 1,
        isImage: hit.appearanceKind === 'image',
      }
      render('item', menuFor(subject, itemActions(hit)), at)
    } else {
      const bg = tooling.background()
      const subject: BoardSubject = {
        kind: 'board',
        hasBackgroundImage: bg?.assetId != null,
        hasColor: bg?.color != null,
      }
      render('board', menuFor(subject, boardActions()), at)
    }
  }

  // Suppress the OS menu everywhere the app owns the surface (§8.4);
  // editable targets keep it so their paste/spell menu still works.
  const onDocContextMenu = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('[contenteditable="true"]'))
    ) {
      return
    }
    if (!element.contains(target)) event.preventDefault()
  }

  element.addEventListener('contextmenu', onContextMenu)
  document.addEventListener('contextmenu', onDocContextMenu)

  return {
    destroy() {
      close()
      element.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('contextmenu', onDocContextMenu)
      fileInput.remove()
    },
  }
}

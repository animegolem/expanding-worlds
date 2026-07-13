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
import {
  hitTest,
  unionBounds,
  type ReorderOp,
  type SceneDecoration,
  type SceneItem,
  type ScenePlacement,
  type CommandExecutionOptions,
} from '@ew/canvas-engine'
import { Z } from '../z'
import { uuidv7 } from '@ew/domain'
import { mount, unmount } from 'svelte'
import type { CommandResult } from '@ew/commands'
import type { CanvasHostHandle } from '../canvas/host'
import type { BoardTooling } from '../canvas/board-tooling'
import type { DecorationsUi } from '../canvas/decorations-ui'
import { placeAnchored, pointAnchor } from '../chrome/anchored-placement'
import { navigateTo } from '../chrome/navigation'
import { takeoverActive } from '../chrome/takeover'
import { applyMenuCascade } from '../chrome/menu-cascade'
import { runAsUndoGroup } from '../undo/undo-store'
import { requestCharmPopover } from '../canvas/charms-ui'
import { currentSelectionHalo } from '../canvas/selection-halo'
import { requestCaptionEditor } from '../canvas/caption-request'
import { requestCaptionPromotion } from '../canvas/caption-promotion'
import {
  requestAttachNote,
  requestOpenNote,
  requestRenameNote,
} from '../note/open-note'
import { openCornerPanel } from '../note/panels'
import { formatBinding } from '../keys/registry'
import { themeTokenValue } from '../theme'
import BoardColorRow from './BoardColorRow.svelte'
import { OPEN_BOARD_MENU_EVENT, type BoardMenuRequest } from './board-menu-request'
import { importFilesAt, readClipboardImageFiles } from '../canvas/import-surfaces'
import { createOpenGeneration } from './open-generation'
import { requestNewBoard } from './new-board'
import {
  menuFor,
  type BoardSubject,
  type DecorationSubject,
  type FrameSubject,
  type GroundSubject,
  type ItemSubject,
  type MenuActions,
  type MenuGroup,
  type MenuItem,
  type MenuKind,
  type MultiSubject,
} from './inventory'

export interface ContextMenuHandle {
  destroy(): void
}

/** AI-IMP-183 (M-13): the right-click menu is the topmost surface, but
 * its Escape handler lives on document-capture — which fires AFTER any
 * window-capture listener. Window-capture Escape consumers (the tag and
 * search panels) query this and DECLINE while a menu is open, so the menu
 * peels first instead of a panel underneath stealing the press. Counts
 * open instances so multiple hosts stay correct. */
let openContextMenus = 0
export function contextMenuOpen(): boolean {
  return openContextMenus > 0
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
  decorationsUi: DecorationsUi,
): ContextMenuHandle {
  let menu: HTMLDivElement | null = null
  let menuKind: MenuKind | null = null
  /** Enabled, focusable rows in the currently open menu, in order. */
  let rows: HTMLButtonElement[] = []
  let focusIndex = -1
  let colorMount: ReturnType<typeof mount> | null = null
  let groundOpenSerial = 0
  // §8.4 stale-open guard (AI-IMP-155): every render and close advances
  // this generation; an async open (openFrameMenu) captures it before
  // awaiting and bails if a newer open/close bumped it underneath.
  const openGen = createOpenGeneration()

  // Hidden file input for "Set / Replace backdrop…" (§6.7). Kept in the
  // DOM (opacity 0) so e2e setInputFiles can reach it, mirroring the
  // title strip's bg-file-input.
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'image/*'
  fileInput.dataset['testid'] = 'bg-file-input'
  fileInput.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;'
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (file) void tooling.setBackgroundFromFile(file)
  })
  element.appendChild(fileInput)

  function close(): void {
    // AI-IMP-183 (M-13): drop the open-instance count only when a menu was
    // actually up (render() calls close() first, so guard the decrement).
    if (menu) openContextMenus = Math.max(0, openContextMenus - 1)
    // Advance the open generation so any in-flight async open (which
    // captured the prior value) sees itself as stale and bails. render()
    // calls close() first, so a newer open advances it too. AI-IMP-155.
    openGen.bump()
    if (colorMount) void unmount(colorMount)
    colorMount = null
    menu?.remove()
    menu = null
    menuKind = null
    rows = []
    focusIndex = -1
    document.removeEventListener('pointerdown', onOutsidePointer, true)
    document.removeEventListener('keydown', onMenuKeyDown, true)
  }

  const onOutsidePointer = (event: PointerEvent): void => {
    if (!menu || menu.contains(event.target as Node)) return
    const swallowsBoardClick = menuKind === 'board' && (event.target as Element | null)?.tagName === 'CANVAS'
    close()
    if (swallowsBoardClick) event.stopPropagation()
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

  function makeShell(kind: MenuKind): HTMLDivElement {
    const root = document.createElement('div')
    root.dataset['testid'] = 'context-menu'
    root.dataset['kind'] = kind
    root.setAttribute('role', 'menu')
    root.style.cssText =
      'position:absolute;z-index:' + Z.popover + ';display:flex;flex-direction:column;gap:0.2rem;' +
      'min-width:190px;max-width:320px;padding:0.35rem;background:var(--ew-surface-menu);' +
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
    if (item.header) {
      // §8.4 count header: a muted, non-interactive caption — never a
      // menuitem, never focusable, dispatches nothing.
      const caption = document.createElement('div')
      caption.dataset['testid'] = item.testid ?? `ctx-${item.id}`
      caption.setAttribute('role', 'presentation')
      caption.textContent = item.label
      caption.style.cssText =
        'padding:0.25rem 0.6rem;font-size:0.72rem;letter-spacing:0.02em;opacity:0.6;' +
        'text-transform:none;color:var(--ew-text-muted);'
      parent.appendChild(caption)
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
    // §8.2: NO tooltip chip on menu rows. A disabled row is greyed and
    // prints its reason inline as well as exposing it to assistive tech.
    if (disabled) {
      button.style.opacity = '0.45'
      // The cascade fades to this resting opacity, so a disabled row
      // lands dimmed, never at full (AI-IMP-167).
      button.style.setProperty('--row-rest-opacity', '0.45')
      button.setAttribute('aria-disabled', 'true')
      button.setAttribute('aria-label', `${item.label}: ${item.disabledReason!}`)
    }

    const labelWrap = document.createElement('span')
    labelWrap.style.cssText = 'display:flex;flex-direction:column;align-items:flex-start;min-width:0;'
    const label = document.createElement('span')
    label.textContent = item.label
    labelWrap.appendChild(label)
    if (disabled) {
      const reason = document.createElement('span')
      reason.dataset['testid'] = `${item.testid ?? `ctx-${item.id}`}-reason`
      reason.textContent = item.disabledReason!
      reason.style.cssText =
        'max-width:260px;font-size:0.68rem;line-height:1.25;white-space:normal;' +
        'overflow-wrap:anywhere;color:var(--ew-text-muted);'
      labelWrap.appendChild(reason)
    }
    button.appendChild(labelWrap)

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
    // The shared `rows` length BEFORE this flyout's children were pushed.
    // renderRow appends every flyout child to `rows` (keyboard nav over
    // the OPEN flyout stays as-is), but closeSub removed only the panel —
    // leaving the DETACHED child buttons in `rows`, so `rows` grew on each
    // open and End/Enter could fire a stranded flyout verb after
    // close-via-anchor. Truncate back on close (AI-IMP-156).
    let rowsBase = -1
    const closeSub = (): void => {
      open?.remove()
      open = null
      if (rowsBase >= 0) {
        rows.length = rowsBase
        if (focusIndex >= rows.length) focusIndex = -1
        rowsBase = -1
      }
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
        // rung: popover +1 — submenu paints one above its parent shell
        'position:absolute;z-index:' + (Z.popover + 1) + ';display:flex;flex-direction:column;gap:0.2rem;' +
        'min-width:170px;padding:0.35rem;background:var(--ew-surface-menu);' +
        'border:1px solid var(--ew-border);border-radius:7px;box-shadow:0 6px 18px var(--ew-menu-shadow);'
      rowsBase = rows.length
      for (const child of item.submenu!) renderRow(panel, child)
      // The flyout lives INSIDE the menu shell: the outside-pointer
      // guard (`menu.contains`) then treats child hits as inside, and
      // `close()` removes the flyout with the menu — a sibling panel
      // was orphaned and the parent closed on the first child press
      // (Codex review, PR #9). The shell is position:absolute with no
      // overflow clip, so it is the positioning box.
      const rect = anchor.getBoundingClientRect()
      const menuRect = menu!.getBoundingClientRect()
      panel.style.left = `${rect.right - menuRect.left}px`
      panel.style.top = `${rect.top - menuRect.top}px`
      menu!.appendChild(panel)
      // A flyout is a menu too — it cascades on open (AI-IMP-167).
      applyMenuCascade(panel)
      open = panel
    })
  }

  function renderColorRow(parent: HTMLElement, item: MenuItem): void {
    const wrap = document.createElement('div')
    wrap.dataset['testid'] = item.testid ?? `ctx-${item.id}`
    wrap.style.cssText =
      'display:flex;align-items:center;gap:0.3rem;flex-wrap:wrap;padding:0.2rem 0.5rem;'
    parent.appendChild(wrap)
    const spec = item.colorRow!
    const background = tooling.background()
    const palette = spec.swatchTokens.map((token) => themeTokenValue(token))
    colorMount = mount(BoardColorRow, {
      target: wrap,
      props: {
        value: background?.color ?? themeTokenValue('--ew-surface-solid'),
        palette,
        onpick: (color: string) => {
          close()
          spec.onPick(color)
        },
        onclear: () => {
          close()
          spec.onPick(null)
        },
      },
    })
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

  function render(
    kind: MenuKind,
    groups: MenuGroup[],
    at: { x: number; y: number },
    avoid?: ReturnType<typeof currentSelectionHalo>,
  ): void {
    close()
    menu = makeShell(kind)
    menuKind = kind
    if (kind === 'board') {
      const marker = document.createElement('span')
      marker.dataset['testid'] = 'board-menu'
      marker.style.cssText = 'position:absolute;inset:0;pointer-events:none;'
      menu.appendChild(marker)
    }
    // AI-IMP-183 (M-13): a menu is now up — panels decline Escape to it.
    openContextMenus++
    rows = []
    focusIndex = -1
    groups.forEach((group, index) => {
      if (index > 0) divider(menu!)
      for (const item of group.items) renderRow(menu!, item)
    })
    element.appendChild(menu)
    // §8.2 decision 06 (AI-IMP-167): the universal CASCADE — rows fade
    // in staggered top-to-bottom on open. One-shot per fresh render;
    // opacity only, so every row stays clickable through the fade.
    applyMenuCascade(menu)
    const size = menu.getBoundingClientRect()
    const bounds = element.getBoundingClientRect()
    const placed = placeAnchored({
      anchor: pointAnchor(at.x, at.y),
      surface: size,
      host: { x: 0, y: 0, width: bounds.width, height: bounds.height },
      x: { preferred: 'start', fallback: 'before' },
      y: { preferred: 'start', fallback: 'before' },
      margin: 4,
      avoid: avoid ?? undefined,
    })
    menu.style.left = `${placed.x}px`
    menu.style.top = `${placed.y}px`
    document.addEventListener('pointerdown', onOutsidePointer, true)
    document.addEventListener('keydown', onMenuKeyDown, true)
  }

  // ---------------------------------------------------- actions

  async function execute(
    commandType: string,
    payload: unknown,
    options?: CommandExecutionOptions,
  ): Promise<boolean> {
    const result = await host.gateway.execute(commandType, payload, options)
    if (result.status !== 'committed') {
      onError(describeFailure(commandType, result))
      return false
    }
    return true
  }

  /** Every MenuActions member as a no-op. Each per-subject factory
   * spreads this and overrides only the verbs its menu actually
   * offers, so the grammar's action bag stays type-complete without a
   * wall of hand-written stubs. */
  function baseStubActions(): MenuActions {
    const noop = (): void => {}
    return {
      flip: noop,
      openAppearance: noop,
      openTags: noop,
      editCaption: noop,
      promoteCaption: noop,
      removeCaption: noop,
      openNote: noop,
      attachNewNote: noop,
      attachExistingNote: noop,
      renameNote: noop,
      detachNote: noop,
      makeNoteIndependent: noop,
      toggleHideLabel: noop,
      toggleLock: noop,
      setAsBackdrop: noop,
      openAsBoard: noop,
      reorder: noop,
      deleteItem: noop,
      newBoard: noop,
      selectAll: noop,
      zoomToFit: noop,
      setBackdropFromFile: noop,
      editBackdropPosition: noop,
      resetBackdrop: noop,
      removeBackdrop: noop,
      setBackdropColor: noop,
      openBoardNote: noop,
      setBackdropFromSelection: noop,
      showHiddenDecoration: noop,
      pasteHere: noop,
      textHere: noop,
      pinHere: noop,
      shapeHere: noop,
      frameHere: noop,
      openBoardMenu: noop,
      setDecorationLock: noop,
      hideDecoration: noop,
      deleteDecoration: noop,
      align: noop,
      distribute: noop,
      flipAll: noop,
      gatherIntoFrame: noop,
      lockAll: noop,
      groupDecorations: noop,
      ungroupDecorations: noop,
      hideDecorations: noop,
      deleteSelection: noop,
      toggleFrameSortOnDrop: noop,
      sortFrameNow: noop,
      fillFrameFromLibrary: noop,
      deleteFrame: noop,
    }
  }

  /** The shipped note-lifecycle wiring (§8.4 "note" verb), shared by
   * the item and frame factories — both surface the same rows. */
  function noteLifecycleActions(
    p: ScenePlacement,
  ): Pick<
    MenuActions,
    'openNote' | 'attachNewNote' | 'attachExistingNote' | 'renameNote' | 'detachNote' | 'makeNoteIndependent'
  > {
    return {
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
      // AI-IMP-182 (RFC §6.6/§9.3 "immediately undoable"): detach is one
      // Mod+Z. DetachNoteFromNode is GROUP_ONLY — captured at this gesture
      // (its inverse AttachNoteToNode reattaches). A group of one records
      // a single entry, exactly like the decoration verbs above.
      detachNote: () =>
        void runAsUndoGroup(async (groupToken) => {
          await execute('DetachNoteFromNode', { nodeId: p.nodeId }, { groupToken })
        }),
      makeNoteIndependent: () =>
        promptTitle('New unique title', (newTitle) =>
          void execute('MakeNoteIndependent', {
            nodeId: p.nodeId,
            newNoteId: uuidv7(),
            newTitle,
          }),
        ),
    }
  }

  function itemActions(p: ScenePlacement): MenuActions {
    return {
      ...baseStubActions(),
      ...noteLifecycleActions(p),
      flip: (axis) => void execute('FlipPlacement', { placementId: p.id, axis }),
      openAppearance: () => requestCharmPopover(p.id, 'appearance'),
      openTags: () => requestCharmPopover(p.id, 'tags'),
      editCaption: () => requestCaptionEditor(p.id),
      promoteCaption: () => requestCaptionPromotion(p.id),
      removeCaption: () => void execute('SetPlacementCaption', { placementId: p.id, caption: null }),
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

  function boardActions(world: { x: number; y: number }): MenuActions {
    return {
      ...baseStubActions(),
      // §8.4 (AI-IMP-239): hand the naming prompt (the command palette)
      // the WORLD position of the right-click, so the seeded board-object
      // lands exactly where the menu was opened.
      newBoard: () => requestNewBoard(world),
      selectAll: () => selectAllBoard(),
      zoomToFit: () => tooling.zoomToFit(),
      setBackdropFromFile: () => fileInput.click(),
      editBackdropPosition: () => tooling.enterBackgroundEdit(),
      resetBackdrop: () => void tooling.resetBackgroundTransform(),
      removeBackdrop: () => void tooling.removeBackground(),
      setBackdropColor: (color) => void tooling.setBackgroundColor(color),
      openBoardNote: () => void openBoardNote(),
      setBackdropFromSelection: () => void tooling.setBackgroundFromSelection(),
      showHiddenDecoration: (id) => void decorationsUi.show(id),
    }
  }

  function boardSubject(): BoardSubject {
    const bg = tooling.background()
    return {
      kind: 'board',
      hasBackgroundImage: bg?.assetId != null,
      hasColor: bg?.color != null,
      hasImageSelection: tooling.selectedImagePlacement() !== null,
      hiddenDecorations: decorationsUi.hiddenDecorations().map(({ id, kind }) => ({ id, kind })),
    }
  }

  function renderBoardMenu(at: { x: number; y: number }, world: { x: number; y: number }): void {
    render('board', menuFor(boardSubject(), boardActions(world)), at)
  }

  function groundActions(
    at: { x: number; y: number },
    world: { x: number; y: number },
    files: File[],
  ): MenuActions {
    const armAt = (tool: 'rect' | 'frame'): void => {
      if (host.tools.active !== tool) host.tools.setTool(tool)
      // Seed the ordinary draw session at the ground-menu point. The
      // next pointer movement/up finishes the remembered shape or frame
      // from HERE; no parallel creation semantics.
      host.tools.pointerDown(at, { button: 0 })
    }
    return {
      ...baseStubActions(),
      pasteHere: () => void importFilesAt(
        host,
        files,
        world,
        host.canvasId,
        { x: element.getBoundingClientRect().left + at.x, y: element.getBoundingClientRect().top + at.y },
      ),
      textHere: () => host.tools.onPlaceText?.(world),
      pinHere: () => host.tools.onPlacePin?.(world),
      shapeHere: () => armAt('rect'),
      frameHere: () => armAt('frame'),
      openBoardMenu: () => renderBoardMenu(at, world),
    }
  }

  async function renderGroundMenu(
    at: { x: number; y: number },
    world: { x: number; y: number },
  ): Promise<void> {
    const serial = ++groundOpenSerial
    const clipboard = await readClipboardImageFiles()
    if (serial !== groundOpenSerial) return
    const subject: GroundSubject = {
      kind: 'ground',
      pasteDisabledReason: clipboard.disabledReason,
    }
    render('ground', menuFor(subject, groundActions(at, world, clipboard.files)), at)
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
    // AI-IMP-184 (M-17): capture the target canvas BEFORE the two awaits
    // and bail if it changed underneath, mirroring refreshCorner
    // (charms-ui.ts). A navigation mid-flight would otherwise tether the
    // FIRST board's note over the board now on screen.
    const canvasId = host.canvasId
    const sceneResponse = await window.ew.project.query('getCanvasScene', { canvasId })
    if (!sceneResponse.ok || sceneResponse.result === null) return
    const nodeId = (sceneResponse.result as { nodeId: string }).nodeId
    const nodeResponse = await window.ew.project.query('getNode', { nodeId })
    if (host.canvasId !== canvasId) return // navigated away mid-flight
    const noteId = nodeResponse.ok
      ? ((nodeResponse.result as { noteId: string | null } | null)?.noteId ?? null)
      : null
    openCornerPanel(nodeId, noteId)
  }

  // ------------------------------------------------ decoration actions

  function decorationActions(d: SceneDecoration): MenuActions {
    return {
      ...baseStubActions(),
      // Z-order runs over the current selection (the right-click just
      // selected this decoration); ReorderContent handles decorations.
      reorder: (op: ReorderOp) => void tooling.reorder(op),
      // §8.4: a discrete verb is one undoable command. UpdateDecoration
      // is captured at the gesture (runAsUndoGroup), never by type —
      // Dock style drags / text commits emit it too and stay OUT of
      // undo (AI-IMP-154). A group of one records as a single entry.
      setDecorationLock: () =>
        void runAsUndoGroup(async (groupToken) => {
          await execute('UpdateDecoration', {
            decorationId: d.id,
            set: { locked: d.locked !== 1 },
          }, { groupToken })
        }),
      hideDecoration: () => void hideDecoration(d.id),
      deleteDecoration: () => void deleteContent([], [d.id]),
    }
  }

  async function hideDecoration(id: string): Promise<void> {
    // Hidden decorations are unhittable (§6.8) — drop the selection.
    // Captured at the gesture so it is one Mod+Z entry (AI-IMP-154).
    await runAsUndoGroup(async (groupToken) => {
      if (await execute('UpdateDecoration', { decorationId: id, set: { hidden: true } }, { groupToken })) {
        host.controller.selection.clear()
      }
    })
  }

  async function deleteContent(placementIds: string[], decorationIds: string[]): Promise<void> {
    if (
      await execute('DeleteContent', { canvasId: host.canvasId, placementIds, decorationIds })
    ) {
      host.controller.selection.clear()
    }
  }

  // ----------------------------------------------- multi-select actions

  function multiActions(items: readonly SceneItem[]): MenuActions {
    const placementIds = items
      .filter((i): i is ScenePlacement => i.itemKind === 'placement')
      .map((i) => i.id)
    const decorationIds = items
      .filter((i): i is SceneDecoration => i.itemKind === 'decoration')
      .map((i) => i.id)
    return {
      ...baseStubActions(),
      // align/distribute act on the live selection (unchanged here).
      reorder: (op) => void tooling.reorder(op),
      align: (op) => void tooling.align(op),
      distribute: (axis) => void tooling.distribute(axis),
      flipAll: (axis) => void flipAll(placementIds, axis),
      gatherIntoFrame: () => void gatherIntoFrame(items, placementIds),
      lockAll: () => void lockAll(items, placementIds, decorationIds),
      groupDecorations: () => void decorationsUi.groupSelection(),
      ungroupDecorations: () => void decorationsUi.ungroupSelection(),
      hideDecorations: () => void decorationsUi.hideSelection(),
      deleteSelection: () => void deleteContent(placementIds, decorationIds),
    }
  }

  async function flipAll(placementIds: string[], axis: 'x' | 'y'): Promise<void> {
    if (placementIds.length === 0) return
    await runAsUndoGroup(async (groupToken) => {
      for (const placementId of placementIds) {
        await host.gateway.execute('FlipPlacement', { placementId, axis }, { groupToken })
      }
    })
  }

  /** §8.4 Lock all: covers the ENTIRE selection it advertises — both
   * placements (SetPlacementLock) and decorations (UpdateDecoration) —
   * inside one undo group, so a single Mod+Z frees everything
   * (AI-IMP-154). UpdateDecoration is captured here because the group is
   * open (GROUP_ONLY_COMMANDS), not because its bare type is allowlisted.
   * Already-locked decorations are skipped so their inverse stays
   * meaningful; placements lock unconditionally (SetPlacementLock's
   * inverse restores prior state). */
  async function lockAll(
    items: readonly SceneItem[],
    placementIds: string[],
    decorationIds: string[],
  ): Promise<void> {
    if (placementIds.length === 0 && decorationIds.length === 0) return
    const lockedDecorations = new Set(
      items
        .filter((i): i is SceneDecoration => i.itemKind === 'decoration' && i.locked === 1)
        .map((i) => i.id),
    )
    await runAsUndoGroup(async (groupToken) => {
      for (const placementId of placementIds) {
        await host.gateway.execute('SetPlacementLock', { placementId, locked: true }, { groupToken })
      }
      for (const decorationId of decorationIds) {
        if (lockedDecorations.has(decorationId)) continue
        await host.gateway.execute('UpdateDecoration', {
          decorationId,
          set: { locked: true },
        }, { groupToken })
      }
    })
  }

  /** §8.4 Gather into a frame: create the frame around the placements'
   * bbox and capture them as members — ONE undo group (commitFrame's
   * nested group runs inline; AI-IMP-127/129 pattern). Frames capture
   * PLACEMENTS only (CaptureInFrame's member_placement_id relation;
   * AI-IMP-154), so the frame is bounded to — and captures — the
   * placement subset alone; the grammar disables the row outright on a
   * decoration-only selection so this never produces an empty frame. */
  async function gatherIntoFrame(
    items: readonly SceneItem[],
    placementIds: string[],
  ): Promise<void> {
    if (placementIds.length === 0) return
    const placements = items.filter((i) => i.itemKind === 'placement')
    const bounds = unionBounds(placements)
    if (!bounds) return
    const pad = 24
    const region = {
      x: bounds.x - pad,
      y: bounds.y - pad,
      width: bounds.width + pad * 2,
      height: bounds.height + pad * 2,
    }
    await runAsUndoGroup(async (groupToken) => {
      const framePlacementId = await host.commitFrame(region, groupToken)
      if (framePlacementId) {
        // Surface a CaptureInFrame conflict/validation failure via
        // onError (execute() does this). Do NOT auto-delete the frame:
        // the undo group collapses to the lone create, so one Mod+Z
        // removes the empty frame. AI-IMP-155.
        await execute('CaptureInFrame', {
          framePlacementId,
          memberPlacementIds: placementIds,
        }, { groupToken })
      }
    })
  }

  // ---------------------------------------------------- frame actions

  function frameActions(p: ScenePlacement): MenuActions {
    return {
      ...baseStubActions(),
      ...noteLifecycleActions(p),
      openTags: () => requestCharmPopover(p.id, 'tags'),
      toggleLock: () =>
        void execute('SetPlacementLock', { placementId: p.id, locked: p.locked !== 1 }),
      toggleFrameSortOnDrop: () => void toggleFrameSortOnDrop(p.id),
      sortFrameNow: () => void tooling.sortFrame(p.id),
      fillFrameFromLibrary: () => tooling.loadIntoFrame(p.id),
      deleteFrame: () => void deleteFrame(p),
    }
  }

  async function toggleFrameSortOnDrop(frameId: string): Promise<void> {
    const on = await tooling.frameSortOnDrop(frameId)
    await tooling.setFrameSortOnDrop(frameId, !on)
  }

  /** §9.6: Delete frame trashes the frame NODE. Members are independent
   * nodes — they stay on the board — which the verb copy states. */
  async function deleteFrame(p: ScenePlacement): Promise<void> {
    if (await execute('TrashNode', { nodeId: p.nodeId })) {
      host.controller.selection.clear()
    }
  }

  // ---------------------------------------------------- routing

  const onContextMenu = (event: MouseEvent): void => {
    // A takeover owns the window (§8.2). Its own surfaces (the outliner
    // control panel included) must never also summon the obscured board's
    // menu at the same screen coordinates.
    if (takeoverActive()) return
    event.preventDefault()
    const bounds = element.getBoundingClientRect()
    const at = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    const world = host.controller.camera.screenToWorld(at)
    const hit = hitTest(world, host.controller.items())

    // Empty board → HERE first; its Board… row is the third door to
    // the same board inventory the crumb opens.
    if (!hit) {
      void renderGroundMenu(at, world)
      return
    }

    // A right-click INSIDE a live multi-selection acts on the whole set
    // (§8.4) — do NOT collapse the selection to the hit.
    const selectedIds = host.controller.selection.ids()
    if (selectedIds.length > 1 && selectedIds.includes(hit.id)) {
      const selected = host.controller.selectedItems()
      const placementCount = selected.filter((i) => i.itemKind === 'placement').length
      const subject: MultiSubject = {
        kind: 'multi',
        count: selected.length,
        placementCount,
        decorationCount: selected.length - placementCount,
        groupedDecorationCount: selected.filter(
          (item) => item.itemKind === 'decoration' && item.groupId !== null,
        ).length,
      }
      render('multi', menuFor(subject, multiActions(selected)), at)
      return
    }

    // Single target: select it, then open the kind-specific menu so its
    // charm popovers, z-order, and backdrop verbs all act on it.
    host.controller.selection.set([hit.id])
    if (hit.itemKind === 'decoration') {
      const subject: DecorationSubject = { kind: 'decoration', locked: hit.locked === 1 }
      render('decoration', menuFor(subject, decorationActions(hit)), at)
      return
    }
    if (hit.appearanceKind === 'frame') {
      void openFrameMenu(hit, at)
      return
    }
    const subject: ItemSubject = {
      kind: 'item',
      hasNote: hit.noteId !== null,
      locked: hit.locked === 1,
      labelVisible: hit.labelVisible === 1,
      hasCaption: hit.caption !== null,
      isImage: hit.appearanceKind === 'image',
    }
    render('item', menuFor(subject, itemActions(hit)), at, currentSelectionHalo())
  }

  /** The frame menu's sort-on-drop toggle prints live state, so resolve
   * the per-frame flag (async settings read) before building. */
  async function openFrameMenu(
    p: ScenePlacement,
    at: { x: number; y: number },
  ): Promise<void> {
    // Capture the open generation BEFORE the async settings read; if a
    // newer menu opened (or the menu closed) during the await, this
    // resolution is stale and must not paint over it. AI-IMP-155.
    const token = openGen.current()
    // AI-IMP-184 (M-25): the PRE-render window. No menu is up yet, so
    // onOutsidePointer is not listening and close() never runs — a
    // click-away during the await would leave openGen unbumped and let
    // the resolved menu paint late. Watch for an intervening pointerdown
    // ourselves and bail if one lands before we render.
    let clickedAway = false
    const onPreRenderPointer = (): void => {
      clickedAway = true
    }
    document.addEventListener('pointerdown', onPreRenderPointer, true)
    try {
      const sortOnDrop = await tooling.frameSortOnDrop(p.id)
      if (clickedAway || openGen.isStale(token)) return
      const subject: FrameSubject = {
        kind: 'frame',
        locked: p.locked === 1,
        hasNote: p.noteId !== null,
        sortOnDrop,
      }
      const stillSelected = host.controller.selection.ids()
      render(
        'frame',
        menuFor(subject, frameActions(p)),
        at,
        stillSelected.length === 1 && stillSelected[0] === p.id
          ? currentSelectionHalo()
          : null,
      )
    } finally {
      document.removeEventListener('pointerdown', onPreRenderPointer, true)
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

  const onBoardMenuRequest = (event: Event): void => {
    if (takeoverActive()) return
    const { clientX, clientY } = (event as CustomEvent<BoardMenuRequest>).detail
    const bounds = element.getBoundingClientRect()
    const at = { x: clientX - bounds.left, y: clientY - bounds.top }
    const center = { x: bounds.width / 2, y: bounds.height / 2 }
    renderBoardMenu(at, host.controller.camera.screenToWorld(center))
  }

  // Touch twin of empty-ground right click. Movement or release before
  // the 550ms threshold cancels; firing cancels the controller's pending
  // gesture before opening HERE so no marquee/pan survives underneath.
  let longPressTimer: ReturnType<typeof setTimeout> | undefined
  let longPressStart: { pointerId: number; at: { x: number; y: number }; world: { x: number; y: number } } | null = null
  const cancelLongPress = (): void => {
    clearTimeout(longPressTimer)
    longPressTimer = undefined
    longPressStart = null
  }
  const onLongPressDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch' || event.button !== 0 || event.target !== element.querySelector('canvas')) return
    const bounds = element.getBoundingClientRect()
    const at = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    const world = host.controller.camera.screenToWorld(at)
    if (hitTest(world, host.controller.items())) return
    longPressStart = { pointerId: event.pointerId, at, world }
    longPressTimer = setTimeout(() => {
      const pending = longPressStart
      if (!pending) return
      host.controller.escape()
      void renderGroundMenu(pending.at, pending.world)
      cancelLongPress()
    }, 550)
  }
  const onLongPressMove = (event: PointerEvent): void => {
    const pending = longPressStart
    if (!pending || pending.pointerId !== event.pointerId) return
    const bounds = element.getBoundingClientRect()
    const at = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    if (Math.hypot(at.x - pending.at.x, at.y - pending.at.y) > 8) cancelLongPress()
  }
  const onLongPressEnd = (event: PointerEvent): void => {
    if (longPressStart?.pointerId === event.pointerId) cancelLongPress()
  }

  element.addEventListener('contextmenu', onContextMenu)
  element.addEventListener('pointerdown', onLongPressDown, true)
  element.addEventListener('pointermove', onLongPressMove, true)
  element.addEventListener('pointerup', onLongPressEnd, true)
  element.addEventListener('pointercancel', onLongPressEnd, true)
  document.addEventListener('contextmenu', onDocContextMenu)
  window.addEventListener(OPEN_BOARD_MENU_EVENT, onBoardMenuRequest)

  return {
    destroy() {
      close()
      cancelLongPress()
      element.removeEventListener('contextmenu', onContextMenu)
      element.removeEventListener('pointerdown', onLongPressDown, true)
      element.removeEventListener('pointermove', onLongPressMove, true)
      element.removeEventListener('pointerup', onLongPressEnd, true)
      element.removeEventListener('pointercancel', onLongPressEnd, true)
      document.removeEventListener('contextmenu', onDocContextMenu)
      window.removeEventListener(OPEN_BOARD_MENU_EVENT, onBoardMenuRequest)
      fileInput.remove()
    },
  }
}

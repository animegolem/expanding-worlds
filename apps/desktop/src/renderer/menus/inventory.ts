/**
 * The context-menu inventory (RFC §8.4 rev 0.55, AI-IMP-136). ONE
 * declarative grammar every per-kind menu is built from: `menuFor`
 * returns ordered GROUPS of verb ROWS, and the grammar itself —
 * verbs-only, frequency-first, destructive-last-alone, submenus only
 * for the four families — is enforced STRUCTURALLY by the types plus
 * {@link validateMenu}, so AI-IMP-137's decoration / multi-select /
 * frame inventories inherit it for free rather than re-deriving it.
 *
 * The builder is a pure function of a subject snapshot and an actions
 * bag: no host, no DOM. That keeps the grammar unit-testable (the
 * vitest fixture passes stub actions) and lets ContextMenu.ts own all
 * wiring/rendering. Every enabled verb dispatches ONE existing
 * undoable command through its action; a verb whose command does not
 * exist yet ships as a disabled coming-soon row (tooltip grammar,
 * §8.2) — never a new domain command in this ticket.
 */
import type { AlignOp, DistributeAxis, ReorderOp } from '@ew/canvas-engine'
import { getBinding } from '../keys/registry'
// AI-IMP-159: the Crop verb opens the crop-editor overlay through its
// dependency-free request seam (a window event, the same indirection
// ContextMenu itself uses for Appearance/Tags via requestCharmPopover).
// ContextMenu.ts selects the hit item before building this menu, so the
// live single selection IS the crop subject; no action-bag change and
// no host/DOM import is needed here.
import { requestCropEditor } from '../canvas/crop-request'

/**
 * The verb families permitted to nest a submenu (RFC §8.4: "submenus
 * only for families — Appearance · Tags · Align · Sort"). A `submenu`
 * on any other verb is a grammar violation caught by
 * {@link validateMenu}. Core (this ticket) ships no submenus; the
 * capability exists so 137's Align/Sort families slot in without
 * re-litigating the rule.
 */
export const SUBMENU_FAMILIES = ['appearance', 'tags', 'align', 'sort'] as const
export type MenuFamily = (typeof SUBMENU_FAMILIES)[number]

/** The board-color swatch palette (§6.7 rev 0.48): theme tokens, never
 * raw hex. Identical on every theme — the user's board paint, not
 * chrome (theme.css §11.5 canvas flats). */
export const BOARD_COLOR_TOKENS = [
  '--ew-canvas-flat-1',
  '--ew-canvas-flat-2',
  '--ew-canvas-flat-3',
  '--ew-canvas-flat-4',
  '--ew-canvas-flat-5',
  '--ew-canvas-flat-6',
] as const

/**
 * One menu row. A row is in exactly ONE mode:
 * - actionable: `run` set (an undoable command dispatch);
 * - disabled: `disabledReason` set (coming-soon / unavailable, prints
 *   as the row's inline reason — the §8.2 disabled-with-reason shape);
 * - family submenu: `submenu` + `family` set (nests child rows);
 * - color strip: `colorRow` set (the §6.7 swatch row, rendered
 *   specially and exempt from the verb-label rules);
 * - header: `header` set (a non-interactive caption — the §8.4
 *   multi-select count line — rendered muted and never focusable).
 * `validateMenu` enforces exactly-one-mode.
 */
export interface MenuItem {
  /** Stable id. Drives the row's `data-testid` (`ctx-<id>` unless
   * `testid` overrides) and the vitest lookups. */
  id: string
  /** The verb, imperative and never the word "file" (§6.5). */
  label: string
  /** Registry binding id; its chip prints mono in the row (§8.2). */
  shortcutId?: string
  /** Child rows — present IFF this is a family submenu. */
  submenu?: MenuItem[]
  /** Family tag; REQUIRED whenever `submenu` is set, and only legal
   * for {@link SUBMENU_FAMILIES}. */
  family?: MenuFamily
  /** The undoable dispatch. Mutually exclusive with the other modes. */
  run?: () => void
  /** Coming-soon / unavailable reason; disables and annotates the row. */
  disabledReason?: string
  /** Destructive verb — the grammar forces it into the final group,
   * alone (RFC §8.4: "destructive verbs LAST, alone behind a divider"). */
  danger?: boolean
  /** The §6.7 board-color swatch strip. Carries its own dispatch. */
  colorRow?: {
    swatchTokens: readonly string[]
    onPick: (colorOrToken: string | null) => void
  }
  /** Override for the row's `data-testid` (default `ctx-<id>`). Used to
   * preserve shipped note-lifecycle testids folded in from node-menu. */
  testid?: string
  /** The row transforms the OPEN menu instead of dismissing it (the
   * inline title prompt reuses the panel). The surface keeps the menu
   * mounted and lets `run` own the teardown. */
  keepOpen?: boolean
  /** Non-interactive caption row (§8.4 multi-select count header):
   * rendered muted, never focusable, dispatches nothing. Its own row
   * mode — mutually exclusive with run / disabledReason / submenu /
   * colorRow. */
  header?: boolean
  /** Dynamic disabled state for an otherwise-actionable row is modeled
   * by choosing `run` vs `disabledReason` at build time; there is no
   * separate enabled flag — the mode says it all. */
}

export interface MenuGroup {
  id: string
  items: MenuItem[]
}

export type MenuKind = 'item' | 'board' | 'decoration' | 'multi' | 'frame'

/** The item subject: the right-clicked placement's live state. */
export interface ItemSubject {
  kind: 'item'
  hasNote: boolean
  locked: boolean
  labelVisible: boolean
  hasCaption: boolean
  /** Whether the node backs an image appearance (set-as-backdrop gate). */
  isImage: boolean
}

/** The board subject: the active canvas's backdrop state. */
export interface BoardSubject {
  kind: 'board'
  hasBackgroundImage: boolean
  hasColor: boolean
}

/** The decoration subject (§8.4): a drawn adornment. Its menu is
 * STRICTLY style / z-order / lock / hide / Delete — never an item verb
 * (no appearance, note, tags, backdrop, open-as-board). */
export interface DecorationSubject {
  kind: 'decoration'
  locked: boolean
}

/** The multi-selection subject (§8.4): more than one item right-clicked
 * inside the live selection. Counts drive the header and the
 * "Delete N items" verb. */
export interface MultiSubject {
  kind: 'multi'
  count: number
  placementCount: number
  decorationCount: number
}

/** The frame subject (§8.4): a placement wearing the frame appearance
 * (§4.9). Its menu leads with the sort family (129's actions) and
 * deletes the frame node while its members stay put (§9.6). */
export interface FrameSubject {
  kind: 'frame'
  locked: boolean
  hasNote: boolean
  /** The per-frame sort-on-drop flag (§4.9), resolved before the build
   * so the toggle row prints its live state. */
  sortOnDrop: boolean
}

export type MenuSubject =
  | ItemSubject
  | BoardSubject
  | DecorationSubject
  | MultiSubject
  | FrameSubject

/**
 * Every operation a menu row can dispatch. ContextMenu.ts supplies the
 * live implementations (host commands, tooling, note events, inline
 * prompts); the unit test supplies stubs. Keeping this an explicit
 * interface (not free closures) is what lets the grammar be built and
 * validated with no host.
 */
export interface MenuActions {
  // ---- item ----
  flip(axis: 'x' | 'y'): void
  openAppearance(): void
  openTags(): void
  editCaption(): void
  removeCaption(): void
  openNote(): void
  attachNewNote(): void
  attachExistingNote(): void
  renameNote(): void
  detachNote(): void
  makeNoteIndependent(): void
  toggleHideLabel(): void
  toggleLock(): void
  setAsBackdrop(): void
  openAsBoard(): void
  reorder(op: ReorderOp): void
  deleteItem(): void
  // ---- board ----
  /** §8.4 (AI-IMP-239): create a fresh named board and dive into it —
   * node + canvas + a board-object placement at the click, one undo. */
  newBoard(): void
  selectAll(): void
  zoomToFit(): void
  setBackdropFromFile(): void
  editBackdropPosition(): void
  resetBackdrop(): void
  removeBackdrop(): void
  setBackdropColor(colorOrToken: string | null): void
  openBoardNote(): void
  // ---- decoration ----
  setDecorationLock(): void
  hideDecoration(): void
  deleteDecoration(): void
  // ---- multi-select ----
  align(op: AlignOp): void
  distribute(axis: DistributeAxis): void
  flipAll(axis: 'x' | 'y'): void
  gatherIntoFrame(): void
  lockAll(): void
  deleteSelection(): void
  // ---- frame ----
  toggleFrameSortOnDrop(): void
  sortFrameNow(): void
  fillFrameFromLibrary(): void
  deleteFrame(): void
}

const COMING_SOON = {
  // §6.5 shipped as commands NOWHERE yet — coming-soon rows, listed in
  // the ticket's Issues Encountered. Copy follows the §8.2 tooltip
  // grammar and never says "file".
  replaceImage: 'Replace image… — arrives with the swap/replace pass',
  swapFor: 'Swap for… — arrives with the swap/replace pass',
  placeOnAnotherBoard: 'Place on another board… — arrives with the board picker',
  paste: 'Paste — press ⌘V to paste an image for now',
  // §8.4 decoration / multi / frame verbs whose command does not exist
  // yet — disabled-with-reason rows (§8.2), listed in Issues Encountered.
  editStyle: 'Edit style — restyle from the toolbar while a decoration is selected',
  multiTags: 'Tags… — batch tagging arrives with the tag pass',
  renameFrame: 'Rename frame… — frame naming arrives with frame labels',
} as const

/** Build the ordered groups for a right-click on `subject`. Throws (via
 * validateMenu) if the result violates the grammar — a builder bug, not
 * a runtime condition. */
export function menuFor(subject: MenuSubject, actions: MenuActions): MenuGroup[] {
  let groups: MenuGroup[]
  switch (subject.kind) {
    case 'item':
      groups = itemMenu(subject, actions)
      break
    case 'board':
      groups = boardMenu(subject, actions)
      break
    case 'decoration':
      groups = decorationMenu(subject, actions)
      break
    case 'multi':
      groups = multiMenu(subject, actions)
      break
    case 'frame':
      groups = frameMenu(subject, actions)
      break
  }
  validateMenu(groups)
  return groups
}

/** The shipped note-lifecycle rows (§8.4 "note" verb), shared by the
 * item and frame menus so their e2e coverage rides along unchanged. */
function noteRows(hasNote: boolean, a: MenuActions): MenuItem[] {
  return hasNote
    ? [
        { id: 'open-note', label: 'Open note', run: a.openNote, testid: 'node-menu-open-note' },
        {
          id: 'rename-note',
          label: 'Rename note…',
          run: a.renameNote,
          testid: 'node-menu-rename-note',
          keepOpen: true,
        },
        { id: 'detach-note', label: 'Detach note', run: a.detachNote, testid: 'node-menu-detach' },
        {
          id: 'make-note-independent',
          label: 'Make note independent…',
          run: a.makeNoteIndependent,
          testid: 'node-menu-make-independent',
          keepOpen: true,
        },
      ]
    : [
        {
          id: 'attach-new-note',
          label: 'Attach new note…',
          run: a.attachNewNote,
          testid: 'node-menu-attach-new',
          keepOpen: true,
        },
        {
          id: 'attach-existing-note',
          label: 'Attach existing note…',
          run: a.attachExistingNote,
          testid: 'node-menu-attach-existing',
        },
      ]
}

/** The z-order verbs (§6.8), shared by the item and decoration menus. */
function zOrderRows(a: MenuActions): MenuItem[] {
  return [
    { id: 'bring-to-front', label: 'Bring to front', shortcutId: 'board-send-front', run: () => a.reorder('front') },
    { id: 'bring-forward', label: 'Bring forward', shortcutId: 'board-send-forward', run: () => a.reorder('forward') },
    { id: 'send-backward', label: 'Send backward', shortcutId: 'board-send-backward', run: () => a.reorder('backward') },
    { id: 'send-to-back', label: 'Send to back', shortcutId: 'board-send-back', run: () => a.reorder('back') },
  ]
}

function itemMenu(subject: ItemSubject, a: MenuActions): MenuGroup[] {
  // The §8.4 "note" verb surfaces the shipped note-lifecycle rows
  // (open/attach/detach/rename/make-independent), reusing node-menu's
  // testids so their e2e coverage rides along unchanged.
  return [
    {
      id: 'edit',
      items: [
        {
          id: 'crop',
          label: 'Crop',
          // §4.6: crop is an image-appearance verb — a non-destructive
          // display crop on the appearance, never the asset.
          ...(subject.isImage
            ? { run: () => requestCropEditor() }
            : { disabledReason: 'Crop needs an image item' }),
        },
        { id: 'flip-h', label: 'Flip horizontal', shortcutId: 'board-flip-h', run: () => a.flip('x') },
        { id: 'flip-v', label: 'Flip vertical', shortcutId: 'board-flip-v', run: () => a.flip('y') },
        { id: 'appearance', label: 'Appearance…', run: a.openAppearance },
        { id: 'caption', label: subject.hasCaption ? 'Edit caption…' : 'Add caption…', run: a.editCaption },
        ...(subject.hasCaption
          ? [{ id: 'remove-caption', label: 'Remove caption', run: a.removeCaption }]
          : []),
        ...noteRows(subject.hasNote, a),
        { id: 'tags', label: 'Tags…', run: a.openTags },
        {
          id: 'hide-label',
          label: subject.labelVisible ? 'Hide label' : 'Show label',
          run: a.toggleHideLabel,
        },
        {
          id: 'lock',
          label: subject.locked ? 'Unlock' : 'Lock',
          shortcutId: 'board-lock',
          run: a.toggleLock,
        },
      ],
    },
    {
      id: 'replace',
      items: [
        { id: 'replace-image', label: 'Replace image…', disabledReason: COMING_SOON.replaceImage },
        { id: 'swap-for', label: 'Swap for…', disabledReason: COMING_SOON.swapFor },
      ],
    },
    {
      id: 'placement',
      items: [
        {
          id: 'place-on-another-board',
          label: 'Place on another board…',
          disabledReason: COMING_SOON.placeOnAnotherBoard,
        },
        {
          id: 'open-as-board',
          label: 'Open as board',
          shortcutId: 'board-open-as-board',
          run: a.openAsBoard,
        },
        {
          id: 'set-as-backdrop',
          label: 'Set as backdrop',
          ...(subject.isImage
            ? { run: a.setAsBackdrop }
            : { disabledReason: 'Set as backdrop needs an image item' }),
        },
        ...zOrderRows(a),
      ],
    },
    {
      id: 'destructive',
      items: [
        {
          id: 'delete',
          label: 'Delete',
          shortcutId: 'board-delete',
          danger: true,
          run: a.deleteItem,
        },
      ],
    },
  ]
}

function boardMenu(subject: BoardSubject, a: MenuActions): MenuGroup[] {
  const hasBg = subject.hasBackgroundImage
  return [
    {
      // §8.4 (AI-IMP-239): the create verb leads the board menu —
      // frequency-first, the one gesture that seeds a fresh board where
      // the user right-clicked.
      id: 'create',
      items: [{ id: 'new-board', label: 'New board…', run: a.newBoard }],
    },
    {
      id: 'board-actions',
      items: [
        { id: 'paste', label: 'Paste', disabledReason: COMING_SOON.paste },
        { id: 'select-all', label: 'Select all', shortcutId: 'board-select-all', run: a.selectAll },
        {
          id: 'zoom-to-fit',
          label: 'Zoom to fit',
          shortcutId: 'board-zoom-fit',
          run: a.zoomToFit,
        },
      ],
    },
    {
      id: 'backdrop',
      items: [
        {
          id: 'set-backdrop',
          label: hasBg ? 'Replace backdrop…' : 'Set backdrop image…',
          run: a.setBackdropFromFile,
        },
        {
          id: 'edit-backdrop',
          label: 'Edit backdrop position',
          ...(hasBg
            ? { run: a.editBackdropPosition }
            : { disabledReason: 'Edit backdrop position — set a backdrop first' }),
        },
        {
          id: 'reset-backdrop',
          label: 'Reset backdrop',
          ...(hasBg
            ? { run: a.resetBackdrop }
            : { disabledReason: 'Reset backdrop — set a backdrop first' }),
        },
        {
          id: 'remove-backdrop',
          label: 'Remove backdrop',
          ...(hasBg
            ? { run: a.removeBackdrop }
            : { disabledReason: 'Remove backdrop — no backdrop set' }),
        },
      ],
    },
    {
      id: 'color',
      items: [
        {
          id: 'backdrop-color',
          label: 'Backdrop color',
          colorRow: { swatchTokens: BOARD_COLOR_TOKENS, onPick: a.setBackdropColor },
        },
      ],
    },
    {
      id: 'board-note',
      items: [
        { id: 'board-note', label: 'Note for this board', run: a.openBoardNote },
      ],
    },
  ]
}

/**
 * §8.4 decoration menu: edit style — z-order — lock, hide — Delete.
 * NEVER an item verb (no appearance, note, tags, backdrop,
 * open-as-board, flip, crop): a decoration is chrome the user drew,
 * not a placed node, so those verbs are structurally absent — the e2e
 * asserts it.
 */
function decorationMenu(subject: DecorationSubject, a: MenuActions): MenuGroup[] {
  return [
    {
      id: 'style',
      // "Edit style" has no open-command yet — the restyle controls live
      // in the toolbar contextual row while the decoration is selected —
      // so it ships as a disabled-with-reason row (§8.2).
      items: [{ id: 'edit-style', label: 'Edit style', disabledReason: COMING_SOON.editStyle }],
    },
    { id: 'zorder', items: zOrderRows(a) },
    {
      id: 'state',
      items: [
        {
          id: 'lock',
          label: subject.locked ? 'Unlock' : 'Lock',
          shortcutId: 'board-lock',
          run: a.setDecorationLock,
        },
        { id: 'hide', label: 'Hide', run: a.hideDecoration },
      ],
    },
    {
      id: 'destructive',
      items: [
        {
          id: 'delete',
          label: 'Delete',
          shortcutId: 'board-delete',
          danger: true,
          run: a.deleteDecoration,
        },
      ],
    },
  ]
}

/** The §8.4 Align family submenu (family 'align'): the six align verbs
 * plus the two distribute verbs (distribute is not its own submenu
 * family, so it nests inside Align). */
function alignSubmenu(a: MenuActions): MenuItem[] {
  return [
    { id: 'align-left', label: 'Align left', run: () => a.align('left') },
    { id: 'align-hcenter', label: 'Align centers', run: () => a.align('hcenter') },
    { id: 'align-right', label: 'Align right', run: () => a.align('right') },
    { id: 'align-top', label: 'Align top', run: () => a.align('top') },
    { id: 'align-vmiddle', label: 'Align middles', run: () => a.align('vmiddle') },
    { id: 'align-bottom', label: 'Align bottom', run: () => a.align('bottom') },
    { id: 'distribute-h', label: 'Distribute horizontally', run: () => a.distribute('horizontal') },
    { id: 'distribute-v', label: 'Distribute vertically', run: () => a.distribute('vertical') },
  ]
}

/**
 * §8.4 multi-select menu: count header — align/distribute/flips —
 * Gather into a frame · tags · lock all — "Delete N items". Gather is
 * ONE undo group (frame create + capture); tags has no batch command
 * yet (disabled-with-reason).
 */
function multiMenu(subject: MultiSubject, a: MenuActions): MenuGroup[] {
  const n = subject.count
  return [
    {
      id: 'header',
      items: [{ id: 'count', label: `${n} item${n === 1 ? '' : 's'} selected`, header: true }],
    },
    {
      id: 'arrange',
      items: [
        { id: 'align', label: 'Align…', family: 'align', submenu: alignSubmenu(a) },
        { id: 'flip-h', label: 'Flip horizontal', shortcutId: 'board-flip-h', run: () => a.flipAll('x') },
        { id: 'flip-v', label: 'Flip vertical', shortcutId: 'board-flip-v', run: () => a.flipAll('y') },
      ],
    },
    {
      id: 'group',
      items: [
        {
          id: 'gather-into-frame',
          label: 'Gather into a frame',
          // §4.9 frames capture placements only (member_placement_id);
          // a decoration-only selection would make an empty frame, so
          // the row disables-with-reason (§8.2). A mixed selection
          // gathers the placements alone (AI-IMP-154).
          ...(subject.placementCount > 0
            ? { run: a.gatherIntoFrame }
            : { disabledReason: 'Gather into a frame — frames hold items, not decorations' }),
        },
        { id: 'tags', label: 'Tags…', disabledReason: COMING_SOON.multiTags },
        {
          id: 'lock-all',
          label: 'Lock all',
          shortcutId: 'board-lock',
          // Locks the whole selection — placements and decorations
          // alike (AI-IMP-154). Disabled only when nothing lockable is
          // selected (never, in practice, for a multi-selection).
          ...(subject.placementCount + subject.decorationCount > 0
            ? { run: a.lockAll }
            : { disabledReason: 'Lock all — nothing lockable is selected' }),
        },
      ],
    },
    {
      id: 'destructive',
      items: [
        {
          id: 'delete',
          label: `Delete ${n} item${n === 1 ? '' : 's'}`,
          shortcutId: 'board-delete',
          danger: true,
          run: a.deleteSelection,
        },
      ],
    },
  ]
}

/**
 * §8.4 frame menu: the sort family (129's actions) — rename, note,
 * tags, lock — "Delete frame — contents stay". Delete trashes the
 * frame NODE; its members are independent and remain (§9.6), a fact
 * the verb copy states outright.
 */
function frameMenu(subject: FrameSubject, a: MenuActions): MenuGroup[] {
  return [
    {
      id: 'sort',
      items: [
        {
          id: 'frame-sort-on-drop',
          label: `Sort on drop: ${subject.sortOnDrop ? 'On' : 'Off'}`,
          run: a.toggleFrameSortOnDrop,
        },
        { id: 'frame-sort-now', label: 'Sort in frame', run: a.sortFrameNow },
        { id: 'frame-fill', label: 'Fill from library…', run: a.fillFrameFromLibrary },
      ],
    },
    {
      id: 'meta',
      items: [
        { id: 'rename-frame', label: 'Rename frame…', disabledReason: COMING_SOON.renameFrame },
        ...noteRows(subject.hasNote, a),
        { id: 'tags', label: 'Tags…', run: a.openTags },
        {
          id: 'lock',
          label: subject.locked ? 'Unlock' : 'Lock',
          shortcutId: 'board-lock',
          run: a.toggleLock,
        },
      ],
    },
    {
      id: 'destructive',
      items: [
        {
          id: 'delete-frame',
          label: 'Delete frame — contents stay',
          danger: true,
          run: a.deleteFrame,
        },
      ],
    },
  ]
}

/** A structural grammar error — a builder bug surfaced eagerly. */
export class MenuGrammarError extends Error {}

/**
 * Enforce the §8.4 grammar structurally. Called by {@link menuFor} on
 * every build AND directly by the vitest invariants. The rules:
 *  1. no empty groups;
 *  2. every row is in exactly one mode (run · disabledReason · submenu
 *     · colorRow);
 *  3. a `submenu` only on a {@link SUBMENU_FAMILIES} verb, and a
 *     `family` verb must carry a submenu;
 *  4. destructive-last-alone: `danger` rows appear ONLY in the final
 *     group and that group holds nothing but danger rows;
 *  5. never the word "file" in a verb label (§6.5);
 *  6. any `shortcutId` resolves in the keymap registry.
 */
export function validateMenu(groups: MenuGroup[]): void {
  if (groups.length === 0) throw new MenuGrammarError('menu has no groups')

  groups.forEach((group, gi) => {
    if (group.items.length === 0) throw new MenuGrammarError(`group "${group.id}" is empty`)
    const isLastGroup = gi === groups.length - 1
    for (const item of group.items) {
      validateRow(item)
      if (item.danger && !isLastGroup) {
        throw new MenuGrammarError(
          `destructive row "${item.id}" must sit in the final group (destructive-last)`,
        )
      }
    }
  })

  // Destructive-last-ALONE: if the final group has any danger row, it
  // must have ONLY danger rows.
  const last = groups[groups.length - 1]!
  const dangerInLast = last.items.some((i) => i.danger)
  if (dangerInLast && !last.items.every((i) => i.danger)) {
    throw new MenuGrammarError(
      `the destructive group "${last.id}" must contain only destructive rows`,
    )
  }
}

function validateRow(item: MenuItem): void {
  const modes = [
    item.run !== undefined,
    item.disabledReason !== undefined,
    item.submenu !== undefined,
    item.colorRow !== undefined,
    item.header === true,
  ].filter(Boolean).length
  if (modes !== 1) {
    throw new MenuGrammarError(
      `row "${item.id}" must be in exactly one mode (run | disabledReason | submenu | colorRow | header), got ${modes}`,
    )
  }
  if (item.submenu !== undefined) {
    if (item.family === undefined || !SUBMENU_FAMILIES.includes(item.family)) {
      throw new MenuGrammarError(
        `row "${item.id}" nests a submenu but is not one of the ${SUBMENU_FAMILIES.join(' · ')} families`,
      )
    }
    validateMenu([{ id: `${item.id}-submenu`, items: item.submenu }])
  }
  if (item.family !== undefined && item.submenu === undefined) {
    throw new MenuGrammarError(`family row "${item.id}" carries no submenu`)
  }
  if (!item.colorRow && /\bfile\b/i.test(item.label)) {
    throw new MenuGrammarError(`row "${item.id}" says "file" — the app never names files (§6.5)`)
  }
  if (item.shortcutId !== undefined && getBinding(item.shortcutId) === undefined) {
    throw new MenuGrammarError(`row "${item.id}" prints an unregistered shortcut "${item.shortcutId}"`)
  }
}

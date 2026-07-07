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
import type { ReorderOp } from '@ew/canvas-engine'
import { getBinding } from '../keys/registry'

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
 *   specially and exempt from the verb-label rules).
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
  /** Dynamic disabled state for an otherwise-actionable row is modeled
   * by choosing `run` vs `disabledReason` at build time; there is no
   * separate enabled flag — the mode says it all. */
}

export interface MenuGroup {
  id: string
  items: MenuItem[]
}

export type MenuKind = 'item' | 'board'

/** The item subject: the right-clicked placement's live state. */
export interface ItemSubject {
  kind: 'item'
  hasNote: boolean
  locked: boolean
  labelVisible: boolean
  /** Whether the node backs an image appearance (set-as-backdrop gate). */
  isImage: boolean
}

/** The board subject: the active canvas's backdrop state. */
export interface BoardSubject {
  kind: 'board'
  hasBackgroundImage: boolean
  hasColor: boolean
}

export type MenuSubject = ItemSubject | BoardSubject

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
  selectAll(): void
  zoomToFit(): void
  setBackdropFromFile(): void
  editBackdropPosition(): void
  resetBackdrop(): void
  removeBackdrop(): void
  setBackdropColor(colorOrToken: string | null): void
  openBoardNote(): void
}

const COMING_SOON = {
  // §6.5 shipped as commands NOWHERE yet — coming-soon rows, listed in
  // the ticket's Issues Encountered. Copy follows the §8.2 tooltip
  // grammar and never says "file".
  replaceImage: 'Replace image… — arrives with the swap/replace pass',
  swapFor: 'Swap for… — arrives with the swap/replace pass',
  placeOnAnotherBoard: 'Place on another board… — arrives with the board picker',
  paste: 'Paste — press ⌘V to paste an image for now',
} as const

/** Build the ordered groups for a right-click on `subject`. Throws (via
 * validateMenu) if the result violates the grammar — a builder bug, not
 * a runtime condition. */
export function menuFor(subject: MenuSubject, actions: MenuActions): MenuGroup[] {
  const groups = subject.kind === 'item' ? itemMenu(subject, actions) : boardMenu(subject, actions)
  validateMenu(groups)
  return groups
}

function itemMenu(subject: ItemSubject, a: MenuActions): MenuGroup[] {
  // The §8.4 "note" verb surfaces the shipped note-lifecycle rows
  // (open/attach/detach/rename/make-independent), reusing node-menu's
  // testids so their e2e coverage rides along unchanged.
  const noteRows: MenuItem[] = subject.hasNote
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

  return [
    {
      id: 'edit',
      items: [
        { id: 'crop', label: 'Crop', disabledReason: 'Crop — the crop editor arrives later' },
        { id: 'flip-h', label: 'Flip horizontal', shortcutId: 'board-flip-h', run: () => a.flip('x') },
        { id: 'flip-v', label: 'Flip vertical', shortcutId: 'board-flip-v', run: () => a.flip('y') },
        { id: 'appearance', label: 'Appearance…', run: a.openAppearance },
        ...noteRows,
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
        {
          id: 'bring-to-front',
          label: 'Bring to front',
          shortcutId: 'board-send-front',
          run: () => a.reorder('front'),
        },
        {
          id: 'bring-forward',
          label: 'Bring forward',
          shortcutId: 'board-send-forward',
          run: () => a.reorder('forward'),
        },
        {
          id: 'send-backward',
          label: 'Send backward',
          shortcutId: 'board-send-backward',
          run: () => a.reorder('backward'),
        },
        {
          id: 'send-to-back',
          label: 'Send to back',
          shortcutId: 'board-send-back',
          run: () => a.reorder('back'),
        },
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
  ].filter(Boolean).length
  if (modes !== 1) {
    throw new MenuGrammarError(
      `row "${item.id}" must be in exactly one mode (run | disabledReason | submenu | colorRow), got ${modes}`,
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

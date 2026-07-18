/**
 * The outliner's one verb inventory (Outliner Grammar §7).
 *
 * This module deliberately knows nothing about commands, the project port, or
 * Svelte.  A view supplies callbacks that already route the shipped verbs and
 * all three doors consume the resulting descriptors.  Keeping unavailable
 * offers in the bag with a reason is important: a disabled verb remains
 * visible and teachable instead of silently disappearing from one door.
 */

export type OutlineVerbId =
  | 'dive'
  | 'place'
  | 'pull'
  | 'fly-to'
  | 'open-note'
  | 'add-note'
  | 'tag'
  | 'trash'

export type OutlineVerbGroup = 'primary' | 'note-and-tag' | 'danger'

export type OutlineActionOffer =
  | { run: () => void; disabledReason?: never }
  | { run?: never; disabledReason: string }

/**
 * Callbacks for the selected row. Missing properties mean that the verb does
 * not belong to this row kind; disabled properties mean that it does belong
 * but cannot currently run. Boards normally offer `dive`, ordinary nodes
 * `place`, and a row offers at most one of `openNote` / `addNote`.
 */
export interface OutlineActionBag {
  dive?: OutlineActionOffer
  place?: OutlineActionOffer
  /** Gallery Everything-scope twin of place; already-shipped ingest+carry verb. */
  pull?: OutlineActionOffer
  flyTo?: OutlineActionOffer
  openNote?: OutlineActionOffer
  addNote?: OutlineActionOffer
  tag?: OutlineActionOffer
  trash?: OutlineActionOffer
}
export interface OutlineVerb {
  id: OutlineVerbId
  label: string
  shortcut: string
  group: OutlineVerbGroup
  danger: boolean
  run?: () => void
  disabledReason?: string
}

interface VerbSpec {
  id: OutlineVerbId
  offer: keyof OutlineActionBag
  label: string
  shortcut: string
  group: OutlineVerbGroup
  danger?: boolean
}

/** Canonical order; destructive is last and alone in its group. */
const VERB_SPECS: readonly VerbSpec[] = [
  { id: 'dive', offer: 'dive', label: 'dive in', shortcut: '↵', group: 'primary' },
  { id: 'place', offer: 'place', label: 'place on board', shortcut: '␣', group: 'primary' },
  { id: 'pull', offer: 'pull', label: 'pull into this world', shortcut: '␣', group: 'primary' },
  { id: 'fly-to', offer: 'flyTo', label: 'fly to place', shortcut: '⌥↵', group: 'primary' },
  { id: 'open-note', offer: 'openNote', label: 'open note', shortcut: 'N', group: 'note-and-tag' },
  { id: 'add-note', offer: 'addNote', label: 'add a note…', shortcut: 'N', group: 'note-and-tag' },
  { id: 'tag', offer: 'tag', label: 'tag…', shortcut: '#', group: 'note-and-tag' },
  {
    id: 'trash',
    offer: 'trash',
    label: 'move to trash',
    shortcut: 'Delete',
    group: 'danger',
    danger: true,
  },
]

export function enabled(run: () => void): OutlineActionOffer {
  return { run }
}

export function disabled(disabledReason: string): OutlineActionOffer {
  if (disabledReason.trim() === '') throw new Error('outline action: disabled reason must be visible')
  return { disabledReason }
}

/** Build the immutable ordered inventory consumed by every door. */
export function buildOutlineInventory(bag: OutlineActionBag): readonly OutlineVerb[] {
  if ([bag.dive, bag.place, bag.pull].filter(Boolean).length > 1) {
    throw new Error('outline action: a row cannot lead with more than one primary movement verb')
  }
  if (bag.openNote && bag.addNote) {
    throw new Error('outline action: a row cannot offer both open-note and add-note')
  }

  return VERB_SPECS.flatMap((spec): OutlineVerb[] => {
    const offer = bag[spec.offer]
    if (!offer) return []
    return [
      {
        id: spec.id,
        label: spec.label,
        shortcut: spec.shortcut,
        group: spec.group,
        danger: spec.danger ?? false,
        ...offer,
      },
    ]
  })
}

import { enabled, type OutlineActionBag } from '../outline/actions'

export interface GalleryContextFacts {
  scope: 'this-world' | 'everything'
  count: number
  kind: 'image' | 'note' | 'board' | null
  hasChildCanvas: boolean
  hasNote: boolean
  placementCount: number
}

export interface GalleryContextCallbacks {
  dive(): void
  place(): void
  pull(): void
  flyTo(): void
  openNote(): void
  addNote(): void
  tag(): void
  trash(): void
}

/** Gallery's filtered projection of the one ruled verb inventory. */
export function buildGalleryActionBag(
  facts: GalleryContextFacts,
  actions: GalleryContextCallbacks,
): OutlineActionBag {
  const bag: OutlineActionBag = {}
  // Single-item facts require a hydrated kind. Unknown is not equivalent
  // to a note-less ordinary node; callers must fail closed.
  if (facts.count === 1 && facts.kind === null) return bag
  if (facts.scope === 'everything') {
    if (facts.count === 1 && facts.kind === 'image') bag.pull = enabled(actions.pull)
    return bag
  }

  if (facts.count === 1) {
    if (facts.hasChildCanvas) bag.dive = enabled(actions.dive)
    else bag.place = enabled(actions.place)
    if (facts.placementCount > 0) bag.flyTo = enabled(actions.flyTo)
    if (facts.hasNote) bag.openNote = enabled(actions.openNote)
    else bag.addNote = enabled(actions.addNote)
  } else if (facts.count > 1) {
    bag.place = enabled(actions.place)
  }
  if (facts.count > 0) {
    bag.tag = enabled(actions.tag)
    bag.trash = enabled(actions.trash)
  }
  return bag
}

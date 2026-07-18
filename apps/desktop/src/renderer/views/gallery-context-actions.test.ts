import { describe, expect, it } from 'vitest'
import { buildOutlineInventory } from '../outline/actions'
import { buildGalleryActionBag, type GalleryContextCallbacks } from './gallery-context-actions'

const noop: GalleryContextCallbacks = {
  dive() {}, place() {}, pull() {}, flyTo() {}, openNote() {}, addNote() {}, tag() {}, trash() {},
}

function ids(input: Parameters<typeof buildGalleryActionBag>[0]) {
  return buildOutlineInventory(buildGalleryActionBag(input, noop)).map((verb) => verb.id)
}

describe('gallery projection of the shared verb inventory', () => {
  it('uses verbatim Outliner note labels and omits inapplicable geometry', () => {
    const bag = buildGalleryActionBag(
      {
        scope: 'this-world', count: 1, kind: 'image', hasChildCanvas: false,
        hasNote: false, placementCount: 1,
      },
      noop,
    )
    const inventory = buildOutlineInventory(bag)
    expect(inventory.map((verb) => verb.id)).toEqual([
      'place', 'fly-to', 'add-note', 'tag', 'trash',
    ])
    expect(inventory.find((verb) => verb.id === 'add-note')?.label).toBe('add a note…')
  })

  it('dives boards, opens noted cells, and keeps absent verbs absent', () => {
    expect(ids({
      scope: 'this-world', count: 1, kind: 'board', hasChildCanvas: true,
      hasNote: true, placementCount: 0,
    })).toEqual(['dive', 'open-note', 'tag', 'trash'])
  })

  it('limits multi-selection to the meaningful bulk verbs', () => {
    expect(ids({
      scope: 'this-world', count: 3, kind: null, hasChildCanvas: false,
      hasNote: false, placementCount: 0,
    })).toEqual(['place', 'tag', 'trash'])
  })

  it('offers only the existing pull action in Everything and never a foreign fly', () => {
    expect(ids({
      scope: 'everything', count: 1, kind: 'image', hasChildCanvas: false,
      hasNote: false, placementCount: 0,
    })).toEqual(['pull'])
    expect(ids({
      scope: 'everything', count: 1, kind: 'note', hasChildCanvas: false,
      hasNote: true, placementCount: 2,
    })).toEqual([])
  })

  it('fails closed when a single target was not hydrated', () => {
    expect(ids({
      scope: 'this-world', count: 1, kind: null, hasChildCanvas: false,
      hasNote: false, placementCount: 0,
    })).toEqual([])
  })
})

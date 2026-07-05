import { Graphics, Sprite, type Container, type Text } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { fakeResources, makePlacement } from '../test-helpers'
import {
  DEFAULT_DOT_RADIUS,
  LABEL_HEIGHT_RATIO,
  cssColorToNumber,
  placementRenderer,
  setPlacementTextureResident,
} from './placement'
import { Texture } from 'pixi.js'
import type { RendererResources } from './registry'

/** Recording texture budget: resolves acquires on demand. */
function fakeBudget() {
  const acquired: string[] = []
  const released: string[] = []
  const pending: Array<() => void> = []
  const resources: RendererResources & {
    acquired: string[]
    released: string[]
    flush: () => void
  } = {
    acquired,
    released,
    flush: () => {
      for (const resolve of pending.splice(0)) resolve()
    },
    loadTexture: () => Promise.resolve(Texture.WHITE),
    textures: {
      acquire(hash: string) {
        acquired.push(hash)
        return new Promise((resolve) => pending.push(() => resolve(Texture.WHITE)))
      },
      release(hash: string) {
        released.push(hash)
      },
    },
  }
  return resources
}

async function settled(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('cssColorToNumber', () => {
  it('parses #rrggbb, #rgb, and falls back on garbage', () => {
    expect(cssColorToNumber('#ff8000')).toBe(0xff8000)
    expect(cssColorToNumber('#f80')).toBe(0xff8800)
    expect(cssColorToNumber(null)).toBe(0x4a90d9)
    expect(cssColorToNumber('teal-ish')).toBe(0x4a90d9)
  })
})

describe('placementRenderer', () => {
  it('renders a colored dot centered at the placement position', () => {
    const item = makePlacement({
      appearanceKind: 'dot',
      appearanceColor: '#ff0000',
      x: 40,
      y: -8,
    })
    const object = placementRenderer.create(item, fakeResources())
    expect(object.position).toMatchObject({ x: 40, y: -8 })
    const dot = object.children[0] as Graphics
    expect(dot.label).toBe('dot')
    expect(dot.getBounds().width).toBeCloseTo(DEFAULT_DOT_RADIUS * 2)
  })

  it('applies scale, rotation, and flip as scale sign', () => {
    const item = makePlacement({ scale: 2, rotation: Math.PI / 2, flipX: 1 })
    const object = placementRenderer.create(item, fakeResources())
    expect(object.scale.x).toBe(-2)
    expect(object.scale.y).toBe(2)
    expect(object.rotation).toBeCloseTo(Math.PI / 2)
  })

  it('shows a placeholder then swaps in the loaded image texture', async () => {
    const resources = fakeResources()
    const item = makePlacement({
      appearanceKind: 'image',
      assetContentHash: 'c'.repeat(64),
      assetWidth: 200,
      assetHeight: 100,
    })
    const object = placementRenderer.create(item, resources)
    expect(object.children[0]!.label).toBe('image-placeholder')
    expect(resources.requested).toEqual([`ew-asset://${'c'.repeat(64)}`])
    await settled()
    const sprite = object.children[0] as Sprite
    expect(sprite.label).toBe('image')
    expect(sprite.width).toBe(200)
    expect(sprite.height).toBe(100)
  })

  it('honors explicit placement dimensions over natural asset size', async () => {
    const resources = fakeResources()
    const item = makePlacement({
      appearanceKind: 'image',
      assetContentHash: 'd'.repeat(64),
      assetWidth: 200,
      assetHeight: 100,
      width: 50,
      height: 25,
    })
    const object = placementRenderer.create(item, resources)
    await settled()
    const sprite = object.children[0] as Sprite
    expect(sprite.width).toBe(50)
    expect(sprite.height).toBe(25)
  })

  it('discards a stale texture load after the appearance changes', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const resources = {
      loadTexture: async (url: string) => {
        if (url.includes('e'.repeat(64))) await gate
        const { Texture } = await import('pixi.js')
        return Texture.WHITE
      },
    }
    const image = makePlacement({
      appearanceKind: 'image',
      assetContentHash: 'e'.repeat(64),
    })
    const object = placementRenderer.create(image, resources)
    const swapped = { ...image, appearanceKind: 'dot' as const, assetContentHash: null }
    placementRenderer.update(object, swapped, image, resources)
    release()
    await settled()
    await settled()
    expect(object.children).toHaveLength(1)
    expect(object.children[0]!.label).toBe('dot')
  })

  it('renders an outline stub for appearance-less nodes', () => {
    const object = placementRenderer.create(makePlacement(), fakeResources())
    expect(object.children[0]!.label).toBe('bare-node')
  })
})

describe('texture residency across updates (AI-IMP-025)', () => {
  const HASH_A = 'a'.repeat(64)
  const HASH_B = 'b'.repeat(64)
  const image = (overrides = {}) =>
    makePlacement({
      appearanceKind: 'image',
      assetContentHash: HASH_A,
      assetWidth: 200,
      assetHeight: 100,
      width: 200,
      height: 100,
      ...overrides,
    })

  it('resizes a resident image in place — texture survives, no release', async () => {
    const resources = fakeBudget()
    const item = image()
    const object = placementRenderer.create(item, resources)
    setPlacementTextureResident(object, item, resources, true)
    resources.flush()
    await settled()
    expect(object.getChildByLabel('image')).toBeTruthy()

    // Ephemeral resize frames and the committed update: no rebuild.
    let prev = item
    for (const [w, h] of [
      [220, 110],
      [260, 130],
      [300, 150],
    ] as const) {
      const next = { ...prev, width: w, height: h }
      placementRenderer.update(object, next, prev, resources)
      prev = next
    }
    const sprite = object.getChildByLabel('image') as Sprite
    expect(sprite).toBeTruthy()
    expect(object.getChildByLabel('image-placeholder')).toBeFalsy()
    expect(sprite.width).toBeCloseTo(300)
    expect(sprite.height).toBeCloseTo(150)
    expect(resources.acquired).toEqual([HASH_A])
    expect(resources.released).toEqual([])
  })

  it('re-acquires after an identity rebuild while resident (culler will not re-grant)', async () => {
    const resources = fakeBudget()
    const item = image()
    const object = placementRenderer.create(item, resources)
    setPlacementTextureResident(object, item, resources, true)
    resources.flush()
    await settled()

    // Swap the asset: identity change → rebuild while resident.
    const swapped = image({ assetContentHash: HASH_B })
    placementRenderer.update(object, swapped, item, resources)
    expect(resources.released).toEqual([HASH_A])
    expect(resources.acquired).toEqual([HASH_A, HASH_B])
    resources.flush()
    await settled()
    expect(object.getChildByLabel('image')).toBeTruthy()
    expect(object.getChildByLabel('image-placeholder')).toBeFalsy()
  })

  it('rebuild with an acquire in flight: stale landing releases, new one attaches', async () => {
    const resources = fakeBudget()
    const item = image()
    const object = placementRenderer.create(item, resources)
    setPlacementTextureResident(object, item, resources, true)
    // No flush: HASH_A is still loading when the identity changes.
    const swapped = image({ assetContentHash: HASH_B })
    placementRenderer.update(object, swapped, item, resources)
    resources.flush() // both loads land now
    await settled()
    // Stale A returned its ref; B attached and is the only live grant.
    expect(resources.acquired).toEqual([HASH_A, HASH_B])
    expect(resources.released).toEqual([HASH_A])
    expect(object.getChildByLabel('image')).toBeTruthy()
  })

  it('non-resident images stay placeholders through resizes (lazy §12.2)', () => {
    const resources = fakeBudget()
    const item = image()
    const object = placementRenderer.create(item, resources)
    const resized = { ...item, width: 400, height: 200 }
    placementRenderer.update(object, resized, item, resources)
    const placeholder = object.getChildByLabel('image-placeholder') as Graphics
    expect(placeholder).toBeTruthy()
    expect(placeholder.width).toBeCloseTo(400)
    expect(resources.acquired).toEqual([])
  })
})

function labelOf(object: Container): Text | undefined {
  return object.children.find((child) => child.label === 'label') as Text | undefined
}

describe('placement labels (§4.5)', () => {
  it('shows the note title under the body when visible', () => {
    const item = makePlacement({ noteTitle: 'Harbor', width: 100, height: 50, labelVisible: 1 })
    const object = placementRenderer.create(item, fakeResources())
    const label = labelOf(object)!
    expect(label.text).toBe('Harbor')
    // Proportional to the placement's world height, never screen-space.
    expect(label.style.fontSize).toBeCloseTo(50 * LABEL_HEIGHT_RATIO)
    expect(label.position.y).toBeGreaterThan(25) // hangs below the body
  })

  it('no note means no label; hidden label means no Text child', () => {
    const noNote = placementRenderer.create(
      makePlacement({ noteTitle: null, labelVisible: 1 }),
      fakeResources(),
    )
    expect(labelOf(noNote)).toBeUndefined()
    const hidden = placementRenderer.create(
      makePlacement({ noteTitle: 'Harbor', labelVisible: 0 }),
      fakeResources(),
    )
    expect(labelOf(hidden)).toBeUndefined()
  })

  it('updates text on rename and size on resize through the update path', () => {
    const resources = fakeResources()
    const item = makePlacement({ noteTitle: 'Old', width: 100, height: 50 })
    const object = placementRenderer.create(item, resources)
    const renamed = { ...item, noteTitle: 'New' }
    placementRenderer.update(object, renamed, item, resources)
    expect(labelOf(object)!.text).toBe('New')
    // Resize reflows the label in place (bodies no longer rebuild on
    // size changes — AI-IMP-025).
    const resized = { ...renamed, width: 200, height: 100 }
    placementRenderer.update(object, resized, renamed, resources)
    expect(labelOf(object)!.style.fontSize).toBeCloseTo(100 * LABEL_HEIGHT_RATIO)
    expect(labelOf(object)!.text).toBe('New')
  })

  it('toggling visibility removes and restores the label', () => {
    const resources = fakeResources()
    const item = makePlacement({ noteTitle: 'Harbor', width: 40, height: 40 })
    const object = placementRenderer.create(item, resources)
    const off = { ...item, labelVisible: 0 as const }
    placementRenderer.update(object, off, item, resources)
    expect(labelOf(object)).toBeUndefined()
    placementRenderer.update(object, item, off, resources)
    expect(labelOf(object)!.text).toBe('Harbor')
  })

  it('counter-flips so text stays readable when the placement is flipped', () => {
    const item = makePlacement({ noteTitle: 'Harbor', width: 40, height: 40, flipX: 1 })
    const object = placementRenderer.create(item, fakeResources())
    // Container mirrors (scale −1); the label mirrors back (scale −1 → net +1).
    expect(object.scale.x).toBe(-1)
    expect(labelOf(object)!.scale.x).toBe(-1)
  })

  it('sizes dot labels from the dot diameter when height is null', () => {
    const item = makePlacement({
      noteTitle: 'Dot',
      appearanceKind: 'dot',
      width: 40,
      height: null,
    })
    const object = placementRenderer.create(item, fakeResources())
    expect(labelOf(object)!.style.fontSize).toBeCloseTo(40 * LABEL_HEIGHT_RATIO)
  })
})

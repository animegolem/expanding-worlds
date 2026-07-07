import { Graphics, Sprite, type Container, type Text } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { fakeResources, makePlacement } from '../test-helpers'
import { itemWorldAABB } from '../hit-test'
import {
  CARD_DEFAULT_HEIGHT,
  CARD_DEFAULT_WIDTH,
  DEFAULT_DOT_RADIUS,
  LABEL_CLEARANCE_PX,
  LABEL_HEIGHT_RATIO,
  LABEL_OUTLINE_GAP_PX,
  SELECTION_OUTLINE_PAD_PX,
  SELECTION_OUTLINE_STROKE_PX,
  cssColorToNumber,
  placementRenderer,
  setPlacementTextureResident,
  syncPlacementLabelOffset,
} from './placement'
import { Rectangle, Texture } from 'pixi.js'
import type { IconAtlasResource, RendererResources } from './registry'
import { syncPlacementIconLod } from './placement'
import { EW_FURNITURE_MIN_PX } from '../shrink-ladder'

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

describe('label / selection-outline clearance (AI-IMP-087)', () => {
  function resourcesAtZoom(zoom: number): RendererResources {
    return { ...fakeResources(), getZoom: () => zoom }
  }

  it('offsets the label by a screen-space clearance that scales with 1/zoom', () => {
    const item = makePlacement({ noteTitle: 'Harbor', width: 100, height: 50 })
    for (const zoom of [0.5, 1, 2, 4]) {
      const object = placementRenderer.create(item, resourcesAtZoom(zoom))
      // Local units: body half-height + clearance / (zoom × scale).
      expect(labelOf(object)!.position.y).toBeCloseTo(25 + LABEL_CLEARANCE_PX / zoom)
    }
  })

  it('divides out the container scale so the clearance stays screen-constant', () => {
    const item = makePlacement({ noteTitle: 'Harbor', width: 100, height: 50, scale: 2 })
    const object = placementRenderer.create(item, resourcesAtZoom(1))
    // Local offset × scale 2 must land at h/2×2 + CLEARANCE in world.
    expect(labelOf(object)!.position.y).toBeCloseTo(25 + LABEL_CLEARANCE_PX / 2)
  })

  it('never lets the label rect intersect the outline rect at zooms 0.5/1/2/4', () => {
    const item = makePlacement({
      noteTitle: 'The Gang',
      width: 200,
      height: 120,
      x: 300,
      y: 300,
    })
    const aabb = itemWorldAABB(item)!
    for (const zoom of [0.5, 1, 2, 4]) {
      const object = placementRenderer.create(item, resourcesAtZoom(zoom))
      const label = labelOf(object)!
      // World y of the label's top edge (anchor is top-center and the
      // container is unrotated at scale 1: world = center + local).
      const labelTopWorld = item.y + label.position.y
      // The outline's outer reach beyond the body edge in world units:
      // the screen-constant pad + stroke divided by zoom (§6.9).
      const outlineOuterWorld =
        aabb.y +
        aabb.height +
        (SELECTION_OUTLINE_PAD_PX + SELECTION_OUTLINE_STROKE_PX) / zoom
      expect(labelTopWorld).toBeGreaterThan(outlineOuterWorld)
      // And the gap between them is exactly the breathing gap on screen.
      expect((labelTopWorld - outlineOuterWorld) * zoom).toBeCloseTo(LABEL_OUTLINE_GAP_PX)
    }
  })

  it('syncPlacementLabelOffset repositions an existing label for a new zoom', () => {
    const item = makePlacement({ noteTitle: 'Harbor', width: 100, height: 50 })
    const object = placementRenderer.create(item, resourcesAtZoom(1))
    syncPlacementLabelOffset(object, item, 4)
    expect(labelOf(object)!.position.y).toBeCloseTo(25 + LABEL_CLEARANCE_PX / 4)
    // No label (hidden): a no-op, never a crash.
    const hidden = placementRenderer.create(
      makePlacement({ noteTitle: 'Harbor', labelVisible: 0 }),
      resourcesAtZoom(1),
    )
    expect(() => syncPlacementLabelOffset(hidden, item, 2)).not.toThrow()
  })

  it('keeps the clearance below the body under flipY (offset negated, not lost)', () => {
    const item = makePlacement({ noteTitle: 'Harbor', width: 100, height: 50, flipY: 1 })
    const object = placementRenderer.create(item, resourcesAtZoom(2))
    // Container scale.y is −1, so the negated local offset maps back
    // below the body in world space with the same clearance.
    expect(labelOf(object)!.position.y).toBeCloseTo(-(25 + LABEL_CLEARANCE_PX / 2))
    expect(labelOf(object)!.scale.y).toBe(-1)
  })
})

describe('frame appearance (§4.9, AI-IMP-127)', () => {
  const THEME = { fill: 0x010203, border: 0x040506, label: 0x070809 }
  function frameResources() {
    let calls = 0
    const resources: RendererResources & { calls: () => number } = {
      ...fakeResources(),
      calls: () => calls,
      frameColors: () => {
        calls += 1
        return THEME
      },
    }
    return resources
  }
  function styleColor(gfx: Graphics, action: 'fill' | 'stroke'): number | undefined {
    const instruction = gfx.context.instructions.find((i) => i.action === action)
    return instruction && 'style' in instruction.data
      ? (instruction.data.style.color as number)
      : undefined
  }

  it('draws the region centered, sized from placement geometry', () => {
    const item = makePlacement({ appearanceKind: 'frame', width: 300, height: 200, x: 12, y: -4 })
    const object = placementRenderer.create(item, frameResources())
    expect(object.position).toMatchObject({ x: 12, y: -4 })
    const region = object.children[0] as Graphics
    expect(region.label).toBe('frame')
    // Local body reaches half-width/height about the origin (stroke may
    // add a hairline beyond the geometry edge).
    const bounds = region.getLocalBounds()
    expect(bounds.width).toBeGreaterThanOrEqual(300)
    expect(bounds.width).toBeLessThan(305)
    expect(bounds.height).toBeGreaterThanOrEqual(200)
    expect(bounds.height).toBeLessThan(205)
    expect(bounds.x).toBeLessThanOrEqual(-150)
  })

  it('sources fill + border from the theme channel — no baked hex (guard)', () => {
    const resources = frameResources()
    const item = makePlacement({ appearanceKind: 'frame', width: 120, height: 90 })
    const region = placementRenderer.create(item, resources).children[0] as Graphics
    expect(resources.calls()).toBeGreaterThan(0)
    expect(styleColor(region, 'fill')).toBe(THEME.fill)
    expect(styleColor(region, 'stroke')).toBe(THEME.border)
  })

  it('redraws at the new size through the update path', () => {
    const resources = frameResources()
    const item = makePlacement({ appearanceKind: 'frame', width: 120, height: 90 })
    const object = placementRenderer.create(item, resources)
    const resized = { ...item, width: 260, height: 40 }
    placementRenderer.update(object, resized, item, resources)
    const region = object.children[0] as Graphics
    expect(region.getLocalBounds().width).toBeGreaterThanOrEqual(260)
    expect(region.getLocalBounds().width).toBeLessThan(265)
    expect(region.getLocalBounds().height).toBeGreaterThanOrEqual(40)
    expect(region.getLocalBounds().height).toBeLessThan(45)
  })
})

describe('card appearance (§4.6 rev 0.31, AI-IMP-084)', () => {
  function cardGroup(object: Container): Container {
    const group = object.children.find((child) => child.label === 'card') as Container
    expect(group).toBeTruthy()
    return group
  }

  it('renders fixed chrome with title and excerpt, scaled onto the placement rect', () => {
    const item = makePlacement({
      appearanceKind: 'card',
      noteId: 'note-1',
      noteTitle: 'Harbor Study',
      noteExcerpt: 'stone quay\nand   gulls',
      width: 520,
      height: 320,
      x: 10,
      y: 20,
    })
    const object = placementRenderer.create(item, fakeResources())
    expect(object.position).toMatchObject({ x: 10, y: 20 })
    const group = cardGroup(object)
    // Fixed design layout, group-scaled onto the rect (resize
    // stretches like an image; layout constants never move).
    expect(group.scale.x).toBeCloseTo(520 / CARD_DEFAULT_WIDTH)
    expect(group.scale.y).toBeCloseTo(320 / CARD_DEFAULT_HEIGHT)
    expect(group.getChildByLabel('card-chrome')).toBeTruthy()
    const title = group.getChildByLabel('card-title') as Text
    expect(title.text).toBe('Harbor Study')
    const excerpt = group.getChildByLabel('card-excerpt') as Text
    // Whitespace collapses so a newline-heavy body cannot overflow
    // the fixed chrome (plain-text clamp).
    expect(excerpt.text).toBe('stone quay and gulls')
    // §7.1 editor carve-out (AI-IMP-131): card note text bakes in Maple.
    expect(String(title.style.fontFamily)).toContain('Maple Mono')
    expect(String(excerpt.style.fontFamily)).toContain('Maple Mono')
    // The chrome's title line IS the label — no duplicate under-label.
    expect(object.children.find((child) => child.label === 'label')).toBeUndefined()
  })

  it('clamps long titles to one deterministic line', () => {
    const item = makePlacement({
      appearanceKind: 'card',
      noteId: 'note-1',
      noteTitle: 'A very long meandering harbor study title indeed',
      noteExcerpt: 'body',
      width: 260,
      height: 160,
    })
    const object = placementRenderer.create(item, fakeResources())
    const title = cardGroup(object).getChildByLabel('card-title') as Text
    expect(title.text.length).toBeLessThanOrEqual(28)
    expect(title.text.endsWith('…')).toBe(true)
  })

  it('renders the empty phantom card for a card node with no note (§7.2)', () => {
    const item = makePlacement({
      appearanceKind: 'card',
      noteId: null,
      noteTitle: null,
      width: 260,
      height: 160,
    })
    const object = placementRenderer.create(item, fakeResources())
    const group = cardGroup(object)
    expect(group.getChildByLabel('card-chrome-phantom')).toBeTruthy()
    expect(group.getChildByLabel('card-title')).toBeNull()
    expect(group.getChildByLabel('card-excerpt')).toBeNull()
  })

  it('repaints when a note edit flows new title/excerpt through the projection', () => {
    const resources = fakeResources()
    const before = makePlacement({
      appearanceKind: 'card',
      noteId: 'n',
      noteTitle: 'Harbor',
      noteExcerpt: 'old text',
      width: 260,
      height: 160,
    })
    const object = placementRenderer.create(before, resources)
    const after = { ...before, noteTitle: 'Harbor II', noteExcerpt: 'new text' }
    placementRenderer.update(object, after, before, resources)
    const group = cardGroup(object)
    expect((group.getChildByLabel('card-title') as Text).text).toBe('Harbor II')
    expect((group.getChildByLabel('card-excerpt') as Text).text).toBe('new text')
    // First committed edit fills a phantom card (§7.2): noteId lands.
    const phantom = makePlacement({ appearanceKind: 'card', noteId: null, noteTitle: null })
    const phantomObject = placementRenderer.create(phantom, resources)
    const filled = { ...phantom, noteId: 'n2', noteTitle: 'Born', noteExcerpt: 'first words' }
    placementRenderer.update(phantomObject, filled, phantom, resources)
    expect(
      (cardGroup(phantomObject).getChildByLabel('card-title') as Text).text,
    ).toBe('Born')
  })

  it('resizes in place by rescaling the fixed chrome', () => {
    const resources = fakeResources()
    const item = makePlacement({
      appearanceKind: 'card',
      noteId: 'n',
      noteTitle: 'Harbor',
      noteExcerpt: 'quay',
      width: 260,
      height: 160,
    })
    const object = placementRenderer.create(item, resources)
    const group = cardGroup(object)
    const titleBefore = group.getChildByLabel('card-title')
    const resized = { ...item, width: 130, height: 320 }
    placementRenderer.update(object, resized, item, resources)
    expect(group.scale.x).toBeCloseTo(0.5)
    expect(group.scale.y).toBeCloseTo(2)
    // Same display objects — no Text rebuild on resize.
    expect(group.getChildByLabel('card-title')).toBe(titleBefore)
  })
})

/** Fake atlas: three distinct tier textures (sharing one source, like
 * the real atlas) so tier selection is observable, plus a fixed dot
 * colour per icon. */
function fakeIconAtlas(): RendererResources & { atlas: IconAtlasResource } {
  const tiers = [128, 64, 32]
  const frames = new Map<string, Texture[]>([
    [
      'star',
      tiers.map((t) => new Texture({ source: Texture.WHITE.source, frame: new Rectangle(0, 0, t, t) })),
    ],
  ])
  const atlas: IconAtlasResource = {
    tiers,
    frames: (id) => frames.get(id) ?? null,
    dotColor: () => 0xe8c450,
  }
  let zoom = 1
  const resources: RendererResources & { atlas: IconAtlasResource; setZoom: (z: number) => void } = {
    atlas,
    setZoom: (z) => (zoom = z),
    loadTexture: () => Promise.resolve(Texture.WHITE),
    iconAtlas: atlas,
    getZoom: () => zoom,
  }
  return resources
}

describe('§8.2 object-icon atlas', () => {
  it('renders the atlas sprite + a hidden dot for an icon node, above the threshold', () => {
    const resources = fakeIconAtlas()
    const item = makePlacement({ appearanceKind: 'icon', appearanceIcon: 'star', width: 24 })
    const object = placementRenderer.create(item, resources)
    const sprite = object.getChildByLabel('icon-object') as Sprite
    const dot = object.getChildByLabel('icon-dot') as Graphics
    expect(sprite).toBeTruthy()
    expect(dot).toBeTruthy()
    // rendered = 24 × zoom 1 × scale 1 = 24 ≥ 8 → object shows, dot hides.
    expect(sprite.visible).toBe(true)
    expect(dot.visible).toBe(false)
    // The sprite is pinned to the body world size, not the tier px.
    expect(sprite.width).toBeCloseTo(24)
  })

  it('degrades to the dot below the furniture threshold, in the icon colour', () => {
    const resources = fakeIconAtlas()
    const item = makePlacement({ appearanceKind: 'icon', appearanceIcon: 'star', width: 24 })
    const object = placementRenderer.create(item, resources)
    // 24 × 0.2 = 4.8 < EW_FURNITURE_MIN_PX → dot only.
    syncPlacementIconLod(object, item, 0.2, resources)
    expect((object.getChildByLabel('icon-object') as Sprite).visible).toBe(false)
    expect((object.getChildByLabel('icon-dot') as Graphics).visible).toBe(true)
    // Just above the threshold swaps back to the object.
    syncPlacementIconLod(object, item, (EW_FURNITURE_MIN_PX + 1) / 24, resources)
    expect((object.getChildByLabel('icon-object') as Sprite).visible).toBe(true)
    expect((object.getChildByLabel('icon-dot') as Graphics).visible).toBe(false)
  })

  it('picks the crispest tier ≥ the rendered size, sharing the base texture', () => {
    const resources = fakeIconAtlas()
    const tiers = resources.atlas.frames('star')!
    const item = makePlacement({ appearanceKind: 'icon', appearanceIcon: 'star', width: 24 })
    const object = placementRenderer.create(item, resources)
    const sprite = object.getChildByLabel('icon-object') as Sprite
    // rendered 24 → smallest tier ≥ 24 is 32 (index 2).
    syncPlacementIconLod(object, item, 1, resources)
    expect(sprite.texture).toBe(tiers[2])
    // rendered 24×3 = 72 → smallest tier ≥ 72 is 128 (index 0).
    syncPlacementIconLod(object, item, 3, resources)
    expect(sprite.texture).toBe(tiers[0])
    // All tier frames share one source → one draw batch.
    expect(tiers[0]!.source).toBe(tiers[2]!.source)
    // Sprite stays pinned to the body size after a tier swap.
    expect(sprite.width).toBeCloseTo(24)
  })

  it('falls back to the generic glyph when no atlas is injected', () => {
    const resources = fakeResources()
    const item = makePlacement({ appearanceKind: 'icon', appearanceIcon: 'star' })
    const object = placementRenderer.create(item, resources)
    expect(object.getChildByLabel('icon')).toBeTruthy()
    expect(object.getChildByLabel('icon-object')).toBeFalsy()
  })
})

import { Graphics, Sprite, type Container, type Text } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { fakeResources, makePlacement } from '../test-helpers'
import { itemWorldAABB } from '../hit-test'
import {
  CARD_DEFAULT_HEIGHT,
  CARD_DEFAULT_WIDTH,
  CAPTION_PLAQUE_WIDTH_RATIO,
  CAPTION_MAX_LINES,
  DEFAULT_DOT_RADIUS,
  LABEL_CLEARANCE_PX,
  LABEL_HEIGHT_RATIO,
  LABEL_OUTLINE_GAP_PX,
  SELECTION_OUTLINE_PAD_PX,
  SELECTION_OUTLINE_STROKE_PX,
  captionPopScale,
  cssColorToNumber,
  cropFillMatrix,
  labelTextResolution,
  labelZoomOpacity,
  placementLabelLayout,
  parsePlacementCrop,
  placementRenderedMaxEdge,
  placementRenderer,
  setPlacementTextureResident,
  syncPlacementCaptionPop,
  syncPlacementLabelOffset,
} from './placement'
import { NineSliceSprite, Rectangle, Texture } from 'pixi.js'
import type { IconAtlasResource, ImageTreatment, RendererResources } from './registry'
import { frameRegionStrokeWidth, syncFrameRegionStroke, syncPlacementIconLod } from './placement'
import { EW_FURNITURE_MIN_PX, EW_PAGE_FLOOR_PX } from '../shrink-ladder'
import { MIN_STROKE_SCREEN_PX } from '../stroke-render'

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

  it('renders one circular diameter when legacy width and height disagree', () => {
    const item = makePlacement({
      appearanceKind: 'dot',
      appearanceColor: '#ff0000',
      width: 40,
      height: 90,
    })
    const dot = placementRenderer.create(item, fakeResources()).children[0] as Graphics
    expect(dot.getBounds().width).toBeCloseTo(40)
    expect(dot.getBounds().height).toBeCloseTo(40)
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

  it('re-acquires after resident image -> non-image -> image round-trips (AI-IMP-307)', async () => {
    const intermediates = [
      { appearanceKind: null },
      { appearanceKind: 'dot' as const, appearanceColor: '#abc' },
      { appearanceKind: 'icon' as const, appearanceIcon: 'star' },
      { appearanceKind: 'card' as const, noteId: 'note-1', noteTitle: 'Card' },
      { appearanceKind: 'frame' as const },
    ]

    for (const appearance of intermediates) {
      const resources = fakeBudget()
      const item = image()
      const object = placementRenderer.create(item, resources)
      setPlacementTextureResident(object, item, resources, true)
      resources.flush()
      await settled()

      const nonImage = {
        ...item,
        appearanceColor: null,
        appearanceIcon: null,
        appearanceAssetId: null,
        appearanceCrop: null,
        assetContentHash: null,
        assetMimeType: null,
        assetWidth: null,
        assetHeight: null,
        ...appearance,
      }
      placementRenderer.update(object, nonImage, item, resources)
      expect(resources.released).toEqual([HASH_A])

      placementRenderer.update(object, item, nonImage, resources)
      // The placement never left Culler residency, so the rebuild itself
      // must request the restored image instead of waiting for a new hook.
      expect(resources.acquired).toEqual([HASH_A, HASH_A])
      expect(object.getChildByLabel('image-placeholder')).toBeTruthy()
      resources.flush()
      await settled()
      expect(object.getChildByLabel('image')).toBeTruthy()
      expect(object.getChildByLabel('image-placeholder')).toBeFalsy()
    }
  })

  it('does not eagerly restore an image after residency was left as a non-image', async () => {
    const resources = fakeBudget()
    const item = image()
    const object = placementRenderer.create(item, resources)
    setPlacementTextureResident(object, item, resources, true)
    resources.flush()
    await settled()

    const dot = {
      ...item,
      appearanceKind: 'dot' as const,
      appearanceColor: '#abc',
      appearanceAssetId: null,
      assetContentHash: null,
      assetMimeType: null,
      assetWidth: null,
      assetHeight: null,
    }
    placementRenderer.update(object, dot, item, resources)
    // Culler leave hooks still run for non-image bodies. They must clear
    // the placement stamp even though there is no texture to release.
    setPlacementTextureResident(object, dot, resources, false)
    placementRenderer.update(object, item, dot, resources)
    expect(resources.acquired).toEqual([HASH_A])
    expect(object.getChildByLabel('image-placeholder')).toBeTruthy()

    setPlacementTextureResident(object, item, resources, true)
    expect(resources.acquired).toEqual([HASH_A, HASH_A])
    resources.flush()
    await settled()
    expect(object.getChildByLabel('image')).toBeTruthy()
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

describe('image body treatment (§8.5, AI-IMP-140)', () => {
  const HASH = 'f'.repeat(64)
  const SHADOW_TEXTURE = new Texture()
  const treatment: ImageTreatment = {
    radius: 3,
    shadow: { texture: SHADOW_TEXTURE, inset: 20, spread: 12, offsetY: 8, alpha: 0.3 },
  }
  /** Budget host that also injects the image treatment, and resolves the
   * texture to a DISTINCT instance so identity (source pixels sampled,
   * never baked) is provable. */
  function treatedBudget() {
    const source = new Texture()
    const pending: Array<() => void> = []
    const resources: RendererResources & { source: Texture; flush: () => void } = {
      source,
      flush: () => {
        for (const resolve of pending.splice(0)) resolve()
      },
      loadTexture: () => Promise.resolve(source),
      imageTreatment: () => treatment,
      textures: {
        acquire: () => new Promise((resolve) => pending.push(() => resolve(source))),
        release: () => {},
      },
    }
    return resources
  }
  const image = (overrides = {}) =>
    makePlacement({
      appearanceKind: 'image',
      assetContentHash: HASH,
      assetWidth: 200,
      assetHeight: 100,
      width: 200,
      height: 100,
      ...overrides,
    })

  it('rounds the body and lays a shared shadow texture under it', async () => {
    const resources = treatedBudget()
    const item = image()
    const object = placementRenderer.create(item, resources)
    // Shadow is present under the placeholder immediately (no pop-in).
    const shadow = object.getChildByLabel('image-shadow') as NineSliceSprite
    expect(shadow).toBeInstanceOf(NineSliceSprite)
    expect(shadow.texture).toBe(SHADOW_TEXTURE)
    expect(shadow.alpha).toBeCloseTo(0.3)
    // 200×100 body + 12px spread each side.
    expect(shadow.width).toBeCloseTo(224)
    expect(shadow.height).toBeCloseTo(124)
    // Shadow is the backmost child.
    expect(object.getChildIndex(shadow)).toBe(0)

    setPlacementTextureResident(object, item, resources, true)
    resources.flush()
    await settled()
    const body = object.getChildByLabel('image') as Graphics
    expect(body).toBeInstanceOf(Graphics)
    // The rounded body paints OVER the shadow.
    expect(object.getChildIndex(body)).toBeGreaterThan(object.getChildIndex(shadow))
  })

  it('samples the original texture — treatment never bakes source pixels', async () => {
    const resources = treatedBudget()
    const item = image()
    const object = placementRenderer.create(item, resources)
    setPlacementTextureResident(object, item, resources, true)
    resources.flush()
    await settled()
    // The resident body samples the EXACT injected texture object (a
    // rounded fill + a separate shadow object; nothing is composited into
    // the source), so exports/crop previews read untreated pixels.
    expect((object as { __imageTexture?: Texture }).__imageTexture).toBe(resources.source)
    // The shadow uses the shared shadow texture, not the image texture.
    const shadow = object.getChildByLabel('image-shadow') as NineSliceSprite
    expect(shadow.texture).not.toBe(resources.source)
  })

  it('resizes the shadow with the body in place', async () => {
    const resources = treatedBudget()
    const item = image()
    const object = placementRenderer.create(item, resources)
    setPlacementTextureResident(object, item, resources, true)
    resources.flush()
    await settled()
    const resized = { ...item, width: 400, height: 300 }
    placementRenderer.update(object, resized, item, resources)
    const shadow = object.getChildByLabel('image-shadow') as NineSliceSprite
    expect(shadow.width).toBeCloseTo(424)
    expect(shadow.height).toBeCloseTo(324)
    // Body survived the resize (texture never dropped to placeholder).
    expect(object.getChildByLabel('image')).toBeTruthy()
    expect(object.getChildByLabel('image-placeholder')).toBeFalsy()
  })

  it('no treatment host renders a raw body with no shadow', () => {
    const resources = fakeResources()
    const object = placementRenderer.create(image(), resources)
    expect(object.getChildByLabel('image-shadow')).toBeFalsy()
  })
})

describe('image appearance crop (§4.6, AI-IMP-159)', () => {
  const HASH = 'e'.repeat(64)
  const CROP = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }
  const cropped = (crop: object | null = CROP) =>
    makePlacement({
      appearanceKind: 'image',
      assetContentHash: HASH,
      assetWidth: 200,
      assetHeight: 100,
      width: 200,
      height: 100,
      appearanceCrop: crop === null ? null : JSON.stringify(crop),
    })

  /** The fill style of the body Graphics' one fill instruction. */
  function bodyFillStyle(object: Container): { matrix?: { a: number; d: number; tx: number; ty: number } | null } {
    const body = object.getChildByLabel('image') as Graphics
    const fill = body.context.instructions.find((i) => i.action === 'fill')!
    return (fill.data as { style: { matrix?: { a: number; d: number; tx: number; ty: number } | null } }).style
  }

  it('parses the wire crop leniently', () => {
    expect(parsePlacementCrop(null)).toBeNull()
    expect(parsePlacementCrop('not json')).toBeNull()
    expect(parsePlacementCrop(JSON.stringify({ x: 0, y: 0 }))).toBeNull()
    expect(parsePlacementCrop(JSON.stringify({ x: 0, y: 0, width: 0, height: 1 }))).toBeNull()
    // The full frame is the uncropped identity.
    expect(parsePlacementCrop(JSON.stringify({ x: 0, y: 0, width: 1, height: 1 }))).toBeNull()
    expect(parsePlacementCrop(JSON.stringify(CROP))).toEqual(CROP)
  })

  it('builds a UV matrix whose inverse maps the unit square onto the crop', () => {
    const matrix = cropFillMatrix(CROP)
    // style.matrix is INVERTED by generateTextureMatrix, so its inverse
    // is the actual UV map: shape 0..1 → source crop region.
    const inv = matrix.clone().invert()
    expect(inv.apply({ x: 0, y: 0 })).toMatchObject({ x: 0.25, y: 0.25 })
    expect(inv.apply({ x: 1, y: 1 })).toMatchObject({ x: 0.75, y: 0.75 })
  })

  it('a cropped body fills through the crop matrix; uncropped through none', async () => {
    const resources = fakeBudget()
    const item = cropped()
    const object = placementRenderer.create(item, resources)
    setPlacementTextureResident(object, item, resources, true)
    resources.flush()
    await settled()
    const style = bodyFillStyle(object)
    expect(style.matrix).toBeTruthy()
    expect(style.matrix!.a).toBeCloseTo(2)
    expect(style.matrix!.d).toBeCloseTo(2)
    expect(style.matrix!.tx).toBeCloseTo(-0.5)
    expect(style.matrix!.ty).toBeCloseTo(-0.5)

    const plain = cropped(null)
    const plainObject = placementRenderer.create(plain, resources)
    setPlacementTextureResident(plainObject, plain, resources, true)
    resources.flush()
    await settled()
    expect(bodyFillStyle(plainObject).matrix ?? null).toBeNull()
  })

  it('a crop change rebuilds the body (identity) and an in-place resize keeps the crop', async () => {
    const resources = fakeBudget()
    const item = cropped()
    const object = placementRenderer.create(item, resources)
    setPlacementTextureResident(object, item, resources, true)
    resources.flush()
    await settled()
    // In-place resize: body survives, crop matrix still applied.
    const resized = { ...item, width: 400, height: 300 }
    placementRenderer.update(object, resized, item, resources)
    expect(object.getChildByLabel('image')).toBeTruthy()
    expect(bodyFillStyle(object).matrix!.a).toBeCloseTo(2)
    // Crop cleared (Reset): identity changes → rebuild; after the
    // texture re-lands the fill has no matrix.
    const uncropped = { ...resized, appearanceCrop: null }
    placementRenderer.update(object, uncropped, resized, resources)
    resources.flush()
    await settled()
    expect(bodyFillStyle(object).matrix ?? null).toBeNull()
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

  it('renders a caption in the shared label slot ahead of the note title', () => {
    const item = makePlacement({
      noteTitle: 'Registered title',
      caption: 'I like the blue',
      width: 180,
      height: 100,
    })
    const object = placementRenderer.create(item, fakeResources())
    const label = labelOf(object)!
    expect(label.text).toBe(placementLabelLayout(item)!.text)
    expect(label.style.wordWrap).toBe(true)
    expect(label.style.wordWrapWidth).toBeLessThan(180)
    const plaque = object.getChildByLabel('caption-plaque') as Graphics
    expect(plaque).toBeTruthy()
    expect(plaque.width).toBeLessThanOrEqual(180 * CAPTION_PLAQUE_WIDTH_RATIO)
    expect(object.getChildIndex(plaque)).toBeLessThan(object.getChildIndex(label))
  })

  it('renders a caption without a note and labelVisible hides it', () => {
    const item = makePlacement({ caption: 'Identity-free', noteTitle: null })
    expect(labelOf(placementRenderer.create(item, fakeResources()))!.text).toBe(
      placementLabelLayout(item)!.text,
    )
    expect(
      labelOf(
        placementRenderer.create({ ...item, labelVisible: 0 }, fakeResources()),
      ),
    ).toBeUndefined()
  })

  it('keeps a card face title while its caption occupies the under-card label slot', () => {
    const item = makePlacement({
      appearanceKind: 'card',
      noteId: 'note-1',
      noteTitle: 'Card face title',
      caption: 'Under-card thought',
      width: CARD_DEFAULT_WIDTH,
      height: CARD_DEFAULT_HEIGHT,
    })
    const object = placementRenderer.create(item, fakeResources())
    const card = object.getChildByLabel('card') as Container
    expect((card.getChildByLabel('card-title') as Text).text).toBe('Card face title')
    expect(labelOf(object)!.text).toBe(placementLabelLayout(item)!.text)
  })

  it('wraps and clamps captions deterministically to three lines with ellipsis', () => {
    const item = makePlacement({
      caption: 'alpha beta gamma delta epsilon zeta eta theta',
      width: 70,
      height: 100,
    })
    const layout = placementLabelLayout(item)!
    expect(layout.lineCount).toBe(CAPTION_MAX_LINES)
    expect(layout.text.split('\n')).toHaveLength(CAPTION_MAX_LINES)
    expect(layout.text.endsWith('…')).toBe(true)
    const object = placementRenderer.create(item, fakeResources())
    expect(labelOf(object)!.text).toBe(layout.text)
    expect((object.getChildByLabel('caption-plaque') as Graphics).width).toBeLessThan(
      item.width!,
    )
  })

  it('splits wide and Unicode words while treating explicit newlines as hard breaks', () => {
    const wide = placementLabelLayout(
      makePlacement({ caption: 'WWWWWWWW', width: 28, height: 100 }),
    )!
    expect(wide.text.split('\n')).toHaveLength(CAPTION_MAX_LINES)
    expect(wide.text.endsWith('…')).toBe(true)

    const longWord = placementLabelLayout(
      makePlacement({ caption: '🌊🌊🌊🌊\nsecond\nthird\nfourth', width: 28, height: 100 }),
    )!
    expect(longWord.lineCount).toBe(CAPTION_MAX_LINES)
    expect(longWord.text.endsWith('…')).toBe(true)
    expect(longWord.text).not.toContain('�')
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

  it('updates and clears a caption back to the title through the update path', () => {
    const resources = fakeResources()
    const item = makePlacement({
      noteTitle: 'Title',
      caption: 'First caption',
      width: 160,
      height: 80,
    })
    const object = placementRenderer.create(item, resources)
    const edited = { ...item, caption: 'Edited caption' }
    placementRenderer.update(object, edited, item, resources)
    expect(labelOf(object)!.text).toBe(placementLabelLayout(edited)!.text)
    const cleared = { ...edited, caption: null }
    placementRenderer.update(object, cleared, edited, resources)
    expect(labelOf(object)!.text).toBe('Title')
    expect(object.getChildByLabel('caption-plaque')).toBeNull()
  })

  it('applies a plaque-only one-shot birth curve and lands exactly at rest', () => {
    const item = makePlacement({ caption: 'Born here', width: 160, height: 80 })
    const object = placementRenderer.create(item, fakeResources())
    const label = labelOf(object)!
    const plaque = object.getChildByLabel('caption-plaque') as Graphics
    expect(captionPopScale(0, 280)).toBeCloseTo(0.92)
    expect(captionPopScale(190, 280)).toBeGreaterThan(1)
    expect(captionPopScale(280, 280)).toBe(1)
    syncPlacementCaptionPop(object, item, captionPopScale(0, 280))
    expect(label.scale.x).toBeCloseTo(0.92)
    expect(plaque.scale.x).toBeCloseTo(0.92)
    expect(object.scale.x).toBe(1)
    syncPlacementCaptionPop(object, item, 1)
    expect(label.scale.x).toBe(1)
    expect(plaque.scale.x).toBe(1)
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

describe('label zoom ceiling (§8.2, AI-IMP-216)', () => {
  function resourcesAtZoom(zoom: number): RendererResources {
    return { ...fakeResources(), getZoom: () => zoom }
  }

  it('placementRenderedMaxEdge takes the larger edge, times zoom times |scale|', () => {
    const item = makePlacement({ width: 100, height: 300, scale: 2 })
    expect(placementRenderedMaxEdge(item, 1)).toBeCloseTo(300 * 2)
    expect(placementRenderedMaxEdge(item, 0.5)).toBeCloseTo(300)
    // A negative (flipped) scale contributes its magnitude, not sign.
    const flipped = { ...item, scale: -2 }
    expect(placementRenderedMaxEdge(flipped, 1)).toBeCloseTo(600)
  })

  it('placementRenderedMaxEdge falls back to the dot diameter with no width/height/asset size', () => {
    const item = makePlacement({ width: null, height: null, assetWidth: null, assetHeight: null })
    expect(placementRenderedMaxEdge(item, 1)).toBeCloseTo(DEFAULT_DOT_RADIUS * 2)
  })

  it('labelZoomOpacity is 1 at/above the page floor, 0 at/below the furniture floor', () => {
    expect(labelZoomOpacity(EW_PAGE_FLOOR_PX)).toBe(1)
    expect(labelZoomOpacity(EW_PAGE_FLOOR_PX + 1)).toBe(1)
    expect(labelZoomOpacity(1000)).toBe(1)
    expect(labelZoomOpacity(EW_FURNITURE_MIN_PX)).toBe(0)
    expect(labelZoomOpacity(EW_FURNITURE_MIN_PX - 1)).toBe(0)
    expect(labelZoomOpacity(0)).toBe(0)
  })

  it('labelZoomOpacity ramps linearly between the two ladder constants (no new magic numbers)', () => {
    const mid = (EW_FURNITURE_MIN_PX + EW_PAGE_FLOOR_PX) / 2
    expect(labelZoomOpacity(mid)).toBeCloseTo(0.5)
    // Monotonic across the band: a continuous ramp, not a step, so a
    // zoom glide never pops or flickers at a single-frame boundary.
    const samples = Array.from({ length: 9 }, (_, i) =>
      labelZoomOpacity(EW_FURNITURE_MIN_PX + ((EW_PAGE_FLOOR_PX - EW_FURNITURE_MIN_PX) * i) / 8),
    )
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]!).toBeGreaterThan(samples[i - 1]!)
    }
  })

  it('the label fades to invisible on zoom-out and resurrects on zoom-in (presentation, not selection dismissal — unlike AI-IMP-192)', () => {
    // A 200×200 body: at zoom 1 the rendered edge (200) clears the page
    // floor comfortably, so the label starts fully opaque.
    const item = makePlacement({ noteTitle: 'Beyrl', width: 200, height: 200 })
    const object = placementRenderer.create(item, resourcesAtZoom(1))
    const label = labelOf(object)!
    expect(label.alpha).toBe(1)
    expect(label.visible).toBe(true)

    // Board zoom, deep out: rendered = 200 × 0.03 = 6px, under the
    // furniture floor — the label yields with its unreadable body.
    syncPlacementLabelOffset(object, item, 0.03)
    expect(label.alpha).toBe(0)
    expect(label.visible).toBe(false)

    // Zoom back in past the page floor: the SAME Text child returns,
    // full opacity — no rebuild, no permanent dismissal.
    syncPlacementLabelOffset(object, item, 1)
    expect(labelOf(object)).toBe(label)
    expect(label.alpha).toBe(1)
    expect(label.visible).toBe(true)
  })

  it('fades through the band rather than popping at a single boundary', () => {
    // rendered = 200 × zoom; solve for zoom landing mid-band (rendered
    // = (EW_FURNITURE_MIN_PX + EW_PAGE_FLOOR_PX) / 2 = 28).
    const item = makePlacement({ noteTitle: 'Beyrl', width: 200, height: 200 })
    const object = placementRenderer.create(item, resourcesAtZoom(1))
    const label = labelOf(object)!
    const midZoom = (EW_FURNITURE_MIN_PX + EW_PAGE_FLOOR_PX) / 2 / 200
    syncPlacementLabelOffset(object, item, midZoom)
    expect(label.alpha).toBeCloseTo(0.5)
    // Still visible mid-fade — only fully-zero opacity drops `visible`.
    expect(label.visible).toBe(true)
  })

  it('a placement with no label is an inert no-op (no crash, nothing to fade)', () => {
    const item = makePlacement({ noteTitle: null })
    const object = placementRenderer.create(item, resourcesAtZoom(1))
    expect(() => syncPlacementLabelOffset(object, item, 0.001)).not.toThrow()
  })
})

describe('label raster resolution (AI-IMP-262)', () => {
  function resourcesAtZoom(zoom: number): RendererResources {
    return { ...fakeResources(), getZoom: () => zoom }
  }

  // The New-board verb mints CreatePlacement with no width/height/
  // appearance (NewBoardPalette.svelte), so a board pin's label basis
  // falls to the bare-node ring's own DEFAULT_DOT_RADIUS×2 = 24 world
  // units → fontSize 3.36 — the raster this ticket keeps crisp.
  const PIN_FONT = DEFAULT_DOT_RADIUS * 2 * LABEL_HEIGHT_RATIO

  it('labelTextResolution rasters at least the on-screen scale (never an upscale)', () => {
    for (const zoom of [1.2, 3, 8, 20]) {
      for (const dpr of [1, 2]) {
        const resolution = labelTextResolution(PIN_FONT, zoom, dpr)
        // Raster glyph em (fontSize × resolution device px) covers the
        // on-screen em (fontSize × zoom × dpr) — blur-free by construction.
        expect(PIN_FONT * resolution).toBeGreaterThanOrEqual(PIN_FONT * zoom * dpr - 1e-6)
        // Quantized: over-raster stays under one bucket (×1.5 waste max).
        expect(resolution).toBeLessThanOrEqual(zoom * dpr * 1.5 + 1e-6)
      }
    }
  })

  it('labelTextResolution floors at the DPR (zoom-out never rasters below the static default)', () => {
    expect(labelTextResolution(PIN_FONT, 0.25, 2)).toBe(2)
    expect(labelTextResolution(PIN_FONT, 1, 1)).toBe(1)
    // Degenerate inputs keep the auto default rather than exploding.
    expect(labelTextResolution(0, 8, 2)).toBe(2)
    expect(labelTextResolution(PIN_FONT, 8, 0)).toBeGreaterThan(0)
  })

  it('labelTextResolution lands exactly on a bucket at a bucket-exact scale (epsilon guard)', () => {
    // 2.25 = 1.5² must not ceil past itself to 1.5³.
    expect(labelTextResolution(PIN_FONT, 2.25, 1)).toBeCloseTo(2.25)
  })

  it('labelTextResolution caps large-label rasters at their DPR floor (no memory blowup)', () => {
    // A big image body: fontSize 280 world already rasters a 280×dpr px
    // em today — deep zoom must not multiply that further.
    expect(labelTextResolution(280, 8, 2)).toBe(2)
    expect(labelTextResolution(280, 64, 2)).toBe(2)
  })

  it('the cull-pass hook tracks zoom buckets on a board pin and re-rasters only on change', () => {
    const item = makePlacement({ noteTitle: 'Harbor World' }) // bare-node pin
    const object = placementRenderer.create(item, resourcesAtZoom(1))
    const label = labelOf(object)!
    expect(Number(label.style.fontSize)).toBeCloseTo(PIN_FONT)

    // Node test env has no devicePixelRatio → the hook computes dpr 1.
    syncPlacementLabelOffset(object, item, 3)
    const atThree = label.resolution
    expect(atThree).toBeCloseTo(labelTextResolution(PIN_FONT, 3, 1))
    expect(atThree).toBeGreaterThanOrEqual(3)

    // A glide within the same bucket keeps the SAME value — no re-raster.
    syncPlacementLabelOffset(object, item, 3.2)
    expect(label.resolution).toBe(atThree)

    // Crossing buckets re-derives upward; the raster keeps pace.
    syncPlacementLabelOffset(object, item, 8)
    expect(label.resolution).toBeGreaterThanOrEqual(8)
  })

  it('a hidden label (below the furniture floor) is left alone until it resurrects', () => {
    const item = makePlacement({ noteTitle: 'Harbor World' })
    const object = placementRenderer.create(item, resourcesAtZoom(1))
    const label = labelOf(object)!
    syncPlacementLabelOffset(object, item, 3)
    const visibleResolution = label.resolution
    // Deep zoom-out: 24 × 0.1 = 2.4px rendered — hidden, resolution untouched.
    syncPlacementLabelOffset(object, item, 0.1)
    expect(label.visible).toBe(false)
    expect(label.resolution).toBe(visibleResolution)
    // Resurrection re-derives on the same hook.
    syncPlacementLabelOffset(object, item, 3)
    expect(label.visible).toBe(true)
    expect(label.resolution).toBe(visibleResolution)
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

  // §8.2/AI-IMP-138: the region stroke is the frame's membership
  // boundary and must never rasterize below one screen pixel, even far
  // below the furniture floor where the on-edge title is already gone.
  function strokeWidth(gfx: Graphics): number | undefined {
    const instruction = gfx.context.instructions.find((i) => i.action === 'stroke')
    return instruction && 'style' in instruction.data
      ? (instruction.data.style.width as number)
      : undefined
  }

  it('frameRegionStrokeWidth keeps the true width above the floor, floors below it', () => {
    const item = makePlacement({ appearanceKind: 'frame', width: 300, height: 300 })
    // Zoom 1: 2 world px renders as 2 screen px — the floor never bites.
    expect(frameRegionStrokeWidth(item, 1)).toBe(2)
    expect(frameRegionStrokeWidth(item, 10)).toBe(2)
    // Deep zoom: 2 world px would render sub-pixel, so the world width
    // grows to hold exactly the 1px floor on screen.
    const deep = 0.01
    const width = frameRegionStrokeWidth(item, deep)
    expect(width).toBeGreaterThan(2)
    expect(width * deep).toBeCloseTo(MIN_STROKE_SCREEN_PX, 6)
    // The placement's own scale multiplies the on-screen size too, so
    // the floor is computed against zoom × scale.
    const scaled = makePlacement({ appearanceKind: 'frame', width: 300, height: 300, scale: 0.5 })
    expect(frameRegionStrokeWidth(scaled, deep) * deep * 0.5).toBeCloseTo(MIN_STROKE_SCREEN_PX, 6)
  })

  it('syncFrameRegionStroke redraws the region at the floored width, and restores it', () => {
    const resources = frameResources()
    const item = makePlacement({ appearanceKind: 'frame', width: 300, height: 300 })
    const object = placementRenderer.create(item, resources)
    const region = object.children[0] as Graphics
    // Built at the default zoom 1 → the honest 2px stroke.
    expect(strokeWidth(region)).toBe(2)

    // Deep zoom: the boundary floors so it holds ≥1 screen px.
    const deep = 0.005
    syncFrameRegionStroke(object, item, deep, resources)
    const floored = strokeWidth(region)!
    expect(floored).toBeGreaterThan(2)
    expect(floored * deep).toBeGreaterThanOrEqual(MIN_STROKE_SCREEN_PX - 1e-6)
    // Colours survive the in-place redraw (still theme-sourced, no hex).
    expect(styleColor(region, 'stroke')).toBe(THEME.border)
    expect(styleColor(region, 'fill')).toBe(THEME.fill)

    // Back to working zoom: the true width returns.
    syncFrameRegionStroke(object, item, 1, resources)
    expect(strokeWidth(region)).toBe(2)
  })

  it('syncFrameRegionStroke ignores non-frame bodies', () => {
    const resources = frameResources()
    const dot = makePlacement({ appearanceKind: 'dot', appearanceColor: '#4a90d9' })
    const object = placementRenderer.create(dot, resources)
    expect(() => syncFrameRegionStroke(object, dot, 0.01, resources)).not.toThrow()
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
    // An uncaptioned card leaves the under-placement label slot empty.
    expect(labelOf(object)).toBeUndefined()
  })

  it('keeps the card face title while rendering a caption in the under-card slot', () => {
    const resources = fakeResources()
    const before = makePlacement({
      appearanceKind: 'card',
      noteId: 'note-1',
      noteTitle: 'Harbor Study',
      noteExcerpt: 'stone quay',
      caption: 'First reaction',
      width: 260,
      height: 160,
    })
    const object = placementRenderer.create(before, resources)
    expect((cardGroup(object).getChildByLabel('card-title') as Text).text).toBe('Harbor Study')
    expect(labelOf(object)!.text).toBe(placementLabelLayout(before)!.text)

    const cardBefore = cardGroup(object)
    const after = { ...before, caption: 'Changed reaction' }
    placementRenderer.update(object, after, before, resources)
    expect(cardGroup(object)).not.toBe(cardBefore)
    expect((cardGroup(object).getChildByLabel('card-title') as Text).text).toBe('Harbor Study')
    expect(labelOf(object)!.text).toBe(placementLabelLayout(after)!.text)
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

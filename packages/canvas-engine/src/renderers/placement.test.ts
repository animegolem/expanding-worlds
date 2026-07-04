import { Graphics, Sprite } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { fakeResources, makePlacement } from '../test-helpers'
import { DEFAULT_DOT_RADIUS, cssColorToNumber, placementRenderer } from './placement'

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

import { Container, Sprite } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { fakeResources } from '../test-helpers'
import { BackgroundSync } from './background'
import type { SceneBackground } from '../types'

function background(overrides: Partial<SceneBackground> = {}): SceneBackground {
  return {
    color: null,
    assetId: null,
    assetContentHash: null,
    assetMimeType: null,
    settings: null,
    ...overrides,
  }
}

async function settled(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('BackgroundSync', () => {
  it('returns the clear color and renders no sprite without an asset', () => {
    const plane = new Container()
    const sync = new BackgroundSync(plane, fakeResources())
    expect(sync.apply(background({ color: '#112233' }))).toBe('#112233')
    expect(plane.children).toHaveLength(0)
  })

  it('creates the image sprite with settings and updates it in place', async () => {
    const plane = new Container()
    const sync = new BackgroundSync(plane, fakeResources())
    const hash = 'f'.repeat(64)
    sync.apply(
      background({ assetContentHash: hash, settings: { x: 10, y: 20, scale: 2, opacity: 0.5 } }),
    )
    await settled()
    const sprite = plane.children.find((c) => c.label === 'background-image') as Sprite
    expect(sprite.position).toMatchObject({ x: 10, y: 20 })
    expect(sprite.scale.x).toBe(2)
    expect(sprite.alpha).toBe(0.5)

    sync.apply(background({ assetContentHash: hash, settings: { x: -5 } }))
    const same = plane.children.find((c) => c.label === 'background-image') as Sprite
    expect(same).toBe(sprite)
    expect(same.position.x).toBe(-5)
    expect(same.scale.x).toBe(1)
  })

  it('removes the sprite when the background is cleared', async () => {
    const plane = new Container()
    const sync = new BackgroundSync(plane, fakeResources())
    sync.apply(background({ assetContentHash: 'a'.repeat(64) }))
    await settled()
    sync.apply(background())
    expect(plane.children).toHaveLength(0)
  })
})

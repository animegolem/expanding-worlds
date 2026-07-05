import { Container } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import {
  levelForZoom,
  maxLevel,
  planLevelTiles,
  tileVisible,
  TILE_SIZE,
  type TileAddress,
  type TileTextureSource,
} from './background-tiles'
import { BackgroundSync } from './renderers/background'
import { fakeResources } from './test-helpers'
import type { SceneBackground } from './types'

describe('tile math', () => {
  it('maxLevel halves down to a single-tile cover', () => {
    expect(maxLevel(2000, 1000)).toBe(0)
    expect(maxLevel(4096, 4096)).toBe(1)
    expect(maxLevel(20_000, 12_000)).toBe(Math.ceil(Math.log2(20_000 / TILE_SIZE)))
  })

  it('levelForZoom matches texel density to zoom and clamps', () => {
    expect(levelForZoom(1, 4)).toBe(0)
    expect(levelForZoom(2, 4)).toBe(0)
    expect(levelForZoom(0.5, 4)).toBe(1)
    expect(levelForZoom(0.24, 4)).toBe(2)
    expect(levelForZoom(0.001, 4)).toBe(4)
  })

  it('plans full-cover grids whose slices stay within the tile size', () => {
    const tiles = planLevelTiles(5000, 3000, 0)
    // ceil(5000/2048)=3 × ceil(3000/2048)=2.
    expect(tiles).toHaveLength(6)
    const last = tiles[tiles.length - 1]!
    expect(last.sx + last.sw).toBe(5000)
    expect(last.sy + last.sh).toBe(3000)
    // Level 1 tiles span 4096 image pixels (≤2048 texels after ÷2).
    const coarse = planLevelTiles(5000, 3000, 1)
    expect(coarse).toHaveLength(2)
    expect(coarse[0]!.sw).toBe(4096)
  })

  it('tileVisible intersects in image space', () => {
    const tile: TileAddress = { level: 0, sx: 2048, sy: 0, sw: 2048, sh: 2048 }
    expect(tileVisible(tile, { x: 0, y: 0, width: 2049, height: 100 })).toBe(true)
    expect(tileVisible(tile, { x: 0, y: 0, width: 2000, height: 100 })).toBe(false)
  })
})

function fakeTileSource(width: number, height: number) {
  const requested: TileAddress[] = []
  const source: TileTextureSource & { requested: TileAddress[]; destroyed: boolean } = {
    width,
    height,
    requested,
    destroyed: false,
    async texture(tile) {
      requested.push(tile)
      const { Texture } = await import('pixi.js')
      return Texture.WHITE
    },
    destroy() {
      this.destroyed = true
    },
  }
  return source
}

function background(hash: string): SceneBackground {
  return {
    color: null,
    assetId: 'a',
    assetContentHash: hash,
    assetMimeType: 'image/png',
    settings: null,
  }
}

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('BackgroundSync tiled path (§12.2)', () => {
  it('tiles oversized originals under the background-image root', async () => {
    const plane = new Container()
    const source = fakeTileSource(10_000, 6_000)
    const sync = new BackgroundSync(
      plane,
      { ...fakeResources(), loadTileSource: async () => source },
      4096,
    )
    sync.apply(background('c'.repeat(64)))
    await settled()
    expect(sync.tiled).toBe(true)
    const root = plane.children.find((c) => c.label === 'background-image') as Container
    expect(root).toBeTruthy()
    sync.updateView(1, null)
    await settled()
    // Level 0: ceil(10000/2048)=5 × ceil(6000/2048)=3 = 15 tiles.
    const level0 = root.children.find((c) => c.label === 'background-level-0') as Container
    expect(level0.children).toHaveLength(15)
  })

  it('selects coarser levels for far zooms and culls tiles by view', async () => {
    const plane = new Container()
    const source = fakeTileSource(10_000, 6_000)
    const sync = new BackgroundSync(
      plane,
      { ...fakeResources(), loadTileSource: async () => source },
      4096,
    )
    sync.apply(background('d'.repeat(64)))
    await settled()
    const root = plane.children.find((c) => c.label === 'background-image') as Container

    // Mount showed the coarsest level (3 for 10k/2048).
    const mountLevel = root.children.find(
      (c) => c.label === 'background-level-3',
    ) as Container
    expect(mountLevel.visible).toBe(true)

    sync.updateView(0.2, null)
    await settled()
    const level2 = root.children.find((c) => c.label === 'background-level-2') as Container
    expect(level2.visible).toBe(true)
    expect(mountLevel.visible).toBe(false)

    // Narrow view at full zoom: only intersecting level-0 tiles upload.
    const before = source.requested.length
    sync.updateView(1, { x: 0, y: 0, width: 100, height: 100 })
    await settled()
    const fresh = source.requested.slice(before).filter((t) => t.level === 0)
    expect(fresh).toHaveLength(1)
    expect(fresh[0]).toMatchObject({ sx: 0, sy: 0 })
    const level0 = root.children.find((c) => c.label === 'background-level-0') as Container
    expect(level0.visible).toBe(true)
  })

  it('small images keep the plain sprite path and destroy the probe source', async () => {
    const plane = new Container()
    const source = fakeTileSource(800, 600)
    const sync = new BackgroundSync(
      plane,
      { ...fakeResources(), loadTileSource: async () => source },
      4096,
    )
    sync.apply(background('e'.repeat(64)))
    await settled()
    expect(sync.tiled).toBe(false)
    expect(source.destroyed).toBe(true)
    expect(plane.children.some((c) => c.label === 'background-image')).toBe(true)
  })

  it('clearing the background tears the pyramid down', async () => {
    const plane = new Container()
    const source = fakeTileSource(10_000, 6_000)
    const sync = new BackgroundSync(
      plane,
      { ...fakeResources(), loadTileSource: async () => source },
      4096,
    )
    sync.apply(background('f'.repeat(64)))
    await settled()
    sync.apply({ ...background('f'.repeat(64)), assetContentHash: null, assetId: null })
    expect(sync.tiled).toBe(false)
    expect(source.destroyed).toBe(true)
    expect(plane.children).toHaveLength(0)
  })
})

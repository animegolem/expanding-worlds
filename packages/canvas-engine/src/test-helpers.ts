import { Texture } from 'pixi.js'
import type { RendererResources } from './renderers/registry'
import type { SceneDecoration, ScenePlacement } from './types'

/** Test-only fakes: no GPU, no protocol — loads resolve to WHITE. */
export function fakeResources(): RendererResources & { requested: string[] } {
  const requested: string[] = []
  return {
    requested,
    loadTexture(url: string) {
      requested.push(url)
      return Promise.resolve(Texture.WHITE)
    },
  }
}

let counter = 0

export function makePlacement(overrides: Partial<ScenePlacement> = {}): ScenePlacement {
  counter += 1
  return {
    itemKind: 'placement',
    id: `p-${counter}`,
    nodeId: `n-${counter}`,
    x: 0,
    y: 0,
    width: null,
    height: null,
    scale: 1,
    rotation: 0,
    flipX: 0,
    flipY: 0,
    renderOrder: counter * 1024,
    labelVisible: 1,
    locked: 0,
    appearanceKind: null,
    appearanceColor: null,
    appearanceIcon: null,
    appearanceAssetId: null,
    appearanceCrop: null,
    noteTitle: null,
    assetContentHash: null,
    assetMimeType: null,
    assetWidth: null,
    assetHeight: null,
    ...overrides,
  }
}

export function makeDecoration(overrides: Partial<SceneDecoration> = {}): SceneDecoration {
  counter += 1
  return {
    itemKind: 'decoration',
    id: `d-${counter}`,
    kind: 'shape',
    data: { x: 0, y: 0 },
    renderOrder: counter * 1024,
    locked: 0,
    hidden: 0,
    groupId: null,
    anchorStartPlacementId: null,
    anchorEndPlacementId: null,
    ...overrides,
  }
}

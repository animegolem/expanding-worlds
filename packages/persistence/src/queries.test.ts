import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import { CommandRegistry } from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dispatcher, type CommandContext } from './dispatcher'
import { registerAssetHandlers } from './handlers/assets'
import { registerLifecycleHandlers } from './handlers/lifecycle'
import { registerNodeHandlers } from './handlers/nodes'
import { registerTagHandlers } from './handlers/tags'
import { createProject, type ProjectHandle } from './project'
import { QueryRegistry, registerCoreQueries } from './queries'

/**
 * hasContentHash (§14.4, AI-IMP-092): the inbox mirror's recognition
 * probe — present-by-hash plus the tag names the recognition chip
 * offers. Lifecycle-honest: trashed assets, nodes, and tags all fall
 * out of the answer.
 */

const HASH = 'ab'.repeat(32)

let dir: string
let handle: ProjectHandle
let dispatcher: Dispatcher
let queries: QueryRegistry
let queryCtx: Omit<CommandContext, 'now'>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-qcore-'))
  handle = createProject(dir, 'Core Query Test')
  const registry = new CommandRegistry<CommandContext>()
  registerNodeHandlers(registry)
  registerAssetHandlers(registry)
  registerTagHandlers(registry)
  registerLifecycleHandlers(registry)
  dispatcher = new Dispatcher(handle, registry)
  queries = new QueryRegistry()
  registerCoreQueries(queries)
  queryCtx = {
    db: handle.db,
    projectId: handle.projectId,
    rootNodeId: handle.rootNodeId,
    rootCanvasId: handle.rootCanvasId,
  }
})

afterEach(() => {
  handle.close()
  rmSync(dir, { recursive: true, force: true })
})

function committed(commandType: string, payload: unknown): void {
  const result = dispatcher.execute({
    commandId: uuidv7(),
    projectId: handle.projectId,
    commandType,
    commandVersion: 1,
    issuedAt: new Date().toISOString(),
    payload,
  })
  expect(result).toMatchObject({ status: 'committed' })
}

function hasContentHash(contentHash: string): { present: boolean; tagNames: string[] } {
  const result = queries.run(queryCtx, 'hasContentHash', { contentHash })
  expect(result).toMatchObject({ ok: true })
  return (result as { result: { present: boolean; tagNames: string[] } }).result
}

function commitAsset(hash: string): string {
  const assetId = uuidv7()
  committed('CommitAssetImport', {
    assetId,
    kind: 'image',
    contentHash: hash,
    originalFilename: 'pic.png',
    mimeType: 'image/png',
    width: 640,
    height: 480,
    storagePath: `assets/${hash.slice(0, 2)}/${hash}`,
  })
  return assetId
}

describe('hasContentHash (§14.4 recognition)', () => {
  it('answers absent for unknown bytes', () => {
    expect(hasContentHash(HASH)).toEqual({ present: false, tagNames: [] })
  })

  it('answers present with the tag union of every active node on the hash', () => {
    const assetId = commitAsset(HASH)
    // A bare asset (no node) is already recognition-positive.
    expect(hasContentHash(HASH)).toEqual({ present: true, tagNames: [] })

    const nodeId = uuidv7()
    committed('CreateNode', { nodeId })
    committed('SetNodeAppearance', {
      nodeId,
      appearance: { kind: 'image', assetId, crop: null },
    })
    const tagId = uuidv7()
    committed('CreateTag', { tagId, name: 'Character Ref' })
    committed('AssignTagToNode', { tagId, nodeId })

    // A second asset row over the SAME bytes (dedupe never merges
    // records) unions its node's tags into the answer.
    const assetId2 = commitAsset(HASH)
    const nodeId2 = uuidv7()
    committed('CreateNode', { nodeId: nodeId2 })
    committed('SetNodeAppearance', {
      nodeId: nodeId2,
      appearance: { kind: 'image', assetId: assetId2, crop: null },
    })
    const tagId2 = uuidv7()
    committed('CreateTag', { tagId: tagId2, name: 'Armor' })
    committed('AssignTagToNode', { tagId: tagId2, nodeId: nodeId2 })

    expect(hasContentHash(HASH)).toEqual({
      present: true,
      tagNames: ['Armor', 'Character Ref'],
    })
  })

  it('drops a trashed node from the offer while the bytes stay recognized', () => {
    const assetId = commitAsset(HASH)
    const nodeId = uuidv7()
    committed('CreateNode', { nodeId })
    committed('SetNodeAppearance', {
      nodeId,
      appearance: { kind: 'image', assetId, crop: null },
    })
    const tagId = uuidv7()
    committed('CreateTag', { tagId, name: 'Character Ref' })
    committed('AssignTagToNode', { tagId, nodeId })
    committed('TrashNode', { nodeId })
    expect(hasContentHash(HASH)).toEqual({ present: true, tagNames: [] })
  })
})

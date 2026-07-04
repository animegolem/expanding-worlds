import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import { CommandRegistry, type CommittedResult, type InverseCommand } from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dispatcher, type CommandContext } from '../dispatcher'
import { createProject, type ProjectHandle } from '../project'
import { registerNodeHandlers } from './nodes'
import { registerTagHandlers } from './tags'

let dir: string
let handle: ProjectHandle
let dispatcher: Dispatcher

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-tag-'))
  handle = createProject(dir, 'Tag Test')
  const registry = new CommandRegistry<CommandContext>()
  registerNodeHandlers(registry)
  registerTagHandlers(registry)
  dispatcher = new Dispatcher(handle, registry)
})

afterEach(() => {
  handle.close()
  rmSync(dir, { recursive: true, force: true })
})

function exec(commandType: string, payload: unknown) {
  return dispatcher.execute({
    commandId: uuidv7(),
    projectId: handle.projectId,
    commandType,
    commandVersion: 1,
    issuedAt: new Date().toISOString(),
    payload,
  })
}

function committed(commandType: string, payload: unknown): CommittedResult {
  const result = exec(commandType, payload)
  expect(result).toMatchObject({ status: 'committed' })
  return result as CommittedResult
}

function undo(inverse: InverseCommand | null): CommittedResult {
  expect(inverse).not.toBeNull()
  return committed(inverse!.commandType, inverse!.payload)
}

function createNode(): string {
  const nodeId = uuidv7()
  committed('CreateNode', { nodeId })
  return nodeId
}

function createTag(name: string): string {
  const tagId = uuidv7()
  committed('CreateTag', { tagId, name })
  return tagId
}

function assignments(tagId: string): string[] {
  return handle.db
    .all<{ node_id: string }>(
      'SELECT node_id FROM tag_assignment WHERE tag_id = ? ORDER BY node_id',
      tagId,
    )
    .map((r) => r.node_id)
}

describe('CreateTag / RenameTag (§4.8)', () => {
  it('creates a tag with a normalized unique name_key', () => {
    const tagId = uuidv7()
    committed('CreateTag', { tagId, name: '  Injured  Leg ', color: '#f00' })
    expect(
      handle.db.get('SELECT name, name_key, color FROM tag WHERE id = ?', tagId),
    ).toMatchObject({ name: '  Injured  Leg ', name_key: 'injured leg', color: '#f00' })
  })

  it('rejects a normalized duplicate name with a structured conflict', () => {
    const tagId = createTag('Scout')
    expect(exec('CreateTag', { tagId: uuidv7(), name: ' SCOUT ' })).toMatchObject({
      status: 'error',
      code: 'TAG_NAME_CONFLICT',
      details: { existingTagId: tagId, requestedName: ' SCOUT ', nameKey: 'scout' },
    })
  })

  it('undoes creation via DeleteDraftTag, which refuses assigned tags', () => {
    const create = committed('CreateTag', { tagId: uuidv7(), name: 'ephemeral' })
    const tagId = (create.affected[0] as { id: string }).id
    undo(create.inverse)
    expect(handle.db.get('SELECT id FROM tag WHERE id = ?', tagId)).toBeUndefined()

    const keptId = createTag('kept')
    const nodeId = createNode()
    committed('AssignTagToNode', { tagId: keptId, nodeId })
    expect(exec('DeleteDraftTag', { tagId: keptId })).toMatchObject({
      status: 'error',
      code: 'TAG_NOT_DRAFT',
    })
  })

  it('renames without rewriting assignments (§4.8), with inverse', () => {
    const tagId = createTag('injured')
    const nodeA = createNode()
    const nodeB = createNode()
    committed('AssignTagToNode', { tagId, nodeId: nodeA })
    committed('AssignTagToNode', { tagId, nodeId: nodeB })
    const before = assignments(tagId)
    expect(before).toHaveLength(2)

    const rename = committed('RenameTag', { tagId, name: 'Wounded' })
    expect(handle.db.get('SELECT name, name_key FROM tag WHERE id = ?', tagId)).toMatchObject({
      name: 'Wounded',
      name_key: 'wounded',
    })
    // Identity is independent of name: assignment rows are untouched.
    expect(assignments(tagId)).toEqual(before)

    undo(rename.inverse)
    expect(handle.db.get('SELECT name FROM tag WHERE id = ?', tagId)).toMatchObject({
      name: 'injured',
    })
    expect(assignments(tagId)).toEqual(before)
  })

  it('rejects renaming onto another tag but allows re-casing itself', () => {
    const scout = createTag('scout')
    createTag('ranger')
    expect(exec('RenameTag', { tagId: scout, name: 'Ranger' })).toMatchObject({
      status: 'error',
      code: 'TAG_NAME_CONFLICT',
    })
    committed('RenameTag', { tagId: scout, name: 'Scout' })
  })
})

describe('tag assignment (invariant 8: node-only, M:N)', () => {
  it('assigns and unassigns with dispatcher inverse round-trip', () => {
    const tagId = createTag('scout')
    const nodeId = createNode()
    const assign = committed('AssignTagToNode', { tagId, nodeId })
    expect(assignments(tagId)).toEqual([nodeId])

    const unassign = undo(assign.inverse)
    expect(assignments(tagId)).toEqual([])
    undo(unassign.inverse)
    expect(assignments(tagId)).toEqual([nodeId])
  })

  it('supports many-to-many across tags and nodes', () => {
    const t1 = createTag('injured')
    const t2 = createTag('scout')
    const n1 = createNode()
    const n2 = createNode()
    for (const [tagId, nodeId] of [
      [t1, n1],
      [t1, n2],
      [t2, n1],
      [t2, n2],
    ] as const) {
      committed('AssignTagToNode', { tagId, nodeId })
    }
    expect(assignments(t1)).toHaveLength(2)
    expect(assignments(t2)).toHaveLength(2)
  })

  it('rejects duplicates, missing records, and absent assignments structurally', () => {
    const tagId = createTag('scout')
    const nodeId = createNode()
    committed('AssignTagToNode', { tagId, nodeId })
    expect(exec('AssignTagToNode', { tagId, nodeId })).toMatchObject({
      status: 'error',
      code: 'TAG_ALREADY_ASSIGNED',
    })
    expect(exec('AssignTagToNode', { tagId: uuidv7(), nodeId })).toMatchObject({
      status: 'error',
      code: 'TAG_NOT_FOUND',
    })
    expect(exec('AssignTagToNode', { tagId, nodeId: uuidv7() })).toMatchObject({
      status: 'error',
      code: 'NODE_NOT_FOUND',
    })
    expect(exec('UnassignTagFromNode', { tagId, nodeId: uuidv7() })).toMatchObject({
      status: 'error',
      code: 'TAG_NOT_ASSIGNED',
    })
  })
})

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

/** Full assignment rows (with created_at) for byte-exact comparison. */
function assignmentRows(tagId: string): Array<{ node_id: string; created_at: string }> {
  return handle.db.all<{ node_id: string; created_at: string }>(
    'SELECT node_id, created_at FROM tag_assignment WHERE tag_id = ? ORDER BY node_id',
    tagId,
  )
}

/** Whole tag row minus updated_at (AI-IMP-086 comparison precedent). */
function tagRow(tagId: string): Record<string, unknown> | undefined {
  const row = handle.db.get<Record<string, unknown>>('SELECT * FROM tag WHERE id = ?', tagId)
  if (!row) return undefined
  const copy = { ...row }
  delete copy['updated_at']
  return copy
}

function revision(): number {
  return handle.db.get<{ project_revision: number }>(
    'SELECT project_revision FROM project WHERE id = ?',
    handle.projectId,
  )!.project_revision
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

describe('DeleteTag (§4.8 lifecycle-aware, AI-IMP-105)', () => {
  it('unassigns everywhere and removes the row; inverse restores byte-exact', () => {
    const tagId = createTag('scout')
    const nodeA = createNode()
    const nodeB = createNode()
    committed('AssignTagToNode', { tagId, nodeId: nodeA })
    committed('AssignTagToNode', { tagId, nodeId: nodeB })
    const beforeRow = tagRow(tagId)
    const beforeAssignments = assignmentRows(tagId)
    expect(beforeAssignments).toHaveLength(2)

    const del = committed('DeleteTag', { tagId })
    expect(handle.db.get('SELECT id FROM tag WHERE id = ?', tagId)).toBeUndefined()
    expect(assignments(tagId)).toEqual([])
    // affected names the tag and both formerly-tagged nodes.
    expect(del.affected).toEqual(
      expect.arrayContaining([
        { kind: 'tag', id: tagId },
        { kind: 'node', id: nodeA },
        { kind: 'node', id: nodeB },
      ]),
    )

    undo(del.inverse)
    expect(tagRow(tagId)).toEqual(beforeRow)
    expect(assignmentRows(tagId)).toEqual(beforeAssignments)
  })

  it('deletes an empty (unassigned) tag and restores it exactly', () => {
    const tagId = createTag('lonely')
    const beforeRow = tagRow(tagId)
    const del = committed('DeleteTag', { tagId })
    expect(handle.db.get('SELECT id FROM tag WHERE id = ?', tagId)).toBeUndefined()
    undo(del.inverse)
    expect(tagRow(tagId)).toEqual(beforeRow)
    expect(assignments(tagId)).toEqual([])
  })

  it('refuses an unknown / already-deleted tag with no writes or revision bump', () => {
    const tagId = createTag('scout')
    const nodeA = createNode()
    committed('AssignTagToNode', { tagId, nodeId: nodeA })
    committed('DeleteTag', { tagId })
    const r0 = revision()
    // Second delete: the tag is gone.
    expect(exec('DeleteTag', { tagId })).toMatchObject({
      status: 'error',
      code: 'TAG_NOT_FOUND',
    })
    expect(exec('DeleteTag', { tagId: uuidv7() })).toMatchObject({
      status: 'error',
      code: 'TAG_NOT_FOUND',
    })
    expect(revision()).toBe(r0)
    expect(handle.db.get<{ n: number }>('SELECT count(*) AS n FROM tag_assignment')!.n).toBe(0)
  })

  it('round-trips the inverse chain (restore inverse re-deletes)', () => {
    const tagId = createTag('scout')
    const nodeA = createNode()
    committed('AssignTagToNode', { tagId, nodeId: nodeA })
    const del = committed('DeleteTag', { tagId })
    const restore = undo(del.inverse)
    expect(assignments(tagId)).toEqual([nodeA])
    undo(restore.inverse)
    expect(handle.db.get('SELECT id FROM tag WHERE id = ?', tagId)).toBeUndefined()
    expect(assignments(tagId)).toEqual([])
  })
})

describe('MergeTag (§4.8, AI-IMP-105)', () => {
  it('winner absorbs the union with overlap dedupe; one undo restores both exactly', () => {
    const loser = createTag('injured')
    const winner = createTag('wounded')
    const n1 = createNode()
    const n2 = createNode() // overlap: both tags carry n2
    const n3 = createNode()
    committed('AssignTagToNode', { tagId: loser, nodeId: n1 })
    committed('AssignTagToNode', { tagId: loser, nodeId: n2 })
    committed('AssignTagToNode', { tagId: winner, nodeId: n2 })
    committed('AssignTagToNode', { tagId: winner, nodeId: n3 })

    const loserRowBefore = tagRow(loser)
    const loserAssignBefore = assignmentRows(loser)
    const winnerAssignBefore = assignmentRows(winner)

    const merge = committed('MergeTag', { loserTagId: loser, winnerTagId: winner })
    // Loser gone, winner owns the union exactly once each.
    expect(handle.db.get('SELECT id FROM tag WHERE id = ?', loser)).toBeUndefined()
    expect(assignments(winner)).toEqual([n1, n2, n3].sort())
    // n2 appears exactly once (dedupe).
    expect(
      handle.db.get<{ n: number }>(
        'SELECT count(*) AS n FROM tag_assignment WHERE tag_id = ? AND node_id = ?',
        winner,
        n2,
      )!.n,
    ).toBe(1)

    undo(merge.inverse)
    // Loser row + its exact original assignments are back.
    expect(tagRow(loser)).toEqual(loserRowBefore)
    expect(assignmentRows(loser)).toEqual(loserAssignBefore)
    // Winner is byte-exact to before: only the merge's additions removed.
    expect(assignmentRows(winner)).toEqual(winnerAssignBefore)
  })

  it('refuses identical, unknown-loser, and unknown-winner without writes', () => {
    const loser = createTag('injured')
    const winner = createTag('wounded')
    const n1 = createNode()
    committed('AssignTagToNode', { tagId: loser, nodeId: n1 })
    const r0 = revision()

    expect(exec('MergeTag', { loserTagId: loser, winnerTagId: loser })).toMatchObject({
      status: 'error',
      code: 'VALIDATION_FAILED',
    })
    expect(exec('MergeTag', { loserTagId: uuidv7(), winnerTagId: winner })).toMatchObject({
      status: 'error',
      code: 'TAG_NOT_FOUND',
    })
    expect(exec('MergeTag', { loserTagId: loser, winnerTagId: uuidv7() })).toMatchObject({
      status: 'error',
      code: 'TAG_NOT_FOUND',
    })
    expect(revision()).toBe(r0)
    expect(assignments(loser)).toEqual([n1])
    expect(handle.db.get('SELECT id FROM tag WHERE id = ?', loser)).toBeDefined()
  })
})

describe('SetTagAppearance (§4.8 presentation, AI-IMP-105)', () => {
  it('writes color and icon with a prior-state inverse', () => {
    const tagId = uuidv7()
    committed('CreateTag', { tagId, name: 'scout', color: '#111', icon: 'star' })
    const set = committed('SetTagAppearance', { tagId, color: '#f00', icon: 'leaf' })
    expect(handle.db.get('SELECT color, icon FROM tag WHERE id = ?', tagId)).toMatchObject({
      color: '#f00',
      icon: 'leaf',
    })
    undo(set.inverse)
    expect(handle.db.get('SELECT color, icon FROM tag WHERE id = ?', tagId)).toMatchObject({
      color: '#111',
      icon: 'star',
    })
  })

  it('clears fields (omitted = null) and restores the prior nulls on undo', () => {
    const tagId = createTag('plain') // color/icon null by default
    const set = committed('SetTagAppearance', { tagId, color: '#0f0' })
    expect(handle.db.get('SELECT color, icon FROM tag WHERE id = ?', tagId)).toMatchObject({
      color: '#0f0',
      icon: null,
    })
    undo(set.inverse)
    expect(handle.db.get('SELECT color, icon FROM tag WHERE id = ?', tagId)).toMatchObject({
      color: null,
      icon: null,
    })
  })

  it('refuses an unknown tag without a revision bump', () => {
    const r0 = revision()
    expect(exec('SetTagAppearance', { tagId: uuidv7(), color: '#f00' })).toMatchObject({
      status: 'error',
      code: 'TAG_NOT_FOUND',
    })
    expect(revision()).toBe(r0)
  })
})

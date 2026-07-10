import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import { CommandRegistry, type CommittedResult, type InverseCommand } from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dispatcher, type CommandContext } from '../dispatcher'
import { createProject, type ProjectHandle } from '../project'
import { registerCanvasHandlers } from './canvases'
import { registerDecorationHandlers } from './decorations'
import { registerNodeHandlers } from './nodes'
import { registerPlacementHandlers } from './placements'
import { registerTagHandlers } from './tags'

let dir: string
let handle: ProjectHandle
let dispatcher: Dispatcher

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-decoration-'))
  handle = createProject(dir, 'Decoration Test')
  const registry = new CommandRegistry<CommandContext>()
  registerNodeHandlers(registry)
  registerCanvasHandlers(registry)
  registerPlacementHandlers(registry)
  registerDecorationHandlers(registry)
  dispatcher = new Dispatcher(handle, registry)
})

afterEach(() => {
  handle.close()
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
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

function createDecoration(overrides: Record<string, unknown> = {}): string {
  const decorationId = uuidv7()
  committed('CreateDecoration', {
    decorationId,
    canvasId: handle.rootCanvasId,
    kind: 'shape',
    data: {},
    ...overrides,
  })
  return decorationId
}

function createPlacement(canvasId: string = handle.rootCanvasId): string {
  const placementId = uuidv7()
  committed('CreatePlacement', {
    placementId,
    canvasId,
    nodeId: handle.rootNodeId,
  })
  return placementId
}

/** A second, distinct canvas (own node) for cross-canvas anchor tests. */
function createOtherCanvas(): string {
  const nodeId = uuidv7()
  committed('CreateNode', { nodeId })
  const canvasId = uuidv7()
  committed('CreateCanvas', { canvasId, nodeId })
  return canvasId
}

function decorationRow(id: string) {
  return handle.db.get<Record<string, unknown>>('SELECT * FROM decoration WHERE id = ?', id)
}

describe('CreateDecoration (§4.9)', () => {
  it('creates every §4.9 kind on the shared plane', () => {
    const kinds = ['text', 'path', 'shape', 'line', 'arrow', 'connector', 'guide'] as const
    for (const kind of kinds) {
      const id = createDecoration({ kind, data: { kind } })
      expect(decorationRow(id)).toMatchObject({ kind, locked: 0, hidden: 0 })
    }
    expect(exec('CreateDecoration', {
      decorationId: uuidv7(),
      canvasId: handle.rootCanvasId,
      kind: 'sticker',
      data: {},
    })).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
  })

  it('anchors connector endpoints to placements, and only connectors', () => {
    const start = createPlacement()
    const end = createPlacement()
    const id = createDecoration({
      kind: 'connector',
      data: {},
      anchorStartPlacementId: start,
      anchorEndPlacementId: end,
    })
    expect(decorationRow(id)).toMatchObject({
      anchor_start_placement_id: start,
      anchor_end_placement_id: end,
    })

    expect(
      exec('CreateDecoration', {
        decorationId: uuidv7(),
        canvasId: handle.rootCanvasId,
        kind: 'line',
        data: {},
        anchorStartPlacementId: start,
      }),
    ).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
    expect(
      exec('CreateDecoration', {
        decorationId: uuidv7(),
        canvasId: handle.rootCanvasId,
        kind: 'connector',
        data: {},
        anchorStartPlacementId: uuidv7(),
      }),
    ).toMatchObject({ status: 'error', code: 'PLACEMENT_NOT_FOUND' })
  })
})

describe('UpdateDecoration', () => {
  it('updates only the provided fields and round-trips its inverse', () => {
    const id = createDecoration({ kind: 'text', data: { text: 'before' } })
    const update = committed('UpdateDecoration', {
      decorationId: id,
      set: { data: { text: 'after' }, hidden: true },
    })
    let row = decorationRow(id)!
    expect(JSON.parse(row.data as string)).toEqual({ text: 'after' })
    expect(row).toMatchObject({ hidden: 1, locked: 0 })

    undo(update.inverse)
    row = decorationRow(id)!
    expect(JSON.parse(row.data as string)).toEqual({ text: 'before' })
    expect(row).toMatchObject({ hidden: 0, locked: 0 })
  })

  it('re-anchors and un-anchors connector endpoints', () => {
    const placement = createPlacement()
    const id = createDecoration({ kind: 'connector', data: {} })
    committed('UpdateDecoration', {
      decorationId: id,
      set: { anchorStartPlacementId: placement },
    })
    expect(decorationRow(id)!.anchor_start_placement_id).toBe(placement)
    const release = committed('UpdateDecoration', {
      decorationId: id,
      set: { anchorStartPlacementId: null },
    })
    expect(decorationRow(id)!.anchor_start_placement_id).toBeNull()
    undo(release.inverse)
    expect(decorationRow(id)!.anchor_start_placement_id).toBe(placement)
  })

  it('rejects empty updates and missing decorations', () => {
    const id = createDecoration()
    expect(exec('UpdateDecoration', { decorationId: id, set: {} })).toMatchObject({
      status: 'error',
      code: 'VALIDATION_FAILED',
    })
    expect(
      exec('UpdateDecoration', { decorationId: uuidv7(), set: { hidden: true } }),
    ).toMatchObject({ status: 'error', code: 'DECORATION_NOT_FOUND' })
  })
})

describe('DeleteDecoration', () => {
  it('deletes and restores the exact prior row through the inverse', () => {
    const id = createDecoration({ kind: 'text', data: { text: 'keep me' }, locked: true })
    const before = decorationRow(id)!
    const deleted = committed('DeleteDecoration', { decorationId: id })
    expect(decorationRow(id)).toBeUndefined()

    undo(deleted.inverse)
    const after = decorationRow(id)!
    expect(after).toMatchObject({
      kind: 'text',
      locked: 1,
      render_order: before.render_order,
      canvas_id: before.canvas_id,
    })
    expect(JSON.parse(after.data as string)).toEqual({ text: 'keep me' })
  })
})

describe('decoration groups (§6.8, canvas-local movement aid)', () => {
  it('groups, ungroups, and round-trips the inverse pair', () => {
    const a = createDecoration()
    const b = createDecoration()
    const groupId = uuidv7()
    const group = committed('GroupDecorations', {
      groupId,
      canvasId: handle.rootCanvasId,
      decorationIds: [a, b],
    })
    expect(decorationRow(a)!.group_id).toBe(groupId)
    expect(decorationRow(b)!.group_id).toBe(groupId)

    const ungroup = undo(group.inverse)
    expect(decorationRow(a)!.group_id).toBeNull()
    expect(handle.db.get('SELECT id FROM decoration_group WHERE id = ?', groupId)).toBeUndefined()

    // Ungroup's inverse regroups the same members under the same id.
    undo(ungroup.inverse)
    expect(decorationRow(a)!.group_id).toBe(groupId)
    expect(decorationRow(b)!.group_id).toBe(groupId)
  })

  it('rejects single-member groups, double-grouping, and cross-canvas groups', () => {
    const a = createDecoration()
    const b = createDecoration()
    expect(
      exec('GroupDecorations', {
        groupId: uuidv7(),
        canvasId: handle.rootCanvasId,
        decorationIds: [a],
      }),
    ).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })

    committed('GroupDecorations', {
      groupId: uuidv7(),
      canvasId: handle.rootCanvasId,
      decorationIds: [a, b],
    })
    const c = createDecoration()
    expect(
      exec('GroupDecorations', {
        groupId: uuidv7(),
        canvasId: handle.rootCanvasId,
        decorationIds: [a, c],
      }),
    ).toMatchObject({ status: 'error', code: 'DECORATION_ALREADY_GROUPED' })
    expect(exec('UngroupDecorations', { groupId: uuidv7() })).toMatchObject({
      status: 'error',
      code: 'GROUP_NOT_FOUND',
    })
  })
})

describe('CA-012: anchor canvas equality', () => {
  it('refuses CreateDecoration when the start anchor placement is on another canvas', () => {
    const otherCanvasId = createOtherCanvas()
    const offCanvasPlacement = createPlacement(otherCanvasId)
    expect(
      exec('CreateDecoration', {
        decorationId: uuidv7(),
        canvasId: handle.rootCanvasId,
        kind: 'connector',
        data: {},
        anchorStartPlacementId: offCanvasPlacement,
      }),
    ).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
  })

  it('refuses CreateDecoration when the end anchor placement is on another canvas', () => {
    const otherCanvasId = createOtherCanvas()
    const offCanvasPlacement = createPlacement(otherCanvasId)
    expect(
      exec('CreateDecoration', {
        decorationId: uuidv7(),
        canvasId: handle.rootCanvasId,
        kind: 'connector',
        data: {},
        anchorEndPlacementId: offCanvasPlacement,
      }),
    ).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
  })

  it('refuses UpdateDecoration when anchoring to a placement on another canvas', () => {
    const otherCanvasId = createOtherCanvas()
    const offCanvasPlacement = createPlacement(otherCanvasId)
    const id = createDecoration({ kind: 'connector', data: {} })
    expect(
      exec('UpdateDecoration', {
        decorationId: id,
        set: { anchorStartPlacementId: offCanvasPlacement },
      }),
    ).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
    expect(decorationRow(id)!.anchor_start_placement_id).toBeNull()
  })

  it('refuses re-anchoring an already-anchored connector to a placement on another canvas', () => {
    const onCanvasPlacement = createPlacement()
    const otherCanvasId = createOtherCanvas()
    const offCanvasPlacement = createPlacement(otherCanvasId)
    const id = createDecoration({
      kind: 'connector',
      data: {},
      anchorStartPlacementId: onCanvasPlacement,
    })
    expect(
      exec('UpdateDecoration', {
        decorationId: id,
        set: { anchorStartPlacementId: offCanvasPlacement },
      }),
    ).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
    // The refused re-anchor must not have disturbed the prior, valid anchor.
    expect(decorationRow(id)!.anchor_start_placement_id).toBe(onCanvasPlacement)
  })

  it('holds no cross-canvas anchor rows across the fixtures built by this spec', () => {
    // Build a representative mix of same-canvas anchors (the only shape
    // CreateDecoration/UpdateDecoration can ever persist) and assert the
    // authoritative store never actually holds a decoration whose anchor
    // placement disagrees with the decoration's own canvas.
    const start = createPlacement()
    const end = createPlacement()
    createDecoration({
      kind: 'connector',
      data: {},
      anchorStartPlacementId: start,
      anchorEndPlacementId: end,
    })
    const otherCanvasId = createOtherCanvas()
    createPlacement(otherCanvasId)

    const crossStart = handle.db.all(
      `SELECT d.id FROM decoration d
       JOIN placement p ON p.id = d.anchor_start_placement_id
       WHERE p.canvas_id <> d.canvas_id`,
    )
    const crossEnd = handle.db.all(
      `SELECT d.id FROM decoration d
       JOIN placement p ON p.id = d.anchor_end_placement_id
       WHERE p.canvas_id <> d.canvas_id`,
    )
    expect(crossStart).toEqual([])
    expect(crossEnd).toEqual([])
  })
})

describe('invariant 16: no node capabilities on decorations', () => {
  it('exposes no note, tag, link, or graph columns in the decoration schema', () => {
    const columns = handle.db
      .all<{ name: string }>(`SELECT name FROM pragma_table_info('decoration')`)
      .map((c) => c.name)
    for (const forbidden of ['note_id', 'tag_id', 'title', 'title_key', 'appearance_kind']) {
      expect(columns).not.toContain(forbidden)
    }
    // tag_assignment reaches nodes only — no decoration column exists.
    const tagColumns = handle.db
      .all<{ name: string }>(`SELECT name FROM pragma_table_info('tag_assignment')`)
      .map((c) => c.name)
    expect(tagColumns).toEqual(['tag_id', 'node_id', 'created_at'])
    // link records bind notes only.
    const linkColumns = handle.db
      .all<{ name: string }>(`SELECT name FROM pragma_table_info('link')`)
      .map((c) => c.name)
    expect(linkColumns).not.toContain('decoration_id')
  })

  it('cannot assign a tag to a decoration through the API surface', () => {
    const registry = new CommandRegistry<CommandContext>()
    registerNodeHandlers(registry)
    registerDecorationHandlers(registry)
    registerTagHandlers(registry)
    const local = new Dispatcher(handle, registry)
    const decorationId = createDecoration()
    const tagId = uuidv7()
    const create = local.execute({
      commandId: uuidv7(),
      projectId: handle.projectId,
      commandType: 'CreateTag',
      commandVersion: 1,
      issuedAt: new Date().toISOString(),
      payload: { tagId, name: 'nope' },
    })
    expect(create.status).toBe('committed')
    // AssignTagToNode resolves node ids only; a decoration id is not a node.
    expect(
      local.execute({
        commandId: uuidv7(),
        projectId: handle.projectId,
        commandType: 'AssignTagToNode',
        commandVersion: 1,
        issuedAt: new Date().toISOString(),
        payload: { tagId, nodeId: decorationId },
      }),
    ).toMatchObject({ status: 'error', code: 'NODE_NOT_FOUND' })
  })
})

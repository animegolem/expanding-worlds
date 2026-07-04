import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import { CommandRegistry, type CommittedResult, type InverseCommand } from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dispatcher, type CommandContext } from '../dispatcher'
import { createProject, type ProjectHandle } from '../project'
import { registerCanvasHandlers } from './canvases'
import { registerNodeHandlers } from './nodes'

let dir: string
let handle: ProjectHandle
let dispatcher: Dispatcher

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-canvas-'))
  handle = createProject(dir, 'Canvas Test')
  const registry = new CommandRegistry<CommandContext>()
  registerNodeHandlers(registry)
  registerCanvasHandlers(registry)
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

function insertAsset(): string {
  const assetId = uuidv7()
  const now = new Date().toISOString()
  handle.db.run(
    `INSERT INTO asset (id, project_id, kind, content_hash, original_filename,
       mime_type, storage_path, created_at, updated_at)
     VALUES (?, ?, 'image', 'hash', 'a.png', 'image/png', 'assets/a.png', ?, ?)`,
    assetId,
    handle.projectId,
    now,
    now,
  )
  return assetId
}

describe('CreateCanvas', () => {
  it('persists immediately with camera defaults (§4.4)', () => {
    const nodeId = createNode()
    const canvasId = uuidv7()
    const result = committed('CreateCanvas', { canvasId, nodeId })
    expect(result.affected).toEqual([{ kind: 'canvas', id: canvasId }])

    const row = handle.db.get<{ node_id: string; camera: string; lifecycle_state: string }>(
      'SELECT node_id, camera, lifecycle_state FROM canvas WHERE id = ?',
      canvasId,
    )
    expect(row).toMatchObject({ node_id: nodeId, lifecycle_state: 'active' })
    expect(JSON.parse(row!.camera)).toEqual({ x: 0, y: 0, zoom: 1 })
  })

  it('rejects a second canvas for the same node (invariant 10)', () => {
    const nodeId = createNode()
    const canvasId = uuidv7()
    committed('CreateCanvas', { canvasId, nodeId })
    const second = exec('CreateCanvas', { canvasId: uuidv7(), nodeId })
    expect(second).toMatchObject({
      status: 'error',
      code: 'NODE_HAS_CANVAS',
      details: { nodeId, canvasId },
    })
  })

  it('rejects a missing node and undoes via DeleteDraftCanvas', () => {
    expect(exec('CreateCanvas', { canvasId: uuidv7(), nodeId: uuidv7() })).toMatchObject({
      status: 'error',
      code: 'NODE_NOT_FOUND',
    })

    const nodeId = createNode()
    const canvasId = uuidv7()
    const create = committed('CreateCanvas', { canvasId, nodeId })
    const remove = undo(create.inverse)
    expect(handle.db.get('SELECT id FROM canvas WHERE id = ?', canvasId)).toBeUndefined()
    // The inverse of the inverse recreates the canvas.
    undo(remove.inverse)
    expect(handle.db.get('SELECT id FROM canvas WHERE id = ?', canvasId)).toBeDefined()
  })
})

describe('canvas backgrounds (§4.4, §6.7)', () => {
  it('sets an image background with settings and restores prior on undo', () => {
    const assetId = insertAsset()
    const settings = { fit: 'cover', opacity: 0.5 }
    const set = committed('SetCanvasBackground', {
      canvasId: handle.rootCanvasId,
      assetId,
      settings,
    })
    const row = () =>
      handle.db.get<{ background_asset_id: string | null; background_settings: string | null }>(
        'SELECT background_asset_id, background_settings FROM canvas WHERE id = ?',
        handle.rootCanvasId,
      )!
    expect(row().background_asset_id).toBe(assetId)
    expect(JSON.parse(row().background_settings!)).toEqual(settings)

    undo(set.inverse)
    expect(row()).toEqual({ background_asset_id: null, background_settings: null })
  })

  it('rejects a missing background asset', () => {
    expect(
      exec('SetCanvasBackground', {
        canvasId: handle.rootCanvasId,
        assetId: uuidv7(),
        settings: null,
      }),
    ).toMatchObject({ status: 'error', code: 'ASSET_NOT_FOUND' })
  })

  it('keeps color and image backgrounds independent, with inverse round-trip', () => {
    const assetId = insertAsset()
    committed('SetCanvasBackground', { canvasId: handle.rootCanvasId, assetId, settings: null })

    const setColor = committed('SetCanvasBackgroundColor', {
      canvasId: handle.rootCanvasId,
      color: '#112233',
    })
    const row = () =>
      handle.db.get<{ background_asset_id: string | null; background_color: string | null }>(
        'SELECT background_asset_id, background_color FROM canvas WHERE id = ?',
        handle.rootCanvasId,
      )!
    // §4.4: the solid color is independent of the image background.
    expect(row()).toEqual({ background_asset_id: assetId, background_color: '#112233' })

    const repaint = committed('SetCanvasBackgroundColor', {
      canvasId: handle.rootCanvasId,
      color: '#445566',
    })
    expect(repaint.inverse).toMatchObject({
      commandType: 'SetCanvasBackgroundColor',
      payload: { canvasId: handle.rootCanvasId, color: '#112233' },
    })
    undo(repaint.inverse)
    expect(row().background_color).toBe('#112233')
    undo(setColor.inverse)
    expect(row()).toEqual({ background_asset_id: assetId, background_color: null })
  })
})

describe('SetCanvasCamera (§4.4 persistence, §6.9 non-durable navigation)', () => {
  it('persists the camera with a null inverse and a command_log row', () => {
    const result = committed('SetCanvasCamera', {
      canvasId: handle.rootCanvasId,
      camera: { x: 120, y: -40, zoom: 2.5 },
    })
    expect(result.inverse).toBeNull()
    const row = handle.db.get<{ camera: string }>(
      'SELECT camera FROM canvas WHERE id = ?',
      handle.rootCanvasId,
    )!
    expect(JSON.parse(row.camera)).toEqual({ x: 120, y: -40, zoom: 2.5 })
    const logged = handle.db.get<{ n: number }>(
      "SELECT count(*) AS n FROM command_log WHERE command_type = 'SetCanvasCamera'",
    )!
    expect(logged.n).toBe(1)
  })

  it('rejects non-finite values, zero zoom, and unknown canvases', () => {
    expect(
      exec('SetCanvasCamera', {
        canvasId: handle.rootCanvasId,
        camera: { x: 0, y: 0, zoom: 0 },
      }),
    ).toMatchObject({ status: 'error', code: 'INVALID_CAMERA' })
    expect(
      exec('SetCanvasCamera', {
        canvasId: handle.rootCanvasId,
        camera: { x: Number.NaN, y: 0, zoom: 1 },
      }),
    ).toMatchObject({ status: 'error', code: 'INVALID_CAMERA' })
    expect(
      exec('SetCanvasCamera', { canvasId: uuidv7(), camera: { x: 0, y: 0, zoom: 1 } }),
    ).toMatchObject({ status: 'error', code: 'CANVAS_NOT_FOUND' })
  })
})

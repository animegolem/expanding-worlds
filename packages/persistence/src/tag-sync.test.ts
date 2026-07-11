import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CommandEnvelope, CommandResult, CommittedResult } from '@ew/commands'
import { uuidv7 } from '@ew/domain'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openProjectService, type ProjectService } from './service'
import {
  applyTagSync,
  deleteTagByNameKey,
  planTagSync,
  syncTags,
  TagSyncWriteError,
  type TagSyncPlan,
} from './tag-sync'

describe('two-handle tag sync (§4.8 rev 0.69, AI-IMP-271)', () => {
  let root: string
  let source: ProjectService
  let destination: ProjectService

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ew-tag-sync-'))
    source = openProjectService(join(root, 'source'), {
      createIfMissing: true,
      title: 'Source',
    })
    destination = openProjectService(join(root, 'destination'), {
      createIfMissing: true,
      title: 'Destination',
    })
  })

  afterEach(() => {
    source.close()
    destination.close()
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })

  function committed(service: ProjectService, commandType: string, payload: unknown): CommittedResult {
    const result = service.execute({
      commandId: uuidv7(),
      projectId: service.info().projectId,
      commandType,
      commandVersion: 1,
      issuedAt: new Date().toISOString(),
      payload,
    })
    expect(result).toMatchObject({ status: 'committed' })
    return result as CommittedResult
  }

  function imageNode(service: ProjectService, contentHash: string): string {
    const db = service.ingestSource().db
    const projectId = service.info().projectId
    const assetId = uuidv7()
    const nodeId = uuidv7()
    const now = new Date().toISOString()
    db.run(
      `INSERT INTO asset
         (id, project_id, kind, content_hash, original_filename, mime_type,
          storage_path, lifecycle_state, created_at, updated_at)
       VALUES (?, ?, 'image', ?, ?, 'image/png', ?, 'active', ?, ?)`,
      assetId,
      projectId,
      contentHash,
      `${contentHash}.png`,
      `assets/${contentHash}.png`,
      now,
      now,
    )
    db.run(
      `INSERT INTO node
         (id, project_id, appearance_kind, appearance_asset_id,
          lifecycle_state, created_at, updated_at)
       VALUES (?, ?, 'image', ?, 'active', ?, ?)`,
      nodeId,
      projectId,
      assetId,
      now,
      now,
    )
    return nodeId
  }

  function tag(service: ProjectService, name: string, nodeIds: string[]): string {
    const tagId = uuidv7()
    committed(service, 'CreateTag', { tagId, name })
    for (const nodeId of nodeIds) committed(service, 'AssignTagToNode', { tagId, nodeId })
    return tagId
  }

  function assignedNames(service: ProjectService, nodeId: string): string[] {
    return service.ingestSource().db
      .all<{ name: string }>(
        `SELECT t.name
           FROM tag_assignment ta
           JOIN tag t ON t.id = ta.tag_id
          WHERE ta.node_id = ?
          ORDER BY t.name_key`,
        nodeId,
      )
      .map((row) => row.name)
  }

  it('plans the hash-matched additive union, excluding tombstones and existing assignments', () => {
    const sourceA = imageNode(source, 'shared-hash')
    const sourceB = imageNode(source, 'shared-hash')
    const sourceOnly = imageNode(source, 'source-only')
    tag(source, 'Scout', [sourceA])
    tag(source, 'Ranger', [sourceB])
    tag(source, 'Suppressed', [sourceA])
    tag(source, 'No mirror', [sourceOnly])

    const destinationA = imageNode(destination, 'shared-hash')
    const destinationB = imageNode(destination, 'shared-hash')
    const destinationOnly = imageNode(destination, 'destination-only')
    tag(destination, 'Scout', [destinationA])
    committed(destination, 'SuppressTagSync', { nameKey: 'suppressed' })

    const plan = planTagSync(source, destination)
    expect(plan).toEqual({
      sourceProjectId: source.info().projectId,
      destinationProjectId: destination.info().projectId,
      tags: [
        {
          name: 'Ranger',
          nameKey: 'ranger',
          color: null,
          icon: null,
          destinationTagId: null,
          destinationNodeIds: [destinationA, destinationB].sort(),
        },
        {
          name: 'Scout',
          nameKey: 'scout',
          color: null,
          icon: null,
          destinationTagId: expect.any(String),
          destinationNodeIds: [destinationB],
        },
      ],
    })

    const envelopes: CommandEnvelope[] = []
    const observedDestination: ProjectService = {
      ...destination,
      execute(envelope) {
        envelopes.push(envelope)
        return destination.execute(envelope)
      },
    }
    expect(applyTagSync(observedDestination, plan)).toEqual({
      updatedTags: 2,
      createdTags: 1,
      createdAssignments: 3,
    })
    expect(envelopes).toHaveLength(4)
    expect(envelopes.every((envelope) => !('expectedProjectRevision' in envelope))).toBe(true)
    expect(assignedNames(destination, destinationA)).toEqual(['Ranger', 'Scout'])
    expect(assignedNames(destination, destinationB)).toEqual(['Ranger', 'Scout'])
    expect(assignedNames(destination, destinationOnly)).toEqual([])
    expect(planTagSync(source, destination).tags).toEqual([])
  })

  it('runs in either direction and keeps project-native tags additive', () => {
    const sourceNode = imageNode(source, 'round-trip')
    const destinationNode = imageNode(destination, 'round-trip')
    tag(source, 'From source', [sourceNode])
    tag(destination, 'From destination', [destinationNode])

    expect(syncTags(source, destination)).toEqual({
      updatedTags: 1,
      createdTags: 1,
      createdAssignments: 1,
    })
    expect(syncTags(destination, source)).toEqual({
      updatedTags: 1,
      createdTags: 1,
      createdAssignments: 1,
    })
    expect(assignedNames(source, sourceNode)).toEqual(['From destination', 'From source'])
    expect(assignedNames(destination, destinationNode)).toEqual([
      'From destination',
      'From source',
    ])
  })

  it('fails stop at the first refused direct command and inspects its result', () => {
    const nodeA = imageNode(destination, 'failure')
    const nodeB = imageNode(destination, 'failure')
    const existingTagId = tag(destination, 'Existing', [])
    const plan: TagSyncPlan = {
      sourceProjectId: source.info().projectId,
      destinationProjectId: destination.info().projectId,
      tags: [
        {
          name: 'Existing',
          nameKey: 'existing',
          color: null,
          icon: null,
          destinationTagId: existingTagId,
          destinationNodeIds: [nodeA, nodeB],
        },
      ],
    }
    const attempts: CommandEnvelope[] = []
    const refusal: CommandResult = {
      status: 'error',
      commandId: uuidv7(),
      code: 'VALIDATION_FAILED',
      message: 'injected refusal',
    }
    const refusingDestination: ProjectService = {
      ...destination,
      execute(envelope) {
        attempts.push(envelope)
        return refusal
      },
    }

    expect(() => applyTagSync(refusingDestination, plan)).toThrow(TagSyncWriteError)
    expect(attempts).toHaveLength(1)
    expect(assignedNames(destination, nodeA)).toEqual([])
    expect(assignedNames(destination, nodeB)).toEqual([])
  })

  it('exposes a narrow library delete by canonical name key', () => {
    const nodeId = imageNode(destination, 'delete')
    const tagId = tag(destination, 'Delete me', [nodeId])

    expect(deleteTagByNameKey(destination, 'delete me')).toEqual({ status: 'deleted', tagId })
    expect(deleteTagByNameKey(destination, 'delete me')).toEqual({ status: 'missing' })
    expect(assignedNames(destination, nodeId)).toEqual([])
    expect(() => deleteTagByNameKey(destination, ' Delete me ')).toThrow(
      'tag delete requires a non-empty canonical name_key',
    )
  })
})

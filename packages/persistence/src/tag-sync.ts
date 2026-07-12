import {
  COMMAND_ASSIGN_TAG_TO_NODE,
  COMMAND_CREATE_TAG,
  COMMAND_DELETE_TAG,
  type CommandEnvelope,
  type CommandResult,
} from '@ew/commands'
import { nameKey, uuidv7 } from '@ew/domain'
import type { ProjectService } from './service'

/** One destination tag and the active mirror nodes that still need it. */
export interface PlannedTagSync {
  name: string
  nameKey: string
  color: string | null
  icon: string | null
  /** Existing destination identity, or null when apply must create it. */
  destinationTagId: string | null
  destinationNodeIds: string[]
}

/** A deterministic, inspectable plan produced from exactly two project handles. */
export interface TagSyncPlan {
  sourceProjectId: string
  destinationProjectId: string
  tags: PlannedTagSync[]
}

export interface TagSyncResult {
  updatedTags: number
  createdTags: number
  createdAssignments: number
}

export type DeleteTagByNameKeyResult =
  | { status: 'deleted'; tagId: string }
  | { status: 'missing' }

/**
 * A narrow failure at the system-write seam. Prior commands may already have
 * committed, but no later command in the plan is attempted (fail-stop).
 */
export class TagSyncWriteError extends Error {
  constructor(
    readonly commandType: string,
    readonly result: Exclude<CommandResult, { status: 'committed' }>,
  ) {
    super(
      `tag sync ${commandType} did not commit: ${
        result.status === 'error' ? `${result.code}: ${result.message}` : 'revision conflict'
      }`,
    )
    this.name = 'TagSyncWriteError'
  }
}

interface SourceTagRow {
  contentHash: string
  name: string
  nameKey: string
  color: string | null
  icon: string | null
}

interface DestinationNodeRow {
  contentHash: string
  nodeId: string
}

interface DestinationTagRow {
  tagId: string
  nameKey: string
}

interface AssignmentRow {
  tagId: string
  nodeId: string
}

interface NodeSuppressionRow {
  contentHash: string
  nameKey: string
  nodeId: string
}

const pairKey = (left: string, right: string): string => `${left}\u0000${right}`
const tripleKey = (contentHash: string, nameKey: string, nodeId: string): string =>
  `${contentHash}\u0000${nameKey}\u0000${nodeId}`

/**
 * Plan the additive §4.8 union across two real project handles. Only active
 * image-bearing nodes participate. Destination tombstones and assignments
 * are read before planning, so apply never generates expected no-op errors.
 */
export function planTagSync(
  source: ProjectService,
  destination: ProjectService,
): TagSyncPlan {
  const sourceProjectId = source.info().projectId
  const destinationProjectId = destination.info().projectId
  const sourceDb = source.ingestSource().db
  const destinationDb = destination.ingestSource().db

  const sourceTags = sourceDb.all<SourceTagRow>(
    `SELECT DISTINCT a.content_hash AS contentHash,
            t.name AS name, t.name_key AS nameKey,
            t.color AS color, t.icon AS icon
       FROM node n
       JOIN asset a ON a.id = n.appearance_asset_id
      JOIN tag_assignment ta ON ta.node_id = n.id
      JOIN tag t ON t.id = ta.tag_id
      WHERE n.project_id = ? AND n.lifecycle_state = 'active'
        AND n.appearance_kind = 'image'
        AND a.project_id = ? AND a.lifecycle_state = 'active' AND a.kind = 'image'
        AND t.project_id = ? AND t.lifecycle_state = 'active'
      ORDER BY a.content_hash, t.name_key`,
    sourceProjectId,
    sourceProjectId,
    sourceProjectId,
  )
  const destinationNodes = destinationDb.all<DestinationNodeRow>(
    `SELECT DISTINCT a.content_hash AS contentHash, n.id AS nodeId
       FROM node n
       JOIN asset a ON a.id = n.appearance_asset_id
      WHERE n.project_id = ? AND n.lifecycle_state = 'active'
        AND n.appearance_kind = 'image'
        AND a.project_id = ? AND a.lifecycle_state = 'active' AND a.kind = 'image'
      ORDER BY a.content_hash, n.id`,
    destinationProjectId,
    destinationProjectId,
  )
  const destinationTags = destinationDb.all<DestinationTagRow>(
    `SELECT id AS tagId, name_key AS nameKey
       FROM tag
      WHERE project_id = ? AND lifecycle_state = 'active'
      ORDER BY name_key`,
    destinationProjectId,
  )
  const assignments = destinationDb.all<AssignmentRow>(
    `SELECT ta.tag_id AS tagId, ta.node_id AS nodeId
       FROM tag_assignment ta
       JOIN tag t ON t.id = ta.tag_id
       JOIN node n ON n.id = ta.node_id
      WHERE t.project_id = ? AND t.lifecycle_state = 'active'
        AND n.project_id = ? AND n.lifecycle_state = 'active'`,
    destinationProjectId,
    destinationProjectId,
  )
  const tombstones = new Set(
    destinationDb
      .all<{ nameKey: string }>(
        `SELECT name_key AS nameKey
           FROM tag_sync_tombstone
          WHERE project_id = ?`,
        destinationProjectId,
      )
      .map((row) => row.nameKey),
  )
  const nodeSuppressions = new Set(
    destinationDb
      .all<NodeSuppressionRow>(
        `SELECT content_hash AS contentHash, name_key AS nameKey, node_id AS nodeId
           FROM tag_unassign_suppression
          WHERE project_id = ?`,
        destinationProjectId,
      )
      .map((row) => tripleKey(row.contentHash, row.nameKey, row.nodeId)),
  )

  const nodesByHash = new Map<string, string[]>()
  for (const row of destinationNodes) {
    const ids = nodesByHash.get(row.contentHash) ?? []
    ids.push(row.nodeId)
    nodesByHash.set(row.contentHash, ids)
  }
  const tagIdByKey = new Map(destinationTags.map((row) => [row.nameKey, row.tagId]))
  const assigned = new Set(assignments.map((row) => pairKey(row.tagId, row.nodeId)))

  const plannedByKey = new Map<string, PlannedTagSync & { nodes: Set<string> }>()
  for (const sourceTag of sourceTags) {
    if (tombstones.has(sourceTag.nameKey)) continue
    const matchingNodes = nodesByHash.get(sourceTag.contentHash)
    if (!matchingNodes) continue

    const destinationTagId = tagIdByKey.get(sourceTag.nameKey) ?? null
    let planned = plannedByKey.get(sourceTag.nameKey)
    for (const nodeId of matchingNodes) {
      if (nodeSuppressions.has(tripleKey(sourceTag.contentHash, sourceTag.nameKey, nodeId))) continue
      if (destinationTagId && assigned.has(pairKey(destinationTagId, nodeId))) continue
      if (!planned) {
        planned = {
          name: sourceTag.name,
          nameKey: sourceTag.nameKey,
          color: sourceTag.color,
          icon: sourceTag.icon,
          destinationTagId,
          destinationNodeIds: [],
          nodes: new Set<string>(),
        }
        plannedByKey.set(sourceTag.nameKey, planned)
      }
      planned.nodes.add(nodeId)
    }
  }

  const tags = [...plannedByKey.values()]
    .sort((a, b) => (a.nameKey < b.nameKey ? -1 : a.nameKey > b.nameKey ? 1 : 0))
    .map(({ nodes, ...tag }) => ({
      ...tag,
      destinationNodeIds: [...nodes].sort(),
    }))
  return { sourceProjectId, destinationProjectId, tags }
}

function executeSystemCommand(
  destination: ProjectService,
  commandType: string,
  payload: unknown,
): void {
  // Deliberately no expectedProjectRevision: sync is a serialized SYSTEM
  // write in the utility process, not a renderer command/undo event.
  const envelope: CommandEnvelope = {
    commandId: uuidv7(),
    projectId: destination.info().projectId,
    commandType,
    commandVersion: 1,
    issuedAt: new Date().toISOString(),
    payload,
  }
  const result = destination.execute(envelope)
  if (result.status !== 'committed') throw new TagSyncWriteError(commandType, result)
}

/** Apply a previously planned additive union, stopping at the first refusal. */
export function applyTagSync(
  destination: ProjectService,
  plan: TagSyncPlan,
): TagSyncResult {
  if (destination.info().projectId !== plan.destinationProjectId) {
    throw new Error('tag sync plan targets a different destination project')
  }

  let createdTags = 0
  let createdAssignments = 0
  for (const tag of plan.tags) {
    const tagId = tag.destinationTagId ?? uuidv7()
    if (tag.destinationTagId === null) {
      executeSystemCommand(destination, COMMAND_CREATE_TAG, {
        tagId,
        name: tag.name,
        color: tag.color,
        icon: tag.icon,
      })
      createdTags += 1
    }
    for (const nodeId of tag.destinationNodeIds) {
      executeSystemCommand(destination, COMMAND_ASSIGN_TAG_TO_NODE, { tagId, nodeId })
      createdAssignments += 1
    }
  }
  return { updatedTags: plan.tags.length, createdTags, createdAssignments }
}

/** Plan and apply one utility-owned PULL or PUSH direction. */
export function syncTags(
  source: ProjectService,
  destination: ProjectService,
): TagSyncResult {
  return applyTagSync(destination, planTagSync(source, destination))
}

/**
 * Narrow library-delete operation for the explicit scope dialogue. It resolves
 * by canonical name_key and emits exactly one direct DeleteTag envelope.
 */
export function deleteTagByNameKey(
  destination: ProjectService,
  canonicalNameKey: string,
): DeleteTagByNameKeyResult {
  if (canonicalNameKey.length === 0 || nameKey(canonicalNameKey) !== canonicalNameKey) {
    throw new Error('tag delete requires a non-empty canonical name_key')
  }
  const projectId = destination.info().projectId
  const row = destination.ingestSource().db.get<{ tagId: string }>(
    `SELECT id AS tagId
       FROM tag
      WHERE project_id = ? AND name_key = ? AND lifecycle_state = 'active'`,
    projectId,
    canonicalNameKey,
  )
  if (!row) return { status: 'missing' }
  executeSystemCommand(destination, COMMAND_DELETE_TAG, { tagId: row.tagId })
  return { status: 'deleted', tagId: row.tagId }
}

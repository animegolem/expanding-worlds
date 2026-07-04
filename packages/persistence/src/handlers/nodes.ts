import {
  COMMAND_ATTACH_NOTE_TO_NODE,
  COMMAND_CREATE_NODE,
  COMMAND_DELETE_DRAFT_NODE,
  COMMAND_DETACH_NOTE_FROM_NODE,
  COMMAND_MAKE_NOTE_INDEPENDENT,
  COMMAND_SET_NODE_APPEARANCE,
  COMMAND_UNMAKE_NOTE_INDEPENDENT,
  DomainError,
  type AffectedRecord,
  type AttachNoteToNodePayload,
  type CommandRegistry,
  type CreateNodePayload,
  type DeleteDraftNodePayload,
  type DetachNoteFromNodePayload,
  type MakeNoteIndependentPayload,
  type NodeAppearance,
  type SetNodeAppearancePayload,
  type UnmakeNoteIndependentPayload,
} from '@ew/commands'
import type { CommandContext } from '../dispatcher'
import { bindUnresolvedMatching, refreshNoteLinks } from '../links'
import { requireLinkableTitle, requireTitleFree } from './notes'

function requireNode<T extends Record<string, unknown>>(
  ctx: CommandContext,
  nodeId: string,
  columns: string,
): T {
  const row = ctx.db.get<T>(
    `SELECT ${columns} FROM node
     WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
    nodeId,
    ctx.projectId,
  )
  if (!row) throw new DomainError('NODE_NOT_FOUND', `no active node ${nodeId}`)
  return row
}

/**
 * Node command handlers. AI-IMP-010 lands the CreateNode reference
 * pair proving the pipeline; AI-IMP-012 extends this file with
 * attach/detach/appearance commands.
 */
export function registerNodeHandlers(registry: CommandRegistry<CommandContext>): void {
  registry.register<CreateNodePayload>(COMMAND_CREATE_NODE, 1, (ctx, payload) => {
    if (typeof payload?.nodeId !== 'string' || payload.nodeId.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'CreateNode requires payload.nodeId')
    }
    const now = ctx.now()
    ctx.db.run(
      'INSERT INTO node (id, project_id, created_at, updated_at) VALUES (?, ?, ?, ?)',
      payload.nodeId,
      ctx.projectId,
      now,
      now,
    )
    return {
      affected: [{ kind: 'node', id: payload.nodeId }],
      inverse: {
        commandType: COMMAND_DELETE_DRAFT_NODE,
        commandVersion: 1,
        payload: { nodeId: payload.nodeId } satisfies DeleteDraftNodePayload,
      },
    }
  })

  registry.register<DeleteDraftNodePayload>(COMMAND_DELETE_DRAFT_NODE, 1, (ctx, payload) => {
    const node = ctx.db.get<{ id: string; note_id: string | null }>(
      'SELECT id, note_id FROM node WHERE id = ? AND project_id = ?',
      payload.nodeId,
      ctx.projectId,
    )
    if (!node) {
      throw new DomainError('NODE_NOT_FOUND', `no node ${payload.nodeId}`)
    }
    const attachments = ctx.db.get<{ placements: number; tags: number; canvases: number }>(
      `SELECT
         (SELECT count(*) FROM placement WHERE node_id = ?1) AS placements,
         (SELECT count(*) FROM tag_assignment WHERE node_id = ?1) AS tags,
         (SELECT count(*) FROM canvas WHERE node_id = ?1) AS canvases`,
      payload.nodeId,
    )!
    if (
      node.note_id !== null ||
      attachments.placements > 0 ||
      attachments.tags > 0 ||
      attachments.canvases > 0
    ) {
      throw new DomainError(
        'NODE_NOT_DRAFT',
        'DeleteDraftNode only removes nodes with no note, tags, canvas, or placements',
        { nodeId: payload.nodeId },
      )
    }
    ctx.db.run('DELETE FROM node WHERE id = ?', payload.nodeId)
    return {
      affected: [{ kind: 'node', id: payload.nodeId }],
      inverse: {
        commandType: COMMAND_CREATE_NODE,
        commandVersion: 1,
        payload: { nodeId: payload.nodeId } satisfies CreateNodePayload,
      },
    }
  })

  registry.register<AttachNoteToNodePayload>(COMMAND_ATTACH_NOTE_TO_NODE, 1, (ctx, payload) => {
    const node = requireNode<{ note_id: string | null }>(ctx, payload.nodeId, 'note_id')
    if (node.note_id !== null) {
      // Invariant 3: a node references at most one note.
      throw new DomainError('NODE_HAS_NOTE', `node ${payload.nodeId} already references a note`, {
        nodeId: payload.nodeId,
        noteId: node.note_id,
      })
    }
    const note = ctx.db.get<{ id: string; lifecycle_state: string }>(
      'SELECT id, lifecycle_state FROM note WHERE id = ? AND project_id = ?',
      payload.noteId,
      ctx.projectId,
    )
    if (!note) throw new DomainError('NOTE_NOT_FOUND', `no note ${payload.noteId}`)
    if (note.lifecycle_state !== 'active') {
      throw new DomainError('NOTE_TRASHED', `note ${payload.noteId} is in Trash`, {
        noteId: payload.noteId,
      })
    }
    ctx.db.run(
      'UPDATE node SET note_id = ?, updated_at = ? WHERE id = ?',
      payload.noteId,
      ctx.now(),
      payload.nodeId,
    )
    return {
      affected: [{ kind: 'node', id: payload.nodeId }],
      inverse: {
        commandType: COMMAND_DETACH_NOTE_FROM_NODE,
        commandVersion: 1,
        payload: { nodeId: payload.nodeId } satisfies DetachNoteFromNodePayload,
      },
    }
  })

  registry.register<DetachNoteFromNodePayload>(COMMAND_DETACH_NOTE_FROM_NODE, 1, (ctx, payload) => {
    // §6.6/invariants 4+12: only the node→note reference changes; the
    // note and every other referencing node are untouched, including
    // when this leaves the note with zero nodes.
    const node = requireNode<{ note_id: string | null }>(ctx, payload.nodeId, 'note_id')
    if (node.note_id === null) {
      throw new DomainError('NODE_HAS_NO_NOTE', `node ${payload.nodeId} references no note`, {
        nodeId: payload.nodeId,
      })
    }
    ctx.db.run(
      'UPDATE node SET note_id = NULL, updated_at = ? WHERE id = ?',
      ctx.now(),
      payload.nodeId,
    )
    return {
      affected: [{ kind: 'node', id: payload.nodeId }],
      inverse: {
        commandType: COMMAND_ATTACH_NOTE_TO_NODE,
        commandVersion: 1,
        payload: {
          nodeId: payload.nodeId,
          noteId: node.note_id,
        } satisfies AttachNoteToNodePayload,
      },
    }
  })

  registry.register<MakeNoteIndependentPayload>(COMMAND_MAKE_NOTE_INDEPENDENT, 1, (ctx, payload) => {
    const node = requireNode<{ note_id: string | null }>(ctx, payload.nodeId, 'note_id')
    if (node.note_id === null) {
      throw new DomainError('NODE_HAS_NO_NOTE', `node ${payload.nodeId} references no note`, {
        nodeId: payload.nodeId,
      })
    }
    // Same title rules and §7.7 conflict shape as CreateNote/RenameNote.
    const { title, key } = requireLinkableTitle(payload.newTitle)
    requireTitleFree(ctx, key, title)
    const source = ctx.db.get<{ body: string }>(
      'SELECT body FROM note WHERE id = ?',
      node.note_id,
    )!
    const now = ctx.now()
    // §6.6: copy body → new note → attach to this node (detaching the
    // shared note from it); other nodes keep the shared note.
    ctx.db.run(
      `INSERT INTO note (id, project_id, title, title_key, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      payload.newNoteId,
      ctx.projectId,
      payload.newTitle,
      key,
      source.body,
      now,
      now,
    )
    ctx.db.run(
      'UPDATE node SET note_id = ?, updated_at = ? WHERE id = ?',
      payload.newNoteId,
      now,
      payload.nodeId,
    )
    const affected: AffectedRecord[] = [
      { kind: 'node', id: payload.nodeId },
      { kind: 'note', id: payload.newNoteId },
    ]
    // Creating a note: index its outbound tokens (invariant 26) and
    // run the re-resolution sweep for its title (invariant 27), like
    // CreateNote.
    affected.push(...refreshNoteLinks(ctx, payload.newNoteId))
    affected.push(...bindUnresolvedMatching(ctx, key, payload.newNoteId))
    return {
      affected,
      inverse: {
        commandType: COMMAND_UNMAKE_NOTE_INDEPENDENT,
        commandVersion: 1,
        payload: {
          nodeId: payload.nodeId,
          newNoteId: payload.newNoteId,
          previousNoteId: node.note_id,
        } satisfies UnmakeNoteIndependentPayload,
      },
    }
  })

  registry.register<UnmakeNoteIndependentPayload>(
    COMMAND_UNMAKE_NOTE_INDEPENDENT,
    1,
    (ctx, payload) => {
      const node = requireNode<{ note_id: string | null }>(ctx, payload.nodeId, 'note_id')
      if (node.note_id !== payload.newNoteId) {
        throw new DomainError(
          'UNDO_STALE',
          'UnmakeNoteIndependent expects the node to still reference the copied note',
          { nodeId: payload.nodeId, noteId: node.note_id },
        )
      }
      const otherReferents = ctx.db.get<{ n: number }>(
        'SELECT count(*) AS n FROM node WHERE note_id = ? AND id <> ?',
        payload.newNoteId,
        payload.nodeId,
      )!
      if (otherReferents.n > 0) {
        throw new DomainError(
          'UNDO_STALE',
          'the copied note is now shared by other nodes and cannot be removed',
          { noteId: payload.newNoteId },
        )
      }
      const note = ctx.db.get<{ title: string; body: string }>(
        'SELECT title, body FROM note WHERE id = ?',
        payload.newNoteId,
      )
      if (!note) throw new DomainError('NOTE_NOT_FOUND', `no note ${payload.newNoteId}`)
      ctx.db.run(
        'UPDATE node SET note_id = ?, updated_at = ? WHERE id = ?',
        payload.previousNoteId,
        ctx.now(),
        payload.nodeId,
      )
      // Undo the copied note's link footprint before the row goes:
      // drop its outbound records, remember which sources had bound
      // inbound records, drop those too (FK), then delete the note
      // and re-refresh each source — with the title_key free again,
      // their tokens re-index as unresolved rather than bound.
      const inboundSources = ctx.db.all<{ source_note_id: string }>(
        `SELECT DISTINCT source_note_id FROM link
         WHERE target_note_id = ?1 AND source_note_id <> ?1`,
        payload.newNoteId,
      )
      ctx.db.run(
        'DELETE FROM link WHERE source_note_id = ?1 OR target_note_id = ?1',
        payload.newNoteId,
      )
      ctx.db.run('DELETE FROM note WHERE id = ?', payload.newNoteId)
      const affected: AffectedRecord[] = [
        { kind: 'node', id: payload.nodeId },
        { kind: 'note', id: payload.newNoteId },
      ]
      for (const { source_note_id } of inboundSources) {
        affected.push({ kind: 'note', id: source_note_id })
        affected.push(...refreshNoteLinks(ctx, source_note_id))
      }
      return {
        affected,
        inverse: {
          commandType: COMMAND_MAKE_NOTE_INDEPENDENT,
          commandVersion: 1,
          payload: {
            nodeId: payload.nodeId,
            newNoteId: payload.newNoteId,
            newTitle: note.title,
          } satisfies MakeNoteIndependentPayload,
        },
      }
    },
  )

  registry.register<SetNodeAppearancePayload>(COMMAND_SET_NODE_APPEARANCE, 1, (ctx, payload) => {
    const prior = requireNode<{
      appearance_kind: string | null
      appearance_color: string | null
      appearance_icon: string | null
      appearance_asset_id: string | null
      appearance_crop: string | null
    }>(
      ctx,
      payload.nodeId,
      'appearance_kind, appearance_color, appearance_icon, appearance_asset_id, appearance_crop',
    )

    // §4.6: dot, icon, and image are appearances, not node types.
    const next = payload.appearance
    let kind: string | null = null
    let color: string | null = null
    let icon: string | null = null
    let assetId: string | null = null
    let crop: string | null = null
    if (next !== null) {
      kind = next.kind
      if (next.kind === 'dot') {
        color = next.color
      } else if (next.kind === 'icon') {
        icon = next.icon
      } else if (next.kind === 'image') {
        const asset = ctx.db.get<{ id: string }>(
          `SELECT id FROM asset
           WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
          next.assetId,
          ctx.projectId,
        )
        if (!asset) throw new DomainError('ASSET_NOT_FOUND', `no active asset ${next.assetId}`)
        assetId = next.assetId
        // Non-destructive crop/framing; the asset itself is untouched.
        crop = next.crop === null ? null : JSON.stringify(next.crop)
      } else {
        throw new DomainError('VALIDATION_FAILED', 'appearance kind must be dot, icon, or image')
      }
    }
    ctx.db.run(
      `UPDATE node SET appearance_kind = ?, appearance_color = ?, appearance_icon = ?,
              appearance_asset_id = ?, appearance_crop = ?, updated_at = ?
       WHERE id = ?`,
      kind,
      color,
      icon,
      assetId,
      crop,
      ctx.now(),
      payload.nodeId,
    )

    let priorAppearance: NodeAppearance | null = null
    if (prior.appearance_kind === 'dot' && prior.appearance_color !== null) {
      priorAppearance = { kind: 'dot', color: prior.appearance_color }
    } else if (prior.appearance_kind === 'icon' && prior.appearance_icon !== null) {
      priorAppearance = { kind: 'icon', icon: prior.appearance_icon }
    } else if (prior.appearance_kind === 'image' && prior.appearance_asset_id !== null) {
      priorAppearance = {
        kind: 'image',
        assetId: prior.appearance_asset_id,
        crop:
          prior.appearance_crop === null
            ? null
            : (JSON.parse(prior.appearance_crop) as {
                x: number
                y: number
                width: number
                height: number
              }),
      }
    }
    return {
      affected: [{ kind: 'node', id: payload.nodeId }],
      inverse: {
        commandType: COMMAND_SET_NODE_APPEARANCE,
        commandVersion: 1,
        payload: {
          nodeId: payload.nodeId,
          appearance: priorAppearance,
        } satisfies SetNodeAppearancePayload,
      },
    }
  })
}

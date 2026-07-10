import {
  COMMAND_ATTACH_NOTE_TO_NODE,
  COMMAND_CREATE_NODE,
  COMMAND_CREATE_NOTE_AND_ATTACH,
  COMMAND_DELETE_DRAFT_NODE,
  COMMAND_DETACH_AND_TRASH_NOTE,
  COMMAND_DETACH_NOTE_FROM_NODE,
  COMMAND_MAKE_NOTE_INDEPENDENT,
  COMMAND_SET_NODE_APPEARANCE,
  COMMAND_UNMAKE_NOTE_INDEPENDENT,
  DomainError,
  type AffectedRecord,
  type AttachNoteToNodePayload,
  type CommandRegistry,
  type CreateNodePayload,
  type CreateNoteAndAttachPayload,
  type DeleteDraftNodePayload,
  type DetachAndTrashNotePayload,
  type DetachNoteFromNodePayload,
  type MakeNoteIndependentPayload,
  type SetNodeAppearancePayload,
  type UnmakeNoteIndependentPayload,
} from '@ew/commands'
import type { CommandContext } from '../dispatcher'
import { bindUnresolvedMatching, refreshNoteLinks } from '../links'
import {
  ALL_APPEARANCE_KINDS,
  decodeAppearanceColumns,
  prepareNodeAppearance,
  updateNodeAppearance,
  type AppearanceColumns,
} from './node-appearance'
import { requireLinkableTitle, requireTitleFree } from './notes'

// §4.6 rev 0.31: the note card is the fourth appearance kind. It
// carries NO payload — the card's content comes from the attached
// note via the read model, never from appearance columns.

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

  registry.register<CreateNoteAndAttachPayload>(COMMAND_CREATE_NOTE_AND_ATTACH, 1, (ctx, payload) => {
    // AI-IMP-086: "Attach New Note…" is one user act, so note
    // creation and attachment commit as ONE transaction — an
    // attach-side rejection can never strand a loose note reserving
    // its title. All validation precedes the first write (CreatePin's
    // §6.2 shape).
    if (typeof payload?.nodeId !== 'string' || payload.nodeId.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'CreateNoteAndAttach requires payload.nodeId')
    }
    if (typeof payload.noteId !== 'string' || payload.noteId.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'CreateNoteAndAttach requires payload.noteId')
    }
    if (payload.body !== undefined && typeof payload.body !== 'string') {
      throw new DomainError(
        'VALIDATION_FAILED',
        'CreateNoteAndAttach body must be a string when present',
      )
    }
    const node = requireNode<{ note_id: string | null }>(ctx, payload.nodeId, 'note_id')
    if (node.note_id !== null) {
      // Invariant 3: a node references at most one note.
      throw new DomainError('NODE_HAS_NOTE', `node ${payload.nodeId} already references a note`, {
        nodeId: payload.nodeId,
        noteId: node.note_id,
      })
    }
    const { title, key } = requireLinkableTitle(payload.title)
    requireTitleFree(ctx, key, title)

    const now = ctx.now()
    ctx.db.run(
      `INSERT INTO note (id, project_id, title, title_key, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      payload.noteId,
      ctx.projectId,
      title,
      key,
      payload.body ?? '',
      now,
      now,
    )
    ctx.db.run(
      'UPDATE node SET note_id = ?, updated_at = ? WHERE id = ?',
      payload.noteId,
      now,
      payload.nodeId,
    )

    const affected: AffectedRecord[] = [
      { kind: 'note', id: payload.noteId },
      { kind: 'node', id: payload.nodeId },
    ]
    // Mirrors CreateNote: index the body's outbound tokens (invariant
    // 26), then the re-resolution sweep (invariant 27).
    affected.push(...refreshNoteLinks(ctx, payload.noteId))
    affected.push(...bindUnresolvedMatching(ctx, key, payload.noteId))

    return {
      affected,
      inverse: {
        commandType: COMMAND_DETACH_AND_TRASH_NOTE,
        commandVersion: 1,
        payload: {
          nodeId: payload.nodeId,
          noteId: payload.noteId,
        } satisfies DetachAndTrashNotePayload,
      },
    }
  })

  registry.register<DetachAndTrashNotePayload>(
    COMMAND_DETACH_AND_TRASH_NOTE,
    1,
    (ctx, payload, envelope) => {
      const node = requireNode<{ note_id: string | null }>(ctx, payload.nodeId, 'note_id')
      if (node.note_id !== payload.noteId) {
        throw new DomainError(
          'UNDO_STALE',
          'DetachAndTrashNote expects the node to still reference the created note',
          { nodeId: payload.nodeId, noteId: node.note_id },
        )
      }
      const note = ctx.db.get<{ id: string; lifecycle_state: string }>(
        'SELECT id, lifecycle_state FROM note WHERE id = ? AND project_id = ?',
        payload.noteId,
        ctx.projectId,
      )
      if (!note) throw new DomainError('NOTE_NOT_FOUND', `no note ${payload.noteId}`)

      const now = ctx.now()
      // The prior note_id was NULL by construction: CreateNoteAndAttach
      // refuses nodes that already reference a note.
      ctx.db.run('UPDATE node SET note_id = NULL, updated_at = ? WHERE id = ?', now, payload.nodeId)
      const affected: AffectedRecord[] = [
        { kind: 'node', id: payload.nodeId },
        { kind: 'note', id: payload.noteId },
      ]
      if (note.lifecycle_state === 'active') {
        // Purge-safe, mirroring CreateNote↔TrashNote and DeleteDraftPin:
        // the note may have gained body text or inbound links since
        // creation; trashing keeps links and the title reservation
        // intact.
        ctx.db.run(
          `UPDATE note
           SET lifecycle_state = 'trashed', trashed_at = ?, trashed_by_command_id = ?,
               updated_at = ?
           WHERE id = ?`,
          now,
          envelope.commandId,
          now,
          payload.noteId,
        )
      }
      // Internal inverse of a composite create: not redoable as one
      // step (redo re-issues CreateNoteAndAttach), so no inverse is
      // offered — matching DeleteDraftPin.
      return { affected, inverse: null }
    },
  )

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
    const priorColumns = requireNode<AppearanceColumns>(
      ctx,
      payload.nodeId,
      `appearance_kind AS kind, appearance_color AS color,
       appearance_icon AS icon, appearance_asset_id AS assetId,
       appearance_crop AS crop`,
    )
    const priorAppearance = decodeAppearanceColumns(priorColumns)
    // §4.6/§4.9: the growing appearance vocabulary is validated here,
    // never in a SQLite CHECK. The codec owns every payload field and
    // active image-asset lookup before the first write.
    const next = prepareNodeAppearance(ctx, payload.appearance, {
      allowedKinds: ALL_APPEARANCE_KINDS,
      allowNull: true,
      kindMessage: 'appearance kind must be dot, icon, image, card, or frame',
    })
    updateNodeAppearance(ctx, payload.nodeId, next.columns)
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

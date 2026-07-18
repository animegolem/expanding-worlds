import {
  COMMAND_CREATE_PIN,
  COMMAND_DELETE_DRAFT_PIN,
  COMMAND_PLACE_AS_CARD,
  COMMAND_UNPLACE_CARD,
  DomainError,
  type AffectedRecord,
  type CommandRegistry,
  type CreatePinPayload,
  type DeleteDraftPinPayload,
  type PlaceAsCardPayload,
  type UnplaceCardPayload,
} from '@ew/commands'
import { titleKey } from '@ew/domain'
import type { CommandContext } from '../dispatcher'
import { bindUnresolvedMatching, refreshNoteLinks } from '../links'
import { nextRenderOrder } from '../render-order'
import {
  decodeAppearanceColumns,
  prepareNodeAppearance,
  updateNodeAppearance,
  type AppearanceColumns,
  type NodeAppearanceKind,
  type PreparedAppearance,
} from './node-appearance'
import { requireLinkableTitle, requireTitleFree } from './notes'
import { releaseConnectorAnchors } from './placements'

const CREATE_PIN_APPEARANCE_KINDS: ReadonlySet<NodeAppearanceKind> = new Set([
  'dot',
  'icon',
  'image',
])
const CARD_APPEARANCE_KIND: ReadonlySet<NodeAppearanceKind> = new Set(['card'])
const UNPLACE_PRIOR_APPEARANCE_KINDS: ReadonlySet<NodeAppearanceKind> = new Set(['dot'])

/**
 * CreatePin composite handler (RFC-0001 §6.2, AI-IMP-020): one
 * user-level transaction covering node creation, appearance, note
 * creation or attachment, tag assignment, and placement creation.
 * Every §6.1/§6.2/§6.10 creation surface commits through this pair.
 * All validation happens before the first write so a rejection leaves
 * zero records (the dispatcher transaction would roll back anyway,
 * but checks-first matches the sibling handlers).
 */
export function registerPinHandlers(registry: CommandRegistry<CommandContext>): void {
  registry.register<CreatePinPayload>(COMMAND_CREATE_PIN, 1, (ctx, payload) => {
    for (const key of ['nodeId', 'canvasId', 'placementId'] as const) {
      if (typeof payload?.[key] !== 'string' || payload[key].length === 0) {
        throw new DomainError('VALIDATION_FAILED', `CreatePin requires payload.${key}`)
      }
    }
    if (typeof payload.x !== 'number' || typeof payload.y !== 'number') {
      throw new DomainError('VALIDATION_FAILED', 'CreatePin requires numeric x and y')
    }
    if (
      payload.diameter !== undefined &&
      (typeof payload.diameter !== 'number' ||
        !Number.isFinite(payload.diameter) ||
        payload.diameter <= 0)
    ) {
      throw new DomainError('VALIDATION_FAILED', 'CreatePin diameter must be finite and positive')
    }

    const canvas = ctx.db.get<{ id: string }>(
      `SELECT id FROM canvas
       WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
      payload.canvasId,
      ctx.projectId,
    )
    if (!canvas) throw new DomainError('CANVAS_NOT_FOUND', `no active canvas ${payload.canvasId}`)

    // §4.6 appearance validation and fixed-column encoding. Image
    // appearances resolve their active asset here too; its natural
    // dimensions size the placement (§6.1 aspect preserved).
    const preparedAppearance = prepareNodeAppearance(ctx, payload.appearance, {
      allowedKinds: CREATE_PIN_APPEARANCE_KINDS,
      allowNull: false,
      kindMessage: 'appearance kind must be dot, icon, or image',
    })
    const appearance = preparedAppearance.appearance
    if (appearance === null) {
      throw new DomainError('VALIDATION_FAILED', 'appearance kind must be dot, icon, or image')
    }
    const appearanceColumns = preparedAppearance.columns
    const naturalWidth = preparedAppearance.asset?.width ?? null
    const naturalHeight = preparedAppearance.asset?.height ?? null
    if (payload.diameter !== undefined && appearance.kind !== 'dot') {
      throw new DomainError('VALIDATION_FAILED', 'CreatePin diameter is only valid for dot appearance')
    }
    // AI-IMP-310: a dot has ONE persisted diameter. SQLite retains its
    // existing width/height columns; equal values make the circle law
    // explicit without a schema change. Image pins keep natural size.
    const placementWidth = payload.diameter ?? naturalWidth
    const placementHeight = payload.diameter ?? naturalHeight

    // Note branch validation (§4.2/§7.7 for create, §6.10 for attach).
    const note = payload.note
    let noteId: string | null = null
    let createTitle: { title: string; key: string } | null = null
    let createBody = ''
    if (note !== undefined) {
      if (note.kind === 'create') {
        if (typeof note.noteId !== 'string' || note.noteId.length === 0) {
          throw new DomainError('VALIDATION_FAILED', 'note.create requires noteId')
        }
        if (note.body !== undefined && typeof note.body !== 'string') {
          throw new DomainError('VALIDATION_FAILED', 'note.create body must be a string')
        }
        createTitle = requireLinkableTitle(note.title)
        requireTitleFree(ctx, createTitle.key, createTitle.title)
        noteId = note.noteId
        // §7.2/AI-IMP-058: Create and Place carries the phantom draft.
        createBody = note.body ?? ''
      } else if (note.kind === 'attach') {
        const existing = ctx.db.get<{ id: string; lifecycle_state: string }>(
          'SELECT id, lifecycle_state FROM note WHERE id = ? AND project_id = ?',
          note.noteId,
          ctx.projectId,
        )
        if (!existing) throw new DomainError('NOTE_NOT_FOUND', `no note ${note.noteId}`)
        if (existing.lifecycle_state !== 'active') {
          throw new DomainError('NOTE_NOT_ACTIVE', `note ${note.noteId} is in Trash`, {
            noteId: note.noteId,
          })
        }
        noteId = note.noteId
      } else {
        throw new DomainError('VALIDATION_FAILED', 'note.kind must be "create" or "attach"')
      }
    }

    // Tags: existing active tags only, each at most once.
    const tagIds = payload.tagIds ?? []
    const seenTags = new Set<string>()
    for (const tagId of tagIds) {
      if (seenTags.has(tagId)) {
        throw new DomainError('VALIDATION_FAILED', `tag ${tagId} appears twice`)
      }
      seenTags.add(tagId)
      const tag = ctx.db.get<{ id: string }>(
        `SELECT id FROM tag
         WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
        tagId,
        ctx.projectId,
      )
      if (!tag) throw new DomainError('TAG_NOT_FOUND', `no active tag ${tagId}`)
    }

    // ---- writes (validation is complete) ----
    const now = ctx.now()
    const affected: AffectedRecord[] = []

    if (createTitle !== null) {
      // Note row first: node.note_id references it.
      ctx.db.run(
        `INSERT INTO note (id, project_id, title, title_key, body, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        noteId,
        ctx.projectId,
        createTitle.title,
        createTitle.key,
        createBody,
        now,
        now,
      )
    }

    ctx.db.run(
      `INSERT INTO node
         (id, project_id, note_id, appearance_kind, appearance_color,
          appearance_icon, appearance_asset_id, appearance_crop,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      payload.nodeId,
      ctx.projectId,
      noteId,
      appearanceColumns.kind,
      appearanceColumns.color,
      appearanceColumns.icon,
      appearanceColumns.assetId,
      appearanceColumns.crop,
      now,
      now,
    )
    affected.push({ kind: 'node', id: payload.nodeId })

    if (noteId !== null) affected.push({ kind: 'note', id: noteId })
    if (createTitle !== null && noteId !== null) {
      // Mirrors CreateNote: index the body's outbound tokens
      // (invariant 26), then the re-resolution sweep (invariant 27).
      affected.push(...refreshNoteLinks(ctx, noteId))
      affected.push(...bindUnresolvedMatching(ctx, titleKey(createTitle.title), noteId))
    }

    for (const tagId of tagIds) {
      ctx.db.run(
        'INSERT INTO tag_assignment (tag_id, node_id, created_at) VALUES (?, ?, ?)',
        tagId,
        payload.nodeId,
        now,
      )
      affected.push({ kind: 'tag', id: tagId })
    }

    ctx.db.run(
      `INSERT INTO placement
         (id, project_id, canvas_id, node_id, x, y, width, height, scale,
          rotation, flip_x, flip_y, render_order, label_visible,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 0, ?, 1, ?, ?)`,
      payload.placementId,
      ctx.projectId,
      payload.canvasId,
      payload.nodeId,
      payload.x,
      payload.y,
      placementWidth,
      placementHeight,
      nextRenderOrder(ctx, payload.canvasId),
      now,
      now,
    )
    affected.push({ kind: 'placement', id: payload.placementId })

    return {
      affected,
      inverse: {
        commandType: COMMAND_DELETE_DRAFT_PIN,
        commandVersion: 1,
        payload: {
          nodeId: payload.nodeId,
          placementId: payload.placementId,
          createdNoteId: note?.kind === 'create' ? note.noteId : null,
        } satisfies DeleteDraftPinPayload,
      },
    }
  })

  registry.register<DeleteDraftPinPayload>(
    COMMAND_DELETE_DRAFT_PIN,
    1,
    (ctx, payload, envelope) => {
      const placement = ctx.db.get<{ id: string; node_id: string }>(
        `SELECT id, node_id FROM placement
         WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
        payload.placementId,
        ctx.projectId,
      )
      if (!placement) {
        throw new DomainError('PLACEMENT_NOT_FOUND', `no active placement ${payload.placementId}`)
      }
      if (placement.node_id !== payload.nodeId) {
        throw new DomainError('VALIDATION_FAILED', 'placement does not belong to nodeId', {
          placementId: payload.placementId,
          nodeId: payload.nodeId,
        })
      }
      const node = ctx.db.get<{ id: string }>(
        'SELECT id FROM node WHERE id = ? AND project_id = ?',
        payload.nodeId,
        ctx.projectId,
      )
      if (!node) throw new DomainError('NODE_NOT_FOUND', `no node ${payload.nodeId}`)
      // Draft guard: this inverse only unwinds a pin that is still one
      // placement with no owned canvas; anything richer must go
      // through the lifecycle commands (§9).
      const guards = ctx.db.get<{ placements: number; canvases: number }>(
        `SELECT
           (SELECT count(*) FROM placement WHERE node_id = ?1) AS placements,
           (SELECT count(*) FROM canvas WHERE node_id = ?1) AS canvases`,
        payload.nodeId,
      )!
      if (guards.placements > 1 || guards.canvases > 0) {
        throw new DomainError(
          'PIN_NOT_DRAFT',
          'DeleteDraftPin only unwinds a pin with a single placement and no owned canvas',
          { nodeId: payload.nodeId },
        )
      }
      const createdNote =
        payload.createdNoteId != null
          ? ctx.db.get<{
              id: string
              lifecycle_state: string
              title: string
              title_key: string
            }>(
              'SELECT id, lifecycle_state, title, title_key FROM note WHERE id = ? AND project_id = ?',
              payload.createdNoteId,
              ctx.projectId,
            )
          : undefined
      if (payload.createdNoteId != null && !createdNote) {
        throw new DomainError('NOTE_NOT_FOUND', `no note ${payload.createdNoteId}`)
      }

      const affected: AffectedRecord[] = []
      const freed = releaseConnectorAnchors(ctx, payload.placementId)
      ctx.db.run('DELETE FROM placement WHERE id = ?', payload.placementId)
      affected.push({ kind: 'placement', id: payload.placementId })
      affected.push(...freed.map((id) => ({ kind: 'decoration' as const, id })))

      const tags = ctx.db.all<{ tag_id: string }>(
        'SELECT tag_id FROM tag_assignment WHERE node_id = ?',
        payload.nodeId,
      )
      ctx.db.run('DELETE FROM tag_assignment WHERE node_id = ?', payload.nodeId)
      affected.push(...tags.map((t) => ({ kind: 'tag' as const, id: t.tag_id })))

      ctx.db.run('DELETE FROM node WHERE id = ?', payload.nodeId)
      affected.push({ kind: 'node', id: payload.nodeId })

      if (createdNote && createdNote.lifecycle_state === 'active') {
        // §7.2 rev 0.47 materialization-undo: CreatePin's create branch
        // ran the re-resolution sweep (bindUnresolvedMatching), binding
        // every matching unresolved token project-wide to this new note.
        // Un-materializing must revert that binding in the SAME step so
        // the typed text survives as the unresolved token it began as —
        // otherwise the token would stay bound to a now-trashed note
        // (links resolve against trashed notes too, links.ts). Nothing
        // could have bound to this brand-new note except that sweep, so
        // every inbound bound record reverts to unresolved, re-keyed to
        // the note's title (the original raw token text is not retained;
        // the title reconstitutes the phantom).
        const rebound = ctx.db.all<{ id: string }>(
          "SELECT id FROM link WHERE project_id = ? AND state = 'bound' AND target_note_id = ?",
          ctx.projectId,
          createdNote.id,
        )
        if (rebound.length > 0) {
          ctx.db.run(
            `UPDATE link
             SET state = 'unresolved', target_note_id = NULL,
                 target_title_key = ?, display_text = ?, updated_at = ?
             WHERE project_id = ? AND state = 'bound' AND target_note_id = ?`,
            createdNote.title_key,
            createdNote.title,
            ctx.now(),
            ctx.projectId,
            createdNote.id,
          )
          for (const link of rebound) affected.push({ kind: 'link', id: link.id })
        }
        // Purge-safe, mirroring CreateNote↔TrashNote: the created note
        // may have gained inbound links or body text; trashing keeps
        // links and the title reservation intact. An ATTACHED note is
        // deliberately untouched.
        ctx.db.run(
          `UPDATE note
           SET lifecycle_state = 'trashed', trashed_at = ?, trashed_by_command_id = ?,
               updated_at = ?
           WHERE id = ?`,
          ctx.now(),
          envelope.commandId,
          ctx.now(),
          createdNote.id,
        )
        affected.push({ kind: 'note', id: createdNote.id })
      }

      // Internal inverse of a composite create: not redoable as one
      // step (redo re-issues CreatePin), so no inverse is offered.
      return { affected, inverse: null }
    },
  )

  registry.register<PlaceAsCardPayload>(COMMAND_PLACE_AS_CARD, 1, (ctx, payload) => {
    // §8.5 place-on-board (AI-IMP-086): appearance flip + placement
    // are one user act, so they commit as ONE transaction and revert
    // in one undo. Validation precedes the first write.
    for (const key of ['nodeId', 'canvasId', 'placementId'] as const) {
      if (typeof payload?.[key] !== 'string' || payload[key].length === 0) {
        throw new DomainError('VALIDATION_FAILED', `PlaceAsCard requires payload.${key}`)
      }
    }
    if (typeof payload.x !== 'number' || typeof payload.y !== 'number') {
      throw new DomainError('VALIDATION_FAILED', 'PlaceAsCard requires numeric x and y')
    }
    const canvas = ctx.db.get<{ id: string }>(
      `SELECT id FROM canvas
       WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
      payload.canvasId,
      ctx.projectId,
    )
    if (!canvas) throw new DomainError('CANVAS_NOT_FOUND', `no active canvas ${payload.canvasId}`)
    const node = ctx.db.get<AppearanceColumns>(
      `SELECT appearance_kind AS kind, appearance_color AS color,
              appearance_icon AS icon, appearance_asset_id AS assetId,
              appearance_crop AS crop
       FROM node
       WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
      payload.nodeId,
      ctx.projectId,
    )
    if (!node) throw new DomainError('NODE_NOT_FOUND', `no active node ${payload.nodeId}`)

    const now = ctx.now()
    const affected: AffectedRecord[] = []
    // AI-IMP-084 rule, verbatim: dots (and appearance-less nodes)
    // flip to the §4.6 card; icon/image nodes place as-is — their
    // look already represents them.
    const flips = node.kind === 'dot' || node.kind === null
    const priorAppearance = flips ? decodeAppearanceColumns(node) : null
    if (flips) {
      const card = prepareNodeAppearance(ctx, { kind: 'card' }, {
        allowedKinds: CARD_APPEARANCE_KIND,
        allowNull: false,
        kindMessage: 'appearance kind must be card',
      })
      updateNodeAppearance(ctx, payload.nodeId, card.columns, now)
      affected.push({ kind: 'node', id: payload.nodeId })
    }

    ctx.db.run(
      `INSERT INTO placement
         (id, project_id, canvas_id, node_id, x, y, width, height, scale,
          rotation, flip_x, flip_y, render_order, label_visible,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 1, 0, 0, 0, ?, 1, ?, ?)`,
      payload.placementId,
      ctx.projectId,
      payload.canvasId,
      payload.nodeId,
      payload.x,
      payload.y,
      nextRenderOrder(ctx, payload.canvasId),
      now,
      now,
    )
    affected.push({ kind: 'placement', id: payload.placementId })

    return {
      affected,
      inverse: {
        commandType: COMMAND_UNPLACE_CARD,
        commandVersion: 1,
        payload: {
          placementId: payload.placementId,
          nodeId: payload.nodeId,
          appearanceChanged: flips,
          priorAppearance,
        } satisfies UnplaceCardPayload,
      },
    }
  })

  registry.register<UnplaceCardPayload>(COMMAND_UNPLACE_CARD, 1, (ctx, payload) => {
    const placement = ctx.db.get<{ id: string; node_id: string }>(
      `SELECT id, node_id FROM placement
       WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
      payload.placementId,
      ctx.projectId,
    )
    if (!placement) {
      throw new DomainError('PLACEMENT_NOT_FOUND', `no active placement ${payload.placementId}`)
    }
    if (placement.node_id !== payload.nodeId) {
      throw new DomainError('VALIDATION_FAILED', 'placement does not belong to nodeId', {
        placementId: payload.placementId,
        nodeId: payload.nodeId,
      })
    }
    const node = ctx.db.get<{ appearance_kind: string | null }>(
      'SELECT appearance_kind FROM node WHERE id = ? AND project_id = ?',
      payload.nodeId,
      ctx.projectId,
    )
    if (!node) throw new DomainError('NODE_NOT_FOUND', `no node ${payload.nodeId}`)
    if (payload.appearanceChanged && node.appearance_kind !== 'card') {
      // The appearance moved on since the flip: an exact restore
      // would clobber the newer look (UnmakeNoteIndependent's
      // staleness discipline).
      throw new DomainError(
        'UNDO_STALE',
        'UnplaceCard expects the node to still wear the card it flipped to',
        { nodeId: payload.nodeId, appearanceKind: node.appearance_kind },
      )
    }

    let priorAppearance: PreparedAppearance | null = null
    if (payload.appearanceChanged) {
      priorAppearance = prepareNodeAppearance(ctx, payload.priorAppearance, {
        allowedKinds: UNPLACE_PRIOR_APPEARANCE_KINDS,
        allowNull: true,
        kindMessage: 'prior appearance must be dot or null',
      })
    }

    const affected: AffectedRecord[] = []
    const freed = releaseConnectorAnchors(ctx, payload.placementId)
    ctx.db.run('DELETE FROM placement WHERE id = ?', payload.placementId)
    affected.push({ kind: 'placement', id: payload.placementId })
    affected.push(...freed.map((id) => ({ kind: 'decoration' as const, id })))

    if (priorAppearance) {
      updateNodeAppearance(ctx, payload.nodeId, priorAppearance.columns)
      affected.push({ kind: 'node', id: payload.nodeId })
    }

    // Internal inverse of a composite: not redoable as one step (redo
    // re-issues PlaceAsCard), so no inverse is offered.
    return { affected, inverse: null }
  })
}

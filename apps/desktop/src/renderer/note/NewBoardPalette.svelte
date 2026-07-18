<!--
  New-board naming prompt (RFC §8.4, AI-IMP-239). The empty-board
  context menu's "New board…" verb opens this: the reusable command
  palette (CommandPalette) with CREATE-ONLY verbs — there is nothing to
  search, so `search` is empty and a typed name always offers the single
  highlighted Create row (plain Enter commits, Escape cancels via §8.3
  routing).

  Enter prepares renderer memory and hands a ⊡ ghost to S4 place mode.
  The seating click runs the house composition in ONE undo group:
    1. CreateNode            — the bare node.
    2. CreateNoteAndAttach   — names it. A node's name IS its attached
       note's title; the pin wizard names by creating a titled note
       (CreatePin's note:{kind:'create'}), and this is that same
       note-create-and-attach, issued standalone so the placement can
       come last (§6.2/§7.2 — no second naming mechanism).
    3. CreateCanvas          — the board the node is the inside of.
    4. CreatePlacement       — the board-object on the ORIGIN board.

  Nothing durable exists during carry, so Escape simply drops it. The
  placement is LAST on purpose: the undo group fences to its final
  command's canvas (undo-stack), so a single Mod+Z FROM THE ORIGIN board
  reverses the whole act. Recorded LIFO, undo runs
  DeleteDraftPlacement → DeleteDraftCanvas → DetachAndTrashNote →
  DeleteDraftNode, each landing on a state its draft-guard accepts. The
  node carries no explicit appearance — an appearance-less node renders
  as the default dot, exactly what a make-canvas placement shows — and
  the dive hint chip falls out of the node owning a canvas. Success dives;
  a refused seat rolls back its partial group and keeps the ghost.
-->
<script lang="ts">
  import { uuidv7 } from '@ew/domain'
  import type { CommandResult } from '@ew/commands'
  import type { CanvasHostHandle } from '../canvas/host'
  import { navigateTo } from '../chrome/navigation'
  import { rollbackLatestBirthAttempt, runAsUndoGroup } from '../undo/undo-store'
  import { finishPlaceMode, requestPlaceMode } from '../canvas/place-mode'
  import {
    nextBoardTitleVariant,
    trashedBoardOwner,
    type TrashedBoardOwner,
  } from '../canvas/board-birth'
  import BoardTitleConflictDialog from '../canvas/BoardTitleConflictDialog.svelte'
  import CommandPalette, { type PaletteItem } from './CommandPalette.svelte'

  let {
    handle,
    at,
    onclose,
  }: {
    handle: CanvasHostHandle
    /** World position of the right-click — where the board-object lands. */
    at: { x: number; y: number }
    onclose: () => void
  } = $props()

  // Create-only: there is no existing board to pick from this prompt, so
  // the palette shows no rows until a name is typed (§8.4 owner ruling —
  // functional surface, no search).
  async function search(): Promise<PaletteItem[]> {
    return []
  }

  function createLabel(query: string): string {
    return `New board “${query}”`
  }

  interface ConflictState {
    requestedTitle: string
    variantTitle: string
    owner: TrashedBoardOwner
    world: { x: number; y: number }
  }

  type BirthAttempt =
    | { kind: 'committed'; canvasId: string; title: string }
    | { kind: 'title-conflict'; result: CommandResult; owner: TrashedBoardOwner | null }
    | { kind: 'failed'; message: string }

  let carrying = $state(false)
  let conflict = $state<ConflictState | null>(null)

  function failureMessage(result: CommandResult, conflictMsg: string): string {
    if (result.status === 'error') {
      return result.code === 'NOTE_TITLE_CONFLICT' ? conflictMsg : result.message
    }
    return result.status === 'conflict'
      ? 'The project changed underneath — retry.'
      : `The board could not be created (${result.status}).`
  }

  async function availableVariant(title: string): Promise<string | null> {
    const response = await window.ew.project.query('listNoteTitles')
    if (!response.ok) return null
    const rows = response.result as Array<{ titleKey: string }>
    return nextBoardTitleVariant(title, rows.map((row) => row.titleKey))
  }

  async function attemptBirth(title: string, world: { x: number; y: number }): Promise<BirthAttempt> {
    const nodeId = uuidv7()
    const newCanvasId = uuidv7()
    const placementId = uuidv7()
    const noteId = uuidv7()
    const originCanvasId = handle.canvasId

    let failedResult: CommandResult | null = null
    let committedCount = 0
    await runAsUndoGroup(
      async (groupToken) => {
        const createdNode = await handle.gateway.execute('CreateNode', { nodeId }, { groupToken })
        if (createdNode.status !== 'committed') {
          failedResult = createdNode
          return
        }
        committedCount += 1
        const createdNote = await handle.gateway.execute(
          'CreateNoteAndAttach',
          { nodeId, noteId, title },
          { groupToken },
        )
        if (createdNote.status !== 'committed') {
          failedResult = createdNote
          return
        }
        committedCount += 1
        const createdCanvas = await handle.gateway.execute(
          'CreateCanvas',
          { canvasId: newCanvasId, nodeId },
          { groupToken },
        )
        if (createdCanvas.status !== 'committed') {
          failedResult = createdCanvas
          return
        }
        committedCount += 1
        const createdPlacement = await handle.gateway.execute(
          'CreatePlacement',
          {
            placementId,
            canvasId: originCanvasId,
            nodeId,
            x: world.x,
            y: world.y,
          },
          { groupToken },
        )
        if (createdPlacement.status !== 'committed') {
          failedResult = createdPlacement
          return
        }
        committedCount += 1
      },
      { birth: { originCanvasId, newbornCanvasId: newCanvasId, title } },
    )

    if (failedResult !== null) {
      if (committedCount > 0) await rollbackLatestBirthAttempt()
      const result: CommandResult = failedResult
      if (result.status === 'error' && result.code === 'NOTE_TITLE_CONFLICT') {
        return { kind: 'title-conflict', result, owner: trashedBoardOwner(result) }
      }
      return {
        kind: 'failed',
        message: failureMessage(result, 'A board with that name already exists — choose another.'),
      }
    }
    return { kind: 'committed', canvasId: newCanvasId, title }
  }

  async function completeBirth(result: Extract<BirthAttempt, { kind: 'committed' }>): Promise<void> {
    conflict = null
    onclose()
    await navigateTo(result.canvasId, result.title)
  }

  function createBoard(rawTitle: string): void {
    const title = rawTitle.trim()
    if (title.length === 0) return
    carrying = true
    requestPlaceMode({
      kind: 'board-birth',
      worldX: at.x,
      worldY: at.y,
      cancel: onclose,
      commit: async (world) => {
        const result = await attemptBirth(title, world)
        if (result.kind === 'committed') {
          await completeBirth(result)
          return { ok: true }
        }
        if (result.kind === 'title-conflict' && result.owner !== null) {
          const variantTitle = await availableVariant(title)
          if (variantTitle === null) {
            return { ok: false, message: 'The alternate board name could not be checked — retry.' }
          }
          conflict = { requestedTitle: title, variantTitle, owner: result.owner, world }
          return { ok: false, message: '' }
        }
        return {
          ok: false,
          message:
            result.kind === 'failed'
              ? result.message
              : failureMessage(
                  result.result,
                  'A board with that name already exists — choose another.',
                ),
        }
      },
    })
  }

  async function restoreBoard(): Promise<string | null> {
    const current = conflict
    if (current === null) return null
    const restored = await handle.gateway.execute('RestoreRecord', {
      kind: 'node',
      id: current.owner.nodeId,
    })
    if (restored.status !== 'committed') {
      return restored.status === 'error'
        ? `The board could not be restored: ${restored.message}`
        : 'The project changed underneath — retry restoring the board.'
    }
    finishPlaceMode()
    conflict = null
    onclose()
    await navigateTo(current.owner.canvasId, current.requestedTitle)
    return null
  }

  async function keepBoth(): Promise<string | null> {
    const current = conflict
    if (current === null) return null
    let candidate = current.variantTitle
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const result = await attemptBirth(candidate, current.world)
      if (result.kind === 'committed') {
        finishPlaceMode()
        await completeBirth(result)
        return null
      }
      if (result.kind === 'failed') return result.message
      const next = await availableVariant(current.requestedTitle)
      if (next === null) return 'The alternate board name could not be checked — retry.'
      candidate = next
      conflict = { ...current, variantTitle: candidate }
    }
    return 'The alternate board name kept changing — retry.'
  }

  function cancelConflict(): void {
    finishPlaceMode()
    conflict = null
    onclose()
  }
</script>

{#if !carrying}
  <CommandPalette
    testid="new-board"
    placeholder="Name your new board…"
    {search}
    {createLabel}
    oncommit={() => {}}
    oncreate={createBoard}
    {onclose}
  />
{/if}

{#if conflict}
  <BoardTitleConflictDialog
    requestedTitle={conflict.requestedTitle}
    variantTitle={conflict.variantTitle}
    onrestore={restoreBoard}
    onkeepboth={keepBoth}
    oncancel={cancelConflict}
  />
{/if}

<!--
  New-board naming prompt (RFC §8.4, AI-IMP-239). The empty-board
  context menu's "New board…" verb opens this: the reusable command
  palette (CommandPalette) with CREATE-ONLY verbs — there is nothing to
  search, so `search` is empty and a typed name always offers the single
  highlighted Create row (plain Enter commits, Escape cancels via §8.3
  routing).

  oncreate runs the house composition in ONE undo group, mirroring the
  §4.9 frame ritual (host.commitFrame):
    1. CreateNode            — the bare node.
    2. CreateNoteAndAttach   — names it. A node's name IS its attached
       note's title; the pin wizard names by creating a titled note
       (CreatePin's note:{kind:'create'}), and this is that same
       note-create-and-attach, issued standalone so the placement can
       come last (§6.2/§7.2 — no second naming mechanism).
    3. CreateCanvas          — the board the node is the inside of.
    4. CreatePlacement       — the board-object on the ORIGIN board.

  The placement is LAST on purpose: the undo group fences to its final
  command's canvas (undo-stack), so a single Mod+Z FROM THE ORIGIN board
  reverses the whole act. Recorded LIFO, undo runs
  DeleteDraftPlacement → DeleteDraftCanvas → DetachAndTrashNote →
  DeleteDraftNode, each landing on a state its draft-guard accepts. The
  node carries no explicit appearance — an appearance-less node renders
  as the default dot, exactly what a make-canvas placement shows — and
  the dive hint chip falls out of the node owning a canvas. On success we
  dive into the new board.
-->
<script lang="ts">
  import { uuidv7 } from '@ew/domain'
  import type { CanvasHostHandle } from '../canvas/host'
  import { navigateTo } from '../chrome/navigation'
  import { runAsUndoGroup } from '../undo/undo-store'
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

  let error = $state<string | null>(null)

  // Create-only: there is no existing board to pick from this prompt, so
  // the palette shows no rows until a name is typed (§8.4 owner ruling —
  // functional surface, no search).
  async function search(): Promise<PaletteItem[]> {
    return []
  }

  function createLabel(query: string): string {
    return `New board “${query}”`
  }

  /** A committed check that captures the first failure's user message. */
  function outcome(
    result: { status: string; code?: string; message?: string },
    conflictMsg: string,
  ): string | null {
    if (result.status === 'committed') return null
    if (result.status === 'error') {
      return result.code === 'NOTE_TITLE_CONFLICT' ? conflictMsg : (result.message ?? 'failed')
    }
    return 'The project changed underneath — retry.'
  }

  async function createBoard(rawTitle: string): Promise<void> {
    const title = rawTitle.trim()
    if (title.length === 0) return
    const nodeId = uuidv7()
    const newCanvasId = uuidv7()
    const placementId = uuidv7()
    const noteId = uuidv7()
    const originCanvasId = handle.canvasId
    const conflict = 'A board with that name already exists — choose another.'

    let failure: string | null = null
    // fail-stop (CA-007): inspect every result; the first non-commit
    // aborts the group before the next command. The group collapses to
    // whatever committed — every partial is a clean draft the single
    // recorded entry still undoes (matching host.commitFrame).
    await runAsUndoGroup(async (groupToken) => {
      failure = outcome(await handle.gateway.execute('CreateNode', { nodeId }, { groupToken }), conflict)
      if (failure !== null) return
      failure = outcome(
        await handle.gateway.execute('CreateNoteAndAttach', { nodeId, noteId, title }, { groupToken }),
        conflict,
      )
      if (failure !== null) return
      failure = outcome(
        await handle.gateway.execute('CreateCanvas', { canvasId: newCanvasId, nodeId }, { groupToken }),
        conflict,
      )
      if (failure !== null) return
      failure = outcome(
        await handle.gateway.execute('CreatePlacement', {
          placementId,
          canvasId: originCanvasId,
          nodeId,
          x: at.x,
          y: at.y,
        }, { groupToken }),
        conflict,
      )
    })

    if (failure !== null) {
      // Keep the palette open so the user can amend the name and retry.
      error = failure
      return
    }
    onclose()
    // §8.4 dive: never read items()/camera synchronously after this —
    // navigateTo applies the scene asynchronously (AI-IMP-113).
    await navigateTo(newCanvasId, title)
  }
</script>

<CommandPalette
  testid="new-board"
  placeholder="Name your new board…"
  {search}
  {createLabel}
  {error}
  oncommit={() => {}}
  oncreate={(query) => void createBoard(query)}
  {onclose}
/>

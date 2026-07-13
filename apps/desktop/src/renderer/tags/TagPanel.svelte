<!--
  Tag panel (RFC §4.8, AI-IMP-071): panel physics over the canvas,
  anchored to the summoning chip. A name-completing search field
  (exactly ONE tag in Phase 1; completion is a custom list, NOT a
  <datalist> — the native popup segfaults Electron's hidden e2e
  windows, AI-IMP-069) over project-wide carrier rows in the shared
  §7.4 grammar, unplaced carriers included with a loose badge.
  Per-row open-note and per-location fly-to; a cross-canvas fly-to is
  a navigation event (§8.1). The header lens toggle drives the §4.8/
  §7.5 dim-to-hits lens (072's host API) for the tag's carriers on
  the ACTIVE canvas and tracks onLensChanged so an engine-side drop
  (Escape) unsets it. Escape peels one layer per press: lens first,
  the panel next.
-->
<script lang="ts">
  import { tick } from 'svelte'
  import { nameKey, shortCode } from '@ew/domain'
  import NodeRow from '../rows/NodeRow.svelte'
  import TextInput from '../ui/TextInput.svelte'
  import Button from '../ui/Button.svelte'
  import type { CanvasHostHandle } from '../canvas/host'
  import { pointAnchor } from '../chrome/anchored-placement'
  import {
    placeAnchoredElement,
    type AnchoredElementOptions,
  } from '../chrome/anchored-placement-dom'
  import { navigateTo } from '../chrome/navigation'
  import { toast } from '../chrome/status'
  import { tooltip } from '../chrome/tooltip'
  import { requestCenterPlacements, requestOpenNote } from '../note/open-note'
  import { reserveTetheredPanelSpace } from '../note/panels'
  import { closeTagPanel, openTagPanel, type TagPanelState } from './tag-panel'
  import { contextMenuOpen } from '../menus/ContextMenu'
  import { runAsUndoGroup } from '../undo/undo-store'
  import { deleteLocalTag } from './tag-delete'
  import RemovableTagChip from './RemovableTagChip.svelte'

  interface TagViewPlacement {
    placementId: string
    canvasId: string
    canvasLabel: string
  }

  interface TagViewNode {
    id: string
    appearanceKind: string | null
    appearanceColor: string | null
    appearanceIcon: string | null
    noteId: string | null
    noteTitle: string | null
    childCanvasId: string | null
    placementCount: number
    otherTags: string[]
    placements: TagViewPlacement[]
  }

  interface TagView {
    tag: { id: string; name: string; color: string | null; icon: string | null }
    nodes: TagViewNode[]
  }

  const {
    handle,
    hostElement,
    panel,
  }: { handle: CanvasHostHandle; hostElement: HTMLElement; panel: TagPanelState } = $props()

  let view = $state<TagView | null>(null)
  let allTags = $state<Array<{ id: string; name: string }>>([])
  let search = $state('')
  let searchFocus = $state(false)
  let lensOn = $state(false)
  let activeCanvasId = $state(handle.canvasId)
  let errorMessage = $state<string | null>(null)

  // AI-IMP-171: rename THIS tag. The pencil swaps the completion
  // switcher region into an editor for the current name — a distinct
  // verb from the switcher (which pivots to ANOTHER tag), so it carries
  // its own placeholder and the pencil's pressed state.
  let editing = $state(false)
  let renameValue = $state('')
  let renameBusy = $state(false)
  let renameInput = $state<HTMLInputElement | null>(null)

  // AI-IMP-271: explicit delete scope. Preflight may open the designated
  // library slot but never syncs; an unavailable library stays a visible
  // disabled reason instead of becoming an open-time error dialog.
  let deleteOpen = $state(false)
  let deleteBusy = $state(false)
  let libraryChecking = $state(false)
  let libraryReachable = $state(false)
  let libraryReason = $state<string | null>(null)
  let deleteCheck = 0

  // Same §8.5 point grammar as the location chooser: client coords of
  // the summoning control, placed from the panel's measured dimensions.
  function placement(current: TagPanelState): AnchoredElementOptions {
    const bounds = hostElement.getBoundingClientRect()
    return {
      anchor: current.anchor
        ? pointAnchor(current.anchor.x - bounds.left, current.anchor.y - bounds.top)
        : pointAnchor(bounds.width / 2, 80),
      host: { x: 0, y: 0, width: bounds.width, height: bounds.height },
      x: { preferred: current.anchor ? 'start' : 'center' },
      y: { preferred: current.anchor ? 'after' : 'start', fallback: 'before' },
      gap: { y: current.anchor ? 6 : 0 },
      margin: 8,
    }
  }

  async function runQuery<T>(name: string, args?: unknown): Promise<T> {
    const response = await window.ew.project.query(name, args)
    if (!response.ok) throw new Error(response.message)
    return response.result as T
  }

  async function refresh(): Promise<void> {
    const tagId = panel.tagId
    try {
      const [nextView, tags] = await Promise.all([
        runQuery<TagView | null>('getTagView', { tagId }),
        runQuery<Array<{ id: string; name: string }>>('listTags'),
      ])
      if (panel.tagId !== tagId) return // re-targeted underneath
      allTags = tags
      view = nextView
      errorMessage = nextView === null ? 'this tag no longer exists' : null
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err)
    }
  }

  // Reopen/re-target replaces the tag: reload and reset the field to
  // the tag's name; a lens left on retargets to the new carrier set.
  $effect(() => {
    const tagId = panel.tagId
    void refresh().then(() => {
      if (panel.tagId !== tagId) return
      search = view?.tag.name ?? ''
      if (lensOn) applyLens()
    })
  })
  // Project changes replace the view; a lens left on must retarget to
  // the NEW carrier set or it keeps dimming yesterday's placements.
  $effect(() =>
    window.ew.project.onChanged(() =>
      void refresh().then(() => {
        if (lensOn) applyLens()
      }),
    ),
  )
  $effect(() => handle.onSceneApplied(() => (activeCanvasId = handle.canvasId)))

  function completions(): Array<{ id: string; name: string }> {
    const needle = search.toLowerCase()
    return allTags.filter(
      (tag) => tag.name.toLowerCase().startsWith(needle) && tag.name !== search,
    )
  }

  function pickTag(tag: { id: string; name: string }): void {
    if (tag.id !== panel.tagId) openTagPanel(tag.id, panel.anchor)
    search = tag.name
  }

  function onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      const exact = allTags.find((tag) => tag.name.toLowerCase() === search.toLowerCase())
      if (exact) pickTag(exact)
    }
  }

  // ------------------------------------------------------ §4.8 rename
  async function startRename(): Promise<void> {
    if (!view) return
    renameValue = view.tag.name
    editing = true
    await tick()
    renameInput?.focus()
    renameInput?.select()
  }

  // Return to the switcher, discarding the edit (Escape, blur, or the
  // pencil toggled off). Non-destructive: only Enter commits.
  function cancelRename(): void {
    editing = false
  }

  // The pencil is one toggle. pointerdown+preventDefault keeps the
  // rename input's focus, so toggling off never counts as a stray blur
  // (and never bounces through the click that would re-open it).
  function toggleRename(event: PointerEvent): void {
    event.preventDefault()
    if (editing) cancelRename()
    else void startRename()
  }

  // §4.8: identity is independent of name; the raw name goes to the
  // handler, which owns name_key discipline. Enter commits; a
  // TAG_NAME_CONFLICT names the collision in a toast and keeps the
  // editor open so the user can retype.
  async function commitRename(): Promise<void> {
    if (renameBusy || !view) return
    const name = renameValue.trim()
    if (name.length === 0 || name === view.tag.name) {
      cancelRename()
      return
    }
    renameBusy = true
    try {
      // AI-IMP-182: one Mod+Z per tag rename (RenameTag is GROUP_ONLY,
      // captured at this deliberate gesture; its inverse restores the
      // prior name).
      const result = await runAsUndoGroup((groupToken) =>
        handle.gateway.execute('RenameTag', { tagId: panel.tagId, name }, { groupToken }),
      )
      if (result.status === 'committed') {
        // Reflect the new name in the switcher at once; live surfaces
        // (chips, vocabulary, this panel's view) follow on onChanged.
        search = name
        editing = false
        return
      }
      if (result.status === 'error' && result.code === 'TAG_NAME_CONFLICT') {
        toast(`A tag named "${name}" already exists`, { kind: 'error' })
        return
      }
      const message =
        result.status === 'error' ? result.message : 'the project changed underneath (retry)'
      toast(message, { kind: 'error' })
    } finally {
      renameBusy = false
    }
  }

  function onRenameKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      void commitRename()
    }
    // Escape is consumed by the window-capture handler below (it must
    // preempt the panel's lens/close Escape and never leak to the
    // canvas — the search-palette Escape pattern).
  }

  // ------------------------------------------------------ §4.8 delete
  async function openDeleteDialog(): Promise<void> {
    if (!view || deleteBusy) return
    cancelRename()
    deleteOpen = true
    libraryChecking = true
    libraryReachable = false
    libraryReason = null
    const check = ++deleteCheck
    try {
      const availability = await window.ew.tagSync.libraryAvailability()
      if (!deleteOpen || check !== deleteCheck) return
      libraryReachable = availability.available
      libraryReason = availability.available ? null : availability.reason
    } catch {
      if (!deleteOpen || check !== deleteCheck) return
      libraryReason = 'Library unavailable — try again after reopening it'
    } finally {
      if (deleteOpen && check === deleteCheck) libraryChecking = false
    }
  }

  function closeDeleteDialog(): void {
    if (deleteBusy) return
    deleteOpen = false
    deleteCheck += 1
  }

  function resultMessage(result: { status: string; message?: string }): string {
    return result.status === 'error' && result.message
      ? result.message
      : result.status === 'conflict'
        ? 'the project changed underneath (retry)'
        : 'the tag could not be deleted'
  }

  function deleteNotice(message: string): void {
    window.dispatchEvent(new CustomEvent('ew-board-notice', { detail: { message } }))
  }

  async function commitDelete(scope: 'project' | 'library'): Promise<void> {
    if (deleteBusy || !view || (scope === 'library' && !libraryReachable)) return
    deleteBusy = true
    const tag = view.tag
    const key = nameKey(tag.name)
    try {
      const local = await deleteLocalTag(
        (type, payload, options) => handle.gateway.execute(type, payload, options),
        (run) => runAsUndoGroup((token) => run(token)),
        tag.id,
        key,
      )
      if (local.deleted.status !== 'committed') {
        toast(resultMessage(local.deleted), { kind: 'error' })
        return
      }
      const suppressionAlreadyExisted =
        local.suppressed?.status === 'error' &&
        local.suppressed.code === 'TAG_SYNC_ALREADY_SUPPRESSED'
      // Preserve a suppression that predates this gesture. The local undo
      // correctly restores only the tag and does not erase that earlier state.
      if (local.suppressed?.status !== 'committed' && !suppressionAlreadyExisted) {
        deleteNotice(
          `“${tag.name}” was deleted here, but sync suppression failed — it may return on the next sync`,
        )
        closeTagPanel()
        return
      }

      // Close before the narrow cross-project write so live refresh cannot
      // turn the panel into a stale "tag no longer exists" shell.
      closeTagPanel()
      if (scope === 'project') return

      try {
        const library = await window.ew.tagSync.deleteLibraryTag(key)
        if (library.ok) return
        deleteNotice(
          `“${tag.name}” was deleted from this project, but not from the library — ${library.message}`,
        )
      } catch (err) {
        deleteNotice(
          `“${tag.name}” was deleted from this project, but not from the library — ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), { kind: 'error' })
    } finally {
      deleteBusy = false
    }
  }

  // ------------------------------------------------------ §4.8 lens
  const activePlacementIds = $derived(
    view?.nodes.flatMap((node) =>
      node.placements
        .filter((placement) => placement.canvasId === activeCanvasId)
        .map((placement) => placement.placementId),
    ) ?? [],
  )

  function applyLens(): void {
    if (activePlacementIds.length === 0) {
      handle.clearLens()
      lensOn = false
      return
    }
    handle.setLens(activePlacementIds)
    lensOn = true
  }

  function toggleLens(): void {
    if (lensOn) {
      handle.clearLens()
      lensOn = false
    } else {
      applyLens()
    }
  }

  // The lens is engine view state: Escape (or a scene reapply that
  // empties the set) drops it there — the toggle follows.
  $effect(() =>
    handle.onLensChanged((ids) => {
      if (ids === null) lensOn = false
    }),
  )

  // Layered Escape, one layer per press. The rename editor peels FIRST
  // and CONSUMES the press (capture + stopPropagation, the
  // search-palette pattern) so the edit cancels without leaking to the
  // canvas or peeling the lens/closing the panel underneath. With no
  // editor: an active lens peels first (the host's own keydown handler
  // does it — we just decline the event); with no lens the panel closes
  // and CONSUMES the press so the host does not also clear the
  // selection underneath.
  $effect(() => {
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // AI-IMP-183 (M-13): a right-click context menu (document-capture)
      // is the topmost surface — DECLINE so its own handler peels first
      // rather than this window-capture panel stealing the press.
      if (contextMenuOpen()) return
      // AI-IMP-183 (M-28): consume with stopImmediatePropagation so a
      // sibling window-capture panel (search) does not ALSO close on the
      // same press — exactly one floating panel peels per Escape.
      if (deleteOpen) {
        event.stopImmediatePropagation()
        closeDeleteDialog()
        return
      }
      if (editing) {
        event.stopImmediatePropagation()
        cancelRename()
        return
      }
      if (handle.lens() !== null) return
      event.stopImmediatePropagation()
      closeTagPanel()
    }
    window.addEventListener('keydown', onKeydown, true)
    return () => window.removeEventListener('keydown', onKeydown, true)
  })

  // ------------------------------------------------------ row actions
  function rowLabel(node: TagViewNode): string {
    return node.noteTitle ?? shortCode(node.id)
  }

  /** Fly-to: same canvas selects and centers through the workspace
   * seam; cross-canvas is a §8.1 navigation event FIRST, then the
   * same seam centers once the destination scene applies (it waits,
   * bounded). */
  async function flyTo(placement: TagViewPlacement): Promise<void> {
    if (placement.canvasId !== handle.canvasId)
      await navigateTo(placement.canvasId, placement.canvasLabel)
    // If a tethered note panel is open, the fly keeps it — reserve its
    // band so the framed placement lands beside it (AI-IMP-100). No-op
    // when nothing is tethered.
    reserveTetheredPanelSpace()
    requestCenterPlacements([placement.placementId])
  }

  async function removeCarrier(nodeId: string): Promise<void> {
    if (!view) return
    const result = await handle.gateway.execute('UnassignTagFromNode', {
      tagId: view.tag.id,
      nodeId,
    })
    if (result.status !== 'committed') {
      errorMessage = result.status === 'error' ? result.message : 'the project changed underneath (retry)'
      return
    }
    await refresh()
  }
</script>

<div
  class="tag-panel"
  data-testid="tag-panel"
  use:placeAnchoredElement={() => placement(panel)}
>
  <header>
    <span class="hash">#</span>
    <span class="field-wrap">
      {#if editing}
        <TextInput
          variant="pill"
          data-testid="tag-panel-rename-input"
          placeholder="rename this tag…"
          style="width: 100%"
          bind:ref={renameInput}
          bind:value={renameValue}
          onkeydown={onRenameKeydown}
          onblur={cancelRename}
        />
      {:else}
        <TextInput
          variant="pill"
          data-testid="tag-panel-input"
          placeholder="tag…"
          style="width: 100%"
          bind:value={search}
          onfocus={() => (searchFocus = true)}
          onblur={() => (searchFocus = false)}
          onkeydown={onSearchKeydown}
        />
        {#if searchFocus && search && completions().length > 0}
          <span class="tag-completions" data-testid="tag-panel-completions">
            {#each completions() as tag (tag.id)}
              <button
                type="button"
                data-testid="tag-panel-option"
                onpointerdown={(e) => {
                  e.preventDefault()
                  pickTag(tag)
                }}
              >
                {tag.name}
              </button>
            {/each}
          </span>
        {/if}
      {/if}
    </span>
    <button
      type="button"
      class="rename-toggle"
      class:on={editing}
      aria-pressed={editing}
      data-testid="tag-panel-rename"
      disabled={!view}
      onpointerdown={toggleRename}
      use:tooltip={{ name: 'Rename this tag' }}
    >
      ✎
    </button>
    <button
      type="button"
      class="lens-toggle"
      class:on={lensOn}
      aria-pressed={lensOn}
      data-testid="tag-panel-lens"
      disabled={!lensOn && activePlacementIds.length === 0}
      onclick={toggleLens}
      use:tooltip={{
        name: lensOn
          ? 'Lens on · esc'
          : activePlacementIds.length === 0
            ? 'No carriers on this board'
            : 'Lens — dim everything but this tag',
      }}
    >
      ◐
    </button>
    <button
      type="button"
      class="delete-toggle"
      data-testid="tag-delete-open"
      disabled={!view || deleteBusy}
      onclick={() => void openDeleteDialog()}
      use:tooltip={{ name: 'Delete tag…' }}
    >
      ⌫
    </button>
    <button
      type="button"
      class="close"
      data-testid="tag-panel-close"
      aria-label="Close"
      onclick={closeTagPanel}
      use:tooltip={{ name: 'Close' }}
    >
      ✕
    </button>
  </header>

  {#if deleteOpen && view}
    <div
      class="delete-dialog"
      role="dialog"
      aria-label="Delete tag"
      tabindex="-1"
      data-testid="tag-delete-dialog"
    >
      <p>Delete <strong>#{view.tag.name}</strong> from:</p>
      <div class="delete-actions">
        <Button
          variant="danger"
          data-testid="tag-delete-project"
          disabled={deleteBusy}
          onclick={() => void commitDelete('project')}
        >Delete from this project</Button>
        <Button
          variant="danger"
          data-testid="tag-delete-library"
          disabled={deleteBusy || libraryChecking || !libraryReachable}
          onclick={() => void commitDelete('library')}
        >Delete from project and library</Button>
        {#if libraryChecking}
          <span class="delete-reason" data-testid="tag-delete-library-reason">Checking library…</span>
        {:else if libraryReason}
          <span class="delete-reason" data-testid="tag-delete-library-reason">{libraryReason}</span>
        {/if}
        <Button
          variant="secondary"
          data-testid="tag-delete-cancel"
          disabled={deleteBusy}
          onclick={closeDeleteDialog}
        >Cancel</Button>
      </div>
    </div>
  {/if}

  {#if errorMessage}
    <p class="error" role="alert">{errorMessage}</p>
  {:else if view}
    {#if view.nodes.length === 0}
      <p class="empty" data-testid="tag-panel-empty">No nodes carry this tag.</p>
    {/if}
    <ul class="carriers">
      {#each view.nodes as node (node.id)}
        <li class="carrier" data-testid="tag-panel-row" data-node-id={node.id}>
          <div class="carrier-main">
            <NodeRow
              appearance={node}
              label={rowLabel(node)}
              count={node.placementCount > 1 ? node.placementCount : null}
              tags={node.otherTags}
              hasNote={node.noteId !== null}
              hasCanvas={node.childCanvasId !== null}
            >
              {#snippet extra()}
                <RemovableTagChip
                  testid={`tag-carrier-chip-${node.id}`}
                  name={view.tag.name}
                  color={view.tag.color}
                  onremove={() => void removeCarrier(node.id)}
                />
                {#if node.placements.length === 0}
                  <span class="badge" data-testid="badge-loose">loose</span>
                {/if}
              {/snippet}
            </NodeRow>
            {#if node.noteId !== null}
              <button
                type="button"
                class="action"
                data-testid={`tag-row-note-${node.id}`}
                onclick={() => requestOpenNote(node.noteId!)}
                use:tooltip={{ name: 'Open note' }}
              >
                ¶
              </button>
            {/if}
          </div>
          {#each node.placements as placement (placement.placementId)}
            <button
              type="button"
              class="location"
              data-testid={`tag-row-fly-${placement.placementId}`}
              onclick={() => void flyTo(placement)}
              use:tooltip={{ name: 'Fly to this placement' }}
            >
              <span class="glyph">⌖</span>
              <span class="loc-label">{placement.canvasLabel}</span>
              {#if placement.canvasId === activeCanvasId}
                <span class="here">here</span>
              {/if}
            </button>
          {/each}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .tag-panel {
    position: absolute;
    /* rung: popover (Z.popover = 500). Was a pre-ladder 9; the §4.8
       tag panel is an anchored floating surface that outranks the
       note panels it is opened FROM (ported with the AI-IMP-161
       inversion fix — the note editor was eating its clicks). */
    z-index: 500;
    width: 320px;
    max-height: 290px;
    overflow: auto;
    padding: 0.45rem 0.55rem 0.55rem;
    background: var(--ew-surface-menu);
    border: 1px solid var(--ew-border);
    border-radius: 9px;
    box-shadow: 0 6px 22px var(--ew-shadow);
    pointer-events: auto;
    font-size: 0.78rem;
    color: var(--ew-text);
  }

  header {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .hash {
    flex: none;
    color: var(--ew-text-muted);
    font-weight: 600;
  }

  .field-wrap {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  .tag-completions {
    position: absolute;
    top: calc(100% + 0.2rem);
    left: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    min-width: 8rem;
    background: var(--ew-surface-menu);
    border: 1px solid var(--ew-border);
    border-radius: 6px;
    overflow: hidden;
  }

  .tag-completions button {
    padding: 0.2rem 0.55rem;
    background: transparent;
    border: none;
    color: var(--ew-text);
    font-size: 0.72rem;
    text-align: left;
    cursor: pointer;
  }

  .tag-completions button:hover {
    background: var(--ew-surface-raised);
  }

  .lens-toggle,
  .rename-toggle,
  .delete-toggle,
  .close {
    flex: none;
    min-width: 22px;
    height: 22px;
    padding: 0 4px;
    background: var(--ew-surface-raised);
    color: var(--ew-text);
    border: 1px solid var(--ew-border-strong);
    border-radius: 5px;
    cursor: pointer;
    font-size: 12px;
  }

  .lens-toggle.on,
  .rename-toggle.on {
    background: var(--ew-accent);
    border-color: var(--ew-accent);
    color: var(--ew-on-accent);
  }

  .lens-toggle:disabled,
  .rename-toggle:disabled,
  .delete-toggle:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .close {
    border: none;
    background: transparent;
    color: var(--ew-text-muted);
  }

  .delete-dialog {
    margin-top: 0.45rem;
    padding: 0.55rem;
    border: 1px solid var(--ew-border-strong);
    border-radius: 7px;
    background: var(--ew-surface-raised);
  }

  .delete-dialog p {
    margin: 0 0 0.45rem;
  }

  .delete-actions {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.35rem;
  }

  .delete-reason {
    color: var(--ew-text-muted);
    font-size: 0.7rem;
    line-height: 1.25;
  }

  .error {
    margin: 0.4rem 0 0;
    color: var(--ew-danger);
  }

  .empty {
    margin: 0.4rem 0 0;
    color: var(--ew-text-muted);
  }

  .carriers {
    margin: 0.4rem 0 0;
    padding: 0;
    list-style: none;
  }

  .carrier {
    padding: 0.2rem 0;
    border-top: 1px solid var(--ew-border);
  }

  .carrier-main {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
  }

  .carrier-main :global(.node-row) {
    flex: 1;
    min-width: 0;
  }

  .action {
    flex: none;
    min-width: 20px;
    height: 20px;
    padding: 0 4px;
    background: transparent;
    color: var(--ew-text-muted);
    border: 1px solid var(--ew-border-strong);
    border-radius: 5px;
    cursor: pointer;
    font-size: 11px;
  }

  .action:hover {
    color: var(--ew-text);
    background: var(--ew-surface-raised);
  }

  .location {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    width: 100%;
    margin-top: 0.1rem;
    padding: 0.1rem 0.3rem 0.1rem 1rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--ew-text-muted);
    font: inherit;
    font-size: 0.72rem;
    text-align: left;
    cursor: pointer;
  }

  .location:hover {
    background: var(--ew-surface-raised);
    color: var(--ew-text);
  }

  .glyph {
    flex: none;
  }

  .loc-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .here {
    flex: none;
    padding: 0 0.35rem;
    border-radius: 7px;
    background: var(--ew-surface-raised);
    font-size: 0.62rem;
  }

  .badge {
    flex: none;
    padding: 0 0.35rem;
    border-radius: 7px;
    background: var(--ew-surface-raised);
    border: 1px solid var(--ew-border-strong);
    color: var(--ew-warn);
    font-size: 0.62rem;
  }
</style>

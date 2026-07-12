<!--
  Outliner control panel shell (RFC §14.1, AI-IMP-274): the org
  tree and flat cleanup worklists live in the master pane; one stable
  selection feeds the preview pane (AI-IMP-275). Rows select and
  navigate — they never become text fields. The existing placement,
  drag, dive, open-note, alias-flight, and loose-note Trash seams are
  retained while the surface adopts the outliner grammar.
-->
<script lang="ts">
  import { tick } from 'svelte'
  import type { CommandExecutionOptions } from '@ew/canvas-engine'
  import { NODE_DRAG_MIME, NOTE_DRAG_MIME } from '../canvas/import-surfaces'
  import { closeTakeover } from '../chrome/takeover'
  import { navigateTo } from '../chrome/navigation'
  import { toast } from '../chrome/status'
  import { tooltip } from '../chrome/tooltip'
  import {
    requestCenterPlacements,
    requestOpenNote,
    requestPlaceNode,
    requestPlaceNote,
  } from '../note/open-note'
  import { createNoteProjectPort } from '../note/project-port'
  import type { ProjectPort } from '../note/note-editor'
  import TagAddField from '../tags/TagAddField.svelte'
  import TextInput from '../ui/TextInput.svelte'
  import { disabled, enabled, type OutlineActionBag } from '../outline/actions'
  import { createOutlineActionDoors } from '../outline/inventory'
  import { Z } from '../z'
  import OutlineContextMenu from './OutlineContextMenu.svelte'
  import OutlinePreview from './OutlinePreview.svelte'
  import OutlineTrashConfirm from './OutlineTrashConfirm.svelte'
  import {
    OutlineData,
    type OutlineFilmstrip,
    type OutlineFacetCounts,
    type OutlinePreview as OutlinePreviewModel,
  } from './outline-data'
  import {
    buildOutlineRows,
    type OutlineCanvas,
    type OutlineFacet,
    type OutlineLibraryNode,
    type OutlineLooseNote,
    type OutlineViewRow,
  } from './outline-model'

  const EMPTY_COUNTS: OutlineFacetCounts = {
    all: 0,
    unplaced: 0,
    orphans: 0,
    disconnected: 0,
    untagged: 0,
  }

  const FACETS: Array<{ id: OutlineFacet; label: string }> = [
    { id: 'all', label: 'all' },
    { id: 'unplaced', label: 'unplaced' },
    { id: 'orphans', label: 'orphans' },
    { id: 'disconnected', label: 'disconnected' },
    { id: 'untagged', label: 'untagged' },
  ]

  let canvases = $state<OutlineCanvas[]>([])
  let unplacedNodes = $state<OutlineLibraryNode[]>([])
  let looseNotes = $state<OutlineLooseNote[]>([])
  let facetCounts = $state<OutlineFacetCounts>(EMPTY_COUNTS)
  let errorMessage = $state<string | null>(null)
  let refreshToken = $state(0)

  // Facets, query, fold, selection, and lens are view state only.
  let facet = $state<OutlineFacet>('all')
  let query = $state('')
  let expanded = $state<Record<string, boolean>>({})
  let selectedKey = $state<string | null>(null)
  let lensTag = $state<string | null>(null)
  let previewModel = $state<OutlinePreviewModel | null>(null)
  let filmstrip = $state<OutlineFilmstrip | null>(null)
  let previewLoading = $state(false)
  let previewRequest = 0
  let tagging = $state(false)
  let menuPoint = $state<{ x: number; y: number } | null>(null)
  interface NodeImpact {
    placementCount: number
    tagCount: number
    ownedCanvasId: string | null
    ownedCanvasPlacementCount: number
    ownedCanvasDecorationCount: number
  }
  let trashImpact = $state<NodeImpact | null>(null)
  let trashBusy = $state(false)
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  const outlineData = new OutlineData((name, args) => window.ew.project.query(name, args))

  const rows = $derived(
    buildOutlineRows({ canvases, unplacedNodes, looseNotes, facet, query, expanded }),
  )
  const selectedRow = $derived(rows.find((row) => row.key === selectedKey) ?? rows[0] ?? null)
  const cleanupActive = $derived(facet !== 'all')
  const actionDoors = $derived(
    selectedRow
      ? createOutlineActionDoors(actionBag(selectedRow, previewModel), (intent) => {
          if (intent === 'fold') toggle(selectedRow)
          else if (intent === 'return') closeTakeover()
          else if (intent === 'cursor-up') moveCursor(-1)
          else if (intent === 'cursor-down') moveCursor(1)
          else if (intent === 'cursor-left') cursorLeft()
          else if (intent === 'cursor-right') cursorRight()
        })
      : null,
  )

  async function runQuery<T>(name: string, args?: unknown): Promise<T> {
    const response = await window.ew.project.query(name, args)
    if (!response.ok) throw new Error(response.message)
    return response.result as T
  }

  async function refresh(): Promise<void> {
    try {
      const [tree, unplaced, loose, counts] = await Promise.all([
        runQuery<OutlineCanvas[]>('getOutlineTree'),
        runQuery<OutlineLibraryNode[]>('listNodeLibrary', { filter: 'unplaced' }),
        runQuery<OutlineLooseNote[]>('listLooseNotes'),
        outlineData.getFacetCounts(),
        outlineData.refreshRevision(),
      ])
      canvases = tree
      unplacedNodes = unplaced
      looseNotes = loose
      facetCounts = counts
      refreshToken += 1
      errorMessage = null
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err)
    }
  }

  $effect(() => {
    void refresh()
    return window.ew.project.onChanged(() => void refresh())
  })

  $effect(() => {
    const row = selectedRow
    const token = refreshToken
    tagging = false
    menuPoint = null
    if (!row || row.selection.kind === 'bin') {
      previewModel = null
      filmstrip = null
      previewLoading = false
      return
    }
    const request = ++previewRequest
    previewLoading = true
    void (async () => {
      try {
        const target =
          row.selection.kind === 'note'
            ? { kind: 'note' as const, noteId: row.selection.noteId }
            : { kind: 'node' as const, nodeId: row.selection.nodeId! }
        const model = await outlineData.getPreview(target)
        if (request !== previewRequest || token !== refreshToken) return
        previewModel = model
        filmstrip = model?.childCanvasId
          ? await outlineData.getFilmstrip(model.childCanvasId)
          : null
        if (request !== previewRequest || token !== refreshToken) return
      } catch (err) {
        if (request === previewRequest) {
          previewModel = null
          filmstrip = null
          errorMessage = err instanceof Error ? err.message : String(err)
        }
      } finally {
        if (request === previewRequest) previewLoading = false
      }
    })()
  })

  $effect(() => {
    if (rows.length === 0) {
      selectedKey = null
      return
    }
    if (!rows.some((row) => row.key === selectedKey)) selectedKey = rows[0]!.key
  })

  // §9.2 loose-note exit (AI-IMP-260), still through the command
  // gateway seam. Trash is recovery-home exempt, never local undo.
  let commandPort: ProjectPort | null = null
  let disposeCommandPort: (() => void) | null = null
  $effect(() => () => {
    disposeCommandPort?.()
    disposeCommandPort = null
    commandPort = null
  })

  async function projectPort(): Promise<ProjectPort> {
    if (commandPort) return commandPort
    const { port, dispose } = await createNoteProjectPort()
    commandPort = port
    disposeCommandPort = dispose
    return port
  }

  async function trashLooseNote(note: OutlineLooseNote): Promise<void> {
    const result = await (await projectPort()).execute('TrashNote', { noteId: note.id })
    if (result.status === 'committed') toast(`“${note.title}” moved to Trash`)
    else if (result.status === 'error') toast(result.message, { kind: 'error' })
    else toast('the project changed underneath (retry)', { kind: 'error' })
  }

  async function flyTo(model: OutlinePreviewModel): Promise<void> {
    const place = model.places[0]
    if (!place) return
    closeTakeover()
    await navigateTo(place.canvasId, place.canvasLabel)
    requestCenterPlacements([place.placementId])
  }

  async function askTrash(row: OutlineViewRow): Promise<void> {
    if (row.kind === 'root' || row.kind === 'bin') return
    if (row.note) {
      await trashLooseNote(row.note)
      return
    }
    if (!row.selection.nodeId) return
    const impact = await runQuery<NodeImpact | null>('getNodeImpact', {
      nodeId: row.selection.nodeId,
    })
    if (!impact) {
      toast('This node is no longer available', { kind: 'error' })
      return
    }
    trashImpact = impact
  }

  async function confirmTrash(): Promise<void> {
    const row = selectedRow
    if (!row?.selection.nodeId || row.kind === 'root' || trashBusy) return
    trashBusy = true
    try {
      const result = await (await projectPort()).execute('TrashNode', {
        nodeId: row.selection.nodeId,
      })
      if (result.status === 'committed') {
        toast(`“${row.title}” moved to Trash`)
        trashImpact = null
      } else {
        toast(result.status === 'error' ? result.message : 'the project changed underneath (retry)', {
          kind: 'error',
        })
      }
    } finally {
      trashBusy = false
    }
  }

  function actionBag(row: OutlineViewRow, model: OutlinePreviewModel | null): OutlineActionBag {
    if (row.kind === 'bin') {
      return { trash: disabled('the loose bin cannot be moved to trash') }
    }
    const bag: OutlineActionBag = {}
    const canvasId = model?.childCanvasId ?? row.canvas?.canvasId ?? row.aliasCanvasId
    if (canvasId) bag.dive = enabled(() => dive(canvasId, row.title))
    else if (row.note) bag.place = enabled(() => placeNoteOnBoard(row.note!.id))
    else if (row.selection.nodeId) {
      bag.place = enabled(() => placeNodeOnBoard(row.selection.nodeId!))
    }
    if (model && model.places.length > 0) bag.flyTo = enabled(() => void flyTo(model))
    else bag.flyTo = disabled('no placements to fly to')
    if (model?.noteId) bag.openNote = enabled(() => openNote(model.noteId!))
    else if (row.note) bag.openNote = enabled(() => openNote(row.note!.id))
    else if (row.selection.nodeId) {
      bag.addNote = enabled(() => {
        document.querySelector<HTMLInputElement>('[data-testid="outline-note-capture"]')?.focus()
      })
    }
    bag.tag =
      row.selection.nodeId
        ? enabled(() => (tagging = true))
        : disabled('tags belong to nodes, not loose notes')
    bag.trash =
      row.kind === 'root'
        ? disabled('the root board cannot be moved to trash')
        : enabled(() => void askTrash(row))
    return bag
  }

  async function executeCommand(commandType: string, payload: unknown, options?: CommandExecutionOptions) {
    return (await projectPort()).execute(commandType, payload, options)
  }

  function openRowMenu(event: MouseEvent | PointerEvent, row: OutlineViewRow): void {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    selectedKey = row.key
    menuPoint = { x: event.clientX, y: event.clientY }
  }

  function beginLongPress(event: PointerEvent, row: OutlineViewRow): void {
    if (event.pointerType !== 'touch') return
    cancelLongPress()
    longPressTimer = setTimeout(() => {
      longPressTimer = null
      openRowMenu(event, row)
    }, 550)
  }

  function cancelLongPress(): void {
    if (longPressTimer) clearTimeout(longPressTimer)
    longPressTimer = null
  }

  $effect(() => {
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && trashImpact) {
        event.preventDefault()
        event.stopImmediatePropagation()
        trashImpact = null
        return
      }
      if (event.key === 'Escape' && menuPoint) {
        event.preventDefault()
        event.stopImmediatePropagation()
        menuPoint = null
        return
      }
      if (event.key === 'Escape' && tagging) {
        event.preventDefault()
        event.stopImmediatePropagation()
        tagging = false
        return
      }
      if (event.key === 'Escape' && lensTag) {
        event.preventDefault()
        event.stopImmediatePropagation()
        lensTag = null
        return
      }
      // Dialog gate (AI-IMP-277): while the trash confirm, row menu,
      // or tag popover is open, that surface owns every key except the
      // Escape closes above — this capture listener must not move the
      // cursor or fire verbs at the row underneath.
      if (trashImpact || menuPoint || tagging) return
      const result = actionDoors?.keyboard.handle(event)
      if (result?.handled) {
        event.stopImmediatePropagation()
        if (result.disabledReason) toast(result.disabledReason)
      }
    }
    window.addEventListener('keydown', onKeydown, true)
    return () => window.removeEventListener('keydown', onKeydown, true)
  })

  $effect(() => {
    if (!menuPoint) return
    const close = (): void => (menuPoint = null)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  })

  function toggle(row: OutlineViewRow): void {
    if (!row.branchKey || !row.canFold) return
    expanded[row.branchKey] = !row.expanded
  }

  function scrollCursorIntoView(): void {
    void tick().then(() => {
      document
        .querySelector('[data-testid="outline-tree"] .tree-row.selected')
        ?.scrollIntoView({ block: 'nearest' })
    })
  }

  /** The deliberate cursor (AI-IMP-277): selection moves by key or
   * click only — hover never drives the preview. */
  function moveCursor(delta: -1 | 1): void {
    if (rows.length === 0 || !selectedRow) return
    const index = rows.findIndex((row) => row.key === selectedRow.key)
    const next = rows[Math.min(rows.length - 1, Math.max(0, index + delta))]
    if (!next || next.key === selectedRow.key) return
    selectedKey = next.key
    scrollCursorIntoView()
  }

  /** Org reading: ← folds, or jumps to the parent when already
   * folded or unfoldable. Inert at depth 0 and in uniform-depth
   * worklists, by construction. */
  function cursorLeft(): void {
    const row = selectedRow
    if (!row) return
    if (row.canFold && row.expanded) {
      toggle(row)
      return
    }
    const index = rows.findIndex((candidate) => candidate.key === row.key)
    for (let i = index - 1; i >= 0; i -= 1) {
      if (rows[i]!.depth < row.depth) {
        selectedKey = rows[i]!.key
        scrollCursorIntoView()
        return
      }
    }
  }

  /** Org reading: → unfolds; it never doubles as dive (that is ↵). */
  function cursorRight(): void {
    const row = selectedRow
    if (row?.canFold && !row.expanded) toggle(row)
  }

  /** Alias activation flies to the first real rendering. */
  function flyToEntry(canvasId: string): void {
    const target = document.querySelector(
      `[data-testid="outline-view"] [data-canvas="${canvasId}"]:not([data-alias="true"])`,
    )
    if (!(target instanceof HTMLElement)) return
    target.scrollIntoView({ block: 'center' })
    target.classList.remove('flash')
    void target.offsetWidth
    target.classList.add('flash')
  }

  function placeNodeOnBoard(nodeId: string): void {
    closeTakeover()
    requestPlaceNode(nodeId)
  }

  function placeNoteOnBoard(noteId: string): void {
    closeTakeover()
    requestPlaceNote(noteId)
  }

  function dive(canvasId: string, label: string): void {
    closeTakeover()
    void navigateTo(canvasId, label)
  }

  function openNote(noteId: string): void {
    closeTakeover()
    requestOpenNote(noteId)
  }

  function activate(row: OutlineViewRow): void {
    if (row.kind === 'alias' && row.aliasCanvasId) {
      flyToEntry(row.aliasCanvasId)
      return
    }
    if (row.canvas) {
      dive(row.canvas.canvasId, row.title)
      return
    }
    if (row.note) {
      openNote(row.note.id)
      return
    }
    if (row.node?.noteId) openNote(row.node.noteId)
  }

  function beginRowDrag(event: DragEvent, mime: string, id: string): void {
    const dt = event.dataTransfer
    if (!dt) return
    dt.setData(mime, id)
    dt.effectAllowed = 'copy'
    const row = event.currentTarget as HTMLElement
    const edge = row.getBoundingClientRect()
    const stop = (): void => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragend', stop)
      window.removeEventListener('drop', stop)
    }
    const onDragOver = (over: DragEvent): void => {
      const inside =
        over.clientX >= edge.left &&
        over.clientX <= edge.right &&
        over.clientY >= edge.top &&
        over.clientY <= edge.bottom
      if (inside) return
      stop()
      closeTakeover()
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragend', stop)
    window.addEventListener('drop', stop)
  }

  function rowTestId(row: OutlineViewRow): string {
    if (row.kind === 'alias') return 'outline-alias-row'
    if (row.kind === 'bin') return 'outline-loose-bin'
    if (row.note) return 'loose-note-row'
    if (row.loose) return 'loose-node-row'
    return 'outline-child-row'
  }

  function chooseFacet(next: OutlineFacet): void {
    facet = next
  }
</script>

<div class="outline" data-testid="outline-view">
  {#if errorMessage}
    <p class="error" role="alert">{errorMessage}</p>
  {/if}

  <div class="facet-bar" data-testid="outline-filters">
    <span class="facet-chips" role="group" aria-label="Outline facet">
      {#each FACETS as option (option.id)}
        <button
          type="button"
          class="chip"
          class:on={facet === option.id}
          aria-pressed={facet === option.id}
          data-testid={`outline-filter-${option.id}`}
          onclick={() => chooseFacet(option.id)}
        >
          {option.label}<span class="facet-count">{facetCounts[option.id]}</span>
        </button>
      {/each}
    </span>

    <TextInput
      variant="pill"
      data-testid="outline-filter-query"
      placeholder="⌕ filter…"
      style="width: 11rem;"
      bind:value={query}
    />

    {#if lensTag}
      <span class="lens-chip" data-testid="outline-lens-chip">
        ⊙ #{lensTag}
        <button
          type="button"
          aria-label={`Drop #${lensTag} lens`}
          onclick={() => (lensTag = null)}
          use:tooltip={{ name: 'Drop tag lens — Esc' }}
        >✕</button>
      </span>
    {/if}
  </div>

  <div class="panes">
    <div class="tree" role="tree" aria-label="Project outline" data-testid="outline-tree">
      {#if rows.length === 0}
        <p class="empty">No rows match this worklist.</p>
      {/if}
      {#each rows as row (row.key)}
        {@const selected = selectedRow?.key === row.key}
        {@const lensMatch = !lensTag || row.tags.includes(lensTag)}
        <div
          class="tree-row"
          class:selected
          class:lens-hit={!!lensTag && lensMatch}
          class:lens-miss={!!lensTag && !lensMatch}
          class:alias={row.kind === 'alias'}
          class:structural={row.kind === 'root' || row.kind === 'board'}
          data-testid={rowTestId(row)}
          data-node-id={row.selection.nodeId ?? undefined}
          data-note-id={row.selection.kind === 'note' ? row.selection.noteId : undefined}
          data-canvas={row.canvas?.canvasId ?? row.aliasCanvasId}
          data-alias={row.kind === 'alias' ? 'true' : undefined}
          role="treeitem"
          tabindex={selected ? 0 : -1}
          aria-selected={selected}
          style={`--outline-depth:${row.depth}`}
          draggable={!!row.node || !!row.note}
          ondragstart={(event) => {
            if (row.note) beginRowDrag(event, NOTE_DRAG_MIME, row.note.id)
            else if (row.node) beginRowDrag(event, NODE_DRAG_MIME, 'id' in row.node ? row.node.id : row.node.nodeId)
          }}
          onpointerdown={(event) => {
            selectedKey = row.key
            beginLongPress(event, row)
          }}
          onpointerup={cancelLongPress}
          onpointercancel={cancelLongPress}
          onpointermove={cancelLongPress}
          onfocus={() => (selectedKey = row.key)}
          oncontextmenu={(event) => openRowMenu(event, row)}
        >
          <span class="indent"></span>
          {#if row.canFold}
            <button
              type="button"
              class="caret"
              data-testid="outline-expand"
              aria-label={`${row.expanded ? 'Fold' : 'Unfold'} ${row.title}`}
              aria-expanded={row.expanded}
              onclick={(event) => {
                event.stopPropagation()
                toggle(row)
              }}
            >{row.expanded ? '▾' : '▸'}</button>
          {:else}
            <span class="caret-space"></span>
          {/if}

          <button
            type="button"
            class="row-main"
            data-testid="outline-row-activate"
            onclick={(event) => {
              event.stopPropagation()
              selectedKey = row.key
              if (row.kind === 'alias' && row.aliasCanvasId) flyToEntry(row.aliasCanvasId)
            }}
            ondblclick={(event) => {
              event.stopPropagation()
              activate(row)
            }}
          >
            <span class="kind-glyph">{row.glyph}</span>
            <span class:identity-fallback={row.titleFallback !== 'none'} class="row-title">{row.title}</span>
          </button>

          <span class="badges">
            {#if row.loose}<span data-testid="badge-loose">·loose</span>{/if}
            {#if row.orphan}<span data-testid="badge-orphan">·orphan</span>{/if}
            {#if cleanupActive && row.untagged}<span data-testid="badge-untagged">·untagged</span>{/if}
          </span>

          {#if row.tags.length > 0}
            <span class="tags">
              {#each row.tags as tag (tag)}
                <button
                  type="button"
                  class="tag-chip"
                  class:active={lensTag === tag}
                  onclick={(event) => {
                    event.stopPropagation()
                    lensTag = lensTag === tag ? null : tag
                  }}
                >#{tag}</button>
              {/each}
            </span>
          {/if}

          <span class="spacer"></span>
          <span class="meta" data-testid="outline-row-meta">
            {#if facet !== 'all' || query.trim()}{row.path}{:else if row.kind === 'board' || row.kind === 'root'}{row.canvas?.children.length ?? 0}{/if}
          </span>

          {#if row.node}
            <button
              type="button"
              class="row-action"
              data-testid="outline-place-node"
              onclick={(event) => {
                event.stopPropagation()
                placeNodeOnBoard('id' in row.node! ? row.node!.id : row.node!.nodeId)
              }}
              use:tooltip={{ name: 'Place on current canvas' }}
            >Place</button>
          {:else if row.note}
            <button
              type="button"
              class="row-action"
              data-testid="outline-place-note"
              onclick={(event) => {
                event.stopPropagation()
                placeNoteOnBoard(row.note!.id)
              }}
              use:tooltip={{ name: 'Place on current canvas' }}
            >Place</button>
            <button
              type="button"
              class="row-action destructive"
              data-testid="outline-trash-note"
              onclick={(event) => {
                event.stopPropagation()
                void trashLooseNote(row.note!)
              }}
              use:tooltip={{ name: 'Trash — recover from the Trash view' }}
            >Trash</button>
          {/if}
        </div>
      {/each}
    </div>

    {#if selectedRow && actionDoors}
      <OutlinePreview
        row={selectedRow}
        model={previewModel}
        {filmstrip}
        loading={previewLoading}
        verbs={actionDoors.preview}
        onLensTag={(tag) => (lensTag = tag)}
        onMutated={() => void refresh()}
      />
    {:else}
      <aside class="preview-slot"><p class="preview-pending">Select a row to preview it.</p></aside>
    {/if}
  </div>

  <footer class="teaching-line">
    <span data-testid="outline-count-line">{rows.length} shown · {facetCounts.unplaced} loose · {facetCounts.orphans} orphans</span>
    <span class="teaching-spacer"></span>
    <span>↵ dive/open · ␣ place · ⌥↵ fly · tab folds · # tag · N note · del trash · esc returns</span>
  </footer>
</div>

{#if tagging && selectedRow?.selection.nodeId}
  <div class="outline-tag-editor" data-testid="outline-tag-editor" style:z-index={Z.popover}>
    <TagAddField
      nodeId={selectedRow.selection.nodeId}
      execute={executeCommand}
      onAssigned={() => {
        tagging = false
        void refresh()
      }}
    />
  </div>
{/if}

{#if menuPoint && actionDoors}
  <OutlineContextMenu
    x={menuPoint.x}
    y={menuPoint.y}
    groups={actionDoors.contextMenu}
    onclose={() => (menuPoint = null)}
  />
{/if}

{#if trashImpact && selectedRow}
  <OutlineTrashConfirm
    title={selectedRow.title}
    impact={trashImpact}
    busy={trashBusy}
    onconfirm={() => void confirmTrash()}
    oncancel={() => (trashImpact = null)}
  />
{/if}

<style>
  .outline {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    color: var(--ew-text);
    font-size: 0.8rem;
  }

  .error {
    flex: none;
    margin: 0 0 0.5rem;
    color: var(--ew-danger);
  }

  .facet-bar {
    display: flex;
    flex: none;
    align-items: center;
    gap: 0.55rem;
    padding: 0 0 0.6rem;
    white-space: nowrap;
    overflow-x: auto;
  }

  .facet-chips {
    display: inline-flex;
    gap: 0.35rem;
  }

  .chip,
  .lens-chip,
  .tag-chip {
    padding: 0.18rem 0.55rem;
    background: var(--ew-surface-raised);
    color: var(--ew-text-muted);
    border: 1px solid var(--ew-border-strong);
    border-radius: 999px;
    font: inherit;
  }

  button.chip,
  button.tag-chip,
  .lens-chip button {
    cursor: pointer;
  }

  .chip.on {
    background: var(--ew-accent);
    border-color: var(--ew-accent);
    color: var(--ew-on-accent);
  }

  .facet-count {
    margin-left: 0.35rem;
    font-family: ui-monospace, monospace;
    font-size: 0.7rem;
    opacity: 0.72;
  }

  .lens-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--ew-warn);
  }

  .lens-chip button {
    padding: 0;
    background: transparent;
    border: none;
    color: inherit;
  }

  .panes {
    display: flex;
    flex: 1;
    min-height: 0;
    border: 1px solid var(--ew-border);
    border-radius: 7px;
    overflow: hidden;
  }

  .tree {
    flex: 1 1 58%;
    min-width: 0;
    overflow: auto;
    padding: 0.35rem 0;
    border-right: 1px solid var(--ew-border);
  }

  .tree-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 1.75rem;
    padding: 0 0.7rem;
    cursor: default;
    outline-offset: -2px;
  }

  .tree-row:hover {
    background: var(--ew-surface-hover);
  }

  .tree-row.selected {
    background: var(--ew-surface-raised);
    outline: 2px solid var(--ew-focus-ring);
  }

  .tree-row.lens-hit {
    box-shadow: inset 3px 0 0 var(--ew-warn);
  }

  .tree-row.lens-miss {
    opacity: 0.35;
  }

  .indent {
    flex: none;
    width: calc(var(--outline-depth) * 1.1rem);
  }

  .caret,
  .caret-space {
    flex: none;
    width: 1rem;
  }

  .caret {
    padding: 0;
    background: transparent;
    border: none;
    color: var(--ew-accent);
    font-size: 0.7rem;
    cursor: pointer;
  }

  .row-main {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    padding: 0;
    background: transparent;
    border: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: default;
  }

  .kind-glyph {
    flex: none;
    width: 1.1rem;
    color: var(--ew-text-muted);
    text-align: center;
  }

  .alias .kind-glyph,
  .alias .row-title {
    color: var(--ew-accent);
  }

  .row-title {
    overflow: hidden;
    color: var(--ew-text-soft);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tree-row.structural .row-title {
    font-weight: 600;
  }

  .identity-fallback {
    color: var(--ew-text-muted) !important;
    font-family: ui-monospace, monospace;
    font-weight: 400 !important;
  }

  .badges,
  .tags {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 0.25rem;
  }

  .badges {
    color: var(--ew-warn);
    font-family: ui-monospace, monospace;
    font-size: 0.7rem;
  }

  .tag-chip {
    padding-block: 0;
    font-size: 0.7rem;
    white-space: nowrap;
  }

  .tag-chip.active {
    color: var(--ew-warn);
    border-color: var(--ew-warn);
  }

  .spacer,
  .teaching-spacer {
    flex: 1;
  }

  .meta {
    flex: none;
    max-width: 36%;
    overflow: hidden;
    color: var(--ew-text-subtle);
    font-family: ui-monospace, monospace;
    font-size: 0.7rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-action {
    flex: none;
    padding: 0 0.4rem;
    opacity: 0;
    background: var(--ew-surface-raised);
    color: var(--ew-text-muted);
    border: 1px solid var(--ew-border-strong);
    border-radius: 4px;
    font-size: 0.68rem;
    cursor: pointer;
  }

  .tree-row:hover .row-action,
  .tree-row:focus-within .row-action {
    opacity: 1;
  }

  .row-action.destructive {
    color: var(--ew-danger);
  }

  .preview-slot {
    flex: 1 1 42%;
    min-width: 0;
    overflow: auto;
    padding: 1rem 1.1rem;
  }

  .outline-tag-editor {
    position: fixed;
    right: 2rem;
    top: 8rem;
    padding: 0.55rem;
    border: 1px solid var(--ew-border);
    border-radius: 7px;
    background: var(--ew-surface-menu);
    box-shadow: 0 6px 22px var(--ew-shadow);
  }

  .preview-pending {
    margin: 0;
    color: var(--ew-text-subtle);
    font-family: ui-monospace, monospace;
    font-size: 0.7rem;
  }

  .preview-pending {
    margin-top: 1rem;
    color: var(--ew-text-muted);
  }

  .empty {
    margin: 0.8rem;
    color: var(--ew-text-muted);
  }

  .teaching-line {
    display: flex;
    flex: none;
    gap: 1rem;
    padding: 0.45rem 0.1rem 0;
    overflow: hidden;
    color: var(--ew-text-subtle);
    font-family: ui-monospace, monospace;
    font-size: 0.7rem;
    white-space: nowrap;
  }

  .outline :global(.flash) {
    animation: outline-flash 700ms ease-out 1;
  }

  @keyframes outline-flash {
    0% { background: var(--ew-accent); }
    100% { background: transparent; }
  }

  @media (pointer: coarse) {
    .tree-row,
    .row-action,
    .caret,
    .tag-chip {
      min-height: 44px;
    }
  }
</style>

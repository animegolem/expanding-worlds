<!--
  System metadata card (RFC §7.8, AI-IMP-119; restyled AI-IMP-139 to
  the kit NoteMetaCard anatomy). The note's derived metadata rendered
  as a STRUCTURED card below the editor — visibly SYSTEM-owned, never
  raw block text. The in-app display is always live (this reads
  getNoteMetadata, recomputed on every project change). Placements
  entries are foldable board rows; each carries a ⌖ fly chip reusing
  the §7.4 panel-aware flights. A per-note toggle governs whether the
  note carries the block at all; which SECTIONS appear follows the
  per-section global defaults (Settings). Fold state is ephemeral UI
  state (not persisted) — presentation only; §7.8 behavior unchanged.
-->
<script lang="ts" module>
  export interface MetadataCardBoard {
    canvasId: string
    label: string
    isRoot: boolean
    depth: number
    count: number
    placements: Array<{ placementId: string }>
  }

  export interface MetadataCardData {
    noteId: string
    boards: MetadataCardBoard[]
    provenance: Array<{
      nodeId: string
      originalFilename: string
      importDate: string
      sourceUrl: string | null
    }>
    timestamps: { created: string; modified: string }
    config: {
      enabled: boolean
      sections: { placements: boolean; provenance: boolean; timestamps: boolean }
    }
  }
</script>

<script lang="ts">
  import { navigateTo } from '../chrome/navigation'
  import { requestCenterPlacements } from './open-note'
  import { reserveTetheredPanelSpace } from './panels'

  const {
    data,
    activeCanvasId,
    onToggle,
  }: {
    data: MetadataCardData
    activeCanvasId: string | null
    onToggle: (enabled: boolean) => void
  } = $props()

  const enabled = $derived(data.config.enabled)
  const sections = $derived(data.config.sections)

  // Which sections have anything to show under the current toggles.
  const showPlacements = $derived(enabled && sections.placements && data.boards.length > 0)
  const showProvenance = $derived(enabled && sections.provenance && data.provenance.length > 0)
  const showTimestamps = $derived(enabled && sections.timestamps)
  const hasBody = $derived(showPlacements || showProvenance || showTimestamps)

  // Ephemeral fold state, keyed by board canvasId; not persisted. Reset
  // when the open note changes so folds never leak across notes.
  let foldOverrides = $state<Record<string, boolean>>({})
  let lastNoteId = ''
  $effect(() => {
    if (data.noteId !== lastNoteId) {
      lastNoteId = data.noteId
      foldOverrides = {}
    }
  })

  // The boards read model is a depth-annotated outline (shallow first).
  // Render it as a fold tree: a folded row hides the contiguous run of
  // deeper rows beneath it (its nested boards). Default — top level
  // open, everything deeper folded — keeps 40-board notes scannable.
  interface PlacementRow {
    board: MetadataCardBoard
    hasChildren: boolean
    open: boolean
  }
  const rows = $derived.by<PlacementRow[]>(() => {
    const out: PlacementRow[] = []
    const bs = data.boards
    let hideDeeperThan = Number.POSITIVE_INFINITY
    for (let i = 0; i < bs.length; i++) {
      const board = bs[i]
      if (board.depth > hideDeeperThan) continue
      hideDeeperThan = Number.POSITIVE_INFINITY
      const hasChildren = i + 1 < bs.length && bs[i + 1].depth > board.depth
      const open = foldOverrides[board.canvasId] ?? board.depth === 0
      out.push({ board, hasChildren, open })
      if (hasChildren && !open) hideDeeperThan = board.depth
    }
    return out
  })

  function toggleFold(board: MetadataCardBoard): void {
    const current = foldOverrides[board.canvasId] ?? board.depth === 0
    foldOverrides = { ...foldOverrides, [board.canvasId]: !current }
  }

  function flyToBoard(board: MetadataCardBoard): void {
    const ids = board.placements.map((p) => p.placementId)
    if (board.canvasId === activeCanvasId) {
      // The list lives in the open note's panel; the fly keeps it, so
      // reserve its band before the fit (AI-IMP-100).
      reserveTetheredPanelSpace()
      requestCenterPlacements(ids)
      return
    }
    void navigateTo(board.canvasId, board.label).then(() => {
      reserveTetheredPanelSpace()
      requestCenterPlacements(ids)
    })
  }
</script>

<section class="metadata-card" data-testid="note-metadata-card">
  {#if enabled}
    <div class="card">
      <!-- The SYSTEM seam: visibly system-owned, not prose. -->
      <div class="seam">
        <span class="seam-label">SYSTEM</span>
        <span class="seam-note">kept fresh by the app — edits here don't stick</span>
        <button
          type="button"
          class="bare seam-off"
          data-testid="metadata-toggle"
          onclick={() => onToggle(false)}
          title="Stop keeping this block on this note"
        >
          ✕
        </button>
      </div>

      <div class="body">
        {#if showPlacements}
          <div class="group" data-testid="metadata-placements">
            <p class="section-head">PLACEMENTS</p>
            {#each rows as row (row.board.canvasId)}
              <div
                class="row"
                data-testid="metadata-board"
                style={`padding-left:${row.board.depth * 0.75}rem`}
              >
                {#if row.hasChildren}
                  <button
                    type="button"
                    class="bare fold"
                    data-testid="metadata-fold"
                    aria-expanded={row.open}
                    title={row.open ? 'Fold nested boards' : 'Unfold nested boards'}
                    onclick={() => toggleFold(row.board)}
                  >
                    {row.open ? '▾' : '▸'}
                  </button>
                {:else}
                  <span class="fold-spacer"></span>
                {/if}
                <span class="board-label">{row.board.label}</span>
                <span class="board-count">· {row.board.count}</span>
                <button
                  type="button"
                  class="bare fly-chip"
                  data-testid="metadata-fly"
                  title={row.board.canvasId === activeCanvasId
                    ? 'Center these placements'
                    : `Fly to ${row.board.label}`}
                  onclick={() => flyToBoard(row.board)}
                >
                  ⌖ fly
                </button>
              </div>
            {/each}
          </div>
        {/if}

        {#if showProvenance}
          <div class="group divider" data-testid="metadata-provenance">
            <p class="section-head">PROVENANCE</p>
            {#each data.provenance as entry (entry.nodeId)}
              <div class="line">{entry.originalFilename} · imported {entry.importDate}</div>
              {#if entry.sourceUrl}
                <div class="line dim">{entry.sourceUrl}</div>
              {/if}
            {/each}
          </div>
        {/if}

        {#if showTimestamps}
          <div class="group divider" data-testid="metadata-timestamps">
            <p class="section-head">TIMESTAMPS</p>
            <div class="line">
              created {data.timestamps.created} · modified {data.timestamps.modified}
            </div>
          </div>
        {/if}

        {#if !hasBody}
          <p class="line dim" data-testid="metadata-empty">No metadata yet.</p>
        {/if}
      </div>
    </div>
  {:else}
    <!-- Per-note OFF state: the quiet dashed explainer + turn-on. -->
    <div class="off" data-testid="metadata-off">
      <span class="off-rule"></span>
      metadata off for this note
      <button
        type="button"
        class="bare off-on"
        data-testid="metadata-toggle"
        onclick={() => onToggle(true)}
        title="Show metadata block on this note"
      >
        turn on
      </button>
    </div>
  {/if}
</section>

<style>
  .metadata-card {
    flex: none;
    padding: 0.5rem 0.6rem 0.6rem;
    font-family: ui-monospace, monospace;
  }

  /* The card surface: info-panel palette, mono micro-type. */
  .card {
    border-radius: 6px;
    background: var(--ew-paper-info-panel);
    border: 1px solid var(--ew-paper-info-border);
    color: var(--ew-paper-info-text);
    font-size: 0.66rem;
    line-height: 1.9;
  }

  .seam {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.65rem;
    border-bottom: 1px solid var(--ew-paper-info-border);
  }

  .seam-label {
    font-weight: 700;
    font-size: 0.58rem;
    letter-spacing: 0.07em;
  }

  .seam-note {
    font-size: 0.6rem;
    opacity: 0.65;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .seam-off {
    margin-left: auto;
    opacity: 0.75;
  }

  .body {
    padding: 0.35rem 0.65rem 0.5rem;
  }

  .section-head {
    margin: 0;
    font-weight: 700;
    font-size: 0.58rem;
    letter-spacing: 0.07em;
  }

  .group.divider {
    margin-top: 0.4rem;
    padding-top: 0.4rem;
    border-top: 1px solid var(--ew-paper-info-border);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .fold,
  .fold-spacer {
    width: 0.7rem;
    flex: none;
  }

  .fold {
    color: var(--ew-paper-info-text);
    text-align: center;
  }

  .board-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .board-count {
    flex: none;
    opacity: 0.7;
  }

  .fly-chip {
    color: var(--ew-link-bound);
  }

  .line {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .line.dim {
    opacity: 0.85;
  }

  /* Per-note OFF state: dashed rule + quiet explainer. */
  .off {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.62rem;
    color: var(--ew-paper-text-soft);
  }

  .off-rule {
    flex: 1;
    border-top: 1px dashed var(--ew-paper-border);
  }

  .off-on {
    color: var(--ew-paper-info-text);
  }

  .bare {
    border: none;
    background: transparent;
    font: inherit;
    padding: 0;
    flex: none;
    cursor: pointer;
  }
</style>

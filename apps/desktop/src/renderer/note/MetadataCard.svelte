<!--
  System metadata card (RFC §7.8, AI-IMP-119): the note's derived
  metadata rendered as a STRUCTURED card below the editor — never raw
  block text. The in-app display is always live (this reads
  getNoteMetadata, recomputed on every project change). Placements
  entries are fly-to navigation targets reusing the §7.4 panel-aware
  flights. A per-note toggle governs whether the note carries the block
  at all; which SECTIONS appear follows the per-section global defaults
  (Settings). Styling is placeholder-on-theme-tokens — the design pass
  (Design-letter-3 item 16) restyles.
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
  <header>
    <span class="card-title">Metadata</span>
    <button
      type="button"
      class="toggle"
      class:on={enabled}
      role="switch"
      aria-checked={enabled}
      data-testid="metadata-toggle"
      onclick={() => onToggle(!enabled)}
      title={enabled ? 'Hide metadata block on this note' : 'Show metadata block on this note'}
    >
      {enabled ? 'On' : 'Off'}
    </button>
  </header>

  {#if enabled}
    {#if showPlacements}
      <div class="group" data-testid="metadata-placements">
        <p class="group-title">Placements</p>
        <ul>
          {#each data.boards as board (board.canvasId)}
            <li>
              <button
                type="button"
                class="row"
                style={`padding-left:${0.3 + board.depth * 0.85}rem`}
                data-testid="metadata-board"
                title={board.canvasId === activeCanvasId
                  ? 'Center these placements'
                  : 'Fly to this board'}
                onclick={() => flyToBoard(board)}
              >
                <span class="board-label">{board.label}</span>
                <span class="board-count">{board.count}</span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if showProvenance}
      <div class="group" data-testid="metadata-provenance">
        <p class="group-title">Provenance</p>
        <ul>
          {#each data.provenance as entry (entry.nodeId)}
            <li class="prov-row">
              <span class="filename">{entry.originalFilename}</span>
              <span class="prov-meta">imported {entry.importDate}</span>
              {#if entry.sourceUrl}
                <span class="prov-meta">· {entry.sourceUrl}</span>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if showTimestamps}
      <div class="group" data-testid="metadata-timestamps">
        <p class="group-title">Timestamps</p>
        <ul>
          <li class="prov-row"><span class="prov-meta">Created {data.timestamps.created}</span></li>
          <li class="prov-row"><span class="prov-meta">Modified {data.timestamps.modified}</span></li>
        </ul>
      </div>
    {/if}

    {#if !hasBody}
      <p class="empty" data-testid="metadata-empty">No metadata yet.</p>
    {/if}
  {/if}
</section>

<style>
  .metadata-card {
    flex: none;
    padding: 0.3rem 0.6rem 0.5rem;
    border-top: 1px solid var(--ew-paper-border);
    font-size: 0.8rem;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .card-title {
    color: var(--ew-paper-text-subtle);
    font-weight: 600;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .toggle {
    flex: none;
    padding: 0.05rem 0.5rem;
    border: 1px solid var(--ew-paper-border);
    border-radius: 9px;
    background: transparent;
    color: var(--ew-paper-text-muted);
    font: inherit;
    font-size: 0.7rem;
    cursor: pointer;
  }

  .toggle.on {
    border-color: var(--ew-paper-info-border);
    background: var(--ew-paper-info-panel);
    color: var(--ew-paper-info-text);
  }

  .group-title {
    margin: 0.35rem 0 0.15rem;
    color: var(--ew-paper-text-subtle);
    font-weight: 600;
    font-size: 0.72rem;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    padding: 0.2rem 0.3rem;
    border: none;
    background: transparent;
    font: inherit;
    font-size: 0.78rem;
    text-align: left;
    cursor: pointer;
  }

  .row:hover {
    background: var(--ew-paper-hover);
  }

  .board-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .board-count {
    flex: none;
    color: var(--ew-paper-text-muted);
  }

  .prov-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    padding: 0.1rem 0.3rem;
  }

  .filename {
    font-family: ui-monospace, monospace;
    font-size: 0.74rem;
    color: var(--ew-paper-text-heading);
  }

  .prov-meta {
    color: var(--ew-paper-text-muted);
    font-size: 0.74rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .empty {
    margin: 0.3rem 0.3rem 0;
    color: var(--ew-paper-text-muted);
    font-size: 0.74rem;
  }
</style>

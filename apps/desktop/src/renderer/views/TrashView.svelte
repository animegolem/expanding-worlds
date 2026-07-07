<!--
  Trash takeover (RFC-0001 §9.7 rev 0.46, AI-IMP-102): the trash
  browser's one surface, entered only through the ☰ Trash… row. ONE
  flat list across kinds in the §7.4 row grammar — kind glyph
  (note ¶ · node ◆ · board ▣), title, trashed-when, and an impact
  summary from the existing impact queries (getNoteImpact /
  getNodeImpact / getCanvasImpact). Restore per row dispatches
  RestoreRecord {kind, id}; the row leaves the list and a toast
  offers fly-to (restore-stays-put — the takeover does NOT navigate).
  Empty Trash sits at the bottom behind the §9 impact-summary
  confirmation and loops PurgeRecord over every eligible record.

  The takeover owns no canvas gateway, so commands go straight through
  window.ew.project.execute with a hand-rolled envelope (the
  GalleryActionBar precedent). Toasts live in the chrome layer above
  the takeover cover, so a restore toast persists when the row's
  fly-to action later closes this view.
-->
<script lang="ts">
  import { uuidv7 } from '@ew/domain'
  import type { CommandResult } from '@ew/commands'
  import { navigateTo } from '../chrome/navigation'
  import { toast } from '../chrome/status'
  import { closeTakeover } from '../chrome/takeover'
  import { requestCenterPlacements, requestOpenNote } from '../note/open-note'

  type Kind = 'note' | 'node' | 'canvas'

  // Query shapes cross the seam untyped (the renderer imports only
  // @ew/commands); these mirror queries-lifecycle.ts / -structure.ts.
  interface TrashViewModel {
    notes: Array<{ id: string; title: string; trashedAt: string | null }>
    nodes: Array<{ id: string; noteTitle: string | null; trashedAt: string | null }>
    canvases: Array<{ id: string; nodeId: string; trashedAt: string | null }>
  }
  interface NoteImpact {
    referencingNodeIds: string[]
    inboundLinkCount: number
    outboundLinkCount: number
    textOnly: boolean
  }
  interface NodeImpact {
    placementCount: number
    tagCount: number
    ownedCanvasId: string | null
  }
  interface CanvasImpact {
    placementCount: number
    decorationCount: number
    referencedNodeCount: number
  }
  interface NodeLocationsModel {
    noteId: string | null
    placements: Array<{ placementId: string; canvasId: string; canvasLabel: string }>
  }

  interface Row {
    kind: Kind
    id: string
    title: string
    trashedAt: string | null
    impact: string
  }

  const GLYPH: Record<Kind, string> = { note: '¶', node: '◆', canvas: '▣' }
  const KIND_LABEL: Record<Kind, string> = { note: 'note', node: 'node', canvas: 'board' }

  let rows = $state<Row[]>([])
  let loaded = $state(false)
  let confirmingEmpty = $state(false)
  let emptySummary = $state('')
  let emptyKindCount = $state(0)
  let busy = $state(false)

  // ------------------------------------------------ command plumbing
  // Identical to GalleryActionBar: the takeover has no canvas gateway,
  // so it issues append-style envelopes directly; no revision thread.
  let projectId: string | null = null

  async function execute(commandType: string, payload: unknown): Promise<CommandResult> {
    if (projectId === null) {
      const response = await window.ew.project.query('getProject')
      if (!response.ok) throw new Error(response.message)
      projectId = (response.result as { id: string }).id
    }
    return window.ew.project.execute({
      commandId: uuidv7(),
      projectId,
      commandType,
      commandVersion: 1,
      issuedAt: new Date().toISOString(),
      payload,
    })
  }

  async function query<T>(name: string, args?: unknown): Promise<T | null> {
    const response = await window.ew.project.query(name, args)
    if (!response.ok) return null
    return response.result as T
  }

  function shortId(id: string): string {
    return id.slice(0, 8)
  }

  function relativeWhen(iso: string | null): string {
    if (!iso) return 'unknown time'
    const then = new Date(iso).getTime()
    if (Number.isNaN(then)) return 'unknown time'
    const secs = Math.max(0, Math.round((Date.now() - then) / 1000))
    if (secs < 45) return 'just now'
    const mins = Math.round(secs / 60)
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
    const hours = Math.round(mins / 60)
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
    const days = Math.round(hours / 24)
    if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
    return new Date(iso).toLocaleDateString()
  }

  function plural(n: number, one: string): string {
    return `${n} ${one}${n === 1 ? '' : 's'}`
  }

  // Archive-tone impact: neutral, factual "holds …" phrasing — what the
  // record carries and what restoring brings back, never an alarm.
  async function noteImpactText(id: string): Promise<string> {
    const impact = await query<NoteImpact>('getNoteImpact', { noteId: id })
    if (!impact) return ''
    if (impact.textOnly) return 'a text-only note'
    return `read by ${plural(impact.referencingNodeIds.length, 'node')} · ${plural(impact.inboundLinkCount, 'link')} in, ${impact.outboundLinkCount} out`
  }

  async function nodeImpactText(id: string): Promise<string> {
    const impact = await query<NodeImpact>('getNodeImpact', { nodeId: id })
    if (!impact) return ''
    const parts = [`holds ${plural(impact.placementCount, 'placement')}`]
    if (impact.tagCount > 0) parts.push(plural(impact.tagCount, 'tag'))
    if (impact.ownedCanvasId) parts.push('owns a board')
    parts.push('returns whole on restore')
    return parts.join(' · ')
  }

  async function canvasImpactText(id: string): Promise<string> {
    const impact = await query<CanvasImpact>('getCanvasImpact', { canvasId: id })
    if (!impact) return ''
    return `holds ${plural(impact.placementCount, 'placement')} · ${plural(impact.decorationCount, 'decoration')} · references ${plural(impact.referencedNodeCount, 'node')}`
  }

  async function load(): Promise<void> {
    const view = await query<TrashViewModel>('getTrashView')
    if (!view) {
      rows = []
      loaded = true
      return
    }
    const draft: Row[] = [
      ...view.notes.map(
        (n): Row => ({ kind: 'note', id: n.id, title: n.title, trashedAt: n.trashedAt, impact: '' }),
      ),
      ...view.nodes.map(
        (n): Row => ({
          kind: 'node',
          id: n.id,
          title: n.noteTitle ?? `Node ${shortId(n.id)}`,
          trashedAt: n.trashedAt,
          impact: '',
        }),
      ),
      ...view.canvases.map(
        (c): Row => ({
          kind: 'canvas',
          id: c.id,
          title: `Board ${shortId(c.nodeId)}`,
          trashedAt: c.trashedAt,
          impact: '',
        }),
      ),
    ]
    // ONE flat list across kinds, oldest-trashed first (the query's
    // per-kind order; blend by trashed_at so the list reads as one).
    draft.sort((a, b) => (a.trashedAt ?? '').localeCompare(b.trashedAt ?? ''))
    // Impact summaries resolve in parallel from the per-record queries.
    await Promise.all(
      draft.map(async (row) => {
        row.impact =
          row.kind === 'note'
            ? await noteImpactText(row.id)
            : row.kind === 'node'
              ? await nodeImpactText(row.id)
              : await canvasImpactText(row.id)
      }),
    )
    rows = draft
    loaded = true
  }

  $effect(() => {
    void load()
  })
  // Restore and purge push a project change; other surfaces (gallery
  // trash, note-panel restore) do too — keep the list live.
  $effect(() => window.ew.project.onChanged(() => void load()))

  // ------------------------------------------------------ fly-to
  /** Restore-stays-put: the toast's action closes the takeover and
   * flies to the restored record. Resolved at CLICK time so the
   * destination reflects the now-active aggregate.
   *  · board  → navigate to the canvas itself.
   *  · node   → navigate to a placement and center it (cross-canvas
   *             flights enter §8.1 history); a placement-less node
   *             with a note opens that note instead.
   *  · note   → notes carry no placement, so open the note panel. */
  async function flyTo(kind: Kind, id: string): Promise<void> {
    closeTakeover()
    if (kind === 'canvas') {
      await navigateTo(id, 'Board')
      return
    }
    if (kind === 'note') {
      requestOpenNote(id)
      return
    }
    const locations = await query<NodeLocationsModel>('getNodeLocations', { nodeId: id })
    const first = locations?.placements[0]
    if (first) {
      await navigateTo(first.canvasId, first.canvasLabel)
      requestCenterPlacements([first.placementId])
      return
    }
    if (locations?.noteId) requestOpenNote(locations.noteId)
  }

  async function restore(row: Row): Promise<void> {
    if (busy) return
    busy = true
    try {
      const result = await execute('RestoreRecord', { kind: row.kind, id: row.id })
      if (result.status !== 'committed') {
        toast(`Could not restore ${KIND_LABEL[row.kind]} “${row.title}”`, {
          kind: 'error',
          surface: 'trash-restored',
        })
        return
      }
      // The row leaves the list (load() reruns on the project push too;
      // drop it now so the surface reacts even if the push is delayed).
      rows = rows.filter((r) => !(r.kind === row.kind && r.id === row.id))
      toast(`Restored ${KIND_LABEL[row.kind]} “${row.title}”`, {
        kind: 'success',
        surface: 'trash-restored',
        actions: [
          {
            label: 'Fly to it',
            testid: 'trash-flyto',
            run: () => void flyTo(row.kind, row.id),
          },
        ],
      })
    } finally {
      busy = false
    }
  }

  // ------------------------------------------------------ empty trash
  async function beginEmpty(): Promise<void> {
    const eligible = await query<Array<{ kind: Kind }>>('getEmptyTrashEligibility')
    if (!eligible || eligible.length === 0) {
      confirmingEmpty = false
      return
    }
    const notes = eligible.filter((e) => e.kind === 'note').length
    const nodes = eligible.filter((e) => e.kind === 'node').length
    const boards = eligible.filter((e) => e.kind === 'canvas').length
    const parts = [
      notes > 0 ? plural(notes, 'note') : null,
      nodes > 0 ? plural(nodes, 'node') : null,
      boards > 0 ? plural(boards, 'board') : null,
    ].filter((p): p is string => p !== null)
    emptyKindCount = eligible.length
    emptySummary = `Permanently delete ${plural(eligible.length, 'item')} (${parts.join(', ')})? This cannot be undone.`
    confirmingEmpty = true
  }

  async function confirmEmpty(): Promise<void> {
    if (busy) return
    busy = true
    try {
      const eligible = await query<Array<{ kind: Kind; id: string }>>('getEmptyTrashEligibility')
      let purged = 0
      let failed = 0
      for (const entry of eligible ?? []) {
        const result = await execute('PurgeRecord', { kind: entry.kind, id: entry.id })
        if (result.status === 'committed') purged += 1
        else failed += 1
      }
      toast(
        failed > 0
          ? `Emptied Trash — ${purged} purged, ${failed} failed`
          : `Emptied Trash — ${plural(purged, 'item')} purged`,
        // Surface must NOT be 'trash-empty': Toasts stamps the surface
        // as data-testid, and the empty-state <p> below already owns
        // that id — a lingering toast made the pair a strict-mode
        // violation (flaked twice on 2026-07-06).
        { kind: failed > 0 ? 'error' : 'info', surface: 'trash-emptied' },
      )
      confirmingEmpty = false
      await load()
    } finally {
      busy = false
    }
  }
</script>

<div class="trash" data-testid="trash-view">
  {#if !loaded}
    <p class="quiet" data-testid="trash-loading">Loading Trash…</p>
  {:else if rows.length === 0}
    <p class="quiet" data-testid="trash-empty">
      nothing here — deleted things wait here, whole, until you say otherwise.
    </p>
  {:else}
    <ul class="list" data-testid="trash-list">
      {#each rows as row (row.kind + row.id)}
        <li class="row" data-testid="trash-row" data-kind={row.kind} data-id={row.id}>
          <span class="glyph" title={KIND_LABEL[row.kind]} aria-label={KIND_LABEL[row.kind]}
            >{GLYPH[row.kind]}</span
          >
          <span class="body">
            <span class="title" data-testid="trash-row-title">{row.title}</span>
            <span class="meta">
              <span class="when">{relativeWhen(row.trashedAt)}</span>
              {#if row.impact}
                <span class="impact" data-testid="trash-row-impact">{row.impact}</span>
              {/if}
            </span>
          </span>
          <button
            type="button"
            class="restore"
            data-testid="trash-restore"
            disabled={busy}
            onclick={() => void restore(row)}
          >
            Restore
          </button>
        </li>
      {/each}
    </ul>

    <div class="footer">
      {#if confirmingEmpty}
        <div class="confirm" data-testid="trash-empty-confirm" role="alertdialog">
          <p class="confirm-text" data-testid="trash-empty-summary">{emptySummary}</p>
          <div class="confirm-actions">
            <button
              type="button"
              class="danger"
              data-testid="trash-empty-confirm-yes"
              disabled={busy || emptyKindCount === 0}
              onclick={() => void confirmEmpty()}
            >
              Delete Permanently
            </button>
            <button
              type="button"
              data-testid="trash-empty-cancel"
              disabled={busy}
              onclick={() => (confirmingEmpty = false)}
            >
              Cancel
            </button>
          </div>
        </div>
      {:else}
        <button
          type="button"
          class="empty-trash"
          data-testid="trash-empty-trash"
          disabled={busy}
          onclick={() => void beginEmpty()}
        >
          Empty trash…
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .trash {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-width: 46rem;
    margin: 0 auto;
  }

  .quiet {
    padding: 2rem 0.5rem;
    color: var(--ew-text-muted);
  }

  .list {
    flex: 1;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow: auto;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.55rem 0.4rem;
    border-bottom: 1px solid var(--ew-border);
  }

  .glyph {
    flex: none;
    width: 1.4rem;
    text-align: center;
    font-size: 1rem;
    color: var(--ew-text-muted);
  }

  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .title {
    font-size: 0.85rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meta {
    display: flex;
    gap: 0.6rem;
    font-size: 0.72rem;
    color: var(--ew-text-muted);
  }

  .impact {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Restore is the loud verb of the archive: it wears the accent, so
     the eye lands on getting things back, not on destroying them. */
  .restore {
    flex: none;
    padding: 0.2rem 0.8rem;
    background: var(--ew-accent);
    color: var(--ew-on-accent);
    border: 1px solid var(--ew-accent);
    border-radius: 6px;
    font: inherit;
    font-size: 0.78rem;
    cursor: pointer;
  }

  .restore:hover:not(:disabled) {
    background: var(--ew-accent-soft);
    border-color: var(--ew-accent-soft);
  }

  .restore:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .footer {
    flex: none;
    display: flex;
    justify-content: flex-end;
    padding: 0.75rem 0.4rem 0.2rem;
  }

  .empty-trash,
  .confirm .danger,
  .confirm-actions button {
    padding: 0.3rem 0.8rem;
    border-radius: 6px;
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }

  /* The ONLY danger-toned control in the archive: a danger-bordered
     button in the bottom-right corner. Purge is the one irreversible
     act here, so it alone reads as a warning. */
  .empty-trash {
    background: transparent;
    color: var(--ew-danger);
    border: 1px solid var(--ew-danger);
  }

  .empty-trash:hover:not(:disabled) {
    background: var(--ew-surface-subtle);
  }

  .confirm {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.5rem;
    width: 100%;
  }

  .confirm-text {
    margin: 0;
    align-self: stretch;
    font-size: 0.82rem;
    color: var(--ew-text);
  }

  .confirm-actions {
    display: flex;
    gap: 0.5rem;
  }

  .confirm .danger {
    background: var(--ew-danger);
    color: var(--ew-on-accent);
    border: 1px solid var(--ew-danger);
  }

  .confirm-actions button:not(.danger) {
    background: var(--ew-surface-raised);
    color: var(--ew-text);
    border: 1px solid var(--ew-border-strong);
  }

  .empty-trash:disabled,
  .confirm-actions button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>

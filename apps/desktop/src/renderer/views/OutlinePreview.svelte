<script module lang="ts">
  // A conflict may deliberately navigate away. Preserve the capture by node
  // so reopening the outliner never discards an uncommitted draft.
  const drafts = new Map<string, string>()
</script>

<script lang="ts">
  import { uuidv7 } from '@ew/domain'
  import { closeTakeover } from '../chrome/takeover'
  import { toast } from '../chrome/status'
  import type { OutlineVerb } from '../outline/actions'
  import { requestOpenNote } from '../note/open-note'
  import { createNoteProjectPort } from '../note/project-port'
  import type { ProjectPort } from '../note/note-editor'
  import TitleConflictDialog, { type TitleConflict } from '../note/TitleConflictDialog.svelte'
  import { captureOutlineNote } from './outline-note-capture'
  import type { OutlineFilmstrip, OutlinePreview } from './outline-data'
  import type { OutlineViewRow } from './outline-model'

  const {
    row,
    model,
    filmstrip,
    loading,
    verbs,
    onLensTag,
    onMutated,
  }: {
    row: OutlineViewRow
    model: OutlinePreview | null
    filmstrip: OutlineFilmstrip | null
    loading: boolean
    verbs: readonly OutlineVerb[]
    onLensTag: (tag: string) => void
    onMutated: () => void
  } = $props()

  let port = $state<ProjectPort | null>(null)
  let disposePort: (() => void) | null = null
  let draft = $state('')
  let busy = $state(false)
  let conflict = $state<TitleConflict | null>(null)
  let failedThumbs = $state<Record<string, boolean>>({})
  let captureInput = $state<HTMLInputElement | null>(null)

  const nodeId = $derived(row.selection.nodeId)

  $effect(() => {
    const id = nodeId
    draft = id ? (drafts.get(id) ?? '') : ''
    conflict = null
  })

  $effect(() => () => disposePort?.())


  async function projectPort(): Promise<ProjectPort> {
    if (port) return port
    const created = await createNoteProjectPort()
    port = created.port
    disposePort = created.dispose
    return created.port
  }

  function rememberDraft(value: string): void {
    draft = value
    if (nodeId) drafts.set(nodeId, value)
  }

  async function attachDraft(): Promise<void> {
    const id = nodeId
    const title = draft.trim()
    if (!id || model?.noteId || title.length === 0 || busy) return
    busy = true
    try {
      const project = await projectPort()
      const outcome = await captureOutlineNote(project.execute, {
        nodeId: id,
        noteId: uuidv7(),
        title,
      })
      if (outcome.status === 'committed') {
        drafts.delete(id)
        draft = ''
        conflict = null
        toast('Note attached', { kind: 'success' })
        onMutated()
      } else if (outcome.status === 'conflict') {
        conflict = outcome.conflict
      } else {
        const message =
          outcome.result.status === 'error'
            ? outcome.result.message
            : 'the project changed underneath (retry)'
        toast(message, { kind: 'error' })
      }
    } finally {
      busy = false
    }
  }

  function openExisting(noteId: string): void {
    conflict = null
    closeTakeover()
    requestOpenNote(noteId)
  }

  async function restoreExisting(noteId: string): Promise<void> {
    const project = await projectPort()
    const result = await project.execute('RestoreRecord', { kind: 'note', id: noteId })
    if (result.status !== 'committed') {
      const message = result.status === 'error' ? result.message : 'the project changed underneath (retry)'
      toast(message, { kind: 'error' })
      return
    }
    openExisting(noteId)
  }

  function kindLine(): string {
    if (row.kind === 'bin') return '⊘ loose bin'
    if (row.kind === 'root') return `⌂ root board · ${model?.childCount ?? 0} children`
    if (row.kind === 'board') return `⬚ board · ${model?.childCount ?? 0} children`
    if (row.kind === 'image') return `▣ image${row.orphan ? ' · orphan — no words yet' : ''}`
    if (row.kind === 'note') return '¶ loose note'
    return `◯ pin${model?.noteId ? ' · has note' : ''}`
  }

  function glyph(kind: string | null): string {
    if (kind === 'board') return '⬚'
    if (kind === 'image') return '▣'
    if (kind === 'card') return '▤'
    if (kind === 'frame') return '▱'
    return '◯'
  }

  function chooseDifferent(): void {
    conflict = null
    queueMicrotask(() => {
      captureInput?.focus()
      captureInput?.select()
    })
  }
</script>

<aside class="preview" data-testid="outline-preview" aria-live="polite">
  <p class="kind-line">{kindLine()}</p>
  <h2 class:identity-fallback={row.titleFallback !== 'none'}>{row.title}</h2>

  {#if loading}
    <p class="muted">Loading preview…</p>
  {:else}
    {#if model?.assetContentHash && row.kind === 'image'}
      <div class="hero"><img src={`ew-asset://${model.assetContentHash}`} alt={row.title} /></div>
    {:else if filmstrip}
      <div class="filmstrip" data-testid="outline-filmstrip">
        {#each filmstrip.items as item, index (`${item.nodeId}:${index}`)}
          {#if item.kind === 'image' && item.thumbnailReady && !failedThumbs[item.contentHash]}
            <img
              src={item.thumbnailUrl}
              alt={item.filename}
              onerror={() => (failedThumbs[item.contentHash] = true)}
            />
          {:else}
            <span class="film-glyph" data-testid="outline-filmstrip-glyph">
              {item.kind === 'image'
                ? '▣'
                : item.appearanceKind === 'icon' && item.appearanceIcon
                  ? item.appearanceIcon
                  : glyph(item.appearanceKind)}
            </span>
          {/if}
        {/each}
        {#if filmstrip.remainderCount > 0}
          <span class="film-more" data-testid="outline-filmstrip-more">+{filmstrip.remainderCount}</span>
        {/if}
      </div>
    {/if}

    {#if model?.tags.length}
      <div class="tags">
        {#each model.tags as tag (tag)}
          <button type="button" class="tag-chip" onclick={() => onLensTag(tag)}>#{tag}</button>
        {/each}
      </div>
    {/if}

    {#if model?.noteExcerpt}
      <p class="excerpt" data-testid="outline-preview-excerpt">{model.noteExcerpt}</p>
    {:else if nodeId && !model?.noteId}
      <input
        bind:this={captureInput}
        class="note-capture"
        type="text"
        data-testid="outline-note-capture"
        placeholder="add a note…"
        value={draft}
        disabled={busy}
        oninput={(event) => rememberDraft(event.currentTarget.value)}
        onkeydown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          void attachDraft()
        }}
      />
    {/if}

    {#if model && row.kind !== 'bin'}
      <p class="places" data-testid="outline-preview-places">
        {#if model.places.length > 0}
          placed {model.places.length} × · {model.places.map((place) => place.canvasLabel).join(' · ')}
        {:else}
          no placements — lives in the loose bin
        {/if}
      </p>
    {/if}
  {/if}

  <div class="verbs" data-testid="outline-preview-verbs">
    {#each verbs as verb (verb.id)}
      <span class="verb-wrap">
        <button
          type="button"
          class:danger={verb.danger}
          data-verb-id={verb.id}
          disabled={!verb.run}
          onclick={() => verb.run?.()}
        ><span class="shortcut">{verb.shortcut}</span> {verb.label}</button>
        {#if verb.disabledReason}<small>{verb.disabledReason}</small>{/if}
      </span>
    {/each}
  </div>
</aside>

{#if conflict}
  <TitleConflictDialog
    {conflict}
    onOpenExisting={openExisting}
    onUseExisting={() => {}}
    onRestoreExisting={(noteId) => void restoreExisting(noteId)}
    onChooseDifferent={chooseDifferent}
  />
{/if}

<style>
  .preview { flex:1 1 42%; min-width:0; overflow:auto; padding:1rem 1.1rem; }
  .kind-line,.muted,.places { margin:0; color:var(--ew-text-subtle); font-family:var(--ew-font-mono); font-size:var(--ew-text-chip); }
  h2 { margin:0.6rem 0; font-size:0.95rem; }
  .identity-fallback { color:var(--ew-text-muted); font-family:var(--ew-font-mono); font-weight:400; }
  .hero { max-height:13rem; overflow:hidden; border:1px solid var(--ew-border); border-radius:7px; }
  .hero img { display:block; width:100%; height:100%; max-height:13rem; object-fit:cover; }
  .filmstrip { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:0.35rem; margin:0.7rem 0; }
  .filmstrip img,.film-glyph,.film-more { width:100%; aspect-ratio:1; border:1px solid var(--ew-border); border-radius:5px; background:var(--ew-surface-raised); }
  .filmstrip img { display:block; object-fit:cover; }
  .film-glyph,.film-more { display:flex; align-items:center; justify-content:center; color:var(--ew-text-muted); font-family:var(--ew-font-mono); }
  .tags { display:flex; flex-wrap:wrap; gap:0.3rem; margin:0.7rem 0; }
  .tag-chip,.verbs button { border:1px solid var(--ew-border-strong); background:var(--ew-surface-raised); color:var(--ew-text-muted); font:inherit; cursor:pointer; }
  .tag-chip { padding:0 0.5rem; border-radius:999px; font-size:var(--ew-text-chip); }
  .excerpt { margin:0.8rem 0; color:var(--ew-text-soft); line-height:1.55; white-space:pre-wrap; }
  .note-capture { box-sizing:border-box; width:100%; margin:0.7rem 0; padding:0.55rem 0.65rem; border:1px solid var(--ew-border-strong); border-radius:6px; background:var(--ew-surface-raised); color:var(--ew-text); font:inherit; }
  .note-capture:focus { outline:2px solid var(--ew-focus-ring); outline-offset:1px; }
  .verbs { display:flex; flex-wrap:wrap; gap:0.45rem; margin-top:1rem; }
  .verb-wrap { display:flex; flex-direction:column; align-items:flex-start; gap:0.15rem; }
  .verbs button { min-height:1.9rem; padding:0.25rem 0.55rem; border-radius:5px; }
  .verbs button:disabled { cursor:not-allowed; opacity:0.55; }
  .verbs button.danger { color:var(--ew-danger); }
  .shortcut { font-family:var(--ew-font-mono); }
  small { max-width:11rem; color:var(--ew-text-subtle); font-size:var(--ew-text-chip); }
  @media (pointer:coarse) { .verbs button { min-height:44px; padding-inline:0.75rem; } }
</style>

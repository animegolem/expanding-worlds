<!--
  Command palette (RFC §8.3 grammar, AI-IMP-211). A reusable, centered,
  screen-dimmed keyboard-first chooser: a takeover-FAMILY input blocker
  (AI-IMP-183) over a dimmed board. Rows come from an injected `search`
  verb; a non-empty query that names no existing row prepends a
  highlighted Create row (index 0) so plain Enter creates. ↑/↓ walk the
  rows, Enter commits the row under the cursor, Escape cancels (composing
  with §8.3/183 routing). The verbs — search, createLabel, oncommit,
  oncreate — are injected, so the same shell serves the note picker today
  and the pin wizard after the unification pass (§8.5 Parking Lot).
-->
<script module lang="ts">
  export interface PaletteItem {
    /** Stable id the caller keys its own record off (e.g. a noteId). */
    id: string
    /** The row's visible text and the exact-match key. */
    label: string
  }
</script>

<script lang="ts">
  import { registerInputBlocker } from '../chrome/takeover'
  import { contextMenuOpen } from '../menus/ContextMenu'
  import TextInput from '../ui/TextInput.svelte'
  import { overlayPortal } from './panels'

  let {
    placeholder,
    search,
    createLabel,
    oncommit,
    oncreate,
    onclose,
    error = null,
    testid = 'command-palette',
  }: {
    placeholder: string
    /** Verb: current matches for `query` (already filtered by the caller). */
    search: (query: string) => Promise<PaletteItem[]>
    /** Verb: the Create row's label for `query`, or null to offer none. */
    createLabel: (query: string) => string | null
    /** Verb: commit an existing row. */
    oncommit: (item: PaletteItem) => void
    /** Verb: commit a fresh title (the Create row / plain Enter). */
    oncreate: (query: string) => void
    onclose: () => void
    /** Caller-owned error line, rendered inside the (portaled) palette. */
    error?: string | null
    /** testid stem; sub-parts append -query / -results / -item / -create. */
    testid?: string
  } = $props()

  let query = $state('')
  let items = $state<PaletteItem[]>([])
  let cursor = $state(0)
  let inputEl = $state<HTMLInputElement | null>(null)

  type Row = { kind: 'create'; label: string } | { kind: 'item'; item: PaletteItem }

  // The Create row appears when the trimmed query names nothing already
  // in the matches (exact-match dedupe) — you would select an exact hit,
  // never duplicate it.
  const createText = $derived.by(() => {
    const trimmed = query.trim()
    if (trimmed.length === 0) return null
    const needle = trimmed.toLowerCase()
    if (items.some((item) => item.label.trim().toLowerCase() === needle)) return null
    return createLabel(trimmed)
  })

  const rows = $derived.by((): Row[] => {
    const out: Row[] = []
    if (createText !== null) out.push({ kind: 'create', label: createText })
    for (const item of items) out.push({ kind: 'item', item })
    return out
  })

  // Every keystroke re-highlights the top row: the Create row when it
  // exists (plain Enter creates), else the first match.
  $effect(() => {
    void query
    cursor = 0
  })

  // Search per keystroke; a generation guard drops a stale response whose
  // field has already moved on (the §8.3 discipline).
  let generation = 0
  $effect(() => {
    const q = query
    const mine = ++generation
    void search(q).then((result) => {
      if (mine === generation) items = result
    })
  })

  // Autofocus, and hold a takeover-FAMILY input blocker for the palette's
  // lifetime (AI-IMP-183): board shortcuts and Mod+P are suppressed under
  // it, and opening it retires the tag/search panels.
  $effect(() => {
    const release = registerInputBlocker(() => true)
    setTimeout(() => inputEl?.focus(), 0)
    return release
  })

  function activate(row: Row | undefined): void {
    if (!row) return
    if (row.kind === 'create') oncreate(query.trim())
    else oncommit(row.item)
  }

  function onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      cursor = Math.min(Math.max(0, cursor + delta), Math.max(0, rows.length - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      activate(rows[cursor] ?? rows[0])
    }
    // Escape is handled by the window-capture listener below so it also
    // consumes presses that reach the palette from outside the field.
  }

  // Escape closes and CONSUMES the press (capture) so the host never
  // clears the selection or drops a tool underneath (AI-IMP-183 M-24/M-28);
  // decline to a topmost context menu rather than steal its Escape (M-13).
  $effect(() => {
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (contextMenuOpen()) return
      event.stopImmediatePropagation()
      onclose()
    }
    window.addEventListener('keydown', onKeydown, true)
    return () => window.removeEventListener('keydown', onKeydown, true)
  })
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="scrim"
  data-testid={`${testid}-scrim`}
  role="presentation"
  use:overlayPortal
  onclick={(event) => {
    if (event.target === event.currentTarget) onclose()
  }}
>
  <div class="palette" role="dialog" aria-modal="true" data-testid={testid}>
    <TextInput
      variant="pill"
      data-testid={`${testid}-query`}
      {placeholder}
      style="width:100%; font-size:0.9rem; padding:0.4rem 0.6rem"
      bind:ref={inputEl}
      bind:value={query}
      onkeydown={onInputKeydown}
    />
    {#if error}
      <p class="error" data-testid={`${testid}-error`}>{error}</p>
    {/if}
    {#if rows.length > 0}
      <ul class="rows" data-testid={`${testid}-results`} role="listbox">
        {#each rows as row, index (row.kind === 'create' ? 'create' : row.item.id)}
          <li>
            <button
              type="button"
              class="row"
              class:cursor={index === cursor}
              class:create={row.kind === 'create'}
              role="option"
              aria-selected={index === cursor}
              data-testid={row.kind === 'create' ? `${testid}-create` : `${testid}-item`}
              data-id={row.kind === 'item' ? row.item.id : undefined}
              onclick={() => activate(row)}
            >
              {#if row.kind === 'create'}
                <span class="mark">+</span><span class="label">{row.label}</span>
              {:else}
                <span class="label">{row.item.label}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  /* Screen-dimmed takeover surround (the big editor's dim), portaled to
     the root overlay host so it escapes every local stacking context. */
  .scrim {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ew-scrim);
    /* overlay host is pointer-events:none; opt back in to catch clicks. */
    pointer-events: auto;
  }

  .palette {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    width: min(440px, 82%);
    max-height: 60%;
    padding: 0.6rem;
    background: var(--ew-surface-menu);
    border: 1px solid var(--ew-border);
    border-radius: 10px;
    box-shadow: 0 12px 34px var(--ew-shadow);
    color: var(--ew-text);
    font-size: 0.85rem;
  }

  .rows {
    margin: 0;
    padding: 0;
    overflow: auto;
    list-style: none;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    padding: 0.3rem 0.4rem;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--ew-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .row:hover {
    background: var(--ew-surface-raised);
  }

  .row.cursor {
    background: var(--ew-accent);
    color: var(--ew-on-accent);
  }

  .row.cursor .mark {
    color: var(--ew-on-accent);
  }

  .mark {
    flex: none;
    color: var(--ew-text-muted);
    font-weight: 700;
  }

  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .error {
    margin: 0;
    color: var(--ew-danger-muted);
    font-size: 0.78rem;
  }
</style>

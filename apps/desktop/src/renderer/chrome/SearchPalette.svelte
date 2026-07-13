<!-- RFC §8.3 rev 0.71: one centered search palette, never an anchored panel. -->
<script lang="ts">
  import type { CanvasHostHandle } from '../canvas/host'
  import { NODE_DRAG_MIME } from '../canvas/import-surfaces'
  import TextInput from '../ui/TextInput.svelte'
  import FindingState from '../ui/FindingState.svelte'
  import { requestCenterPlacements, requestOpenNote } from '../note/open-note'
  import { openTagPanel } from '../tags/tag-panel'
  import { navigateTo } from './navigation'
  import { closeSearchPanel, type SearchPanelState } from './search'
  import { contextMenuOpen } from '../menus/ContextMenu'
  import { failurePerch } from './status'
  import { fuzzyMatch, subsequenceScore } from './fzf-match'
  import {
    loadSearchSnapshot,
    SearchEpoch,
    type SearchResults,
    type SearchSnapshot,
    type SearchSnapshotCandidate,
  } from './search-model'

  interface NodeLocations {
    nodeId: string
    label: string
    placements: Array<{ placementId: string; canvasId: string; canvasLabel: string }>
  }
  interface TagFacet { kind: 'tag'; id: string; label: string }

  type Row =
    | { group: 'Notes'; kind: 'note'; id: string; label: string; detail: string }
    | { group: 'Boards'; kind: 'canvas'; id: string; label: string; detail: string; canvasId: string }
    | { group: 'Tags'; kind: 'tag'; id: string; label: string; detail: string }
    | { group: 'Images'; kind: 'image-node'; id: string; label: string; detail: string; nodeId: string }
    | { group: 'Images'; kind: 'asset'; id: string; label: string; detail: string }
    | { group: 'Images'; kind: 'asset-loc'; id: string; label: string; detail: string; nodeId: string; placementId: string; canvasId: string; canvasLabel: string }
    | { group: 'Images'; kind: 'asset-bg'; id: string; label: string; detail: string; canvasId: string; canvasLabel: string }
    | { group: 'Canvas text'; kind: 'canvas-text'; id: string; label: string; detail: string; canvasId: string }

  const GROUP_VERB: Record<Row['group'], string> = {
    Notes: '↵ open note', Boards: '↵ dive', Tags: '↵ open tag',
    Images: '↵ reveal · drag to place', 'Canvas text': '↵ fly',
  }
  const GROUP_ORDER: Row['group'][] = ['Notes', 'Boards', 'Tags', 'Images', 'Canvas text']
  const EMPTY_RESULTS: SearchResults = { notes: [], tags: [], assets: [], canvasText: [] }

  const { handle, panel }: { handle: CanvasHostHandle; panel: SearchPanelState } = $props()
  let query = $state('')
  let facets = $state<TagFacet[]>([])
  let snapshot = $state<SearchSnapshot | null>(null)
  let bodyResults = $state<SearchResults>(EMPTY_RESULTS)
  let expanded = $state<Record<string, NodeLocations[]>>({})
  let cursor = $state(0)
  let inputEl = $state<HTMLInputElement | null>(null)
  let listEl = $state<HTMLElement | null>(null)
  let loading = $state(true)
  let snapshotError = $state(false)
  let bodyError = $state(false)
  let folded = $state(false)
  let retryNonce = $state(0)
  const snapshotEpoch = new SearchEpoch()
  const bodyEpoch = new SearchEpoch()
  const searchFailures = failurePerch('search-query', 'Search is still unavailable')
  const searchError = $derived(snapshotError || bodyError)

  async function runQuery<T>(name: string, args?: unknown): Promise<T> {
    const response = await window.ew.project.query(name, args)
    if (!response.ok) throw new Error(response.message)
    return response.result as T
  }

  async function refreshSnapshot(): Promise<void> {
    const epoch = snapshotEpoch.begin()
    loading = true
    try {
      const next = await loadSearchSnapshot(runQuery)
      if (!snapshotEpoch.isCurrent(epoch)) return
      snapshot = next
      snapshotError = false
      searchFailures.succeeded()
    } catch {
      if (!snapshotEpoch.isCurrent(epoch)) return
      snapshot = null
      snapshotError = true
      searchFailures.failed()
    } finally {
      if (snapshotEpoch.isCurrent(epoch)) loading = false
    }
  }

  // Every opening starts from a coherent read-model snapshot. Project writes
  // refresh it; epoch checks keep an old project/response from winning.
  $effect(() => {
    void panel.serial
    query = ''
    facets = []
    bodyResults = EMPTY_RESULTS
    expanded = {}
    cursor = 0
    folded = false
    void refreshSnapshot()
    setTimeout(() => inputEl?.focus(), 0)
  })
  $effect(() => window.ew.project.onChanged(() => void refreshSnapshot()))

  const liveFragment = $derived(query.trim().split(/\s+/).at(-1)?.replace(/^#+/, '') ?? '')
  const tagCompletions = $derived.by(() => {
    if (!snapshot || liveFragment.length === 0) return []
    return snapshot.tags
      .map((tag) => ({ tag, score: subsequenceScore(liveFragment, tag.name) }))
      .filter((entry): entry is { tag: { id: string; name: string }; score: number } => entry.score !== null)
      .filter((entry) => !facets.some((facet) => facet.id === entry.tag.id))
      .sort((a, b) => a.score - b.score || a.tag.name.localeCompare(b.tag.name))
      .slice(0, 6)
  })

  const fuzzyCandidates = $derived.by(() => {
    if (!snapshot) return []
    if (query.trim().length === 0 && facets.length === 0) return []
    const matches = query.trim().length === 0
      ? snapshot.candidates.map((candidate) => ({ candidate, score: 0 }))
      : fuzzyMatch(snapshot.candidates, query)
    return matches
      .map((match) => match.candidate)
      .filter((candidate) => facets.every((facet) =>
        candidate.tags.some((tag) => tag.localeCompare(facet.label, undefined, { sensitivity: 'base' }) === 0),
      ))
  })

  // Bodies and canvas text remain on the shipped substring/FTS path. #terms
  // are renderer facets and never leak into FTS syntax.
  $effect(() => {
    const plain = query.split(/\s+/).filter((term) => term.length > 0 && !term.startsWith('#')).join(' ')
    void retryNonce
    const epoch = bodyEpoch.begin()
    if (plain.length === 0) {
      bodyResults = EMPTY_RESULTS
      bodyError = false
      return
    }
    const timer = setTimeout(() => {
      void runQuery<SearchResults>('searchProject', { query: plain }).then((next) => {
        if (!bodyEpoch.isCurrent(epoch)) return
        bodyResults = next
        bodyError = false
        searchFailures.succeeded()
      }).catch(() => {
        if (!bodyEpoch.isCurrent(epoch)) return
        bodyResults = EMPTY_RESULTS
        bodyError = true
        searchFailures.failed()
      })
    }, 120)
    return () => clearTimeout(timer)
  })

  function pushSnapshotRow(flat: Row[], candidate: SearchSnapshotCandidate): void {
    switch (candidate.kind) {
      case 'note': flat.push({ group: 'Notes', kind: 'note', id: candidate.noteId, label: candidate.label, detail: '' }); break
      case 'canvas': flat.push({ group: 'Boards', kind: 'canvas', id: candidate.id, label: candidate.label, detail: '', canvasId: candidate.canvasId }); break
      case 'tag': flat.push({ group: 'Tags', kind: 'tag', id: candidate.tagId, label: candidate.label, detail: '' }); break
      case 'image-node': flat.push({ group: 'Images', kind: 'image-node', id: candidate.id, label: candidate.label, detail: candidate.filename, nodeId: candidate.nodeId }); break
    }
  }

  function hasEveryFacet(candidate: SearchSnapshotCandidate | undefined): boolean {
    if (facets.length === 0) return true
    return candidate !== undefined && facets.every((facet) =>
      candidate.tags.some((tag) =>
        tag.localeCompare(facet.label, undefined, { sensitivity: 'base' }) === 0,
      ),
    )
  }

  function snapshotCandidate(
    predicate: (candidate: SearchSnapshotCandidate) => boolean,
  ): SearchSnapshotCandidate | undefined {
    return snapshot?.candidates.find(predicate)
  }

  const rows = $derived.by((): Row[] => {
    const flat: Row[] = []
    const ids = new Set<string>()
    for (const candidate of fuzzyCandidates) {
      pushSnapshotRow(flat, candidate)
      ids.add(candidate.id)
    }
    for (const note of bodyResults.notes) {
      if (ids.has(`note:${note.noteId}`)) continue
      if (!hasEveryFacet(snapshotCandidate((candidate) =>
        candidate.kind === 'note' && candidate.noteId === note.noteId,
      ))) continue
      flat.push({ group: 'Notes', kind: 'note', id: note.noteId, label: note.title, detail: note.snippet })
    }
    for (const tag of bodyResults.tags) {
      if (ids.has(`tag:${tag.tagId}`)) continue
      if (!hasEveryFacet(snapshotCandidate((candidate) =>
        candidate.kind === 'tag' && candidate.tagId === tag.tagId,
      ))) continue
      flat.push({ group: 'Tags', kind: 'tag', id: tag.tagId, label: tag.name, detail: '' })
    }
    for (const asset of bodyResults.assets) {
      const matchingNodeIds = asset.usingNodeIds.filter((nodeId) =>
        hasEveryFacet(snapshotCandidate((candidate) =>
          candidate.kind === 'image-node' && candidate.nodeId === nodeId,
        )),
      )
      if (facets.length > 0 && matchingNodeIds.length === 0) continue
      flat.push({
        group: 'Images', kind: 'asset', id: asset.assetId, label: asset.filename,
        detail: `${matchingNodeIds.length} node${matchingNodeIds.length === 1 ? '' : 's'}`,
      })
      if (expanded[asset.assetId]) {
        for (const bg of asset.usingCanvases)
          flat.push({ group: 'Images', kind: 'asset-bg', id: `bg-${bg.canvasId}`, label: bg.canvasLabel, detail: 'background', canvasId: bg.canvasId, canvasLabel: bg.canvasLabel })
        for (const node of expanded[asset.assetId] ?? []) {
          if (!matchingNodeIds.includes(node.nodeId)) continue
          for (const placement of node.placements)
            flat.push({ group: 'Images', kind: 'asset-loc', id: placement.placementId, label: node.label, detail: placement.canvasLabel, nodeId: node.nodeId, placementId: placement.placementId, canvasId: placement.canvasId, canvasLabel: placement.canvasLabel })
        }
      }
    }
    for (const hit of bodyResults.canvasText) {
      if (facets.length > 0) continue
      flat.push({ group: 'Canvas text', kind: 'canvas-text', id: hit.decorationId, label: hit.snippet, detail: '', canvasId: hit.canvasId })
    }
    return flat.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group))
  })

  async function revealNode(nodeId: string): Promise<void> {
    const locations = await runQuery<NodeLocations | null>('getNodeLocations', { nodeId })
    const first = locations?.placements[0]
    if (!first) return
    if (first.canvasId !== handle.canvasId) await navigateTo(first.canvasId, first.canvasLabel)
    requestCenterPlacements([first.placementId])
    closeSearchPanel()
  }

  async function activate(row: Row): Promise<void> {
    switch (row.kind) {
      case 'note': requestOpenNote(row.id); closeSearchPanel(); break
      case 'canvas': if (row.canvasId !== handle.canvasId) await navigateTo(row.canvasId, row.label); closeSearchPanel(); break
      case 'tag': openTagPanel(row.id, null); closeSearchPanel(); break
      case 'image-node': await revealNode(row.nodeId); break
      case 'asset': {
        if (expanded[row.id]) { const next = { ...expanded }; delete next[row.id]; expanded = next; break }
        const asset = bodyResults.assets.find((entry) => entry.assetId === row.id)
        if (!asset) break
        const nodes = await Promise.all(asset.usingNodeIds.map((nodeId) => runQuery<NodeLocations | null>('getNodeLocations', { nodeId })))
        expanded = { ...expanded, [row.id]: nodes.filter((node): node is NodeLocations => node !== null) }
        break
      }
      case 'asset-loc':
        if (row.canvasId !== handle.canvasId) await navigateTo(row.canvasId, row.canvasLabel)
        requestCenterPlacements([row.placementId]); closeSearchPanel(); break
      case 'asset-bg': if (row.canvasId !== handle.canvasId) await navigateTo(row.canvasId, row.canvasLabel); closeSearchPanel(); break
      case 'canvas-text':
        if (row.canvasId !== handle.canvasId) await navigateTo(row.canvasId, 'Board')
        requestCenterPlacements([row.id]); closeSearchPanel(); break
    }
  }

  function commitTagCompletion(): boolean {
    const completion = tagCompletions[0]
    if (!completion) return false
    facets = [...facets, { kind: 'tag', id: completion.tag.id, label: completion.tag.name }]
    const pieces = query.trim().split(/\s+/)
    pieces.pop()
    query = pieces.join(' ')
    cursor = 0
    return true
  }

  function onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
      if (commitTagCompletion()) event.preventDefault()
      return
    }
    if (event.key === 'Backspace' && query.length === 0 && facets.length > 0) {
      event.preventDefault(); facets = facets.slice(0, -1); return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopPropagation()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      cursor = Math.min(Math.max(0, cursor + delta), Math.max(0, rows.length - 1))
      listEl?.querySelector('.cursor')?.scrollIntoView({ block: 'nearest' })
    } else if (event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation()
      const row = rows[cursor] ?? rows[0]
      if (row) void activate(row)
    }
  }

  function beginDrag(event: DragEvent, nodeId: string): void {
    const dt = event.dataTransfer
    if (!dt) return
    dt.setData(NODE_DRAG_MIME, nodeId)
    dt.effectAllowed = 'copy'
    folded = true
    let dropped = false
    const onDrop = (): void => { dropped = true; stop(); closeSearchPanel() }
    const onEnd = (): void => { stop(); if (!dropped) folded = false }
    const stop = (): void => {
      window.removeEventListener('drop', onDrop, true)
      window.removeEventListener('dragend', onEnd, true)
    }
    window.addEventListener('drop', onDrop, true)
    window.addEventListener('dragend', onEnd, true)
  }

  $effect(() => {
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || contextMenuOpen()) return
      event.stopImmediatePropagation(); closeSearchPanel()
    }
    window.addEventListener('keydown', onKeydown, true)
    return () => window.removeEventListener('keydown', onKeydown, true)
  })
</script>

<div class:hidden={folded} class="search-scrim" data-testid="search-scrim" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) closeSearchPanel() }}>
  <section class="search-palette" data-testid="search-panel" data-mode={panel.mode} data-cursor={cursor} aria-label="Search palette">
    <header>
      <span class="glyph">⌕</span>
      <div class="query-stack" data-testid="search-query-field">
        {#if facets.length > 0}
          <div class="facets" data-testid="search-facets">
            {#each facets as facet (facet.id)}
              <button type="button" class="facet" data-testid="search-facet" onclick={() => (facets = facets.filter((entry) => entry.id !== facet.id))}>#{facet.label} <span>✕</span></button>
            {/each}
          </div>
        {/if}
        <TextInput variant="bare" data-testid="search-input" placeholder="Find titles, tags, filenames, or note text…" bind:ref={inputEl} bind:value={query} onkeydown={onInputKeydown} />
      </div>
      <button type="button" class="close" data-testid="search-close" aria-label="Close" onclick={closeSearchPanel}>✕</button>
    </header>

    {#if tagCompletions.length > 0 && liveFragment.length > 0}
      <div class="completion" data-testid="search-tag-completion">Tab crystallizes #{tagCompletions[0].tag.name}</div>
    {/if}
    {#if searchError}
      <FindingState message="Search stumbled — keep typing or" error testid="search-error" onretry={() => { retryNonce += 1; void refreshSnapshot() }} />
    {:else if rows.length > 0}
      <ul class="results" bind:this={listEl} role="listbox">
        {#each rows as row, index (`${row.kind}-${row.id}`)}
          {#if row.group !== rows[index - 1]?.group}
            <li class="group-label" data-testid={`search-group-${row.group}`}><span>{row.group}</span><span>{GROUP_VERB[row.group]}</span></li>
          {/if}
          <li>
            <button type="button" class="row" class:cursor={index === cursor} class:nested={row.kind === 'asset-loc' || row.kind === 'asset-bg'} role="option" aria-selected={index === cursor} data-testid="search-hit" data-kind={row.kind} data-id={row.id} draggable={row.kind === 'image-node' || row.kind === 'asset-loc'} ondragstart={(event) => { if (row.kind === 'image-node' || row.kind === 'asset-loc') beginDrag(event, row.nodeId) }} onclick={() => void activate(row)}>
              {#if row.kind === 'asset'}<span class="twist">{expanded[row.id] ? '▾' : '▸'}</span>{:else if row.kind === 'asset-loc'}<span class="twist">⌖</span>{:else if row.kind === 'asset-bg'}<span class="twist">▣</span>{/if}
              <span class="label">{row.label}</span>{#if row.detail}<span class="detail">{row.detail}</span>{/if}
              {#if row.kind === 'image-node' || row.kind === 'asset-loc'}<span class="drag-affordance" aria-hidden="true">⋮⋮</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {:else if loading}
      <p class="state" data-testid="search-loading">Reading this world…</p>
    {:else if query.trim().length > 0 || facets.length > 0}
      <FindingState message={`No active matches for "${query}" — Trash stays out of search.`} testid="search-empty" />
    {:else}
      <div class="rest" data-testid="search-rest"><strong>Find anything in this world</strong><span>Type loosely · # narrows to tags · Tab pins a tag · ↵ follows the named verb</span></div>
    {/if}
  </section>
</div>

<style>
  .search-scrim { position:absolute; inset:0; z-index:500; display:flex; justify-content:center; align-items:flex-start; padding-top:46px; background:var(--ew-scrim); pointer-events:auto; }
  .search-scrim.hidden { display:none; }
  .search-palette { width:min(680px, calc(100vw - 160px)); max-height:calc(100vh - 160px); display:flex; flex-direction:column; padding:0.65rem 0.75rem 0.75rem; background:var(--ew-surface-menu); border:1px solid var(--ew-border); border-radius:9px; box-shadow:0 16px 42px var(--ew-shadow); color:var(--ew-text); font-size:0.78rem; pointer-events:auto; }
  header { display:flex; align-items:flex-start; gap:0.5rem; }
  .glyph { padding-top:0.35rem; color:var(--ew-text-muted); font-weight:600; }
  .query-stack { flex:1; min-width:0; display:flex; flex-wrap:wrap; align-items:center; gap:0.3rem; padding:0.3rem 0.45rem; background:var(--ew-surface-raised); border:1px solid var(--ew-border-strong); border-radius:7px; }
  .query-stack:focus-within { outline:2px solid var(--ew-focus-ring); outline-offset:1px; }
  .query-stack :global(.ew-text-input) { flex:1; min-width:12rem; }
  .facets { display:flex; flex-wrap:wrap; gap:0.25rem; }
  .facet { padding:0.12rem 0.4rem; border:1px solid var(--ew-accent); border-radius:999px; background:var(--ew-accent-soft); color:var(--ew-text); font:inherit; cursor:pointer; }
  .close { min-width:24px; height:24px; border:0; background:transparent; color:var(--ew-text-muted); cursor:pointer; }
  .completion { margin:0.3rem 0 0 1.7rem; color:var(--ew-text-muted); font-size:0.68rem; }
  .results { margin:0.45rem 0 0; padding:0; list-style:none; overflow:auto; }
  .group-label { display:flex; justify-content:space-between; padding:0.38rem 0.35rem 0.16rem; color:var(--ew-text-muted); font-size:0.64rem; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; }
  .row { display:flex; align-items:center; gap:0.4rem; width:100%; padding:0.28rem 0.4rem; border:0; border-radius:5px; background:transparent; color:var(--ew-text); font:inherit; text-align:left; cursor:pointer; }
  .row:hover { background:var(--ew-surface-raised); }
  .row.cursor { background:var(--ew-accent); color:var(--ew-on-accent); }
  .row.cursor .detail, .row.cursor .twist, .row.cursor .drag-affordance { color:var(--ew-on-accent); }
  .row.nested { padding-left:1.2rem; }
  .label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .detail { margin-left:auto; overflow:hidden; color:var(--ew-text-muted); text-overflow:ellipsis; white-space:nowrap; }
  .twist, .drag-affordance { flex:none; color:var(--ew-text-muted); }
  .state { color:var(--ew-text-muted); }
  .rest { display:flex; flex-direction:column; gap:0.25rem; padding:1.25rem 1.7rem; color:var(--ew-text-muted); }
  .rest strong { color:var(--ew-text); font-size:0.9rem; }
</style>

<!--
  Gallery takeover (RFC §14.4, AI-IMP-077): the file-browser
  projection over the project's nodes. A VIRTUALIZED thumbnail grid —
  DOM and hydration scale with the viewport, never the collection —
  grouped into date buckets whose sticky header names where you are
  and opens the period list for random access into deep time (one
  control, two jobs). Thumbnails load over ew-asset://<hash>/thumb
  with a one-line fallback to the original, and repaint as the
  background generator (076) lands derivatives.

  078 adds the retrieval half: a facet strip (sort · kind mask · tag
  filter · cleanup toggles) whose state composes into the index
  query's arguments — filtering happens in SQL, the virtualization
  core is untouched. Buckets are DATE sort's presentation; name and
  size render the flat grid. Note-kind cells are text posts (FR-8):
  title plus a clamped body excerpt, tags on hover.

  079 adds the pointer selection model (rev 0.25): click selects one
  cell and sets the anchor; Shift+click extends the LINEAR
  document-order range from the anchor across bucket boundaries —
  never a rectangle; Mod+click toggles membership without disturbing
  the anchor. A non-empty selection mounts the floating action bar
  (tag · place · trash, GalleryActionBar). Place closes the takeover
  FIRST (070 precedent), then runs every id through the §6.10
  requestPlaceNode seam; a single-cell HTML5 drag-out mirrors the
  outline's beginRowDrag (NODE_DRAG_MIME + close at the cell's
  bounds). Escape peels selection before the takeover's own Escape
  (capture phase).

  089 adds the primary scope toggle (rev 0.22): *this world ·
  everything* selects WHOSE gallery is shown — the current
  project's, or the designated library project's. "Everything" IS
  the library's gallery browsed read-only over the secondary seam
  (088): the query names are the primary's, only the transport
  swaps, and thumbnails carry ?scope=source so ew-asset serves the
  source's store. Selection and the keyboard stay scope-agnostic
  (pure index arithmetic); place / dive / tag / trash disable
  outside this-world — you cannot mutate, or reference, a read-only
  source (§14.4: projects source, never reference). No designated
  library → the everything side shows the designation prompt; a
  world whose mirror is off gets one honest notice line.

  080 adds the keyboard model (rev 0.25): a cursor — focus ring
  distinct from the selection highlight, roving tabindex — whose
  math lives in gallery-keys.ts as pure index arithmetic (the
  virtualization means the DOM can't be consulted). Plain arrows
  move it and collapse selection; Shift+arrows extend the SAME
  linear range Shift+click computes; Mod+Space toggles membership
  (bare Space stays reserved for preview); Mod+A selects the filter
  scope; Enter is the kind-appropriate primary action (§8.3);
  Delete runs the action bar's trash; PageUp/Down page the
  viewport; Mod+Up/Down bucket-jump under date sort. Keys live on
  the grid listbox, so the facet strip's and action bar's fields
  keep their own.
-->
<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte'
  import { NODE_DRAG_MIME } from '../canvas/import-surfaces'
  import { requestPlaceMode } from '../canvas/place-mode'
  import {
    clearFrameLoad,
    pendingFrameLoad,
    requestLoadIntoFrame,
  } from '../canvas/frame-load'
  import { navigateTo } from '../chrome/navigation'
  import { acquireSourceSlot, releaseSourceSlot } from '../chrome/source-slot'
  import { toast } from '../chrome/status'
  import { closeTakeover } from '../chrome/takeover'
  import { requestOpenNote, requestPlaceNode } from '../note/open-note'
  import { openCornerPanel } from '../note/panels'
  import GalleryActionBar from './GalleryActionBar.svelte'
  import GalleryFacets from './GalleryFacets.svelte'
  import TextInput from '../ui/TextInput.svelte'
  import { bucketByDate, type GalleryBucket } from './gallery-buckets'
  import {
    bucketJumpTarget,
    cellRows,
    columnOf,
    horizontalTarget,
    linearRange,
    verticalTarget,
  } from './gallery-keys'

  type GalleryKind = 'image' | 'note' | 'board'
  type GallerySort = 'date' | 'name' | 'size'

  interface IndexEntry {
    nodeId: string
    createdAt: string
    kind: GalleryKind
  }

  interface Item {
    nodeId: string
    kind: GalleryKind
    label: string
    appearanceColor: string | null
    contentHash: string | null
    width: number | null
    height: number | null
    childCanvasId: string | null
    noteId: string | null
    noteExcerpt: string | null
    tagNames: string[]
  }

  const CELL = 168
  const GAP = 10
  const PAD = 16
  const HEADER_H = 40
  const OVERSCAN = 400

  let index = $state<IndexEntry[]>([])
  let loaded = $state(false)
  let items = $state<Record<string, Item>>({})
  // Bumped when the cache clears; in-flight hydrations from an
  // older generation are dropped instead of resurrecting stale rows.
  let itemsGeneration = 0
  let thumbNonce = $state<Record<string, number>>({})
  let scroller = $state<HTMLElement | null>(null)
  let gridEl = $state<HTMLElement | null>(null)
  let viewportWidth = $state(900)
  let viewportHeight = $state(700)
  let scrollTop = $state(0)
  let jumpOpen = $state(false)

  // ------------------------------------------- 079 pointer selection
  // View state (rev 0.25): a set of node ids plus the anchor the
  // Shift range extends from. Document order is the CURRENT index
  // array — whatever sort/filter produced it.
  let selected = $state<Set<string>>(new Set())
  let anchor = $state<string | null>(null)
  let tagOpen = $state(false)
  let actionBar = $state<{ trashSelection: () => Promise<void> } | null>(null)

  // ------------------------------------------- 080 keyboard cursor
  // View state: the cursor's node id plus the remembered visual
  // column for Up/Down runs (so a trip through a short row comes
  // back out in the column the run started in).
  let cursor = $state<string | null>(null)
  let preferredCol = $state(0)

  // ------------------------------------------------- 089 scope state
  // The primary toggle (§14.4): this-world is the default and the
  // component owns all gallery view state, so scope resets whenever
  // the takeover reopens or the project changes — no persistence.
  type GalleryScope = 'this-world' | 'everything'
  let scope = $state<GalleryScope>('this-world')
  // Everything scope is live only once the library is OPEN in the
  // source slot; until then the grid is gated (prompt or wait).
  let sourceOpen = $state(false)
  let needsLibrary = $state(false)
  let libraryError = $state<string | null>(null)
  let mirrorOff = $state(false)
  let libraryDirInput = $state('')
  // 094: create-new-library path + clear-the-example affordance.
  let creatingLibrary = $state(false)
  let hasExample = $state(false)
  let clearingExample = $state(false)
  let clearError = $state<string | null>(null)
  // 091: the source panel evicted this view from the source slot —
  // everything degraded to this-world; one honest notice line says so.
  let evictedNotice = $state(false)
  // Async fence, non-reactive: scopeEpoch invalidates in-flight open
  // handshakes when the user flips again mid-open. Slot OWNERSHIP
  // moved to the source-slot registry (091): release closes only what
  // this view still holds, so another surface's slot is never stomped.
  let scopeEpoch = 0
  const SLOT_OWNER = 'gallery'

  const scopeReady = $derived(scope === 'this-world' || sourceOpen)

  // ---------------------------------------------------- 078 facets
  // Facet state is view state (§14.4): it composes into the index
  // query's arguments and never writes.
  let sort = $state<GallerySort>('date')
  let kinds = $state<GalleryKind[]>([])
  let tagFilters = $state<Array<{ id: string; name: string }>>([])
  let untagged = $state(false)
  let unplaced = $state(false)

  const facetArgs = $derived({
    sort,
    kinds: [...kinds],
    tagIds: tagFilters.map((tag) => tag.id),
    untagged,
    unplaced,
  })

  /** 089: the seam mirrors the primary's query surface, so scope
   * swaps the TRANSPORT and nothing else — same names, same args. */
  async function runQuery<T>(name: string, args?: unknown): Promise<T> {
    const response =
      scope === 'everything'
        ? await window.ew.secondary.query('source', name, args)
        : await window.ew.project.query(name, args)
    if (!response.ok) throw new Error(response.message)
    return response.result as T
  }

  async function refresh(args: typeof facetArgs): Promise<void> {
    const generation = itemsGeneration
    let next: IndexEntry[]
    try {
      next = await runQuery<IndexEntry[]>('getGalleryIndex', args)
    } catch {
      next = []
    }
    // A scope flip (or project push) bumped the generation while this
    // query flew: the rows belong to the other transport — drop them
    // whole, the hydration cache's staleness rule (089 extends it).
    if (generation !== itemsGeneration) return
    index = next
    loaded = true
    // A project push (trash, external edits) can retire selected
    // nodes: prune the selection to ids still in the grid. Runs after
    // the await, so these reads are outside the effect's tracking.
    const live = new Set(index.map((entry) => entry.nodeId))
    if ([...selected].some((id) => !live.has(id))) {
      selected = new Set([...selected].filter((id) => live.has(id)))
    }
    if (anchor !== null && !live.has(anchor)) anchor = null
    if (cursor !== null && !live.has(cursor)) cursor = null
  }

  // A facet change re-queries AND rehomes the viewport: the old
  // scroll offset points into a grid that no longer exists — and so
  // does the selection that referenced it (079). 089 gates it on
  // scope readiness: in everything scope nothing queries until the
  // library is open in the source slot.
  $effect(() => {
    if (!scopeReady) return
    void refresh(facetArgs)
    untrack(() => {
      scroller?.scrollTo({ top: 0 })
      scrollTop = 0
      selected = new Set()
      anchor = null
      tagOpen = false
      cursor = null
      preferredCol = 0
    })
  })
  // Hydrated items are NOT immutable across project changes (titles,
  // excerpts, tag names, child canvases) — drop the cache with the
  // stale index; the visible window rehydrates in one batch
  // (PR #3 review).
  $effect(() =>
    window.ew.project.onChanged(() => {
      itemsGeneration += 1
      items = {}
      if (scope === 'this-world' || sourceOpen) void refresh(facetArgs)
    }),
  )

  // ------------------------------------------- 089 scope lifecycle
  /** Flip the toggle. Rows, hydrated items, and tag filters all
   * belong to a PROJECT — everything empties before the other
   * transport answers (tag ids don't translate across projects, so
   * filters clear rather than pretend). */
  function setScope(next: GalleryScope): void {
    if (next === scope) return
    scope = next
    evictedNotice = false
    scopeEpoch += 1
    itemsGeneration += 1
    items = {}
    index = []
    loaded = false
    tagFilters = []
    selected = new Set()
    anchor = null
    cursor = null
    tagOpen = false
    if (next === 'this-world') leaveEverything()
    else void enterEverything(scopeEpoch)
  }

  function leaveEverything(): void {
    needsLibrary = false
    libraryError = null
    sourceOpen = false
    releaseSourceSlot(SLOT_OWNER)
  }

  /** 091: the source panel took the slot out from under everything
   * scope. Degrade to this-world (the transport is gone), then say
   * so — the notice rides the mirror-notice line's grammar. */
  function onSlotEvicted(): void {
    if (scope !== 'everything') return
    setScope('this-world')
    evictedNotice = true
  }

  async function enterEverything(epoch: number): Promise<void> {
    // The honesty line (§14.4): when this world does not mirror,
    // "everything" is not the converging superset of it. Silent
    // until CONFIRMED off — a stale value must not flash the notice.
    mirrorOff = false
    void window.ew.project.query('getSettings').then((response) => {
      if (epoch !== scopeEpoch) return
      mirrorOff = !(
        response.ok &&
        (response.result as Record<string, unknown>)['mirror_drops'] === true
      )
    })
    const settings = await window.ew.settings.appAll()
    if (epoch !== scopeEpoch) return
    const dir = settings['libraryProjectDir']
    if (typeof dir !== 'string' || dir.length === 0) {
      needsLibrary = true
      return
    }
    await openLibrary(dir, epoch, false)
  }

  /** Open the library into the source slot (via the 091 registry —
   * acquire evicts the panel if it holds the slot, symmetrically).
   * `store` designates: the app setting is written only AFTER a
   * successful open validated the directory as a real project. */
  async function openLibrary(dir: string, epoch: number, store: boolean): Promise<void> {
    const opened = await acquireSourceSlot(SLOT_OWNER, dir, onSlotEvicted)
    if (epoch !== scopeEpoch) {
      // The user flipped away mid-open: release the slot unshown
      // (a no-op if another owner has meanwhile acquired it).
      if (opened.ok) releaseSourceSlot(SLOT_OWNER)
      return
    }
    if (!opened.ok) {
      needsLibrary = true
      libraryError = opened.message
      return
    }
    if (store) await window.ew.settings.setApp('libraryProjectDir', dir)
    needsLibrary = false
    libraryError = null
    sourceOpen = true
  }

  function designateLibrary(): void {
    const dir = libraryDirInput.trim()
    if (dir.length === 0) return
    void openLibrary(dir, scopeEpoch, true)
  }

  /** 094 create-new (§14.4): make a fresh library project at main's
   * default location. Creation borrows the WRITABLE library slot —
   * the utility creates the project and seeds the first-open example
   * into it there — then releases it and browses through the source
   * slot exactly like a designated library (openLibrary stores the
   * setting only after the open validated the directory). */
  async function createLibrary(): Promise<void> {
    if (creatingLibrary) return
    const epoch = scopeEpoch
    creatingLibrary = true
    libraryError = null
    try {
      const dir = await window.ew.secondary.defaultLibraryDir()
      const created = await window.ew.secondary.open('library', dir, {
        createIfMissing: true,
        title: 'Library',
      })
      if (!created.ok) {
        if (epoch === scopeEpoch) libraryError = created.message
        return
      }
      await window.ew.secondary.close('library')
      if (epoch !== scopeEpoch) return
      await openLibrary(dir, epoch, true)
    } finally {
      creatingLibrary = false
    }
  }

  // ------------------------------------------- 094 clear-the-example
  // §14.4: the explainer's one power. HONEST V1 SHAPE: the explainer
  // NOTE lives in the library while the user stands in a primary
  // project (switch-project is deferred), so the note body instructs
  // and the actual action is this header affordance — visible only
  // while example-tagged content exists in the everything scope.
  $effect(() => {
    if (scope === 'everything' && sourceOpen) void checkExample(scopeEpoch)
    else {
      hasExample = false
      clearError = null
    }
  })

  async function checkExample(epoch: number): Promise<void> {
    try {
      const tags = await window.ew.secondary.query('source', 'listTags')
      if (epoch !== scopeEpoch) return
      const example = tags.ok
        ? (tags.result as Array<{ id: string; name: string }>).find(
            (tag) => tag.name.trim().toLowerCase() === 'example',
          )
        : undefined
      if (!example) {
        hasExample = false
        return
      }
      const index = await window.ew.secondary.query('source', 'getGalleryIndex', {
        tagIds: [example.id],
      })
      if (epoch !== scopeEpoch) return
      hasExample = index.ok && Array.isArray(index.result) && index.result.length > 0
    } catch {
      hasExample = false
    }
  }

  /** Trash every example-tagged record + the explainer through the
   * seam: borrow the writable library slot (the source slot is
   * read-only by construction), run the utility's clear verb —
   * ordinary TrashNode commands — release the slot, refresh. */
  async function clearExample(): Promise<void> {
    if (clearingExample) return
    const epoch = scopeEpoch
    clearingExample = true
    clearError = null
    try {
      const settings = await window.ew.settings.appAll()
      const dir = settings['libraryProjectDir']
      if (typeof dir !== 'string' || dir.length === 0) return
      const opened = await window.ew.secondary.open('library', dir)
      if (!opened.ok) {
        if (epoch === scopeEpoch) clearError = opened.message
        return
      }
      const cleared = await window.ew.secondary.clearLibraryExample()
      await window.ew.secondary.close('library')
      if (epoch !== scopeEpoch) return
      if (!cleared.ok) {
        clearError = cleared.message
        return
      }
      itemsGeneration += 1
      items = {}
      void refresh(facetArgs)
      void checkExample(epoch)
    } finally {
      clearingExample = false
    }
  }

  // Unmount (the takeover closing) releases the source slot; scope
  // itself needs no reset — this component IS the gallery's state.
  $effect(() => {
    return () => releaseSourceSlot(SLOT_OWNER)
  })
  // 076's push: a landed derivative repaints its cells by cache-bust.
  $effect(() =>
    window.ew.derivatives.onThumbnailReady(({ contentHash }) => {
      thumbNonce = { ...thumbNonce, [contentHash]: (thumbNonce[contentHash] ?? 0) + 1 }
    }),
  )

  // Buckets are DATE sort's presentation (§14.4): name and size
  // render the flat grid — no headers, no period control.
  const buckets = $derived(sort === 'date' ? bucketByDate(index, new Date()) : [])
  const columns = $derived(
    Math.max(2, Math.floor((viewportWidth - PAD * 2 + GAP) / (CELL + GAP))),
  )
  // 080: the visual row structure as pure index math — the cursor's
  // Up/Down and the layout below MUST chunk identically.
  const keyRows = $derived(cellRows(index.length, columns, buckets))

  type Row =
    | { kind: 'header'; bucket: GalleryBucket; top: number }
    | { kind: 'cells'; entries: IndexEntry[]; top: number }

  const layout = $derived.by(() => {
    const rows: Row[] = []
    let top = 0
    if (sort === 'date') {
      for (const bucket of buckets) {
        rows.push({ kind: 'header', bucket, top })
        top += HEADER_H
        const end = bucket.startIndex + bucket.count
        for (let i = bucket.startIndex; i < end; i += columns) {
          rows.push({ kind: 'cells', entries: index.slice(i, Math.min(i + columns, end)), top })
          top += CELL + GAP
        }
      }
    } else {
      top = PAD
      for (let i = 0; i < index.length; i += columns) {
        rows.push({ kind: 'cells', entries: index.slice(i, i + columns), top })
        top += CELL + GAP
      }
    }
    return { rows, totalHeight: top + PAD }
  })

  const visibleRows = $derived(
    layout.rows.filter((row) => {
      const height = row.kind === 'header' ? HEADER_H : CELL + GAP
      return row.top + height >= scrollTop - OVERSCAN && row.top <= scrollTop + viewportHeight + OVERSCAN
    }),
  )

  // The sticky header names the bucket the viewport is inside.
  const currentBucket = $derived.by(() => {
    let current: GalleryBucket | null = buckets[0] ?? null
    for (const row of layout.rows) {
      if (row.kind !== 'header') continue
      if (row.top <= scrollTop + HEADER_H) current = row.bucket
      else break
    }
    return current
  })

  // Hydrate exactly the visible window; in-flight ids are not
  // re-requested. Item records are mutable across project changes
  // (the cache clears then), so responses carry the generation they
  // were requested under and stale ones are dropped whole.
  const pending = new Set<string>()
  $effect(() => {
    const wanted: string[] = []
    for (const row of visibleRows) {
      if (row.kind !== 'cells') continue
      for (const entry of row.entries) {
        if (!(entry.nodeId in items) && !pending.has(entry.nodeId)) wanted.push(entry.nodeId)
      }
    }
    if (wanted.length === 0) return
    for (const id of wanted) pending.add(id)
    const generation = itemsGeneration
    void runQuery<Item[]>('getGalleryItems', { nodeIds: wanted })
      .then((fetched) => {
        if (generation !== itemsGeneration) return
        const next = { ...items }
        for (const item of fetched) next[item.nodeId] = item
        items = next
      })
      .catch(() => undefined)
      .then(() => {
        for (const id of wanted) pending.delete(id)
      })
  })

  /** 089: everything-scope URLs carry ?scope=source — main re-roots
   * them at the source slot's store (the primary's pipeline never
   * generated these derivatives). */
  function thumbUrl(item: Item): string {
    const nonce = thumbNonce[item.contentHash ?? ''] ?? 0
    const params = [
      ...(scope === 'everything' ? ['scope=source'] : []),
      ...(nonce > 0 ? [`v=${nonce}`] : []),
    ]
    return `ew-asset://${item.contentHash}/thumb${params.length > 0 ? `?${params.join('&')}` : ''}`
  }

  /** 076's contract: a missing thumbnail 404s → fall back to the
   * original bytes, once (the flag stops an error loop). */
  function fallbackToOriginal(event: Event, item: Item): void {
    const img = event.currentTarget as HTMLImageElement
    if (img.dataset['fallback'] === '1') return
    img.dataset['fallback'] = '1'
    img.src = `ew-asset://${item.contentHash}${scope === 'everything' ? '?scope=source' : ''}`
  }

  function jumpTo(bucket: GalleryBucket): void {
    jumpOpen = false
    const row = layout.rows.find((r) => r.kind === 'header' && r.bucket.key === bucket.key)
    if (row && scroller) scroller.scrollTo({ top: row.top })
  }

  function onScroll(): void {
    if (scroller) scrollTop = scroller.scrollTop
  }

  // ------------------------------------------- 079 selection gestures
  /** Rev 0.25 mouse model: plain click selects only this cell and
   * sets the anchor; Shift+click selects the linear document-order
   * range from the anchor (bucket boundaries are invisible to it);
   * Mod+click toggles membership without disturbing the anchor. A
   * Shift+click with no live anchor degrades to a plain click. */
  function indexOfNode(nodeId: string): number {
    return index.findIndex((entry) => entry.nodeId === nodeId)
  }

  /** The one range computation (rev 0.25): the linear document-order
   * span from the anchor — Shift+click and Shift+arrows agree by
   * construction. False when there is no usable anchor. */
  function selectRangeFromAnchor(nodeId: string): boolean {
    if (anchor === null) return false
    const from = indexOfNode(anchor)
    const to = indexOfNode(nodeId)
    if (from === -1 || to === -1) return false
    const [lo, hi] = linearRange(from, to)
    selected = new Set(index.slice(lo, hi + 1).map((entry) => entry.nodeId))
    return true
  }

  function toggleMembership(nodeId: string): void {
    const next = new Set(selected)
    if (next.has(nodeId)) next.delete(nodeId)
    else next.add(nodeId)
    selected = next
  }

  function onCellClick(event: MouseEvent, nodeId: string): void {
    // Every click variant parks the cursor on the clicked cell (the
    // keyboard picks up where the pointer left off).
    cursor = nodeId
    preferredCol = columnOf(keyRows, indexOfNode(nodeId))
    if (event.shiftKey && selectRangeFromAnchor(nodeId)) return
    if (event.metaKey || event.ctrlKey) {
      toggleMembership(nodeId)
      return
    }
    selected = new Set([nodeId])
    anchor = nodeId
  }

  // ------------------------------------------- 080 keyboard model
  /** Virtualization contract: scroll BEFORE any DOM read — the
   * cursor's cell may not be rendered. Row tops come from the same
   * layout the grid draws; keyRows and layout's cells rows are
   * parallel arrays by construction. */
  function scrollIndexIntoView(i: number): void {
    if (!scroller) return
    const r = keyRows.findIndex((row) => i >= row.start && i < row.start + row.count)
    const row = layout.rows.filter((candidate) => candidate.kind === 'cells')[r]
    if (!row) return
    const margin = sort === 'date' ? HEADER_H + 8 : 8 // clear the sticky header band
    const viewTop = scroller.scrollTop
    const viewBottom = viewTop + scroller.clientHeight
    if (row.top < viewTop + margin) {
      scroller.scrollTop = Math.max(0, row.top - margin)
    } else if (row.top + CELL > viewBottom) {
      scroller.scrollTop = row.top + CELL - scroller.clientHeight
    }
    scrollTop = scroller.scrollTop
  }

  /** Move the cursor: scroll its row into the render window, then
   * rove focus to the cell (or keep it on the grid so keys stay
   * alive when the cell is gone — e.g. right after a trash). */
  async function setCursorIndex(i: number): Promise<void> {
    const entry = index[i]
    if (!entry) return
    cursor = entry.nodeId
    scrollIndexIntoView(i)
    await tick()
    const el = scroller?.querySelector<HTMLElement>(
      `[data-testid="gallery-cell"][data-node-id="${entry.nodeId}"]`,
    )
    if (el) el.focus({ preventScroll: true })
    else gridEl?.focus({ preventScroll: true })
  }

  /** Enter (§14.4 = §8.3's kind-appropriate primary action).
   * Board-kind: close the takeover, then dive (OutlineView's dive
   * ordering — the destination must be visible). Note-carrying:
   * panels mount UNDER the takeover, so close to reveal, then open
   * (OutlineView's openNote ordering). Note-less: the §8.4 charm
   * grammar's create-on-demand — the §8.5 phantom panel over this
   * node, which persists nothing until the first committed edit
   * (CreateNote + AttachNoteToNode); openCornerPanel(nodeId, null)
   * is that exact seam. */
  function activate(nodeId: string): void {
    // 089 browse-only: everything scope's rows live in ANOTHER
    // project — no primary surface (panel, dive, phantom note) can
    // hold them (§14.4: projects source, never reference).
    if (scope !== 'this-world') return
    const item = items[nodeId]
    if (!item) return
    closeTakeover()
    if (item.childCanvasId) {
      void navigateTo(item.childCanvasId, item.label)
      return
    }
    if (item.noteId) {
      requestOpenNote(item.noteId)
      return
    }
    openCornerPanel(nodeId, null)
  }

  function onGridKeydown(event: KeyboardEvent): void {
    // The grid owns these keys only for its own cells: the facet
    // strip's tag input and the action bar's completion field are
    // outside this listbox, and any future field inside it keeps
    // its keys by target kind.
    const target = event.target as HTMLElement | null
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    )
      return
    if (index.length === 0) return
    const mod = event.metaKey || event.ctrlKey

    // Mod+A: the current filter scope — the user selects what they see.
    if (mod && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      selected = new Set(index.map((entry) => entry.nodeId))
      if (anchor === null) anchor = index[0]!.nodeId
      return
    }

    // Space is RESERVED for preview (rev 0.25) — swallowed even
    // bare, so it never page-scrolls; Mod+Space toggles the cursor
    // cell's membership without disturbing the anchor.
    if (event.key === ' ') {
      event.preventDefault()
      if (mod && cursor !== null) toggleMembership(cursor)
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      if (cursor !== null) activate(cursor)
      return
    }

    // Delete = the action bar's trash, verbatim (the bar is mounted
    // exactly while the selection is non-empty).
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      if (selected.size > 0) void actionBar?.trashSelection()
      return
    }

    // PageUp/PageDown page the VIEWPORT; the cursor stays put. Its
    // cell may leave the render window — refocus the grid so the
    // keyboard survives the unmount.
    if (event.key === 'PageDown' || event.key === 'PageUp') {
      event.preventDefault()
      if (!scroller) return
      const dir = event.key === 'PageDown' ? 1 : -1
      scroller.scrollTop = Math.max(0, scroller.scrollTop + dir * scroller.clientHeight)
      scrollTop = scroller.scrollTop
      void tick().then(() => {
        const held = document.activeElement
        if (!held || !scroller?.contains(held)) gridEl?.focus({ preventScroll: true })
      })
      return
    }

    const isVertical = event.key === 'ArrowUp' || event.key === 'ArrowDown'
    if (!isVertical && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const current = cursor === null ? -1 : indexOfNode(cursor)

    // Mod+Up/Down: jump to the previous/next bucket header under
    // date sort — the keyboard twin of the period list. No-op on
    // flat sorts (bucketJumpTarget returns null without buckets).
    if (mod) {
      if (!isVertical) return
      const jump = bucketJumpTarget(buckets, current === -1 ? 0 : current, event.key === 'ArrowDown' ? 1 : -1)
      if (jump === null) return
      const header = layout.rows.find(
        (row) => row.kind === 'header' && row.bucket.startIndex === jump,
      )
      if (header && scroller) {
        scroller.scrollTop = header.top
        scrollTop = header.top
      }
      preferredCol = 0
      selected = new Set([index[jump]!.nodeId])
      anchor = index[jump]!.nodeId
      void setCursorIndex(jump)
      return
    }

    let next: number
    if (current === -1) {
      // First arrow with no cursor: land on the first entry.
      next = 0
      preferredCol = 0
    } else if (isVertical) {
      const vertical = verticalTarget(keyRows, current, event.key === 'ArrowDown' ? 1 : -1, preferredCol)
      if (vertical === null) return // grid edge: cursor and selection stay
      next = vertical
    } else {
      next = horizontalTarget(index.length, current, event.key === 'ArrowRight' ? 1 : -1)
      preferredCol = columnOf(keyRows, next)
    }

    const nodeId = index[next]!.nodeId
    if (event.shiftKey) {
      // Extend the linear range from the anchor (Shift+click math).
      if (anchor === null) anchor = cursor ?? nodeId
      if (!selectRangeFromAnchor(nodeId)) {
        selected = new Set([nodeId])
        anchor = nodeId
      }
    } else {
      // Plain arrows collapse selection to the cursor.
      selected = new Set([nodeId])
      anchor = nodeId
    }
    void setCursorIndex(next)
  }

  function clearSelection(): void {
    selected = new Set()
    anchor = null
    tagOpen = false
  }

  // Escape peels one layer per press (rev 0.25), BEFORE the takeover
  // layer's window-level close listener: capture phase, the TagPanel
  // pattern. Field open → close it; selection → clear it; empty →
  // decline, and the takeover closes as today.
  $effect(() => {
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (tagOpen) {
        event.preventDefault()
        event.stopPropagation()
        tagOpen = false
        return
      }
      if (selected.size > 0) {
        event.preventDefault()
        event.stopPropagation()
        clearSelection()
      }
    }
    window.addEventListener('keydown', onKeydown, true)
    return () => window.removeEventListener('keydown', onKeydown, true)
  })

  /** §6.10 place for the whole selection: close the takeover FIRST
   * (070 precedent — the user watches the result land), then request
   * one placement per id in selection order. The workspace owns the
   * commits, the cascade offsets, and failure toasts. */
  function placeSelection(): void {
    if (scope !== 'this-world') return // 089: browse-only scope
    const ids = [...selected]
    if (ids.length === 0) return
    // §4.9 (AI-IMP-129): a parked frame target redirects the place — the
    // picked nodes land captured + arranged inside the frame, not free.
    const frameTarget = pendingFrameLoad()
    if (frameTarget) {
      clearFrameLoad()
      closeTakeover()
      requestLoadIntoFrame({ nodeIds: ids, ...frameTarget })
      return
    }
    closeTakeover()
    for (const id of ids) requestPlaceNode(id)
  }

  // Escaping the gallery without placing must not leave a frame target
  // parked for a later ordinary place (frame-load.ts).
  onDestroy(() => clearFrameLoad())

  // ------------------------------------------- 115 everything-scope pull
  /** The ONE live everything-scope action (§14.4): enabled for a single
   * selected asset-kind item (bulk and note-kind are out of scope). The
   * selected cell is hydrated by construction (the user clicked it). */
  const pullable = $derived.by(() => {
    if (scope !== 'everything') return false
    if (selected.size !== 1) return false
    const [id] = [...selected]
    const item = id ? items[id] : undefined
    return item?.kind === 'image' && item.contentHash != null
  })

  /** hasContentHash (the mirror chip's probe) proves presence but not
   * identity, and the shared query surface has no hash→node lookup
   * (packages are frozen for this ticket). The primary ("this world")
   * is the SMALL side of the seam, so a bounded image-index scan
   * resolves the existing node. A dedicated query is recorded debt. */
  async function findWorldNodeByHash(contentHash: string): Promise<string | null> {
    const idx = await window.ew.project.query('getGalleryIndex', { kinds: ['image'] })
    if (!idx.ok) return null
    const ids = (idx.result as Array<{ nodeId: string }>).map((entry) => entry.nodeId)
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      const hydrated = await window.ew.project.query('getGalleryItems', { nodeIds: chunk })
      if (!hydrated.ok) continue
      const hit = (hydrated.result as Array<{ nodeId: string; contentHash: string | null }>).find(
        (it) => it.contentHash === contentHash,
      )
      if (hit) return hit.nodeId
    }
    return null
  }

  /** Ingest by copy, or recognize the existing node. Recognition FIRST
   * (§14.4 dedupe): if this world already holds the bytes, skip the
   * copy — no duplicate node — and place the node it already has. */
  async function resolvePullNode(contentHash: string): Promise<string | null> {
    try {
      const probe = await window.ew.project.query('hasContentHash', { contentHash })
      if (probe.ok && (probe.result as { present: boolean }).present) {
        const existing = await findWorldNodeByHash(contentHash)
        if (existing !== null) return existing
      }
    } catch {
      // A failed probe falls through to the ordinary copy.
    }
    const ingested = await window.ew.secondary.ingest('source', { contentHash, border: 'none' })
    if (!ingested.ok) {
      toast(`Pull failed: ${ingested.message}`, {
        kind: 'error',
        sticky: true,
        surface: 'import-error',
        dismissTestid: 'import-error-dismiss',
      })
      return null
    }
    return ingested.nodeId
  }

  /** Pull into this world (§14.4): ingest (or recognize), close the
   * takeover, and hand the board a place cursor at the click point. */
  async function pullSelection(event: MouseEvent): Promise<void> {
    if (scope === 'this-world') return
    const ids = [...selected]
    if (ids.length !== 1) return
    const id = ids[0]!
    let contentHash = items[id]?.contentHash ?? null
    if (contentHash === null) {
      // Defensive hydration: a selected image is normally cached, but a
      // scope/filter churn could have dropped it.
      try {
        const fetched = await window.ew.secondary.query('source', 'getGalleryItems', {
          nodeIds: [id],
        })
        if (fetched.ok) {
          contentHash =
            (fetched.result as Array<{ contentHash: string | null }>)[0]?.contentHash ?? null
        }
      } catch {
        contentHash = null
      }
    }
    if (contentHash === null) {
      toast('Only images can be pulled into this world', {
        kind: 'error',
        surface: 'gallery-actions',
      })
      return
    }
    const anchor = { clientX: event.clientX, clientY: event.clientY }
    const nodeId = await resolvePullNode(contentHash)
    if (nodeId === null) return
    closeTakeover()
    requestPlaceMode({ nodeId, contentHash, clientX: anchor.clientX, clientY: anchor.clientY })
  }

  /**
   * Cell dragstart, mirroring OutlineView's beginRowDrag: set the
   * import-surface payload and watch the drag — the moment the
   * pointer leaves the originating cell's bounds (§6.10's operative
   * "sheet edge"), the takeover closes so the board can receive the
   * drop.
   */
  function beginCellDrag(event: DragEvent, nodeId: string): void {
    // 089: a drag-out PLACES — foreign node ids must not reach the
    // board's import surface (cells also render non-draggable).
    if (scope !== 'this-world') {
      event.preventDefault()
      return
    }
    const dt = event.dataTransfer
    if (!dt) return
    dt.setData(NODE_DRAG_MIME, nodeId)
    dt.effectAllowed = 'copy'
    const cell = event.currentTarget as HTMLElement
    const edge = cell.getBoundingClientRect()
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
</script>

<div class="gallery" data-testid="gallery-view">
  <!-- 089: the primary toggle — WHOSE gallery (§14.4). -->
  <div class="scope-bar">
    <span class="segmented" role="group" aria-label="Scope">
      <button
        type="button"
        data-testid="gallery-scope-this-world"
        aria-pressed={scope === 'this-world'}
        class:on={scope === 'this-world'}
        onclick={() => setScope('this-world')}
      >
        this world
      </button>
      <button
        type="button"
        data-testid="gallery-scope-everything"
        aria-pressed={scope === 'everything'}
        class:on={scope === 'everything'}
        onclick={() => setScope('everything')}
      >
        everything
      </button>
    </span>
  </div>
  {#if scope === 'everything' && mirrorOff}
    <p class="mirror-notice" data-testid="gallery-mirror-notice">
      everything may be incomplete — this world doesn't mirror
    </p>
  {/if}
  {#if scope === 'everything' && sourceOpen && hasExample}
    <!-- 094: the clear-the-example affordance (§14.4) — present only
         while example-tagged content exists in the library. -->
    <div class="example-bar">
      <button
        type="button"
        data-testid="gallery-clear-example"
        onclick={() => void clearExample()}
        disabled={clearingExample}
      >
        {clearingExample ? 'Clearing…' : 'Clear the example set'}
      </button>
      {#if clearError}
        <span class="clear-error" data-testid="gallery-clear-example-error">{clearError}</span>
      {/if}
    </div>
  {/if}
  {#if evictedNotice}
    <!-- 091: the source panel replaced everything's transport. -->
    <p class="mirror-notice" data-testid="gallery-evicted-notice">
      everything closed — a source panel holds the source slot
    </p>
  {/if}

  <GalleryFacets
    {sort}
    {kinds}
    tags={tagFilters}
    {untagged}
    {unplaced}
    queryScope={scope}
    {scopeReady}
    onSort={(next) => (sort = next)}
    onToggleKind={(kind) =>
      (kinds = kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind])}
    onAddTag={(tag) => {
      if (!tagFilters.some((t) => t.id === tag.id)) tagFilters = [...tagFilters, tag]
    }}
    onRemoveTag={(tagId) => (tagFilters = tagFilters.filter((t) => t.id !== tagId))}
    onToggleUntagged={() => (untagged = !untagged)}
    onToggleUnplaced={() => (unplaced = !unplaced)}
  />

  {#if currentBucket}
    <div class="current-header">
      <button
        type="button"
        class="period"
        data-testid="gallery-period"
        aria-expanded={jumpOpen}
        onclick={() => (jumpOpen = !jumpOpen)}
      >
        {currentBucket.label} ▾
      </button>
      {#if jumpOpen}
        <ul class="period-list" data-testid="gallery-period-list">
          {#each buckets as bucket (bucket.key)}
            <li>
              <button type="button" onclick={() => jumpTo(bucket)}>
                {bucket.label} <span class="count">{bucket.count}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  <div
    class="scroller"
    data-testid="gallery-scroller"
    bind:this={scroller}
    bind:clientWidth={viewportWidth}
    bind:clientHeight={viewportHeight}
    onscroll={onScroll}
  >
    {#if scope === 'everything' && needsLibrary}
      <!-- 089 designation (v1): a plain path field — the open call
           validates the directory before the setting stores. -->
      <div class="designate" data-testid="gallery-designate">
        <p>
          No library is designated. “Everything” is your library project's
          gallery — point it at an existing project directory.
        </p>
        <div class="designate-row">
          <TextInput
            variant="standard"
            data-testid="gallery-designate-input"
            placeholder="/path/to/library-project"
            style="flex: 1;"
            bind:value={libraryDirInput}
            onkeydown={(event) => {
              if (event.key === 'Enter') designateLibrary()
            }}
          />
          <button
            type="button"
            data-testid="gallery-designate-confirm"
            onclick={designateLibrary}
          >
            use as library
          </button>
        </div>
        <!-- 094: the create-new path — a fresh library at the app's
             default location, seeded with the §14.4 example set. -->
        <div class="designate-create">
          <button
            type="button"
            data-testid="gallery-create-library"
            onclick={() => void createLibrary()}
            disabled={creatingLibrary}
          >
            {creatingLibrary ? 'Creating…' : 'create a new library'}
          </button>
          <span class="create-hint">
            …at the default location, seeded with a small example set
          </span>
        </div>
        {#if libraryError}
          <p class="designate-error" data-testid="gallery-designate-error">{libraryError}</p>
        {/if}
      </div>
    {:else if scope === 'everything' && !sourceOpen}
      <p class="empty" data-testid="gallery-scope-waiting">Opening the library…</p>
    {:else if loaded && index.length === 0}
      <p class="empty" data-testid="gallery-empty">
        {#if kinds.length > 0 || tagFilters.length > 0 || untagged || unplaced}
          Nothing matches the current filters.
        {:else if scope === 'everything'}
          The library is empty — material accrues as drops mirror into it.
        {:else}
          Nothing here yet — anything imported or created lands in the gallery.
        {/if}
      </p>
    {:else}
      <!-- 080: the listbox owns the keyboard — keys fire only while
           focus is on it or a cell inside it (roving tabindex). -->
      <div
        class="canvas"
        role="listbox"
        aria-multiselectable="true"
        aria-label="Gallery items"
        tabindex="-1"
        bind:this={gridEl}
        onkeydown={onGridKeydown}
        style={`height: ${layout.totalHeight}px`}
      >
        {#each visibleRows as row (row.kind === 'header' ? `h-${row.bucket.key}` : `r-${row.entries[0]?.nodeId}`)}
          {#if row.kind === 'header'}
            <h2
              class="bucket-header"
              data-testid="gallery-bucket"
              data-bucket={row.bucket.key}
              style={`top: ${row.top}px`}
            >
              {row.bucket.label}
            </h2>
          {:else}
            <div class="row" style={`top: ${row.top}px`}>
              {#each row.entries as entry (entry.nodeId)}
                {@const item = items[entry.nodeId]}
                <div
                  class="cell"
                  class:selected={selected.has(entry.nodeId)}
                  class:cursor={cursor === entry.nodeId}
                  role="option"
                  tabindex={entry.nodeId === (cursor ?? index[0]?.nodeId) ? 0 : -1}
                  aria-selected={selected.has(entry.nodeId)}
                  data-testid="gallery-cell"
                  data-node-id={entry.nodeId}
                  data-kind={entry.kind}
                  data-selected={selected.has(entry.nodeId) ? 'true' : 'false'}
                  data-cursor={cursor === entry.nodeId ? 'true' : 'false'}
                  draggable={scope === 'this-world'}
                  onclick={(event) => onCellClick(event, entry.nodeId)}
                  ondragstart={(event) => beginCellDrag(event, entry.nodeId)}
                >
                  {#if item && item.kind === 'image' && item.contentHash}
                    <img
                      src={thumbUrl(item)}
                      alt={item.label}
                      loading="lazy"
                      onerror={(event) => fallbackToOriginal(event, item)}
                    />
                    <span class="cell-label">{item.label}</span>
                  {:else if item && item.kind === 'board'}
                    <span class="glyph">▣</span>
                    <span class="cell-label">{item.label}</span>
                  {:else if item}
                    <!-- FR-8 text post: the clipping reads in place;
                         tags surface on hover. -->
                    <div
                      class="text-post"
                      title={item.tagNames.length > 0
                        ? item.tagNames.map((t) => `#${t}`).join('  ')
                        : undefined}
                    >
                      <span class="post-title">{item.label}</span>
                      {#if item.noteExcerpt}
                        <p class="post-excerpt">{item.noteExcerpt}</p>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>

  {#if selected.size > 0}
    <GalleryActionBar
      bind:this={actionBar}
      selectedIds={[...selected]}
      bind:tagOpen
      readOnly={scope !== 'this-world'}
      canPull={pullable}
      onClear={clearSelection}
      onPlace={placeSelection}
      onPull={(event) => void pullSelection(event)}
    />
  {/if}
</div>

<style>
  .gallery {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  /* 089 scope bar: the same segmented vocabulary the facet strip
     speaks — this is the PRIMARY toggle, so it sits above it. */
  .scope-bar {
    flex: none;
    padding: 0.45rem 1rem 0.1rem;
    font-size: 0.78rem;
  }

  .segmented {
    display: inline-flex;
    border: 1px solid var(--ew-border-strong);
    border-radius: 999px;
    overflow: hidden;
  }

  .segmented button {
    padding: 0.2rem 0.65rem;
    font: inherit;
    background: transparent;
    color: var(--ew-text-muted);
    border: none;
    cursor: pointer;
  }

  .segmented button + button {
    border-left: 1px solid var(--ew-border);
  }

  .segmented button.on {
    background: var(--ew-accent);
    color: var(--ew-on-accent);
  }

  /* The honesty line (§14.4): quiet, one line, under the header. */
  .mirror-notice {
    flex: none;
    margin: 0;
    padding: 0.1rem 1rem 0.3rem;
    font-size: 0.72rem;
    color: var(--ew-text-muted);
  }

  /* 094 clear-the-example: one quiet row in the everything header. */
  .example-bar {
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.1rem 1rem 0.35rem;
    font-size: 0.78rem;
  }

  .example-bar button {
    padding: 0.2rem 0.65rem;
    background: var(--ew-surface-raised);
    color: var(--ew-text);
    border: 1px solid var(--ew-border-strong);
    border-radius: 999px;
    font: inherit;
    cursor: pointer;
  }

  .example-bar button:hover:not(:disabled) {
    background: var(--ew-surface-subtle);
  }

  .example-bar .clear-error {
    color: var(--ew-danger);
  }

  .designate {
    max-width: 34rem;
    padding: 2rem 1rem;
    font-size: 0.85rem;
    color: var(--ew-text);
  }

  .designate p {
    margin: 0 0 0.8rem;
    color: var(--ew-text-muted);
  }

  .designate-row {
    display: flex;
    gap: 0.45rem;
  }

  .designate-row button {
    padding: 0.3rem 0.75rem;
    background: var(--ew-surface-raised);
    color: var(--ew-text);
    border: 1px solid var(--ew-border-strong);
    border-radius: 5px;
    font: inherit;
    cursor: pointer;
  }

  .designate-row button:hover {
    background: var(--ew-surface-subtle);
  }

  .designate .designate-error {
    margin: 0.6rem 0 0;
    color: var(--ew-danger);
  }

  /* 094: the create-new alternative under the designate row. */
  .designate-create {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-top: 0.8rem;
  }

  .designate-create button {
    padding: 0.3rem 0.75rem;
    background: var(--ew-surface-raised);
    color: var(--ew-text);
    border: 1px solid var(--ew-border-strong);
    border-radius: 5px;
    font: inherit;
    cursor: pointer;
  }

  .designate-create button:hover:not(:disabled) {
    background: var(--ew-surface-subtle);
  }

  .designate-create .create-hint {
    font-size: 0.78rem;
    color: var(--ew-text-muted);
  }

  .current-header {
    position: relative;
    flex: none;
    padding: 0.25rem 1rem;
    border-bottom: 1px solid var(--ew-border);
  }

  .period {
    font: inherit;
    font-weight: 600;
    color: var(--ew-text);
    background: none;
    border: none;
    padding: 0.3rem 0.5rem;
    border-radius: 6px;
    cursor: pointer;
  }

  .period:hover {
    background: var(--ew-surface-subtle);
  }

  .period-list {
    position: absolute;
    top: 100%;
    left: 1rem;
    z-index: 2;
    margin: 0.2rem 0 0;
    padding: 0.3rem;
    list-style: none;
    max-height: 50vh;
    overflow-y: auto;
    background: var(--ew-surface-menu);
    border: 1px solid var(--ew-border);
    border-radius: 8px;
  }

  .period-list button {
    display: flex;
    justify-content: space-between;
    gap: 1.5rem;
    width: 100%;
    font: inherit;
    color: var(--ew-text);
    background: none;
    border: none;
    padding: 0.35rem 0.6rem;
    border-radius: 5px;
    cursor: pointer;
    text-align: left;
  }

  .period-list button:hover {
    background: var(--ew-surface-subtle);
  }

  .count {
    color: var(--ew-text-muted);
  }

  .scroller {
    flex: 1;
    overflow-y: auto;
    padding: 0 16px;
  }

  .canvas {
    position: relative;
  }

  .canvas:focus {
    outline: none;
  }

  .bucket-header {
    position: absolute;
    left: 0;
    right: 0;
    margin: 0;
    height: 40px;
    display: flex;
    align-items: center;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--ew-text-muted);
  }

  .row {
    position: absolute;
    left: 0;
    right: 0;
    display: flex;
    gap: 10px;
  }

  .cell {
    position: relative;
    width: 168px;
    height: 168px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 8px;
    background: var(--ew-surface-subtle);
    border: 1px solid var(--ew-border);
    cursor: pointer;
  }

  /* 079 selection ring: the highlight vocabulary, distinct from the
     080 cursor's focus ring below. */
  .cell.selected {
    border-color: var(--ew-accent);
    box-shadow: 0 0 0 2px var(--ew-accent);
  }

  /* 080 cursor: the FOCUS ring — the class draws it (focus itself
     may sit on the grid when the cell is unmounted), offset so it
     reads beside the selection accent, never instead of it. */
  .cell:focus {
    outline: none;
  }

  .cell.cursor {
    outline: 2px solid var(--ew-focus-ring);
    outline-offset: 2px;
  }

  .cell img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .cell-label {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 0.25rem 0.5rem;
    font-size: 0.78rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--ew-text);
    background: var(--ew-scrim);
  }

  .glyph {
    font-size: 2.2rem;
    color: var(--ew-text-muted);
  }

  .text-post {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 0.6rem 0.65rem;
    overflow: hidden;
    text-align: left;
  }

  .post-title {
    flex: none;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--ew-text);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .post-excerpt {
    margin: 0;
    font-size: 0.72rem;
    line-height: 1.35;
    color: var(--ew-text-muted);
    display: -webkit-box;
    -webkit-line-clamp: 7;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .empty {
    padding: 2rem 1rem;
    color: var(--ew-text-muted);
  }
</style>

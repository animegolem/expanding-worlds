<!--
  Gallery facet strip (RFC §14.4, AI-IMP-078): the retrieval half,
  pinned above the grid inside the takeover. Sort segmented control
  (date · name · size), kind chips (image · note · board — a
  multi-select mask), a tag completion field with COUNT-ordered
  suggestions (custom list, NEVER <datalist> — the native popup
  segfaults Electron's hidden e2e windows, AI-IMP-069), removable
  active-tag chips, and the two cleanup toggles the model already
  owns (untagged · unplaced). Every control commits on click; the
  parent re-queries live. Facet state is view state — nothing here
  writes.

  089: the tag facet always shows the ACTIVE scope's vocabulary
  (§14.4) — in everything scope the counts query rides the secondary
  seam against the library, same name, different transport; until
  the parent reports the scope ready, the vocabulary is empty rather
  than stale.
-->
<script lang="ts">
  import TextInput from '../ui/TextInput.svelte'
  import { tooltip } from '../chrome/tooltip'

  type GalleryKind = 'image' | 'note' | 'board'
  type GallerySort = 'date' | 'name' | 'size'

  interface TagRef {
    id: string
    name: string
  }

  interface TagCount extends TagRef {
    count: number
  }

  const {
    sort,
    kinds,
    tags,
    untagged,
    unplaced,
    queryScope = 'this-world',
    scopeReady = true,
    showCleanup = true,
    onSort,
    onToggleKind,
    onAddTag,
    onRemoveTag,
    onToggleUntagged,
    onToggleUnplaced,
  }: {
    sort: GallerySort
    kinds: GalleryKind[]
    tags: TagRef[]
    untagged: boolean
    unplaced: boolean
    queryScope?: 'this-world' | 'everything'
    scopeReady?: boolean
    /** 091: the source panel's compression drops the cleanup pair —
     * untagged/unplaced are curation controls, not browse facets. */
    showCleanup?: boolean
    onSort: (sort: GallerySort) => void
    onToggleKind: (kind: GalleryKind) => void
    onAddTag: (tag: TagRef) => void
    onRemoveTag: (tagId: string) => void
    onToggleUntagged: () => void
    onToggleUnplaced: () => void
  } = $props()

  const SORTS: Array<{ key: GallerySort; label: string }> = [
    { key: 'date', label: 'date' },
    { key: 'name', label: 'name' },
    { key: 'size', label: 'size' },
  ]
  const KINDS: Array<{ key: GalleryKind; label: string }> = [
    { key: 'image', label: 'image' },
    { key: 'note', label: 'note' },
    { key: 'board', label: 'board' },
  ]

  let search = $state('')
  let searchFocus = $state(false)
  let counts = $state<TagCount[]>([])

  async function runQuery<T>(name: string, args?: unknown): Promise<T> {
    const response =
      queryScope === 'everything'
        ? await window.ew.secondary.query('source', name, args)
        : await window.ew.project.query(name, args)
    if (!response.ok) throw new Error(response.message)
    return response.result as T
  }

  // The suggestion vocabulary re-scopes with the kind mask (§14.4:
  // counts reflect the active scope) and tracks project changes.
  async function loadCounts(mask: GalleryKind[]): Promise<void> {
    try {
      counts = await runQuery<TagCount[]>('galleryTagCounts', { kinds: mask, order: 'count' })
    } catch {
      counts = []
    }
  }

  $effect(() => {
    if (!scopeReady) {
      counts = []
      return
    }
    void loadCounts([...kinds])
  })
  $effect(() =>
    window.ew.project.onChanged(() => {
      if (scopeReady) void loadCounts(kinds)
    }),
  )

  // Count order IS the suggestion order; active chips drop out, and
  // an empty field on focus offers the top of the vocabulary.
  const completions = $derived.by(() => {
    const needle = search.toLowerCase()
    return counts
      .filter(
        (tag) =>
          tag.name.toLowerCase().startsWith(needle) && !tags.some((t) => t.id === tag.id),
      )
      .slice(0, 8)
  })

  function pick(tag: TagCount): void {
    onAddTag({ id: tag.id, name: tag.name })
    search = ''
  }

  function onSearchKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return
    const exact = completions.find((tag) => tag.name.toLowerCase() === search.toLowerCase())
    const top = exact ?? completions[0]
    if (search.length > 0 && top) pick(top)
  }
</script>

<div class="facets" data-testid="gallery-facets">
  <span class="segmented" role="group" aria-label="Sort">
    {#each SORTS as option (option.key)}
      <button
        type="button"
        data-testid={`gallery-sort-${option.key}`}
        aria-pressed={sort === option.key}
        class:on={sort === option.key}
        onclick={() => onSort(option.key)}
      >
        {option.label}
      </button>
    {/each}
  </span>

  <span class="chips" role="group" aria-label="Kinds">
    {#each KINDS as option (option.key)}
      <button
        type="button"
        class="chip"
        data-testid={`gallery-kind-${option.key}`}
        aria-pressed={kinds.includes(option.key)}
        class:on={kinds.includes(option.key)}
        onclick={() => onToggleKind(option.key)}
      >
        {option.label}
      </button>
    {/each}
  </span>

  <span class="field-wrap">
    <span class="hash">#</span>
    <TextInput
      variant="pill"
      data-testid="gallery-tag-input"
      placeholder="filter by tag…"
      style="width: 9rem;"
      bind:value={search}
      onfocus={() => (searchFocus = true)}
      onblur={() => (searchFocus = false)}
      onkeydown={onSearchKeydown}
    />
    {#if searchFocus && completions.length > 0}
      <span class="completions" data-testid="gallery-tag-completions">
        {#each completions as tag (tag.id)}
          <button
            type="button"
            data-testid="gallery-tag-option"
            onpointerdown={(e) => {
              e.preventDefault()
              pick(tag)
            }}
          >
            <span class="option-name">{tag.name}</span>
            <span class="option-count">{tag.count}</span>
          </button>
        {/each}
      </span>
    {/if}
  </span>

  {#each tags as tag (tag.id)}
    <span class="active-tag" data-testid={`gallery-tag-chip-${tag.id}`}>
      #{tag.name}
      <button
        type="button"
        aria-label={`Remove ${tag.name} filter`}
        onclick={() => onRemoveTag(tag.id)}
        use:tooltip={{ name: `Remove #${tag.name} filter` }}
      >
        ✕
      </button>
    </span>
  {/each}

  {#if showCleanup}
    <span class="chips cleanup" role="group" aria-label="Cleanup filters">
      <button
        type="button"
        class="chip"
        data-testid="gallery-filter-untagged"
        aria-pressed={untagged}
        class:on={untagged}
        onclick={onToggleUntagged}
      >
        untagged
      </button>
      <button
        type="button"
        class="chip"
        data-testid="gallery-filter-unplaced"
        aria-pressed={unplaced}
        class:on={unplaced}
        onclick={onToggleUnplaced}
      >
        unplaced
      </button>
    </span>
  {/if}
</div>

<style>
  .facets {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.45rem;
    flex: none;
    padding: 0.45rem 1rem;
    border-bottom: 1px solid var(--ew-border);
    font-size: 0.78rem;
    color: var(--ew-text);
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

  .chips {
    display: inline-flex;
    gap: 0.3rem;
  }

  .cleanup {
    margin-left: auto;
  }

  .chip {
    padding: 0.18rem 0.6rem;
    font: inherit;
    background: var(--ew-surface-raised);
    color: var(--ew-text-muted);
    border: 1px solid var(--ew-border-strong);
    border-radius: 999px;
    cursor: pointer;
  }

  .chip.on {
    background: var(--ew-accent);
    border-color: var(--ew-accent);
    color: var(--ew-on-accent);
  }

  .field-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .hash {
    color: var(--ew-text-muted);
    font-weight: 600;
  }

  .completions {
    position: absolute;
    top: calc(100% + 0.2rem);
    left: 0;
    z-index: 3;
    display: flex;
    flex-direction: column;
    min-width: 10rem;
    background: var(--ew-surface-menu);
    border: 1px solid var(--ew-border);
    border-radius: 6px;
    overflow: hidden;
  }

  .completions button {
    display: flex;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.22rem 0.55rem;
    background: transparent;
    border: none;
    color: var(--ew-text);
    font-size: 0.74rem;
    text-align: left;
    cursor: pointer;
  }

  .completions button:hover {
    background: var(--ew-surface-raised);
  }

  .option-count {
    color: var(--ew-text-muted);
  }

  .active-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.14rem 0.3rem 0.14rem 0.55rem;
    background: var(--ew-surface-raised);
    border: 1px solid var(--ew-border-strong);
    border-radius: 999px;
  }

  .active-tag button {
    padding: 0 0.15rem;
    background: transparent;
    border: none;
    color: var(--ew-text-muted);
    font-size: 0.7rem;
    cursor: pointer;
  }

  .active-tag button:hover {
    color: var(--ew-text);
  }
</style>

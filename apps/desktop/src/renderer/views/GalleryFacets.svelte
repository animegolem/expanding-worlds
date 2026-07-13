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
  import Button from '../ui/Button.svelte'
  import FacetChip from '../ui/FacetChip.svelte'
  import Segmented from '../ui/Segmented.svelte'

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

  const SORTS = [
    { value: 'date', label: 'date', testid: 'gallery-sort-date' },
    { value: 'name', label: 'name', testid: 'gallery-sort-name' },
    { value: 'size', label: 'size', testid: 'gallery-sort-size' },
  ]
  const KINDS: Array<{ value: GalleryKind; label: string }> = [
    { value: 'image', label: 'image' },
    { value: 'note', label: 'note' },
    { value: 'board', label: 'board' },
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
  <Segmented
    options={SORTS}
    value={sort}
    ariaLabel="Sort"
    onchange={(value) => onSort(value as GallerySort)}
  />

  <span class="chips" role="group" aria-label="Kinds">
    {#each KINDS as option (option.value)}
      <FacetChip
        label={option.label}
        testid={`gallery-kind-${option.value}`}
        active={kinds.includes(option.value)}
        onToggle={() => onToggleKind(option.value)}
      />
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
          <Button
            variant="ghost"
            data-testid="gallery-tag-option"
            style="width: 100%; display: flex; justify-content: space-between; text-align: left;"
            onpointerdown={(e) => {
              e.preventDefault()
              pick(tag)
            }}
          >
            <span class="option-name">{tag.name}</span>
            <span class="option-count">{tag.count}</span>
          </Button>
        {/each}
      </span>
    {/if}
  </span>

  {#each tags as tag (tag.id)}
    <FacetChip
      label={`#${tag.name}`}
      testid={`gallery-tag-chip-${tag.id}`}
      removeLabel={`Remove #${tag.name} filter`}
      onRemove={() => onRemoveTag(tag.id)}
    />
  {/each}

  {#if showCleanup}
    <span class="chips cleanup" role="group" aria-label="Cleanup filters">
      <FacetChip label="untagged" testid="gallery-filter-untagged" active={untagged} onToggle={onToggleUntagged} />
      <FacetChip label="unplaced" testid="gallery-filter-unplaced" active={unplaced} onToggle={onToggleUnplaced} />
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

  .chips {
    display: inline-flex;
    gap: 0.3rem;
  }

  .cleanup {
    margin-left: auto;
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
    border-radius: 5px;
    box-shadow: 0 6px 22px var(--ew-menu-shadow);
    overflow: hidden;
  }

  .option-count {
    color: var(--ew-text-muted);
  }

</style>

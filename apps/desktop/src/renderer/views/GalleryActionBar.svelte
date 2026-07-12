<!--
  Gallery floating action bar (RFC §14.4, AI-IMP-079): bulk selection
  summons count + tag · place · trash, anchored bottom-center inside
  the takeover sheet. The bar IS the selection's chrome — it exists
  exactly while the selection is non-empty (the parent mounts it).

  Tag: a completion field (custom list, NEVER <datalist> — the native
  popup segfaults Electron's hidden e2e windows, AI-IMP-069) over
  galleryTagCounts count-ordered, assigning the chosen or created tag
  to every selected node. Merge is by name_key (§4.8): an existing
  name resolves to its tag id, CreateTag only runs for genuinely new
  names, and a TAG_NAME_CONFLICT race falls back to the conflicting
  id from the error details. AssignTagToNode rejects duplicates
  (TAG_ALREADY_ASSIGNED) — those count as "already tagged" in the ONE
  summary toast, never as failures.

  Place is the parent's move (it owns closeTakeover + the §6.10
  seam); trash runs TrashNode (§9.6) per selected node with one
  summary toast, then clears the selection — the grid refreshes on
  the project push.
-->
<script lang="ts">
  import { nameKey, uuidv7 } from '@ew/domain'
  import type { CommandGateway, CommandGroupToken } from '@ew/canvas-engine'
  import type { CommandResult } from '@ew/commands'
  import { onDestroy } from 'svelte'
  import { toast } from '../chrome/status'
  import { tooltip } from '../chrome/tooltip'
  import { KEY } from '../keys/bindings'
  import { formatBinding } from '../keys/registry'
  import { createProjectCommandPort } from '../project-command-port'
  import { runAsUndoGroup } from '../undo/undo-store'
  import { requestGalleryReselect } from './gallery-reselect'
  import Button from '../ui/Button.svelte'
  import TextInput from '../ui/TextInput.svelte'

  interface TagCount {
    id: string
    name: string
    count: number
  }

  let {
    selectedIds,
    tagOpen = $bindable(false),
    readOnly = false,
    canPull = false,
    onClear,
    onPlace,
    onPull,
  }: {
    selectedIds: string[]
    tagOpen?: boolean
    /** 089 everything scope (§14.4): the selection still counts and
     * clears, but every mutating action greys out — tag and trash
     * would write into a read-only source, place would hand the
     * board a foreign node id. */
    readOnly?: boolean
    /** 115 (§14.4): the ONE live everything-scope action is Pull into
     * this world — enabled only for a single asset-kind item (bulk and
     * note-kind are out of scope). Shown exactly while readOnly. */
    canPull?: boolean
    onClear: () => void
    onPlace: () => void
    onPull?: (event: MouseEvent) => void
  } = $props()

  const READ_ONLY_HINT = 'browse-only in everything scope — switch to this world to act'
  const PULL_HINT = 'select a single image to pull it into this world'

  let tagName = $state('')
  let tagFocus = $state(false)
  let allTags = $state<TagCount[]>([])
  let busy = $state(false)
  let tagInput = $state<HTMLInputElement | null>(null)

  // ------------------------------------------------ command plumbing
  // The takeover owns an independent renderer-level gateway rather than
  // reaching into the canvas host. This threads revisions and broadcasts
  // user commits to the session undo coordinator.
  let portPromise: ReturnType<typeof createProjectCommandPort> | null = null
  let destroyed = false
  let activeOperations = 0

  function disposeWhenIdle(): void {
    if (!destroyed || activeOperations !== 0 || !portPromise) return
    void portPromise.then((port) => port.dispose())
  }

  async function commandGateway(): Promise<CommandGateway> {
    portPromise ??= createProjectCommandPort()
    const port = await portPromise
    if (destroyed && activeOperations === 0) port.dispose()
    return port.gateway
  }

  onDestroy(() => {
    destroyed = true
    disposeWhenIdle()
  })

  // Opening the field loads the vocabulary, count-ordered — the same
  // order the facet strip's completion list uses (§14.4) — and takes
  // focus so typing starts immediately.
  $effect(() => {
    if (!tagOpen) return
    void window.ew.project
      .query('galleryTagCounts', { order: 'count' })
      .then((response) => {
        if (response.ok) allTags = response.result as TagCount[]
      })
      .catch(() => undefined)
  })
  $effect(() => {
    if (tagOpen) tagInput?.focus()
  })

  function completions(): TagCount[] {
    const needle = tagName.toLowerCase()
    return allTags
      .filter((tag) => tag.name.toLowerCase().startsWith(needle) && tag.name !== tagName)
      .slice(0, 8)
  }

  /** Resolve the typed name to a tag id, merging by name_key (§4.8):
   * an existing name is that tag; only a new name creates. */
  async function resolveTagId(
    name: string,
    groupToken: CommandGroupToken,
  ): Promise<{ id: string; label: string } | null> {
    const key = nameKey(name)
    const existing = allTags.find((tag) => nameKey(tag.name) === key)
    if (existing) return { id: existing.id, label: existing.name }
    const tagId = uuidv7()
    const gateway = await commandGateway()
    const created = await gateway.execute('CreateTag', { tagId, name }, { groupToken })
    if (created.status === 'committed') return { id: tagId, label: name }
    // Race or a draft tag (assignment-less tags are absent from
    // galleryTagCounts): the conflict names the existing id.
    if (created.status === 'error' && created.code === 'TAG_NAME_CONFLICT') {
      const existingTagId = created.details?.['existingTagId']
      if (typeof existingTagId === 'string') return { id: existingTagId, label: name }
    }
    return null
  }

  async function assignTag(name: string): Promise<void> {
    const trimmed = name.trim()
    if (readOnly || trimmed.length === 0 || busy || selectedIds.length === 0) return
    const targetIds = [...selectedIds]
    busy = true
    activeOperations += 1
    try {
      await runAsUndoGroup(async (groupToken) => {
        const tag = await resolveTagId(trimmed, groupToken)
        if (!tag) {
          toast(`Tag "${trimmed}" could not be created`, {
            kind: 'error',
            surface: 'gallery-actions',
          })
          return
        }
        const gateway = await commandGateway()
        let added = 0
        let skipped = 0
        let failed = 0
        for (const nodeId of targetIds) {
          const result = await gateway.execute(
            'AssignTagToNode',
            { tagId: tag.id, nodeId },
            { groupToken },
          )
          if (result.status === 'committed') added += 1
          else if (result.status === 'error' && result.code === 'TAG_ALREADY_ASSIGNED') skipped += 1
          else failed += 1
        }
        const parts = [`#${tag.label} added to ${added} item${added === 1 ? '' : 's'}`]
        if (skipped > 0) parts.push(`${skipped} already tagged`)
        if (failed > 0) parts.push(`${failed} failed`)
        toast(parts.join(' — '), {
          kind: failed > 0 ? 'error' : 'success',
          surface: 'gallery-actions',
        })
        tagOpen = false
        tagName = ''
      })
    } finally {
      activeOperations -= 1
      disposeWhenIdle()
      busy = false
    }
  }

  /** Exported (AI-IMP-080): Delete in the grid runs THIS path — the
   * keyboard must trash through the exact same commands and toast. */
  export async function trashSelection(): Promise<void> {
    // The Delete key routes here scope-blind — the guard is the bar's.
    if (readOnly) return
    if (busy || selectedIds.length === 0) return
    const targetIds = [...selectedIds]
    const trashedIds: string[] = []
    busy = true
    activeOperations += 1
    try {
      await runAsUndoGroup(async (groupToken) => {
        const gateway = await commandGateway()
        let trashed = 0
        let failed = 0
        for (const nodeId of targetIds) {
          const result = await gateway.execute('TrashNode', { nodeId }, { groupToken })
          if (result.status === 'committed') {
            trashed += 1
            trashedIds.push(nodeId)
          }
          else failed += 1
        }
        toast(
          failed > 0
            ? `Moved ${trashed} to Trash — ${failed} failed`
            : `Moved ${trashed} to Trash`,
          { kind: failed > 0 ? 'error' : 'info', surface: 'gallery-actions' },
        )
        onClear()
      }, {
        operation: 'moving items to Trash',
        afterUndo: () => requestGalleryReselect(trashedIds),
      })
    } finally {
      activeOperations -= 1
      disposeWhenIdle()
      busy = false
    }
  }

  function onTagKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') void assignTag(tagName)
  }
</script>

<div class="action-bar" data-testid="gallery-action-bar">
  <span class="count" data-testid="gallery-action-count">{selectedIds.length}</span>

  {#if readOnly}
    <!-- 115 (§14.4): the everything-scope pull — the one live action.
         Ingests by copy (or recognizes an existing node) and hands off
         to the board's place cursor; the tag/place/trash below stay
         browse-only. -->
    <Button
      variant="accent"
      data-testid="gallery-action-pull"
      style="font-weight: 600;"
      disabled={busy || !canPull}
      tip={canPull ? undefined : { name: PULL_HINT }}
      onclick={(event) => onPull?.(event)}
    >
      pull into this world
    </Button>
  {/if}

  {#if tagOpen}
    <span class="field-wrap">
      <TextInput
        variant="pill"
        placeholder="tag…"
        data-testid="gallery-action-tag-input"
        style="width: 10rem;"
        bind:ref={tagInput}
        bind:value={tagName}
        onfocus={() => (tagFocus = true)}
        onblur={() => (tagFocus = false)}
        onkeydown={onTagKeydown}
      />
      {#if tagFocus && tagName && completions().length > 0}
        <span class="completions" data-testid="gallery-action-tag-completions">
          {#each completions() as tag (tag.id)}
            <button
              type="button"
              data-testid="gallery-action-tag-option"
              onpointerdown={(event) => {
                event.preventDefault()
                void assignTag(tag.name)
              }}
            >
              <span class="opt-name">{tag.name}</span>
              <span class="opt-count">{tag.count}</span>
            </button>
          {/each}
        </span>
      {/if}
    </span>
  {/if}

  <Button
    variant={tagOpen ? 'accent' : 'default'}
    aria-pressed={tagOpen}
    data-testid="gallery-action-tag"
    disabled={busy || readOnly}
    tip={readOnly ? { name: READ_ONLY_HINT } : undefined}
    onclick={() => (tagOpen = !tagOpen)}
  >
    tag
  </Button>
  <Button
    variant="default"
    data-testid="gallery-action-place"
    disabled={busy || readOnly}
    tip={readOnly ? { name: READ_ONLY_HINT } : undefined}
    onclick={onPlace}
  >
    place
  </Button>
  <Button
    variant="default"
    data-testid="gallery-action-trash"
    disabled={busy || readOnly}
    tip={readOnly
      ? { name: READ_ONLY_HINT }
      : { name: 'Move to Trash', shortcut: formatBinding(KEY.galleryDelete) }}
    onclick={() => void trashSelection()}
  >
    trash
  </Button>
  <button
    type="button"
    class="clear"
    aria-label="Clear selection"
    data-testid="gallery-action-clear"
    onclick={onClear}
    use:tooltip={{ name: 'Clear selection' }}
  >
    ✕
  </button>
</div>

<style>
  .action-bar {
    position: absolute;
    bottom: 18px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.45rem 0.6rem;
    background: var(--ew-surface-menu);
    border: 1px solid var(--ew-border);
    border-radius: 10px;
    box-shadow: 0 6px 22px var(--ew-shadow);
    font-size: 0.8rem;
    color: var(--ew-text);
  }

  .count {
    min-width: 1.6rem;
    padding: 0.1rem 0.4rem;
    text-align: center;
    font-weight: 600;
    background: var(--ew-accent);
    color: var(--ew-on-accent);
    border-radius: 999px;
  }

  .clear {
    padding: 0.15rem 0.4rem;
    background: transparent;
    color: var(--ew-text-muted);
    border: none;
    font: inherit;
    cursor: pointer;
  }

  .clear:hover {
    color: var(--ew-text);
  }

  .field-wrap {
    position: relative;
  }

  /* The bar hugs the sheet's bottom edge — completions open UPWARD. */
  .completions {
    position: absolute;
    bottom: calc(100% + 0.25rem);
    left: 0;
    z-index: 1;
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
    padding: 0.25rem 0.55rem;
    background: transparent;
    border: none;
    color: var(--ew-text);
    font: inherit;
    font-size: 0.75rem;
    text-align: left;
    cursor: pointer;
  }

  .completions button:hover {
    background: var(--ew-surface-raised);
  }

  .opt-count {
    color: var(--ew-text-muted);
  }
</style>

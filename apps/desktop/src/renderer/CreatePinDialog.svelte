<!--
  Create Pin dialog (RFC-0001 §6.2, AI-IMP-020). New-node pins choose
  an appearance (dot color, built-in icon, or image with a
  non-destructive crop), an optional note (new title or existing), and
  tags; pressing Create commits exactly ONE CreatePin (a prior asset
  import is pipeline infrastructure, not the user gesture). The Place
  Existing branch creates one placement of an existing node (§6.3).

  Tag limitation (flagged in AI-IMP-020): no listTags query exists, so
  existing tags load via listTags; new tags issue CreateTag when added.
-->
<script lang="ts">
  import type { CommandResult } from '@ew/commands'
  import type { CanvasHostHandle } from './canvas/host'

  let {
    handle,
    viewCenter,
    onclose,
  }: {
    handle: CanvasHostHandle
    viewCenter: () => { x: number; y: number }
    onclose: () => void
  } = $props()

  const ICONS = ['star', 'flag', 'heart', 'diamond', 'bolt'] as const

  let mode = $state<'new' | 'existing'>('new')
  let appearanceKind = $state<'dot' | 'icon' | 'image'>('dot')
  let dotColor = $state('#ff7700')
  let iconName = $state<string>(ICONS[0])
  let imageFiles = $state<FileList | null>(null)
  let cropX = $state('')
  let cropY = $state('')
  let cropWidth = $state('')
  let cropHeight = $state('')
  let noteMode = $state<'none' | 'new' | 'existing'>('none')
  let noteTitle = $state('')
  let existingNoteId = $state('')
  let notes = $state<Array<{ id: string; title: string }>>([])
  let libraryNodes = $state<Array<{ id: string; noteTitle: string | null }>>([])
  let existingNodeId = $state('')
  let availableTags = $state<Array<{ tagId: string; name: string }>>([])
  let selectedTagIds = $state<string[]>([])
  let newTagName = $state('')
  let errorMessage = $state<string | null>(null)
  let busy = $state(false)

  async function runQuery<T>(name: string, args?: unknown): Promise<T> {
    const response = await window.ew.project.query(name, args)
    if (!response.ok) throw new Error(`${name} failed: ${response.code} ${response.message}`)
    return response.result as T
  }

  $effect(() => {
    void runQuery<Array<{ id: string; title: string }>>('listNotes').then((rows) => {
      notes = rows
    })
    void runQuery<Array<{ id: string; noteTitle: string | null }>>('listNodeLibrary').then(
      (rows) => {
        libraryNodes = rows
      },
    )
    void runQuery<Array<{ id: string; name: string }>>('listTags').then((rows) => {
      availableTags = rows.map((row) => ({ tagId: row.id, name: row.name }))
    })
  })

  function failureText(what: string, result: CommandResult): string {
    if (result.status === 'error') return `${what} failed: ${result.message}`
    if (result.status === 'conflict') return `${what} failed: the project changed underneath`
    return `${what} failed: ${result.status}`
  }

  async function addTag(): Promise<void> {
    const name = newTagName.trim()
    if (name.length === 0) return
    const tagId = crypto.randomUUID()
    const result = await handle.gateway.execute('CreateTag', { tagId, name })
    if (result.status !== 'committed') {
      errorMessage = failureText('CreateTag', result)
      return
    }
    availableTags = [...availableTags, { tagId, name }]
    selectedTagIds = [...selectedTagIds, tagId]
    newTagName = ''
  }

  function toggleTag(tagId: string): void {
    selectedTagIds = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId]
  }

  function cropValue(): { x: number; y: number; width: number; height: number } | null {
    if ([cropX, cropY, cropWidth, cropHeight].some((v) => v.trim().length === 0)) return null
    const parsed = {
      x: Number(cropX),
      y: Number(cropY),
      width: Number(cropWidth),
      height: Number(cropHeight),
    }
    if (Object.values(parsed).some((n) => !Number.isFinite(n))) return null
    if (parsed.width <= 0 || parsed.height <= 0) return null
    return parsed
  }

  async function create(): Promise<void> {
    if (busy) return
    busy = true
    errorMessage = null
    try {
      const center = viewCenter()
      if (mode === 'existing') {
        // §6.3 Place Existing: one new placement, everything shared.
        if (existingNodeId.length === 0) {
          errorMessage = 'choose a node to place'
          return
        }
        const result = await handle.gateway.execute('CreatePlacement', {
          placementId: crypto.randomUUID(),
          canvasId: handle.canvasId,
          nodeId: existingNodeId,
          x: center.x,
          y: center.y,
        })
        if (result.status !== 'committed') {
          errorMessage = failureText('CreatePlacement', result)
          return
        }
        onclose()
        return
      }

      let appearance:
        | { kind: 'dot'; color: string }
        | { kind: 'icon'; icon: string }
        | {
            kind: 'image'
            assetId: string
            crop: { x: number; y: number; width: number; height: number } | null
          }
      if (appearanceKind === 'dot') {
        appearance = { kind: 'dot', color: dotColor }
      } else if (appearanceKind === 'icon') {
        appearance = { kind: 'icon', icon: iconName }
      } else {
        const file = imageFiles?.[0]
        if (!file) {
          errorMessage = 'choose an image file'
          return
        }
        // Asset import is infrastructure ahead of the one user-level
        // CreatePin transaction (§6.2).
        const bytes = new Uint8Array(await file.arrayBuffer())
        const imported = await window.ew.project.importAsset({
          bytes,
          originalFilename: file.name,
        })
        if (!imported.ok) {
          errorMessage = imported.message
          return
        }
        appearance = { kind: 'image', assetId: imported.assetId, crop: cropValue() }
      }

      let note:
        | { kind: 'create'; noteId: string; title: string }
        | { kind: 'attach'; noteId: string }
        | undefined
      if (noteMode === 'new') {
        if (noteTitle.trim().length === 0) {
          errorMessage = 'enter a note title'
          return
        }
        note = { kind: 'create', noteId: crypto.randomUUID(), title: noteTitle.trim() }
      } else if (noteMode === 'existing') {
        if (existingNoteId.length === 0) {
          errorMessage = 'choose a note to attach'
          return
        }
        note = { kind: 'attach', noteId: existingNoteId }
      }

      const result = await handle.gateway.execute('CreatePin', {
        nodeId: crypto.randomUUID(),
        canvasId: handle.canvasId,
        placementId: crypto.randomUUID(),
        x: center.x,
        y: center.y,
        appearance,
        ...(note !== undefined ? { note } : {}),
        ...(selectedTagIds.length > 0 ? { tagIds: selectedTagIds } : {}),
      })
      if (result.status !== 'committed') {
        errorMessage = failureText('CreatePin', result)
        return
      }
      onclose()
    } finally {
      busy = false
    }
  }
</script>

<div class="backdrop" data-testid="create-pin-dialog">
  <div class="dialog" role="dialog" aria-label="Create Pin">
    <h2>Create Pin</h2>

    <fieldset>
      <legend>Mode</legend>
      <label>
        <input type="radio" value="new" bind:group={mode} data-testid="pin-mode-new" />
        New node
      </label>
      <label>
        <input type="radio" value="existing" bind:group={mode} data-testid="pin-mode-existing" />
        Place Existing
      </label>
    </fieldset>

    {#if mode === 'existing'}
      <fieldset>
        <legend>Node</legend>
        <select bind:value={existingNodeId} data-testid="pin-existing-node">
          <option value="">— choose a node —</option>
          {#each libraryNodes as node (node.id)}
            <option value={node.id}>{node.noteTitle ?? node.id.slice(0, 8)}</option>
          {/each}
        </select>
      </fieldset>
    {:else}
      <fieldset>
        <legend>Appearance</legend>
        <label>
          <input type="radio" value="dot" bind:group={appearanceKind} data-testid="pin-kind-dot" />
          Dot
        </label>
        <label>
          <input type="radio" value="icon" bind:group={appearanceKind} data-testid="pin-kind-icon" />
          Icon
        </label>
        <label>
          <input
            type="radio"
            value="image"
            bind:group={appearanceKind}
            data-testid="pin-kind-image"
          />
          Image
        </label>
        {#if appearanceKind === 'dot'}
          <label class="row">
            Color <input type="color" bind:value={dotColor} data-testid="pin-dot-color" />
          </label>
        {:else if appearanceKind === 'icon'}
          <label class="row">
            Icon
            <select bind:value={iconName} data-testid="pin-icon-name">
              {#each ICONS as icon (icon)}
                <option value={icon}>{icon}</option>
              {/each}
            </select>
          </label>
        {:else}
          <label class="row">
            File
            <input type="file" accept="image/*" bind:files={imageFiles} data-testid="pin-image-file" />
          </label>
          <div class="crop-grid">
            <span>Crop (px, optional)</span>
            <input placeholder="x" bind:value={cropX} data-testid="pin-crop-x" />
            <input placeholder="y" bind:value={cropY} data-testid="pin-crop-y" />
            <input placeholder="width" bind:value={cropWidth} data-testid="pin-crop-width" />
            <input placeholder="height" bind:value={cropHeight} data-testid="pin-crop-height" />
          </div>
        {/if}
      </fieldset>

      <fieldset>
        <legend>Note</legend>
        <label>
          <input type="radio" value="none" bind:group={noteMode} data-testid="pin-note-none" />
          None
        </label>
        <label>
          <input type="radio" value="new" bind:group={noteMode} data-testid="pin-note-new" />
          New title
        </label>
        <label>
          <input type="radio" value="existing" bind:group={noteMode} data-testid="pin-note-existing" />
          Existing note
        </label>
        {#if noteMode === 'new'}
          <input
            class="wide"
            placeholder="Note title"
            bind:value={noteTitle}
            data-testid="pin-note-title"
          />
        {:else if noteMode === 'existing'}
          <select class="wide" bind:value={existingNoteId} data-testid="pin-note-picker">
            <option value="">— choose a note —</option>
            {#each notes as note (note.id)}
              <option value={note.id}>{note.title}</option>
            {/each}
          </select>
        {/if}
      </fieldset>

      <fieldset>
        <legend>Tags</legend>
        {#each availableTags as tag (tag.tagId)}
          <label class="row">
            <input
              type="checkbox"
              checked={selectedTagIds.includes(tag.tagId)}
              onchange={() => toggleTag(tag.tagId)}
            />
            {tag.name}
          </label>
        {/each}
        <div class="row">
          <input placeholder="New tag name" bind:value={newTagName} data-testid="pin-new-tag" />
          <button type="button" onclick={() => void addTag()} data-testid="pin-add-tag">
            Add tag
          </button>
        </div>
      </fieldset>
    {/if}

    {#if errorMessage}
      <p class="error" role="alert" data-testid="pin-error">{errorMessage}</p>
    {/if}

    <div class="actions">
      <button type="button" onclick={onclose} data-testid="pin-cancel">Cancel</button>
      <button
        type="button"
        class="primary"
        disabled={busy}
        onclick={() => void create()}
        data-testid="pin-create"
      >
        Create
      </button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.35);
    z-index: 40;
  }

  .dialog {
    width: 26rem;
    max-height: 85vh;
    overflow: auto;
    padding: 1rem 1.25rem;
    background: #fff;
    border-radius: 6px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
  }

  h2 {
    margin: 0 0 0.75rem;
    font-size: 1rem;
  }

  fieldset {
    margin: 0 0 0.75rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
  }

  legend {
    padding: 0 0.3rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #666;
  }

  label {
    margin-right: 0.75rem;
    font-size: 0.9rem;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.4rem;
  }

  .wide {
    display: block;
    width: 100%;
    margin-top: 0.4rem;
    padding: 0.25rem 0.4rem;
    font: inherit;
  }

  .crop-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 0.35rem;
    margin-top: 0.4rem;
    font-size: 0.8rem;
  }

  .crop-grid span {
    grid-column: 1 / -1;
    color: #666;
  }

  .crop-grid input {
    width: 100%;
    padding: 0.2rem 0.3rem;
    font: inherit;
  }

  .error {
    margin: 0 0 0.5rem;
    padding: 0.4rem 0.6rem;
    background: #fbeaea;
    color: #8c2f2f;
    border-radius: 4px;
    font-size: 0.85rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  button {
    padding: 0.3rem 0.9rem;
    font: inherit;
    cursor: pointer;
  }

  .primary {
    background: #2f6fd6;
    color: #fff;
    border: none;
    border-radius: 4px;
  }
</style>

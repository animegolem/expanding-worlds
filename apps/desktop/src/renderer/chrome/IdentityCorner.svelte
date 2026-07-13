<script lang="ts">
  import { onMount } from 'svelte'
  import type { CanvasHostHandle } from '../canvas/host'
  import { importErrorNotice } from '../canvas/import-surfaces'
  import { requestCenterPlacements } from '../note/open-note'
  import { openCornerPanel } from '../note/panels'
  import { runAsUndoGroup } from '../undo/undo-store'
  import type { OutlinePreview } from '../views/outline-data'
  import { navigateTo } from './navigation'
  import { onOpenIdentity } from './identity'
  import { setIdentityProfileImage } from './identity-profile'
  import { tooltip } from './tooltip'

  const { handle }: { handle: CanvasHostHandle } = $props()

  let open = $state(false)
  let loading = $state(false)
  let loadError = $state<string | null>(null)
  let busy = $state(false)
  let beat = $state(false)
  let ownerNodeId = $state<string | null>(null)
  let model = $state<OutlinePreview | null>(null)
  let modelCanvasId: string | null = null
  let panel = $state<HTMLElement | null>(null)
  let input = $state<HTMLInputElement | null>(null)
  let loadEpoch = 0
  let beatTimer: ReturnType<typeof setTimeout> | null = null

  function close(): void {
    open = false
  }

  async function refresh(): Promise<void> {
    const epoch = ++loadEpoch
    const canvasId = handle.canvasId
    if (modelCanvasId !== canvasId) {
      ownerNodeId = null
      model = null
    }
    loading = true
    loadError = null
    try {
      const scene = await window.ew.project.query('getCanvasScene', { canvasId })
      if (epoch !== loadEpoch || handle.canvasId !== canvasId) return
      if (!scene.ok || scene.result === null) {
        ownerNodeId = null
        model = null
        modelCanvasId = canvasId
        loadError = scene.ok ? 'This world is no longer available' : (scene.message ?? 'Identity could not be read')
        return
      }
      const nodeId = (scene.result as { nodeId: string }).nodeId
      const preview = await window.ew.project.query('getOutlinePreview', { kind: 'node', nodeId })
      if (epoch !== loadEpoch || handle.canvasId !== canvasId) return
      ownerNodeId = nodeId
      model = preview.ok ? (preview.result as OutlinePreview | null) : null
      modelCanvasId = canvasId
      loadError = preview.ok ? null : (preview.message ?? 'Identity could not be read')
    } catch (cause) {
      if (epoch !== loadEpoch || handle.canvasId !== canvasId) return
      ownerNodeId = null
      model = null
      modelCanvasId = canvasId
      loadError = cause instanceof Error ? cause.message : String(cause)
    } finally {
      if (epoch === loadEpoch && handle.canvasId === canvasId) loading = false
    }
  }

  function show(): void {
    open = true
    void refresh()
  }

  async function applyFile(file: File | undefined): Promise<void> {
    const nodeId = ownerNodeId
    if (!file || !nodeId || busy) return
    busy = true
    try {
      const result = await setIdentityProfileImage(
        {
          importAsset: (payload) => window.ew.project.importAsset(payload),
          group: (run) => runAsUndoGroup(run, { operation: 'setting the world face' }),
          setAppearance: (forNode, assetId, groupToken) =>
            handle.gateway.execute(
              'SetNodeAppearance',
              { nodeId: forNode, appearance: { kind: 'image', assetId, crop: null } },
              { groupToken },
            ),
        },
        nodeId,
        file,
      )
      if (result.status === 'failed') {
        importErrorNotice(result.message)
        return
      }
      beat = false
      requestAnimationFrame(() => (beat = true))
      if (beatTimer !== null) clearTimeout(beatTimer)
      beatTimer = setTimeout(() => {
        beat = false
        beatTimer = null
      }, 420)
      await refresh()
    } catch (cause) {
      importErrorNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      busy = false
    }
  }

  async function fly(place: OutlinePreview['places'][number]): Promise<void> {
    close()
    if (place.canvasId !== handle.canvasId) await navigateTo(place.canvasId, place.canvasLabel)
    requestCenterPlacements([place.placementId])
  }

  function editNote(): void {
    const nodeId = ownerNodeId
    if (!nodeId) return
    close()
    openCornerPanel(nodeId, model?.noteId ?? null)
  }

  onMount(() => {
    const disposeOpen = onOpenIdentity(show)
    const disposeChanged = window.ew.project.onChanged(() => void refresh())
    const disposeScene = handle.onSceneApplied(() => void refresh())
    const keydown = (event: KeyboardEvent): void => {
      if (!open || event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close()
    }
    const pointerdown = (event: PointerEvent): void => {
      if (!open || panel?.contains(event.target as Node)) return
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-testid="identity-corner-button"]')) return
      close()
    }
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('pointerdown', pointerdown, true)
    void refresh()
    return () => {
      disposeOpen()
      disposeChanged()
      disposeScene()
      if (beatTimer !== null) clearTimeout(beatTimer)
      window.removeEventListener('keydown', keydown, true)
      window.removeEventListener('pointerdown', pointerdown, true)
    }
  })
</script>

<button
  type="button"
  class="identity-button"
  class:active={open}
  data-testid="identity-corner-button"
  aria-label="This world"
  aria-expanded={open}
  data-state={model?.noteId ? 'solid' : 'ghost'}
  onclick={(event) => {
    event.stopPropagation()
    open ? close() : show()
  }}
  use:tooltip={{ name: 'This world — face, note, and places' }}
>◎</button>

{#if open}
  <aside bind:this={panel} class="identity-panel" data-testid="identity-corner-panel" aria-label="This world">
    <header>
      <div>
        <small>THIS WORLD</small>
        <h2>{model?.noteTitle ?? 'Untitled world'}</h2>
      </div>
      <button type="button" class="close" data-testid="identity-close" onclick={close} aria-label="Close">×</button>
    </header>

    <button
      type="button"
      class="profile"
      class:beat
      data-testid="identity-profile-slot"
      disabled={busy || loading || !ownerNodeId}
      onclick={() => input?.click()}
      ondragover={(event) => {
        if (!event.dataTransfer?.types.includes('Files')) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      ondrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void applyFile(event.dataTransfer?.files[0])
      }}
      onpaste={(event) => {
        const files = Array.from(event.clipboardData?.files ?? [])
        const file = files.find((candidate) => candidate.type.startsWith('image/')) ?? files[0]
        if (!file) return
        event.preventDefault()
        void applyFile(file)
      }}
    >
      {#if model?.assetContentHash}
        <img src={`ew-asset://${model.assetContentHash}`} alt="World face" />
      {:else}
        <span class="face-glyph" aria-hidden="true">◎</span>
      {/if}
      <span class="profile-copy">{busy ? 'setting face…' : 'drop · paste · browse'}</span>
    </button>
    <input
      bind:this={input}
      class="file-input"
      data-testid="identity-profile-input"
      type="file"
      accept="image/*"
      onchange={(event) => {
        const target = event.currentTarget
        const file = target.files?.[0]
        target.value = ''
        void applyFile(file)
      }}
    />

    <section class="note" data-testid="identity-note">
      <div class="section-heading"><span>NOTE</span>
        <button
          type="button"
          data-testid="identity-edit-note"
          disabled={!ownerNodeId || loading || loadError !== null}
          onclick={editNote}
          aria-label={model?.noteId ? 'Edit world note' : 'Add world note'}
        >✎</button>
      </div>
      <p class:error={loadError !== null} role={loadError ? 'alert' : undefined}>
        {loadError ?? model?.noteExcerpt ?? (loading ? 'Loading…' : 'No note yet')}
      </p>
    </section>

    <section class="places" data-testid="identity-places">
      <div class="section-heading"><span>PLACES</span><b>{model?.places.length ?? 0}</b></div>
      {#if loadError}
        <p class="error" role="alert">Places unavailable — retry by reopening ◎</p>
      {:else if model?.places.length}
        <ul>
          {#each model.places as place (place.placementId)}
            <li><button type="button" data-testid="identity-place" onclick={() => void fly(place)}><span>⌖</span>{place.canvasLabel}</button></li>
          {/each}
        </ul>
      {:else}
        <p class="empty">No placements</p>
      {/if}
    </section>
  </aside>
{/if}

<style>
  .identity-button { position:absolute; left:12px; bottom:12px; width:34px; height:34px; display:grid; place-items:center; padding:0; pointer-events:auto; border:1px solid var(--ew-border-strong); border-radius:50%; background:var(--ew-surface-raised); color:var(--ew-text); font:700 18px/1 ui-monospace,monospace; cursor:pointer; }
  .identity-button.active { outline:2px solid var(--ew-focus-ring); outline-offset:2px; }
  .identity-panel { position:absolute; left:12px; bottom:56px; box-sizing:border-box; width:min(310px,calc(100vw - 24px)); max-height:calc(100vh - 76px); overflow:auto; padding:0.8rem; pointer-events:auto; border:1px solid var(--ew-border-strong); border-radius:9px; background:var(--ew-surface); color:var(--ew-text); box-shadow:0 8px 28px var(--ew-shadow); }
  header,.section-heading { display:flex; align-items:center; justify-content:space-between; gap:0.5rem; }
  header small,.section-heading { color:var(--ew-text-subtle); font:700 0.67rem/1.2 ui-monospace,monospace; letter-spacing:0.08em; }
  h2 { margin:0.15rem 0 0; font-size:0.92rem; }
  button { color:inherit; font:inherit; }
  .close,.section-heading button { border:0; background:transparent; cursor:pointer; }
  .close { font-size:1.2rem; }
  .profile { position:relative; box-sizing:border-box; width:100%; height:132px; margin-top:0.75rem; padding:0; overflow:hidden; border:1px dashed var(--ew-border-strong); border-radius:7px; background:var(--ew-surface-raised); cursor:pointer; }
  .profile:focus-visible { outline:2px solid var(--ew-focus-ring); outline-offset:2px; }
  .profile img { width:100%; height:100%; display:block; object-fit:cover; }
  .face-glyph { display:grid; height:100%; place-items:center; color:var(--ew-text-muted); font-size:2.2rem; }
  .profile-copy { position:absolute; inset:auto 0 0; padding:0.3rem; background:var(--ew-art-chip-scrim); color:var(--ew-text-soft); font:0.67rem/1.2 ui-monospace,monospace; }
  .profile.beat { animation:identity-beat 420ms ease-out; }
  @keyframes identity-beat { 45% { transform:scale(0.985); outline:2px solid var(--ew-focus-ring); } }
  .file-input { position:absolute; width:1px; height:1px; opacity:0; pointer-events:none; }
  section { margin-top:0.9rem; padding-top:0.75rem; border-top:1px solid var(--ew-border); }
  section p { margin:0.5rem 0 0; color:var(--ew-text-soft); font-size:0.78rem; line-height:1.45; white-space:pre-wrap; }
  .note p { display:-webkit-box; overflow:hidden; -webkit-box-orient:vertical; -webkit-line-clamp:4; }
  .section-heading b { min-width:1.25rem; padding:0.1rem 0.3rem; text-align:center; border-radius:999px; background:var(--ew-surface-raised); color:var(--ew-text-muted); font-size:0.65rem; }
  ul { list-style:none; margin:0.4rem 0 0; padding:0; }
  li + li { border-top:1px solid var(--ew-border); }
  li button { width:100%; display:flex; gap:0.55rem; padding:0.48rem 0.2rem; border:0; background:transparent; text-align:left; cursor:pointer; }
  li button:hover { color:var(--ew-accent); }
  .empty { color:var(--ew-text-subtle); }
  .error { color:var(--ew-danger); }
  @media (pointer:coarse) { .identity-button { width:44px; height:44px; } .identity-panel { bottom:66px; } li button,.section-heading button,.close { min-height:44px; } }
</style>

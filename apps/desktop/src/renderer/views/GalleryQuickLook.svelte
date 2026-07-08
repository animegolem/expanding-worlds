<!--
  Gallery Quick Look (RFC §14.4 rev 0.55 · §8.8 modal family,
  AI-IMP-168): the full-size preview Space reserved for. It renders
  ABOVE the grid inside the gallery takeover — a dimmed backdrop over
  a single asset at ORIGINAL resolution (ew-asset://<hash>, not the
  thumb), captioned with the item's title and pixel dimensions.

  Presentation only: open/close, the cursor, and arrow navigation all
  live in GalleryView (the cursor and index are its state). This
  component is handed the current item and reports a backdrop /
  close-button dismissal; the parent owns the keyboard (Space toggles,
  Esc closes, arrows walk neighbours). §14.4 keeps this the gallery's
  LOCAL cousin of the universal viewer — images only, no renderers:
  a kind without a full-size image (board · note) shows an honest
  "no full-size image" line rather than a blown-up glyph.
-->
<script lang="ts">
  import { tooltip } from '../chrome/tooltip'

  interface PreviewItem {
    kind: 'image' | 'note' | 'board'
    label: string
    contentHash: string | null
    width: number | null
    height: number | null
  }

  let {
    item,
    scope,
    onClose,
  }: {
    item: PreviewItem | null
    scope: 'this-world' | 'everything'
    onClose: () => void
  } = $props()

  // The original bytes (not /thumb): everything-scope URLs carry
  // ?scope=source so ew-asset re-roots at the source store (089).
  const src = $derived(
    item && item.kind === 'image' && item.contentHash
      ? `ew-asset://${item.contentHash}${scope === 'everything' ? '?scope=source' : ''}`
      : null,
  )
</script>

<!-- Click-off closes; Space/Esc close via GalleryView's key handlers. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="quicklook"
  role="presentation"
  data-testid="gallery-quicklook"
  onclick={onClose}
>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="frame"
    role="dialog"
    aria-modal="true"
    aria-label="Quick Look"
    onclick={(event) => event.stopPropagation()}
  >
    {#if src}
      <img class="asset" {src} alt={item?.label ?? ''} data-testid="gallery-quicklook-image" />
    {:else}
      <div class="no-image" data-testid="gallery-quicklook-noimage">
        No full-size image for this item
      </div>
    {/if}
    <div class="caption">
      <span class="title">{item?.label ?? ''}</span>
      {#if item?.width && item?.height}
        <span class="meta">{item.width} × {item.height}</span>
      {/if}
    </div>
  </div>
  <button
    type="button"
    class="close"
    data-testid="gallery-quicklook-close"
    aria-label="Close Quick Look"
    onclick={onClose}
    use:tooltip={{ name: 'Close Quick Look' }}
  >
    Esc
  </button>
</div>

<style>
  /* Above the grid and the action bar, inside the takeover sheet
     (§8.8 modal family): a dimmed backdrop, the asset centred. */
  .quicklook {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2.5rem;
    background: var(--ew-scrim);
    cursor: zoom-out;
  }

  .frame {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    max-width: 100%;
    max-height: 100%;
    cursor: default;
  }

  .asset {
    max-width: 100%;
    /* Leave room for the caption under a full-height image. */
    max-height: calc(100% - 2rem);
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 12px 48px var(--ew-scrim);
  }

  .no-image {
    padding: 3rem 4rem;
    border: 1px dashed var(--ew-border-strong);
    border-radius: 8px;
    color: var(--ew-text-muted);
    background: var(--ew-surface-subtle);
  }

  .caption {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    max-width: 100%;
    padding: 0.2rem 0.5rem;
    font-size: 0.82rem;
  }

  .title {
    color: var(--ew-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meta {
    flex: none;
    color: var(--ew-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    padding: 0.15rem 0.5rem;
    background: var(--ew-surface-raised);
    color: var(--ew-text-muted);
    border: 1px solid var(--ew-border-strong);
    border-radius: 4px;
    font-size: 0.7rem;
    cursor: pointer;
  }
</style>

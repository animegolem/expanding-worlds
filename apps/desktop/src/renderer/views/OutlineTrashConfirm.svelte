<script lang="ts">
  import { Z } from '../z'

  export interface NodeImpact {
    placementCount: number
    tagCount: number
    ownedCanvasId: string | null
    ownedCanvasPlacementCount: number
    ownedCanvasDecorationCount: number
  }

  const { title, impact, busy, onconfirm, oncancel }: {
    title: string
    impact: NodeImpact
    busy: boolean
    onconfirm: () => void
    oncancel: () => void
  } = $props()
</script>

<div class="scrim" role="presentation" style:z-index={Z.modal}>
  <div class="dialog" role="alertdialog" aria-modal="true" data-testid="outline-trash-confirm">
    <h2>Move “{title}” to Trash?</h2>
    <p>
      Holds {impact.placementCount} {impact.placementCount === 1 ? 'placement' : 'placements'}
      {#if impact.tagCount > 0} · {impact.tagCount} {impact.tagCount === 1 ? 'tag' : 'tags'}{/if}
      {#if impact.ownedCanvasId}
        · owns a board with {impact.ownedCanvasPlacementCount} items and {impact.ownedCanvasDecorationCount} decorations
      {/if}
    </p>
    <p class="recovery">The node and its aggregate move together. Restore them from the Trash view.</p>
    <div class="actions">
      <button type="button" disabled={busy} onclick={oncancel}>Cancel</button>
      <button class="danger" type="button" data-testid="outline-trash-confirm-submit" disabled={busy} onclick={onconfirm}>Move to Trash</button>
    </div>
  </div>
</div>

<style>
  .scrim { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background:var(--ew-dialog-scrim); pointer-events:auto; }
  .dialog { width:min(28rem,calc(100vw - 2rem)); padding:1rem; border:1px solid var(--ew-border); border-radius:8px; background:var(--ew-surface-menu); box-shadow:0 8px 28px var(--ew-shadow); }
  h2 { margin:0 0 0.6rem; font-size:0.95rem; }
  p { margin:0.35rem 0; color:var(--ew-text-soft); line-height:1.5; }
  .recovery { color:var(--ew-text-muted); font-size:0.75rem; }
  .actions { display:flex; justify-content:flex-end; gap:0.5rem; margin-top:0.9rem; }
  button { padding:0.35rem 0.65rem; border:1px solid var(--ew-border-strong); border-radius:5px; background:var(--ew-surface-raised); color:var(--ew-text); font:inherit; cursor:pointer; }
  button.danger { color:var(--ew-danger); }
</style>

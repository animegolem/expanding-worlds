<script lang="ts">
  import { tooltip } from '../chrome/tooltip'

  const {
    name,
    color = null,
    testid,
    onopen,
    onremove,
  }: {
    name: string
    color?: string | null
    testid: string
    onopen?: (event: MouseEvent) => void
    onremove: () => void
  } = $props()
</script>

<span class="removable-tag" data-testid={testid} style={color ? `color:${color}` : ''}>
  {#if onopen}
    <button type="button" class="label" onclick={onopen}>#{name}</button>
  {:else}
    <span class="label">#{name}</span>
  {/if}
  <button
    type="button"
    class="remove"
    data-testid={`${testid}-remove`}
    aria-label={`Remove #${name}`}
    onclick={(event) => {
      event.stopPropagation()
      onremove()
    }}
    use:tooltip={{ name: `Remove #${name}` }}
  >✕</button>
</span>

<style>
  .removable-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.14rem 0.3rem 0.14rem 0.55rem;
    background: var(--ew-surface-raised);
    border: 1px solid var(--ew-border-strong);
    border-radius: 999px;
    white-space: nowrap;
  }
  button { font: inherit; }
  .label, .remove {
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
  }
  button.label, .remove { cursor: pointer; }
  .remove {
    min-width: 16px;
    min-height: 16px;
    color: var(--ew-text-muted);
    font-size: 0.7rem;
    opacity: 0;
  }
  .removable-tag:hover .remove, .remove:focus-visible { opacity: 1; }
  .remove:hover { color: var(--ew-text); }
  @media (pointer: coarse) {
    .remove { min-width: 24px; min-height: 24px; opacity: 1; }
  }
</style>

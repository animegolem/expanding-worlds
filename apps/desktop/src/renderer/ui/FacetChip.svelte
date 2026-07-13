<!-- Shared gallery/filter facet (AI-IMP-299): one full-pill geometry,
     with an accent toggle form and the kit's removable tag form. -->
<script lang="ts">
  import { tooltip } from '../chrome/tooltip'

  let {
    label,
    active = false,
    testid,
    disabled = false,
    onToggle,
    onRemove,
    removeLabel,
  }: {
    label: string
    active?: boolean
    testid?: string
    disabled?: boolean
    onToggle?: () => void
    onRemove?: () => void
    removeLabel?: string
  } = $props()
</script>

{#if onRemove}
  <span class="facet removable" data-testid={testid}>
    {label}
    <button
      type="button"
      aria-label={removeLabel ?? `Remove ${label}`}
      onclick={onRemove}
      use:tooltip={{ name: removeLabel ?? `Remove ${label}` }}
    >✕</button>
  </span>
{:else}
  <button
    type="button"
    class="facet toggle"
    data-testid={testid}
    aria-pressed={active}
    {disabled}
    onclick={onToggle}
  >
    {label}
  </button>
{/if}

<style>
  .facet {
    border: 1px solid var(--ew-border-strong);
    border-radius: 999px;
    background: var(--ew-surface-raised);
    color: var(--ew-text-muted);
    font: inherit;
    font-size: 0.78rem;
  }

  .toggle {
    padding: 0.18rem 0.6rem;
    cursor: pointer;
  }

  .toggle[aria-pressed='true'] {
    border-color: var(--ew-accent);
    background: var(--ew-accent);
    color: var(--ew-on-accent);
  }

  .removable {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.14rem 0.3rem 0.14rem 0.55rem;
    color: var(--ew-text);
  }

  .removable button {
    padding: 0 0.15rem;
    border: 0;
    background: transparent;
    color: var(--ew-text-muted);
    font: inherit;
    font-size: 0.7rem;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    color: var(--ew-text);
  }

  button:focus-visible {
    outline: 2px solid var(--ew-focus-ring);
    outline-offset: 1px;
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>

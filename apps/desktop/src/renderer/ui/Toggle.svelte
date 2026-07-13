<!-- Kit toggle: a binary control whose state is visible in both color and
     geometry. The native checkbox is deliberately not exposed. -->
<script lang="ts">
  let {
    checked,
    label,
    testid,
    onchange,
    disabled = false,
  }: {
    checked: boolean
    label: string
    testid?: string
    onchange: (checked: boolean) => void
    disabled?: boolean
  } = $props()
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  data-testid={testid}
  {disabled}
  onclick={() => onchange(!checked)}
>
  <span class="track"><span class="thumb"></span></span>
  <span class="label">{label}</span>
</button>

<style>
  button {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.2rem 0.35rem;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: var(--ew-text-muted);
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 2px solid var(--ew-focus-ring);
    outline-offset: 1px;
  }

  .track {
    width: 1.8rem;
    height: 1rem;
    display: flex;
    align-items: center;
    padding: 2px;
    border: 1px solid var(--ew-border-control);
    border-radius: 999px;
    background: var(--ew-surface-input);
  }

  .thumb {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 50%;
    background: var(--ew-text-muted);
  }

  button[aria-checked='true'] .track {
    background: var(--ew-accent);
    border-color: var(--ew-accent);
  }

  button[aria-checked='true'] .thumb {
    transform: translateX(0.75rem);
    background: var(--ew-on-accent);
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  :global(:root[data-density='comfortable']) button {
    min-height: 44px;
  }
</style>

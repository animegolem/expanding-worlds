<!-- Shared kit segmented control (AI-IMP-299). The primitive owns the
     full-pill geometry, focus, and selected palette; callers own only
     option identity and surrounding layout. -->
<script lang="ts">
  export interface SegmentedOption {
    value: string
    label: string
    testid?: string
    disabled?: boolean
  }

  let {
    options,
    value,
    ariaLabel,
    onchange,
    testid,
  }: {
    options: readonly SegmentedOption[]
    value: string
    ariaLabel: string
    onchange: (value: string) => void
    testid?: string
  } = $props()
</script>

<span class="segmented" role="group" aria-label={ariaLabel} data-testid={testid}>
  {#each options as option (option.value)}
    <button
      type="button"
      data-testid={option.testid}
      aria-pressed={value === option.value}
      disabled={option.disabled}
      onclick={() => onchange(option.value)}
    >
      {option.label}
    </button>
  {/each}
</span>

<style>
  .segmented {
    display: inline-flex;
    border: 1px solid var(--ew-border-strong);
    border-radius: 999px;
    overflow: hidden;
  }

  button {
    padding: 0.2rem 0.65rem;
    border: 0;
    background: transparent;
    color: var(--ew-text-muted);
    font: inherit;
    font-size: 0.78rem;
    cursor: pointer;
  }

  button + button {
    border-left: 1px solid var(--ew-border);
  }

  button[aria-pressed='true'] {
    background: var(--ew-accent);
    color: var(--ew-on-accent);
  }

  button:focus-visible {
    outline: 2px solid var(--ew-focus-ring);
    outline-offset: -2px;
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  :global(:root[data-density='comfortable']) button {
    min-height: 44px;
  }
</style>

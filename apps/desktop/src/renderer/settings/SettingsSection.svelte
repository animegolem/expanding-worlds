<script module lang="ts">
  /** Renderer-session memory: closing the takeover remounts the view, but
   * folds stay put until the app process ends. They are view state, not a
   * third settings tier. */
  const foldedSections = new Set<string>()
</script>

<script lang="ts">
  import { onMount, type Snippet } from 'svelte'

  let {
    id,
    label,
    scope = 'app',
    children,
  }: {
    id: string
    label: string
    scope?: 'app' | 'this-world' | 'mixed' | 'reference'
    children: Snippet
  } = $props()

  let folded = $state(false)
  onMount(() => {
    folded = foldedSections.has(id)
  })

  function toggle(): void {
    folded = !folded
    if (folded) foldedSections.add(id)
    else foldedSections.delete(id)
  }
</script>

<section data-testid={`settings-section-${id}`}>
  <button
    type="button"
    class="section-head"
    data-testid={`settings-fold-${id}`}
    aria-expanded={!folded}
    aria-controls={`settings-section-${id}-body`}
    onclick={toggle}
  >
    <span class="chevron" aria-hidden="true">{folded ? '▸' : '▾'}</span>
    <span class="label">{label}</span>
    <span class="scopes">
      {#if scope === 'mixed'}
        <span class="scope">app</span><span class="scope world">this world</span>
      {:else if scope === 'this-world'}
        <span class="scope world">this world</span>
      {:else if scope === 'reference'}
        <span class="scope">reference</span>
      {:else}
        <span class="scope">app</span>
      {/if}
    </span>
  </button>
  {#if !folded}
    <div id={`settings-section-${id}-body`} class="section-body">
      {@render children()}
    </div>
  {/if}
</section>

<style>
  section {
    border-top: 1px solid var(--ew-border);
  }

  .section-head {
    width: 100%;
    min-height: 2.25rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 0;
    border: 0;
    background: transparent;
    color: var(--ew-text);
    font: inherit;
    cursor: pointer;
  }

  .section-head:focus-visible {
    outline: 2px solid var(--ew-focus-ring);
    outline-offset: 2px;
    border-radius: 5px;
  }

  .chevron {
    width: 0.8rem;
    color: var(--ew-text-subtle);
    font-size: 0.72rem;
  }

  .label {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ew-text-muted);
  }

  .scopes {
    margin-left: auto;
    display: flex;
    gap: 0.3rem;
  }

  .scope {
    padding: 0.08rem 0.38rem;
    border: 1px solid var(--ew-border);
    border-radius: 999px;
    color: var(--ew-text-subtle);
    font: 600 0.58rem ui-monospace, monospace;
    letter-spacing: 0.03em;
    text-transform: lowercase;
  }

  .scope.world {
    color: var(--ew-warn-muted);
    border-color: var(--ew-warn-muted-border);
  }

  .section-body {
    padding-bottom: 0.7rem;
  }

  :global(:root[data-density='comfortable']) .section-head {
    min-height: 44px;
  }
</style>

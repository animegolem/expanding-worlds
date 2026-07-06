<!--
  The §7.4 shared row grammar (AI-IMP-069): one visual core for
  every surface that lists nodes — appearance swatch (dot · icon ·
  image), the §8.4 page/frame glyphs, label, placement count, tag
  chips, and an `extra` snippet for surface-specific chips (the
  uses list's "here", the outline's orphan/loose badges). The
  consumer owns interactivity (button, testids, actions); this row
  owns only how a node reads.
-->
<script lang="ts" module>
  export interface NodeRowAppearance {
    appearanceKind: string | null
    appearanceColor: string | null
    appearanceIcon?: string | null
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'

  const {
    appearance,
    label = null,
    count = null,
    tags = [],
    hasNote = false,
    hasCanvas = false,
    extra = undefined,
  }: {
    appearance: NodeRowAppearance
    label?: string | null
    count?: number | null
    tags?: string[]
    hasNote?: boolean
    hasCanvas?: boolean
    extra?: Snippet
  } = $props()
</script>

<span class="node-row">
  {#if appearance.appearanceKind === 'dot'}
    <span
      class="swatch"
      style={`background:${appearance.appearanceColor ?? 'var(--ew-node-dot-default)'}`}
    ></span>
  {:else if appearance.appearanceKind === 'icon'}
    <span class="swatch icon">{appearance.appearanceIcon ?? '◇'}</span>
  {:else}
    <span class="swatch image"></span>
  {/if}
  {#if hasNote}<span class="glyph" title="has a note">¶</span>{/if}
  {#if hasCanvas}<span class="glyph" title="has a canvas">⊡</span>{/if}
  {#if label !== null}
    <span class="label">{label}</span>
  {/if}
  {#if count !== null}
    <span class="count">×{count}</span>
  {/if}
  {@render extra?.()}
  {#if tags.length > 0}
    <span class="tags">
      {#each tags as tag (tag)}
        <span class="tag-chip">{tag}</span>
      {/each}
    </span>
  {/if}
</span>

<style>
  .node-row {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
  }

  .swatch {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .swatch.icon {
    width: auto;
    height: auto;
    border-radius: 0;
    font-size: 0.72rem;
  }

  .swatch.image {
    border-radius: 2px;
    background: var(--ew-border-strong);
  }

  .glyph {
    flex: none;
    color: var(--ew-text-muted);
    font-size: 0.72rem;
  }

  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .count {
    flex: none;
    color: var(--ew-text-muted);
    font-size: 0.72rem;
  }

  .tags {
    display: inline-flex;
    gap: 0.2rem;
    overflow: hidden;
  }

  .tag-chip {
    padding: 0 0.35rem;
    border-radius: 7px;
    background: var(--ew-surface-raised);
    color: var(--ew-text-muted);
    font-size: 0.62rem;
    white-space: nowrap;
  }
</style>

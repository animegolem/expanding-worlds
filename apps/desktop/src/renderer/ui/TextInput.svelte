<!--
  Shared text-input primitive (AI-IMP-142): the single home for the
  chrome text-field look that TagPanel, SearchPanel and SettingsView
  had each hand-rolled from the same tokens (surface-input fill,
  border-strong outline). Two variants encode the two shipped shapes:

    variant="pill"      — full-round search/tag fields (999px)
    variant="standard"  — 5px chrome field with an accent focus ring

  Layout (width / flex / max-width) stays a caller concern, passed via
  `style` — the primitive owns only the SKIN so every consumer renders
  pixel-identically to its pre-migration CSS.

  NEVER back this with <datalist>: completions are custom lists (the
  native popup segfaults Electron's hidden e2e windows, AI-IMP-069).
  This primitive renders a bare <input type="text"> by construction —
  there is no `list` seam to attach one.
-->
<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements'

  type Props = Omit<HTMLInputAttributes, 'type' | 'value'> & {
    /** pill = full-round (search/tag fields); standard = 5px chrome field. */
    variant?: 'standard' | 'pill'
    /** Bindable field text. */
    value?: string
    /** Forwards the underlying <input> element (bind:ref for focus()). */
    ref?: HTMLInputElement | null
  }

  let {
    variant = 'standard',
    value = $bindable(''),
    ref = $bindable(null),
    ...rest
  }: Props = $props()
</script>

<input
  bind:this={ref}
  bind:value
  type="text"
  class="ew-text-input {variant}"
  {...rest}
/>

<style>
  /* Shared skin — identical across every consuming surface. */
  .ew-text-input {
    box-sizing: border-box;
    background: var(--ew-surface-input);
    color: var(--ew-text);
    border: 1px solid var(--ew-border-strong);
    font: inherit;
  }

  /* Never disabled in the pill surfaces, but harmless there; matches
     SettingsView's disabled remote field. */
  .ew-text-input:disabled {
    opacity: 0.5;
  }

  /* Pill: TagPanel + SearchPanel search fields — filter-in-place
     grammar (font inherits the panel's 0.78rem). */
  .ew-text-input.pill {
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
  }

  /* Standard: SettingsView chrome field — configure grammar. */
  .ew-text-input.standard {
    padding: 0.25rem 0.45rem;
    border-radius: 5px;
    font-size: 0.8rem;
  }

  /* Focus is UNIFORM across both variants (kit 1.2 ruling): the shared
     2px --ew-focus-ring outline at offset 1px — never the browser
     default. */
  .ew-text-input:focus {
    outline: 2px solid var(--ew-focus-ring);
    outline-offset: 1px;
  }
</style>

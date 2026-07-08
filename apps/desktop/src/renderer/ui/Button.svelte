<!--
  Shared chrome-button primitive (AI-IMP-142; ruled by AI-IMP-153).

  The kit 1.2 "One voice" ruling collapses buttons to ONE geometry —
  5px radius · 1px --ew-border-control · raised surface · hover
  lightens one step (--ew-surface-control-hover) · disabled .4 — with
  the colour variants riding that single shape. The `size` axis (the
  old 4px "dialog" / 5px "chrome" split) retires here.

    variant  — colour grammar, ONE geometry underneath
      default    raised surface, control border, hover lightens a step
      accent     accent fill / on-accent text (committed / primary act)
      secondary  transparent outline (control border) — dialog "Back/Close"
      ghost      borderless quiet act; hover lifts to the raised surface
      danger     danger fill / on-danger text (destructive; tokens exist)

  Focus is the shared 2px --ew-focus-ring outline (offset 1px) on
  :focus-visible — never the browser default. Layout (flex:none etc.)
  stays a caller concern, passed via `style`.
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'
  import { tooltip, type TooltipSpec } from '../chrome/tooltip'

  type Props = Omit<HTMLButtonAttributes, 'type'> & {
    variant?: 'default' | 'accent' | 'secondary' | 'ghost' | 'danger'
    /** The §8.2 house tooltip chip. Use this — NEVER a native `title` —
     * so a button's name / shortcut / disabled-reason rides the one
     * chip style app-wide. */
    tip?: TooltipSpec
    children: Snippet
  }

  let { variant = 'default', tip, children, ...rest }: Props = $props()
</script>

{#if tip}
  <button type="button" class="ew-button {variant}" use:tooltip={tip} {...rest}>
    {@render children()}
  </button>
{:else}
  <button type="button" class="ew-button {variant}" {...rest}>
    {@render children()}
  </button>
{/if}

<style>
  /* ---- the one geometry (kit 1.2 ruling) ---- */
  .ew-button {
    padding: 0.25rem 0.7rem;
    border-radius: 5px;
    font: inherit;
    font-size: 0.8rem;
    white-space: nowrap;
    cursor: pointer;
  }

  .ew-button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .ew-button:focus-visible {
    outline: 2px solid var(--ew-focus-ring);
    outline-offset: 1px;
  }

  /* ---- colour (variant) rides the one shape ---- */
  .ew-button.default {
    background: var(--ew-surface-raised);
    color: var(--ew-text);
    border: 1px solid var(--ew-border-control);
  }

  .ew-button.default:hover:not(:disabled) {
    background: var(--ew-surface-control-hover);
  }

  .ew-button.accent {
    background: var(--ew-accent);
    color: var(--ew-on-accent);
    border: 1px solid var(--ew-accent);
  }

  .ew-button.secondary {
    background: transparent;
    color: var(--ew-text);
    border: 1px solid var(--ew-border-control);
  }

  .ew-button.secondary:hover:not(:disabled) {
    background: var(--ew-surface-control-hover);
  }

  .ew-button.ghost {
    background: transparent;
    color: var(--ew-text);
    border: none;
  }

  .ew-button.ghost:hover:not(:disabled) {
    background: var(--ew-surface-raised);
  }

  .ew-button.danger {
    background: var(--ew-danger);
    color: var(--ew-on-danger);
    border: 1px solid var(--ew-danger);
  }
</style>

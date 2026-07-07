<!--
  Shared chrome-button primitive (AI-IMP-142): the single home for the
  text-button grammar that RestoreDialog and SettingsView had each
  hand-rolled. Colour and geometry are orthogonal:

    variant  — colour grammar
      default    raised surface, strong border, hover lightens a step
      accent     accent fill / on-accent text (committed / primary act)
      secondary  transparent outline (control border) — dialog "Back/Close"
      danger     danger fill / on-danger text (destructive; carried for
                 completeness — no current consumer, tokens exist)

    size     — geometry, matching the two shipped shapes exactly
      chrome     5px radius, 0.25/0.6 padding, 0.75rem  (SettingsView)
      dialog     4px radius, 0.3/0.7  padding, 0.8rem   (RestoreDialog)

  Layout (flex:none etc.) stays a caller concern, passed via `style`.
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'

  type Props = Omit<HTMLButtonAttributes, 'type'> & {
    variant?: 'default' | 'accent' | 'secondary' | 'danger'
    size?: 'chrome' | 'dialog'
    children: Snippet
  }

  let { variant = 'default', size = 'chrome', children, ...rest }: Props = $props()
</script>

<button type="button" class="ew-button {variant} {size}" {...rest}>
  {@render children()}
</button>

<style>
  .ew-button {
    font: inherit;
    cursor: pointer;
  }

  .ew-button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* ---- geometry (size) ---- */
  .ew-button.chrome {
    padding: 0.25rem 0.6rem;
    border-radius: 5px;
    font-size: 0.75rem;
    white-space: nowrap;
  }

  .ew-button.dialog {
    padding: 0.3rem 0.7rem;
    border-radius: 4px;
    font-size: 0.8rem;
  }

  /* ---- colour (variant) ---- */
  .ew-button.default {
    background: var(--ew-surface-raised);
    color: var(--ew-text);
    border: 1px solid var(--ew-border-strong);
  }

  .ew-button.default:hover:not(:disabled) {
    background: var(--ew-surface-hover);
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

  .ew-button.danger {
    background: var(--ew-danger);
    color: var(--ew-on-danger);
    border: 1px solid var(--ew-danger);
  }
</style>

<script lang="ts">
  import type { OutlineContextMenuGroup } from '../outline/context-menu'
  import { Z } from '../z'

  const { x, y, groups, onclose }: {
    x: number
    y: number
    groups: readonly OutlineContextMenuGroup[]
    onclose: () => void
  } = $props()

  function run(action: (() => void) | undefined): void {
    if (!action) return
    onclose()
    action()
  }
</script>

<div
  class="menu"
  role="menu"
  tabindex="-1"
  aria-label="Outline row actions"
  data-testid="outline-context-menu"
  style:z-index={Z.popover}
  style={`left:min(${x}px,calc(100vw - 18rem));top:min(${y}px,calc(100vh - 22rem))`}
  onpointerdown={(event) => event.stopPropagation()}
>
  {#each groups as group (group.id)}
    <div class="group" class:danger={group.id === 'danger'}>
      {#each group.items as item (item.id)}
        <button
          type="button"
          role="menuitem"
          data-verb-id={item.id}
          disabled={!item.run}
          class:danger={item.danger}
          onclick={() => run(item.run)}
        >
          <span>{item.label}</span><kbd>{item.shortcut}</kbd>
          {#if item.disabledReason}<small>{item.disabledReason}</small>{/if}
        </button>
      {/each}
    </div>
  {/each}
</div>

<style>
  .menu { position:fixed; width:17rem; padding:0.3rem; border:1px solid var(--ew-border); border-radius:7px; background:var(--ew-surface-menu); box-shadow:0 6px 22px var(--ew-shadow); pointer-events:auto; }
  .group + .group { margin-top:0.25rem; padding-top:0.25rem; border-top:1px solid var(--ew-border); }
  button { display:grid; grid-template-columns:1fr auto; gap:0.2rem 0.7rem; width:100%; padding:0.35rem 0.45rem; border:0; border-radius:4px; background:transparent; color:var(--ew-text); font:inherit; text-align:left; cursor:pointer; }
  button:hover:not(:disabled) { background:var(--ew-surface-hover); }
  button:disabled { cursor:not-allowed; color:var(--ew-text-muted); }
  button.danger { color:var(--ew-danger); }
  kbd { color:var(--ew-text-subtle); font:inherit; font-family:ui-monospace, monospace; }
  small { grid-column:1 / -1; color:var(--ew-text-subtle); font-size:0.7rem; }
</style>

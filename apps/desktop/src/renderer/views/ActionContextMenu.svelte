<script lang="ts">
  import { onMount } from 'svelte'
  import { placeAnchored } from '../chrome/anchored-placement'
  import { dismissOnOutside } from '../chrome/dismissal-guard'
  import type { OutlineContextMenuGroup } from '../outline/context-menu'
  import { Z } from '../z'

  let {
    x,
    y,
    groups,
    onclose,
    testid,
    ariaLabel,
  }: {
    x: number
    y: number
    groups: readonly OutlineContextMenuGroup[]
    onclose: () => void
    testid: string
    ariaLabel: string
  } = $props()

  let menu: HTMLElement
  let left = $state(0)
  let top = $state(0)

  onMount(() => {
    const rect = menu.getBoundingClientRect()
    const placed = placeAnchored({
      anchor: { x, y, width: 0, height: 0 },
      surface: { width: rect.width, height: rect.height },
      host: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
      x: { preferred: 'start', fallback: 'end' },
      y: { preferred: 'start', fallback: 'end' },
    })
    left = placed.x
    top = placed.y
    menu.focus({ preventScroll: true })
  })

  function run(action: (() => void) | undefined): void {
    if (!action) return
    onclose()
    action()
  }
</script>

<div
  bind:this={menu}
  class="menu"
  role="menu"
  tabindex="-1"
  aria-label={ariaLabel}
  data-testid={testid}
  style:z-index={Z.popover}
  style:left={`${left}px`}
  style:top={`${top}px`}
  use:dismissOnOutside={{ dismiss: onclose }}
  onpointerdown={(event) => event.stopPropagation()}
>
  {#each groups as group (group.id)}
    <div class="group" class:danger={group.id === 'danger'}>
      {#each group.items as item (item.id)}
        <button
          type="button"
          role="menuitem"
          data-verb-id={item.id}
          data-testid={`${testid}-${item.id}`}
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

<!--
  ☰ menu (RFC §8.2, AI-IMP-068): the rail's anchored menu popover.
  Settings is its first real entry (the §11.5 takeover); End
  session (§11.4) and export join it with their epics and render
  deferred until then, same grammar as the waiting rail charms.
-->
<script lang="ts">
  import { openTakeover } from './takeover'
  import { tooltip } from './tooltip'

  const { onclose }: { onclose: () => void } = $props()

  $effect(() => {
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onclose()
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  })
</script>

<div class="menu" data-testid="rail-menu" role="menu">
  <button
    type="button"
    role="menuitem"
    data-testid="menu-settings"
    onclick={() => {
      onclose()
      openTakeover('settings')
    }}
  >
    Settings…
  </button>
  <button
    type="button"
    role="menuitem"
    class="deferred"
    aria-disabled="true"
    data-testid="menu-end-session"
    use:tooltip={{ name: 'End session — arrives with sync and the vault mirror' }}
  >
    End session…
  </button>
  <button
    type="button"
    role="menuitem"
    class="deferred"
    aria-disabled="true"
    data-testid="menu-export"
    use:tooltip={{ name: 'Export — arrives with the export epic' }}
  >
    Export…
  </button>
</div>

<style>
  .menu {
    position: absolute;
    top: 0;
    right: calc(100% + 0.35rem);
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.35rem;
    background: rgba(23, 25, 29, 0.95);
    border: 1px solid #2e3138;
    border-radius: 7px;
    white-space: nowrap;
  }

  button {
    padding: 0.25rem 0.6rem;
    text-align: left;
    background: transparent;
    color: #dde3ea;
    border: none;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
  }

  button:hover {
    background: #23262c;
  }

  button.deferred {
    opacity: 0.45;
    cursor: default;
  }

  button.deferred:hover {
    background: transparent;
  }
</style>

<!--
  ☰ menu (RFC §8.2 rev 0.45, ratified inventory): top to bottom —
  Undo · Redo · divider · Trash… · End Session · divider · Settings ·
  Help/About, with the deferred Export… kept below (its §16 anchor).
  Undo/Redo/Trash…/End Session render aria-disabled until their epics
  land, each naming what enables it; Undo/Redo also PRINT their
  shortcuts, so the menu is the self-teaching surface even disabled.
  Settings opens the §11.5 takeover; Help/About opens a small anchored
  dialog (portaled out per §8.8).
-->
<script lang="ts">
  import HelpAboutDialog from './HelpAboutDialog.svelte'
  import { openTakeover } from './takeover'
  import { tooltip } from './tooltip'
  import { canRedo, canUndo, onUndoChanged, redo, undo } from '../undo/undo-store'

  const { onclose }: { onclose: () => void } = $props()

  // macOS is the lead platform (§8.2); the shortcut chips print the
  // ⌘ glyph. The rows print their keys even when disabled, so the menu
  // stays self-teaching (§8.2, AI-IMP-110).
  const UNDO_SHORTCUT = '⌘Z'
  const REDO_SHORTCUT = '⇧⌘Z'

  // §10.2 stack depth (AI-IMP-114): the rows flip live between
  // enabled and disabled as commands land, undo, and redo.
  let undoEnabled = $state(false)
  let redoEnabled = $state(false)
  $effect(() =>
    onUndoChanged(() => {
      undoEnabled = canUndo()
      redoEnabled = canRedo()
    }),
  )

  let helpOpen = $state(false)

  $effect(() => {
    const onKeydown = (event: KeyboardEvent): void => {
      // Help/About owns Esc while it is open (capture-phase handler).
      if (event.key === 'Escape' && !helpOpen) onclose()
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  })
</script>

<div class="menu" data-testid="rail-menu" role="menu">
  <button
    type="button"
    role="menuitem"
    class:deferred={!undoEnabled}
    aria-disabled={!undoEnabled}
    data-testid="menu-undo"
    onclick={() => {
      if (!undoEnabled) return
      onclose()
      undo()
    }}
    use:tooltip={{
      name: undoEnabled ? 'Undo the last change' : 'Nothing to undo',
      shortcut: UNDO_SHORTCUT,
    }}
  >
    <span class="label">Undo</span>
    <span class="shortcut">{UNDO_SHORTCUT}</span>
  </button>
  <button
    type="button"
    role="menuitem"
    class:deferred={!redoEnabled}
    aria-disabled={!redoEnabled}
    data-testid="menu-redo"
    onclick={() => {
      if (!redoEnabled) return
      onclose()
      redo()
    }}
    use:tooltip={{
      name: redoEnabled ? 'Redo the undone change' : 'Nothing to redo',
      shortcut: REDO_SHORTCUT,
    }}
  >
    <span class="label">Redo</span>
    <span class="shortcut">{REDO_SHORTCUT}</span>
  </button>

  <div class="divider" role="separator"></div>

  <button
    type="button"
    role="menuitem"
    class="deferred"
    aria-disabled="true"
    data-testid="menu-trash"
    use:tooltip={{ name: 'Trash — arrives with the trash browser (AI-IMP-102)' }}
  >
    <span class="label">Trash…</span>
  </button>
  <button
    type="button"
    role="menuitem"
    class="deferred"
    aria-disabled="true"
    data-testid="menu-end-session"
    use:tooltip={{ name: 'End session — arrives with sync and the vault mirror' }}
  >
    <span class="label">End Session</span>
  </button>

  <div class="divider" role="separator"></div>

  <button
    type="button"
    role="menuitem"
    data-testid="menu-settings"
    onclick={() => {
      onclose()
      openTakeover('settings')
    }}
  >
    <span class="label">Settings</span>
  </button>
  <button
    type="button"
    role="menuitem"
    data-testid="menu-help"
    onclick={() => {
      helpOpen = true
    }}
  >
    <span class="label">Help/About</span>
  </button>

  <button
    type="button"
    role="menuitem"
    class="deferred"
    aria-disabled="true"
    data-testid="menu-export"
    use:tooltip={{ name: 'Export — arrives with the export epic' }}
  >
    <span class="label">Export…</span>
  </button>
</div>

{#if helpOpen}
  <HelpAboutDialog onclose={() => (helpOpen = false)} />
{/if}

<style>
  .menu {
    position: absolute;
    top: 0;
    right: calc(100% + 0.35rem);
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.35rem;
    background: var(--ew-surface-menu);
    border: 1px solid var(--ew-border);
    border-radius: 7px;
    white-space: nowrap;
  }

  .divider {
    height: 1px;
    margin: 0.15rem 0.2rem;
    background: var(--ew-border);
  }

  button {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    justify-content: space-between;
    padding: 0.25rem 0.6rem;
    text-align: left;
    background: transparent;
    color: var(--ew-text);
    border: none;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
  }

  button:hover {
    background: var(--ew-surface-raised);
  }

  .shortcut {
    opacity: 0.55;
    font-family: ui-monospace, monospace;
    font-size: 0.7rem;
  }

  button.deferred {
    opacity: 0.45;
    cursor: default;
  }

  button.deferred:hover {
    background: transparent;
  }
</style>

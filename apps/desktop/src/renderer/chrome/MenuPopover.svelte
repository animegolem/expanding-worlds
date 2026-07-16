<!--
  ☰ menu (RFC §8.2 rev 0.45, ratified inventory): top to bottom —
  Undo · Redo · divider · Trash… · Restore · End Session · divider ·
  Switch world… · Settings · Help/About · Export…. AI-IMP-293 moves
  this unchanged menu from the rail into the title strip and makes the
  native project chooser the switching door. Undo/Redo print their
  shortcuts, so the menu remains self-teaching while disabled.
-->
<script lang="ts">
  import HelpAboutDialog from './HelpAboutDialog.svelte'
  import RestoreDialog from './RestoreDialog.svelte'
  import { applyMenuCascade } from './menu-cascade'
  import { openTakeover } from './takeover'
  import { tooltip } from './tooltip'
  import { canRedo, canUndo, onUndoChanged, redo, undo } from '../undo/undo-store'
  import { requestSettingsIntent } from './settings-intent'
  import { toast } from './status'
  import { dismissOnOutside } from './dismissal-guard'

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
  let restoreOpen = $state(false)
  let switchingWorld = $state(false)

  async function switchWorld(): Promise<void> {
    if (switchingWorld) return
    switchingWorld = true
    onclose()
    try {
      const chosen = await window.ew.project.chooseDirectory('switch')
      if (!chosen) return
      if (!chosen.ok) {
        toast(chosen.message, { kind: 'error', surface: 'menu' })
        return
      }
      if (!chosen.openToken) {
        toast('That world could not be opened safely.', { kind: 'error', surface: 'menu' })
        return
      }
      await window.ew.snapshot.open(chosen.openToken)
    } finally {
      switchingWorld = false
    }
  }

  // §11.4 restore (AI-IMP-121): the row is live only when there is a
  // backup to restore FROM — snapshots turned on AND at least one commit
  // in history. Otherwise it stays visible but disabled, naming what
  // would enable it (§8.2 disabled-rows convention: visible, named,
  // explained). Resolved once when the menu opens.
  let restoreEnabled = $state(false)
  let restoreReason = $state('Restore from backup — checking for snapshots…')

  $effect(() => {
    let live = true
    void (async () => {
      try {
        const settings = await window.ew.project.query('getSettings')
        const mode =
          settings.ok && typeof settings.result === 'object' && settings.result !== null
            ? (settings.result as Record<string, unknown>)['snapshot_mode']
            : 'off'
        if (mode !== 'commit' && mode !== 'commit-push') {
          if (live) {
            restoreEnabled = false
            restoreReason =
              'Restore from backup — turn on Session snapshots in Settings to start recording backups'
          }
          return
        }
        const list = await window.ew.snapshot.list()
        if (!live) return
        if (list.length === 0) {
          restoreEnabled = false
          restoreReason = 'Restore from backup — no snapshots have been recorded yet'
        } else {
          restoreEnabled = true
          restoreReason = 'Restore a snapshot as a new project — your current project is untouched'
        }
      } catch {
        if (live) {
          restoreEnabled = false
          restoreReason = 'Restore from backup — snapshot history is unavailable'
        }
      }
    })()
    return () => {
      live = false
    }
  })

  $effect(() => {
    // AI-IMP-183 (M-24): consume Escape (capture + stopPropagation) so it
    // closes the menu without leaking to the canvas. Help/About and
    // Restore own Esc while open (their own capture handlers) — DECLINE to
    // them by returning without consuming.
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || helpOpen || restoreOpen) return
      event.stopPropagation()
      onclose()
    }
    window.addEventListener('keydown', onKeydown, true)
    return () => window.removeEventListener('keydown', onKeydown, true)
  })
</script>

<!-- §8.2 decision 06 (AI-IMP-167): the universal CASCADE — rows fade in
     staggered top-to-bottom on open, stamped once here. -->
<div
  class="menu"
  data-testid="rail-menu"
  role="menu"
  use:applyMenuCascade
  use:dismissOnOutside={{
    dismiss: onclose,
    exclude: () => helpOpen || restoreOpen
      ? [document.body]
      : [document.querySelector('[data-testid="charm-menu"]')],
  }}
>
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
    data-testid="menu-trash"
    use:tooltip={{ name: 'Trash — restore or permanently delete trashed records' }}
    onclick={() => {
      onclose()
      openTakeover('trash')
    }}
  >
    <span class="label">Trash…</span>
  </button>
  <button
    type="button"
    role="menuitem"
    class:deferred={!restoreEnabled}
    aria-disabled={!restoreEnabled}
    data-testid="menu-restore"
    use:tooltip={{ name: restoreReason }}
    onclick={() => {
      if (!restoreEnabled) return
      restoreOpen = true
    }}
  >
    <span class="label">Restore from backup…</span>
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
    data-testid="menu-switch-world"
    aria-disabled={switchingWorld}
    class:deferred={switchingWorld}
    onclick={() => void switchWorld()}
  >
    <span class="label">{switchingWorld ? 'Opening…' : 'Switch world…'}</span>
  </button>

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
    data-testid="menu-export"
    onclick={() => {
      onclose()
      requestSettingsIntent('export')
      openTakeover('settings')
    }}
  >
    <span class="label">Export…</span>
  </button>
</div>

{#if helpOpen}
  <!-- onCloseRail threads the rail-close (this popover's `onclose`) so the
       shortcuts link can dismiss the ☰ popover before the Settings
       takeover opens. AI-IMP-155. -->
  <HelpAboutDialog onclose={() => (helpOpen = false)} onCloseRail={onclose} />
{/if}

{#if restoreOpen}
  <RestoreDialog onclose={() => (restoreOpen = false)} />
{/if}

<style>
  .menu {
    position: absolute;
    top: calc(100% + 0.35rem);
    right: 0;
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
    /* The cascade fades to this resting opacity, so a disabled row
       lands dimmed, never at full (AI-IMP-167). */
    --row-rest-opacity: 0.45;
    cursor: default;
  }

  button.deferred:hover {
    background: transparent;
  }
</style>

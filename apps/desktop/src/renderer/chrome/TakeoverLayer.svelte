<!--
  Takeover host (RFC §8.2, AI-IMP-068): renders the active
  project-global view full-window ABOVE the chrome layer. Escape or
  the originating charm returns; the canvas camera is untouched by
  construction (this is DOM over the board, not a flight). While a
  takeover is open the engagement clock is held — chrome never
  fades under it. View content arrives with its own ticket (outline
  069, settings 074); this layer owns the cover, the sheet, and the
  mode discipline.
-->
<script lang="ts">
  import GalleryView from '../views/GalleryView.svelte'
  import OutlineView from '../views/OutlineView.svelte'
  import SettingsView from '../views/SettingsView.svelte'
  import TrashView from '../views/TrashView.svelte'
  import { holdEngagement } from './engagement'
  import { closeTakeover, onTakeoverChanged, type TakeoverKind } from './takeover'
  import { closeSearchPanel, searchPanelState } from './search'
  import { dismissOnOutside } from './dismissal-guard'
  import { contextMenuOpen } from '../menus/ContextMenu'

  let kind = $state<TakeoverKind | null>(null)
  let sheet = $state<HTMLElement | null>(null)

  $effect(() =>
    onTakeoverChanged((next) => {
      kind = next
      holdEngagement(next !== null)
    }),
  )

  // Focus moves to the sheet on open so keys stop landing in
  // whatever board surface (note editor, field) held focus below.
  $effect(() => {
    if (kind && sheet) sheet.focus()
  })

  $effect(() => {
    if (!kind) return
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeTakeover()
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  })

  // Search is the top layer even when focus has not reached its input yet.
  // Own that peel at the stable host mounted before every named view: an
  // underlying view's capture map must never see the same Escape first.
  function onLayeredEscape(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !searchPanelState() || contextMenuOpen()) return
    event.preventDefault()
    event.stopImmediatePropagation()
    closeSearchPanel()
  }

  const TITLES: Record<TakeoverKind, string> = {
    outline: 'Outline',
    settings: 'Settings',
    gallery: 'Gallery',
    trash: 'Trash',
  }
</script>

<svelte:window onkeydowncapture={onLayeredEscape} />

{#if kind}
  <div
    class="takeover"
    data-testid={`takeover-${kind}`}
    role="dialog"
    aria-label={TITLES[kind]}
  >
    <div
      class="sheet"
      class:inset={kind === 'settings'}
      bind:this={sheet}
      tabindex="-1"
      use:dismissOnOutside={{
        dismiss: closeTakeover,
        exclude: () => [
          document.querySelector('[data-testid="takeover-band"]'),
          document.querySelector('[data-testid="title-strip"]'),
          document.querySelector('[data-testid="charm-menu"]'),
          document.querySelector('[data-testid="toasts"]'),
        ],
      }}
    >
      <header class="sheet-header">
        <div class="sheet-title">
          <h1>{TITLES[kind]}</h1>
          {#if kind === 'settings'}
            <span data-testid="settings-commit-copy">Changes apply instantly · no save</span>
          {/if}
        </div>
        <button
          type="button"
          class="close"
          data-testid="takeover-close"
          onclick={() => closeTakeover()}
        >
          Esc
        </button>
      </header>
      <div class="sheet-body" data-testid="takeover-body">
        {#if kind === 'outline'}
          <OutlineView />
        {:else if kind === 'settings'}
          <SettingsView />
        {:else if kind === 'gallery'}
          <GalleryView />
        {:else if kind === 'trash'}
          <TrashView />
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* Above every board surface (charms 6, pin dot 7, note panels 8),
     below the chrome layer (10): the charm rail must stay reachable —
     the originating control is one of the two ways back (§8.2). The
     chrome layer hides its board-scoped children while a takeover is
     open. */
  .takeover {
    position: absolute;
    inset:
      calc(var(--ew-reserve-strip) + var(--ew-reserve-gutter))
      var(--ew-reserve-gutter)
      var(--ew-reserve-dock)
      var(--ew-reserve-gutter);
    /* rung: takeover (Z.takeover = 300). Was a pre-ladder 9 (one above
       the old panels-8); ported with the AI-IMP-161 inversion fix so
       takeovers stay above panels on the named ladder. */
    z-index: 300;
    display: flex;
    pointer-events: auto;
    background: var(--ew-scrim);
  }

  .sheet {
    flex: 1;
    display: flex;
    flex-direction: column;
    margin: 0;
    background: var(--ew-surface-overlay);
    color: var(--ew-text);
    outline: none;
  }

  /* §11.5: the settings sheet is translucent and inset so the real
     board stays visible at the edges and through it. */
  .sheet.inset {
    margin: 0.75rem;
    border: 1px solid var(--ew-border);
    border-radius: 10px;
    background: var(--ew-surface-subtle);
  }

  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.7rem 1rem;
    border-bottom: 1px solid var(--ew-border);
  }

  .sheet-header h1 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .sheet-title {
    display: flex;
    align-items: baseline;
    gap: 0.65rem;
  }

  .sheet-title span {
    color: var(--ew-text-subtle);
    font-size: 0.68rem;
  }

  .close {
    padding: 0.15rem 0.5rem;
    background: var(--ew-surface-raised);
    color: var(--ew-text-muted);
    border: 1px solid var(--ew-border-strong);
    border-radius: 4px;
    font-size: 0.7rem;
    cursor: pointer;
  }

  .sheet-body {
    flex: 1;
    overflow: auto;
    padding: 1rem;
  }
</style>

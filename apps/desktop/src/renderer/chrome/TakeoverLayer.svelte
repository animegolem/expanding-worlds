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
  import { holdEngagement } from './engagement'
  import { closeTakeover, onTakeoverChanged, type TakeoverKind } from './takeover'

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

  const TITLES: Record<TakeoverKind, string> = {
    outline: 'Outline',
    settings: 'Settings',
  }
</script>

{#if kind}
  <div class="takeover" data-testid={`takeover-${kind}`} role="dialog" aria-label={TITLES[kind]}>
    <div class="sheet" class:inset={kind === 'settings'} bind:this={sheet} tabindex="-1">
      <header class="sheet-header">
        <h1>{TITLES[kind]}</h1>
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
        <!-- AI-IMP-069 mounts the outline here; AI-IMP-074 settings. -->
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
    inset: 0;
    z-index: 9;
    display: flex;
    pointer-events: auto;
    background: rgba(12, 13, 16, 0.55);
  }

  .sheet {
    flex: 1;
    display: flex;
    flex-direction: column;
    margin: 0;
    background: rgba(23, 25, 29, 0.97);
    color: #dde3ea;
    outline: none;
  }

  /* §11.5: the settings sheet is translucent and inset so the real
     board stays visible at the edges and through it. */
  .sheet.inset {
    margin: 3rem 4rem;
    border: 1px solid #2e3138;
    border-radius: 10px;
    background: rgba(23, 25, 29, 0.82);
  }

  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.7rem 1rem;
    border-bottom: 1px solid #2e3138;
  }

  .sheet-header h1 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .close {
    padding: 0.15rem 0.5rem;
    background: #23262c;
    color: #9aa3ad;
    border: 1px solid #3a3e46;
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

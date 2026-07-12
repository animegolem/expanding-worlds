<!--
  Mode charm rail (RFC §8.2): vertical, upper-right — project ⧉ ·
  search ⌕ · graph ⊛ · gallery ⊞ · outline ▤ · menu ☰. Outline and
  the ☰ menu are live takeover entries (AI-IMP-068); charms whose
  views haven't shipped render disabled with a tooltip naming what
  is coming (⌕ activates with AI-IMP-073, ⧉/⊞ with EPIC-014, ⊛ with
  the graph epic). The §8.6 ongoing-condition ⚠ perch (AI-IMP-066)
  appends below the charm list only while a condition holds: no
  condition, no slot, no reserved space.
-->
<script lang="ts">
  import ConditionPanel from './ConditionPanel.svelte'
  import MenuPopover from './MenuPopover.svelte'
  import TextInput from '../ui/TextInput.svelte'
  import { PERCH_PULSE_MS } from './feel'
  import { onSearchPanelChanged, toggleSearchPanel } from './search'
  import { openSourcePanel } from './source-slot'
  import { onConditionsChanged, type Condition } from './status'
  import {
    activeTakeover,
    closeTakeover,
    onTakeoverChanged,
    toggleTakeover,
    type TakeoverKind,
  } from './takeover'
  import { tooltip } from './tooltip'

  let conditions = $state<readonly Condition[]>([])
  let panelOpen = $state(false)
  let menuOpen = $state(false)
  // §14.4 project menu (AI-IMP-091): single-project reality — no
  // project LIST yet, so the menu carries the deferred switch row
  // and the live open-as-source action, whose directory prompt is a
  // plain text field (NEVER <datalist> — it segfaults Electron under
  // hidden windows, AI-IMP-069; the 089 designation-prompt idiom).
  let projectOpen = $state(false)
  let sourceDirInput = $state('')
  let searchOpen = $state(false)
  let takeover = $state<TakeoverKind | null>(activeTakeover())
  $effect(() =>
    onConditionsChanged((next) => {
      conditions = next
      if (next.length === 0) panelOpen = false
    }),
  )
  $effect(() => onTakeoverChanged((kind) => (takeover = kind)))
  $effect(() => onSearchPanelChanged((state) => (searchOpen = state !== null)))

  type Charm = { id: string; glyph: string; name: string } & (
    | { state: 'deferred'; deferred: string }
    | { state: 'takeover'; kind: TakeoverKind }
    | { state: 'search' }
    | { state: 'menu' }
    | { state: 'project' }
  )

  const charms: Charm[] = [
    { id: 'project', glyph: '⧉', name: 'Project', state: 'project' },
    { id: 'search', glyph: '⌕', name: 'Search', state: 'search' },
    { id: 'graph', glyph: '⊛', name: 'Graph', state: 'deferred', deferred: 'arrives with the graph epic' },
    { id: 'gallery', glyph: '⊞', name: 'Gallery', state: 'takeover', kind: 'gallery' },
    { id: 'outline', glyph: '▤', name: 'Outline', state: 'takeover', kind: 'outline' },
    { id: 'menu', glyph: '☰', name: 'Menu', state: 'menu' },
  ]

  function confirmOpenSource(): void {
    const dir = sourceDirInput.trim()
    if (dir.length === 0) return
    openSourcePanel(dir)
    projectOpen = false
    sourceDirInput = ''
  }

  $effect(() => {
    if (!projectOpen) return
    // AI-IMP-183 (M-24): consume Escape (capture + stopPropagation) so it
    // closes the project popover without leaking to the canvas underneath.
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      projectOpen = false
    }
    window.addEventListener('keydown', onKeydown, true)
    return () => window.removeEventListener('keydown', onKeydown, true)
  })
</script>

<nav class="charm-rail" data-testid="charm-rail">
  {#each charms as charm (charm.id)}
    {#if charm.state === 'takeover'}
      <button
        type="button"
        class="charm"
        class:active={takeover === charm.kind}
        aria-pressed={takeover === charm.kind}
        data-testid={`charm-${charm.id}`}
        onclick={() => toggleTakeover(charm.kind)}
        use:tooltip={{ name: charm.name }}
      >
        {charm.glyph}
      </button>
    {:else if charm.state === 'search'}
      <!-- §8.3: panel physics anchored to this charm (the panel
           itself mounts with the tag panel in CanvasHost). -->
      <button
        type="button"
        class="charm"
        class:active={searchOpen}
        aria-pressed={searchOpen}
        data-testid={`charm-${charm.id}`}
        onclick={(event) => {
          // Mode switch, not a dead click: a charm press while a
          // takeover covers the board returns to the board first —
          // the panel must never open beneath the cover (§8.2).
          if (takeover !== null) closeTakeover()
          const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
          toggleSearchPanel({ x: rect.left, y: rect.top })
        }}
        use:tooltip={{ name: charm.name }}
      >
        {charm.glyph}
      </button>
    {:else if charm.state === 'project'}
      <!-- §14.4 rows offer switch + open as source; with one project
           there are no switch rows yet, so the two actions stand
           alone (switch deferred with the multi-project epic). -->
      <div class="menu-slot">
        <button
          type="button"
          class="charm"
          class:active={projectOpen}
          aria-expanded={projectOpen}
          data-testid={`charm-${charm.id}`}
          onclick={() => (projectOpen = !projectOpen)}
          use:tooltip={{ name: charm.name }}
        >
          {charm.glyph}
        </button>
        {#if projectOpen}
          <div class="project-menu" data-testid="project-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              class="row deferred"
              aria-disabled="true"
              data-testid="project-switch"
              use:tooltip={{ name: 'Switch project — arrives with the multi-project list' }}
            >
              Switch project…
            </button>
            <span class="row-label">Open as source…</span>
            <div class="source-prompt">
              <TextInput
                variant="standard"
                data-testid="project-source-dir-input"
                placeholder="/path/to/project"
                style="width: 13rem; font-size: 0.72rem;"
                bind:value={sourceDirInput}
                onkeydown={(event) => {
                  if (event.key === 'Enter') confirmOpenSource()
                }}
              />
              <button
                type="button"
                class="row"
                data-testid="project-source-dir-confirm"
                onclick={confirmOpenSource}
              >
                open
              </button>
            </div>
          </div>
        {/if}
      </div>
    {:else if charm.state === 'menu'}
      <div class="menu-slot">
        <button
          type="button"
          class="charm"
          class:active={menuOpen}
          aria-expanded={menuOpen}
          data-testid={`charm-${charm.id}`}
          onclick={() => (menuOpen = !menuOpen)}
          use:tooltip={{ name: charm.name }}
        >
          {charm.glyph}
        </button>
        {#if menuOpen}
          <MenuPopover onclose={() => (menuOpen = false)} />
        {/if}
      </div>
    {:else}
      <!-- aria-disabled, not disabled: a disabled button swallows the
           pointer events the deferred tooltip needs. -->
      <button
        type="button"
        class="charm deferred"
        aria-disabled="true"
        data-testid={`charm-${charm.id}`}
        use:tooltip={{ name: `${charm.name} — ${charm.deferred}` }}
      >
        {charm.glyph}
      </button>
    {/if}
  {/each}
  {#if conditions.length > 0}
    <!-- The perch mounts on arrival, so its CSS animation IS the
         single arrival pulse; further conditions join without one. -->
    <div class="perch-slot">
      <button
        type="button"
        class="charm perch"
        style={`--perch-pulse-ms: ${PERCH_PULSE_MS}ms`}
        data-testid="perch"
        aria-expanded={panelOpen}
        onclick={() => (panelOpen = !panelOpen)}
        use:tooltip={{ name: 'Ongoing issues' }}
      >
        ⚠
        {#if conditions.length > 1}
          <span class="count" data-testid="perch-count">{conditions.length}</span>
        {/if}
      </button>
      {#if panelOpen}
        <ConditionPanel {conditions} onclose={() => (panelOpen = false)} />
      {/if}
    </div>
  {/if}
</nav>

<style>
  .charm-rail {
    position: absolute;
    top: calc(var(--ew-reserve-strip) + var(--ew-reserve-gutter));
    right: calc((var(--ew-reserve-rail) - 2rem) / 2);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    pointer-events: auto;
  }

  .charm {
    width: 2rem;
    height: 2rem;
    display: grid;
    place-items: center;
    font-size: 1rem;
    background: var(--ew-surface-rail);
    color: var(--ew-text);
    border: 1px solid var(--ew-border);
    border-radius: 7px;
    cursor: pointer;
  }

  .charm.deferred {
    opacity: 0.45;
    cursor: default;
  }

  .charm.active {
    background: var(--ew-accent);
    border-color: var(--ew-accent);
    color: var(--ew-on-accent);
  }

  .menu-slot,
  .perch-slot {
    position: relative;
  }

  /* §14.4 project menu: the ☰ popover's grammar (MenuPopover),
     anchored to its own charm. */
  .project-menu {
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

  .project-menu .row {
    padding: 0.25rem 0.6rem;
    text-align: left;
    background: transparent;
    color: var(--ew-text);
    border: none;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .project-menu .row:hover {
    background: var(--ew-surface-raised);
  }

  .project-menu .row.deferred {
    opacity: 0.45;
    cursor: default;
  }

  .project-menu .row.deferred:hover {
    background: transparent;
  }

  .row-label {
    padding: 0.25rem 0.6rem 0;
    font-size: 0.75rem;
    color: var(--ew-text-muted);
  }

  .source-prompt {
    display: flex;
    gap: 0.25rem;
    padding: 0.1rem 0.35rem 0.2rem;
  }

  .source-prompt .row {
    border: 1px solid var(--ew-border-strong);
    background: var(--ew-surface-raised);
  }

  .charm.perch {
    position: relative;
    color: var(--ew-warn);
    border-color: var(--ew-warn-border);
    animation: perch-pulse var(--perch-pulse-ms) ease-out 1;
  }

  .count {
    position: absolute;
    top: -0.3rem;
    right: -0.3rem;
    min-width: 0.9rem;
    height: 0.9rem;
    padding: 0 0.15rem;
    display: grid;
    place-items: center;
    background: var(--ew-danger);
    color: var(--ew-on-danger);
    border-radius: 0.45rem;
    font-size: 0.6rem;
    line-height: 1;
  }

  @keyframes perch-pulse {
    0% {
      transform: scale(0.6);
      box-shadow: 0 0 0 0 var(--ew-warn-pulse);
    }
    45% {
      transform: scale(1.18);
    }
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 10px var(--ew-warn-pulse-fade);
    }
  }
</style>

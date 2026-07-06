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
  import { PERCH_PULSE_MS } from './feel'
  import { onSearchPanelChanged, toggleSearchPanel } from './search'
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
  )

  const charms: Charm[] = [
    {
      id: 'project',
      glyph: '⧉',
      name: 'Project',
      state: 'deferred',
      deferred: 'arrives with the library (EPIC-014)',
    },
    { id: 'search', glyph: '⌕', name: 'Search', state: 'search' },
    { id: 'graph', glyph: '⊛', name: 'Graph', state: 'deferred', deferred: 'arrives with the graph epic' },
    { id: 'gallery', glyph: '⊞', name: 'Gallery', state: 'takeover', kind: 'gallery' },
    { id: 'outline', glyph: '▤', name: 'Outline', state: 'takeover', kind: 'outline' },
    { id: 'menu', glyph: '☰', name: 'Menu', state: 'menu' },
  ]
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
    top: 2.4rem;
    right: 0.6rem;
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

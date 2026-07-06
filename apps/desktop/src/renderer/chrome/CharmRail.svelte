<!--
  Mode charm rail (RFC §8.2): vertical, upper-right — project ⧉ ·
  search ⌕ · graph ⊛ · gallery ⊞ · outline ▤ · menu ☰. The global
  takeover views are EPIC-013/014 scope; until they ship, their charms
  render disabled with a tooltip naming what is coming — the rail's
  geometry and cadence are this ticket's deliverable. The §8.6
  ongoing-condition ⚠ perch (AI-IMP-066) appends below the charm
  list only while a condition holds: no condition, no slot, no
  reserved space.
-->
<script lang="ts">
  import ConditionPanel from './ConditionPanel.svelte'
  import { PERCH_PULSE_MS } from './feel'
  import { onConditionsChanged, type Condition } from './status'
  import { tooltip } from './tooltip'

  let conditions = $state<readonly Condition[]>([])
  let panelOpen = $state(false)
  $effect(() =>
    onConditionsChanged((next) => {
      conditions = next
      if (next.length === 0) panelOpen = false
    }),
  )

  const charms: Array<{ id: string; glyph: string; name: string; deferred: string }> = [
    { id: 'project', glyph: '⧉', name: 'Project', deferred: 'arrives with the library (EPIC-014)' },
    { id: 'search', glyph: '⌕', name: 'Search', deferred: 'arrives with global views (EPIC-013)' },
    { id: 'graph', glyph: '⊛', name: 'Graph', deferred: 'arrives with the graph epic' },
    { id: 'gallery', glyph: '⊞', name: 'Gallery', deferred: 'arrives with the library (EPIC-014)' },
    { id: 'outline', glyph: '▤', name: 'Outline', deferred: 'arrives with global views (EPIC-013)' },
    { id: 'menu', glyph: '☰', name: 'Menu', deferred: 'arrives with export and settings' },
  ]
</script>

<nav class="charm-rail" data-testid="charm-rail">
  {#each charms as charm (charm.id)}
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
    background: rgba(23, 25, 29, 0.88);
    color: #dde3ea;
    border: 1px solid #2e3138;
    border-radius: 7px;
    cursor: pointer;
  }

  .charm.deferred {
    opacity: 0.45;
    cursor: default;
  }

  .perch-slot {
    position: relative;
  }

  .charm.perch {
    position: relative;
    color: #e6b34a;
    border-color: #6b5426;
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
    background: #b3403a;
    color: #fff;
    border-radius: 0.45rem;
    font-size: 0.6rem;
    line-height: 1;
  }

  @keyframes perch-pulse {
    0% {
      transform: scale(0.6);
      box-shadow: 0 0 0 0 rgba(230, 179, 74, 0.7);
    }
    45% {
      transform: scale(1.18);
    }
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 10px rgba(230, 179, 74, 0);
    }
  }
</style>

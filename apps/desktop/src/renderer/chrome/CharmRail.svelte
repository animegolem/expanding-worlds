<!--
  Mode charm rail (RFC §8.2): vertical, upper-right — project ⧉ ·
  search ⌕ · graph ⊛ · gallery ⊞ · outline ▤ · menu ☰. The global
  takeover views are EPIC-013/014 scope; until they ship, their charms
  render disabled with a tooltip naming what is coming — the rail's
  geometry and cadence are this ticket's deliverable. The §8.6
  ongoing-condition ⚠ charm appends below when AI-IMP-066 ships.
-->
<script lang="ts">
  import { tooltip } from './tooltip'

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
</style>

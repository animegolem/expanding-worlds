<!--
  Detail panel for the §8.6 perch: anchored to the ⚠ charm, lists each
  ongoing condition's detail text. Closes on Esc or click-away; the
  charm itself stays for as long as any condition holds.
-->
<script lang="ts">
  import type { Condition } from './status'

  const {
    conditions,
    onclose,
  }: { conditions: readonly Condition[]; onclose: () => void } = $props()

  let panel = $state<HTMLElement | null>(null)

  function onWindowPointerDown(event: PointerEvent): void {
    const target = event.target as Element | null
    if (panel?.contains(target as Node)) return
    // The perch's own click toggles the panel; don't double-close.
    if (target?.closest?.('[data-testid="perch"]')) return
    onclose()
  }

  function onWindowKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') onclose()
  }
</script>

<svelte:window onpointerdowncapture={onWindowPointerDown} onkeydowncapture={onWindowKeyDown} />

<div class="condition-panel" data-testid="perch-panel" bind:this={panel}>
  <ul>
    {#each conditions as condition (condition.id)}
      <li data-testid="perch-condition">{condition.detail}</li>
    {/each}
  </ul>
</div>

<style>
  .condition-panel {
    position: absolute;
    top: 0;
    right: calc(100% + 0.5rem);
    min-width: 15rem;
    max-width: 22rem;
    padding: 0.5rem 0.65rem;
    background: var(--ew-surface-menu);
    color: var(--ew-text);
    border: 1px solid var(--ew-border-panel);
    border-radius: 7px;
    font-size: 0.82rem;
    pointer-events: auto;
    z-index: 30;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  li {
    display: flex;
    gap: 0.4rem;
  }

  li::before {
    content: '⚠';
    color: var(--ew-warn);
  }
</style>

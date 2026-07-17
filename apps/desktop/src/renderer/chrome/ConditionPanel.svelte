<!--
  Detail panel for the §8.6 perch: anchored to the ⚠ charm, lists each
  ongoing condition's detail text. Closes on Esc or click-away; the
  charm itself stays for as long as any condition holds.
-->
<script lang="ts">
  import { dismissCondition, type Condition } from './status'
  import { dismissOnOutside } from './dismissal-guard'

  const {
    conditions,
    onclose,
  }: { conditions: readonly Condition[]; onclose: () => void } = $props()

  function onWindowKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') onclose()
  }
</script>

<svelte:window onkeydowncapture={onWindowKeyDown} />

<div
  class="condition-panel"
  data-testid="perch-panel"
  use:dismissOnOutside={{
    dismiss: onclose,
    exclude: () => [document.querySelector('[data-testid="perch"]')],
  }}
>
  <ul>
    {#each conditions as condition (condition.id)}
      <li data-testid="perch-condition">
        <span>{condition.detail}</span>
        {#if condition.action}
          <button
            type="button"
            class="condition-action"
            data-testid={condition.action.testid}
            onclick={() => {
              condition.action?.run()
              onclose()
            }}
          >{condition.action.label}</button>
        {/if}
        {#if condition.dismissible}
          <button
            type="button"
            class="condition-dismiss"
            aria-label="Dismiss condition"
            data-testid={`dismiss-${condition.id}`}
            onclick={() => dismissCondition(condition.id)}
          >×</button>
        {/if}
      </li>
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

  .condition-action,
  .condition-dismiss {
    border: 0;
    background: transparent;
    color: var(--ew-accent);
    font: inherit;
    cursor: pointer;
  }

  .condition-dismiss { margin-left: auto; color: var(--ew-text-muted); }

  li::before {
    content: '⚠';
    color: var(--ew-warn);
  }
</style>

<script lang="ts">
  import { normalizeStep, stepFromKey, stepFromWheel, stepValue } from './stepper-state'
  let { value = $bindable(0), min, max, step = 1, disabled = false, oncommit }: {
    value?: number; min?: number; max?: number; step?: number; disabled?: boolean; oncommit?: (value: number) => void
  } = $props()
  let text = $state(String(value))
  const options = $derived({ min, max, step })
  function commit(next: number): void { value = normalizeStep(next, options); text = String(value); oncommit?.(value) }
  function nudge(direction: -1 | 1): void { commit(stepValue(value, direction, options)) }
  function commitText(): void { const parsed = Number(text); if (Number.isFinite(parsed)) commit(parsed); else text = String(value) }
</script>

<div class="stepper" class:disabled>
  <button type="button" aria-label="Decrease" {disabled} onclick={() => nudge(-1)}>−</button>
  <input type="text" inputmode="decimal" bind:value={text} {disabled} onblur={commitText}
    onkeydown={(event) => { const direction = stepFromKey(event.key); if (direction) { event.preventDefault(); nudge(direction) } else if (event.key === 'Enter') commitText() }}
    onwheel={(event) => { if (document.activeElement !== event.currentTarget) return; const direction = stepFromWheel(event.deltaY); if (direction) { event.preventDefault(); nudge(direction) } }} />
  <button type="button" aria-label="Increase" {disabled} onclick={() => nudge(1)}>＋</button>
</div>

<style>
  .stepper { display:inline-grid; grid-template-columns:auto minmax(3.5rem, 1fr) auto; border:1px solid var(--ew-border-control); border-radius:5px; overflow:hidden; }
  button, input { min-height:28px; border:0; background:var(--ew-surface-raised); color:var(--ew-text); font:inherit; }
  button { min-width:28px; cursor:pointer; }
  input { width:100%; box-sizing:border-box; text-align:center; background:var(--ew-surface-input); }
  button:focus-visible, input:focus-visible { outline:2px solid var(--ew-focus-ring); outline-offset:-2px; }
  button:disabled, input:disabled, .disabled { opacity:.4; cursor:default; }
  :global(:root[data-density='comfortable']) button { min-width:44px; min-height:44px; }
</style>

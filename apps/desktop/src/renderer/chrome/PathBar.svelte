<!--
  The path (RFC §8.1, AI-IMP-060): upper-left, rendering the entry
  route — visually a file path, semantically the back-stack. ⌂ at its
  head; crumb click returns to that entry with viewport restored;
  ‹ › are hover-revealed affordances for mouse users (gestures and
  Mod+[/] are the primary controls — no permanent buttons).
-->
<script lang="ts">
  import {
    back,
    canGoBack,
    canGoForward,
    forward,
    goToIndex,
    home,
    onNavigationChanged,
    pathEntries,
    type NavEntry,
  } from './navigation'
  import { tooltip } from './tooltip'

  let crumbs = $state<ReadonlyArray<NavEntry>>(pathEntries())
  let backOk = $state(canGoBack())
  let forwardOk = $state(canGoForward())

  $effect(() =>
    onNavigationChanged(() => {
      crumbs = pathEntries()
      backOk = canGoBack()
      forwardOk = canGoForward()
    }),
  )
</script>

<nav class="path-bar" data-testid="path-bar">
  <button
    type="button"
    class="home"
    data-testid="nav-home"
    onclick={() => void home()}
    use:tooltip={{ name: 'Home — the root board' }}
  >
    ⌂
  </button>
  <span class="arrows">
    <button
      type="button"
      data-testid="nav-back"
      disabled={!backOk}
      onclick={() => void back()}
      use:tooltip={{ name: 'Back', shortcut: '⌘[' }}
    >
      ‹
    </button>
    <button
      type="button"
      data-testid="nav-forward"
      disabled={!forwardOk}
      onclick={() => void forward()}
      use:tooltip={{ name: 'Forward', shortcut: '⌘]' }}
    >
      ›
    </button>
  </span>
  {#each crumbs as crumb, index (index)}
    {#if index > 0}
      <span class="sep">/</span>
    {/if}
    <button
      type="button"
      class="crumb"
      class:current={index === crumbs.length - 1}
      data-testid={`nav-crumb-${index}`}
      onclick={() => void goToIndex(index)}
      use:tooltip={{ name: index === crumbs.length - 1 ? crumb.label : `Back to ${crumb.label}` }}
    >
      {crumb.label}
    </button>
  {/each}
</nav>

<style>
  .path-bar {
    position: absolute;
    top: 0.55rem;
    left: 0.6rem;
    display: flex;
    align-items: center;
    gap: 0.15rem;
    padding: 0.15rem 0.3rem;
    background: rgba(23, 25, 29, 0.82);
    border: 1px solid #2e3138;
    border-radius: 7px;
    font-size: 0.75rem;
    color: #dde3ea;
    pointer-events: auto;
    max-width: 46vw;
    overflow: hidden;
  }

  button {
    padding: 0.1rem 0.4rem;
    background: transparent;
    color: #dde3ea;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
  }

  button:hover {
    background: #2a2e35;
  }

  /* Hover-revealed, never permanent (§8.1). Playwright still clicks
     them: opacity does not gate hit-testing. */
  .arrows {
    display: flex;
    opacity: 0;
    transition: opacity 120ms ease-out;
  }

  .path-bar:hover .arrows {
    opacity: 1;
  }

  .arrows button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .crumb.current {
    color: #8ec2f5;
  }

  .sep {
    opacity: 0.4;
  }
</style>

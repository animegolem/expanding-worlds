<!--
  The path (RFC §8.1, AI-IMP-060): upper-left, rendering the entry
  route — visually a file path, semantically the back-stack. ⌂ at its
  head; crumb click returns to that entry with viewport restored;
  ‹ › are hover-revealed affordances for mouse users (gestures and
  Mod+[/] are the primary controls — no permanent buttons).

  AI-IMP-061 adds the bookmark control at the path's tail: a map pin
  with a generous hit target that morphs into a teardrop while it
  anchors the one bookmark menu, plus the global Mod+1–9 jump
  bindings (resolved by current row order at press time; pins mean
  places).
-->
<script lang="ts">
  import type { CanvasHostHandle } from '../canvas/host'
  import BookmarkMenu from './BookmarkMenu.svelte'
  import { jumpToBookmarkIndex } from './bookmarks'
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
  import { takeoverActive } from './takeover'
  import { tooltip } from './tooltip'

  const { handle }: { handle: CanvasHostHandle } = $props()

  let crumbs = $state<ReadonlyArray<NavEntry>>(pathEntries())
  let backOk = $state(canGoBack())
  let forwardOk = $state(canGoForward())
  let menuOpen = $state(false)

  $effect(() =>
    onNavigationChanged(() => {
      crumbs = pathEntries()
      backOk = canGoBack()
      forwardOk = canGoForward()
    }),
  )

  // Mod+1–9 jump to the nth bookmark BY CURRENT ROW ORDER at press
  // time (§8.1: row order IS the binding). Global, so it works with
  // the menu closed; editable targets keep their digits.
  $effect(() => {
    const onKeydown = (event: KeyboardEvent): void => {
      if (takeoverActive()) return
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      if (event.key < '1' || event.key > '9') return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      )
        return
      event.preventDefault()
      void jumpToBookmarkIndex(handle, Number(event.key) - 1)
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  })
</script>

<div class="path-wrap">
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
    <button
      type="button"
      class="pin"
      class:open={menuOpen}
      aria-label="Bookmarks"
      data-testid="bookmark-pin"
      onclick={() => (menuOpen = !menuOpen)}
      use:tooltip={{ name: 'Bookmarks', shortcut: '⌘1–9' }}
    >
      <span class="pin-shape" aria-hidden="true"></span>
    </button>
  </nav>
  {#if menuOpen}
    <BookmarkMenu {handle} onClose={() => (menuOpen = false)} />
  {/if}
</div>

<style>
  .path-wrap {
    position: absolute;
    top: 0.55rem;
    left: 0.6rem;
    max-width: 46vw;
    /* Room for the tail-anchored menu: its right edge lands at
       max(bar width, 15rem), so it never leaves the window even when
       the path is short. The bar itself stays fit-content. */
    min-width: 15rem;
    pointer-events: none;
  }

  .path-bar {
    width: fit-content;
    display: flex;
    align-items: center;
    gap: 0.15rem;
    padding: 0.15rem 0.3rem;
    background: var(--ew-surface-subtle);
    border: 1px solid var(--ew-border);
    border-radius: 7px;
    font-size: 0.75rem;
    color: var(--ew-text);
    pointer-events: auto;
    overflow: hidden;
  }

  button {
    padding: 0.1rem 0.4rem;
    background: transparent;
    color: var(--ew-text);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
  }

  button:hover {
    background: var(--ew-surface-hover);
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
    color: var(--ew-accent-soft);
  }

  .sep {
    opacity: 0.4;
  }

  /* §8.1: a small map pin with a generous hit target at the tail. */
  .pin {
    display: inline-grid;
    place-items: center;
    min-width: 1.6rem;
    min-height: 1.3rem;
    margin-left: 0.15rem;
  }

  /* The pin body: a circle whose zeroed corner makes the teardrop
     point. Closed it reads as an outline map pin; pressed it fills
     and points at the menu it anchors. */
  .pin-shape {
    width: 9px;
    height: 9px;
    border: 1.5px solid var(--ew-text);
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg) translateY(-1px);
    transition:
      background 120ms ease-out,
      transform 120ms ease-out;
  }

  .pin.open .pin-shape {
    background: var(--ew-accent-soft);
    border-color: var(--ew-accent-soft);
    transform: rotate(-45deg) translateY(1px);
  }
</style>

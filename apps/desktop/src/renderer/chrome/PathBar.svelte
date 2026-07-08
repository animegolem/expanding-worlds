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

  AI-IMP-166 makes this the SIGNATURE SPOT (RFC §8.2 rev 0.64): the flat
  teardrop becomes the canonical pin (silhouette iv, PinGlyph) — the ONE
  colored element in the mono chrome — and clicking it plays the bookmark
  BEAT, the one sanctioned chrome→world crossover. The pin phase machine
  drives it: rest → beat (the pin wiggles/hops/presses/settles once) →
  open (the menu sweeps in with the universal cascade) → closing (a plain
  opacity fade — the ceremony is for arrival) → rest. The whole beat stays
  inside the title-strip band.
-->
<script lang="ts">
  import type { CanvasHostHandle } from '../canvas/host'
  import { KEY } from '../keys/bindings'
  import { formatBinding, matches } from '../keys/registry'
  import { EW_PIN_BEAT_MS, EW_PIN_MENU_FADE_MS } from './beats'
  import BookmarkMenu from './BookmarkMenu.svelte'
  import PinGlyph from './PinGlyph.svelte'
  import { bookmarkCurrentBoard, jumpToBookmarkIndex } from './bookmarks'
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

  // AI-IMP-191: mac clears the in-board traffic lights the same way
  // TitleStrip does (trafficLightPosition x:14) — one shared inset so
  // the signature spot (⌂ + name + pin) never sits cramped against them.
  const isMac = (window.ew?.window?.platform ?? 'darwin') === 'darwin'

  let crumbs = $state<ReadonlyArray<NavEntry>>(pathEntries())
  let backOk = $state(canGoBack())
  let forwardOk = $state(canGoForward())

  // The pin phase machine (RFC §8.2 rev 0.64, AI-IMP-166). The menu is
  // visible only once the beat has PLAYED — the pin settles exactly once
  // before the menu sweeps in (the ratified prototype's arrival ceremony).
  type PinPhase = 'rest' | 'beat' | 'open' | 'closing'
  let pinPhase = $state<PinPhase>('rest')
  const menuVisible = $derived(pinPhase === 'open' || pinPhase === 'closing')
  let beatTimer: ReturnType<typeof setTimeout> | undefined
  let fadeTimer: ReturnType<typeof setTimeout> | undefined

  function startBeat(): void {
    pinPhase = 'beat'
    // The menu opens on the pin's animationend (below). A safety net in
    // case that event is ever missed (an interrupted animation) keeps the
    // menu from stranding closed — it never fires under a normal beat.
    clearTimeout(beatTimer)
    beatTimer = setTimeout(() => {
      if (pinPhase === 'beat') pinPhase = 'open'
    }, EW_PIN_BEAT_MS + 200)
  }

  function onPinBeatEnd(): void {
    if (pinPhase !== 'beat') return
    clearTimeout(beatTimer)
    // The beat ended at the identity frame (reseated exactly); the menu
    // now sweeps in with the universal cascade.
    pinPhase = 'open'
  }

  function closeMenu(): void {
    // Close only from the open menu — clicking mid-beat lets the beat
    // finish (the prototype's close() no-ops off 'open'). Unpin is a plain
    // opacity fade in BookmarkMenu; we unmount when it lands.
    if (pinPhase !== 'open') return
    pinPhase = 'closing'
    clearTimeout(fadeTimer)
    fadeTimer = setTimeout(() => {
      pinPhase = 'rest'
    }, EW_PIN_MENU_FADE_MS)
  }

  function togglePin(): void {
    if (pinPhase === 'rest') startBeat()
    else closeMenu()
  }

  $effect(() => () => {
    clearTimeout(beatTimer)
    clearTimeout(fadeTimer)
  })

  $effect(() =>
    onNavigationChanged(() => {
      crumbs = pathEntries()
      backOk = canGoBack()
      forwardOk = canGoForward()
    }),
  )

  // Mod+1–9 jump to the nth bookmark BY CURRENT ROW ORDER at press
  // time (§8.1: row order IS the binding), and Mod+D bookmarks the
  // current board (§8.1, rev 0.48 — the ＋ row's twin). Global, so
  // both work with the menu closed; editable targets keep their keys.
  $effect(() => {
    const onKeydown = (event: KeyboardEvent): void => {
      if (takeoverActive()) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      )
        return
      if (matches(event, KEY.bookmarkCurrent)) {
        event.preventDefault()
        void bookmarkCurrentBoard(handle)
        return
      }
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      if (event.key < '1' || event.key > '9') return
      event.preventDefault()
      void jumpToBookmarkIndex(handle, Number(event.key) - 1)
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  })
</script>

<div class="path-wrap" class:mac={isMac}>
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
        use:tooltip={{ name: 'Back', shortcut: formatBinding(KEY.navBack) }}
      >
        ‹
      </button>
      <button
        type="button"
        data-testid="nav-forward"
        disabled={!forwardOk}
        onclick={() => void forward()}
        use:tooltip={{ name: 'Forward', shortcut: formatBinding(KEY.navForward) }}
      >
        ›
      </button>
    </span>
    {#each crumbs as crumb, index (index)}
      {#if index > 0}
        <span class="sep">▸</span>
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
    <!-- The signature spot: the canonical pin, bare at cap-height beside
         the board name (§8.2 rev 0.64). no-drag carves it out of the
         strip's drag region (AI-IMP-165), or the OS eats the click as a
         window move. The beat animates the glyph (its transform-origin is
         the tip); the button box is fixed by min-size, so the generous hit
         target never shrinks and the pin reseats at its exact box. -->
    <button
      type="button"
      class="pin no-drag"
      class:open={menuVisible}
      aria-label="Bookmarks"
      data-testid="bookmark-pin"
      onclick={togglePin}
      use:tooltip={{ name: 'Bookmarks', shortcut: formatBinding(KEY.bookmarkJump) }}
    >
      <span
        class="pin-glyph-wrap"
        class:ew-pin-beat={pinPhase === 'beat'}
        style={`animation-duration:${EW_PIN_BEAT_MS}ms`}
        data-testid="bookmark-pin-glyph"
        onanimationend={onPinBeatEnd}
      >
        <PinGlyph />
      </span>
    </button>
  </nav>
  {#if menuVisible}
    <BookmarkMenu {handle} closing={pinPhase === 'closing'} onClose={closeMenu} />
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
    /* §8.2 decision-01: the signature spot (⌂ + name + pin) is the ONE
       thing always shown at the traffic-light corner — it must read
       above TitleStrip's smoky hover gradient (z-index 3), not be
       painted over by it, or the reveal hides the very text it exists
       to frame. */
    z-index: 4;
  }

  /* AI-IMP-165 seats the macOS traffic lights in-board at x:14; AI-IMP-191
     gives the path the same 5rem clearance TitleStrip already validated
     for its own content, so the two never read as cramped against each
     other. Non-mac platforms keep the tight default (no in-board lights). */
  .path-wrap.mac {
    left: 5rem;
  }

  .path-bar {
    width: fit-content;
    display: flex;
    align-items: center;
    gap: 0.15rem;
    padding: 0.15rem 0.3rem;
    /* AI-IMP-191: no pill — decision-01 wants bare path text at the
       traffic-light corner, not a chip. The hover-revealed strip
       gradient underneath is what carries legibility, same as the
       ratified prototype. */
    font-size: 0.75rem;
    color: var(--ew-text);
    pointer-events: auto;
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

  /* §8.1/§8.2: the canonical pin at the tail, a generous hit target that
     never shrinks (min-size fixes the box; the glyph animates within it). */
  .pin {
    display: inline-grid;
    place-items: center;
    min-width: 1.6rem;
    min-height: 1.3rem;
    margin-left: 0.15rem;
    padding: 0;
  }

  .pin:hover {
    background: transparent;
  }

  /* The glyph wrapper is what the BEAT animates (chrome/pin-beat.css adds
     .ew-pin-beat with the tip transform-origin). Left bare here so its
     resting box — and thus the reseat target — is the pin at identity. */
  .pin-glyph-wrap {
    display: block;
    line-height: 0;
  }

  /* Open state: a whisper of settle into the board, opacity only (the pin
     has entered the canvas and the menu it anchors is up). */
  .pin.open .pin-glyph-wrap {
    opacity: 0.9;
  }
</style>

<!--
  First-run walkthrough (AI-IMP-145, EPIC-019 public face).

  A takeover-family overlay: the board stays visible but dimmed behind
  a scrim, a paper card centered on top, the ratified copy in the paper
  voice (Maple Mono via --ew-font-editor, the sanctioned carve-out from
  AI-IMP-131). Seven pages, dot progress, `skip` on every page and
  `next ›` / `start ›` grammar. Shows once on the true first open
  (chrome/first-run.ts owns the app-tier seen flag); the engagement
  clock is held while it is open, exactly as real takeovers do.
-->
<script lang="ts">
  import { onMount } from 'svelte'
  import { holdEngagement } from './engagement'
  import { FIRST_RUN_PAGES } from './first-run-copy'
  import {
    onFirstRunChanged,
    shouldShowFirstRun,
    showFirstRun,
    skipFirstRun,
    startFirstRun,
  } from './first-run'

  let visible = $state(false)
  let pageIndex = $state(0)
  let pick = $state<string | null>(null)
  let card = $state<HTMLElement | null>(null)

  const page = $derived(FIRST_RUN_PAGES[pageIndex]!)
  const lastIndex = FIRST_RUN_PAGES.length - 1
  const onLastPage = $derived(pageIndex === lastIndex)

  $effect(() => onFirstRunChanged((next) => (visible = next)))

  // A fresh open resets to page one — the replay action re-shows the
  // whole arc, never a mid-walkthrough remnant.
  $effect(() => {
    if (visible) {
      pageIndex = 0
      pick = null
    }
  })

  // Hold the shared fade clock while open (§8.2): the chrome under the
  // guide never fades, and releasing resumes the normal cadence.
  $effect(() => {
    holdEngagement(visible)
  })

  // Move focus onto the card so keys stop landing on the board below.
  $effect(() => {
    if (visible && card) card.focus()
  })

  // True first open only: the seen flag gates it, so a returning user
  // never sees it unbidden.
  onMount(() => {
    void shouldShowFirstRun().then((show) => {
      if (show) showFirstRun()
    })
  })

  function next(): void {
    if (pageIndex < lastIndex) pageIndex += 1
  }
</script>

{#if visible}
  <div class="first-run" data-testid="first-run-guide">
    <div
      class="card"
      data-testid="first-run-card"
      bind:this={card}
      tabindex="-1"
      role="dialog"
      aria-label="Welcome"
    >
      <h2 class="title" data-testid="first-run-title">{page.title}</h2>
      {#if page.body}
        <p class="body" data-testid="first-run-body">{page.body}</p>
      {/if}

      {#if page.picks}
        <div class="picks" role="group" aria-label="What do you plan to make?">
          {#each page.picks as choice (choice.id)}
            <button
              type="button"
              class="pick"
              class:selected={pick === choice.id}
              data-testid={`first-run-pick-${choice.id}`}
              aria-pressed={pick === choice.id}
              onclick={() => (pick = pick === choice.id ? null : choice.id)}
            >
              {choice.label}
            </button>
          {/each}
        </div>
      {/if}
      {#if page.footnote}
        <p class="footnote" data-testid="first-run-footnote">{page.footnote}</p>
      {/if}

      <div class="footer">
        <div class="dots" data-testid="first-run-dots" aria-hidden="true">
          {#each FIRST_RUN_PAGES as _page, index (index)}
            <span class="dot" class:active={index === pageIndex} data-active={index === pageIndex}
            ></span>
          {/each}
        </div>
        <span class="spacer"></span>
        <button
          type="button"
          class="link skip"
          data-testid="first-run-skip"
          onclick={() => void skipFirstRun()}
        >
          skip
        </button>
        {#if onLastPage}
          <button
            type="button"
            class="link go"
            data-testid="first-run-start"
            onclick={() => void startFirstRun(pick)}
          >
            start ›
          </button>
        {:else}
          <button type="button" class="link go" data-testid="first-run-next" onclick={next}>
            next ›
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* Above every board surface and the chrome layer (10): the guide is
     a first-open modal that covers the whole window. Dims the board
     behind with the shared scrim; the board stays visible, never
     replaced. */
  .first-run {
    position: absolute;
    inset: 0;
    z-index: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ew-scrim);
    pointer-events: auto;
  }

  /* The sanctioned paper voice: paper surface, paper border, Maple
     Mono throughout. Theme-aware for free — the paper-* tokens invert
     on glass. */
  .card {
    width: min(22rem, calc(100% - 3rem));
    box-sizing: border-box;
    padding: 1rem 1.1rem 0.85rem;
    background: var(--ew-paper-page);
    border: 1px solid var(--ew-paper-border-strong);
    border-radius: 8px;
    box-shadow: var(--ew-drag-shadow);
    color: var(--ew-paper-text);
    font-family: var(--ew-font-editor);
    outline: none;
  }

  .title {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--ew-paper-text-strong);
  }

  .body {
    margin: 0.55rem 0 0;
    font-size: 0.8rem;
    line-height: 1.7;
    color: var(--ew-paper-text);
  }

  .picks {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-top: 0.7rem;
  }

  .pick {
    padding: 0.4rem 0.6rem;
    text-align: left;
    font: inherit;
    font-size: 0.8rem;
    color: var(--ew-paper-text);
    background: var(--ew-paper-page);
    border: 1px solid var(--ew-paper-border);
    border-radius: 5px;
    cursor: pointer;
  }

  .pick:hover {
    background: var(--ew-paper-hover);
  }

  .pick.selected {
    border-color: var(--ew-paper-info-border);
    background: var(--ew-paper-info-panel);
    color: var(--ew-paper-info-text);
  }

  .footnote {
    margin: 0.7rem 0 0;
    font-size: 0.7rem;
    color: var(--ew-paper-text-muted);
  }

  .footer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.9rem;
  }

  .dots {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--ew-paper-border-strong);
  }

  /* Active dot in the paper accent (§ dot progress). */
  .dot.active {
    background: var(--ew-paper-info-text);
  }

  .spacer {
    flex: 1;
  }

  .link {
    padding: 0.15rem 0.35rem;
    font: inherit;
    font-size: 0.75rem;
    background: transparent;
    border: none;
    cursor: pointer;
  }

  .link.skip {
    color: var(--ew-paper-text-muted);
  }

  .link.go {
    color: var(--ew-paper-info-text);
    font-weight: 600;
  }

  .link:hover {
    text-decoration: underline;
  }
</style>

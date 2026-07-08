---
node_id: AI-IMP-203
tags:
  - IMP-LIST
  - Implementation
  - onboarding
  - polish
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.9
date_created: 2026-07-08
---


# AI-IMP-203-first-run-guide-previous-button

## Summary of Issue #1

First alph field report (2026-07-08, Discord): the first-run guide
carousel (AI-IMP-160) offers only "skip" and "next ›" — he wanted
to page BACK to reread an earlier card and couldn't ("previous
button needed 🙏"). He also said the guide content itself landed
("maybe I wouldn't have felt like shit yesterday if I knew I had
this to play with the entire time") — so the guide earns a real
back control. Done means the guide has a previous affordance
symmetric with next, disabled/hidden on the first card, keyboard
arrows page both ways, and the dot indicators reflect position as
they do today.

### Out of Scope

- Guide card content/copy (unchanged).
- Making the dots clickable (nice-to-have; note it if trivial in
  the same seam, otherwise leave).

### Design/Approach

Find the guide component from AI-IMP-160 (first-run guide,
takeoverActive() integration). Add "‹ previous" mirroring the
existing "next ›" styling — same type treatment, leading position
in the footer row (skip stays where it is unless the row demands
rebalancing; keep the change minimal). First card: previous is
absent or visibly inert — pick whichever the existing kit idiom
supports and state the choice. Wire ArrowLeft/ArrowRight while the
guide is up (it already holds takeover focus, so no canvas
collision — verify against the Escape-routing rules from
AI-IMP-183).

### Files to Touch

The first-run guide component (`apps/desktop` renderer, wherever
160 put it) + its spec. E2e: page forward twice, back once, assert
card index and dots; ArrowLeft/ArrowRight equivalents.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Previous control renders, styled to match next, correct
      first-card behavior. Choice: visible-but-`disabled` on the
      first card (the kit's disabled-rows idiom — PathBar's
      back/forward `disabled` + 0.35 opacity, MenuPopover's §8.2
      visible-named-disabled rows), not hidden.
- [x] Keyboard left/right page the guide both ways (card-scoped
      keydown; the card already holds takeover focus).
- [x] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e (unit 1325 passing across 7 packages; e2e 214/214 in two
      foreground shards).
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** the first-run guide open past the first card
**WHEN** the user clicks "‹ previous" or presses ArrowLeft
**THEN** the guide steps back one card and the dot indicator
follows — and on the first card no backward affordance invites a
dead click.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- First-card choice: previous stays RENDERED but `disabled` (0.35
  opacity, no hover underline) rather than absent — the footer row
  never reflows between cards, and it matches PathBar's back/forward
  and the §8.2 disabled-rows convention. A dead click on it is
  swallowed by the native `disabled` attribute.
- Keyboard wiring is a keydown handler ON THE CARD (which already
  takes focus via the existing `$effect`), not a window listener —
  arrows never exist outside the guide's focus scope, so no
  interaction with the AI-IMP-183 Escape-routing surfaces. The guide
  has no Escape handling today and this ticket adds none.
- `stopPropagation` on the handled arrows so takeover-layer or
  future window-level arrow bindings never double-handle a paged
  key. `disabled` on prev also means Enter/Space can't re-trigger
  it on card 1.
- Placement: `spacer` pushes the whole action cluster right, so
  "leading position in the footer row" = first button after the
  spacer (‹ previous · skip · next ›), mirroring next's `.link.go`
  type treatment.
- Dots clickable: trivially reachable in the same seam (each dot
  span would take an `onclick={() => (pageIndex = index)}` and a
  button role) but explicitly out of scope — not built.
- Validation ran as sequential foreground shards after an initial
  `pnpm -r test` was auto-backgrounded (apps/desktop's `test`
  script chains the full playwright suite): per-package vitest
  (58+1+18+538+380+1+329 = 1325 passed), `pnpm lint` clean, e2e
  split `e2e/[a-i]` = 100/100 and `e2e/[j-z]` = 114/114 (globs
  verified via `--list` to cover all 59 specs / 214 tests exactly
  once; 2.8m and 3.5m, hidden windows via playwright.config).

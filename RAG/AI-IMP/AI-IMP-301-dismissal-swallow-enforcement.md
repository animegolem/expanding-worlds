---
node_id: AI-IMP-301
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - input-grammar
  - feel-pass
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-030-the-ratified-law-wave]]
confidence_score: 0.8
date_created: 2026-07-16
date_completed:
---

# AI-IMP-301-dismissal-swallow-enforcement

## Summary of Issue #1

RFC rev 0.73 §8.8.6 ratifies the dismissal swallow as app-wide law
(kit-1.6 ruling 42, generalizing AI-IMP-215's board-menu
precedent): any outside-click that dismisses an anchored or
floating surface — board menu, flyouts, pickers, anchored panels,
takeovers — is SWALLOWED and never also acts on what lies beneath.
The v0.25.0 feel pass convicted two live violations: (a) takeovers
with visible board margin leave that margin LIVE — the owner
opened canvas materials beneath a lens — and click-away does not
dismiss non-fullscreen takeovers at all (a GR-2 exit violation);
(b) the shape flyout dismisses on window `pointerup` while the
board receives the preceding `pointerdown` (Dock.svelte:311–329),
so a dismissing click can act beneath. Done means: one shared
swallow mechanism; every dismissing outside-click across the
surface inventory provably changes nothing beneath (scene census,
selection, camera, active tool, decorations identical); takeovers
dismiss on click-out.

### Out of Scope

Ruling 40's chrome migration (AI-IMP-302); any new surfaces; the
promise ledger's cosign; touch-specific gestures.

### Design/Approach

Diagnosis above is HYPOTHESIS until the round-1 review verifies it
against current source (mandatory pre-implementation review).
Approach: a single dismissal-guard helper in the chrome layer —
when a dismissal is armed (any anchored/floating surface open with
outside-dismiss semantics), the dismissing pointer sequence is
captured at `pointerdown` (capture phase, chrome root) and the
pair (down+up+click) is consumed before the canvas host sees it.
Prefer extending the existing AI-IMP-215 swallow seam rather than
a second mechanism — one law, one helper. Takeover click-out:
visible board margin around an inset takeover becomes a dismiss
region (dismiss + swallow), matching §8.2 close semantics (✕ /
esc / click-out). Inventory to cover: board menu (already
swallows — verify), shape flyout, font picker, color picker,
arrange ⌗ / restyle ◧ panels, ground HERE menu, ☰ popover,
identity ◎ panel, takeovers (outline · gallery · search ·
settings), bookmark menu.

### Files to Touch

`apps/desktop/src/renderer/chrome/Dock.svelte`: flyout dismissal
moves onto the shared swallow seam.
`apps/desktop/src/renderer/chrome/ChromeLayer.svelte` (or the
AI-IMP-215 seam's home): the shared dismissal-guard.
`apps/desktop/src/renderer/chrome/takeover.ts` + takeover hosts:
click-out dismiss region + swallow.
`apps/desktop/src/renderer/canvas/host.ts`: verify no direct
listeners bypass the guard (review may relocate the capture).
`apps/desktop/test/e2e/*`: swallow assertions per inventory row.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Round-1 review: verify the diagnosis against source (flyout
      pointerup path; takeover margin liveness; the 215 swallow
      seam's exact mechanism); record corrections in this ticket
      before any code.
- [ ] Implement/extend ONE shared dismissal-guard; no per-surface
      copies.
- [ ] Wire the full inventory above onto it; takeovers gain
      click-out dismiss + swallow.
- [ ] e2e: for shape flyout and one takeover — open surface,
      pointer-down on a placement beneath, assert dismissal AND
      board state unchanged (scene census, selection, camera,
      active tool, decorations) — the DOCK-FLY-08 evidence recipe.
- [ ] e2e: dismissing click on empty ground creates nothing and
      arms nothing.
- [ ] Unit: guard consumes down+up+click as a sequence, not click
      alone.
- [ ] Evidence bundle: before/after captures keyed to DOCK-FLY-08.

### Acceptance Criteria

**Scenario:** A lens (takeover) is open over a board with
placements in the visible margin.
**GIVEN** a board with a placement under the takeover's margin.
**WHEN** the user clicks that margin.
**THEN** the takeover dismisses.
**AND** the placement is not selected, opened, or otherwise acted
on; scene census, selection, camera, and active tool are
byte-identical.

**Scenario:** The shape flyout is open and the user clicks the
board beneath.
**WHEN** pointer-down lands on a placement beneath the flyout.
**THEN** the flyout closes and the board state is unchanged.

### Issues Encountered

<!--
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

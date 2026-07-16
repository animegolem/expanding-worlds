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

- [x] Round-1 review: verify the diagnosis against source (flyout
      pointerup path; takeover margin liveness; the 215 swallow
      seam's exact mechanism); record corrections in this ticket
      before any code.
- [x] Implement/extend ONE shared dismissal-guard; no per-surface
      copies.
- [x] Wire the full inventory above onto it; takeovers gain
      click-out dismiss + swallow.
- [x] e2e: for shape flyout and one takeover — open surface,
      pointer-down on a placement beneath, assert dismissal AND
      board state unchanged (scene census, selection, camera,
      active tool, decorations) — the DOCK-FLY-08 evidence recipe.
- [x] e2e: dismissing click on empty ground creates nothing and
      arms nothing.
- [x] Unit: guard consumes down+up+click as a sequence, not click
      alone.
- [x] Evidence bundle: before/after captures keyed to DOCK-FLY-08.

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

#### Round-1 source verification (2026-07-16)

- The two reported failures are source-convicted. The shape flyout closes
  from a window-capture `pointerup` after the canvas has already received
  `pointerdown` (`renderer/chrome/Dock.svelte:311-329`). The takeover root
  itself is inset to frame + gutter
  (`renderer/chrome/TakeoverLayer.svelte:94-108`), so the visible board
  outside that root remains a live canvas
  target and there is no takeover click-away listener.
- The proposed reusable AI-IMP-215 seam does not yet exist. Its implementation
  is local to `ContextMenu`: only a board-kind menu dismissed by a direct
  `CANVAS` target stops the capture-phase `pointerdown`
  (`renderer/menus/ContextMenu.ts:147-152`). It neither owns the matching
  `pointerup`/`click` nor serves other surfaces.
- `ChromeLayer` cannot be the capture root described above. `ChromeLayer`,
  `NotePanels`, and `TakeoverLayer` are sibling mounts
  (`renderer/CanvasHost.svelte:155-160`), and the chrome root itself has
  `pointer-events:none` (`renderer/chrome/ChromeLayer.svelte:105-115`). A
  shared guard that must beat canvas capture listeners therefore belongs at
  document/window capture and needs a topmost-surface registry, not one copy
  per component.
- The live outside-dismiss inventory is broader and less uniform than the
  ticket text: `ColorPicker` (`renderer/ui/ColorPicker.svelte:17`), the
  condition panel (`renderer/chrome/ConditionPanel.svelte:16-29`), identity
  (`renderer/chrome/IdentityCorner.svelte:126-151`), and arrange/restyle
  (`renderer/canvas/charms-ui.ts:933-948`) all close without swallowing.
  Conversely, the title-menu popover and bookmark menu currently have no
  click-away path (`renderer/chrome/TitleStrip.svelte:162-184`;
  `renderer/chrome/BookmarkMenu.svelte:46-63`). Search already owns a full
  scrim which receives and closes on the outside click
  (`renderer/chrome/SearchPalette.svelte:320,368-370`). The app-wide law
  governs a click that *does* dismiss; it does not by itself invent
  click-away semantics for explicit-close surfaces such as TagPanel.
- Focused repair scope: one document-capture dismissal registry consumes the
  complete `pointerdown` -> matching `pointerup` -> `click` sequence by
  pointer id; migrate every existing or normatively required click-away
  surface, add the takeover margin as a dismiss region, and regression-pin
  both canvas state and topmost-surface ordering. Inventory additions beyond
  an existing/kit-required click-away remain out of scope.

#### Implementation and validation (2026-07-16)

- Added one document-capture topmost-surface registry. A dismissing primary
  pointer consumes its down, matching up, and click even when dismissal
  synchronously unmounts the final registered surface. Secondary presses
  remain available to open a replacement context menu.
- Migrated the ticket inventory plus the four review-discovered surfaces.
  Explicit-close-only panels remain explicit-close-only. The Help/Restore
  modal children suspend their parent menu guard so the parent cannot steal
  the modal's first press.
- The existing arrange test initially failed because it expected one board
  click to both close the still-open arrange popover and clear selection.
  That expectation violated the newly ratified law. It now pins the lawful
  sequence: first click dismisses with selection unchanged; the second click
  reaches the board.
- The later full gates found the same stale click-through premise in both
  existing decorations flows. Switching sibling pickers, extending selection,
  and starting a resize now explicitly close the active picker/panel first;
  the original edit assertions remain intact
  (`e2e/decorations.spec.ts:403-437,582-621`). Focused reruns passed 2/2.
- The complete e2e gate found two bookmark-degradation cases issuing Home
  immediately after Escape while BookmarkMenu was still mounted for its
  closing fade. The guard correctly swallowed Home as the menu's outside
  dismissal gesture. Both cases now await the menu's completed dismissal
  before issuing the independent Home action (`e2e/navigation.spec.ts:392-405,
  449-457`), preserving the bookmark assertions without restoring
  click-through.
- The §17 slice likewise issued Zoom-to-fit while Arrange remained the
  topmost surface after a distribute command. The test now closes and awaits
  Arrange before the independent zoom gesture (`e2e/slice.spec.ts:350-372`);
  the camera/content-command assertions are unchanged.
- Evidence manifest entry `DOCK-FLY-08`: `e2e/shell.spec.ts` captures and
  compares scene census, selection, camera, active tool, and decorations for
  placement-backed shape-flyout and inset-takeover dismissals;
  `e2e/board-tooling.spec.ts` captures scene/tool state for empty-ground menu
  dismissal. Focused validation: build green; guard unit 3/3; shell e2e 7/7;
  board-menu e2e 1/1; corrected arrange regression 1/1.
- Round-2 Linux evidence reported the note-body undo test flaky once and green
  on its traced retry. No guard key handler exists and the retry showed the
  structural route behaving correctly; the unreliable seam was the test's
  coordinate click as a proxy for leaving editor focus. The test now uses the
  already-established Select-button focus seam and asserts the non-typing
  precondition before Mod+Z, preserving the keyboard behavior under test.

---
node_id: AI-IMP-135
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - notes
  - undo
kanban_status: planned
depends_on: [AI-IMP-134]
parent_epic: [[AI-EPIC-023-paper-note-lifecycle]]
confidence_score: 0.55
date_created: 2026-07-07
date_completed:
---


# AI-IMP-135-lifecycle-transitions-and-beats

## Summary of Issue #1

EPIC-023 FR-2. Rev 0.55 §8.5: the lifecycle is freely reversible
with one undoable command per transition, and the hardware +
shadow tell the state. Done means: book —tear→ sticky (tape +
torn edge, viewport-fixed, shadow, ~300ms one-shot beat); sticky
—untape→ book (tear reversed, ~200ms); sticky —place→ landmark
(existing place-on-board, now KEEPING the torn edge and wearing
the push pin, flat); landmark —pull pin→ sticky; landmark
—dismiss→ page returns to its book. Double-click on the bound
page tears it to a CENTERED editor over the dimmed board (the
big-editor moment reskinned as the torn-out page at modal rung,
scroll inside the page, esc/click-off tucks it home). Each
transition is one undo entry; mid-flight anything wears
`--ew-drag-shadow`.

### Out of Scope

- New persistence: sticky/pinned state stays presentation state as
  today; the landmark stays the card-appearance placement (§4.6).
  The torn-edge fact rides note presentation state (settings-table
  pattern), NO migration.
- Fancy paper physics; beats are the ratified one-shots only.
- The book-cover-open beat (musing, queued).

### Design/Approach

Transitions map onto the EXISTING command/presentation seams:
tear = pin (presentation flip + beat), untape = unpin,
place = place-on-board (compound: placement + torn-edge
presentation fact, one undo group via `runAsUndoGroup`),
pull-pin = the rev 0.55 REVERSAL — a compound that removes the
placement and restores the sticky (placement delete + presentation
flip, one group; §9 impact rules apply if the placement is the
node's last — surface the standard confirm). Landmark rendering:
the card body gains the torn-edge + push-pin chrome variant
(canvas-engine card renderer consumes 130's tokens + a PushPin
bake or vector draw). Beats: EW_BEAT_TEAR_MS/etc. from 130,
one-shot CSS animation on the DOM panel (world beat budget);
NEVER looping; reduced-motion respected if the app has a
convention (check; else note). The centered tear reuses the big
editor's overlay slot with the paper chrome; scroll containment
verified. §8.5 indicator table consistency: the bound page's
on-screen row ("the tail is the attribution") updates to "the
binding is the attribution" — RFC touch-up rides this ticket's
close, flagged for the lead.

### Files to Touch

`apps/desktop/src/renderer/note/NotePanel.svelte`, `panels.ts`,
`note/paper/*`: sticky + landmark variants, transitions, beats.
`apps/desktop/src/renderer/note/open-note.ts` (fly/home chip
seams as needed).
`packages/canvas-engine/src/renderers/placement.ts` (+ test):
card body torn-edge/pin variant behind a presentation flag.
`apps/desktop/e2e/note-lifecycle.spec.ts`: extend — full cycle
book→sticky→landmark→sticky→book with one undo per step walking
back; centered tear + esc tuck.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Tear/untape: presentation flips with beats, tape + torn
      edge persist on the sticky, shadow only while
      floating/viewport-fixed.
- [ ] Place → landmark: torn edge + push pin on the card, flat,
      one undo group.
- [ ] Pull pin / dismiss: reversal compounds, §9 confirm when
      applicable, one undo each; e2e walks the full cycle.
- [ ] Centered tear: modal-rung page over dimmed board, scroll
      inside, esc/click-off tucks home (~200ms reverse beat).
- [ ] Beats one-shot (no loops — guard or review), constants from
      130.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (playful
      vs twee; tear timing; pull-pin discoverability).

### Acceptance Criteria

**GIVEN** a bound page
**WHEN** pinned, placed, pin-pulled, and untaped in sequence
**THEN** each state wears its hardware (rings/tape/pin), each
transition is one Mod+Z step, and the full walk returns to the
original bound page.
**GIVEN** a double-click on the page
**THEN** it tears to center over the dimmed board, scrolls
internally, and esc tucks it back.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

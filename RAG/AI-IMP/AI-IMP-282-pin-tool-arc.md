---
node_id: AI-IMP-282
tags:
  - IMP-LIST
  - Implementation
  - renderer
  - tools
  - lifecycle-push
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.85
date_created: 2026-07-11
---

# AI-IMP-282-pin-tool-arc

## Summary of Issue #1

S3+S1 (ratified, lifecycles-1.1 → "S3+S1 The Pin Tool" — THE
NORMATIVE SPEC; GR-2 rung 7 behind it): the pin tool becomes the
model sticky tool, and the whole sticky family (pin, text, draw,
frame) gains its exits. The shipped model is right (provisional dot
without a domain record, phantom panel, first committed edit fires
one CreatePin, discard = nothing ever existed); the arc breaks at
its edges — verified holes: no Escape for the dot, tool-switch
strands a live phantom, rapid clicks strand a dot-less phantom
(pin-tool.ts placeDot replaces the dot only), and the provisional
is a generic 12px circle while the signature pass ratified the
canonical pin. Done means: (1) the PROVISIONAL WEARS THE CANONICAL
PIN — silhouette iv as a ghost at 45% opacity, tip on the click
point; commit seats it with one 180ms press to full opacity (no
wiggle/hop — that ceremony stays exclusive to the signature spot);
discard is a plain fade; the generic dot retires. (2) ONE
PROVISIONAL AT A TIME — dot and phantom are born, discarded, and
replaced together; a state where one exists without the other is a
defect by definition. (3) EVERY LEAVE CLEANS, silently: Escape
(rung 7 → back to select), tool switch, dock click, shortcut
re-press — all discard the pair; cleanup is the tool's job, not
the panel store's side effect. (4) The family speaks rung 7: every
sticky tool's tooltip carries the exit clause ("Pin N · esc
returns to select"); the lit dock charm is the visible exit.
(5) A FAILED CreatePin keeps its scaffolding: the phantom holds
the draft and speaks a GR-1-form inline sentence ("this pin didn't
take — try again"); the ghost waits.

### Out of Scope

- The signature spot / bookmark beat (shipped; ceremony
  exclusivity is a constraint here, not work).
- Text/draw tool internals beyond the rung-7 exit + tooltip
  clause (R4 is drawn once on the pin; the family inherits).
- Dock redesign (the kit pass; the existing lit-charm exit is
  the affordance this ticket names).

### Design/Approach

pin-tool.ts owns the pair lifecycle: one provisional record
{ghost, phantomId} with create/replace/discard as single
operations; tool-mode.ts's escape() gains the rung-7 return-to-
select when nothing inner is present (verify against the shipped
ladder order, host.ts ~:1862-1882); tool-switch and re-arm paths
route through the same discard. The ghost renders the canonical
pin asset (`pin-canonical.svg` from the signature pass — confirm
its shipped location in round 1; it must not be re-derived) at
45%, seat = 180ms opacity/scale press per the beat ledger's
constants. Failure sentence uses the GR-1 quiet-sentence form
inside the phantom.

### Files to Touch

- `apps/desktop/src/renderer/canvas/pin-tool.ts` (pair lifecycle)
- `apps/desktop/src/renderer/canvas/tool-mode.ts` (rung 7)
- ghost rendering (round 1 locates the provisional-dot draw path)
- sticky-tool tooltip specs (exit clause)
- e2e: replace-not-strand (rapid clicks), tool-switch cleanup,
  Escape rung 7, ghost→seat visual state via test seam, failed
  CreatePin keeps draft + sentence.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Provisional pair is one lifecycle object; rapid clicks
      REPLACE (old pair discarded whole); no dot-less phantom
      reachable (pinned by test).
- [ ] Escape with nothing inner returns to select and discards
      the pair; tool switch / dock click / N re-press identical;
      all silent (GR-3 class 7).
- [ ] Ghost = canonical pin at 45%, tip on click point; 180ms
      seat on commit; plain fade on discard; generic dot removed.
- [ ] Sticky family tooltips carry the exit clause.
- [ ] CreatePin failure: phantom + draft + inline sentence
      survive; ghost waits.
- [ ] Full `CI=true pnpm check` green (pipefail, counts read);
      CHANGELOG [Unreleased]; HUMAN-TESTING entry (the feel of
      ghost/seat and the one-provisional rule).

### Acceptance Criteria

**GIVEN** the pin tool armed with a live ghost+phantom
**WHEN** the user clicks elsewhere / switches tools / presses
Escape
**THEN** the pair is replaced / discarded / discarded
respectively, atomically, with nothing stranded

**GIVEN** a CreatePin that fails
**WHEN** the command returns its error
**THEN** the phantom keeps the user's words and states the
failure inline; the ghost remains until the user leaves.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

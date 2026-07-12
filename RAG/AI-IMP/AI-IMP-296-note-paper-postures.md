---
node_id: AI-IMP-296
tags:
  - IMP-LIST
  - Implementation
  - notes
  - paper
  - design-adoption
kanban_status: planned
depends_on: []
parent_epic: [[AI-EPIC-029-the-kit-adoption-push]]
confidence_score: 0.7
date_created: 2026-07-12
date_completed:
---

# AI-IMP-296-note-paper-postures

## Summary of Issue #1

The shipped note panels use a non-bound presentation the kit never
drew — AI-IMP-194 stalled on exactly this. The Note Paper kit
(letter rulings 8–9) now rules it: HARDWARE LAW — rings = bound
beside the image · push pin (angled, punching through, meridian
head) = planted in the world · tape (top-center, translucent) = on
your glass · torn edge on the side the page separated from; verbs
ride a whisper strip on the paper (nothing chrome-colored on the
page); origin as paper-toned caption. OPEN IS A FLIGHT: ✎ flies
the camera until image + page fill the viewport; esc flies back
exactly; bound-beside pages share the image's EXACT height at
every viewport. Detach = pin-to-world (full board-object grammar);
tape-to-glass kept for travel; rebind = one verb, one undo, from
any posture. Supersedes AI-IMP-194. Done means: the four postures
render per the hardware law, open-as-flight works with exact
camera restore, posture transitions are single undo steps with
their ledger beats, 194 closed by pointer.

### Out of Scope

- The big editor's polish items (whisper strip source⇄rendered
  toggle etc.) — separate concern; the kit's centered-editor
  posture is a recorded kit debt, not this ticket.
- The caption plaque (AI-IMP-297).
- New note domain semantics: postures map to EXISTING attachment/
  presentation states (round-1 maps them; any gap is flagged, not
  invented).

### Design/Approach

Round-1 must first map the kit's four postures onto the shipped
panel states (bound / pinned-to-world / floating panel) and record
the mapping — the kit's tape-to-glass corresponds to today's
floating panel, bound to the beside-image presentation, pinned to
the placed sticky. Rendering: paper tokens + hardware elements
(ring strip, PinGlyph with meridian head, tape, torn edge) per the
kit DC; whisper strip hosts the §8.5 verbs. Flight: reuse the
camera-flight machinery (canvas-engine/camera-flight.ts) with a
fit target of image + page (the §8.8 clause-5 band-aware fit);
store the pre-flight camera for exact esc restore. Height law:
bound page's layout binds to the image's rendered height. Posture
transitions call existing detach/pin/attach commands as one undo
group each with tear/settle/flight beats from the ledger.

### Files to Touch

`apps/desktop/src/renderer/note/NotePanel.svelte` + panels
  machinery (`note/` — round-1 enumerates): posture rendering,
  whisper strip.
`packages/canvas-engine/src/camera-flight.ts`: fit-to-image+page
  target (if not expressible with the existing API).
`apps/desktop/src/renderer/chrome/beats.ts`: tear/settle wiring
  if not present.
`RAG/AI-IMP/AI-IMP-194-note-paper-shape.md`: close with pointer.
e2e: posture transitions + flight/restore spec.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Round-1: map kit postures → shipped states; verify the
      flight machinery's restore fidelity and the §8.5 verb
      inventory; record the mapping + corrections here.
- [ ] Four postures render per the hardware law (rings / pin with
      meridian head / tape / torn edge on the separation side);
      paper tokens; whisper strip verbs; origin caption
      paper-toned.
- [ ] ✎ flight: camera flies until image + page fill the viewport
      (band-aware fit); esc flies back to the EXACT prior camera;
      flight is silent (camera answers, GR-3).
- [ ] Bound-beside page shares the image's exact rendered height
      across viewport sizes (test at two window sizes).
- [ ] Detach→pin-to-world, tape-to-glass, and rebind: one verb,
      one undo group, one ledger beat each; rebind works from any
      posture.
- [ ] AI-IMP-194's cancelled-with-pointer record still matches
      what shipped; append any delta there.
- [ ] Unit + e2e green; full local gate green with counts read.

### Acceptance Criteria

**Scenario:** reading flight and back.
**GIVEN** a bound note beside a placed image at an arbitrary camera
**WHEN** the user hits ✎ and then esc
**THEN** the camera flies to fit image + page, and esc restores
the starting camera exactly (position and zoom)
**AND** no toast plays for either leg.
**Scenario:** posture round-trip.
**GIVEN** a bound note
**WHEN** the user detaches to world, tapes to glass, then rebinds
**THEN** each transition is one undo step with its named beat and
the final state is bound again.

### Issues Encountered


---
node_id: AI-IMP-296
tags:
  - IMP-LIST
  - Implementation
  - notes
  - paper
  - design-adoption
kanban_status: completed
depends_on: []
parent_epic: [[AI-EPIC-029-the-kit-adoption-push]]
confidence_score: 0.7
date_created: 2026-07-12
date_completed: 2026-07-13
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
bound page's layout binds to the image's rendered height. Durable
posture transitions retain their existing command and undo boundaries.
The shipped tear/rebind presentation transitions remain settings-backed
and outside project undo, with their existing local beats; reading
flight is likewise presentation-only.

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

- [x] Round-1: map kit postures → shipped states; verify the
      flight machinery's restore fidelity and the §8.5 verb
      inventory; record the mapping + corrections here.
- [x] Four postures render per the hardware law (rings / pin with
      meridian head / tape / torn edge on the separation side);
      paper tokens; whisper strip verbs; origin caption
      paper-toned.
- [x] ✎ flight: camera flies until image + page fill the viewport
      (band-aware fit); esc flies back to the EXACT prior camera;
      flight is silent (camera answers, GR-3).
- [x] Bound-beside page shares the image's exact rendered height
      across viewport sizes (test at two window sizes).
- [x] Durable posture changes retain their existing command/undo
      boundaries; tape-to-glass, rebind, and reading flight remain
      presentation-only and outside project undo; rebind works wherever
      the shipped state preserves its binding anchor.
- [x] AI-IMP-194's cancelled-with-pointer record still matches
      what shipped; append any delta there.
- [x] Unit + e2e green; full local gate green with counts read.

### Acceptance Criteria

**Scenario:** reading flight and back.
**GIVEN** a bound note beside a placed image at an arbitrary camera
**WHEN** the user hits ✎ and then esc
**THEN** the camera flies to fit image + page, and esc restores
the starting camera exactly (position and zoom)
**AND** no toast plays for either leg.
**Scenario:** posture round-trip.
**GIVEN** a bound note
**WHEN** the user tears it to glass and then rebinds
**THEN** the presentation transitions play their named local beats,
create no project-undo entries, and the final state is bound again.

### Round-1 source verification (2026-07-13)

The opening premise is stale: AI-IMP-135 already shipped the paper
hardware and most of the lifecycle. `NotePanel.svelte:224-235` records
the landmark fact after the real `PlaceAsCard`; `NotePanel.svelte:969-995`
implements tear/untape and their existing beats; and
`note/paper/bound-geometry.ts:59-69` already locks a side-bound page's
base height to the image height before both ride the same camera zoom.
The round-2 product delta is therefore the reading flight, the kit's
whisper-strip/origin treatment, a single rebind affordance, and stronger
two-viewport geometry coverage — not a four-posture rewrite.

| Kit posture | Shipped state / hardware | Current transition path | Undo truth |
| --- | --- | --- | --- |
| bound beside image | tethered placement panel; rings; exact shared edge | `unpinPanel` re-tethers (`note/panels.ts:363-375`) | presentation only |
| taped to glass | pinned `PanelRecord`; tape + torn edge | `pinPanel` / `unpinPanel` (`note/panels.ts:340-375`) | presentation only |
| planted in world | `PlaceAsCard` placement + project-setting landmark fact | place at `NotePanel.svelte:199-235`; pull at `note/panels.ts:410-444` | place/delete command is undoable; hardware fact is not |
| centered torn editor | shipped modal torn page | `NotePanel.svelte:1016-1025` and existing Escape close | presentation only |

**Verdict required before implementation:** the hard rule “every
posture transition is one undo group” conflicts with the source and the
same ticket's ban on invented domain semantics. The existing e2e says
this explicitly: tear leaves undo depth unchanged
(`e2e/note-lifecycle.spec.ts:210-231`), while only place and pull add
entries (`:233-263`). Round 2 must preserve that honest boundary unless
the lead separately authorizes new semantics/persistence/policy. Under
the current fence, “rebind from any posture” means one visible verb that
uses the existing presentation transition from taped/centered states;
the planted landmark still needs its existing undoable pull followed by
the presentation-only untape, so a literal one-step landmark-to-book
rebind is not implementable in-fence.

Round-1 ruling: the shipped durability boundary wins. Pin/tape and
centered-editor transitions remain presentation-only; no undo semantics
are invented. “One undo” applies only where durability already exists
(`PlaceAsCard` and landmark `DeleteContent`). Rebind is one visible verb
where the existing state permits it; the landmark keeps its honest
delete-then-untape lifecycle.

Camera restore is representable by `Camera.state()` / `Camera.set()`
(`packages/canvas-engine/src/camera.ts:49-57`) and the existing eased
`CameraFlight.flyTo(SceneCamera)` (`camera-flight.ts:21-43`), but the
public host exposes only bounds-based `flyTo` (`renderer/canvas/host.ts:
136-138,2128-2136`). Proposed in-fence repair: add a narrow host method
that flies to an exact `SceneCamera`, snapshot before the outbound fit,
and use that same eased seam for Escape restore; no camera or domain
semantics change.

The ticket may not edit AI-IMP-194: the assignment permits RAG changes
only in these five bodies. The lead owns the cancelled-pointer record.

### Issues Encountered

- The first reading-flight e2e used `__ewDebug.flightActive()`; the
  shipped observable is `__ewDebug.stage().flightActive`. Corrected before
  relying on the test; focused and full lifecycle reruns passed.
- The fresh isolated clone had no `spike/node_modules`. The product gate
  (including 273 e2e and lint) passed, then spike typecheck failed only on
  missing imports. `npm --prefix spike ci` restored the lockfile deps and
  the typecheck passed. No source repair was involved.
- Per the round-1 ruling, AI-IMP-194's pointer edit is lead-owned because
  this sitting may edit only the five assigned ticket bodies.

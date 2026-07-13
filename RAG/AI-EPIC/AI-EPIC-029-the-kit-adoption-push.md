---
node_id: AI-EPIC-029
tags:
  - EPIC
  - AI
  - design-adoption
  - chrome
  - ui-kit
date_created: 2026-07-12
date_completed:
kanban_status: in-progress
AI_IMP_spawned:
  - AI-IMP-286
  - AI-IMP-287
  - AI-IMP-288
  - AI-IMP-289
  - AI-IMP-290
  - AI-IMP-291
  - AI-IMP-292
  - AI-IMP-293
  - AI-IMP-294
  - AI-IMP-295
  - AI-IMP-296
  - AI-IMP-297
  - AI-IMP-298
  - AI-IMP-299
  - AI-IMP-300
---

# AI-EPIC-029-the-kit-adoption-push

## Problem Statement/Feature Scope

The app ships faster than its design language: the dock is a
beta-era surface with 11 native OS controls and ~22 word-button
rows, the board menu predates MenuPopover, search is an anchored
panel the design team has superseded, the rail carries species that
no longer belong there, and ratified invariants (reservation frame,
charm halo, lens grammar) have no code home. The 2026-07-12 kit
push (RFC rev 0.71) drew every one of these surfaces to final form.
This epic makes the shipped chrome match the ratified kit.

## Proposed Solution(s)

Adopt the kit family in four phases, foundations first:

**A — foundations.** The reservation frame and charm halo become
real tokens and shared positioning behavior (§8.8.3/§8.8.4); a
density token pair (desktop/touch) lands app-wide; the kit input
components (color picker, swatch row, picker-list, stepper) join
the ui/ library so every later phase can retire natives.

**B — the dock family.** The dock slims to the toolbelt + one
defaults row; the contextual word-button rows retire into the
selection charm bar's ⌗ arrange and ◧ restyle panels; the shape
tools consolidate into one slot with a hold flyout; the eyedropper
joins; every native control leaves.

**C — navigation chrome.** Board verbs move onto the board's crumb
(❖ MenuPopover, three doors incl. the ground menu's HERE section);
the rail recomposes to lens toggles + the ⚠ perch; search becomes
the centered two-door palette with fzf name-space matching and
drag-out-as-place; the identity corner ◎ opens the canvas's self.

**D — content surfaces.** Note paper adopts the posture family and
open-as-flight; the caption matures into the plaque with outline
row meta; the lens wires close (one lens, every surface); gallery
facets/action-bar and the settings sheet adopt kit components.

Normative sources: RFC rev 0.71 (§8.3, §8.8.3–4, §20 entry),
`RAG/design/expanding-worlds-design-package-1.2.zip` (DESIGN-LETTER
rulings 1–33, kit DC pages, GR-5), KIT-PREFLIGHT waiver terms.

## Path(s) Not Taken

- No iPad build: GR-5 dialect lands as tokens/synonyms only where
  cheap (density token, long-press menus); the port is V2.
- No command-palette merger: the 211 command family joining search
  is an open DESIGN-QUEUE conversation, not this epic.
- No gallery inspector (AI-IMP-204) — design still open.
- No caption FTS (deferred with scope, §4.5).
- No new domain records or migrations anticipated; if a ticket
  discovers a need, the lead reserves the number at that moment.

## Success Metrics

- Zero native `select`/`color`/`number`/`datalist` in renderer
  chrome (guard test enforces).
- The dock at rest is one row of tools; arming a tool shows at most
  one defaults row; no word-button strip ever renders.
- Every anchored surface clamps inside the reservation frame and
  pads selected nodes by halo (shared helper, unit-tested).
- Search opens centered from both doors; `dra cast` in tag mode
  resolves two pills; an image result drags onto the board.
- Full local gate green (persistence + desktop unit + e2e +
  canvas-engine) and the Windows oracle quoted before each merge.

## Requirements

### Functional Requirements

- [ ] FR-1: Reservation-frame band tokens (names normative) +
      shared clamp adoption + `showReservations` dev toggle +
      density token pair. (AI-IMP-286)
- [ ] FR-2: Charm-halo clearance in all node-anchored positioning.
      (AI-IMP-287)
- [ ] FR-3: Kit input components in ui/: ColorPicker, SwatchRow,
      PickerList, Stepper, uniform focus ring. (AI-IMP-288)
- [ ] FR-4: Dock rebuild — toolbelt, defaults row, contextual rows
      retired, eyedropper, stale sort-toggle fix. (AI-IMP-289)
- [ ] FR-5: One shape slot with hold flyout + Miro-baseline shape
      set. (AI-IMP-290, updates AI-IMP-190)
- [ ] FR-6: Selection charm-bar ⌗ arrange popover + ◧ restyle
      panel; align-center spread fix. (AI-IMP-291)
- [ ] FR-7: Board menu on the crumb (❖, MenuPopover, swatch row) +
      ground menu HERE section. (AI-IMP-292)
- [ ] FR-8: Rail recomposition — lens toggles only, ☰ to strip, ⚠
      perch at rail foot. (AI-IMP-293)
- [ ] FR-9: Centered search palette — two doors, kind-verb headers,
      tag pills, fzf name-space matcher, drag-out, G7 error/type
      fixes. (AI-IMP-294)
- [ ] FR-10: Identity corner ◎ panel. (AI-IMP-295)
- [ ] FR-11: Note-paper postures + open-as-flight. (AI-IMP-296)
- [ ] FR-12: Caption plaque + outline row meta. (AI-IMP-297)
- [ ] FR-13: Lens wires — tags-charm lens + placement hit ring +
      note-page chips as lens doors. (AI-IMP-298)
- [ ] FR-14: Gallery facets/action-bar kit adoption. (AI-IMP-299)
- [ ] FR-15: Settings sheet adoption incl. density segment.
      (AI-IMP-300)

### Non-Functional Requirements

- Every ticket's builder verifies its kit citations against
  `expanding-worlds-design-package-1.2.zip` in round-1 review
  before code; the kit's filled KIT-PREFLIGHT is the geometry
  authority; a kit without a filled preflight blocks its ticket
  (rev 0.71 waiver terms — flag to the lead, don't improvise).
- Motion only from the ledger's named beats; chrome fades on the
  one shared engagement clock.
- No SQLite CHECK-IN constraints for growable domains (standing).
- E2E hidden windows; `set -o pipefail`; counts read, not exit
  codes; `pnpm -r build` before desktop e2e.
- Perf floor unchanged: adoption must not add per-frame work on
  the board render path (charms/halo math is event-driven).

## Implementation Breakdown

Phase A (286→287→288) is interface-defining and lands first; 286
and 288 may run in parallel (token file vs ui/ components), 287
follows 286. Phase B (289→290→291) serializes after 288. Phase C
(292, 293, 295 parallelizable; 294 alone — largest) after A.
Phase D (296, 297, 298, 299, 300) after B/C merge; 297 depends on
296's paper family only at the styling seam. Superseded planned
tickets: 189→289, 194→296, 198→291, 207→293 (cancelled with
pointers); 190 updated in place; 208 completed by the kit push.

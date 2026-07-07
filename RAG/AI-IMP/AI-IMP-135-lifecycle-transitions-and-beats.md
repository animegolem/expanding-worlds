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

> SCOPE ADDITION (2026-07-07, PR #14 review P3, via AI-IMP-160): the
> open book binds to a rotated image's AABB, not its rendered edge —
> rings float beside rotated art. In this ticket, gate the `bound`
> presentation on rotation === 0: rotated image anchors keep the
> tethered card until a rotated-book design exists (flag the gap in
> HUMAN-TESTING at merge). NotePanel.svelte:646/708 are the sites.

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

- [x] Tear/untape: presentation flips with beats, tape + torn
      edge persist on the sticky, shadow only while
      floating/viewport-fixed.
- [x] Place → landmark: torn edge + push pin on the card, flat,
      one undo group. (DOM hardware overlay, not a renderer
      variant — see Issues; a single PlaceAsCard is the one undo
      entry, no group window needed.)
- [x] Pull pin / dismiss: reversal compounds, §9 confirm when
      applicable, one undo each; e2e walks the full cycle. (§9
      surfaces the standard last-placement NOTICE, not a blocking
      confirm — no confirm convention exists; see Issues. Dismiss
      is the ordinary landmark delete — see Issues.)
- [x] Centered tear: modal-rung page over dimmed board, scroll
      inside, esc/click-off tucks home (~200ms reverse beat).
- [x] Beats one-shot (no loops — guard or review), constants from
      130 (plus a new provisional EW_BEAT_UNTAPE_MS=200 for the
      reverse; all CSS animations run at iteration count 1 — no
      app-wide reduced-motion convention exists, noted in Issues).
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden. (Full run: units 242/516/368/58/18/1/1 all passed;
      e2e 178 passed, 1 pre-existing source-panel flake green on
      retry, exit 0. card-appearance.spec's image place-as-is test
      updated to the new `panel-tear` verb — see Issues.)
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

- **SCOPE ADDITION (rotation gate) shipped**: the `bound` open-book
  presentation now requires `rotation === 0` on the image placement
  (`NotePanel.layout`). A rotated image's note opens/stays as the
  tethered card; the gate is live mid-life (rotating an open book
  drops it to the card, squaring it re-binds). E2E-covered.
- **Landmark hardware is a DOM overlay, not a canvas-engine renderer
  variant.** The ticket's Files-to-Touch named
  `packages/canvas-engine/src/renderers/placement.ts`; that was NOT
  touched (delegation constraint: engine consumption-only this wave,
  plus the paper primitives are Svelte components a Pixi renderer
  cannot host). Instead the landmark fact rides the settings table
  (`note_torn_landmark:<placementId>`, presentation state, NO
  migration) and `NotePanels` mounts world-tracked TornEdge + PushPin
  hardware over the placement; the pin is the pull-pin verb. If a
  future ticket wants the hardware inside the Pixi card body (batch
  with world content, occlusion-correct), that is a deliberate
  engine change to cut separately.
- **"One undo group" is vacuous here**: place = ONE PlaceAsCard,
  pull-pin = ONE DeleteContent — each already a single undo entry;
  the presentation facts (settings writes) never enter the gateway,
  so `runAsUndoGroup` would group nothing. Not used.
- **Tear/untape are presentation flips, NOT undo entries** (the
  acceptance's "each transition is one Mod+Z step" cannot hold for
  them): pinned/torn state is panel-lifetime presentation exactly
  like `size`, and the undo stack captures only structural commands
  (`undo/*` was fenced to a parallel agent regardless). The e2e
  asserts depth is UNCHANGED by tear and +1 for each persisted step.
- **§9 "standard confirm" does not exist in the codebase** — board
  deletes auto-trash a bare node and surface a notice (gestures-ui).
  Pull-pin matches: when the landmark is the node's last placement it
  deletes, emits the standard "Node moved to Trash…" notice, and
  skips restoring a sticky for a note that just left with it.
- **Dismiss is the ordinary landmark delete**, not a bespoke verb:
  deleting the placement (⌫, one undo) leaves the note attached to
  its image node, so the next open is the bound book — "the page
  returns to its book". A dedicated dismiss affordance on the
  landmark had no home (ContextMenu is fenced this wave); flag for a
  menu-verbs follow-up if wanted.
- **Undo asymmetry on pull-pin**: undoing the DeleteContent
  resurrects the placement but the landmark fact was already cleared
  (presentation state is not command-inverted), so the restored
  placement returns bare — content safe, hardware asks to be
  re-placed. Accepted as the presentation-state trade; same family
  as pinned-panel state not rewinding under Mod+Z.
- **PlaceAsCard places image nodes as-is** (AI-IMP-084 rule), so an
  image-note's landmark is a second image placement wearing pin +
  scar, not a card. The fact is keyed per landmark placement, so the
  original image placement is never decorated.
- **EW_BEAT_UNTAPE_MS = 200 added to chrome/beats.ts** (provisional,
  `~200ms` from rev 0.55) — the ledger had no reverse-tear number.
  z.test.ts asserts constants by name and is unaffected.
- **No reduced-motion convention exists in the app** (grep found
  none); the ticket said "check; else note" — noted. All lifecycle
  animations are one-shot and short (≤300ms).
- **Theme-token guard**: locally-scoped CSS duration vars initially
  named `--ew-*` tripped theme.test.ts (every `--ew-` var must be a
  theme.css token); renamed to component-local `--panel-beat-ms` /
  `--big-tear-ms` / `--big-tuck-ms`.
- **Playwright treats the tape's zero-size anchor wrapper as
  hidden**; the e2e asserts its presence (count) instead of
  visibility.
- **RFC inconsistency (for the lead, rides this close)**: §8.5's
  indicator-table row for the bound page still says "the tail is the
  attribution" — stale since AI-IMP-134 (the binding is the
  attribution); this ticket's Design section already carries the
  agreed wording.
- **card-appearance.spec.ts updated (not fenced)**: its "image nodes
  place as-is" test pinned an image-anchored tethered panel via
  `panel-pin`; that panel is now the BOUND page whose pin verb is the
  TEAR (`panel-tear`, distinct testid so specs read the verb). One
  click-site changed; all its assertions still hold (tear + place
  behaves identically at the command layer). Full suite re-run green
  after the fix.
- The centered tear triggers on double-click of the bound page's
  CHROME (header strip/margins), not inside the editor text — a
  dblclick there must stay word-select. Feel question for the human
  pass: is that discoverable enough?

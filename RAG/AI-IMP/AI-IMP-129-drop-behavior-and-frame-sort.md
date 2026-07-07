---
node_id: AI-IMP-129
tags:
  - IMP-LIST
  - Implementation
  - frames
  - import
  - canvas
kanban_status: planned
depends_on: [AI-IMP-126, AI-IMP-127, AI-IMP-128]
parent_epic: [[AI-EPIC-017-frames]]
confidence_score: 0.6
date_created: 2026-07-06
date_completed:
---


# AI-IMP-129-drop-behavior-and-frame-sort

## Summary of Issue #1

The epic's payoff moment (§4.9): a hundred-image drop currently
lands as an untiled heap. Per rev 0.38: multi-drop/big-paste offers
ask / sort / group (in frame) / group and sort — the default is a
modal that asks and offers remember-this-choice (the §14.4
first-drop ask idiom), changeable in Settings; big paste asks
"separate images or an arranged frame"; a composite NEVER lands in
the library (each image stays its own node and asset — tags and
hash dedupe stay per-image). Per-frame sort-on-drop defaults ON: a
fresh frame arranges drops within itself, a per-frame toggle
disables it; auto-sort-items-in-frame runs on demand; and
load-from-library-into-frame picks items and arranges them to the
drawn size. Done means: the multi-drop decision is one modal (or
zero, once remembered), all four behaviors work, frame drops
self-arrange when the toggle is on, and the artist's
Pinterest-board drop lands sorted in one decision (epic success
metric).

### Out of Scope

- Save-composite-FROM-frame (needs EPIC-008 export machinery; cut
  when that activates).
- New arrange algorithms (128's sort keys + packer are the
  vocabulary).
- Single-item drops (behavior unchanged).
- Context-menu wiring beyond what ships (EPIC-016).

### Design/Approach

Threshold: the modal engages at N≥2 simultaneous image drops/paste
(constant, tunable). The modal follows the §14.4 first-drop ask
idiom (existing component family) with the four choices +
remember-this-choice persisting to a project setting
(`drop_behavior`, settings table, NO migration); Settings gains the
enum row to change it later. "Group" draws a frame sized by the
packer's result around the dropped set (one compound undo: import +
frame + capture + arrange). Sort-on-drop: per-frame flag rides
frame node presentation state (settings-table pattern like
note_metadata_note:<id>, NO migration), default ON; drops ending
inside such a frame trigger 128's arrange scoped to the frame
region. Auto-sort-in-frame: an action on the frame invoking the
same scoped arrange on demand. Load-from-library-into-frame: from
the frame, open the existing gallery/source picking surface
(reuse; do NOT build a new picker), place the picked set captured +
arranged to the drawn size. All composites are per-image nodes;
never a merged asset. NEVER use `<datalist>` in the modal.

### Files to Touch

`apps/desktop/src/renderer/` drop/paste pipeline (where multi-drop
lands): threshold + modal + behaviors.
The §14.4 ask-modal component family: the new ask variant.
`apps/desktop/src/renderer/views/SettingsView.svelte`:
drop-behavior enum row.
`apps/desktop/src/renderer/canvas/` frame actions: sort-on-drop
hook, auto-sort action, load-into-frame.
`packages/protocol/src/index.ts`: additive setting surface only.
`apps/desktop/e2e/frames.spec.ts` or new drop-behavior spec.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Multi-drop modal: four choices + remember; remembered choice
      skips the modal; Settings row changes it back to ask.
- [ ] Group / group-and-sort: frame drawn around the set, members
      captured, one compound undo returns the board to pre-drop.
- [ ] Big paste: separate-images vs arranged-frame ask; composite
      never enters the library (per-image nodes/assets, dedupe
      intact — unit or e2e proof).
- [ ] Sort-on-drop per frame: default ON, toggle persists as
      presentation state, drop inside arranges scoped to region.
- [ ] Auto-sort-in-frame action; load-from-library-into-frame
      reuses the existing picking surface and arranges to size.
- [ ] E2E: 5-image drop → group-and-sort → tree + tiling
      asserted → undo whole; remembered choice path.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (the
      Pinterest-drop moment, modal wording, threshold feel).

### Acceptance Criteria

**GIVEN** eight images dropped at once with no remembered choice
**THEN** the ask modal offers ask/sort/group/group-and-sort with
remember-this-choice.
**WHEN** group-and-sort is chosen
**THEN** one frame lands containing all eight, tiled by the packer,
and ONE undo removes frame, membership, and imports together.
**GIVEN** remember was ticked
**THEN** the next multi-drop applies the choice silently and
Settings shows the stored behavior.
**GIVEN** a frame with sort-on-drop ON
**WHEN** three images drop inside it
**THEN** they arrange within the region; toggling OFF stops that.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

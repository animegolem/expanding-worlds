---
node_id: AI-IMP-128
tags:
  - IMP-LIST
  - Implementation
  - frames
  - canvas
  - board-tooling
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-017-frames]]
confidence_score: 0.75
date_created: 2026-07-06
date_completed:
---


# AI-IMP-128-arrange-and-normalize

## Summary of Issue #1

§4.9 (rev 0.38) extends the board-tooling vocabulary that frames
and big drops lean on: the existing §6.9 arrange (compact packing)
gains SORT KEYS, and NORMALIZE verbs equalize dimensions across a
selection. Both operate on any multi-selection — no frame
dependency (frame-scoped invocation arrives with AI-IMP-129). The
PureRef reference (captured in AI-EPIC-016's notes) is adopted
selectively, not wholesale. Done means: arrange accepts a sort key
(at minimum: name, import date, image size/area, shuffle-stable
default of current §6.9 behavior), normalize offers equalize
height / width / size (scale to match) / area, both commit as ONE
undo entry per invocation, and both are reachable from the existing
board-tooling surface with registry-listed shortcuts where
assigned.

### Out of Scope

- Frame-scoped auto-sort and sort-on-drop (AI-IMP-129 — it calls
  the pure functions shipped here).
- Context-menu placement of the verbs (EPIC-016; expose via the
  existing tooling surface/shortcuts for now).
- New packing algorithms (§6.9's packer stays; sort keys feed its
  input order).

### Design/Approach

Pure layout functions in packages/canvas-engine (beside the
existing arrange/packing code): `sortPlacements(items, key)`
feeding the existing packer, and `normalizeSelection(items, mode)`
returning new geometries (equal height, equal width, equal size =
scale-to-match a reference — use the selection's median as
reference so one outlier doesn't explode the rest — and equal
area). Unit-test each mode including mixed aspect ratios and
degenerate single-item input. Renderer wiring: selection actions
issuing the existing batch placement-update command (one undo
entry, drags/resizes convention). Shortcuts: declare in the keymap
registry so Settings lists them (follow the bindings.ts pattern);
tooltips per the §8.2 rule if any new hoverable chrome ships.
Sort-key vocabulary stays additive — the enum will grow (EPIC-016
menus, 129's modal); validate in handlers, not schema.

### Files to Touch

`packages/canvas-engine/src/arrange.ts` (or existing packer home,
+ tests): sort keys, normalize modes.
`apps/desktop/src/renderer/canvas/board-tooling.ts` (or existing
arrange invocation site): the verbs on current selection.
`apps/desktop/src/renderer/keys/bindings.ts`: shortcuts if
assigned.
`apps/desktop/e2e/` (extend the board-tooling/arrange spec if one
exists, else a small new spec): arrange-with-key + one normalize
mode round-trip with single-undo assertion.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Sort keys feed the existing packer (name, import date,
      size/area + current default preserved); pure units per key.
- [ ] Normalize modes: equalize height / width / size / area,
      median reference; pure units incl. mixed aspects and
      single-item no-op.
- [ ] Renderer verbs commit ONE undo entry per invocation; undo
      restores all prior geometry (e2e asserts).
- [ ] Any shortcuts declared in the registry; Settings Keyboard
      lists them.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (does
      normalize-by-median feel right on a messy pinboard).

### Acceptance Criteria

**GIVEN** eight images selected with varied sizes
**WHEN** arrange-by-import-date runs
**THEN** they pack compactly in date order and one Mod+Z restores
every prior position.
**WHEN** normalize-equal-height runs on the restored selection
**THEN** all eight share the median height with aspect preserved,
one undo entry.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

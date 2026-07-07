---
node_id: AI-IMP-137
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - menus
  - trash
kanban_status: completed
depends_on: [AI-IMP-136]
parent_epic: [[AI-EPIC-016-context-click-menus]]
confidence_score: 0.7
date_created: 2026-07-07
date_completed: 2026-07-07
---


# AI-IMP-137-menus-second-wave-and-about

## Summary of Issue #1

EPIC-016's completion wave on 136's surface: the DECORATION menu
(edit style — z-order/lock/hide — Delete; never item verbs), the
MULTI-SELECT menu (count header — align/distribute/flips —
**Gather into a frame** · tags · lock all — "Delete N items"), and
the FRAME menu (sort segmented + sort-now + fill-from-library —
rename/note/tags/lock — "Delete frame — contents stay"). Plus the
rev 0.55 chrome-tone items that ride the same review: Help/About
gets its final-candidate copy (plain type, version + RFC rev in
mono, the two-line sentence with copies-never-touches, one
shortcuts link, repo pointer in micro mono) and the TRASH BROWSER
gets its archive-tone pass (neutral rows, factual impact copy,
restore in accent as the loud verb, only Empty trash… wearing
danger, the ratified empty-state line).

### Out of Scope

- Any new command surface: every verb maps to shipped commands
  (frame sort/fill = AI-IMP-129's actions; gather = frame create +
  CaptureInFrame compound; align/distribute/flips = shipped batch
  verbs).
- The frame sort-control LOCATION question (title chip vs charm
  bar — design-queue; the menu row ships regardless).
- Reverse-image "find info" (queued until its connector exists).

### Design/Approach

Three inventories added to 136's module — the grammar invariants
apply automatically. Gather into a frame: compound via
runAsUndoGroup (commitFrame around selection bbox + CaptureInFrame),
one undo. Frame menu's "Delete frame — contents stay": TrashNode
on the frame node (members are independent — §9.6/§4.9), verb copy
stating the fact. Help/About: rework HelpAboutDialog to the
ratified copy (version from app, RFC rev read at build from the
RFC header — a small build-time constant; do not hand-hardcode).
Trash tone: TrashView row restyle on tokens (neutral kind glyph ·
title · relative-when · factual impact strings per the ratified
phrasing), Restore in accent, Empty trash… danger-bordered
bottom-right, empty state "nothing here — deleted things wait
here, whole, until you say otherwise."; restore toast keeps ⌖
fly-there.

### Files to Touch

`apps/desktop/src/renderer/menus/inventories.ts` (+ tests): three
inventories.
`apps/desktop/src/renderer/chrome/HelpAboutDialog.svelte`: copy.
`apps/desktop/src/renderer/views/TrashView.svelte`: tone pass.
`apps/desktop/e2e/context-menus.spec.ts`: extend (decoration/
multi/frame menus; gather round-trip one-undo).
`apps/desktop/e2e/trash.spec.ts`: copy/tone assertions updated —
coordinate: this spec is flake-hardened; keep testids stable.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Decoration menu: style verbs only, never item verbs (test
      asserts absence).
- [x] Multi-select: count header; Gather into a frame = one undo
      group (e2e).
- [x] Frame menu rows wire 129's sort/fill actions; delete verb
      states contents-stay and does TrashNode.
- [x] Help/About final copy; version + RFC rev live values.
- [x] Trash archive tone per ratified copy; danger only on Empty
      trash…; existing spec green with stable testids.
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [x] HUMAN-TESTING entry appended at merge by the lead (does
      trash read as archive; gather-into-frame moment).

### Acceptance Criteria

**GIVEN** a multi-selection right-clicked
**THEN** the menu leads with the count, offers gather/align/tags,
and one undo reverses a gather completely.
**GIVEN** the trash browser
**THEN** rows read archive-toned with factual impact, restore is
the loud verb, and only Empty trash… wears danger.
**GIVEN** Help/About
**THEN** the ratified copy renders with live version + RFC rev.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- **File-name drift**: the ticket names `menus/inventories.ts`; the
  landed 136 module is `menus/inventory.ts`. Extended the existing
  module (no rename) so 136's grammar, tests, and imports stay put.
- **Coming-soon rows (no command exists yet)**: decoration
  `Edit style` (restyle lives only in the toolbar contextual row —
  no popover/command to open); multi-select `Tags…` (no batch
  tag-assign command); frame `Rename frame…` (a frame node has no
  note/label naming command surfaced). All three ship as §8.2
  disabled-with-reason rows.
- **Multi-select flips**: the shipped path (gestures-ui
  `flipSelection`) loops FlipPlacement WITHOUT grouping — N undo
  entries. The menu verb wraps the same loop in `runAsUndoGroup`
  (one undo) to honor §8.4's every-verb-is-one-undoable-command;
  same for `Lock all`. The keyboard path was left untouched (out of
  fence).
- **Theme-token guard**: the trash pass initially used
  `--ew-danger-soft` as a hover fallback; theme.test's token guard
  rejects undefined tokens — switched to `--ew-surface-subtle`.
- **Fence deviation (surgical)**: `e2e/shell.spec.ts` owns the
  Help/About e2e block, so the ratified-copy assertions (RFC rev,
  copies-never-touches line, shortcuts link) were added THERE — four
  assertion lines inside the existing About block; the ticket's
  files-to-touch listed only context-menus/trash specs. Also
  `electron.vite.config.ts` + `env.d.ts` gained the `__RFC_REV__`
  build constant (the design section requires a build-time read of
  the RFC header, which can only live in the build config).
- **trash.spec `Restore` toast**: unchanged; testids all stable —
  only copy/tone assertions were added (holds-phrasing, "Empty
  trash…" label, verbatim empty-state line).
- Gates: `pnpm -r build` green; unit tests 1+338+510 (packages) +
  142 (desktop vitest) green; `pnpm lint` green; desktop e2e hidden
  **153 passed (3.8m)**, zero retries. A first background run of the
  suite produced an empty output file (runner artifact, not a test
  failure) — re-ran in the foreground for the recorded result.

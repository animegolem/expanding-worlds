---
node_id: AI-IMP-137
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - menus
  - trash
kanban_status: planned
depends_on: [AI-IMP-136]
parent_epic: [[AI-EPIC-016-context-click-menus]]
confidence_score: 0.7
date_created: 2026-07-07
date_completed:
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

- [ ] Decoration menu: style verbs only, never item verbs (test
      asserts absence).
- [ ] Multi-select: count header; Gather into a frame = one undo
      group (e2e).
- [ ] Frame menu rows wire 129's sort/fill actions; delete verb
      states contents-stay and does TrashNode.
- [ ] Help/About final copy; version + RFC rev live values.
- [ ] Trash archive tone per ratified copy; danger only on Empty
      trash…; existing spec green with stable testids.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (does
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

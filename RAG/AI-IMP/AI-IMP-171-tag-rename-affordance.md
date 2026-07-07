---
node_id: AI-IMP-171
tags:
  - IMP-LIST
  - Implementation
  - tags
  - ui
kanban_status: planned
depends_on: []
parent_epic: [[AI-EPIC-008-export-import-signoff]]
confidence_score: 0.7
date_created: 2026-07-07
date_completed:
---


# AI-IMP-171-tag-rename-affordance

## Summary of Issue #1

Found by AI-IMP-169's §17 item 8 audit: `RenameTag` is shipped,
unit-tested, and FTS-propagating (handlers/tags.test.ts,
search.test.ts), and 169's e2e proves live surfaces follow a rename —
but NO UI surface invokes the command. A user cannot rename a tag.
§17 item 8 walks "rename a tag" as a user step, so this is one of
the two open Phase 1 clauses (the other is 138's frame retitle).
Done means a discoverable rename affordance on the tag panel
commits RenameTag, every live surface follows (169's e2e already
guards that), and renaming to an existing tag's name surfaces the
handler's collision refusal as a toast rather than silence.

### Out of Scope

- Merge-on-collision semantics (renaming "ruin" to existing "ruins"
  MERGING carriers is a §4.8 design conversation — the handler
  refuses today; surface the refusal, do not invent a merge).
- Tag delete/color/icon management (the broader tag-management pass).
- Any change to the panel's completion-switcher semantics.

### Design/Approach

PROPOSED (small, owner may redirect): the tag panel header gains a
pencil affordance beside the name field (visible on hover, like
sibling row affordances). Activating it swaps the completion
switcher into an EDIT of the current tag's name — same TextInput,
`data-testid="tag-panel-rename-input"`, prefilled; Enter commits
`RenameTag { tagId, name }`, Escape cancels back to switcher mode.
The two modes must be visually distinct (the switcher pivots to
ANOTHER tag; the editor renames THIS one) — placeholder text and the
pencil's pressed state carry that. On TAG_NAME_CONFLICT (the
handler's refusal when another tag holds the name_key) show the
message as a toast and keep the editor open. The §4.8 name_key discipline lives in the handler;
the UI sends the raw name.

### Files to Touch

`apps/desktop/src/renderer/tags/TagPanel.svelte` (+ small CSS),
`apps/desktop/e2e/tags.spec.ts` (drive the rename through the UI —
converts 169's exec-driven step into the user path).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Pencil → edit mode → Enter commits RenameTag; Escape cancels;
      modes visually distinct.
- [ ] Collision refusal surfaces as a toast; editor stays open.
- [ ] tags.spec drives the rename through the UI; 169's propagation
      assertions stay green.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + tags
      spec hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** an open tag panel for "ruins"
**WHEN** the user activates the rename affordance, types "wrecks",
and presses Enter
**THEN** the panel, chips, and completion vocabulary all read
"wrecks" with the same tag id carrying every assignment, and
renaming to an existing name is refused with a visible notice.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

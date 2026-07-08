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

- [x] Pencil → edit mode → Enter commits RenameTag; Escape cancels;
      modes visually distinct.
- [x] Collision refusal surfaces as a toast; editor stays open.
- [x] tags.spec drives the rename through the UI; 169's propagation
      assertions stay green.
- [x] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + tags
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

- **Built as the owner-approved design.** `TagPanel.svelte` gained a
  pencil toggle (`data-testid="tag-panel-rename"`) beside the name
  field. Pressed → the `.field-wrap` region swaps the completion
  switcher for a rename editor (`tag-panel-rename-input`, prefilled and
  autofocused/selected, placeholder "rename this tag…"); the pencil
  wears the accent pressed state (`aria-pressed`) so the two modes read
  distinct. Enter → `RenameTag { tagId, name }` through
  `handle.gateway.execute`; the raw name goes to the handler (name_key
  discipline stays server-side, §4.8). No migration touched.

- **Escape-leak family (avoided).** Folded the edit-cancel into the
  panel's ONE existing window-capture Escape effect rather than adding a
  second listener: when `editing`, it `stopPropagation()`s and cancels
  the edit, returning before the lens/close logic — so the press peels
  ONLY the editor, never leaks to the canvas, and a later press peels
  the panel. Proven by the dedicated Escape e2e (panel stays, name
  unchanged, selection intact, `listTags` still length 1).

- **Bug found and fixed mid-build: `disabled` blurs a focused input.**
  The rename input first carried `disabled={renameBusy}`; toggling it
  true during the in-flight `RenameTag` blurred the focused field, and
  the `onblur=cancelRename` handler tore the editor down before the
  result returned — every commit "cancelled itself". Dropped the
  `disabled` binding; the re-entry guard already lives in
  `commitRename` (`if (renameBusy) return`). Caught by the conflict e2e.

- **Blur = cancel (non-destructive), and the pencil dodges its own
  blur.** Only Enter commits; blur (clicking elsewhere) and Escape
  revert to the switcher. The pencil toggle runs on `onpointerdown` with
  `preventDefault()` (the completion-list idiom) so toggling it off
  keeps the input's focus and never bounces through a click that would
  re-open — a single deterministic toggle, no pointerdown→blur→click
  race.

- **Charm popover folds on chip-click (test friction).** Door 1's tag
  chip closes the charm chips popover when it opens the panel
  (`charms-ui.ts:474`). The first UI e2e blindly double-toggled the
  charm (copying 169's close+reopen) and landed it CLOSED — `fill` on
  the hidden add-input failed. Fixed to a single reopen click, since the
  popover is already closed after the chip gesture.

- **Validation (all green, hidden-window e2e):**
  `pnpm -r build` → Done. `pnpm lint` → clean. `pnpm -r test` → EXIT 0:
  packages 87 test files passed (shared-ui 1, commands 3, domain 6,
  protocol 1, canvas-engine 29, persistence 47) + desktop 33 vitest
  files; desktop playwright 200 e2e passed (the two new UI-rename specs
  among the 8 in `tags.spec.ts`). A separate earlier e2e run showed
  `frames-drop`/`import-batch` as flaky (passed on retry, unrelated
  image-import timing); the clean rerun had zero flakes.
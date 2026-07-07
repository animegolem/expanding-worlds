---
node_id: AI-IMP-159
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - charms
kanban_status: planned
depends_on: [AI-IMP-140]
parent_epic:
confidence_score: 0.65
date_created: 2026-07-07
date_completed:
---


# AI-IMP-159-crop-editor-overlay

## Summary of Issue #1

The crop charm and context-menu row ship as disabled stubs ("the
crop editor arrives in a later ticket") — but no ticket existed.
RFC requires it: §4.6 image appearance carries a NON-DESTRUCTIVE
crop; §17 item 5 wants a cropped-image pin appearance; §18 states
"Image cropping is non-destructive." Owner shape (2026-07-07): hit
Crop on the charm bar → an overlay opens showing the full image
with a crop tool → committing crops the DISPLAY (the appearance),
never the canonical file. Done means: the charm and menu row
enable, the overlay edits a crop rect against the full image,
commit updates the appearance (undoable, §8.4 one-verb-one-command
via the captured gesture), the board renders the cropped region at
the placement's frame, re-entering the editor shows the full image
with the current rect for adjust/reset, and exports/asset bytes
are untouched.

### Out of Scope

- Rotation/aspect presets inside the crop editor (rect only, v1).
- Cropped-image PIN appearance creation flow (§6.2 pin editor owns
  it; this ticket makes the appearance renderable + editable).
- Any asset mutation (non-destructive by definition).

### Design/Approach

Overlay in the takeover family (board dimmed behind, engagement
held): full-resolution image centered at fit-zoom, four corner +
four edge handles on a crop rect (§8.2 hand rules: no beats —
crop is on the no-beat list; refusal cursor outside bounds),
rule-of-thirds guides while dragging, Reset restores full frame,
Enter/blur-commit + Esc-cancel per the app's commit grammar. The
rect stores as the existing appearance crop shape (normalized
0..1 source-space rect — confirm the domain type; extend only in
the command handler if the field is a bare null today). Commit is
one UpdateAppearance through the gateway (already in the captured
undo set — verify; if not, this joins AI-IMP-154's scope, flag
don't fix here). Renderer: cropped source rect → texture frame/UV
on the placed sprite (placement.ts — AFTER AI-IMP-140's radius/
shadow work merges to avoid churn); placement aspect follows the
crop rect per §4.6 semantics on existing machinery if present —
verify how appearance crop interacts with placement w/h and record
the finding. The charm bar and menu rows drop their
disabledReason; charms stay out of the crop editor (charms are UI,
not pixels — §8.4).

### Files to Touch

`apps/desktop/src/renderer/canvas/crop-editor.ts` (new) + overlay
component (+ vitest for rect math: clamp, normalize, reset).
`apps/desktop/src/renderer/canvas/charms-ui.ts`,
`menus/inventory.ts`: enable the rows.
`packages/canvas-engine/src/renderers/placement.ts`: crop → UV
frame (after 140 merges).
`packages/commands`/domain: only if the crop payload type needs
defining — flag schema questions, no migrations expected.
`apps/desktop/e2e/crop.spec.ts` (new): crop → board shows region,
asset bytes unchanged, undo restores, re-open shows full image +
rect.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Overlay: full image, handles, thirds guides, reset, commit/
      cancel grammar; engagement held; no beats.
- [ ] Crop stores on the appearance as a normalized source rect;
      one undoable UpdateAppearance commit.
- [ ] Renderer shows the cropped region at the placement frame;
      radius/shadow (140) compose correctly.
- [ ] Asset bytes and exports untouched (test); re-entry shows
      full image + current rect.
- [ ] Charm + menu rows enabled; disabled stubs removed.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (handle
      feel, guide weight, commit grammar).

### Acceptance Criteria

**GIVEN** a placed image
**WHEN** Crop is chosen from the charm bar and a rect committed
**THEN** the board renders only that region, the file on disk is
byte-identical, Mod+Z restores the full display, and re-opening
the editor shows the whole image with the rect ready to adjust.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

---
node_id: AI-IMP-056
tags:
  - IMP-LIST
  - Implementation
  - feel
  - notes
kanban_status: completed
depends_on:
parent_epic: [[AI-EPIC-012-pre-alpha-hardening]]
confidence_score: 0.8
date_created: 2026-07-05
date_completed: 2026-07-05
---

# AI-IMP-056-feel-constants-label-rename-link-affordance

## Summary of Issue #1

Three owner feel corrections plus two note-surface gaps. Constants:
the zoom-out floor is far too restrictive (MIN_ZOOM 0.02 → 0.002 —
keep a floor against the lost-in-the-void class), snap guides ~10–15%
too faint (SNAP_GUIDE_ALPHA 0.4 → 0.5), canvas labels ~20% too large
(LABEL_HEIGHT_RATIO 0.18 → 0.14). Surfaces: double-clicking a
placement's LABEL should edit the note title in place (committing
through the pane's rename seam so the §10.2 flush ordering holds),
and wiki links must advertise their follow gesture (hover tooltip:
"⌘-click to follow" / Ctrl off-mac) — the owner, who built the
feature's spec, could not discover it.

### Out of Scope

Plain-click link activation (needs the live-preview conversation,
now recorded in the RFC). Label styling beyond size. Rename
conflict UX (AI-IMP-047's dialog already handles it via the seam).

### Design/Approach

Constants are one-line edits with e2e fallout checks (zoom clamp
tests may pin 0.02). Label rename: the placement renderer draws the
label below the image from labelBasis; the open-note dblclick
surface (note/open-note.ts) currently treats the whole placement as
open-note — it gains label-region detection (compute the label rect
from the item's world AABB + LABEL_HEIGHT_RATIO, mirroring the
renderer's layout) and, when the dblclick lands there on a
note-bearing node, mounts an inline overlay input (text-entry
pattern: world-positioned div, Enter/blur commit, Escape cancel)
that dispatches requestRenameNote — the pane flushes then executes,
conflicts get the §7.7 dialog. Body dblclicks keep opening the
note. Link affordance: the wiki-link mark decoration already
carries attributes; add a platform-aware `title`.

### Files to Touch

`packages/canvas-engine/src/camera.ts`: MIN_ZOOM.
`packages/canvas-engine/src/snap-guides.ts`: SNAP_GUIDE_ALPHA.
`packages/canvas-engine/src/renderers/placement.ts`: LABEL_HEIGHT_RATIO.
`packages/canvas-engine/src/*` tests pinning old values.
`apps/desktop/src/renderer/note/open-note.ts`: label-region dblclick
+ inline rename overlay.
`apps/desktop/src/renderer/note/wiki-link-plugin.ts`: title attr.
`apps/desktop/e2e/notes.spec.ts`: label-rename e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] MIN_ZOOM 0.002, SNAP_GUIDE_ALPHA 0.5, LABEL_HEIGHT_RATIO
      0.14; any tests pinning the old values updated deliberately.
- [x] Label-region dblclick on a note-bearing placement opens the
      inline title editor at the label; Enter commits through
      requestRenameNote (flush-first), Escape cancels; body
      dblclick still opens the note.
- [x] Renamed title propagates to the label, the pane, and inbound
      link rewrites (existing machinery; e2e asserts label + pane).
- [x] Wiki-link marks carry a platform-aware follow tooltip.
- [x] Gates green locally and on CI.

### Acceptance Criteria

**GIVEN** a placement whose node has note "Ash"
**WHEN** the user double-clicks the title label and types "Cinder"
then Enter
**THEN** the note renames (one RenameNote after any pending flush),
the label shows Cinder, and the pane title follows.

**GIVEN** the same placement
**WHEN** the user double-clicks the image body
**THEN** the note opens in the pane (unchanged behavior).

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
Constants were pin-free (tests reference the symbols, not
literals), so the retunes were pure one-liners; MIN_ZOOM kept a
floor at 0.002 (10x more room) against the camera-lost-in-the-void
class rather than removing the clamp. The label band lives OUTSIDE
the placement's hit AABB, which made the seam clean: dblclick tries
hitTest first (body -> open note, unchanged) and only then the label
band (-> inline rename overlay committing through requestRenameNote,
so flush ordering and the §7.7 dialog hold). Rotated or flipped
placements skip the band and fall back to open-note — their label
geometry is transformed; noted as accepted Phase 1 residue. The
hover affordance is a plain title tooltip, platform-aware
(⌘/Ctrl). e2e covers rename-via-label, propagation to the scene
label, and unchanged body-dblclick.

---
node_id: AI-IMP-097
tags:
  - IMP-LIST
  - Implementation
  - notes
  - import
kanban_status: backlog
depends_on:
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.85
date_created: 2026-07-06
date_completed:
---

# AI-IMP-097-note-pane-image-drop

## Summary of Issue #1

Dropping an image on the note editor does nothing (silent browser
default) — and the Obsidian crowd's muscle memory drags images INTO
the text (Gemini review point, 2026-07-06 — accepted). Phase-1
answer: intercept the drop on any note surface (panel, big editor),
run the ordinary §6.1 import onto the ACTIVE canvas near the note's
placement (or view center for anchorless panels), and toast
"images live on the board." Upgrades to embed-on-drop when
AI-EPIC-018's images-in-notes land; this ticket is the graceful
interim. Done = no silent failure anywhere a note accepts a drop.

### Out of Scope

- Embeds in note bodies (AI-EPIC-018).
- Non-image drops on the editor (text drops are rev 0.36's own
  shaped feature).

### Design/Approach

Drop handler on the panel/editor containers: image files/bytes →
preventDefault, reuse import-surfaces' import + CreatePin path with
a placement point derived from the panel's anchor (placement
coords) or view center; board notice toast. Everything else falls
through untouched.

### Files to Touch

`apps/desktop/src/renderer/note/NotePanel.svelte` /
`NotePanels.svelte` (drop interception), reusing
`canvas/import-surfaces.ts` exports (may need a small exported
helper); e2e in panels.spec.ts.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Image drop on tethered/pinned panel and big editor imports to
      the active board near the note's placement + toast; no CM
      default interference for non-image drops.
- [ ] e2e: drop onto the panel → placement exists near the note,
      toast visible, note body unchanged.
- [ ] Full gates.

### Acceptance Criteria

**GIVEN** an open note panel over a board
**WHEN** the artist drops an image onto the editor text
**THEN** the image lands on the board beside the note's placement
with the ordinary import pipeline, a toast explains where it went,
and the note body is untouched.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

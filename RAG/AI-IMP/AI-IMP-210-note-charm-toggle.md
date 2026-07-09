---
node_id: AI-IMP-210
tags:
  - IMP-LIST
  - Implementation
  - notes
  - charms
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.85
date_created: 2026-07-09
---


# AI-IMP-210-note-charm-toggle

## Summary of Issue #1

Owner review (2026-07-09, v0.16.0): clicking the note charm on a
placement whose note is already open should CLOSE it — a toggle.
Today both open surfaces are one-way: `charm-note` (charms-ui
~645) and the hint chip's "Open note" both call `requestOpenNote`
unconditionally, so re-clicking the same control does nothing (or
re-opens). Owner: "simple." Done means both surfaces toggle: if
that note's panel is up, the same click closes it through the
panel's own close path; if not, it opens as today. One gesture,
one meaning, both surfaces.

### Out of Scope

- The reading-zoom ruling (DESIGN-QUEUE "open-verb as a camera
  verb") — this ticket is gesture symmetry only and survives any
  ruling there.
- Attach flow (AI-IMP-211).

### Design/Approach

The panels store knows which notes are open (panels.ts records,
keyed). Expose/reuse an `isNoteOpen(noteId)` query; charm-note and
the hint chip branch: open → `closePanel(key)` via the existing
close path (close-side effects stay honest, the 207 rule); closed
→ `requestOpenNote` as today. Tooltip copy may need "Note — open
or close" (keep kit voice). E2e: click charm opens, click again
closes, third click reopens; same for the hint chip.

### Files to Touch

`canvas/charms-ui.ts` (two click handlers), `note/panels.ts` or
`note/open-note.ts` (query/close seam), charms or panels e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Charm-note toggles open/close through the panel's own close
      path; hint chip matches.
- [ ] E2e: open→close→reopen round-trip on both surfaces.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a placement with its note open
**WHEN** the user clicks the note charm (or the hint chip)
**THEN** the note closes — and the same click when closed opens
it.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

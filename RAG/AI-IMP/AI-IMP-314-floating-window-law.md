---
node_id: AI-IMP-314
tags:
  - IMP-LIST
  - Implementation
  - note-paper
  - floating-window
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-031-the-notes-epic]]
confidence_score: 0.8
date_created: 2026-07-19
date_completed:
---

# AI-IMP-314-floating-window-law

## Summary of Issue #1

Floating note windows (sticky + standard/loose panel) violate the
ratified floating-window law (RFC §8.8.5 lines 2654-2660: bar fills
width — SHIPPED; height hugs content; 240×140 floor; at the floor,
further shrink STOWS to the opener). Census convictions: the store
reserves a fixed 320×300 and clamps at 240×150 — ten pixels off the
ruled floor — with no stow state (`note/panels.ts:65-84,343-378,
468-473`); the editor deliberately fills granted height instead of
hugging (`NotePanel.svelte:2124-2148`); e2e pins the wrong numbers
(`e2e/panels.spec.ts:248-264,309-320`). Done means: one-line
content gets a one-line window, the floor is 240×140, and shrinking
at the floor stows per the settled stow map instead of fighting the
clamp.

### Out of Scope

Paper identity (tape/scar on pinned panels — AI-IMP-315); bound-page
geometry (312); rungs (313); the big editor (owner-gated).

### Design/Approach

Stow map (settled notes-census r2, provisional pending kit
sitting): book-derived sticky → rebinds to its book (the existing
untape path); placement-tethered panel → returns to its anchor;
LOOSE panel (no persistent opener) → closes with a transient
recognition chip naming its reopen doors (Search; the note's own
doors) — no new persistent surface, no silent void. Content-hug:
height tracks content up to the max; user-resize still wins while
active (hug is the default, not a fight). Correct the floor
constant to 240×140 and rewrite the e2e pins to the law's numbers.
Reopen after stow restores a usable size (never reopens at the
floor).

### Files to Touch

`apps/desktop/src/renderer/note/panels.ts`: floor 240×140; hug
sizing; stow state + map.
`apps/desktop/src/renderer/note/NotePanel.svelte`: content-hug
height; at-floor stow interaction.
`apps/desktop/src/renderer/chrome/` (recognition chip reuse for the
loose-panel stow notice).
`apps/desktop/e2e/panels.spec.ts`: law-number pins; hug extremes;
stow/reopen per opener class (NOTE-FLOAT-01/02 shapes).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Round-1 review: verify census citations, current clamp
      consumers, and the untape/rebind path; corrections here first.
- [ ] Floor corrected to 240×140 everywhere (store, gestures, e2e).
- [ ] Height hugs content: one-line note = one-line window; long
      note caps at max with internal scroll; manual resize
      respected while active.
- [ ] Stow at floor: book-derived → rebind; tethered → anchor;
      loose → close + reopen-doors chip. Each has a test.
- [ ] Reopen after stow restores a usable size.
- [ ] e2e pins rewritten to the law (no 320×300/240×150 fossils).

### Acceptance Criteria

**Scenario:** A one-line sticky.
**GIVEN** a note with one line of text taped to the glass.
**WHEN** it renders.
**THEN** its height hugs the single line — no reserved emptiness —
**AND** its header spans its full width.

**Scenario:** Shrinking past the floor.
**GIVEN** any floating note window at 240×140.
**WHEN** the user drags smaller.
**THEN** the window stows per its opener class (rebind / anchor /
close-with-chip),
**AND** reopening restores a usable size.

### Issues Encountered

<!--
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

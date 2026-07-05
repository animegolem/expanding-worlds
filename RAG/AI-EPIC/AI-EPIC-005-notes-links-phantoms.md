---
node_id: AI-EPIC-005
tags:
  - EPIC
  - AI
  - notes
  - wiki-links
date_created: 2026-07-03
date_completed:
kanban_status: in-progress
AI_IMP_spawned:
  - AI-IMP-044
  - AI-IMP-045
  - AI-IMP-046
  - AI-IMP-047
  - AI-IMP-048
  - AI-IMP-049
---

# AI-EPIC-005-notes-links-phantoms

## Problem Statement/Feature Scope

The text half of the product (RFC §4.2, §7) has no editor. Notes,
wiki links with their four-state model, phantom notes, autosave
semantics, and rename rewriting are specified in detail but need a
CodeMirror 6 implementation wired to the EPIC-003 link machinery.

## Proposed Solution(s)

Implement the note editor pane on CodeMirror 6: Markdown source with
wiki-link parsing, autosave gesture commits (idle debounce, blur,
quit, forced flush) per §10.2, and editor-local undo excluded from the
structural stack. Deliver link behavior per §7.1–7.2: bound /
unresolved / broken rendering, title suggestions including phantom
titles, the phantom view with equal-peer Create Note and Create and
Place materialization, re-resolution sweep effects visible in open
editors, transactional rename rewrite folding into local undo, In
Trash link affordances, broken-link recreate/relink, and title
collision handling per §7.7. Attach/detach/make-independent flows per
§6.6 complete the note↔node relationship surface.

## Path(s) Not Taken

No asset embeds in note bodies, no transclusion, no exact-node or
exact-placement link syntax, no collaborative editing bindings — all
explicitly deferred by the RFC. Spatial resolution UI (location
chooser) belongs to EPIC-006.

## Success Metrics

- RFC §17 slice items 6–8 (note halves), 13–15 pass end to end.
  Item 16's grouped location chooser is EPIC-006 scope (consistent
  with Paths Not Taken); this epic delivers zero/one/many-location
  activation with a non-blocking many-locations notice instead.
- A typing burst produces exactly one UpdateNote and one
  project_revision increment (command-log assertion).
- Phantom materialization binds all matching tokens project-wide in
  one command, verified across three source notes.

## Requirements

### Functional Requirements

- [x] FR-1: CodeMirror 6 note pane with Markdown and wiki-link decoration.
- [x] FR-2: Autosave gesture commits with debounce/blur/quit/forced-flush triggers per §10.2.
- [ ] FR-3: Link state rendering and activation behavior per §7.1–7.3.
- [x] FR-4: Wiki-link title suggestions with phantom indicator per §7.2.
- [x] FR-5: Phantom view with first-edit, Create Note, and Create and Place materialization per §7.2/§6.11.
- [ ] FR-6: Transactional rename rewrite with dirty-buffer flush and external-change folding.
- [ ] FR-7: Title collision flows per §7.7.
- [ ] FR-8: Attach, detach, make-independent per §6.6.

### Non-Functional Requirements

- Editor-local undo never crosses into structural undo (invariant 30).
- Suggestion latency imperceptible (<50 ms) at 10k notes.

## Implementation Breakdown

Cut 2026-07-05 after review of the EPIC-003 machinery (commands,
sweep, rewrite, phantom queries all exist; this epic is the editor
and its surfaces, plus two read models):

- AI-IMP-044 — note pane shell: CM6 editor, §10.2 autosave gesture
  (one UpdateNote per burst, quit flush), open-note entry points,
  getNoteLinks/getNoteUses queries. (FR-1, FR-2)
- AI-IMP-045 — wiki-link decorations (four states, live + sweep
  refresh) and `[[` title suggestions with phantom indicator.
  (FR-4, render half of FR-3)
- AI-IMP-046 — phantom view and materialization: first-edit, Create
  Note, Create and Place via CreatePin. (FR-5)
- AI-IMP-047 — rename surface, dirty-buffer flush, external-change
  folding into local undo, NOTE_TITLE_CONFLICT dialogs. (FR-6, FR-7)
- AI-IMP-048 — link activation and degraded links: zero/one/many
  locations, In Trash affordances, broken recreate/relink.
  (activation half of FR-3)
- AI-IMP-049 — attach/detach/make-independent UI, Uses sidebar,
  zero-node Place on Current Canvas. (FR-8)

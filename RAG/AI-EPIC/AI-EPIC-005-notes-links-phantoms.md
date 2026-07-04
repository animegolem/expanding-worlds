---
node_id: AI-EPIC-005
tags:
  - EPIC
  - AI
  - notes
  - wiki-links
date_created: 2026-07-03
date_completed:
kanban_status: backlog
AI_IMP_spawned:
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

- RFC §17 slice items 6–8 (note halves), 13–16 pass end to end.
- A typing burst produces exactly one UpdateNote and one
  project_revision increment (command-log assertion).
- Phantom materialization binds all matching tokens project-wide in
  one command, verified across three source notes.

## Requirements

### Functional Requirements

- [ ] FR-1: CodeMirror 6 note pane with Markdown and wiki-link decoration.
- [ ] FR-2: Autosave gesture commits with debounce/blur/quit/forced-flush triggers per §10.2.
- [ ] FR-3: Link state rendering and activation behavior per §7.1–7.3.
- [ ] FR-4: Wiki-link title suggestions with phantom indicator per §7.2.
- [ ] FR-5: Phantom view with first-edit, Create Note, and Create and Place materialization per §7.2/§6.11.
- [ ] FR-6: Transactional rename rewrite with dirty-buffer flush and external-change folding.
- [ ] FR-7: Title collision flows per §7.7.
- [ ] FR-8: Attach, detach, make-independent per §6.6.

### Non-Functional Requirements

- Editor-local undo never crosses into structural undo (invariant 30).
- Suggestion latency imperceptible (<50 ms) at 10k notes.

## Implementation Breakdown

IMPs to be cut when this epic activates.

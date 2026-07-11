---
node_id: AI-IMP-275
tags:
  - IMP-LIST
  - Implementation
  - renderer
  - outline
  - notes
kanban_status: completed
depends_on: [AI-IMP-273, AI-IMP-274]
parent_epic: [[AI-EPIC-028-the-outliner-control-panel]]
confidence_score: 0.7
date_created: 2026-07-10
date_completed: 2026-07-11
---


# AI-IMP-275-outliner-preview-pane

## Summary of Issue #1

The preview pane per Outliner Grammar §6 — the half that makes
the outline a control panel: follows 274's selection with never a
click cost; media (image full-bleed, board FILMSTRIP from 273's
plan with glyph chips and +N), kind line, note excerpt, placed-N-×
line, tags (chips engage the lens, grammar §8); the EDITABLE-EMPTY
note area ("add a note…", ↵ attach = ONE CreateNoteAndAttach —
the caption-register spirit, inline capture where you're looking);
and the adaptive verb row (boards ↵ dive in / nodes ␣ place ·
⌖ fly to disabled-with-visible-reason at zero placements ·
✎ open note, creating-and-attaching on note-less nodes). Done
means: alph can browse rows and fix "no words" without leaving
the takeover, and every verb routes the shipped command exactly
as its existing door does.

### Out of Scope

- The context-menu/keyboard doors (276).
- Note EDITING beyond create-and-attach (✎ opens the ordinary
  §8.5 surface, closing the takeover per the shipped ordering).
- Rich excerpt rendering (plain clamped text v1).

### Design/Approach

New OutlinePreview component mounted in 274's slot, fed by 273's
data layer. Verbs reuse the outline's existing dispatch seams
(dive = navigateTo + close; place = requestPlaceNode/Note; fly =
requestCenterPlacements family; open note = requestOpenNote,
close-then-open ordering as shipped). Editable-empty note:
TextInput + ↵ attach → CreateNoteAndAttach through the note
project port (the 260 idiom — no hand-rolled envelopes), title
from the first line... NO: title IS the input's single line
(kit's noteDraft), body empty; §7.7 conflicts route through the
existing conflict machinery (the 267 promotion-variant precedent:
never discard the draft). Undo: CreateNoteAndAttach's shipped
matrix entry unchanged. Disabled reasons render visibly (the 267
ContextMenu pattern, applied to the verb row's buttons).
Filmstrip renders 273's descriptors (thumb vs glyph chip).
Component-level tests where the idiom allows; e2e: preview
follows selection, filmstrip honesty, attach-from-preview round
trip (note exists + row loses ·orphan), disabled fly reason.

### Files to Touch

- `apps/desktop/src/renderer/views/OutlinePreview.svelte` (new).
- `views/outline-data.ts` consumption; note port wiring.
- e2e/outline.spec.ts additions (or outline-preview.spec.ts).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Preview renders all §6 content from one selection change;
      filmstrip thumbs + glyph chips + "+N" honest.
- [x] Editable-empty note: ↵ attach = one CreateNoteAndAttach via
      the port; conflict path never discards the draft; the row's
      ·orphan clears on success.
- [x] Adaptive verb row: shipped dispatch per verb; ⌖ disabled
      with a VISIBLE reason at zero placements; ✎ creates-and-
      attaches on note-less nodes.
- [x] Tag chips engage the lens (shared grammar).
- [x] e2e green; full check:ci green (pipefail).

### Acceptance Criteria

**GIVEN** an orphan image row selected in the outline
**WHEN** the user types "study the gloss here" in the preview's
empty note area and presses Enter
**THEN** one CreateNoteAndAttach commits, the preview shows the
excerpt, and the row's ·orphan state clears
**AND** a board row previews a truthful filmstrip
**AND** fly-to on a loose note is disabled with its reason printed.

### Issues Encountered

- The existing conflict component was reusable, but its create flow's “Use
  Existing” would violate capture semantics. Preview capture uses the
  promotion-shaped Open/Restore/Choose-Different variant; its module-level
  draft register survives deliberate navigation and success remains exactly
  one `CreateNoteAndAttach` through the independent note project port.
- Filmstrip images use the 076 thumbnail route only when readiness is projected;
  pending/missing derivatives and every non-image child render truthful glyph
  chips. Persistence/data tests pin filmstrip honesty; focused e2e pins capture
  and the disabled fly path.

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

> **ROUND-1 RULINGS GOVERN (2026-07-11, .codex/outbox/epic-028.md):**
> discriminated preview targets (node|note; alias resolves; bin from
> census); separate getOutlineFacetCounts (never break
> getOutlineTree's envelope); thumbnails are ew-asset://<hash>/thumb
> (the ticket's "ew-thumb" was wrong), 404-tolerant; LRU keyed on
> canvasId+projectRevision read once per changed event; the tree
> projection grows filename/hash/child-count so every raw-id fallback
> is REMOVED; the trash confirm is outline-owned on getNodeImpact
> (no shipped pre-confirm exists; root+bin permanently disabled);
> capture conflicts use the promotion-shaped no-Use-Existing variant
> with the draft kept mounted; keyboard map ratified — ↵ ␣ ⌥↵ tab
> # N Del/⌫ esc, inputs own their keys, trash confirms from every
> door; the lens is outline-local state reusing the visual grammar.

---
node_id: AI-IMP-266
tags:
  - IMP-LIST
  - Implementation
  - persistence
  - canvas-engine
  - renderer
  - field-report
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.75
date_created: 2026-07-10
date_completed:
---


# AI-IMP-266-placement-captions

## Summary of Issue #1

RFC rev 0.68 §4.5 ratifies the CAPTION — the identity-free text
register between note and decoration, alph's core brainstorming
blocker ("I couldn't write 'I like the blue' without attaching a
new note to every image and giving it a title"). Nothing
implements it. This ticket builds the caption end-to-end: a
placement MAY carry subordinate text — no title, no node, no
note, no outline row — that renders beneath it through the label
machinery, REPLACES the title label while present, and is
entered/edited by verb (context menu + charm). Done means: on a
board, right-click an image → Add caption → type "I like the
blue" → Enter — the text sits under the image, moves/scales/
deletes with it, survives restart and export/import, never
appears in the outline, and one Mod+Z removes it.

### Out of Scope

- Promote-to-note (AI-IMP-267, depends on this).
- FTS indexing of captions (RFC §4.5 defers it WITH scope; a
  later ticket).
- The mat/card visual maturation (deliberately held until the
  tester reacts to the mechanics — DESIGN-QUEUE).
- Caption on non-placement subjects (decorations, frames-as-such
  beyond their placement row).

### Design/Approach

**Schema (MIGRATION 0008 — renumbered by the lead at the round-1
review):** nullable `caption` TEXT on `placement`. No CHECK
constraints. The cut reserved 0009 with 0008 held for AI-IMP-261,
but 261 is unstarted and the migration index ends at 0007 — a gap
or a merge fence on unrelated work were both worse than swapping
two unlanded reservations. 266 takes 0008; 261 now holds 0009.

**Command:** `SetPlacementCaption { placementId, caption:
string | null }` (set, replace, or clear in one verb) —
handler-validated (trim; empty string normalizes to null; length
ceiling ~2000 chars as a handler rule, NOT schema), inverse is
the prior value (ordinary undoable property command per the
AI-IMP-233 matrix: every deliberate verb joins Mod+Z). Typed
payload codec per the EPIC-027 codec pattern (250/251/252 —
malformed payloads refuse loudly). Read models: the placement
scene row and getOutlineTree/gallery queries are AUDITED to
confirm captions stay OUT (the outline's absence is load-bearing
design, §4.5).

**Renderer (canvas-engine placement.ts):** the caption renders
where the label renders, through the SAME pipeline — world-scaled
Pixi Text, the §8.2 fade ladder, the AI-IMP-262 zoom-bucket
raster resolution (labelTextResolution applies unchanged).
While `caption` is non-null it REPLACES the title label (never
stacked). Wrapped to the placement's width; clamped to ~3 lines
with ellipsis (constant, feel-tunable). Word-wrap via Pixi text
style wordWrapWidth = placement world width.

**Entry surfaces (desktop renderer):** (a) placement context
menu gains "Add caption" / "Edit caption" (menus/inventory.ts —
the declarative grammar; verbs-only, destructive-last rules
hold); (b) the §8.4 charm bar gains a caption charm on image
placements (charms-ui). Both open ONE inline editor: a small
anchored textarea at the caption's position (§8.8 anchored
placement helper for clamping), Enter commits the ONE command,
Escape discards, click-away commits (§8.2 desk physics). Editing
an existing caption pre-fills it.

### Files to Touch

- `packages/persistence/src/migrations/0008-placement-caption.ts`
  (+ test).
- Persistence handler (placements/appearance family) + codec +
  handler tests: set/clear/trim/ceiling/inverse round-trip.
- `packages/protocol` command surface as the existing pattern
  requires.
- `packages/canvas-engine/src/renderers/placement.ts`: caption
  text node, label-replacement rule, wrap/clamp + resolution
  buckets (+ unit tests beside the 262 suite).
- `apps/desktop/src/renderer/menus/inventory.ts` (+ inventory
  test): Add/Edit caption verb.
- `apps/desktop/src/renderer/canvas/charms-ui.ts`: caption charm.
- New inline caption editor component (renderer/canvas/).
- e2e: new `caption.spec.ts` — add via menu, renders under image,
  replaces label, survives relaunch, absent from outline, Mod+Z
  removes, edit + clear paths, charm entry.
- `RAG/HUMAN-TESTING.md`: alph entry (the register he asked for).
- `CHANGELOG.md` [Unreleased].

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Migration 0008: nullable caption on placement; migration
      test green; no CHECK constraint anywhere near it.
- [ ] SetPlacementCaption handler + typed codec: set/replace/
      clear, trim + empty→null, length ceiling in the handler,
      verified inverse; handler tests cover all paths.
- [ ] Outline/gallery/search read models audited: captions do
      NOT surface (test asserts the outline query's blindness).
- [ ] Renderer: caption under the placement via the label
      pipeline (fade ladder + 262 raster buckets), REPLACES the
      title label while present, wraps to placement width,
      ~3-line clamp; unit tests.
- [ ] Context-menu verb + caption charm + inline editor: Enter
      commits ONE undoable command, Escape discards, click-away
      commits, pre-fill on edit; inventory grammar test extended.
- [ ] e2e caption.spec.ts green (menu add, render, label
      replacement, relaunch persistence, outline absence, undo,
      charm entry); export/import round-trip carries the caption
      (extend the existing roundtrip spec).
- [ ] Full gates green with pipefail: packages vitest, desktop
      vitest, affected e2e shards; counts read, not exit codes.
- [ ] HUMAN-TESTING + CHANGELOG entries.

### Acceptance Criteria

**GIVEN** an image placement on a board
**WHEN** the user right-clicks → Add caption, types "I like the
blue", and presses Enter
**THEN** the text renders beneath the image in place of its title
label, world-scaled and crisp at board zooms
**AND** it moves/scales/deletes with the placement, survives
relaunch and an export/import round trip
**AND** it never appears in the outline
**AND** one Mod+Z removes it (the caption is one undoable verb)
**AND** the same node placed elsewhere carries no caption there.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

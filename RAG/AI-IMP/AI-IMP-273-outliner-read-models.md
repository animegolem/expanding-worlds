---
node_id: AI-IMP-273
tags:
  - IMP-LIST
  - Implementation
  - persistence
  - outline
kanban_status: planned
depends_on: []
parent_epic: [[AI-EPIC-028-the-outliner-control-panel]]
confidence_score: 0.75
date_created: 2026-07-10
date_completed:
---


# AI-IMP-273-outliner-read-models

## Summary of Issue #1

EPIC-028's preview pane and facets need data no query serves:
a per-node PREVIEW projection (kind line facts, note excerpt,
placed-N-× with canvas labels, tags), a board FILMSTRIP plan
(first 4-5 children by render_order with thumbnail hashes OR
appearance-glyph descriptors for non-image children — the strip
never lies), and facet COUNTS including the new untagged axis
(nodes with zero tags, per Outliner Grammar §3: pins/images only,
never folded into disconnected). Done means: the renderer can
drive the whole preview + facet bar from typed queries with no
per-row waterfalls, and the filmstrip resolves through the 076
thumbnail pipeline.

### Out of Scope

- All rendering (274/275). Any schema change (read models only).
- Cover images (launcher cluster).

### Design/Approach

New persistence queries beside getOutlineTree (queries-structure
family, single-context, ordinary registry): `getOutlinePreview
{nodeId}` (kind facts, note title+excerpt clamp, places with
labels, tags) and `getBoardFilmstrip {canvasId, limit}` (children
by render_order → contentHash where image + thumbnail-ready flag,
else appearanceKind/color/icon descriptor; +N remainder count).
Facet counts extend the existing outline queries (untagged =
active pin/image nodes with zero active tag assignments) —
scope-honest per the one-universe note. Renderer data layer: an
LRU (canvasId+revision keyed, ~32 entries) in front of the
filmstrip query; thumbnails resolve via the existing 076
claim/submit pipeline and ew-thumb protocol. Unit tests per query
(fixtures incl. empty boards, non-image children, >limit boards,
untagged counting).

### Files to Touch

- `packages/persistence/src/queries-structure.ts` (+tests).
- Protocol query surface as the registry requires.
- `apps/desktop/src/renderer/views/outline-data.ts` (new): LRU +
  thumbnail resolution (+unit tests).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] getOutlinePreview: kind facts, excerpt clamp, places with
      labels, tags; unit tests incl. orphan/loose/untitled rows.
- [ ] getBoardFilmstrip: render_order slice, image-vs-glyph
      descriptors, +N; unit tests incl. non-image children.
- [ ] Untagged facet counts (pins/images, zero active tags);
      never merged into disconnected; tests.
- [ ] outline-data LRU: revision-keyed invalidation test; no
      per-row query waterfalls (one preview call per selection).
- [ ] Full check:ci green (pipefail; counts read).

### Acceptance Criteria

**GIVEN** a board with images, dots, and a nested board
**WHEN** the preview asks for its filmstrip
**THEN** image children yield thumbnail-resolvable entries, others
yield honest glyph descriptors, capped with a +N remainder
**AND** preview data for any row arrives in one query
**AND** untagged counts pins/images with zero tags and is not part
of disconnected.

### Issues Encountered

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

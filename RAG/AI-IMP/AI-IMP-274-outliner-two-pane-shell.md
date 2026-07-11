---
node_id: AI-IMP-274
tags:
  - IMP-LIST
  - Implementation
  - renderer
  - outline
kanban_status: completed
depends_on: [AI-IMP-273]
parent_epic: [[AI-EPIC-028-the-outliner-control-panel]]
confidence_score: 0.7
date_created: 2026-07-10
date_completed: 2026-07-11
---


# AI-IMP-274-outliner-two-pane-shell

## Summary of Issue #1

The OutlineView rebuild's core: the yazi-hybrid two-pane takeover
per Outliner Grammar §1/§3/§4/§5 and the kit's pixels — tree
master left (fold glyphs, kind glyphs ⌂⬚◯▣↗⊘, warn badges, tag
chips, meta column), a preview slot right (275 fills it), facet
bar (all/unplaced/orphans/disconnected/untagged + ⌕ filter +
lens chip), FLATTEN-ON-FILTER with path-in-meta and fold-state
survival, the calm badge rule (·untagged only under a cleanup
facet), naming fallback (filename-mono for images, "unnamed · N
items" for boards, never a raw id), and the teaching footer with
scope-honest counts. Done means: the takeover renders the kit's
shape against real data with every §14.1 semantic preserved
(alias rows fly, loose bin at root, dive/place/openNote rows
keep working) and the grammar rules pinned by e2e.

### Out of Scope

- The preview pane's content (275 — this ticket mounts its slot
  and the selection contract).
- Context menu/keyboard doors (276).
- New verbs or lifecycle semantics.

### Design/Approach

Rework `views/OutlineView.svelte` to the kit structure (the kit's
component grammar maps to existing app idioms: FacetChip → the
gallery facet chips' pattern, TagChip → shared tag chip, rows stay
DOM). Selection = cursor-follow state (hover with pointer,
tap/click on touch — the kit's row.select), driving 275 through a
single `selected` contract. Flatten: any facet≠all or nonempty
query renders the flat worklist with path-meta (grammar §5); fold
state is kept in a map untouched by flatten. Badges: ·loose and
·orphan always; ·untagged computed but rendered only when a
cleanup facet is active. Naming fallback at the row-title level
(shared helper — 259's display half stays parked; THIS rule is
the grammar's ratified subset: filename for images, unnamed · N
for boards). Existing row actions (Place, loose-note Trash) stay
functional through the rework. e2e: rework outline.spec.ts +
grammar pins (flatten path-meta, fold survival, badge calm rule,
alias fly, naming fallback, teaching counts).

### Files to Touch

- `apps/desktop/src/renderer/views/OutlineView.svelte` (major).
- Shared naming-fallback helper (+unit test).
- e2e/outline.spec.ts (rework + grammar pins).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Two-pane shell with the kit's tree-row anatomy; §14.1
      semantics preserved (alias fly, loose bin, existing
      actions); selection contract feeding the preview slot.
- [x] Facet bar incl. untagged; flatten-with-path; fold-state
      survival; teaching footer counts.
- [x] Badge calm rule + naming fallback helper (images filename,
      boards unnamed · N, never raw ids anywhere in the view).
- [x] e2e grammar pins green; full check:ci green (pipefail).

### Acceptance Criteria

**GIVEN** the outline takeover on a real project
**WHEN** the user toggles the untagged facet
**THEN** the tree flattens to a worklist with paths in the meta
column and ·untagged badges appear on qualifying rows
**AND** clearing the facet restores the tree with fold state intact
and the badges go calm
**AND** an unnamed board reads "unnamed · N items" and an untitled
image shows its filename in mono — no raw id anywhere.

### Issues Encountered

- Root-level non-root canvases are unplaced boards. The shell merges their
  owner facts from the same refresh's unplaced library projection so badges,
  tags, naming, and facet counts cannot disagree.
- The old single-click row activation pins were intentionally reworked: rows
  now select/preview, while double-click, preview verbs, keyboard, and explicit
  Place controls perform navigation/actions. Alias activation still flies on
  one click and close-then-act ordering is unchanged.
- Hidden outline/loose-note shard passed 6/6, including flatten-with-path, fold
  survival, calm badges, filename/board fallbacks, and the outline-local lens.

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

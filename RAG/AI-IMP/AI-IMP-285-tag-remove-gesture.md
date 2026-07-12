---
node_id: AI-IMP-285
tags:
  - IMP-LIST
  - Implementation
  - renderer
  - persistence
  - tags
  - lifecycle-push
kanban_status: completed
depends_on: [AI-IMP-231]
parent_epic:
confidence_score: 0.8
date_created: 2026-07-11
date_completed: 2026-07-12
---

# AI-IMP-285-tag-remove-gesture

## Summary of Issue #1

T2 (ratified 11 Jul, lifecycles-1.1 → "N4+T2", the T2 half, incl.
the R6 sync amendment; RFC rev 0.70 §4.8 — THE NORMATIVE SPEC):
UnassignTagFromNode exists and is tested, and no gesture anywhere
emits it. The ruled gesture: a tag chip in a REMOVE-CAPABLE
habitat grows the FacetChip's ✕ on hover (the kit already has the
form — removal reuses it, no second idiom). Two habitats are
remove-capable: the NOTE META STRIP and the TAG PANEL's carrier
rows (TagPanel ~:406-425; removing the last carrier leaves the
panel open on its empty state — panels never close themselves).
Filter-✕ and removal-✕ NEVER share a habitat (gallery facets and
search pills keep filter semantics untouched). Click removes
silently (GR-3 class 7 — the vanishing chip is the feedback);
⌘Z restores: **UnassignTagFromNode leaves the exempt class and
becomes captured** (undo-store ~:148; inverse AssignTagToNode).
R6, removal survives sync: because §4.8 sync unions per-node
assignments by content hash, per-node unassign on MIRRORED content
also writes a NARROW suppression (content_hash + tag, this node) —
the per-node sibling of 271's project-scope tombstone; sync may
re-offer through recognition, it never re-applies what a hand
removed. **MIGRATION 0011 IS RESERVED FOR THIS TICKET** (the
suppression rows; STRICT table beside 0010's tombstone — never a
CHECK IN on a growing domain). Depends on AI-IMP-231 (group
identity) so the capture reclassification lands on the repaired
coordinator; the trust-wave brief explicitly left this
reclassification to this ticket.

### Out of Scope

- The gallery bulk-bar "remove tag from N" copy of the gesture
  (G2's session; it copies this chip form later).
- Tag categories (EPIC-026).
- Any change to filter-✕ semantics anywhere.

### Design/Approach

Renderer: one removable-chip presentation (FacetChip's active
form) parameterized over habitat; hover reveals ✕; touch dialect
note (iPad delta Δ2): the ✕ rests visible on glass — build behind
the existing touch-metrics prop, desktop keeps hover. Persistence:
UnassignTagFromNode handler gains the mirrored-content check —
when the node's asset content_hash participates in a §14.4 mirror
edge, write the suppression row in the same transaction; the
inverse (AssignTagToNode via ⌘Z) LIFTS the suppression it wrote
(undo restores the world, including sync's view of it).
planTagSync excludes suppressed (content_hash, tag, node) triples
from the union. Migration 0011: `tag_unassign_suppression`
(project-side; columns per the tombstone's shape + node scope).
Undo policy: exempt → captured with the matrix diff test updated
— this is the ONE sanctioned UNDO_POLICY change the trust-wave
brief deferred here.

### Files to Touch

- `packages/persistence/src/migrations/0011-*.ts` (reserved)
- `packages/persistence/src/handlers/tags.ts` (unassign +
  suppression + lift-on-inverse)
- `packages/persistence/src/tag-sync.ts` (union excludes
  suppressed triples)
- `apps/desktop/src/renderer/undo/undo-store.ts` (matrix row)
- note meta strip + `apps/desktop/src/renderer/tags/TagPanel.svelte`
  (the chip ✕, both habitats)
- Unit: suppression written only for mirrored content; lift on
  undo; planner exclusion. e2e: remove → close → reopen → the tag
  STAYS GONE on the mirrored image (the R6 pin); last-carrier
  empty state; ⌘Z restores chip + sync view.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Chip ✕ in both remove-capable habitats; filter habitats
      untouched (pinned); last-carrier leaves the panel open on
      its empty state.
- [x] UnassignTagFromNode captured (inverse AssignTagToNode);
      matrix diff test updated; removal silent, ⌘Z the receipt.
- [x] Migration 0011: suppression table; handler writes it for
      mirrored content only, same transaction; inverse lifts it.
- [x] planTagSync never re-applies a suppressed triple; may still
      re-offer via recognition (pinned in planner tests).
- [x] The R6 round trip in e2e: tag removed from a mirrored image
      survives close→open against a library that still carries it.
- [x] Full `CI=true pnpm check` green (pipefail, counts read);
      CHANGELOG [Unreleased]; HUMAN-TESTING entry (alph's exact
      flow: remove a tag, reopen, it stays removed).

### Acceptance Criteria

**GIVEN** a tag chip on the note meta strip or a tag-panel
carrier row
**WHEN** the user clicks its hover-✕
**THEN** the tag leaves that node silently and ⌘Z brings it back

**GIVEN** the removed tag was on mirrored content the library
still tags
**WHEN** the project closes and reopens (settle moments run)
**THEN** the tag does NOT return — and lifting via ⌘Z restores
both the chip and sync's willingness to carry it.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- Round-1 correction: Phase 1 stores no mirror-source project identity
  (`import/ingest.ts` says it has no schema home). The approved predicate
  writes the narrow suppression for every active image-backed node; the
  row is inert unless sync later offers that exact hash/name/node triple.
- Round-1 correction: TagPanel carrier rows previously rendered only
  `otherTags`; the active tag chip had to be added through NodeRow's
  surface-specific `extra` slot.
- Reassignment universally lifts the exact suppression. This makes both
  undo and deliberate hand re-add the explicit reopening gesture.

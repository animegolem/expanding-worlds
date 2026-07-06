---
node_id: AI-IMP-090
tags:
  - IMP-LIST
  - Implementation
  - import
  - library
kanban_status: planned
depends_on: [AI-IMP-088]
parent_epic: [[AI-EPIC-015-library-and-cross-project-sourcing]]
confidence_score: 0.75
date_created: 2026-07-06
date_completed:
---

# AI-IMP-090-ingest-by-copy-and-tag-border

## Summary of Issue #1

§14.4: material moves between projects by HASH-COPY with
provenance, never by reference. Ingesting asks the tag border
question once per source session — carry none, all, or pick;
carried tags recreate as destination records merging by name_key.
Defaults: all from a library, none from a world. This ticket builds
the transport: an ingest operation that reads an asset + node
facts (tags, note presence) from a secondary project and runs the
ordinary staged import into the primary, with the border decision
applied. Done = a service-level ingest with provenance + border
semantics, unit-tested, exposed over the seam for 091's drag.

### Out of Scope

- The source panel UI and its drag (AI-IMP-091 wires this to
  gestures; this ticket ships the verb + a minimal invocation).
- The mirror (AI-IMP-092 reuses the same copy machinery inverted).
- Note bodies crossing the border (assets + tags only; §14.4 names
  files and tags — notes stay out until a design turn says so).

### Design/Approach

Utility-side verb `ingest-from-secondary`: reads blob bytes by
content hash from the secondary's store, stages into the primary
(§11.2 pipeline — dedupe by hash comes free), creates an unplaced
node with image appearance, records provenance (source project id +
original ids in the import metadata the pipeline already writes),
then applies the border decision: for each carried source tag,
find-or-create by name_key in the primary and assign. One command
history entry per ingest (the pipeline's CommitAssetImport +
CreatePin-shaped node creation as today's imports do). The border
decision arrives as an argument (none | all | pick list) — the UI
owns remembering it per source session.

### Files to Touch

`packages/persistence/src/import/` ingest module (+tests);
`packages/protocol` + utility routing + preload; minimal renderer
hook for 091.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Ingest verb: hash-copy through the staged pipeline, unplaced
      node, provenance recorded; dedupe path (bytes already in
      destination) creates the node without recopying.
- [ ] Tag border: none/all/pick applied; name_key merge with
      existing destination tags; units for all three modes +
      merge-vs-create.
- [ ] Seam exposure: verb reachable from the renderer with a
      secondary open; typed failures (no secondary, unknown hash).
- [ ] Units cover provenance fields and §16 self-containment (the
      destination references nothing outside itself afterward).
- [ ] Full gates.

### Acceptance Criteria

**GIVEN** a source project with a tagged image and a destination
world
**WHEN** ingest runs with border=all
**THEN** the destination holds copied bytes, an unplaced node,
recreated tags merged by name_key, and provenance naming the
source — and exports self-contained.
**WHEN** ingest runs again for the same hash
**THEN** no second blob copy occurs and the node/tag semantics
still apply.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

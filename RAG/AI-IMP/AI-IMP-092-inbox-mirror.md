---
node_id: AI-IMP-092
tags:
  - IMP-LIST
  - Implementation
  - import
  - library
kanban_status: planned
depends_on: [AI-IMP-088, AI-IMP-090]
parent_epic: [[AI-EPIC-015-library-and-cross-project-sourcing]]
confidence_score: 0.7
date_created: 2026-07-06
date_completed:
---

# AI-IMP-092-inbox-mirror

## Summary of Issue #1

§14.4's capture flow: optionally, per project, asked ONCE — a drop
into a world also performs a second ordinary import into the
library (bytes copied, unplaced node, provenance), one-way,
hash-recognized, never blocking the foreground drop. The ask is a
two-button panel anchored to the first drop (import runs either
way; the answer stores as the existing §11.5 "mirror drops to
library" setting). When the library already holds the bytes, the
mirror skips and MAY offer the library's tags via a transient chip
obeying the engagement fade; bulk drops collapse to one summary
chip. Done = first-drop ask, background mirror, recognition chip,
locked-library resilience, e2e.

### Out of Scope

- Syncing anything OUT of the library (strictly one-way).
- Retroactive mirroring of pre-existing world content.
- Tag-offer ingestion UI beyond apply/ignore on the chip.

### Design/Approach

Drop path (import-surfaces): after the foreground import commits,
if the project's mirror setting is unset → show the first-drop ask
panel (anchored near the drop, two buttons, stores the setting);
if on → fire-and-forget mirror task: hash-check against the
library (090's machinery inverted: primary → library writable
handle), skip-and-recognize or copy+node+provenance. Failures
(locked, missing library) surface as ONE quiet notice and never
reject the foreground drop; retries ride the next drop, no
persistent queue in this ticket (§14.4 allows "queue or notice" —
notice is the smaller honest v1, recorded in the epic if queue is
wanted later). Recognition chip: transient, engagement-fade,
apply copies the library's tags to the fresh node (name_key merge).

### Files to Touch

`apps/desktop/src/renderer/canvas/import-surfaces.ts` +
`chrome/` (ask panel, chips); utility mirror verb reusing 090;
`apps/desktop/e2e/inbox-mirror.spec.ts` (new).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] First-drop ask: two buttons, anchored, once per project,
      answer persists to the §11.5 setting; import proceeds
      regardless.
- [ ] Mirror-on: drop lands in the world AND appears in the library
      as an unplaced node with provenance, exactly once (hash
      dedupe); world drop latency unaffected (async, no await in
      the drop path).
- [ ] Recognition: bytes already in library → no copy, transient
      tag-offer chip; apply merges tags onto the fresh node; ignore
      fades with engagement, no dismissal debt; bulk drop → one
      summary chip.
- [ ] Locked/missing library: one quiet notice, foreground drop
      unharmed.
- [ ] e2e: mirror-on drop → library gains the node; duplicate drop
      → recognition path; mirror-off → library untouched.
- [ ] Full gates.

### Acceptance Criteria

**GIVEN** a world with mirror on and a designated library
**WHEN** the artist drops a new image on the board
**THEN** the board gets its pin immediately and the library gains
one unplaced node with provenance; dropping the same file again
mirrors nothing and offers the library's tags as a fading chip.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

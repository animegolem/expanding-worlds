---
node_id: AI-IMP-271
tags:
  - IMP-LIST
  - Implementation
  - persistence
  - library
  - tags
  - field-report
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.65
date_created: 2026-07-10
date_completed:
---


# AI-IMP-271-tag-sync-mirror-edges

## Summary of Issue #1

RFC rev 0.69 §4.8: one tag universe — tags sync wherever a mirror
relationship exists, bidirectional at settle moments, announced
never silent. Nothing implements it: today library tags reach a
project only at drop time (recognition union) and project tags
NEVER reach the library ("he tagged library-imported images and
was surprised the library copies stayed untagged" — the original
field report). The census (2026-07-10, .codex-era Explore run)
fixed tonight's honest scope: there is no stored mirror edge
(content_hash is the only cross-project identity), no inbox
artifact (the mirror is live IPC via the library secondary slot),
and tag_assignment cannot express removals — so v1 is **ADDITIVE
UNION SYNC**: project OPEN pulls library tags for hash-matched
content inward (create-if-missing + assign, announced); proper
CLOSE pushes project tags on hash-matched content outward (same
union, into the library via the existing secondary/utility path);
a project-scope tag DELETE writes a NAME_KEY TOMBSTONE so inbound
sync cannot resurrect it, with a scope dialogue (this project /
also the library) at the delete verb. Done means: alph tags a
library-sourced image in his project, closes properly, opens the
library — the tag is there; the reverse arrives on his next
project open with a "N tags arrived" notice; deleting a tag asks
its scope and deleted stays deleted.

### Out of Scope (all documented in the RFC or queue, not silent)

- Rename/unassignment propagation (undetectable without a sync
  ledger — deferred with the ledger as a named future shape).
- The quiesce "sync now" verb and the library activity-log
  surface (fast-follows; the notice pattern covers v1).
- Categories (EPIC-026 unbuilt; flat name_key sync per the RFC).
- Cross-INSTANCE lock contention (v1 syncs via the same-instance
  secondary slot exactly like the shipped drop-time mirror; a
  library held by another instance = sync skipped + notice).
- Tombstone management UI beyond creation (lifting = a
  fast-follow row in the tag panel; v1 writes them correctly).

### Design/Approach

**Schema (MIGRATION 0010 — 0009 is AI-IMP-261's):**
`tag_sync_tombstone (project_id, name_key, created_at,
PRIMARY KEY(project_id, name_key))`. No CHECK constraints.

**Commands:** `SuppressTagSync { nameKey }` (writes tombstone;
inverse removes it) and `LiftTagSuppression { nameKey }` (the
reverse; used by undo + the future panel row). Handler-validated;
both captured undo verbs.

**The sync loop (one pure-ish module, two directions):**
- Matching: project assets ↔ library assets by content_hash (the
  hasContentHash/ingest union precedent); tags flow between the
  NODES carrying those assets on each side.
- PULL (project open, renderer-orchestrated after init + lazy
  `ensureLibraryOpen`, the mirror.ts pattern): for each matched
  hash, library tag names − project tombstones − already-assigned
  → CreateTag-if-missing + AssignTagToNode through the ordinary
  gateway (undo-exempt? NO — sync writes are SYSTEM writes: run
  checkRevision:false, and classify the batch as exempt-from-undo
  via the existing group/exempt machinery — a user Mod+Z must
  never unwind a sync). Count → ONE board notice ("N tags arrived
  from the library").
- PUSH (proper close, main-process quit ritual beside the
  end-session snapshot, time-bounded the same way; utility still
  live): for each matched hash, project tag names not on the
  library copy → create+assign in the library slot. Also runs on
  the 'rest' snapshot? NO — close only, v1 (rest fires on blur;
  too chatty).
- Announcements: the existing toast/board-notice machinery.

**Delete scope dialogue:** the tag panel's delete verb (and any
other DeleteTag door) gains the RFC's dialogue — "Delete from
this project" → DeleteTag + SuppressTagSync (one undo group);
"Also delete from the library" → the same + a live library-slot
DeleteTag when the library is reachable (disabled-with-reason
when not). Census note: DeleteTag hard-deletes with a verified
RestoreTag inverse — reused as-is.

### Files to Touch

- `packages/persistence/src/migrations/0010-tag-sync-tombstone.ts`
  (+ test) + migrations/index.
- `packages/commands` payloads + `packages/persistence/src/
  handlers/tags.ts`: the two tombstone commands (+ tests).
- New `packages/persistence` (or protocol-level) query:
  `tagSyncPlan` — given the library slot, compute pull/push deltas
  by content_hash (+ tests with two in-memory projects).
- `apps/desktop/src/renderer/chrome/tag-sync.ts` (new): the pull
  orchestration on project ready + notice; reuses mirror.ts's
  ensureLibraryOpen idiom.
- `apps/desktop/src/main/index.ts` quit ritual: bounded push step
  beside runSnapshot('end-session'); utility op for the push.
- Tag panel delete flow: the scope dialogue.
- e2e: two-project fixture — tag in world → close → library has
  it; tag in library → open world → notice + assigned; tombstone
  blocks resurrection; scope dialogue paths.
- `RAG/HUMAN-TESTING.md` (lead) + `CHANGELOG.md`.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Migration 0010 tombstone table; no CHECK; migration test.
- [ ] SuppressTagSync/LiftTagSuppression handlers with verified
      inverses; undo-policy entries; handler tests.
- [ ] The sync planner as a TWO-HANDLE persistence function hosted
      by the utility (which owns primary + library services) —
      an ordinary single-context query cannot compare projects
      (round-1 correction); PULL/PUSH/library-delete exposed as
      NARROW TYPED utility operations, never a generic writable-
      secondary execute door. Delta rules: hash matching,
      tombstone exclusion, already-assigned exclusion; unit tests
      with two real project fixtures. Migration note: 0010 lands
      over the reserved-0009 gap by design — the runner applies
      registered missing ids from the ledger, so a later 0009
      still runs; the gap is documented and tested.
- [ ] PULL on project ready: applied INSIDE the narrow utility
      operation via direct ProjectService envelopes (never
      crossing onCommittedAnywhere — structurally unreachable by
      Mod+Z, per the round-1 ruling superseding the gateway+
      exempt sketch); ONE aggregate notice on a successful delta,
      timed after chrome mount (or via the retained toast store);
      automatic skip is SILENT (no library / unreachable /
      same-dir library are clean no-ops — the round-1 ruling
      superseding this item's earlier notice-on-skip wording).
- [ ] PUSH at proper close: serialized BEFORE the end-session
      snapshot INSIDE the same 15s quit budget (never a second
      budget, never two concurrent utility writers); never traps
      quit; silent skip when unreachable.
- [ ] Delete scope dialogue on the tag panel's delete verb (the
      FIRST DeleteTag affordance in the app — round-1 census):
      project scope = DeleteTag + SuppressTagSync as one
      fail-stop undo group (DeleteTag + both suppression commands
      become group-only); library scope runs the narrow library
      deletion AFTER the local group — on library failure the
      safe local state stays, ONE honest partial-failure notice
      shows, local undo still works, and a later settle re-unions
      (the ratified cross-project undo boundary: local undo never
      reaches across DBs). Panel closes on success. Tombstone
      handlers are STATE-AWARE (refuse already-suppressed/lifted;
      exact tested inverses — never a blind INSERT OR IGNORE).
- [ ] e2e: the alph round trip (world tag → close → library has
      it; library tag → open → announced + assigned; deleted +
      tombstoned stays gone across a sync cycle).
- [ ] Full gates green (check:ci + affected e2e, pipefail).
- [ ] HUMAN-TESTING + CHANGELOG entries.

### Acceptance Criteria

**GIVEN** a project image imported from the designated library
**WHEN** the user assigns it a tag and properly closes the project
**THEN** the library copy carries the tag on the library's next
open
**AND** a tag assigned in the library arrives in the project on
its next open with an announced count
**AND** a tag deleted "from this project" never returns via sync
**AND** a tag deleted "also from the library" is gone on both ends
**AND** no sync write is reachable by the user's Mod+Z
**AND** with no library designated, everything above silently
no-ops except an honest skip notice on explicit paths.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

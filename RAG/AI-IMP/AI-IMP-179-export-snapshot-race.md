---
node_id: AI-IMP-179
tags:
  - IMP-LIST
  - Implementation
  - export
  - persistence
  - reentrancy
  - bug
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.85
date_created: 2026-07-08
---


# AI-IMP-179-export-snapshot-race

## Summary of Issue #1

Severity **P1** (M-04, lead-verified) from the AI-IMP-173 audit
(FAMILY 4). `exportProject` hashes the live `notes/` tree then LAZILY
re-streams the same files; a concurrent idle/rest/quit snapshot can
rewrite a `.md` between the hash and the stream, so the `.ewproj`
ships bytes that don't match its own manifest. Export reports success;
import later refuses with HASH_MISMATCH — discovered only when the
backup is actually needed.

Mechanism: export does `VACUUM INTO` (the DB is safe — atomic snapshot
to a private temp path, never re-read from a mutable location) then
hashes `notes/*.md` (`project-export.ts:150-176`, manifest hash at
`:183`) then yazl re-reads the same files to stream them
(`:224-227`) — two reads of a shared MUTABLE tree with no mutex. The
utility process dispatches messages concurrently
(`apps/desktop/src/utility/index.ts:568-571`, no serialization between
in-flight messages) and exports deliberately do NOT reset the idle
clock (`apps/desktop/src/main/index.ts:134-136`), so during a
multi-minute export the idle timer fires `doSnapshot`, `writeNotesTree`
recomputes §7.8 metadata blocks and rewrites/rmSyncs `.md` files on
metadata drift (`packages/persistence/src/notes-tree.ts:112-163`), and
any `.md` rewritten between hashFile and addFile ships mismatched
bytes. Cites also `apps/desktop/src/main/snapshot.ts:377-396`,
`:427-435`.

Done means: an export is immune to a concurrent notes-tree write by
construction — the archive's manifest always agrees with its own bytes,
and a snapshot landing mid-export can never corrupt the produced
`.ewproj`. Verified by a deterministic test that writes the notes tree
between the hash and the stream.

### Out of Scope

- The concurrent-two-exports temp-dir collision (M-44, P3) — separate;
  a unique per-call temp dir is noted on the master list. This ticket
  is export-vs-snapshot only.
- The GC-vs-export blob hazard (M-46 stub-trap) — EPIC-007's problem
  when it wires the live sweep; only recorded, not fixed here.
- Any change to the DB export path (already immune via VACUUM INTO —
  do not touch it).

### Design/Approach

**Chosen primary: copy `notes/` into the export's private `.tmp-export`
dir first, then hash+stream the COPY.** This matches the pattern that
already protects the DB — the DB is safe precisely because it is
VACUUM-INTO'd to a private temp path and never re-read from a mutable
location. Extending the same "snapshot to private temp, operate on the
immutable copy" discipline to the notes tree makes the hash and the
stream read the SAME frozen bytes by construction; a concurrent
`writeNotesTree` touching the live tree afterward cannot affect the
archive. This is deterministic — no lock-ordering reasoning, no window
to get wrong.

Rejected alternative: serialize export vs `snapshot-write-notes` in the
utility (a mutex/queue on the writer). It works but couples two
subsystems across the utility dispatch, leaves the multi-read pattern
in place, and is harder to prove correct than "operate on a copy." If a
future need arises it can be added on top, but the copy is the fix.

Implementation: after `VACUUM INTO`, `cp -r`/recursively copy the live
`notes/` tree into the export's existing `.tmp-export` staging dir,
then point both the hash pass and yazl's addFile at the copy. Remove
the copy in the same `finally` that already cleans `.tmp-export`.

### Files to Touch

`packages/persistence/src/export/project-export.ts`: copy `notes/` into
`.tmp-export` after VACUUM INTO; hash and stream the copy
(`:150-176`, `:183`, `:224-227`); extend the `finally` cleanup.
`packages/persistence/src/export/project-export.test.ts` (or nearest):
integration test writing the notes tree between hash and stream.
LOC: ~40–70.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] `notes/` is copied into the export's private `.tmp-export` dir
      after `VACUUM INTO`; both the manifest hash and yazl's stream
      read that copy, never the live tree.
- [ ] The copy is cleaned up in the same `finally` as `.tmp-export`.
- [ ] Integration/unit test: a `writeNotesTree` (or equivalent .md
      rewrite) executed between the hash and the stream no longer
      changes the produced archive; manifest and bytes agree.
- [ ] The produced `.ewproj` re-imports without HASH_MISMATCH after
      such a concurrent write.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e (`EW_TEST_HIDDEN_WINDOWS=1`).

### Acceptance Criteria

**Scenario: a snapshot mid-export cannot corrupt the archive.**
**GIVEN** an export in progress that has hashed the notes tree
**WHEN** a snapshot rewrites a `.md` in the live `notes/` tree before
the export streams it
**THEN** the export streams the frozen copy's bytes, matching the
manifest hash
**AND** re-importing the produced `.ewproj` succeeds (no HASH_MISMATCH).

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

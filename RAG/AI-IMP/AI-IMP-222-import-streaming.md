---
node_id: AI-IMP-222
tags:
  - IMP-LIST
  - Implementation
  - import
  - performance
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.65
date_created: 2026-07-09
---


# AI-IMP-222-import-streaming

## Summary of Issue #1

Terra audit (2026-07-09, P2, lead-verified): local image import
(`import-surfaces.ts` ~141) calls `file.arrayBuffer()` — the whole
file buffered in the renderer, then copied across IPC — before the
streaming-designed downstream pipeline ever sees it. A batch drop
of large scans (the hoarder-artist case: 50 × 80MB TIFFs) buffers
serially through renderer memory and can stall the UI thread on
the IPC copy. Done means the renderer hands the main/utility
process a PATH or stream handle where one exists (real file drops
carry paths in Electron via webUtils.getPathForFile), falling back
to buffering ONLY for path-less sources (clipboard paste, some
browser drags) with a size guard that surfaces the §4.7 importer
dialogue instead of silently stalling.

### Out of Scope

- The import pipeline downstream of IPC (already streams).
- URL imports (separate path).
- The drop-ask queue semantics (178, shipped).

### Design/Approach

Verify-first: measure today's renderer memory + main-thread stall
on a synthetic 200MB drop. Then: for DataTransfer file drops, use
Electron's webUtils.getPathForFile (the sanctioned Electron ≥28
path accessor) and pass the path through the existing importAsset
IPC (extend its input to accept `{path}` XOR `{bytes}` — protocol
package change, version the message per §4.7's adapter
discipline). Clipboard/pathless keeps bytes with a named
MAX_RENDERER_BUFFER guard. Measure after; both numbers in the
ticket.

### Files to Touch

`canvas/import-surfaces.ts`, preload/IPC seam + protocol type,
main import handler (accept path), import e2e (path branch +
pathless fallback).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Before/after memory + stall measurements recorded.
- [ ] File drops travel by path; pathless sources guarded by the
      named constant into the importer dialogue.
- [ ] Protocol change versioned; both branches e2e-covered.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a drop of very large source files
**THEN** the renderer's memory stays flat and the UI responsive
while the import pipeline receives them by path — and a pathless
paste beyond the guard asks instead of stalling.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

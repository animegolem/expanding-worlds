---
node_id: AI-IMP-279
tags:
  - IMP-LIST
  - Implementation
  - renderer
  - lifecycle-push
kanban_status: completed
date_completed: 2026-07-12
depends_on: []
parent_epic:
confidence_score: 0.85
date_created: 2026-07-11
---

# AI-IMP-279-three-state-finding-surfaces

## Summary of Issue #1

GR-1 (ratified 10 Jul, `RAG/design/expanding-worlds-lifecycles-1.1
.zip` → "GR-1 The Three-State Rule" — THE NORMATIVE SPEC for this
ticket, with §8.6/rev 0.70's silence budget behind it): every
finding surface draws loading · error · empty-true · empty-filtered
· content as distinct sentences, and a failed query never wears the
empty face. Today every finding surface folds query failure into
"nothing here": GalleryView's refresh catch substitutes [] (~:262),
the library scope leaks the raw "superseded by a newer source-slot
request" string as libraryError (~:383-389), TrashView's query()
returns null and renders empty (~:96-100), SearchPanel has a
no-catch effect stranding stale rows plus a zero-hit blank, and the
outline's empty message doubles as loading. SourcePanel's slot
handshake is the shipped reference pattern (all states present).
Line numbers drift; round 1 verifies. Done means: the GR-1 sentence
ledger implemented verbatim (its table canonizes existing copy and
supplies the new error sentences), one quiet-sentence vehicle
(SourcePanel's .state form; error ink `--ew-danger` + exactly one
retry Button), no spinners anywhere, and GR-1 R5's condition
handoff: a retry failing twice moves to the ⚠ perch (the perch's
first producer contract, rev 0.70 §8.6).

### Out of Scope

- The restore/bulk-verb command paths (trust wave, AI-IMP-221).
- The activity-log surface (deferred with the tags epic).
- Import progress (ImportProgressStrip is ratified as-is).
- New copywriting beyond the ledger's rows.

### Design/Approach

Sweep surface-by-surface against the ledger: gallery (error
sentence + retry; keep the ratified empty copies), library scope
(translate or drop transport strings — raw message to the log),
trash ("Trash couldn't load — try again. Nothing was deleted."),
search (empty: `No matches for "…" — tags need their # prefix.`;
error: "Search stumbled — keep typing or try again."; fix the
unhandled rejection; the :32/:194 type hole rides along), outline
("Reading the outline…" distinct from its empty copy). Extract or
copy SourcePanel's .state sentence form into a small shared
presentational piece if that avoids drift — otherwise repeat the
form and let the e2e pins hold it. Perch handoff: a per-surface
retry counter; second failure registers a condition via the
existing status.ts conditions channel and the surface keeps its
sentence.

### Files to Touch

- `apps/desktop/src/renderer/views/GalleryView.svelte`
- `apps/desktop/src/renderer/views/TrashView.svelte`
- `apps/desktop/src/renderer/chrome/SearchPanel.svelte` (path per
  round-1 verify)
- `apps/desktop/src/renderer/views/OutlineView.svelte`
- `apps/desktop/src/renderer/chrome/status.ts` (condition
  producer only if a seam is missing)
- e2e: per-surface error-state pins (force a failing query through
  the test seam; assert the sentence, not empty), search zero-hit
  copy, outline loading distinct from empty.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Gallery: error sentence + one retry verb; catch no longer
      substitutes an empty index; ratified empties untouched.
- [x] Library scope: transport strings translated to the user's
      frame; raw string logged, never rendered.
- [x] Trash: error sentence with the reassurance clause; null
      query no longer renders empty.
- [x] Search: zero-hit sentence, error sentence, unhandled
      rejection fixed, stale rows cleared; type hole closed.
- [x] Outline: loading sentence distinct from empty.
- [x] Perch producer: second consecutive retry failure registers
      a condition; surface keeps its sentence; condition clears on
      success.
- [x] No spinner anywhere; every new state uses the one quiet-
      sentence vehicle.
- [x] e2e pins per surface; full `CI=true pnpm check` green
      (pipefail, counts read); CHANGELOG [Unreleased];
      HUMAN-TESTING entry (break the library folder and walk the
      surfaces).

### Acceptance Criteria

**GIVEN** any finding surface whose query fails
**WHEN** it renders
**THEN** it states the failure as fact in the user's words with
exactly one retry verb — never the empty message, never a
transport string

**GIVEN** a filter or search with zero hits
**WHEN** the surface renders
**THEN** filtered-empty names the filters and never claims the
world is empty

**GIVEN** a retry that fails twice
**WHEN** the second failure lands
**THEN** the ⚠ perch carries the condition and the surface keeps
its sentence.

### Issues Encountered

- Round-1 verification corrected Outline: it already caught and rendered an
  error, but leaked transport text, had no initial-loading state, and could
  render empty at the same time. The quiet sentence extracted as a
  presentation-only `FindingState`; query lifecycle, retry count, copy, and
  perch ownership remain local to each surface.

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

---
node_id: AI-IMP-236
tags:
  - IMP-LIST
  - Implementation
  - gallery
  - chrome
  - P3
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.75
date_created: 2026-07-09
---


# AI-IMP-236-source-slot-epochs

## Summary of Issue #1

Sol audit CA-013 + CA-014 (P3, same subsystem): (1) source-slot
release during a PENDING first acquire does nothing — holder is
null so release returns, the late open then installs the closed
surface as holder and leaks the secondary handle (source-slot.ts
~28-78); stricter platforms then block move/delete of that
source. (2) GalleryView's `openLibrary` awaits `settings.setApp`
without rechecking scope — returning to "this world" during that
write closes the slot, then the stale continuation sets
`sourceOpen = true` on a closed source, and the flag being
already-true means no corrective edge ever fires (~315-392). Done
means pending acquisition is explicit state a release can
invalidate (a superseded successful open closes itself), every
await in the gallery's open path rechecks operation epoch + scope
before writing state, and both interleavings are pinned by tests.

### Out of Scope

- Everything-scope UX (shipped semantics unchanged).

### Design/Approach

Source-slot: model `pending: {epoch} | null` alongside holder;
release bumps epoch AND clears pending; a resolving open whose
epoch is stale closes the handle it just opened and installs
nothing. Gallery: capture epoch before each await, recheck after
(the 184 generation-guard idiom); on stale, close/no-op; derive
`sourceOpen` from the slot's actual state rather than assigning
true blindly (the "assign from a successful open" rule from the
audit). Unit the slot interleavings; e2e the quick open-close
gallery flow.

### Files to Touch

`chrome/source-slot.ts` + spec, `views/GalleryView.svelte`,
gallery e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Pending acquisition releasable; superseded opens
      self-close; no leaked handles under open→close races.
- [ ] Gallery epoch-rechecks after every await; sourceOpen
      derived, not assumed.
- [ ] Interleaving tests for both defects.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** rapid open/close of the Everything scope
**THEN** no source handle leaks and the scope's open state always
reflects reality.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

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

- [x] Pending acquisition releasable; superseded opens
      self-close; no leaked handles under open→close races.
- [x] Gallery epoch-rechecks after every await; sourceOpen
      derived, not assumed.
- [x] Interleaving tests for both defects.
- [x] Gates: build, per-package units, lint, e2e in 4+ foreground
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

- **The transport is a singleton, so a superseded open cannot close
  blindly.** `ew.secondary.close('source')` closes whatever source is
  open, not a per-call handle. Closing on every supersede would stomp a
  NEWER acquire whose `open` already replaced the transport
  (replace-on-open at the utility). Resolved by a `lastAcquireEpoch`
  guard: a superseded successful open closes only when no acquire
  followed it (i.e. only releases advanced the epoch) — otherwise the
  newer owner's transport is left alone. `closeSecondary` is idempotent
  (`?.close()` + null), so the residual double-close in same-owner
  re-acquire+release races is harmless.
- **The pending-only release deliberately does NOT close.** It bumps the
  epoch and drops the pending record; the in-flight open's own
  continuation performs the close (it alone knows whether a newer
  acquire replaced it via the guard above). This keeps the leaked-handle
  close in exactly one place.
- **Gallery: the stale-continuation recheck returns WITHOUT releasing.**
  `SLOT_OWNER` is the constant `'gallery'`, so `sourceSlotHolder()`
  cannot distinguish this acquire's holder from a re-entered
  everything's fresh gallery-owned holder. Releasing on the stale path
  would stomp that re-entered slot; instead `leaveEverything` already
  released ours, so the continuation just returns. `sourceOpen` is
  derived from `sourceSlotHolder()?.ownerId === SLOT_OWNER` rather than
  asserted true.
- **Interleavings pinned by 6 unit tests** (`source-slot.test.ts`) with a
  hand-resolved open/close mock: plain acquire/release, CA-013 (release
  during the pending first acquire → the late open closes and installs
  no holder), superseded-failed-open closes nothing, a newer acquire
  superseding an older pending open (no close — replace-on-open owns it),
  cross-owner eviction + no-stomp release, and release-then-reacquire
  under the same owner. One e2e (`gallery-scope.spec.ts`) races a
  this-world flip against a store=true library open and asserts the
  scope state stays honest.
- **Pre-existing e2e noise, not from this ticket:** `decorations.spec.ts`
  fails on `window.queryLocalFonts()` returning ≤3 fonts in the hidden-
  window environment (AI-IMP-037 family picker) — unrelated modules.
  `source-panel.spec.ts` flaked once on a drag-out place-point timing
  then passed; a 3× no-retry re-run of the whole file (including the
  gallery↔panel eviction case) was 6/6 green, so the slot changes did
  not destabilise it.

---
node_id: AI-IMP-066
tags:
  - IMP-LIST
  - Implementation
  - shell
  - status
kanban_status: planned
depends_on: [AI-IMP-059]
parent_epic: [[AI-EPIC-006-shell-and-local-scope]]
confidence_score: 0.8
date_created: 2026-07-05
date_completed:
---

# AI-IMP-066-toasts-and-perch

## Summary of Issue #1

Status lives in the interim docked StatusStrip (service state,
ping), and board notices are ad-hoc `ew-board-notice` events. RFC
§8.6 wants transitions as toasts (enter and resolve) and ongoing
conditions on a perch: a ⚠ charm appended below the mode rail that
exists exactly as long as a condition holds, pulses once on
arrival, opens a detail panel anchored to itself, and stacks
multiple conditions as one charm with a count. The §11.4
no-silent-hang requirement surfaces here — a transient toast alone
never satisfies it. The StatusStrip retires in this ticket and
recovery.spec retargets from the `service-status` testid to the
perch. Covers FR-12. Done when no persistent status chrome exists
and the recovery suite passes against toasts + perch.

### Out of Scope

New condition sources beyond what the StatusStrip and existing
notices already surface (service restarting/down, integrity
errors, command failures). Notification history. EPIC-013
takeover surfaces.

### Design/Approach

A `status.ts` store with two vocabularies: `toast(message, kind)`
for transitions (auto-dissolving stack, bottom edge, cadence-aware)
and `condition(id).raise(detail)/clear()` for ongoing states. The
utility-process lifecycle events the StatusStrip consumes today
(service down/restarting → raise; healthy → clear + resolution
toast) remap onto conditions. `ew-board-notice` call sites migrate
to `toast()` — one notice grammar app-wide. Perch: CharmRail
appends ⚠ only while conditions exist (no reserved space), one
pulse animation on arrival, count badge when >1, click opens a
detail panel anchored to the charm listing each condition's
detail. recovery.spec (78 lines, kills the utility process and
watches recovery) retargets: assert perch appears with the
condition, then clears and a resolution toast fires when the
service returns. StatusStrip.svelte and its grid row delete.

### Files to Touch

`apps/desktop/src/renderer/chrome/status.ts` (new store),
`Toasts.svelte`, perch section in `CharmRail.svelte` + anchored
`ConditionPanel.svelte`.
`apps/desktop/src/renderer/StatusStrip.svelte`: deleted;
`App.svelte` grid row removed.
`apps/desktop/src/renderer/canvas/host.ts` and other
`ew-board-notice` emitters/listeners: migrate to toast API.
`apps/desktop/e2e/recovery.spec.ts`: retarget to perch/toast
testids; `shell.spec.ts` status assertions updated.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] status.ts: toast stack with auto-dissolve + condition
      registry with raise/clear; unit tests for stacking, count,
      and clear-removes-slot.
- [ ] Toasts render bottom-edge, transient, cadence-aware; enter
      AND resolve transitions covered for service lifecycle.
- [ ] Perch: ⚠ appends below the rail only while ≥1 condition
      holds; single pulse on arrival; count badge for multiples;
      zero reserved space when clear.
- [ ] Detail panel anchored to the charm lists conditions with
      their detail text; closes on Esc/click-away; charm remains
      while conditions hold.
- [ ] Service lifecycle wired: kill → condition raised (perch
      visible through the outage, satisfying §11.4); recovery →
      condition cleared + resolution toast.
- [ ] All ew-board-notice sites migrated to toast(); event
      removed; `pnpm -r build` green.
- [ ] StatusStrip deleted, App grid updated; recovery.spec
      retargeted and green; full desktop e2e green hidden-window.

### Acceptance Criteria

**GIVEN** the utility process is killed
**WHEN** the outage persists
**THEN** the ⚠ perch exists (pulsed once on arrival) for the whole
outage and its panel names the condition.

**GIVEN** the service recovers
**WHEN** the condition clears
**THEN** the perch vanishes leaving no reserved space and a
resolution toast fires.

**GIVEN** two simultaneous conditions
**WHEN** the rail renders
**THEN** one ⚠ charm shows a count of 2 and the panel lists both.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

---
node_id: AI-IMP-224
tags:
  - IMP-LIST
  - Implementation
  - session
  - snapshots
  - design-first
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.6
date_created: 2026-07-09
---


# AI-IMP-224-end-session

## Summary of Issue #1

Terra lifecycle review (2026-07-09) + earlier audit: the full
snapshot/checkpoint/lock-release ritual exists and runs — but ONLY
on quit. The visibly named **End Session** control
(MenuPopover.svelte) is disabled, so no user can deliberately
close a session without exiting the app, which blocks the intended
clean sync boundary and makes some ticket/testing wording untruthful
(docs speak as if End Session is live). Done means End Session is
a real end-to-end verb: click → the same ritual quit runs
(snapshot episode, checkpoint, writer-lock release) → a DEFINED
post-session state — which is the design decision that gates this
ticket (DESIGN-QUEUE "Lifecycle closure decisions" Q4: project
chooser vs closed-project shell vs app exit), plus what work is
deliberately excluded from that first surface (e.g. future vault
pull-back). No build until Q4 is ruled.

### Out of Scope

- Snapshot/push machinery (shipped; this is the missing doorway).
- Vault-mirror return path (deferred scope; the post-session
  surface only reserves its place).
- Multi-project management beyond whatever Q4's ruling names.

### Design/Approach

After Q4: wire the menu row to the existing quit-episode sequence
factored into a reusable "close session" op (main owns it; the
renderer requests). Post-session state per ruling. The row's
disabled state and tooltip retire; docs/tests that pretended it
was live get truthed. E2e: End Session → ritual runs (snapshot
count bumps, lock released — assert via a second open) → the ruled
surface shows; reopening the project works and recovery stays
quiet.

### Files to Touch

`chrome/MenuPopover.svelte`, main session/quit-episode seam, the
ruled post-session surface (new or existing), session/snapshot
e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Q4 ruled and recorded (post-session state + exclusions).
- [ ] End Session runs the full ritual and lands on the ruled
      surface; lock provably released; reopen clean.
- [ ] Stale "End Session is live" wording in docs/tests truthed.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead (this is
      session 2's trust beat — end, reopen, everything where he
      left it).

### Acceptance Criteria

**GIVEN** an open project with unsaved-feeling recent work
**WHEN** the user clicks End Session
**THEN** the snapshot/checkpoint/release ritual completes, the
ruled post-session surface appears, and reopening finds every
piece of work exactly where it was — without ever quitting the
app.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

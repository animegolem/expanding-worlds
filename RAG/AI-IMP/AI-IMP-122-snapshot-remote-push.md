---
node_id: AI-IMP-122
tags:
  - IMP-LIST
  - Implementation
  - backup
  - settings
kanban_status: planned
depends_on: [AI-IMP-120]
parent_epic: [[AI-EPIC-008-export-import-signoff]]
confidence_score: 0.65
date_created: 2026-07-06
date_completed:
---


# AI-IMP-122-snapshot-remote-push

## Summary of Issue #1

Rev 0.52 §11.4: the "commit + push" snapshot variant targets a
user-configured remote, as an Advanced setting, off by default.
Done means: with a remote URL configured and mode set to
commit + push, every snapshot ends with a push; failures never
block the session ritual (toast + perch per §8.6, retry at next
snapshot); the setting reads as deliberate opt-in per the
constitution (nothing network-shaped is ambient).

### Out of Scope

- Hosting-provider integrations, OAuth flows, repo creation — the
  user supplies an existing remote URL.
- Credential storage: authentication is the system's (ssh agent /
  git credential helper). We never store secrets.
- Pull/merge/two-way sync of any kind — push-only mirror.
- Connector-based cloud backup (EPIC-020 territory).

### Design/Approach

Push rides the git mechanics layer from AI-IMP-120 — NOTE: if 120
picked the bundled fallback for machines without system git,
push-over-ssh may be unavailable there; feature-detect and state
it in the setting UI (push requires system git unless the
benchmark decision says otherwise — record the resolution in
Issues Encountered). Advanced Settings section gains: remote URL
field with a Validate/Test connection action (ls-remote), mode
already stored by 120. Push runs async after the commit
completes; End Session does not wait on the network — the ritual
finishes locally and the push continues in the perch (ongoing
state), so a dead network never holds the put-it-away moment
hostage. Failure: toast once, perch shows unpushed-snapshots
count, next snapshot retries. Never `<datalist>` for URL entry.

### Files to Touch

`apps/desktop/src/main/` push step in the snapshot service.
`packages/protocol/src/index.ts`: remote config, test-connection,
push-state events.
`apps/desktop/src/preload/index.ts`: bridge.
`apps/desktop/src/renderer/views/SettingsView.svelte`: Advanced
rows (URL, test, status).
`apps/desktop/src/renderer/chrome/` perch wiring for push state.
`apps/desktop/e2e/` push spec against a local bare repo as remote.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Remote config: URL persisted per-project; Test connection
      action with clear success/failure copy; Advanced section
      placement, off by default.
- [ ] Push step: async after commit; End Session completes locally
      without waiting on the network; perch carries ongoing push
      state.
- [ ] Failure path: single toast, perch unpushed count, retry on
      next snapshot; no ritual blocking, no repeated nagging.
- [ ] Feature detection: push availability honestly surfaced per
      the 120 mechanics decision.
- [ ] E2E: local bare repo as remote — snapshot pushes; kill the
      remote → ritual still completes, perch shows debt, restoring
      the remote clears it at the next snapshot.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm -r lint`,
      desktop e2e hidden.
- [ ] HUMAN-TESTING entry appended (does opt-in read clearly; does
      End Session stay instant with a slow remote).

### Acceptance Criteria

**Scenario:** Off-machine backup.
**GIVEN** snapshots set to commit + push with a valid remote
**WHEN** a snapshot fires
**THEN** the commit lands locally and the push completes in the
background, visible in the perch until done.
**WHEN** the remote is unreachable
**THEN** End Session still completes immediately, one toast
reports the failure, the perch shows unpushed snapshots, and the
next snapshot retries.
**GIVEN** the setting is untouched
**THEN** nothing network-shaped ever runs.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

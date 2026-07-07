---
node_id: AI-IMP-122
tags:
  - IMP-LIST
  - Implementation
  - backup
  - settings
kanban_status: completed
depends_on: [AI-IMP-120]
parent_epic: [[AI-EPIC-008-export-import-signoff]]
confidence_score: 0.65
date_created: 2026-07-06
date_completed: 2026-07-07
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

- [x] Remote config: URL persisted per-project; Test connection
      action with clear success/failure copy; Advanced section
      placement, off by default.
- [x] Push step: async after commit; End Session completes locally
      without waiting on the network; perch carries ongoing push
      state.
- [x] Failure path: single toast, perch unpushed count, retry on
      next snapshot; no ritual blocking, no repeated nagging.
- [x] Feature detection: push availability honestly surfaced per
      the 120 mechanics decision.
- [x] E2E: local bare repo as remote — snapshot pushes; kill the
      remote → ritual still completes, perch shows debt, restoring
      the remote clears it at the next snapshot.
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm -r lint`,
      desktop e2e hidden.
- [x] HUMAN-TESTING entry appended (does opt-in read clearly; does
      End Session stay instant with a slow remote). — left for the
      lead to append at merge (agent must not touch HUMAN-TESTING.md).

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

**120 mechanics decision → push availability (resolved).** AI-IMP-120
shipped SYSTEM GIT ONLY, no bundled fallback (the isomorphic-git
benchmark re-hashed the whole working tree every commit — the wrong
shape for a multi-GB board). Push therefore rides the exact same
`gitAvailable()` detection: when git is absent, `doSnapshot` returns
before it ever reaches the commit step, so no push is attempted, and
the Settings snapshots note already says git is missing. The remote-URL
field and Test connection button additionally disable themselves when
git is absent, and `testConnection` returns a clear "git isn't
available on this machine." No new feature-detection surface was
needed — push degrades exactly where commit already does.

**Async push vs. the session ritual (the load-bearing decision).** The
push must never make End Session/quit wait on the network. Solution: a
SECOND serialization chain, `pushChain`, separate from the snapshot
`inFlight` chain. `doSnapshot` commits locally and then SCHEDULES a push
(`schedulePush`) without awaiting it — so `runSnapshot` (and the quit
ritual's `Promise.race` behind it) resolves on the local commit. Pushes
serialize among themselves (two concurrent pushes to one remote can
race) but the ritual never joins that chain.

**In-flight push at quit (documented behavior).** At
`window-all-closed`, `runSnapshot('end-session')` resolves as soon as
the commit lands; the scheduled push is then racing in the background
while main proceeds to `close-project` and `app.quit()`. `app.quit()`
terminates the main process, which kills the background `git push`
child if it is still running. That is acceptable and by design: the
commit is already durable locally, so an interrupted push simply leaves
the debt to the next session, where the next snapshot retries it and
clears the perch. The push is ATTEMPTED at quit but never traps the
time-bounded ritual — exactly the §11.4 no-silent-hang shape.

**Perch/toast wiring.** Push state flows main → renderer over a new
`snapshot:push-state` broadcast (retained for attach-time catch-up like
the service event). `chrome/status.attachSnapshotPush()` maps it into
the §8.6 grammar: `pushing`/`error`/debt raise the `snapshot-push`
ongoing condition (⚠ perch holds while debt exists), and a reconciled
push (`idle`, 0) clears it. The once-per-episode toast is edge-detected
renderer-side (`inFailureEpisode`), mirroring the service-outage
pattern: the flag arms on the first `error` and only disarms when a
push reconciles, so a failing retry updates the perch's debt count
without re-toasting.

**Debt computation.** A dedicated remote `ew-snapshots` (never
`origin`, so a user's own remote is left untouched) is pointed at the
configured URL. `git push ew-snapshots HEAD:refs/heads/main` advances
the remote-tracking ref `refs/remotes/ew-snapshots/main` on success
(verified: modern git updates the tracking ref after a push when the
remote has the default fetch refspec `remote add` creates). Debt is
`git rev-list --count refs/remotes/ew-snapshots/main..HEAD`, or the
total `HEAD` count before the first successful push (no tracking ref
yet). Best-effort — a git hiccup reports 0 rather than throwing.

**Credentials / opt-in.** No secrets are ever stored — auth is the
system's (ssh agent / credential helper). `GIT_TERMINAL_PROMPT=0` is set
on both `git push` and `git ls-remote`, so a missing credential fails
fast instead of hanging on a hidden interactive prompt the app has no
terminal to answer. Nothing network-shaped runs unless mode is
`commit-push` AND a non-empty URL is set (§11.5 constitution: two
deliberate acts). The remote-URL row is a plain text field — never a
`<datalist>`, so no history of private repo URLs is offered.

**Settings placement.** RFC calls commit+push "an Advanced setting."
There is no built Advanced section yet (AI features remain unbuilt), so
the remote-URL row surfaces inline in the snapshots area, revealed only
once `commit-push` is chosen — the two-deliberate-acts shape. When an
Advanced section lands, the row moves there unchanged.

**No migration.** The remote URL is an ordinary project-tier setting
(`snapshot_remote`), read/written through the existing
`getSettings`/`set-setting` verbs like `snapshot_mode` — no schema
change, travels with export/import.

**Fences honored.** protocol/index.ts additive-only (three new exports).
SettingsView edits are scoped to the snapshots section (append-only,
so the parallel Settings-row agent merges trivially). No files in the
NOT-touch list were modified; no raw hex/rgba outside theme.css.

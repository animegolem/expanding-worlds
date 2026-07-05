---
node_id: AI-IMP-057
tags:
  - IMP-LIST
  - Implementation
  - hardening
  - testing
kanban_status: completed
depends_on:
parent_epic: [[AI-EPIC-012-pre-alpha-hardening]]
confidence_score: 0.85
date_created: 2026-07-05
date_completed: 2026-07-05
---

# AI-IMP-057-ssrf-guard-and-e2e-helpers

## Summary of Issue #1

Two review items. Gemini: fetchUrlForImport will fetch loopback and
private-range addresses (SSRF class; low severity on a desktop app —
user-initiated, user's own machine — but a cheap guard against a
dropped link poking router admin panels or the dev server). Codex-
adjacent: five e2e specs hand-roll the command envelope and project
lookup inline, inviting copy-paste drift. Done when private/loopback
targets are rejected with a clear message (including
post-resolution) and a shared e2e helper module exists with
notes.spec migrated.

### Out of Scope

Full DNS-rebinding defense (TOCTOU between our lookup and net.fetch
is accepted at this threat level; noted in code). Migrating every
old spec (opportunistic later). Proxy handling.

### Design/Approach

Guard in main: after URL parse, reject non-http(s) (exists),
hostnames that are IP literals in loopback/private/link-local/ULA
ranges, `localhost`/`*.localhost`, then `dns.promises.lookup(host,
{all:true})` and reject if ANY resolved address is in those ranges.
Ranges: 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, ::1, fc00/7,
fe80/10, plus 0.0.0.0/unspecified. Unit-testable pure function
`isPrivateAddress(ip)` + `assertPublicHost(url)` exported from a
small `main/net-guard.ts` (main has no unit runner, so the pure
parts get exercised through the e2e import-rejection path plus a
node --test? Keep pragmatic: e2e asserts the rejection message for
a loopback URL). Helpers: `apps/desktop/e2e/helpers.ts` exporting
`launchApp(prefix)`, `exec(win, type, payload)`, `runQuery(win,
name, args)`, `revision(win)`; notes.spec migrates fully.

### Files to Touch

`apps/desktop/src/main/net-guard.ts`: new guard module.
`apps/desktop/src/main/index.ts`: wire into fetchUrlForImport.
`apps/desktop/e2e/helpers.ts`: new shared helpers.
`apps/desktop/e2e/notes.spec.ts`: migrate to helpers.
`apps/desktop/e2e/import.spec.ts`: loopback-rejection assertion.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] net-guard rejects IP-literal and resolved loopback/private/
      link-local/ULA targets with a clear message; public hosts
      unaffected.
- [x] fetchUrlForImport calls the guard before fetching; e2e
      asserts a loopback URL drop is rejected with the notice and
      zero records.
- [x] e2e/helpers.ts with launchApp/exec/runQuery/revision;
      notes.spec fully migrated, behavior identical.
- [x] Gates green locally and on CI.

### Acceptance Criteria

**GIVEN** a URL-only drop of http://127.0.0.1:5173/x.png
**WHEN** the import pipeline runs
**THEN** the fetch is refused with a clear non-blocking notice and
no asset/node/placement records are created.

**GIVEN** notes.spec after migration
**WHEN** the suite runs locally and on CI
**THEN** all tests pass unchanged in coverage.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
The guard needed a test-only bypass (EW_TEST_ALLOW_PRIVATE_FETCH=1)
because the import spec's SUCCESS path legitimately serves fixtures
from 127.0.0.1; the rejection is asserted in a separate launch
without the bypass (loopback URL -> "private or local" notice, zero
records). notes.spec migrated fully to the new helpers (launchApp /
launchAppInDir / exec / runQuery / revision / seedPlacedNote) —
zero inline envelopes or raw query calls remain in it; other specs
migrate opportunistically. The full-suite run after migration
surfaced one more latent sync-read race in slice.spec (synchronous
decorationVisible read after an async scene apply) — converted to a
poll; suite green 38/38.

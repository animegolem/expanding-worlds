---
node_id: AI-IMP-124
tags:
  - IMP-LIST
  - Implementation
  - security
  - import
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.9
date_created: 2026-07-06
date_completed:
---


# AI-IMP-124-url-import-redirect-guard

## Summary of Issue #1

Confirmed Codex finding (2026-07-06 review, round 2). The URL-import
SSRF guard (AI-IMP-057) validates only the INITIAL URL:
`fetchUrlForImport` runs `assertPublicHost` once
(`apps/desktop/src/main/index.ts:373`), then calls `net.fetch` with
default redirect behavior. A public URL that 302s to loopback,
RFC1918, link-local, or a cloud-metadata address is fetched without
revalidation. The guard's documented residual risk covers the
DNS TOCTOU only — redirect hops are a distinct, unaccepted bypass.
Done means: every redirect hop is revalidated with the same guard
before it is followed, hops are capped, and a redirect to a private
target fails with the same user-facing refusal as a direct one.

### Out of Scope

- Tightening the DNS TOCTOU (explicitly accepted in net-guard.ts —
  desktop, user-initiated threat model).
- Content-type/size policy changes (existing limits stand).
- The `EW_TEST_ALLOW_PRIVATE_FETCH` e2e bypass (must keep working —
  fixtures serve from 127.0.0.1).

### Design/Approach

Switch `net.fetch` to `redirect: 'manual'` and follow Location
headers in a loop: parse the target (relative resolved against the
current URL), re-run the protocol check and `assertPublicHost` on
each hop, cap at 5 hops, and fail closed on a missing/invalid
Location. The loop lives beside `fetchUrlForImport`; the existing
timeout/abort controller spans the whole chain. Unit-test the hop
logic by extracting it into a small pure helper
(`resolveRedirectTarget(current, location)`), and cover the guard
behavior with a vitest exercising a local redirecting server (public
hop allowed → private hop refused) under
`EW_TEST_ALLOW_PRIVATE_FETCH` variations, or with the helper +
guard units if a live server proves flaky in CI.

### Files to Touch

`apps/desktop/src/main/index.ts`: manual-redirect fetch loop.
`apps/desktop/src/main/net-guard.ts`: hop-resolution helper (+ note
that redirects are now revalidated).
`apps/desktop/src/main/net-guard.test.ts` (or existing test home):
units for hop resolution and private-hop refusal.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Manual-redirect loop: Location parsed/resolved, protocol
      re-checked, `assertPublicHost` re-run per hop, 5-hop cap,
      fail-closed on malformed Location.
- [ ] `EW_TEST_ALLOW_PRIVATE_FETCH=1` still bypasses (e2e fixtures
      unaffected — full desktop e2e proves it).
- [ ] Units: public→private redirect refused with the standard
      refusal message; relative Location resolution; hop-cap.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.

### Acceptance Criteria

**GIVEN** a URL import whose target responds 302 to a private or
loopback address
**WHEN** the fetch runs
**THEN** the import fails with the standard private-address refusal
and no request is sent to the private target.
**GIVEN** a URL import with a chain of public redirects (≤5)
**THEN** the import succeeds as before.
**GIVEN** the e2e fixture flag `EW_TEST_ALLOW_PRIVATE_FETCH=1`
**THEN** 127.0.0.1 fixtures fetch exactly as today.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

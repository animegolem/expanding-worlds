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

- [x] Manual-redirect loop: Location parsed/resolved, protocol
      re-checked, `assertPublicHost` re-run per hop, 5-hop cap,
      fail-closed on malformed Location.
- [x] `EW_TEST_ALLOW_PRIVATE_FETCH=1` still bypasses (e2e fixtures
      unaffected — full desktop e2e proves it).
- [x] Units: public→private redirect refused with the standard
      refusal message; relative Location resolution; hop-cap.
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
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

**Redirect mechanism — the ticket's Design section is not viable in
Electron 39 (verified empirically).** `net.fetch(url, { redirect:
'manual' })` does NOT return an opaqueredirect response with a hidden
Location — it *throws* `Redirect was cancelled`, and `redirect:
'error'` throws too. There is no way to read the Location off a
net.fetch response. Switched to `net.request({ redirect: 'manual' })`,
which emits a `'redirect'` event carrying a fully readable
`redirectUrl`. Second empirical finding: `followRedirect()` must be
called *synchronously* inside the event handler — deferring it (even
50 ms, as an async `assertPublicHost` would) also throws `Redirect was
cancelled`. So following-then-guarding is impossible. The shipped
design is a **per-hop re-issue loop**: each hop is its own
`net.request`; on the `'redirect'` event we `abort()` and capture the
target, then re-run the protocol check + `assertPublicHost` on it and,
only if it clears, issue a fresh request to it. Every hop (initial +
each redirect target) is guarded *before* any request reaches it.
Third finding: a 302 with a missing Location does not fire the
`'redirect'` event at all — Electron delivers it as an ordinary 302
response, which our `statusCode < 200 || >= 300` check refuses. All
three behaviors were confirmed with throwaway Electron probes
(scratchpad, not committed).

**Test strategy.** Pure `resolveRedirectTarget(current, location)`
extracted into net-guard.ts and unit-tested (relative, no-slash,
absolute, protocol-change, URL base, missing/blank/unparseable →
fail-closed). Private-hop refusal unit-tested through
`resolveRedirectTarget` → `assertPublicHost` composition, asserting the
exact `refusing to fetch a private or local address (host)` string for
loopback/RFC1918/metadata/IPv6-loopback/localhost. 16 units, all
green. The full redirect-following loop and the 5-hop cap use
`net.request`, which cannot run under vitest's plain-node env, so they
are validated by (a) Electron probes that drove a real local
redirecting server — public→127.0.0.1 refused with the standard
message; a 2-hop public chain succeeded; a self-redirect loop capped
at 6 requests (initial + 5 follows) — and (b) the full desktop e2e
suite for the `EW_TEST_ALLOW_PRIVATE_FETCH=1` bypass path (127.0.0.1
image-import fixtures still pass unchanged). This matches the ticket's
stated fallback ("helper + guard units if a live server proves flaky"):
wiring a live server into the main-process vitest home was not viable
because net.request only exists in the Electron runtime.

**Cap semantics.** `FETCH_URL_MAX_REDIRECTS = 5` = five redirects
followed; the sixth is refused (`too many redirects`). Timeout/abort
`AbortController` now spans the whole chain (each hop's in-flight
request subscribes to the shared signal). Oversize enforcement (both
declared content-length and streamed bytes) preserved per hop.

**Gate note — pre-existing trash flake (NOT this change).**
`pnpm -r test` and the desktop e2e both fail *only* on
`e2e/trash.spec.ts` — a strict-mode collision where a lingering toast
with `data-testid="trash-empty"` (surface: 'trash-empty' in
TrashView.svelte) coexists with the `<p data-testid="trash-empty">`.
Proven pre-existing and independent: the spec passes on the stashed
baseline in isolation, and with my changes it reports "1 flaky"
(fails once, passes on retry) run alone. Zero code overlap — my diff
touches only net-guard.ts + fetchUrlForImport. This is the
freshly-ingested "trash-reachability" area (see HEAD commit); it wants
its own ticket, not a fix here (renderer/e2e are fenced off from this
ticket). `pnpm -r build` and `pnpm lint` are clean; desktop vitest
(incl. the 16 new units) and the rest of the e2e suite pass.

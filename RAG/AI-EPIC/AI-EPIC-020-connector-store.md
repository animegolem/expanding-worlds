---
node_id: AI-EPIC-020
tags:
  - EPIC
  - AI
  - connectors
  - import
date_created: 2026-07-06
date_completed:
kanban_status: backlog
AI_IMP_spawned:
---

# AI-EPIC-020-connector-store

> The VALVE epic, stubbed 2026-07-06 at the strategy review: the
> product strategy routes non-core novelty to the connector store —
> which only works if the store exists. This epic is the STORE
> INFRASTRUCTURE; individual connectors stay deferred behind it and
> ship on their own schedules.

## Problem Statement/Feature Scope

Revs 0.33–0.44 shaped six connector citizens (booru drops,
Pinterest, external-library browse, the page picker, reverse image
search, AI text verbs) plus the link router and the AI-connectors
gate — all musings with no load-bearing registry to plug into.
This epic builds: the connector MANIFEST shape (id, version, URL
patterns for the router, declared capabilities incl. the AI flag,
network endpoints); the ATTACH/DETACH surface in settings (§11.5 —
the AI section behind the master toggle, per rev 0.44); the LINK
ROUTER implementation (rev 0.42 — one dispatch door, attached
patterns → direct image → page-picker dialogue); and the §15
NETWORK AMENDMENT (attachment IS consent for that connector's
traffic; nothing fetches unattached — enforced at the router and
at main's net guard).

## Proposed Solution(s)

To be cut at activation. Likely order: manifest + registry →
router → settings surface → net-guard integration → the FIRST
concrete connector as proof (candidate: the page picker — no
external API, exercises fetch/consent/dialogue end to end).

**Malicious-plugin containment (owner concern, 2026-07-06 — the
execution-model ladder, decided direction before any store
opens):** the day-one answer is that v1 connectors carry NO CODE —
a declarative manifest (URL patterns, endpoint templates, response
mappings) interpreted by our router covers the fetch-shaped
connector family, and zero code means zero sandbox problem. The
main-process net guard stays the exfiltration choke point under
every model (nothing fetches hosts outside the attached
manifest). When connectors genuinely need logic: preferred
container is a WASM host in the utility process (Extism-style —
authors write JS, it executes inside a QuickJS-in-WASM
interpreter), because WASM is capability-based by construction:
the module can only call host functions we hand it (fetch
mediated by the net guard; no fs, no spawn) with memory/fuel
limits. For connectors that must render or scrape live pages, the
pragmatic middle is a hidden sandboxed BrowserWindow/webview
(contextIsolation, no Node, CSP, per-window webRequest pinned to
declared hosts) — Chromium's renderer sandbox is the same boundary
Chrome trusts for hostile web content. RULED OUT: Firecracker/
microVMs (Linux-KVM server tech, wrong platform for a desktop
app) and raw in-process JS for third-party code (Node context =
game over). Store-side signing/review is a social layer on top,
not a substitute.

## Path(s) Not Taken

No community distribution in this epic (packaging/signing/store
listing is its own future problem — the AI-flag rule for
contributions is recorded at §11.5 rev 0.44). No connector ships
here beyond the proof.

## Success Metrics

To be firmed; candidates: a URL drop matching an attached pattern
routes to its connector, the same drop with the connector detached
falls through to the dialogue, and no network call ever leaves for
an unattached host (net-guard test).

## Requirements

### Functional Requirements

- [ ] To be cut at activation.

### Non-Functional Requirements

- The never-fetch-unattached rule is enforced in the router AND
  the main-process net guard (defense in depth).

## Implementation Breakdown

IMPs to be cut when this epic activates.

---
node_id: AI-IMP-162
tags:
  - IMP-LIST
  - Implementation
  - security
  - review
kanban_status: completed
depends_on: [AI-IMP-158]
parent_epic:
confidence_score: 0.9
date_created: 2026-07-07
date_completed: 2026-07-07
---


# AI-IMP-162-codex-round2-net-guard-import

## Summary of Issue #1

Codex review round 2, the two findings the lead owns. P1: the URL
import SSRF guard mishandles WHATWG URL's normalization of
v4-mapped IPv6 literals — `new URL("http://[::ffff:127.0.0.1]/")`
yields hostname `[::ffff:7f00:1]`, whose HEX-form tail fell through
every range check as public, so a dropped link could fetch loopback
and private targets (REPRODUCED). P2: `.ewproj` import verified
archive↔manifest byte integrity but never bound the DATABASE to its
blobs or checked its internal consistency before the rename — a
manifest-consistent crafted archive whose db references media it
does not carry imported as a project full of holes, caught only by
later recovery. Done means both are fixed with regression tests and
full gates.

### Out of Scope

- The other four findings of the round: owner-trashed read models
  (AI-IMP-163), connector-anchor undo (AI-IMP-164), decoration verb
  capture (AI-IMP-154, in flight), RenameNote capture breadth
  (DESIGN-QUEUE).

### Design/Approach

net-guard: in the v4-mapped branch, map the HEX-group tail back to
its embedded dotted IPv4 before range-checking; normalize the
uncompressed resolver spelling (`0:0:0:0:0:ffff:`); any mapped form
we don't recognize fails CLOSED. Import: after extraction, before
the rename — `PRAGMA quick_check`, `PRAGMA foreign_key_check`, and
a blob-presence pass over every `asset.content_hash`; any defect
refuses BAD_DATABASE and removes the partial whole.

### Files to Touch

`apps/desktop/src/main/net-guard.ts` + `.test.ts`.
`packages/persistence/src/export/project-import.ts` + `.test.ts`
(crafted-archive rebuild fixture).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Hex-form mapped literals range-check as their embedded IPv4;
      uncompressed spelling normalized; unknown mapped forms fail
      closed (net-guard 17/17 incl. the three review vectors).
- [x] Import refuses a db failing quick_check / foreign_key_check /
      blob presence BEFORE the rename; crafted-archive test proves
      refusal with nothing left on disk (export suite 7/7).
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden (176/176).

### Acceptance Criteria

**GIVEN** a dropped link `http://[::ffff:7f00:1]/`
**THEN** the import refuses it as a private address.
**GIVEN** a manifest-consistent archive whose db references absent
media
**THEN** import refuses BAD_DATABASE and no directory exists.

### Issues Encountered

The P1 reproduction was one node one-liner — WHATWG normalization
is the entire bug. The crafted-archive fixture rebuilds a real
export via yauzl→yazl with the asset entry and its inventory row
removed, which is exactly the attack shape.

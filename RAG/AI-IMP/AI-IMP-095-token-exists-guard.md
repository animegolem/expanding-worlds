---
node_id: AI-IMP-095
tags:
  - IMP-LIST
  - Implementation
  - theming
  - tooling
kanban_status: completed
depends_on:
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.9
date_created: 2026-07-06
date_completed: 2026-07-06
---

# AI-IMP-095-token-exists-guard

## Summary of Issue #1

The raw-color guard (theme.test.ts) catches hex/rgba outside
theme.css, but nothing catches its twin: referencing a token that
was never defined — `var(--ew-text-dim)` shipped in EPIC-014
because two surfaces copied an invented name and the browser
silently fell back. Carried backlog since; it guards the upcoming
polish pass. Done = a unit test asserting every `var(--ew-…)`
reference in renderer sources resolves to a definition in
theme.css, green on the current tree.

### Out of Scope

- Non-`--ew-` custom properties (component-local vars are fine).
- Unused-token detection (defined but unreferenced is harmless).

### Design/Approach

Extend theme.test.ts: parse theme.css for `--ew-*:` definitions,
walk renderer sources for `var(--ew-*` references, report the
undefined set with file:line.

### Files to Touch

`apps/desktop/src/renderer/theme.test.ts`.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Guard added; proven discriminating (fails on an injected
      bogus token, passes clean); current tree green or violations
      fixed.

### Acceptance Criteria

**GIVEN** a renderer source referencing `var(--ew-not-a-token)`
**WHEN** desktop units run
**THEN** the guard fails naming the file and token.

### Issues Encountered

Clean on the current tree (no latent undefined tokens — the
--ew-text-dim class of bug has no live instances). Discrimination
proven by injecting --ew-bogus-token into LocationChooser and
watching the guard name file, line, and token; restored and green.
Desktop units 37 total now.

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

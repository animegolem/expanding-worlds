---
node_id: AI-IMP-150
tags:
  - IMP-LIST
  - Implementation
  - rich-text
  - persistence
kanban_status: planned
depends_on: [AI-IMP-146]
parent_epic: [[AI-EPIC-018-rich-text-notes]]
confidence_score: 0.8
date_created: 2026-07-07
date_completed:
---


# AI-IMP-150-canonical-dialect-freeze

## Summary of Issue #1

EPIC-018 FR-5 (rev 0.56 §7.1). The canonical Markdown flavor gets
FROZEN as an explicit artifact: the dialect knobs (emphasis `*`,
bullet `-`, hardbreak `\`, blockquote/blank-line normalization —
the exact set the spike observed) are pinned in ONE config module
both the editor and any system writer import, the spike's
round-trip corpus becomes a permanent regression gate (any dialect
drift fails CI), and the RFC §7.1/§16 language is checked for
consistency (exports/vault mirror emit the same flavor). Done
means dialect drift is structurally impossible to ship silently.

### Out of Scope

- Editor behavior (146–149).
- Re-canonicalizing historical exports (bodies canonicalize at
  146's on-open; exports always reflect current bodies).

### Design/Approach

`packages/domain/src/markdown-dialect.ts` (or note home): the
frozen knob set + a `canonicalize(body)` helper; the corpus test
asserts serialize(parse(x)) is a fixed point for canonical inputs
and maps the six known normalizations correctly for legacy inputs.
Wire the notes-tree writer (§11.4 backup) and §16 export site
notes through the same helper where they emit bodies (verify they
already emit stored bodies verbatim — then only the doc note is
needed; record which). RFC touch-up rides the close if any §16
wording needs the dialect note (flag to the lead, don't edit RFC
in the agent run).

### Files to Touch

`packages/domain/src/markdown-dialect.ts` (+ corpus tests, moved/
extended from 146's landing).
Consistency audit notes in Issues Encountered.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Dialect module: knobs pinned, canonicalize() exported,
      editor imports it (no second source of truth).
- [ ] Corpus as CI gate: fixed-point + legacy-mapping assertions.
- [ ] Export/backup writers audited for flavor consistency;
      findings recorded.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.

### Acceptance Criteria

**GIVEN** any canonical-flavor body
**THEN** an editor round-trip is byte-identical (CI-gated)
**AND** the dialect definition lives in exactly one module.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

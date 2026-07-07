---
node_id: AI-IMP-144
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - rich-text
  - spike
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-018-rich-text-notes]]
confidence_score: 0.6
date_created: 2026-07-07
date_completed:
---


# AI-IMP-144-tiptap-prototype-verdict

## Summary of Issue #1

EPIC-018's activation gate is the TipTap go/no-go — the last
epic-blocking engineering call. The design pass now ASSUMES TipTap
and specifies the direction (rev 0.55 §7.1 + DESIGN-QUEUE):
Markdown stays the carrier; presentation is a floating format bar
on selection (no standing chrome), typed Markdown styles live,
org-style folding on heading fences, Maple Mono face, loud colored
headings. This SPIKE builds the smallest honest prototype that
answers: can TipTap deliver this over our Markdown-canonical §7.1
commit model (round-trip fidelity, wiki-link tokens intact,
CodeMirror replacement or coexistence), at acceptable perf, hidden-
window-safe? Verdict + numbers land in a spike report; the epic
activates or the fallback (CodeMirror decorations approach) is
chosen.

### Out of Scope

- Shipping any editor change: `spike/` is throwaway; findings
  transfer via `RAG/spike-reports/`, code does not.
- The folding/format-bar FINAL build (post-verdict IMPs).

### Design/Approach

Spike criteria (the report must answer each): (1) Markdown
round-trip — body → TipTap doc → body is byte-stable for our
corpus incl. `[[links]]`, `![[embeds]]`, metadata-block tails
(§7.8 strip/reattach seam unaffected); (2) wiki-link tokens
renderable as atoms with our states without corrupting source;
(3) live typed-markdown styling + heading folding feasibility;
(4) editor-local undo isolation (§10.2 boundary) preserved; (5)
perf: open/typing latency on a 5k-word note; (6) Electron
hidden-window safety (no datalist-class hazards); (7) bundle cost.
Prototype in `spike/tiptap/` against real note bodies exported
from a test project. Compare against a minimal CodeMirror
fold+decoration sketch only if TipTap fails a criterion.

### Files to Touch

`spike/tiptap/` (throwaway).
`RAG/spike-reports/tiptap-verdict.md` (the deliverable).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Round-trip corpus test (incl. links/embeds/metadata tail)
      with pass/fail per case.
- [ ] Link-atom + folding + format-bar feasibility demonstrated
      or refuted with specifics.
- [ ] Perf + bundle numbers recorded.
- [ ] Spike report written with a VERDICT and the recommended IMP
      breakdown for the epic either way.

### Acceptance Criteria

**GIVEN** the spike report
**THEN** the lead can activate EPIC-018 (or choose the fallback)
on evidence, with round-trip fidelity and §10.2 isolation
explicitly proven or disproven.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

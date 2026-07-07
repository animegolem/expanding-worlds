---
node_id: AI-IMP-144
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - rich-text
  - spike
kanban_status: completed
depends_on:
parent_epic: [[AI-EPIC-018-rich-text-notes]]
confidence_score: 0.6
date_created: 2026-07-07
date_completed: 2026-07-07
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

- [x] Round-trip corpus test (incl. links/embeds/metadata tail)
      with pass/fail per case.
- [x] Link-atom + folding + format-bar feasibility demonstrated
      or refuted with specifics.
- [x] Perf + bundle numbers recorded.
- [x] Spike report written with a VERDICT and the recommended IMP
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

**Verdict: GO-WITH-CONDITIONS.** Full evidence in
`RAG/spike-reports/tiptap-verdict.md`; prototype in `spike/tiptap/`
(throwaway, self-contained npm project outside the pnpm workspace, own
node_modules — app dependency tree untouched). 36/36 spike tests pass.

Key findings:
- **Round-trip is the crux.** 19/25 corpus cases byte-stable; 25/25
  render-identical. The six byte-diffs are Markdown *dialect*
  normalizations (`_`→`*` emphasis, `*`→`-` bullets, multi-line
  blockquote joined, trailing-space hard break→`\`, blank-line runs
  collapsed) — none change the rendered doc. Because §7.1 declares
  Markdown canonical and stores token *ranges*, this churn is a real
  cost, managed by a one-time canonicalize-on-load + freezing the
  editor's dialect as our canonical flavour (condition 2).
- **Metadata whole-body path is DISQUALIFIED:** `html:false`
  HTML-escapes the `<!-- ew:metadata -->` fence. Integration MUST use
  the §7.8 strip seam (prose-only), which reattaches the tail
  byte-exact — same as the shipped CodeMirror editor.
- Wiki-link/embed atoms, state styling, malformed-stays-text: all pass.
- Folding is decoration-only → source byte-identical while folded (no
  round-trip risk). Flat-doc gotcha: fold range is a sibling scan;
  caret-out-of-fold left to the IMP.
- Undo isolation proven: `addToHistory:false` keeps syncExternal edits
  out of the stack (negative control confirms the trap).
- Perf (jsdom CPU floor, 5k words): open ~37 ms, keystroke ~0.05 ms.
- Bundle: 148 KiB gz — ~21 KiB *smaller* than the CodeMirror set
  already shipped. Net-neutral if TipTap replaces CM.
- Hidden-window: clean hazard scan (no datalist/dialog/window.open);
  whole suite runs with no browser. Real hidden-Electron smoke NOT run
  (fresh worktree has only a husk electron/dist — documented macOS+pnpm
  behavior; fetching the binary is outside the fence). Recommended as
  the first acceptance check of the integration IMP.

Deviations from brief: (1) real-Electron check deferred to integration
IMP for the husk-binary reason above — substituted a static hazard scan
+ exhaustive jsdom coverage. (2) Added the five CodeMirror packages to
the spike's OWN devDependencies (not the app's) to measure the fallback
bundle for an honest comparison; the app tree is untouched.

Gate note: the app suite is unaffected by construction — `spike/` is
outside the pnpm workspace globs (`apps/*`, `packages/*`), has its own
node_modules, and no file under `apps/` or `packages/` was changed.

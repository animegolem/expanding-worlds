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

- [x] Dialect module: knobs pinned, canonicalize() exported,
      editor imports it (no second source of truth).
- [x] Corpus as CI gate: fixed-point + legacy-mapping assertions.
- [x] Export/backup writers audited for flavor consistency;
      findings recorded.
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
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

**Deviation from the ticket's Design/Approach.** The dialect module,
`canonicalize` primitive (`roundTripMarkdown`), and the spike corpus
already shipped with AI-IMP-146 — `packages/domain/src/markdown-dialect.ts`
(the pinned `MARKDOWN_DIALECT` knobs + `MARKDOWN_ROUNDTRIP_CORPUS`) and
`apps/desktop/.../editor-markdown.ts` (`roundTripMarkdown`, the single
consumer of the knobs). So 150 did not CREATE the module; it AUDITED the
shipped editor end-to-end, EXPANDED the corpus for what landed after the
spike (148/149/156), and added the missing FREEZE guard. No second source
of truth exists — the editor factory imports `MARKDOWN_DIALECT` verbatim.

**Freeze mechanism (new `dialect-freeze.test.ts`).** A truthful guard,
not a string dump: it builds the REAL shipped editor from
`baseNoteExtensions()` and reads back what it actually loaded —
(1) the sorted ProseMirror extension name set, (2) the compiled schema's
node + mark names (the exact serializable surface: `bold/code/italic/strike`
marks, `blockquote/bulletList/codeBlock/doc/hardBreak/heading/horizontalRule/
listItem/orderedList/paragraph/text` nodes — nothing else can enter a note
body), (3) the LIVE `markdown` extension `options` (so a
`Markdown.configure({...override})` that bypasses `MARKDOWN_DIALECT` still
trips), (4) `MARKDOWN_DIALECT` itself, and (5) the loaded StarterKit config
(`text:false`, heading levels `[1..6]`). A version bump to TipTap/
StarterKit/tiptap-markdown that shifts the loaded surface fails the test.
The file header explains, in a box, that a failure means the canonical
dialect changed — an RFC-0001 §7.1 decision, and the snapshots must not be
edited to go green without ratifying the change and updating the corpus in
the same commit.

**Corpus expansion (35 → 44 cases), each justified by a shipped feature.**
Added wiki tokens in every mark/node context the editor produces beyond the
spike's bold-only case: `wikilink-in-italic`, `-in-strike`, `-in-heading`,
`-in-ordered-list`, `-in-blockquote`, `embed-in-heading`; combined
bold+italic (`triple-emphasis`, stackable format-bar verbs); an ordered
list with a non-1 `start` (`ordered-list-start`); and `adv-active-title-in-
italic` — the 156 opacity fear (`[[**b**]]`) INSIDE an emphasis span, so
code-vs-token precedence is pinned within a mark context. All are byte-
stable fixed points; folded-heading byte-stability and format-bar verb
serialization were already gated (folding.test.ts, format-bar.test.ts) so
were not duplicated.

**Double-canonicalize proof (cannot double-normalize on reparent).** Two
independent guards, both verified:
1. STRUCTURAL — canonicalize-on-load lives ONLY in
   `NoteEditorController.open()` (note-editor.ts), which runs once per note
   load. The §8.5 big-editor handoff (NotePanel.svelte ~L968) uses
   `controller.reparent(target)`, whose whole body is
   `parent.appendChild(dom)` — it MOVES the live ProseMirror DOM between the
   panel and the overlay and never re-parses, re-serializes, or re-opens.
   One buffer per note; reparenting cannot re-canonicalize.
2. SEMANTIC — the corpus proves every canonical form is a FIXED POINT
   (`serialize(parse(canonical)) === canonical`). `open()` only arms the
   autosave when `getMarkdown() !== prose`; on an already-canonical body
   that is false, so even a second `open()` of the same note commits
   nothing. `note-editor.test.ts` pins this ("second open is a no-op") and
   also that a TRASHED note never self-commits its canonicalization.

**Export/backup writer flavor audit — no second dialect emitter.** Both
body-emitting sinks write the STORED `note.body` bytes verbatim; neither
re-serializes through any Markdown carrier:
- `packages/persistence/src/notes-tree.ts` (§11.4/§16 backup tree):
  `SELECT body FROM note` → writes the bytes (only appends a trailing
  newline + refreshes the §7.8 metadata block, which is not dialect prose).
- `packages/persistence/src/export/project-export.ts` (§16 `.ewproj`):
  streams the DB copy + the already-written notes tree; touches no bodies.
Because the editor is the sole point that ever serializes prose, and it
canonicalizes on first open, every downstream sink emits canonical bytes
automatically. The RFC §16 wording needs no dialect note (writers emit
stored bodies verbatim, as the ticket anticipated) — flagged here for the
lead, no RFC edit made in the agent run.

**Finding — nothing the editor produces escapes the frozen dialect, but
first-open canonicalization is LOSSY for constructs the schema does not
model (observation, not fixed here).** The schema is deliberately minimal
(no URL-link mark — wiki tokens replace it; no image node — `![[...]]`
embeds replace it; no table/task/footnote/reference/raw-HTML nodes). Every
producible output is a fixed point inside the frozen grammar (the freeze
holds), but a body IMPORTED from generic Markdown reduces on first open —
verified empirically through `roundTripMarkdown`:
- `[text](url)` → `text` (URL dropped); `![alt](url)` → `alt` dropped
  entirely; `<http://x>` autolink → bare text; reference links flattened.
- GFM tables flatten to concatenated cell text (`| a | b |…` → `ab12`);
  task lists / footnotes escape to literal text (`- \[ \] todo`).
- Raw HTML is escaped to visible text (`<b>` → `&lt;b&gt;`), per the
  ratified `html:false` knob; HTML entities decode (`&copy;` → `©`).
- Setext headings normalize to ATX and indented code to fenced — both
  render-identical, in-dialect normalizations (good).
The one sharp edge worth a follow-up flag: a wiki token in a standard-
Markdown link destination — `[label]([[Note]])` — is consumed by the
schema-less link parse and the token is DROPPED (link record lost on first
open). No app surface authors that construct (the format bar's link verb
emits `[[…]]` directly, never `[…]([[…]])`), so real-world risk is low, but
it is the only producible-input path that silently drops a link record.
Recorded as a finding for a possible future guard; NOT fixed here (behavior
change is out of scope for the freeze ticket).

**Gates (from the worktree root).** `pnpm -r build` clean; `pnpm -r test`
green — desktop **186 passed** including the hidden-window e2e suite (the
`fatal: ambiguous argument 'main'` line is pre-existing snapshot-push test
noise from a missing git ref, not from this change; that test still
passed); `pnpm lint` clean. Domain dialect test 3 passed; the note editor
targeted set (dialect-freeze + editor-markdown + note-editor + format-bar +
folding) 82 passed.

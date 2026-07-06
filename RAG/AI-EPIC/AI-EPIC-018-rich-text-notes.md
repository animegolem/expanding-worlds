---
node_id: AI-EPIC-018
tags:
  - EPIC
  - AI
  - notes
  - editor
date_created: 2026-07-06
date_completed:
kanban_status: backlog
AI_IMP_spawned:
---

# AI-EPIC-018-rich-text-notes

> Stubbed 2026-07-06 as a maybe (RFC rev 0.39); FIRMED to "probably
> proceeding" the same day (rev 0.40): the canvas text controls get
> built regardless, and the Gemini review's point landed — Obsidian
> muscle memory drags images into the editor, and artist-focused
> note apps are the actual competitive set.

## Problem Statement/Feature Scope

Notes are raw Markdown in CodeMirror — right for Obsidian compat,
wrong-shaped for artists who never asked to learn syntax. The
considered direction: a rich text editor over a LIMITED,
Markdown-compatible surface (headings, emphasis, lists, links,
alignment — nothing that cannot round-trip), serialized to Markdown
via pandoc for the vault mirror (rev 0.23) and §16 export.

## Proposed Solution(s)

Per RFC rev 0.39 (§7 preamble). Non-negotiable constraints:
wiki-link semantics (§7.1–7.7 — tokens, suggestions, phantoms,
rename rewrites) survive any editor swap; §7.1 commit semantics
(burst → one UpdateNote) unchanged; round-trip is lossless within
the limited surface or the feature does not ship. Independent
must-have that ships regardless (candidate first IMP even if the
epic stalls): paste-as-plain-text everywhere text is accepted.
Gated stretch riding this epic if it activates: the rev 0.39
AI-over-a-text-region verbs (format/extract/dictate-cleanup),
double-gated per §11.5, tiny on-device model.

**Owner reference (2026-07-06):**
github.com/animegolem/chimera-chat-playground — an earlier Lexical
build; not code or styling to reuse, but the VALUES to preserve:
(1) markdown shortcuts ARE the formatting UI (typing `---`, `**`,
` ```lang ` transforms live — no toolbar dependence); (2) the node
set was already a whitelist of markdown-expressible shapes
(headings, quote, lists, code, links/autolink, HR, highlight);
(3) code blocks are FIRST-CLASS — language tag, syntax
highlighting, the thing the old project fought hardest for;
(4) note-sized editor, not a document app;
(5) THE OUTLINER IDENTITY (owner, 2026-07-06, firmed same
evening: "build the thing I wish Obsidian was"): org-mode as
INTERACTION over the unchanged Markdown schema — headings PIN and
their content FOLDS beneath (ProseMirror decorations;
serialization never sees fold state), fold-all/unfold-all,
tab-cycling, org-style subtree keybindings. Org as a storage
format stays declined (vault mirror + pandoc round-trip are
Markdown). Markdown's six heading levels accepted as the ceiling
(org-depth outlining noted and traded away knowingly). Scope
riders decided: CHECKLISTS render (GFM task lists); TABLES are in
grudgingly ("someone's going to get mad if I don't") — capped at
GFM pipe tables, nothing beyond what round-trips; CODE FENCES
render with syntax highlight for the HEAVY HITTERS ONLY (rust,
python, go, java, js/ts) — the long tail renders as plain fenced
text, deliberately;
(6) the DEFAULT typography is LOUD (owner, 2026-07-06): headings
get size AND color, formatting reads as formatting at a glance —
a nice jumpy palette, not gray-on-gray restraint. A quieter
alternate MAY ship as an option, but loud is the default. Colors
ride theme tokens like all chrome (the raw-color guard applies).

**Library direction (rev 0.40, owner + lead):** TipTap
(ProseMirror lineage — the Linear-class shape) as the lead
candidate: headless, Svelte-workable, and its schema is a
WHITELIST — register only markdown-round-trippable nodes/marks and
the editor cannot produce an incompatible shape, which turns the
"never offer anything non-markdown" constraint into a type system.
Milkdown (markdown-native ProseMirror) is the named runner-up.
The real cost center is porting the CM6 wiki-link plugin
(suggestions, phantom styling, rename rewrites) onto ProseMirror
suggestion machinery. The canvas text overlay MAY share a
minimal-schema instance of the same editor; the Pixi render side
shares nothing.

**Images in notes join this scope (rev 0.40, owner decision — not
a priority, rides the epic):** markdown-compatible embeds only
(`![alt](ew-asset://hash)` or `![[...]]` — pick ONE at design
time), rendering managed assets via the existing protocol. Named
consequences from the original deferral (the old cluster-L
reasons): §9.8 GC must scan note bodies for asset references
before sweep; §16 export and the vault mirror must handle embeds;
the note-pane image drop (AI-IMP-097 near-term: redirect to board
+ toast) upgrades to embed-on-drop when this lands.

## Path(s) Not Taken

No full rich-text divergence from Markdown (the surface is capped
by what round-trips). Canvas text (§4.5) keeps its own
"slightly rich" alignment-and-reflow ceiling — this epic is about
NOTES.

## Success Metrics

To be firmed at activation; candidates: an artist formats a note
without seeing syntax; vault regeneration round-trips a rich-edited
note byte-stable on the second pass; paste-as-plain-text works in
every text surface.

## Requirements

### Functional Requirements

- [ ] To be cut at activation.

### Non-Functional Requirements

- Lossless round-trip within the limited surface (pandoc-verified
  in tests).

## Implementation Breakdown

IMPs to be cut when this epic activates.

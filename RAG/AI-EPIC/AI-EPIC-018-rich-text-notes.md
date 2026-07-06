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

> MAYBE-epic, stubbed 2026-07-06 (RFC rev 0.39): explicitly not a
> promise — "a modest and real lift but a real thing i've
> considered." Holds the slot and the constraints so the decision
> can be made cleanly later.

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

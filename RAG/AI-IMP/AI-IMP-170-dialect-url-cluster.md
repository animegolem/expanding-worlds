---
node_id: AI-IMP-170
tags:
  - IMP-LIST
  - Implementation
  - rich-text
  - notes
kanban_status: planned
depends_on: [AI-IMP-150]
parent_epic:
confidence_score: 0.6
date_created: 2026-07-07
date_completed:
---


# AI-IMP-170-dialect-url-cluster

## Summary of Issue #1

Rev 0.66 (owner ruling): the frozen §7.1 dialect grows by exactly
the URL cluster + highlight — inline links `[text](url)`, images
`![alt](url)`, CommonMark autolinks `<url>`, and `==highlight==`.
Raw HTML stays out (`html:false`); code blocks stay unhighlighted;
`linkify` stays false (bare text URLs remain text). Grammar is not
UI: the format bar gains NO new controls. Done means the four
constructs round-trip byte-exact through the shipped editor, the
corpus covers them (including against wiki tokens), the freeze
guard re-pins the grown surface, and foreign notes carrying links/
images now canonicalize WITHOUT loss.

### Out of Scope

- Tables, footnotes, task lists (still outside; DESIGN-QUEUE owns
  the vault-return residue).
- Format-bar buttons for the new marks (owner: no rich controls).
- Any ambient fetch. An image URL renders as a NON-FETCHING chip
  (title/alt + a glyph); activation routes through the universal
  viewer when it exists — no network on note open, ever (§11.5).
- `![[…]]` managed embeds (unchanged; the two image forms coexist).

### Design/Approach

TipTap Link mark (tiptap's own, configured: no autolink-on-type
unless it serializes as `<url>` faithfully; openOnClick off — §7.3
activation semantics stay ours), an Image node whose NodeView is
the non-fetching chip, a small Highlight mark (`==…==` needs a
markdown-it plugin — vendor the standard mark plugin or write the
inline rule beside the 156 wiki-token rule; mind PRECEDENCE against
`[[…]]` opacity: tokens stay opaque inside highlights, corpus case
required). Serializer additions in the tiptap-markdown carrier for
all four. Re-pin: dialect-freeze.test's node/mark lists grow;
MARKDOWN_ROUNDTRIP_CORPUS gains ~10 justified cases (each construct
alone, nested with marks, against wiki tokens, link-vs-token
precedence `[text]([[Note]])` — the 150-flagged sharp edge must now
have a DEFINED outcome, not a silent drop). §7.1 canonicalize-on-
load doctrine unchanged. Wiki-link click-through (Mod-click) must
not regress; URL links get the same hover-chip grammar §7.1 gives
link states, with the chip naming the DOMAIN.

### Files to Touch

`packages/domain/src/markdown-dialect.ts` (corpus).
`apps/desktop/src/renderer/note/editor-markdown.ts` (+ image chip
NodeView, highlight rule), `dialect-freeze.test.ts` (re-pin),
`editor-face.css` + theme tokens (highlight + chip styling).
Note e2e extension.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Four constructs round-trip byte-exact; corpus grown with
      justified cases incl. token precedence; freeze re-pinned.
- [ ] Image chip never fetches (test asserts no network/img load).
- [ ] `[text]([[Note]])` has a defined, tested outcome.
- [ ] Highlight styled on tokens; guards green.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a note pasted from Obsidian carrying `[text](url)`,
`![alt](url)`, `<url>`, and `==marked==`
**WHEN** it opens for the first time
**THEN** every construct survives canonicalization byte-faithfully,
images render as non-fetching chips, and nothing fetches.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

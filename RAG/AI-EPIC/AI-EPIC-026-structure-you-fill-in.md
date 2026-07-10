# AI-EPIC
---
node_id: AI-EPIC-026
tags:
  - EPIC
  - AI
  - tags
  - gallery
  - canvas
date_created: 2026-07-09
date_completed:
kanban_status: planned
AI_IMP_spawned: [AI-IMP-239]
---

# AI-EPIC-026-structure-you-fill-in

## Problem Statement/Feature Scope

Two missing primitives surfaced in the first tester's week, both
the same disease: the app offers structure only where it guessed
the user's meaning in advance. (1) Tags are flat — alph tracks
creator and source religiously and has NO typed place to put them;
free tags conflate "who made this" with "what it depicts." (2)
There is no way to create a fresh board — every board is born from
an existing image, so the first act of organizing a new topic has
no gesture. Both block the tester's real daily flow (ratified
2026-07-09; DESIGN-QUEUE "Tag categories — the missing primitive"
carries the full record).

## Proposed Solution(s)

**Tag categories** — the booru namespace pattern as the app's ONLY
tag nesting: a category is a TYPE on a tag (`creator: Matthieu
Bonhomme`, `source: instagram.com/…`), never a tree. Users define
their own categories per project (the owner's framing: "the
general design structures you can draw meaning out of, but not
telling you what meaning to put in it" — a photographer would make
shoot-location/camera/lens/date). Always OPTIONAL: first-classness
(structured entry fields on the import/tag surfaces, namespace
presentation, facet priority in the gallery) is the point,
required-ness is not. `source` already exists as an asset field
(rev 0.53) — it gains its entry surface and category presentation
rather than a second birth. Files self-describe at EGRESS: a
derived display filename (`creator tags date-retrieved.ext`)
computed from fields and applied on export/drag-out — the
content-addressed blob store is never renamed; date-retrieved
breaks name collisions while the content hash remains the true
dedupe.

**The New-board verb** — "New board…" on the empty-board context
menu: name it, Enter, you are standing inside; one Mod+Z takes the
whole act back (AI-IMP-239, functional surface per the owner's
ruling — the boards-being-born lifecycle drawing restyles it
later).

## Path(s) Not Taken

- Arbitrary tag hierarchies / tag folders — rejected; one typed
  level is the ceiling, per alph's own Allusion history.
- Mandatory-to-proceed fields — rejected; bulk drops never nag.
- Renaming managed blobs — rejected; egress-only naming.
- Filename-derived prefills at import (alph's VLC screencaps) —
  captured in the queue as a someday, not built here.
- The lifecycle-designed creation presentation — the design
  push's document of actions owns it; this epic ships function.

## Success Metrics

- Alph can define creator/source once, fill them during import or
  from the tag surface, and filter the gallery by `creator:X` —
  validated by him in a testing session on the shipping build.
- A file he drags out or exports carries the derived name (his
  Lucky Luke example round-trips: fields in → filename out).
- He can make a named fresh board in one gesture (AI-IMP-239).
- No regression to flat tags: untyped tags work exactly as today.

## Requirements

### Functional Requirements

- [ ] FR-1: Tag categories exist as project-scoped, user-defined
      types on tags; commands create/rename/delete categories and
      assign a category to a tag; validation in handlers (never
      SQLite CHECK IN). RFC folds the ratified decision in.
- [ ] FR-2: The import surface and tag surfaces offer structured
      entry for categorized tags (category:value), always
      optional; `source` presents through the same grammar.
- [ ] FR-3: Gallery facets and search understand categories —
      filter/group by category:value; categorized tags present
      with their namespace.
- [ ] FR-4: A derived display filename (fields + date-retrieved)
      applies at every egress: export, drag-out; the blob store is
      untouched.
- [ ] FR-5: "New board…" — one gesture from empty ground to
      standing inside a named board; single undo group
      (AI-IMP-239, in flight).

### Non-Functional Requirements

- Categories are a growing domain: handler validation only.
- No migration rebuilds: additive schema (new column/table).
- Bulk import of N files never blocks on category entry.
- Egress naming is deterministic and filesystem-safe (sanitized,
  length-capped) across macOS/Windows/Linux.

## Implementation Breakdown

- AI-IMP-239 — New-board verb (functional surface). IN FLIGHT.
- AI-IMP-244 (number reserved) — schema + commands + RFC fold-in (lead or senior
  agent; interface-defining).
- AI-IMP-245 (number reserved) — entry surfaces: import fields + tag panel/charm
  category grammar.
- AI-IMP-246 (number reserved) — gallery facets/search integration.
- AI-IMP-247 (number reserved) — egress filename derivation (export + drag-out).

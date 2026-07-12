# Phase 1 sign-off — the §17 walkthrough and §18 audit

**EPIC-008 FR-5/FR-6 · 2026-07-07 · RFC-0001 rev 0.66**
Suite at audit: 195 e2e (hidden) + 1,222 unit/integration across
packages, all green on the audited tree (AI-IMP-166 merged). Method: every §17 slice item
and §18 criterion carries a verdict — **TESTED** (named spec +
test), **UNIT** (service-level test where the e2e adds nothing),
**DESIGN** (satisfied by ratified construction, cited), or **GAP**
(open, ticketed). No verdict rests on "should work."

The lead attests the machine-checkable half. Feel, discoverability,
and taste live in `RAG/HUMAN-TESTING.md` (owner queue, ~17 entries at
audit) — Phase 1 is DONE when the owner counter-signs below after his
flush.

---

## FR-5 — the §17 vertical slice, item by item

1. **Project creation, protected root, Home** — TESTED.
   `shell.spec` "shell launches and the Project API round-trips";
   root protection at the handler (`ROOT_NODE_PROTECTED`,
   `handlers/lifecycle.ts`) plus the schema trigger;
   `navigation.spec` "path, back/forward, viewport restore, home
   (§17 item 12)" proves Home.
2. **Background set/edit/reset/replace/remove** — TESTED.
   `board-tooling.spec` "background lifecycle: set, edit in explicit
   mode, reset, replace, remove, color beneath"; also `slice.spec`
   "§17 slice items 2–6, 9–10, 17–19 in one project".
3. **Drop / clipboard paste / browser drag / URL-only / rejection** —
   TESTED. `import.spec` "import surfaces: drop, attribution,
   rejection, URL failure, paste".
4. **Pan, zoom, select, move, resize, rotate, reorder, align,
   distribute, flip, zoom-to-fit, snapping + disable modifier** —
   TESTED. `gestures.spec` "move, resize, rotate, reorder, and flip";
   `board-tooling.spec` "align, distribute, snap with guides, Alt
   bypass, and camera-only zoom"; `canvas.spec` "controller: pan,
   zoom-at-cursor, marquee selection, camera persistence".
5. **Pin with dot / icon / cropped-image appearance** — TESTED.
   `import.spec` "the pin tool commits one command"; `charms.spec`
   "appearance switcher: dot→icon renders + undo, dot→card, card
   gated by note (§4.6)"; `slice.spec`.
6. **Note attach → title label → toggle off** — TESTED.
   `gestures.spec` "labels: follow the note title, visibility
   persists"; `notes.spec` "attach, share, detach, and make
   independent (§17-6/7/17)".
7. **Second node sharing the note** — TESTED. `notes.spec`
   (§17-6/7/17) end to end; `queries-structure.test` "runs the full
   AI-IMP-012 scenario at service level" (slice 5–9).
8. **Tags: create, assign, rename, panel** — TESTED with ONE OPEN
   CLAUSE. Create/assign/panel: `tags.spec` "charm-bar door" +
   "board `#` popover" (§4.8). Rename: the command is
   handler-proven (`handlers/tags.test`, FTS follows in
   `search.test`) and `tags.spec` "RenameTag propagates: chip row,
   completion vocabulary, panel reopen (§17 item 8)" proves live
   propagation — but **no UI surface invokes RenameTag** (a user
   cannot rename a tag). GAP → **AI-IMP-171**.
9. **Same node placed twice, drag from library, zero-node note from
   Uses** — TESTED. `slice.spec` (items 9–10); `outline.spec`
   "outline placement flows"; `notes.spec` "Uses sidebar groups
   locations and places unplaced material".
10. **Open a node's canvas, persist immediately, nest content** —
    TESTED. `slice.spec` (items 9–10).
11. **Legal canvas cycle: navigation, graph queries, export** —
    TESTED. `export-import.spec` "a containment cycle survives
    navigation, graph queries, and the roundtrip (§17 item 11)";
    alias-row semantics in `outline.spec` "tree with alias rows".
12. **Back/Forward/Home/path/bookmark with viewport; quick-open;
    canvas-text FTS** — TESTED. `navigation.spec` (§17 item 12);
    `search.spec` "Mod+P quick-open" and "canvas-text match navigates
    cross-canvas centered on the decoration".
13. **Wiki link click → immediate navigation + resolution** —
    TESTED. `notes.spec` "bound activation loads the note and
    resolves space by location count (§17-13, §7.3)".
14. **Unresolved tokens ×2, phantom view, Create and Place binds
    project-wide** — TESTED. `notes.spec` "phantom view aggregates
    references; Create and Place binds project-wide in one command
    (§17-14)".
15. **Rename vs dirty editor: flush, transactional rewrite, local
    undo** — TESTED. `notes.spec` "rename flushes dirty buffers,
    rewrites transactionally, folds into local undo (§17-15)".
16. **Zero/one/many locations + grouped chooser** — TESTED.
    `notes.spec` (§17-13) walks all three counts including the
    link-anchored chooser rows.
17. **Detach without side effects; make independent** — TESTED.
    `notes.spec` (§17-6/7/17); `slice.spec` (17–19).
18. **Draw text, shapes, freehand, lines, arrows, anchored
    connector** — TESTED. `decorations.spec` "decorations: draw,
    anchor, group, lock, hide, search".
19. **Decoration verbs + undo; connectors visual-only; cross-canvas
    undo declines naming the board, then succeeds there** — TESTED.
    `decorations.spec`; `context-menus.spec` (AI-IMP-154 pair);
    `undo.spec` "cross-canvas undo declines with a board-naming
    toast, then applies on its board (§10.2 rev 0.58)". The walk
    found the toast never actually named the board (cast-hidden
    field mismatch) — fixed as **AI-IMP-172** before this audit.
20. **Trash placements/canvas/node/note, impact summaries, restore,
    bookmark degrade/restore** — TESTED. `trash.spec` "trash
    browser: list, restore + fly-to, empty trash"; `navigation.spec`
    "bookmarks degrade explicitly" + "bookmark to a board whose OWNER
    node is trashed degrades (§9.6)".
21. **Last placement of a bare node → auto-trash + Keep in Project →
    Unplaced filter** — TESTED. `board-tooling.spec` "delete
    selection with §9.2 notice" (Keep in Project notice included);
    library unplaced filter in `slice.spec`/`outline.spec` loose bin.
22. **Trashed-note link affordances; purge → broken → explicit
    recreate** — TESTED. `notes.spec` "trashed and broken links offer
    explicit recovery (§17-22)".
23. **Retention defaults Never; purge invalidates undo; safe GC** —
    UNIT. Default: `settings.test` asserts the seeded
    `trash_retention = 'never'`. Purge→undo: session-only stack +
    the tested `UNDO_STALE` drop (`undo-stack.test`) + FK
    enforcement (EPIC-007 audit ruling). GC: `gc.test` protects
    trashed references, shared hashes, in-flight imports (§9.8).
24. **Outline excludes trashed; connectors never edges** — TESTED.
    `outline.spec` "trashed excluded by default, connectors never
    rows, restore returns the row (§17 item 24)"; query layer in
    `queries-structure.test` "excludes trashed placements, nodes, and
    canvases".
25. **Reopen without loss; no dup writers; imports reconciled;
    debounce-window quit** — TESTED/UNIT. `process.spec` "refuses a
    second process while held" + "reconciles the interrupted import
    on reopen"; `notes.spec` "an edit inside its debounce window
    survives quit (§10.2 quit flush)"; `recovery.test` interrupted
    import matrix.
26. **Export → import: identities, links, tags, placements,
    bookmarks, Trash, originals match** — TESTED. `export-import.spec`
    "the roundtrip: import materializes a sibling project";
    `project-import.test` table-by-table EXACT roundtrip diff plus
    the adversarial refusal suite (tampered/crafted/swapped-blob).
27. **Gallery: browse two sizes, Quick Look, filter, place** —
    TESTED. `gallery-quicklook.spec` (slider persists; Space/arrows/
    Esc); `gallery-facets.spec` "facets filter live";
    `gallery-selection.spec` "place: takeover closes first".
28. **Library beside a project: ingest with tag border, mirror,
    clear seed** — TESTED. `secondary.spec` "library slot: writable
    secondary"; `ingest.spec` "drag-free ingest"; `inbox-mirror.spec`
    "mirror on"; `library-seed.spec` "create-new library seeds the
    example; clear trashes it all".
29. **Frame: draw, capture+arrange, retitle, membership survives
    moves** — TESTED with ONE OPEN CLAUSE. Draw/capture/carry/
    release: `frames.spec` "draw → capture → carry → resize-immune →
    release → undo (§4.9)"; sort-on-drop: `frames-drop.spec`.
    **Retitle: no verb exists** (declared COMING_SOON in the frame
    menu). GAP → **AI-IMP-138** (frame furniture, awaiting the
    sort-control design call).
30. **§7.1 live styling; fold byte-identical; snapshot restore
    sibling** — TESTED/UNIT. Live styling + burst commit:
    `notes.spec` "note pane opens on double-click and a typing burst
    commits one UpdateNote"; byte-identity under fold:
    `folding.test` "hides content with display:none while leaving
    the Markdown byte-identical" + the §7.1 dialect freeze
    (`dialect-freeze.test`, 44-case corpus); snapshot restore:
    `restore.spec` "restores an older snapshot to a new sibling
    directory".

**FR-5 verdict: 28 of 30 items fully evidenced; two clauses open,
both ticketed (AI-IMP-171 tag-rename UI, AI-IMP-138 frame retitle).
Nothing else in the slice rests on an untested promise.**

---

## FR-6 — the §18 acceptance criteria

Criteria are grouped; each line is a verdict. Citations repeat FR-5's
where the same evidence carries.

**Identity & the flat schema (criteria 1–5)** — TESTED. Project/root
(item 1), untitled image node identity (`import.spec`), zero-node
note (`slice.spec`), shared note with independent facets (item 7),
multi-placement (item 9).

**Titles, links, phantoms (6–13)** — TESTED. Collision conflicts
(`notes.spec` §7.7 with draft retention + per-flow actions), rename
rewrite (item 15), immediate pane update (item 13), unresolved
records + suggestions + phantom view + project-wide bind (item 14),
trashed-title rebind + In-Trash affordances and broken-never-rebinds
(item 22).

**Spatial resolution (14–17)** — TESTED. One-location auto-nav,
many-location chooser, dismissal leaves viewport (item 16/13),
same-canvas highlight (`notes.spec` §17-13 selection assertion).

**Trash semantics (18–21, 26)** — TESTED. Detach isolation (item
17), shared-note trash with impact + restore (item 20), node trash
preserving the aggregate (§9.6, item 20), bare-node auto-trash +
Keep in Project (item 21), non-root canvas trash + root protection
(item 1/20).

**Library, search, navigation (22–25)** — TESTED. Node library
facets + unplaced filter (item 21), FTS over notes/tags/filenames/
canvas-text excluding Trash (`search.spec` ×3), placement from
library/Uses (item 9), history skip + bookmark degrade matrix
(`navigation.spec` "stale targets skip and collapse" + item 20).

**Roundtrip (26)** — TESTED. Item 26's exact-diff + refusal suite.

**Decorations (28–31)** — TESTED. UID-bearing, never nodes/edges
(item 24), shared ordering plane (`decorations.spec`), lock/hide/
group/anchor verbs + one-undo capture (item 19).

**Tags (32)** — TESTED with item 8's open UI clause. Flat identity,
node-only assignment, rename without rewriting assignments
(`handlers/tags.test`: rename never rewrites `tag_assignment`), panel.

**Appearance & presentation (33–36)** — TESTED. Interchangeable
dot/icon/image (item 5), label defaults + rename-follow + toggle
(item 6), non-destructive crop (`crop.spec` "display crops, bytes
stay"), align/distribute/flip as durable commands + snap ephemeral
(item 4).

**Backgrounds (37–39)** — TESTED. Tiled oversized derivative
(`perf.spec` "oversized background renders tiled"), full verb set
without nodehood (item 2), independent color (`board-tooling.spec`
"color beneath").

**Settings & process (40, 46)** — TESTED/UNIT. Retention in-project
+ survives roundtrip (item 23 + the roundtrip diff covers the
settings table); app preferences outside projects (`settings.spec`
per-tier persistence); single-writer lock (item 25).

**Command discipline & undo (41–45)** — TESTED. Versioned envelopes
with expected revision (every `exec` path; `shell.spec` round-trip),
inverse commands (`undo.spec` suite), one-command gestures
(`gestures.spec`), debounced UpdateNote with revision + index refresh
(`notes.spec` burst + quit flush), editor-local prose undo vs
structural rename (`undo.spec` "note-body typing never enters the
structural stack"), single in-memory stack + non-replayable log
(`undo-stack.test`; §10.2), cross-canvas decline naming the board
(item 19, post-172).

**Cycles (45)** — TESTED. Item 11 + visited-set outline.

**Assets & import pipeline (47–50)** — TESTED. Originals survive
source loss (managed storage; roundtrip), clipboard/file staged
pipeline parity (item 3), URL-only drop + attribution + clear
failure (item 3; SSRF guard `net-guard` 18 vectors), kind
discriminator + staged rejection (item 3).

**FR-6 verdict: every criterion evidenced; the only open threads are
the same two ticketed clauses from FR-5.**

---

## Findings made BY this audit

- **AI-IMP-172** (fixed): the cross-canvas decline toast never named
  the board — `boardLabel()` read a field the outline projection
  doesn't return, invisible to tsc (cast) and to units (injected
  dep). The §17 walk caught it on first execution.
- **AI-IMP-171** (open): RenameTag has no UI verb.
- **CI cascade red** (fixed in the same push): Linux CI's hidden
  xvfb windows never advance the CSS animation timeline; the §8.2
  cascade spec now asserts the landing state. Motion timing is a
  local hardware gate, like perf.
- Evidence-map corrections: items 23/24/25 had unit coverage the map
  missed (`settings.test`, `queries-structure.test`, `process.spec`)
  — re-ruled with citations rather than new tests.

## What this sign-off is NOT

Machine checks prove semantics, not feel. The owner's
`RAG/HUMAN-TESTING.md` flush is the second half of Phase 1
acceptance: the pin beat, the cascade, frameless drag, crop feel,
the first-run arc, gallery Quick Look, and the decline toast are all
queued there. Deferred features (graph takeover, universal viewer,
RSS, dialect URL cluster AI-IMP-170) carry self-contained scope in
the RFC per the deferral rule and are NOT Phase 1 obligations.

---

## Sign-off

**Lead attestation** — the §17 slice and §18 criteria are evidenced
as recorded above on the audited tree; the two open clauses are
ticketed and scoped. *— Claude (lead), 2026-07-07.*

**Owner counter-signature** — Phase 1 accepted (after the
HUMAN-TESTING flush; the two open clauses acknowledged as Phase 1.x
follow-ups):

`[ ] accepted — signed: ____________ date: ________`

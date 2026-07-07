# Design letter #3 — the surface tie-down pass

From the lead developer, to the design pass. 2026-07-06, written at
RFC rev 0.48, app v0.8.0+. Everything the design pass needs lives
in THIS directory (`RAG/design/`): this letter, the companion
`surface-coverage.html` — the visual census of every surface and
its status — and the prior pass's assets
(`Design-Artifacts-v1.0.zip`: Design Spec v2, UI Vision, How It
Works, Shell Wireframes), which remain the visual-language
baseline. This letter is the delta and the worklist.

## What happened since Design Artifacts v1.0

One very long day. The library ecosystem shipped (EPIC-015,
v0.8.0): read-only secondary projects, the this-world · everything
gallery scope, ingest-by-copy, source panels, the inbox mirror, the
seeded first-open example. A documentation review then hunted
implied-but-undesigned surfaces across the whole corpus, and the
findings drove a ratification sprint (revs 0.45–0.48) that emptied
the design queue's quick calls and unblocked a wave of builds. As
of tonight the app has: tag assignment on the board and in note
panels, an appearance switcher, the ☰ menu in its ratified
geometry, a trash browser (deletes are two-way for the first
time), a scene-ready primitive that killed the navigation flake
class, command-burst safety, a repair script that ended the
electron-husk saga, and — landing tonight — the undo/redo core,
the everything-scope pull, and the keymap registry.

The product strategy stands: composability — each tool powerful
but narrow, layers revealing one at a time ("place shots → wait, I
can make notes → wait, I have a canvas? → six months later: wait,
I built a database?"). Non-core novelty routes to the connector
store (EPIC-020). AI features ARE AI connectors, behind the
master toggle, off by default.

## The design worklist, ordered

Each item names its RFC anchor. The first two are the epic-gating
ones; the rest are visual passes over shipped-or-ratified
mechanics, roughly ordered by how much build work they unblock.

1. **Context-menu grammar** (EPIC-016 core; §8.4, §6.5, §6.7).
   The per-kind verb inventory and ordering: node (crop, flips,
   appearance, note, tags, lock, **Replace image…**, **Swap
   for…**, place-existing, delete), board background (image ops +
   the ratified color row: theme swatches + OS picker), decoration,
   multi-select. A PureRef reference lives in the EPIC-016 stub —
   adopt selectively, not wholesale. Every verb must obey the
   never-say-"file" rule (§6.5 — the tester feared replacing an
   image would delete pictures off his drive).
2. **Panel/card visual identity** (tabled rev 0.31; §8.5, §4.6).
   The tethered panel, the pinned sticky, and the board CARD
   appearance need one coherent family: shadow = screen-space,
   flat = world content is ratified; the new wrinkle is rev 0.47's
   world-scaling tethered panels — the shrink needs a designed
   legibility floor (fade point, minimum readable state) and the
   pin gesture ("peeling it onto the glass") deserves a beat.
3. **The icon glyphs and the dot palette** (§4.6; found at
   AI-IMP-109). Six icon ids exist (star · pin · flag · heart ·
   bolt · leaf) but the renderer draws ONE generic diamond for all
   of them — the glyphs have literally never been designed. The
   dot palette (eight theme tokens: blue teal green gold orange
   red purple pink) was coined by an implementation agent as
   least-surprise placeholders; review deliberately.
4. **Trash browser visual pass** (§9.7, shipped functional).
   One flat list, kind glyph + title + trashed-when + impact
   summary, restore per row, Empty Trash behind the §9
   confirmation. The mechanics are ratified; the row tone, impact
   summary wording, and empty state want design eyes.
5. **☰ menu, Help/About, and the Keyboard settings section**
   (§8.2, §11.5). The geometry is ratified (Undo · Redo · Trash… ·
   End Session · Settings · Help/About); disabled rows carry
   naming tooltips and printed shortcuts. Keyboard section is
   view-only with a "rebinding coming soon" line. Tone and chrome
   pass wanted.
6. **Broken-link state** (§7.1/§7.2). Shipped: red + wavy
   underline for dead/purged, grey reserved for
   recoverable-trashed. Open gut-check: does red/wavy read "dead
   link" or "spelling error"? If the latter, design the
   alternative.
7. **Library door styling** (§8.2 ⧉; ratified shape). One menu,
   two sections — "Your library" pinned above a divider, worlds
   below. Ratification note says: watch for too-subtle section
   styling.
8. **The noun** (§6.5). UI copy avoids nouns entirely where
   possible; "item" is the working choice where one is
   unavoidable; "node" stays a docs/graph word. Final tone call
   here.
9. **Swap manager dialog** (§6.5). The "Swap for…" picker: project
   node list, upload-new at top, the displaced bucket surviving
   unplaced. Needs its dialog design (it's also the placeholder
   workflow's exit, so it should feel effortless).
10. **The place cursor** (§14.4 pull; also future place-existing).
    A ghosted preview riding the cursor after "Pull into this
    world"; click places, Esc stores. The ghost's visual weight
    and the stored-instead toast deserve a look.
11. **First-run guide** (EPIC-019). ~7 pages, asks what you plan
    to do, shows suited workflows (painter reference boards /
    comic·pitch-bible / timeline story mapping), then dumps into
    the seeded demo. Prime teaching job: imports COPY bytes — your
    files are never touched; one item lives many places. This is
    both content design and visual design.
12. **Seed/demo curation** (§14.4; owner + first tester supply the
    real set — the shipped three-artist set is provisional).
13. **Rich-text typography** (EPIC-018 values): the LOUD default —
    headings get size AND color, formatting reads at a glance;
    quiet alternate optional. Palette rides theme tokens.
14. **Frames** (EPIC-017, rev 0.38): hover-dim membership,
    sort-on-drop defaults — interaction design turn before the
    epic activates.
15. **The lit stage and the void** (rev 0.50, §6.7,
    PureRef-inspired): on boards without a background image, the
    area your content occupies (bounding box + padding) renders in
    the board's background color; beyond it lies a darker void
    with a dimmed grid. It grows as you push items outward and
    never retreats mid-session. Mechanics are ratified; the LOOK
    is yours: how much darker the void steps (a derived theme
    token, not a second color), padding generosity, whether the
    edge is hard, soft, or vignetted, corner treatment, and how
    the first placement's "bloom" on an empty board should feel.
16. **The note metadata card** (rev 0.51, §7.8): a system-owned
    block at the tail of a note's body (placements tree with
    fly-to entries, provenance: original filename / import date /
    source). In-app it renders as a structured card below the
    editor, never as raw text — design the card: how it separates
    from user prose, how a 40-board placement tree stays scannable,
    how fly-to entries read as navigation, and the per-note toggle.
    In exports it's plain markdown; the on-disk shape is fixed,
    the card is yours.

## Authority ladder (which document wins)

When sources disagree, precedence runs:

1. **The RFC** (RAG/RFC-0001-…, current revision) — product
   semantics and every accepted decision. Always wins.
2. **This letter** — the current design worklist and deltas.
3. **The design-system package** (tokens, components, UI-kit
   screens, brand rules) — authoritative for visual vocabulary,
   but it snapshots an older RFC revision; where it contradicts
   the RFC or this letter, it is the one that updates.
4. **Design-Artifacts-v1.0.zip** (the narrative HTMLs) —
   historical visual baseline only; consult for feel, never for
   current behavior.

## Constraints the design must honor (load-bearing, not taste)

- **Theme tokens only.** A guard test fails the build on raw
  hex/rgba outside theme.css; a second guard fails on undefined
  tokens. Every design color becomes a token first.
- **The occlusion contract** (§8.8): named z-ladder, modals escape
  to the root overlay host, everything anchored clamps, chrome
  never occludes what it annotates, flights reserve space for the
  panel they open.
- **Engagement cadence** (§8.2): all chrome fades on ONE shared
  clock; any element fading independently is a bug. Charm
  visibility keys on rendered screen size, never zoom percentage.
- **Tooltip rule** (§8.2): every hoverable control names itself
  and prints its shortcut, one chip style app-wide. The GUI is the
  tutorial.
- **Nothing docks, nothing reflows the canvas** (§8.2): errors are
  toasts, ongoing conditions use the perch.
- **Never `<datalist>`** (segfaults hidden Electron windows) — all
  completion UIs are custom lists.
- **Composability**: surfaces must stay learnable one at a time;
  a design that requires understanding canvases to use notes is
  wrong by principle.
- **AI features are connectors** (§11.5): anything AI-shaped lives
  behind the Advanced master toggle, off by default, and its
  design must read as opt-in, never ambient.

## Process

Design outputs come back as decisions: they enter
`RAG/DESIGN-QUEUE.md` if they need a conversation, get ratified
into the RFC with a rev bump, and unblock tickets. The coverage
map (`surface-coverage.html`) shows where each surface stands
today — green shipped, blue building, amber shaped-and-waiting,
red undesigned. The red cells are this letter's items. Work the
list top to bottom; every answer turns into build work the same
day, as tonight proved fourteen times.

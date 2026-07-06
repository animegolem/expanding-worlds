# RFC-0001: Core Note, Node, and Canvas Model

Product semantics, persistence boundaries, and provisional desktop
architecture for the Phase 1 prototype

| **STATUS**           | **REVISION** | **LAST UPDATED** |
|----------------------|--------------|------------------|
| Accepted for Phase 1 | 0.29         | 6 July 2026      |

> **WORKING PRODUCT STATEMENT**
>
> **A visual reference board where any meaningful object can
> become a reusable, documented doorway into another board, while shared
> notes let related instances retain one common body of
> meaning.**

**Decision scope**

Phase 1 product semantics, project roots, core lifecycle rules,
rendering and persistence seams, and accepted technology direction. Fine
UI composition remains subject to prototype feedback.

# Contents

1. Summary

2. Motivation

3. Goals and non-goals

4. Normative domain model

5. Core invariants

6. Creation, reuse, and promotion flows

7. Titles, wiki links, and spatial resolution

8. Navigation and provisional workspace direction

9. Deletion, trash, and resource retention

10. Commands and undo

11. Persistence and asset storage

12. Rendering and performance

13. Desktop technology direction

14. Graph and data views

15. Future authoritative collaboration seam

16. Export contract

17. Phase 1 vertical slice

18. Acceptance criteria

19. Open questions

20. Decision summary

# 1. Summary

The application is an art-first, recursive reference-board and
world-building workspace. It should feel first like an excellent visual
board for arranging artwork and reference material, while allowing
structure to emerge naturally as the user develops the world.

Every project has one protected root node whose canvas is the Home
destination. Within a project, the model separates three levels:

1. A **note** represents shared semantic meaning and prose.

2. A **node** represents one addressable object or instance that
may reference a note and owns its own appearance, tags, optional
canvas, and placements.

3. A **placement** represents one spatial occurrence of a node on
a canvas.

A note may be shared by several nodes. A node may appear through several
placements. This supports both of the following without conflating them:

- The same object shown in several places: one node, many placements.

- Several objects sharing one generic description: several nodes, one
  note.

Flat, project-scoped tags personalize nodes without changing shared note
meaning. Decorative marks such as text, shapes, arrows, connectors, and
freehand drawing are canvas-local content and are not nodes or semantic
graph edges.

> **Working product statement:** A visual reference board where any meaningful object can become a reusable, documented doorway into another board, while shared notes let related instances retain one common body of meaning.

# 2. Motivation

The product is intended to support art direction and world building
without requiring the user to define a formal ontology first. The
application does not have built-in concepts such as character, town,
creature, building, faction, or item. Meaning emerges from images,
notes, tags, links, canvases, and placement.

A typical progression is:

1. Drop an image or create a pin.

2. Arrange it spatially.

3. Attach or create a note when a shared description becomes
useful.

4. Add node-local tags when a particular instance needs
distinction.

5. Open the node's canvas and develop another board.

6. Reuse the same node through additional placements.

7. Create another node using the same note when several distinct
instances share one description.

This should remain low-ceremony. A dropped image may remain only an
image-backed node forever. Structure is optional and accumulates only
when useful.

# 3. Goals and non-goals

## 3.1 Goals

Phase 1 MUST establish:

- A small domain model supporting shared notes, reusable nodes, multiple
  placements, and recursive canvases.

- A board interaction loop competitive with dedicated art-reference
  tools.

- Stable identity independent of titles, filenames, or placement.

- Deterministic Obsidian-style note links.

- Unresolved-link phantom notes with materialize-on-intent creation
  and wiki-link title suggestions.

- Immediate text navigation with independent spatial resolution.

- Non-destructive image import from file drop, clipboard paste, and
  browser drag, with cropping, thumbnail generation, and oversized-map
  handling.

- Clear separation between semantic objects and decorative canvas
  content.

- A command and persistence boundary that does not block an
  authoritative client/server mode later.

- Portable export of notes, project structure, and original assets,
  with lossless reimport of an exported project.

- A protected project root node and root canvas used as the Home
  destination.

- Flat, first-class node tags that act as the user-defined
  organizational layer.

- A node library data view covering all active nodes with an Unplaced
  filter, so unplaced material remains discoverable.

- Full-text search across notes, tag names, asset filenames, and
  canvas text, plus a keyboard quick-open over notes and canvases.

- Useful canvas-local text, shape, drawing, line, connector, grouping,
  ordering, and background operations.

- Board arrangement tooling: align and distribute over
  multi-selections, non-destructive horizontal and vertical flip, zoom
  to fit and zoom to selection, and snapping with smart guides during
  drag.

- RFC 9562 UUIDv7 identities, versioned commands, and monotonic project
  revisions.

## 3.2 Non-goals

Phase 1 does NOT require:

- Built-in world entity types.

- Real-time collaboration, offline merge, CRDTs, or server accounts.

- PostgreSQL, Docker, or multi-service local deployment.

- A plugin API.

- A general vector illustration application.

- Per-node access control or publishing roles.

- A full database-view builder.

- Automatic semantic classification of images.

- A specialized map or scene type.

- Placement-specific appearance overrides.

- Exact-node or exact-placement wiki-link syntax.

- A full asset-library manager, watched directories, or vendor-library
  synchronization.

- Tag hierarchy, tag aliases, or tag-to-tag relationships
  (hierarchy was briefly accepted in rev 0.19 and dropped in
  rev 0.20; see section 4.8).

- Named canvas layers.

- Automatic semantic graph relationships inferred from drawn connectors.

- Note-body preview cards rendered on canvas.

- SVG, video, audio, or PDF import.

- Web-reference assets, media playback, and the media-backup adapter,
  which remain the shaped deferred direction described in section 4.7.

- Auto-arrange (pack) and grid display or grid snapping, which remain
  the shaped deferred direction described in section 6.9.

- Embedding managed assets in note bodies, which remains the shaped
  deferred direction described in section 4.2.

# 4. Normative domain model

## 4.1 Cardinality overview

| **Record** | **Cardinality and responsibility** |
|----|----|
| Note | May exist independently and may be referenced by zero or more nodes. Owns title and body. |
| Node | May reference zero or one note. Owns default appearance, tags, optional canvas, and placements. |
| Canvas | Belongs to one node in Phase 1 and contains placements, decorations, one optional background, and view state. |
| Placement | References exactly one node and one containing canvas. |
| Asset | Stores managed imported media independently of nodes and placements. |
| Decoration | Has stable identity, exists only inside one canvas, and has no note, tag, graph, or child-canvas capability. |
| Tag | Project-scoped flat record assigned many-to-many to nodes. Acts as user-defined organization without application-defined entity types. |
| Project | Owns one protected root node and root canvas and scopes titles, tags, commands, revisions, queries, and navigation. |

## 4.2 Note

A note is the semantic and textual record addressed by a wiki link.

A note MUST have:

- A stable RFC 9562 UUIDv7 ID.

- Project membership.

- A non-empty user-facing title.

- A normalized title_key used for matching and uniqueness.

- Creation and modification metadata.

A note MAY have:

- A Markdown body.

- Links to other notes.

- Zero or more referencing nodes.

A title-only note is valid. A note with no nodes is valid and has no
spatial location until attached to a node.

A note title MUST be unique within its project by title_key. The
displayed title remains exactly as entered.

The title_key is derived by:

1. Trimming leading and trailing whitespace.

2. Collapsing internal whitespace runs to one space.

3. Unicode-normalizing to NFC.

4. Applying locale-independent Unicode case folding.

Confusable or homoglyph folding is out of scope for Phase 1.

A Phase 1 note title MUST be expressible as a wiki-link token: it may
not contain `[`, `]`, `|`, or line breaks. Such a title could never be
written as a `[[Title]]` occurrence, and rename rewrites of inbound
tokens would corrupt source bodies. Blocked titles return a structured
validation error; lifting this restriction later requires an escape
syntax for link tokens first.

Wiki-link occurrences are indexed in separate link records that store
source note, target note ID, source revision, and source range or token
identity. Markdown remains the user-editable canonical text.

A trashed note retains its title_key reservation until it is permanently
purged, so restoration remains deterministic.

A note body is plain Markdown text in Phase 1 and does not embed
managed assets; images live on canvases, and garbage collection never
scans prose. **Deferred with scope:** a future embed syntax SHOULD
parse the way wiki links do, producing indexed embed records that
reference assets, so reference tracking flows through records rather
than text scanning; pasting an image into a note would run the staged
import pipeline and insert a reference; and the editor would render
embeds as inline decorations over the Markdown source.

## 4.3 Node

A node represents one addressable object or instance.

A node MUST have:

- A stable RFC 9562 UUIDv7 ID.

- Project membership.

- Creation and modification metadata.

A node MAY have:

- A reference to one note.

- One canvas in Phase 1.

- A default appearance.

- Zero or more assignments to flat, project-scoped Tag records.

- Any number of placements.

A node does not require a note, title, image, or canvas. Before it
references a note, the application may identify it by appearance, source
filename in an inspector, or a shortened UID.

Several nodes may reference the same note while keeping independent:

- Appearances.

- Tags.

- Canvases.

- Placements.

- Lifecycles.

When one formerly generic instance becomes important enough to need
unique prose, it receives a different note. The application does not
introduce a special instance category.

Tags belong to nodes rather than notes. They personalize one object or
use of shared note meaning; for example, one node using a generic person
note may be tagged injured, weak-right-leg, or arrow-wound while another
use remains untagged.

## 4.4 Canvas

A canvas is an optional spatial workspace belonging to one node. The
application does not define a separate map or scene type.

A canvas contains:

- Placements of nodes.

- Decorative canvas content.

- Camera and layout state.

- One optional managed-asset background with transform, fit, opacity,
  and presentation settings.

- One optional solid background color, independent of the image
  background and rendered beneath it when both exist.

A canvas may contain placements of nodes that themselves own canvases.
Containment is a graph rather than a tree: direct and indirect cycles,
including a node placed on its own canvas, are legal. Only the active
canvas is mounted as a live renderer.

The canvas has three conceptual render planes: a dedicated background
plane; one shared ordered plane for placements and decorations; and
temporary interaction overlays such as selection outlines, marquees,
and smart guides. Named layers are deferred.

Every placement and decoration in the normal content plane MUST have a
canvas-scoped render_order that forms a deterministic total order. Lower
values render behind higher values; stable UUID order breaks any
accidental tie. Reordering commands preserve relative order where
possible and MAY rebalance order keys transactionally without changing
visible order.

Creating or first opening a node canvas persists it immediately so
navigation history and bookmarks can target a stable canvas identity
before the first content edit.

## 4.5 Placement

A placement is one spatial presentation of a node on a canvas.

A placement contains:

- A stable placement ID.

- Containing canvas ID.

- Node ID.

- Position.

- Scale or dimensions.

- Rotation.

- A deterministic render_order shared with decorations in the normal
  content plane.

- Canvas-local presentation state, including label visibility.

A placement is not a node. Removing a placement MUST NOT delete its
node.

The same node may have several placements on the same canvas or on
different canvases.

A placement MAY display a label showing the attached note's title.
Labels have no independent text: a node without a note has no label,
and attaching a note is the act that names a placed object. Label
visibility is per-placement presentation state, defaults to visible,
and MUST be toggleable directly from the placement's selection
controls rather than only through an inspector. A label follows note
renames automatically and is not a decoration or a node title.

A label renders at a scale proportional to its placement's world
size: resizing the placement resizes the label with it, and the label
zooms with the canvas like any world content. Labels are never
screen-space overlays. The label is deliberately the only
relatively-sized content in the model — it has no independent
existence to own a size of its own. The exact ratio and any
legibility clamping are presentation tuning left to prototype feel,
not model state.

## 4.6 Appearance

Dot, icon, and image are appearances, not different node types.

A node's default appearance MAY be:

- A colored dot.

- A built-in icon.

- An imported image.

An image appearance references a managed asset and non-destructive crop
or framing settings. The original asset MUST remain unchanged.

Phase 1 uses one shared default appearance per node. Placement-specific
overrides are deferred.

## 4.7 Asset

An asset is managed imported media stored separately from node and
placement records.

Every asset carries a kind discriminator. Phase 1 uses only the image
kind; the discriminator exists in the Phase 1 schema so future kinds
do not require identity migration.

Phase 1 imports raster images: PNG, JPEG, WebP, GIF, and AVIF. SVG,
video, audio, and PDF are deferred. Staged-import validation rejects
unsupported or unrecognized types with a clear notice and creates no
records.

An image asset SHOULD record:

- Content hash.

- Original filename.

- MIME type.

- Pixel dimensions.

- Managed storage location.

- Optional source URL or attribution.

- Generated derivative metadata.

The project MAY deduplicate file bytes by hash without merging nodes.

Logical Asset metadata remains separate from immutable content-addressed
file bytes. Several Asset records may reference the same bytes without
merging filenames, attribution, source metadata, or future library
metadata.

Phase 1 copies imported files into project-managed storage rather than
depending on external absolute paths. This protects continuity,
simplifies export, and avoids breakage when source files move or
disappear.

A full asset-library manager, asset tagging, watched directories,
metadata-aware cross-application drag, and Eagle or Allusion library
import are deferred. Future vendor importers MUST remain versioned
adapters outside the core domain model. The accepted direction for
the library surface itself is section 14.4: library entries are
unplaced nodes, a library is internally a project, and projects
ingest from sources rather than referencing them.

A deferred **web-reference** asset kind is shaped as follows so the
model leaves room for it. A web-reference stores a source URL and
fetched metadata such as title, site, and oEmbed or OpenGraph fields,
plus a thumbnail derivative that serves as node appearance; activating
such a node MAY open a DOM overlay above the canvas for playback or
preview. An optional user-configured media-backup adapter, such as a
self-hosted yt-dlp endpoint, MAY archive the underlying media into
managed storage; it defaults to off and remains a versioned adapter
outside the core domain model.

**Deferred with scope: booru drop adapters (rev 0.21).** Dropping a
link to a booru post — Sakugabooru first (a Moebooru instance),
ideally a wide net over the Danbooru and Moebooru API families —
imports an already-tagged document in one motion: the post's media
becomes the managed asset (hash-deduped), the site's curated tags
arrive as tag assignments through the same explicit tag-border
decision that governs cross-project ingest (§14.4), the post
thumbnail serves as the placeholder derivative, and the post URL is
recorded as source attribution. The whole drop lands as one CreatePin
through the staged import pipeline. These are versioned adapters per
the importer-dialogue language below, keyed by site family rather
than per site; authentication, rate limits, and the exact family
coverage list are implementation-time concerns inside the adapters,
never domain concerns.

**Deferred with scope: the importer dialogue and import adapters.**
The importer dialogue is the single expansion point for what content
can enter the app. When a dropped or pasted source is not directly
importable — a layered or exotic image format (PSD, TIFF, KRA), an
oversized file crossing a user-set auto-optimize threshold, or a URL
whose media needs fetching — one dialogue pattern presents the
applicable **adapter actions** rather than rejecting the import.
Examples: convert a PSD to a raster image; downscale past the size
threshold; grab a web link's thumbnail now or archive its media via a
local tool. Conversions never discard user data: the produced raster
becomes the rendered managed asset, and the original file is retained
as an **archived-original** sidecar asset (kind discriminator; not
renderable; exported, GC-tracked, and available for future
re-extraction or opening in its native editor) — unlike tools that
warn the original is lost. Batch imports offer apply-to-queue and
remember-choice options. Adapters are versioned, declare the source
patterns they claim, may be built in (image codec) or externally
configured (yt-dlp-style endpoints), and stay outside the core domain
model; the auto-optimize threshold is an application preference.
Thumbnail derivatives ride the RENDERER's Chromium codecs (rev
0.27, AI-IMP-076): the renderer claims queued jobs, decodes/
resizes/encodes WebP-with-alpha, and submits bytes back to the
project service, which owns the queue and the files — zero native
dependencies, and the thumbnail format envelope can never drift
from what the board displays. Generation therefore needs a live
window; jobs queue and self-heal across opens. Conversion adapters
(PSD and kin) still need their own decode dependency when they
arrive — neither Chromium nor a stock native codec reads them, so
that ticket stands alone.

## 4.8 Tags

Tags are flat, project-scoped, first-class records assigned
many-to-many to nodes.

A Tag MUST have a stable UUIDv7 ID, project membership, a user-facing
name, a normalized name_key unique within the project, and creation and
modification metadata. A Tag MAY have a color or icon for presentation.

Tags distinguish nodes that share one generic note and form the final
thin organizational layer through which users create an ad hoc schema.
Tags do not belong to notes in Phase 1 and do not create built-in
application behavior or entity types.

Tags are app-managed metadata and are never serialized into or
derived from note text (rev 0.17; an Obsidian-style frontmatter
design was considered and rejected — bare placed art must be
taggable, and nodes sharing a generic note must stay
distinguishable). Note-attached tags are deferred, not rejected,
pending demonstrated need.

Activating a tag opens the **tag panel**: a search field with
tab-completion against existing tag names, over result rows spanning
every canvas in the project, unplaced nodes included. Rows use the
shared §7.4 row grammar — node appearance or thumbnail, attached
note title when present, other tags, location — with per-row
open-note and fly-to-placement actions; a cross-canvas fly-to is a
navigation event (§8.1). The panel header offers the **lens**: a
toggle that dims the visible canvas to a fraction of full strength
except matching placements, which keep full color plus an accent
ring. The lens is a view state, not a selection — it survives pan
and zoom until dropped (Escape or the toggle) and shares its
implementation with §7.5 highlight mode. The panel is reachable
through three doors that land on one surface: the charm bar's tag
chips (§8.4), the ⌕ field's tag mode (§8.3), and tag chips on a
note panel (§8.5). The query field takes exactly one tag in
Phase 1; multi-tag AND/OR queries are deferred.

Tag identity is independent of its name so renaming a tag does not
rewrite assignments.

**Tags are flat, and stay flat (rev 0.20).** A single-parent
organizing hierarchy was accepted briefly (rev 0.19) and dropped by
the owner in the same design cycle: the management surface, the
recursion semantics every query surface would carry forever, and
the cross-project ancestry rules together outweigh namespace power
tags do not need — real structure belongs to canvases (containment)
and links (relations), and tags remain the deliberately thin final
layer. The gallery (§14.4) presents a flat tag list with counts if
a library's tags outgrow memory. If hierarchy ever returns it is a
tags-domain question to reopen deliberately, not a surface to grow
into. Tag aliases and tag-to-tag relationships remain deferred
until concrete usage demonstrates a need.

## 4.9 Decoration

Decorations are canvas-local records with stable UUIDv7 identity that do
not receive node capabilities.

Examples include:

- Canvas text.

- Freehand or tablet paths.

- Rectangles, ellipses, triangles or polygons, and clouds.

- Straight lines and arrows.

- Connectors with free endpoints or optional placement anchors.

- Guides, highlights, and spacers.

Decorations do not have notes, canvases, tags, backlinks, or graph
identity. A drawn connector is visual content and MUST NOT become a
semantic graph edge automatically.

Decorations MAY be ordered with placements, locked, hidden for
presentation, and grouped for movement or transformation. A group
remains canvas-local and does not establish semantic containment.

A drawn decoration's presentation attributes (stroke, fill, weight;
for rectangles an optional corner-rounding fraction of the shorter
box dimension, rev 0.16) remain editable from the selection after
placement; each edit is one user-level command.

When a connector endpoint is anchored to a placement, it follows that
placement. If the placement is deleted, the endpoint SHOULD become a
free point at its last rendered position rather than deleting the
connector.

Canvas text is lightweight visual labeling. It is not a note, does not
participate in wiki links, and does not receive backlinks or node tags.

Canvas text — like every decoration and placement — owns an
independent world-space size. It scales only with canvas zoom and is
never rendered at a screen-constant size or rescaled relative to
other content; resizing a nearby placement never affects it.
Legibility is a property of the current zoom, and there is no
automatic rescaling: the layout is authoritative, and zooming is how
it is read. Newly created text SHOULD default to a world size legible
at the creating viewport, fixed thereafter; resizing a text selection
scales that world size uniformly (rev 0.12), so text behaves like
scalable art text rather than reflowing.

Canvas text styling is WHOLE-OBJECT (rev 0.12): one font family —
installed system fonts enumerated via Local Font Access (rev 0.13),
stored with a graceful generic fallback so boards opened on machines
lacking the font degrade rather than break — bold, italic, size, and
color per
text decoration, editable from the selection. Per-span rich text —
bolding one word, mixed sizes — is deliberately deferred: if it ever
arrives it is styled runs stored in the decoration data, never HTML,
and the plain string at data.text (the FTS contract) is preserved.
The prototype does not grow a rich text editor.

## 4.10 Project

A project is the authoritative scope for titles, tags, records,
commands, revisions, queries, export, and navigation.

A project MUST have:

- A stable RFC 9562 UUIDv7 ID.

- A user-facing title.

- A schema version.

- A monotonically increasing project_revision.

- Exactly one root_node_id.

The root node and its canvas are created atomically with the project.
The root node MUST belong to the project, MUST own a canvas, and MUST
NOT be trashed. The root canvas MUST NOT be deleted. Home always opens
the root canvas.

Commands, queries, subscriptions, workspace history, bookmarks, and
open views MUST be scoped to one project. The initial UI MAY support
one open project per application window without defining a final
multi-project interface.

## 4.11 Identity and ordering

All newly generated persisted project, note, node, canvas, placement,
asset, tag, decoration, group, link, bookmark, and command identities
MUST use RFC 9562 UUIDv7.

UUID ordering MAY improve database locality but MUST NOT be treated as
authoritative event or creation order. created_at metadata and
project_revision remain authoritative for temporal sequencing.

Human-facing shortened identifiers MUST NOT use only the leading UUIDv7
characters because nearby identifiers share their timestamp prefix. A
random-tail fingerprint or separately derived short code SHOULD be used.

# 5. Core invariants

The implementation MUST preserve these rules:

1. Persisted identities generated by the application use RFC 9562
UUIDv7.

2. Each project has exactly one protected root node and root canvas;
Home targets that canvas.

3. A node references at most one note.

4. A note may be referenced by zero or more nodes.

5. A non-empty note title is unique within its project by normalized
title_key, including while the note remains in Trash.

6. Wiki links target note IDs through indexed link records.

7. Placements target node IDs.

8. Tags are flat, project-scoped records with globally unique name
identity, assigned only to nodes.

9. A node may have many placements, including several on one canvas.

10. A node has at most one canvas in Phase 1.

11. Deleting a placement never purges its node. Deleting the last
placement of a bare node moves that node to Trash within the same
user-level command; any other node remains active.

12. Detaching a note from one node never modifies other nodes using
that note.

13. Trashing a record preserves the record and its recoverable
relationships until purge.

14. Deleting or trashing a canvas does not delete referenced nodes by
default.

15. Trashing a node does not trash a shared note.

16. Decorative content never gains node capabilities, note links,
tags, or automatic graph-edge meaning.

17. A canvas background is a canvas property referencing an Asset; it
is not a node or placement.

18. Canvas containment is a graph. Direct and indirect cycles,
including self-reference, are legal.

19. Traversal, export, reachability, and graph code use visited sets
and explicit depth or result limits.

20. The renderer mounts only the active canvas and does not recursively
mount descendants.

21. Background, normal content, and temporary interaction overlays
remain separate render planes; placements and decorations share
deterministic ordering in the normal plane.

22. Durable mutations pass through serializable, versioned domain
commands rather than direct UI-to-database writes.

23. Every committed durable mutation advances the project_revision
monotonically.

24. Structural undo emits inverse commands rather than rewinding
arbitrary database state.

25. A continuous pointer gesture may update renderer state ephemerally
but commits at most one durable user-level command when completed.

26. Every saved wiki-link token has exactly one indexed link record in
state bound, unresolved, or broken.

27. Creating, renaming, or restoring a note binds matching unresolved
link records within the same user-level command; broken link records
never re-bind implicitly.

28. A phantom note persists no records and reserves no title until
materialization.

29. An editing burst commits one UpdateNote command on completion, and
pending buffers are flushed before any command reads or rewrites the
note body.

30. Note-body edits are undone through editor-local history and never
enter the structural undo stack.

31. The structural undo stack is project-session-scoped, shared across
all of the session's views, and in-memory; committed command metadata
persists as a non-replayable log.

# 6. Creation, reuse, and promotion flows

## 6.1 Import an image onto a canvas

For a dropped image file, the application MUST:

1. Copy or deduplicate the file into managed asset storage.

2. Create a new node.

3. Set the node's default appearance to the imported image.

4. Create a placement on the active canvas.

5. Preserve the natural aspect ratio unless the user changes it.

The node initially needs no note or canvas.

The same staged pipeline MUST serve OS clipboard paste of raw image
data, such as screenshots, and of copied files; pasted content places
at the cursor position or view center. It also serves drops
originating in a browser: a drop carrying image bytes imports them
directly and records the source page URL as asset attribution when
available. A URL-only drop SHOULD fetch the image over the network as
a user-initiated act; a failed or unsupported fetch produces a clear
error and creates no records.

Sources that are not directly importable route through the deferred
importer dialogue (§4.7): applicable adapter actions are offered in
one dialogue pattern instead of a bare rejection.

## 6.2 Create Pin

The CreatePin command is the one-transaction backbone behind
imports, phantom materialization, and note placement: one committed
CreatePin performs asset import when applicable, node creation, note
creation or attachment when applicable, appearance assignment, tags,
and placement creation as a single user-level transaction.

Its user surface is the **pin tool** (rev 0.20, resolving open
question 20): a dock tool (◉, shortcut N) sharing the map-pin glyph
with the §8.1 bookmark control — pins mean places, everywhere.
Clicking with the tool places a dot node with its phantom note
already open and focused: type and the first committed edit
materializes note, node, and placement (§7.2 rules); press Escape
first and nothing ever persisted. Icon and image appearances, tags,
and note attachment flow through the ordinary node operations
afterward (§8.4 charm bar, §6.6) rather than a creation dialog. The
interim Create Pin dialog retires when the pin tool ships.

## 6.3 Place Existing

Place Existing creates a new placement of the same node.

It shares:

- Note reference.

- Appearance.

- Tags.

- Canvas.

- Node identity.

It creates only a new placement.

## 6.4 Create Another Using This Note

This operation creates a new node that references an existing note.

It shares:

- Note title.

- Note body.

- Note links.

It does not share:

- Node identity.

- Appearance.

- Tags.

- Canvas.

- Placements.

This operation need not occupy the primary creation UI. It may appear in
a note's Uses list, a title-collision flow, or a node context menu.

## 6.5 Copy and paste

Copying a placement creates another placement of the same node.

A future explicit Duplicate as New Node operation may create a new node
and copy selected aspects. It is not the default copy behavior.

## 6.6 Attach, detach, and make independent

A node with no note may attach an existing note or create a new one.

Detach from This Node removes only the node-to-note reference. The note
remains intact, including when this leaves it with zero nodes. The
action SHOULD be immediately undoable and generally does not require a
confirmation dialog.

Make Note Independent:

1. Copies the current shared note body.

2. Creates a new note.

3. Requires a new project-unique title.

4. Attaches the new note to the current node.

5. Detaches the old note from that node.

This is a convenience operation, not a new domain category.

## 6.7 Canvas background

A canvas MAY set one managed image Asset as its dedicated background.
The operation imports or selects the Asset, stores background transform
and fit settings, and does not create a node or placement.

The UI SHOULD support Set Image as Canvas Background, Replace
Background, Edit Background Position, Reset Background Transform, and
Remove Background. A placement backed by an image MAY expose Set as
Background. Setting or clearing the canvas background color is an
ordinary durable command available alongside these operations.

Background editing occurs through an explicit mode so the background
cannot be accidentally selected during ordinary work. Oversized
backgrounds use tiled or pyramidal derivatives while retaining the
original Asset as canonical.

**The background defines the canvas's stage (rev 0.11).** A background
image gives the infinite canvas a home extent — presentation only,
touching no domain invariant: placements remain legal anywhere and the
camera is never clamped. Inside the extent the image is the surface
and the grid hides; beyond it the renderer shows a visually distinct
void (flat, gridless) so leaving the map is unmistakable. Zoom to fit
with no selection frames the extent, and future canvas navigation
(§8.1) SHOULD land entering users on it.

Because world size governs proportions, not fidelity, Set as
Background from a file normalizes the stage rather than the image: the
background transform is set so the extent spans a canonical stage
width (2048 world units, a tunable constant), so default pin, text,
and stroke sizes read proportionate on any map. Set as Background from
a placed image preserves that placement's current world rect — the
user already expressed its size. Replace Background fits the new image
into the prior extent, which is how replacement preserves existing
canvas coordinates (closing former open question 7). Reset Background
Transform returns to the normalized default. Setting a background
SHOULD end with the camera easing (not teleporting) to frame the new
extent, confirming the action and landing at the stage's natural zoom.
Because normalization governs proportions, not fidelity, setting a
background whose native width falls below a smallness threshold SHOULD
raise a non-blocking notice that the image may look soft as a
background; the set still proceeds (rev 0.12).

## 6.8 Draw, connect, order, and group

Creating canvas text, a shape, freehand path, line, arrow, or connector
creates a Decoration with stable identity on the active canvas.

Placements and decorations MAY be brought forward, sent backward,
brought to front, or sent to back within the shared normal-content
render plane. Lock, unlock, hide, show, group, and ungroup are
canvas-local operations.

Moving or reordering a group preserves the relative render order of its
members. Grouping does not create a separate render plane or permit one
group to contain semantic nodes.

Grouping is presentation state and stays that way. The relational
model MUST NOT mirror the visual arrangement of a board: structure
comes from content — notes, tags, links, and sub-canvases — never from
where things happen to sit. PureRef-style parent-child image
hierarchies are deliberately not adopted; durable containment is what
sub-canvases are for. If prototype use shows groups need to be more
directly manipulable than select-and-move (a dungeon board grouping
mobs and treasure, say), the sanctioned shape is a **frame**: an
on-canvas object placed and ordered like any other content that other
content sits inside — not a new relational overlay. Frames are
deferred pending artist feedback (§19).

Connector endpoints MAY be free points or anchored to placements.
Connector geometry remains visual decoration and does not create a
semantic relationship.

While drawing (rev 0.12), Shift constrains to the tidy form: shapes
to canonical proportions (square, circle, equilateral triangle; a 2:1
box for the arrow shape) and segment kinds — lines, arrows,
connectors — to 45° angle steps.

There are TWO arrow constructs (rev 0.13), mirroring the Baseline UI
Vision's tool rail. The ANNOTATION ARROW is a segment kind and a pen
stroke: its head derives from its stroke thickness (tunable
proportions), thickness stays constant under resize exactly like
lines, and thickness clamps proportional to length so degenerate
inputs stay arrow-shaped. Like new canvas text, EVERY new stroke
defaults to a width legible at the creating viewport, fixed
thereafter (rev 0.14): the toolbar's weight control is a MULTIPLIER
on a screen-pixel baseline (pen arrows carry a thicker baseline so
the head reads), not an absolute world width — the same weight
setting means the same visual weight at any zoom. Stored decoration
data still carries absolute world widths; only the creation layer
changed. The ARROW SHAPE is a ShapeKind variant: a
block silhouette filling its bounding box that scales, rotates,
fills, and strokes like any shape — proportions are properties of
the box. Stretching a pointer and scaling an arrow object are
different intents and belong to different tools.

## 6.9 Arrange, align, and navigate the board

Align operations (left, horizontal center, right, top, vertical
middle, bottom) and distribute operations (even horizontal or vertical
spacing) act on a multi-selection of placements and decorations and
commit one durable command each.

Flip horizontal and flip vertical are non-destructive placement
presentation state, like crop on an image appearance; the managed
asset is never modified.

Zoom to fit and zoom to selection adjust camera state only and are not
durable commands.

**Camera input.** Input mapping follows platform muscle memory rather
than inventing its own: on trackpads, pinch MUST zoom centered on the
pointer and two-finger scroll SHOULD pan; a discrete mouse wheel zooms
at the pointer; holding Space or dragging with the middle button pans.
Whether wheel-zoom versus wheel-pan needs a user preference is an open
question (§19). The pointer SHOULD communicate interaction state — a
grab cursor while panning, directional cursors over resize and rotate
zones.

**Cursor zones, not handles (rev 0.17).** Selection draws a thin
accent outline only; no transform handles are ever rendered. The
cursor is the affordance, driven by hot zones around the selected
object: inside means move; within a few pixels of an edge means
directional resize; a corner means diagonal resize; a narrow band
just outside a corner means rotate; empty canvas means grab and pan.
Option-drag inside duplicates (a copy per §6.5 — another placement
of the same node). A locked object shows a refusal cursor and draws
no further state. Zone widths are provisional feel constants. The
label-visibility toggle and other selection controls live on the
§8.4 charm bar rather than on drawn adornments.

While dragging, placements and decorations SHOULD snap to the edges
and centers of nearby content, with smart guides rendered in the
temporary interaction overlay plane. Snapping is an ephemeral
interaction aid: the gesture still commits exactly one durable command
on completion, and a modifier key SHOULD temporarily disable snapping.
Option carries two meanings that read at different moments and so
never collide (rev 0.21): held at drag START it duplicates (the
cursor-zone rule above); pressed MID-drag it is the snap bypass.
Shift's tidy constraints take precedence (rev 0.15): while Shift
enforces an axis or proportion, snapping is disabled so nothing pulls
the result off the enforced geometry.
Smart guides SHOULD be visually quiet — thin, dotted, reduced
opacity — and appear only while a snap is actively engaged. Engagement
SHOULD use hysteresis, releasing at a slightly larger distance than it
engages, so content does not oscillate at the threshold.

Rotation snaps by ORIENTATION, not delta (rev 0.12): a single rotated
item magnetizes gently to the cardinal directions (returning to
upright is "rotate near it and it clicks"), Shift quantizes the
resulting orientation to an evenly divided circle (15° steps), and
the snap-bypass modifier disables both. No separate reset-orientation
control is needed.

Zoom to fit and zoom to selection SHOULD ease the camera to their
target rather than jumping.

**Grid display (rev 0.11).** Canvases without a background image show
an adaptive multi-scale grid: only the subdivision levels legible at
the current zoom are drawn, with the finer level fading in as zoom
crosses each scale threshold, so the grid subdivides indefinitely in
both directions. The grid is presentation only and hides entirely when
a background image defines a stage (§6.7). Grid SNAPPING remains
deferred: snapping stays content-edge; when grid snapping is
revisited, the grid spacing SHOULD feed the same snapping machinery
specified above.

**Deferred with scope.** Auto-arrange (pack) — algorithmic reflow of
the selected placements into a compact non-overlapping arrangement —
is deferred; when revisited it SHOULD operate on an explicit selection
and commit as one durable command.

## 6.10 Place existing material

The node library and the Uses list are placement sources. A node
MAY be dragged from the node library onto the active canvas, creating
one placement at the drop position; a Place on Current Canvas action
creates one placement at the view center. Both are ordinary placement
creation and follow section 6.3 semantics.

For a note with zero nodes, the note panel and the Uses list's
Unplaced group offer Place on Current Canvas, which creates a node
with the default dot appearance, attaches the note, and creates a
placement as one user-level transaction: the same semantics as phantom
Create and Place, applied to an existing note. Because labels default
to visible, the placed dot immediately shows the note's title.

## 6.11 Materialize a phantom note

Writing [[Title]] for a title that does not yet exist is itself a
creation flow. The unresolved link accumulates alongside any other
references to the same title until the user materializes the phantom
note by editing its body, choosing Create Note, or choosing Create and
Place on Current Canvas. Semantics are specified in section 7.2.

# 7. Titles, wiki links, and spatial resolution

## 7.1 Wiki-link storage and link states

Saving a source note stores or refreshes one indexed link record per
wiki-link token. Every link record stores the source note ID, source
revision, and source token range or token identity, and exists in
exactly one of three states:

| **State** | **Additionally stores** | **Meaning** |
|----|----|----|
| Bound | Target note ID | The token resolved by title_key to one note, active or trashed. |
| Unresolved | The token's normalized title_key and display text | No note with that title_key existed when the source was saved. |
| Broken | Last-known display text | The bound target was permanently purged. |

On save, each token resolves by title_key against active and trashed
notes. A match produces a bound record; a token whose title matches a
trashed note binds to it, because the trashed note's title_key
reservation would otherwise leave the token permanently unresolvable.
No match produces an unresolved record.

Markdown source remains canonical and human-readable. Renaming a
target note transactionally rewrites the title text of every inbound
token and rebuilds affected link positions. An aliased token
[[Old|label]] becomes [[New|label]], so its displayed label is
unchanged; leaving the old spelling in place would silently unresolve
the token on its source's next save, because every token re-resolves
by title_key on save. The rename and all rewrites form one user-level
command.

Creating, renaming, or restoring a note MUST, within the same
user-level command, re-evaluate unresolved link records whose stored
title_key matches the note's resulting title_key and bind them. This
re-resolution sweep is the only implicit binding path; it never touches
broken records.

A bound link to a trashed note opens that note with a clear In Trash
state and a Restore action, and MAY additionally offer Purge and Start
Fresh, which purges the trashed note after an impact summary and opens
a phantom view for the title.

Purging a note converts its inbound bound records to broken. A broken
link MUST NOT silently re-bind by title. Activating a broken link
SHOULD offer creating a new note from the link's display text and,
when an active note matching that title_key exists, relinking this
occurrence to it. Both are explicit per-user actions that produce or
target a new note ID.

Wiki links do not choose a node or placement at authoring time.

## 7.2 Unresolved links, phantom notes, and materialization

All unresolved link records sharing one title_key are presented as one
**phantom note**. A phantom note is a projection over unresolved link
records; it persists no note record and does not reserve its title_key.

Unresolved links MUST render visibly distinct from bound links.
Activating an unresolved link opens the note pane in a **phantom
view** showing:

- The would-be title.

- All references to that title_key across the project, grouped by
  source note.

- The materialization actions below.

A phantom note materializes through any of:

1. Typing into the phantom body. The first committed edit creates the
   note carrying the typed content as one user-level command.

2. An explicit Create Note action.

3. An explicit Create and Place on Current Canvas action, which
   commits note creation, node creation, default appearance, and
   placement on the active canvas as one user-level transaction.

Create Note and Create and Place are equal peer actions; neither is
presented as the primary path. Materialization runs the re-resolution
sweep, binding every matching unresolved token project-wide in the
same command. Dismissing a phantom view without materializing persists
nothing.

A note created without placements is not orphaned: it remains
reachable through the links that reference it, search, and Unplaced
views, and can be embodied later through the note-side placement flow.

While typing a wiki link, the editor MUST offer title suggestions
matched by title_key, including:

- Active note titles.

- Phantom titles with a phantom indicator and reference count, so
  repeated references converge on one spelling.

- Trashed note titles, marked In Trash, MAY be included.

The suggestion list does not include an explicit create action in
Phase 1; creation flows through phantom materialization. Suggestion
ordering and presentation remain UI decisions.

## 7.3 Activation behavior

Activating a bound wiki link resolves text and space independently:

1. The note pane loads the target note immediately and
unconditionally.

2. The canvas workspace gathers all placements belonging to all
nodes that reference the note.

3. Spatial behavior depends on the number of valid locations.

| **Locations** | **Behavior** |
|----|----|
| Zero | Keep the canvas unchanged and indicate that the note has no placed locations (the §7.4 places header reads zero). |
| One | Open the containing canvas, center the placement, and select or highlight it. |
| More than one | Keep the pre-link canvas viewport and present a dismissible location chooser anchored to the activated link. |

Dismissing the chooser keeps the newly opened note visible and leaves
the canvas where it was. The dismissal interaction MUST NOT also select
or drag content underneath it.

In the shell model (rev 0.17), a note panel opened from text anchors
to the link that summoned it — panels grow from what you press — and
a zero-node or zero-placement note simply stays there as a loose-note
panel. When spatial resolution lands on a placement, the panel
re-tethers to that placement, so the reading surface and the flown-to
object reunite.

In the Phase 1 source editor, link activation is modifier-click
(Mod+Click, the source-mode convention), and the token MUST advertise
the gesture (hover affordance). **Deferred with scope — live-preview
reading mode:** prototype testing confirmed a standing tension
between source editing and link/media presentation that modifier
conventions only paper over. The accepted direction is an
Obsidian-style live-preview mode layered over the same CodeMirror
source buffer: rendered Markdown as inline decorations, wiki-link
tokens presented as plainly clickable links, and (with §4.2's embed
records) inline images. It is a presentation layer only — Markdown
source stays canonical, the §7.1 link-record model and §10.2 save
semantics are unchanged, and source mode remains available. Editor
work of roughly epic scale; do not resolve the tension piecemeal
before it.

## 7.4 Uses list and location chooser

Every note surfaces its uses inside its own panel (rev 0.17): the
panel header always shows a places count ("⌖ n places"), and
activating it unfolds the Uses list in-panel, with a marker on the
placement currently being read. One panel owns everything about a
note: words, tags (its node's, §8.5), and places.

The Uses list and the link-activation chooser use the same location
query, grouping model, and row grammar — the same rows as the §4.8
tag panel (thumbnail · location · open-note and fly-to actions):

1. Group by containing canvas.

2. Within each canvas, group by node.

3. Show the number of placements for each node.

4. Show node appearance or thumbnail.

5. Show node tags when present.

6. Include an Unplaced group, last, for nodes with no placements,
each offering Place on Current Canvas per section 6.10.

Selecting a canvas group may open that canvas with all matching
placements highlighted. Selecting a node group may highlight all
placements of that node. Selecting an individual placement may center
it. A fly-to landing on another canvas is a navigation event and
enters §8.1 history.

## 7.5 Highlighted-placement visualization

When several relevant placements exist on one canvas, the application
SHOULD support a visual resolution mode:

- Open the target canvas.

- Dim or de-emphasize unrelated content without hiding it.

- Draw a clear outline, halo, pulse, or other selection treatment around
  matching placements.

- Fit the camera to all matches when practical.

- Allow the user to select one visually or simply continue working.

- Exit the mode through Escape, clicking neutral canvas space, or
  choosing a match.

This is a helpful navigation feature, not a requirement that every
repeated placement be individually distinguishable in a textual picker.

The §4.8 tag lens is the same dim-to-hits mechanism aimed at tag
results; the two surfaces SHOULD share one implementation and one
visual treatment.

## 7.6 Exact identity links

Phase 1 wiki links address notes. Exact node links and exact placement
deep links are deferred. The storage model should leave room for them
later without overloading ordinary [[Title]] syntax.

## 7.7 Title collisions

A blocked note creation or rename returns a structured
NOTE_TITLE_CONFLICT result containing the existing note ID, requested
title, normalized title_key, and whether the conflicting note is active
or trashed.

The UI MUST retain the user's draft rather than redirecting
automatically. Creation flows SHOULD offer Use Existing Note or Choose
Different Title; rename flows SHOULD offer Open Conflicting Note; a
conflict with a trashed note SHOULD offer Restore Existing Note.

Create Another Using This Note MAY be offered when a user attempts to
create a node and note with an existing title. Make Note Independent
preserves the copied body while requesting another unique title.

# 8. Navigation and provisional workspace direction

## 8.1 Canvas navigation

Opening a node's canvas replaces the active canvas view. Descendant
canvases are not rendered live inside the parent. Home opens the
current project's protected root canvas.

Navigation records one project-scoped session history per window
rather than structural ancestry. The history SHOULD retain per entry:

- The route used to enter a canvas.

- Previous viewport state when returning.

- The originating placement when practical.

- The view kind and target identity when the entry is a graph, query,
  search result, or other projection.

No canonical parent is assumed. A new navigation after Back clears the
Forward stack. Changing projects changes the applicable history rather
than sharing one global stack. Cross-canvas jumps from any surface — a
pinned panel's origin label, a Uses row, a tag-panel row — are
navigation events and enter this history.

Bookmarks are durable project-scoped records. A bookmark MAY target a
canvas plus viewport and selection context, or another workspace
projection.

**Navigation chrome (rev 0.17).** The path, upper-left beside the
window controls, renders the entry route — the back stack — as a
breadcrumb: visually a file path, semantically history. It never
renders structural ancestry, which does not exist (§4.4: containment
is a graph with legal cycles). Clicking a crumb returns to that canvas
with its viewport restored. Back and Forward are primarily gestures —
trackpad swipe, mouse buttons 4/5, Mod+[ and Mod+] — with
hover-revealed ‹ › affordances beside the path for mouse users; there
are no permanent buttons. Home is a dedicated ⌂ button at the path's
head.

Bookmarks surface through one control at the path's tail (drawn as a
small map pin with a generous hit target) opening one menu that does
everything: click a row to jump, drag rows to reorder, ✕ to remove,
and a bottom row to bookmark the current board. Row order IS the
Mod+1–n shortcut binding, and each row prints its current shortcut,
so the bindings are self-teaching. A bookmark whose target is trashed
greys out with an In Trash label per the degradation rules below — it
never silently vanishes from the menu. A hold-Mod switcher HUD
(thumbnail flash of bookmarked boards) is deferred as a complement
once the shortcuts are learned, not a replacement for the menu.

Stale navigation targets degrade explicitly, never silently. Back and
Forward skip and collapse history entries whose target is trashed or
purged. Bookmarks are never deleted automatically: a bookmark whose
target is trashed presents an In Trash state with a Restore action
instead of opening, and a bookmark whose target was purged presents a
broken state and offers removal. Because bookmarks address stable IDs,
restoring a target revalidates its bookmarks without further action.
Saved viewport or selection context referencing records that no longer
exist degrades gracefully: the target opens and the missing context is
ignored.

## 8.2 Shell and workspace model

The shell model was decided in the owner's design-consult wireframe
cycle (July 2026). The canonical design artifact set lives beside
this RFC as **RAG/Design-Artifacts-v1.0.zip** (versioned from 1.0,
replaced in place as design evolves); its Design Spec document is
the visual authority, and where wireframe turns and the spec
disagree, the spec wins. It supersedes the earlier
tabbed-workspace direction and the Baseline UI Vision v0.1 sidebar:
there are no workspace tabs, no docked sidebar, and no persistent
status strip. Its stance: **the window is the board.** Chrome is
minimal, floating, and never causes canvas reflow; the app's
aesthetic job is neutrality. PureRef anchors the chrome weight,
Obsidian the data model's visibility. Nothing has invisible state:
every grouping, link, mode, or ongoing condition is visible on some
surface.

**Two scopes, two physics.** Node-local content floats as panels
above the canvas (notes, choosers, tag chips); project-global views —
graph, gallery, outline, settings — take over the window. Esc or the
originating control returns from a takeover, and the canvas camera is
untouched by it. Panels open anchored to the control that summoned
them — one physics rule everywhere.

**Shell layout.**

- Window controls upper-left, with the §8.1 path beside them.

- A vertical mode charm rail, upper-right: project ⧉ · search ⌕ ·
  graph ⊛ · gallery ⊞ · outline ▤ · menu ☰. Icon-only, generous hit
  targets. The §8.6 ongoing-condition charm appends below when
  present.

- One floating dock, bottom-center: tool modes (select · text ·
  shape with press-and-hold flyout · draw · line · arrow ·
  connector · pin ◉, §6.2) · divider · zoom out · percentage ·
  zoom in · fit.
  Render-order send-forward and send-backward join the dock only
  while a selection exists.

- A hover-revealed title strip at the top edge carries file and view
  functions (and system menus on Windows and Linux); it is hidden
  otherwise.

- Errors surface as transient toasts; ongoing conditions use the
  §8.6 perch. Nothing docks and nothing reflows the canvas.

**Engagement cadence.** While the cursor is in the window, chrome is
visible: dock, rail, and node charms at partial opacity — a
glanceable census requiring no hovering. When the cursor leaves the
window or rests beyond an idle delay, the entire chrome layer fades
together on one shared clock and the board becomes wallpaper; any
element fading independently is a bug. Hovering a control lights that
control alone to full opacity. Charm visibility keys on the node's
rendered screen size, never on zoom percentage. All cadence numbers
are provisional feel constants, not model state.

**Tooltip rule.** Every hoverable control shows a tooltip naming the
control and printing its keyboard shortcut, in one chip style
app-wide, after a short delay. No control ships without one: the GUI
is the tutorial for the keyboard-driven app.

macOS is the lead platform. Windows and Linux gain a ☰ menu entry
point and diverge nowhere else. Side-by-side comparison of two boards
is deferred (expected shape: a second window per project), recorded
in section 19 so it does not vanish silently.

Relationship and data views remain separate renderers from the art
canvas while querying the same domain model. Architecture MUST still
scope every view, command, query, subscription, and navigation record
to one Project ID.

## 8.3 Search and quick-open

Full-text search covers note titles and bodies, tag names, asset
original filenames, and canvas text decorations. Search lives in the
⌕ charm's panel; results group by kind: a note result opens the note
panel, a tag result opens the tag panel (§4.8), a filename match
surfaces the nodes using that asset, and a canvas-text match opens the
containing canvas centered on the matching decoration. Trashed records
are excluded by default. Typing a leading # switches the field to tag
mode with tag-name completion.

A keyboard-summoned quick-open MUST navigate by title across notes and
canvas-owning nodes; the ⌕ panel is its realization. Selecting a note
opens the note panel; selecting a canvas opens it as the active
canvas. Quick-open matches by title_key and does not include phantom
titles, which remain reachable through links and wiki-link
suggestions.

## 8.4 Node charms and click grammar

Content-hint charms are the census of what a node holds, replacing
any hover-to-discover scheme. Two glyphs only: **page** (has a note)
and **frame** (has a canvas). A node shows at most one of each,
side-by-side and never stacked, inset inside one image corner
(lower-right default). Charms carry a subtle scrim chip so they read
over busy art. Charms are UI, not pixels: they never appear in crop
or flip previews or in any export, and they follow the §8.2
engagement cadence and screen-size visibility rule. A bare node at
rest shows no charm; ghost charms appear only inside creation flows.
The title strip below the image belongs to the §4.5 label and never
collides with charms.

The click grammar (resolving open question 3):

| **Target** | **Gesture** | **Result** |
|----|----|----|
| image | single click | select and show the charm bar |
| page charm | single click | the note opens tethered beside the node; the canvas does not change |
| frame charm | single click | dive into the nested canvas; its note stays shut |
| image | double click | everything: dive into the canvas and open its note. A note-only node opens the note; a canvas-only node dives |

Charms are the exploded view of what double-click does; there is
nothing to memorize.

**Selection and the charm bar.** Selection renders as a thin accent
outline only — no drawn handles, ever (§6.9 cursor zones carry the
transform affordances). The charm bar floats beneath the selected
node: crop · flip H · flip V · divider · make-canvas · note · tags
`#` · lock, reusing the same page/frame glyphs as the hint charms.
`#` pops the node's tag chips; clicking a chip opens the tag panel
(§4.8).

## 8.5 Note panels

Wherever this document says "note pane," the logical note surface is
meant; the shell realizes it as floating panels. A note opens as a
**tethered** panel beside its node, marked by a dashed tail to the
node. The panel tracks its node as the camera moves; panel chrome
and text render at screen scale (the tail stretches, the type does
not). One tethered panel exists at a time — opening another note
replaces it. A **pin** action converts the tethered panel to a
screen-fixed panel that survives panning and navigation; pinned
panels accumulate, and nothing ever auto-unpins them — unpinning is
the user's act alone.

**The indicator escalates with how broken the spatial link is:**

- Tethered, node on-screen: nothing — the tail is the attribution.

- Pinned, node on-screen: the source node wears an accent halo,
  visually distinct from selection.

- Pinned, node off-screen on the same canvas: a small edge chip
  points toward the node; clicking it flies home.

- Pinned, node on another canvas: the panel header grows an origin
  label naming that canvas; clicking it flies across boards as a
  navigation event (§8.1).

The canvas is a node, so the active canvas's own note is "the node
you are standing inside": a screen-fixed corner charm (lower-left)
is its page charm — a ghost on approach when no note exists, solid
when one does — and clicking it toggles a panel anchored to that
charm. A phantom panel opened on a note-less node or canvas shows an
empty editor and persists nothing until the first committed edit
(§7.2); the hint charm turns solid at that moment. The panel
surfaces its subject node's tags as chips when it has a node
subject; a zero-node note shows none.

## 8.6 Toasts and the ongoing-state perch

Transient failures and state *transitions* surface as toasts (enter
and resolve). An **ongoing** condition — the project service
restarting, an integrity error, anything that holds over time — MUST
keep a visible perch for as long as it holds: a warning charm
appended to the mode rail, appearing only while a condition exists,
pulsing once on arrival, and opening a detail panel anchored to
itself. Multiple conditions stack as one charm with a count. When no
condition holds, no slot exists and no space is reserved. This is
the same existence rule as the §8.5 indicators: the surface lives
exactly as long as the broken state does. The §11.4 no-silent-hang
requirement surfaces here; a transient toast alone never satisfies
it. The interim status strip retires only when this perch ships.

## 8.7 Ghost overlay mode (deferred with scope)

The PureRef-completing feature (rev 0.21): a per-window mode for
drawing UNDER the reference. The window turns frameless and
transparent at a chosen opacity, floats always-on-top, and passes
all pointer input through to whatever application lies beneath —
an artist's pen drives their painting app straight through the
board. Electron's `setIgnoreMouseEvents(ignore, {forward: true})`
is the accepted mechanism: input passes through while mouse-move
still reaches the app, so one small floating grab handle can stay
hot for repositioning.

Because a click-through window cannot be clicked back out of,
entry is gated by one hard confirmation naming the exit: "only
the keybind leaves this mode — sure?" (the exact binding is a feel
choice; it also appears in the mode's tooltip and the confirmation
text). Closing the window always resets the state — a project
never reopens in ghost mode. macOS is the lead platform and the
mechanism is native there and on Windows; Linux behavior is
compositor-dependent and MAY degrade to opacity-without-
click-through. Fullscreen-space interaction on macOS needs the
elevated window level. Ghost mode is presentation state only:
no domain records change, and the mode never enters the command
log.

# 9. Deletion, trash, and resource retention

## 9.1 Lifecycle and Trash

Trash is not a node, canvas, or domain container. It is a recoverable
lifecycle state and a query view over records in that state.

Phase 1 records that support recoverable deletion use lifecycle_state
active or trashed together with trashed_at and trashed_by_command_id.
Moving a record to Trash preserves its stable identity and recoverable
relationships until permanent purge.

Ordinary queries exclude trashed records by default. Hidden remains a
distinct presentation concern, such as hiding a placement or decoration
or excluding content from one graph view; it MUST NOT be used as a
deletion synonym.

The Trash view MUST expose its retention setting clearly. Automatic
permanent deletion defaults to Never; later options MAY include 30, 60,
or 90 days.

## 9.2 Delete Placement

Removes one spatial placement. The node, note reference, canvas, tags,
and appearance remain. Placement removal is normally recovered through
command undo and does not create a separate user-visible Trash entry.

A **bare node** is a node with no note reference, no tag assignments,
no owned canvas, and no other placements. Deleting the last placement
of a bare node moves the node to Trash within the same user-level
command, because a bare unplaced node is otherwise invisible and reads
as either deleted or lost. The application SHOULD show a non-blocking
notice with a Keep in Project action that restores the node without a
placement, leaving it findable in the node library. Placement deletion
never purges a node.

Deleting the last placement of a node with a note, tags, or an owned
canvas leaves the node active; the notice SHOULD indicate that it
remains available in the node library's Unplaced view.

## 9.3 Detach Note from This Node

Removes only the node-to-note relationship. The note remains available,
even if no nodes reference it.

This SHOULD be presented as a lightweight, undoable operation.

## 9.4 Delete Note Everywhere

Deleting a note is a distinct destructive action. Before confirmation,
the UI SHOULD report:

- All nodes referencing the note.

- Incoming wiki-link count.

- Outgoing wiki-link count.

- Whether the note has no nodes and exists only as text.

The action moves the note to Trash rather than immediately destroying
it. Existing node attachments and wiki-link target IDs remain intact so
restoration is lossless; surfaces that encounter the note show a clear
In Trash state and Restore action.

## 9.5 Delete Canvas

Moves the canvas and its owned canvas-local aggregate to Trash:

- The canvas record and view state.

- Placements within it.

- Decorative content.

- Background, camera, grouping, ordering, lock, visibility, and region
  state.

Referenced nodes and notes remain active by default. The root canvas
cannot be moved to Trash or deleted.

The confirmation SHOULD report:

- Placement count.

- Decoration count.

- Number of referenced nodes.

- Number of nodes that will become unplaced, and how many of those are
  bare.

An unchecked option MAY offer to move newly unplaced nodes to Trash. It
must not silently delete them. Because the canvas aggregate preserves
its placements recoverably, trashing a canvas is not last-placement
deletion and does not itself auto-trash bare nodes.

## 9.6 Delete Node

Moving a node to Trash preserves as one recoverable aggregate:

- Its placements on every canvas, which are excluded from ordinary
  rendering while the node is trashed.

- Its owned canvas and canvas-local content.

- Its appearance association and managed Asset references.

- Its tags.

- Its note reference.

The attached note remains active, whether shared or referenced only by
the trashed node, unless the user explicitly chooses to trash it
separately. Restoring the node restores its placements, canvas, tags,
appearance, and note attachment together.

## 9.7 Restore and purge

Restore returns the trashed record and its preserved aggregate to active
participation. Because trashed notes retain their title_key reservation,
restoring a note does not require conflict resolution.

Delete Permanently is represented internally as Purge. Purge removes the
recoverable record, invalidates undo entries whose inverse depends on
it, and makes newly unreferenced resources eligible for garbage
collection.

Empty Trash purges all eligible trashed records after an impact summary.
Automatic retention, when enabled, applies the same purge rules to
records older than the configured duration.

## 9.8 Garbage collection

Assets, immutable blobs, notes, and other resources referenced by active
or trashed records are not garbage-collection eligible. Permanent
cleanup applies only to truly unreferenced resources outside recoverable
Trash, valid undo history, active import or derivative jobs, and export
leases.

Original blobs are collected through an explicit mark-and-sweep pass
rather than trusting reference counts alone. Thumbnail, map-tile,
search-index, and cache derivatives are regenerable and MAY be evicted
independently when not actively in use.

Temporary imports and orphaned files left by interruption are reconciled
during project recovery using age, transaction, and database-reference
checks.

# 10. Commands and undo

## 10.1 Command envelope

All durable operations pass through serializable domain commands. Every
command envelope MUST include command_id, project_id, command_type,
command_version, expected_project_revision when applicable, issued_at,
and a typed payload.

Project schema version, command version, application or protocol
version, and project_revision are separate concepts. A command-type
upcaster MAY translate an older payload version without making the
database event-sourced.

Representative commands include:

- CreateProject.

- CreateNote.

- UpdateNote.

- CreateNode.

- AttachNoteToNode.

- DetachNoteFromNode.

- MakeNoteIndependent.

- CreateCanvas.

- CreatePlacement.

- MovePlacement.

- SetNodeAppearance.

- CreateTag and AssignTagToNode.

- SetCanvasBackground and SetCanvasBackgroundColor.

- SetPlacementLabelVisibility and FlipPlacement.

- AlignSelection and DistributeSelection.

- CreateDecoration and UpdateDecoration.

- GroupDecorations and UngroupDecorations.

- DeletePlacement.

- DeleteDecoration.

- TrashNode.

- TrashNote.

- TrashCanvas.

- RestoreRecord.

- PurgeRecord.

## 10.2 Transactions, gestures, and undo

One user gesture may produce several internal writes but MUST be
represented as one user-level transaction when experienced as one
action. Drag, resize, rotate, freehand, and similar pointer interactions
MAY update ephemeral renderer state continuously but commit one durable
command when the gesture completes.

Continuous text entry follows the same principle. The note editor
buffer is ephemeral state, and an editing burst commits one UpdateNote
command when it completes: on an idle debounce, on editor blur or
panel switch or close, on application quit, and as a forced flush before any
command that reads or rewrites the note's body, including rename
rewrites, trash, export, and link operations. There is no explicit
save action. Each committed UpdateNote advances project_revision once
and refreshes the note's link records and search index; saving a note,
wherever this document says it, means committing an UpdateNote.

Before a command rewrites note bodies, pending editor buffers for the
affected notes MUST be flushed. The rewritten text arrives in open
editors as an external change folded into the editor's local undo
history rather than replacing the document wholesale.

Structural undo emits an inverse command through the same command path.
It does not pop arbitrary database state or treat the relational store
as a disposable event-sourced projection.

The structural undo stack is scoped to one open project session and is
shared across all of that session's views; there is no per-view undo
over shared project state. The stack is held in memory and does not
survive application restart. Recoverable history across sessions is
Trash's responsibility, and project time travel remains future work.
Committing any new durable command clears the redo stack.

Committed commands persist a lightweight metadata log recording
command ID, type, version, issued_at, and resulting project_revision.
The log supports provenance references such as trashed_by_command_id
and diagnostics; it is not a replayable event source, and pruning it
never affects domain records.

When the effect of an undo or redo lies on a canvas other than the
active one, the workspace navigates to that canvas and centers and
highlights the affected content, entering navigation history like any
other navigation. A setting MAY offer applying such undos in place
with a non-blocking notice instead.

Note-body edits do not enter the structural undo stack. Inside a
focused editor, undo is CodeMirror's fine-grained local history, which
MAY travel back through commits made during the same editing session.
Structural undo covers all other commands; renaming a note remains a
structural, undoable command. Structural undo can therefore never
silently revert prose typed elsewhere. Project time travel is a
separate future feature.

A successfully committed command increments project_revision. Commands
with an incompatible expected_project_revision return a structured
conflict rather than overwriting newer state silently.

# 11. Persistence and asset storage

## 11.1 Local authoritative store

Phase 1 uses SQLite as the authoritative project store.

The implementation SHOULD use:

- Foreign-key constraints.

- Explicit schema migrations.

- FTS5 indexes covering note titles and bodies, tag names, asset
  original filenames, and canvas text decorations.

- WAL mode.

- Transactions around domain commands.

- Soft deletion and Trash.

- RFC 9562 UUIDv7 IDs.

The renderer and Svelte components MUST NOT execute arbitrary SQL.

A project directory MUST have at most one authoritative writer service
at a time. Opening the same project from another window or process
requires a project lock or read-only fallback rather than independent
SQLite writers.

## 11.2 Managed project files

Imported originals are copied into project-managed storage. A conceptual
project layout is:

```
project/
├── project.sqlite
├── assets/
│   └── content-addressed originals
├── derivatives/
│   ├── thumbnails
│   └── map tiles
└── cache/
```

Original files are canonical user assets. Thumbnails, search indexes,
and map tiles are regenerable derivatives.

Import is staged: copy to temporary storage, validate and sniff type,
hash, extract metadata, atomically move immutable bytes into
content-addressed storage, commit Asset references, then enqueue
derivatives. Startup recovery reconciles interrupted imports, orphaned
blobs, and missing derivatives.

## 11.3 Project API

The desktop UI communicates through a narrow Project API supporting:

- Execute command.

- Run typed query.

- Subscribe to project events.

- Import asset.

- Request derivatives.

This boundary is the future seam between a local project service and an
authoritative remote server.

## 11.4 Project locking and recovery

The project service owns SQLite, managed files, project locking,
migrations, and recovery. The renderer never acquires a project write
lock directly.

On unclean startup, recovery SHOULD verify migrations, foreign keys,
pending import records, temporary files, and blob references before
exposing the project for editing. Missing regenerable derivatives are
rebuilt lazily; missing canonical originals produce a visible integrity
error.

**The end-session surface (rev 0.23, deferred with scope).** An
"End session" row on the ☰ menu is the deliberate put-it-away
ritual: flush every open editor buffer (§10.2), regenerate the
Obsidian vault mirror when enabled (§16), record a session
snapshot when enabled (below), close the project, and release the
single-writer lock — THEN the directory is safe for a cloud sync
to take. This boundary exists because syncing a live SQLite
database is dangerous (WAL files and file-coordination services do
not mix mid-write): a project directory living in iCloud Drive or
similar is survivable exactly when writes stop at a clean moment.
Quit performs the same sequence (the §10.2 quit flush already does
half of it); the button is the same ritual without leaving the
app.

**Session snapshots (rev 0.24, deferred with scope).** The
end-session boundary is a natural commit point, so git becomes a
supported history backend. Project directories ship git-ready
regardless of the setting: the lock and heartbeat files and
SQLite's WAL/journal are gitignored, and end-session checkpoints
and truncates the WAL so `project.db` is a single clean artifact.
A per-project setting — session snapshots: off · git commit ·
commit + push — adds the snapshot step to the ritual: first use
initializes a repository, each end-session commits with a
generated message, and the push variant targets whatever remote
the user configured. The snapshot includes the regenerated vault
mirror when that is enabled, so history carries human-readable
note diffs (and the JSON Canvas boards) beside the binary
database. History browsing and restore stay external in Phase 1 —
the escape hatch is that the project is an ordinary git
repository. iCloud remains a LOCATION choice, not a mechanism:
"keep the folder in iCloud Drive" is already safe under the same
end-session discipline. Assets are content-addressed and
immutable, so git stores each image once and never rewrites it;
git-lfs is a user choice outside app scope.

The single-writer lock records holder pid and hostname with a
heartbeat. A lock whose recorded holder is on the same host and whose
pid provably no longer exists is reclaimable immediately, without
waiting out the heartbeat staleness window (rev 0.16); pid reuse errs
toward waiting. A dead project service MUST surface as a visible
error, never a silent hang: pending calls fail structurally and the
application attempts one automatic service restart.

## 11.5 Settings

Settings are two-tier, and a setting's tier follows its blast radius:
anything affecting the durability or meaning of project data is
project-scoped. Project settings persist inside the project database,
travel with export and import, and include Trash retention.
Application settings persist in the application configuration
directory outside any project and include theme, window and layout
preferences, the cross-canvas undo behavior toggle, and future adapter
configuration such as a media-backup endpoint.

**The settings surface (rev 0.17).** Settings open as a takeover view
like graph and outline (§8.2), entered from the ☰ charm — but the sheet
is partially transparent and inset, so the real board stays visible
at the edges and through it, and appearance changes apply live to the
world behind the sheet. There are no apply or save buttons: settings
commit on click, and Esc closes. The surface is deliberately
exhaustible in one glance; opinions ship as defaults, not options,
and cadence thresholds, zoom fades, and panel physics are expressly
NOT settings. The Phase 1 inventory:

- **Appearance:** theme (dark default · light · glass) · grid (none ·
  lines · dots) · flat canvas color (small swatch set · off) ·
  window opacity.

- **Behavior:** charm corner (lower-right default · upper-right) ·
  chrome fade delay (slider · never) · snap to grid (when grid
  snapping ships, §6.9) · keep an Obsidian vault beside the
  project (per-project, rev 0.23) · session snapshots (off · git
  commit · commit + push; per-project, rev 0.24, §11.4) · mirror
  drops to library (per-project, set by the first-drop ask, §14.4).

- **Window:** title strip (hover-reveal · always · never) · border ·
  rounded corners.

- **Windows/Linux only:** ☰ menu in the charm rail or the system
  bar.

**Theming.** Three themes: dark (default), light, and glass — a
translucent window whose chrome blurs what lies behind it. Glass is
macOS-only and falls back to dark elsewhere. All chrome must read on
every theme and over arbitrary art, using scrim chips rather than
hard plates. Theme tokens are wired as CSS custom properties so a
theme engine remains possible, but no theme engine is built.

# 12. Rendering and performance

## 12.1 Initial engineering targets

The prototype SHOULD be measured against at least:

- 500 lightweight pin placements on one canvas.

- 150 simultaneously visible image placements without interaction
  collapse.

- 1,000 lightweight icons or dots in stress tests.

- Large original images represented by resolution-appropriate
  derivatives.

- Oversized maps substantially larger than GPU maximum texture
  dimensions.

- Fast return navigation between recently visited canvases.

- Several hundred simple text, shape, line, connector, and freehand
  decorations without interaction collapse.

These are engineering targets, not product guarantees.

## 12.2 Renderer requirements

The canvas implementation SHOULD support:

- Viewport culling.

- Lazy texture loading.

- Texture eviction or memory budgeting.

- Resolution-appropriate thumbnails.

- A single live active canvas per workspace view.

- Tiled or pyramidal rendering for oversized backgrounds.

- DOM overlays for text entry and complex controls where appropriate.

- A dedicated background plane and one deterministic shared render order
  for normal placements and decorations.

- Placement-anchored connector updates without treating connectors as
  semantic edges.

- Placement labels rendered with their placements in the normal
  content plane.

- Incremental synchronization for grouping, lock, visibility, and order
  changes.

The rendered display tree is a projection of domain state, not the
authoritative project model.

## 12.3 Canvas spike

**Resolved (rev 0.6):** the spike was executed as AI-EPIC-001 and
decided for **PixiJS 8**. On GPU-accelerated Chromium, PixiJS held the
vsync floor with p95 ≤ 9.3 ms across every scenario below, while
Konva's hit-graph and Canvas2D ceiling showed frame drops at the
2,000-node pin scenario, and Konva's expected editor-interaction
savings did not materialize against this document's transform
semantics. Full evidence, caveats (software-GL machines), and Konva
revival conditions: RAG/spike-reports/renderer-comparison.md. The
scenario list below is retained as the workload definition it proved.

The spike covered:

- A 20,000 by 12,000 tiled map.

- 300 image placements.

- 1,000 lightweight pin placements.

- Marquee selection.

- Multi-object drag.

- Snapping and smart guides during multi-object drag.

- Resize and rotate.

- Pan and zoom.

- Highlighting several matching placements.

- Placement labels at varying zoom levels.

- Canvas swap and return.

- Memory release after leaving the canvas.

- Background set, replace, edit, reset, and remove operations.

- Canvas text, basic shapes, freehand paths, lines, arrows, connectors,
  grouping, locking, visibility, and shared ordering.

- One durable command per completed pointer gesture.

The decision weighed implementation effort as well as frame time and
memory, per the original rule: PixiJS if its control and rendering
headroom justify the additional editor-interaction work; Konva if it
met the real workload and materially reduced implementation risk. The
spike showed the headroom is real and the risk reduction is not.

Carry-forwards for the canvas engine: preload or asynchronously
upload textures on canvas swap; use BitmapText or level-of-detail for
dense pin labels; keep texture ownership explicit and outside global
texture caches; document a minimum requirement of hardware-accelerated
graphics, with no Canvas2D fallback renderer planned.

# 13. Desktop technology direction

The following choices are accepted:

| **Layer** | **Direction** | **Notes** |
|----|----|----|
| Desktop shell | Electron | Ships a consistent Chromium runtime and supports a future TypeScript server ecosystem. |
| Language | TypeScript | Shared domain, command, persistence-contract, and future protocol definitions. |
| Application UI | Svelte 5 | Owns floating panels, takeover views, dialogs, inspectors, note shell, and search. |
| Canvas renderer | PixiJS 8 (decided by renderer spike AI-EPIC-001) | Renderer remains framework-independent behind a Canvas Controller. |
| Note editor | CodeMirror 6 | Markdown source with wiki-link parsing and future collaborative bindings. |
| Persistence | SQLite | No PostgreSQL or Docker dependency in Phase 1. |
| Assets | Managed project files | Copy originals into project storage; keep derivatives separate. |
| Heavy local work | Electron utility process | SQLite, indexing, thumbnailing, tiling, import, and export stay off the UI thread. |
| Packaging | Electron packaging toolchain | Exact packaging choice may be revisited before public distribution. |

## 13.1 Framework boundary

Svelte does not render hundreds of canvas objects as components. It
hosts the canvas and application chrome.

A Canvas Controller owns:

- Camera state.

- Selection.

- Interaction state machine.

- Hit-testing policy.

- Highlight mode.

- Incremental synchronization to PixiJS.

- Shared placement and decoration render ordering.

- Ephemeral gesture state and durable command coalescing.

## 13.2 Process layout

```
Electron main process
├── window and application lifecycle
├── menus and native integration
└── narrow IPC routing

Renderer process
├── Svelte 5 application UI
├── CodeMirror note editor
└── canvas renderer

Project utility process
├── SQLite and migrations
├── search indexing
├── asset import
├── thumbnail generation
├── tiled-map generation
└── export and import
```

The renderer remains sandboxed and receives only the narrow capabilities
exposed through the preload boundary.

## 13.3 Repository direction

```
apps/
├── desktop/
└── server/        # Phase 2

packages/
├── domain/
├── commands/
├── persistence/
├── canvas-engine/
├── protocol/
└── shared-ui/
```

The exact package boundaries may evolve during the vertical slice, but
domain commands and persistence contracts should remain independent of
Svelte and the canvas renderer.

# 14. Graph and data views

## 14.1 The outline view and the node library requirement

Phase 1 MUST provide a node library: a view covering every active
node in the project — appearance or thumbnail, attached note title
when present, tags, placement count including zero, and canvas
locations — with filtering to unplaced nodes. The library is the
durable home for stashed and unplaced material: keeping an unplaced
node in the project is a legitimate workflow, not an error state.

The **outline view** (the ▤ takeover, rev 0.17; "tree" in early
wireframes) realizes this
requirement: the world as an outline, canvas ▸ children, using the
same page/frame glyphs as the §8.4 charms, with bare images shown as
their own row kind. Because containment is a graph with legal
cycles, a canvas already rendered on the current expansion path
renders as an alias row that flies to the real entry rather than
unfolding again. Unplaced material gathers in a root-level loose
bin. Tags show inline as chips, and the outline shares the graph's
filter chips and honors the §4.8 lens. No separate flat list view
ships; multi-facet sorting, richer data views, and note browsing
remain future iterations.

**Disconnection vocabulary (rev 0.17).** Two independent axes define
the cleanup filters everywhere they appear: an **orphan** is a node
with no note — it cannot carry wiki-link edges and stays permanently
disconnected in the graph unless a note is attached. **Loose** is a
note or node with no placement — a location fact, not a connection
fact; a loose note may be richly linked. The "disconnected" cleanup
filter is the union. Badges stay separate: orphan means no words,
loose means no place.

## 14.2 Relationship graph

The relationship graph is a separate projection from the art canvas
and SHOULD ship as the ⊛ takeover view (rev 0.17): a force layout
with physics the user can grab. **Wiki links are the only edges** —
structure lives in the outline, and drawn lines, arrows, and connectors
are decorations that never appear as semantic edges; a future
explicit relationship feature may promote semantic edges through a
separate operation.

Pure notes render as dots. A note whose node has placed art renders
as the art itself past a screen-size threshold (image-node LOD).
Orphans wear a dashed ring and badge per §14.1's vocabulary.
Filters: hide content-less · orphans only · one tag. Activating a
graph node flies to its placement, or opens its note panel when
unplaced. Trash and decoration edges are excluded by default.

The graph renderer need not reuse the art-canvas renderer. Both query
the same project model.

## 14.3 Canvas contents outline (deferred with scope)

Deferred to the navigation iteration. A contents panel for the active
canvas lists its placements, decorations, and sub-canvas placements —
name or kind plus thumbnail where available — in render order, with
presentation groups shown as nesting. Selecting an entry selects and
reveals the object on the board, giving occluded or off-screen content
a guaranteed recovery path. Sub-canvas entries MAY expand in place to
show their own contents; because canvas containment is a graph and
cycles are legal, a canvas already open on the current expansion path
renders as a navigation link rather than expanding again. The outline
is a read projection over existing scene queries plus the render-order
operations of section 6.8 and introduces no new domain records. It is
the recursive containment structure made visible — the app's thesis
that arranging images quietly builds data.

## 14.4 Library projects and cross-project sourcing (deferred with scope)

Accepted direction, rev 0.18; deferred until after the global views
ship. This section is self-contained on purpose.

The app owns the reference-library surface (the Allusion/Eagle use
case: a browsable, taggable, locally persisted file collection)
without adding a library concept to the domain:

- **Library entries are unplaced nodes.** Bulk import runs each file
  through the staged pipeline (§11.2) and creates one node per file
  with an image appearance and no placement — the stashed-material
  workflow §14.1 already blesses. Node tags carry the curation
  facts. No new record kinds exist; this is the standing guardrail:
  the day a library feature needs a record kind that exists only
  for the library, stop and re-derive.

- **A library is internally a project.** The application MAY create
  or designate a library project and present it distinctly, but the
  distinction is packaging, not schema.

- **The gallery** (⊞) is the file-browser projection, and a view
  any project can open — "library" is the project kind, "gallery"
  is the view. A thumbnail grid over the project's nodes with sort
  facets (date, name, size), a **kind facet** (image · note ·
  board, rev 0.22), a flat tag filter with counts (orderable by
  name or by count), and the two cleanup filters the model already
  owns (untagged · unplaced). Bulk selection summons a floating
  action bar (tag · place · trash). Large drops run as an
  interruptible progress strip with a live hash-dedupe count,
  never a modal. The gallery has its own rail charm and also
  participates in the takeover mode switcher — graph ⊛ · outline ▤
  · gallery ⊞ are projections of one database, and the user hops
  freely among them inside the takeover. Query machinery is shared
  with the outline (§14.1) and tag panel (§4.8).

- **Grouped time, not infinite scroll (rev 0.22, from the first
  tester's Tumblr-archive habit).** Date sort renders the grid in
  BUCKETED sections with headers, because a date-sorted infinite
  grid is still infinite scroll — the sort is invisible from the
  middle of it. Buckets are relative near the top (today · this
  week · this month · earlier this year) and degrade to calendar
  months, then years, as material ages. The current section header
  doubles as the jump control: it names where you are, and
  clicking it opens the period list for random access into deep
  time — one control, two jobs, anchored to itself like all
  chrome. Grouping is view state over indexed timestamps; no
  schema is involved.

- **The keyboard model (rev 0.25, resolving question 26).** The
  grid keeps a cursor — a focus ring distinct from the selection
  highlight. Plain arrows move the cursor and collapse selection to
  it: Left/Right walk document order, wrapping across rows and
  bucket boundaries; Up/Down move by visual column, taking the
  nearest column when the next row is short or belongs to the next
  bucket. Shift-extension selects the linear document-order range
  from the anchor — never a visual rectangle, which stops meaning
  anything across bucket gaps — and Shift+click agrees. Mod+click
  and Mod+Space toggle membership without disturbing the anchor;
  Space itself is RESERVED for preview (the Quick Look reflex) even
  before a preview surface exists, because burning it on toggle
  would make that retrofit awkward. Mod+A selects the current
  filter scope: the user selects what they see. Enter is the
  kind-appropriate primary action, as in search (§8.3):
  note-carrying entries open the note panel over the gallery,
  board-kind entries close the takeover and dive, and a note-less
  image opens its panel through the charm grammar's
  create-on-demand (§8.4). Delete trashes the selection — the
  action bar's command. Escape peels, selection first, takeover
  second, exactly as the canvas does. PageUp/PageDown page the
  viewport; Mod+Up/Down jump to the previous/next bucket header
  under date sort — the keyboard twin of the header's period list.

- **Scope is project choice (rev 0.22).** The gallery's primary
  toggle — *this world · everything* — selects WHOSE gallery is
  shown: the current project's, or the library project's. There is
  no global tag store and no cross-project query: the inbox mirror
  already makes the library the converging superset, so
  "everything" simply IS the library's gallery, and the tag facet
  always shows the active scope's vocabulary. The toggle is where
  the world-tags-versus-library-tags distinction gets learned:
  world tags are curation in context, library tags are facts about
  the asset. When the mirror is off for the current world, the
  gallery says so instead of pretending "everything" is complete.

- **Projects source, never reference.** A second project MAY be
  opened read-only as an import source (§11.1 already contemplates
  read-only opening). Every row in the project charm's menu offers
  two actions — switch, and open as source — and a source opens as
  a pinned panel (the compressed gallery: same facets, a mini
  grid) obeying ordinary panel physics. Dragging out of it runs
  the ordinary staged import: bytes copy by content hash into the
  destination's managed storage and provenance is recorded. A
  project never holds references outside itself, which is what
  preserves export self-containment (§16), the single-writer rule
  (§11.1), and the Phase 2 collaboration seam (§15).

- **Tags cross the border by decision.** Ingesting an item asks
  whether to carry its tags (none, all, or pick); carried tags are
  recreated as destination tag records and assignments, merging
  with existing tags by name_key. The control is session-scoped in
  the source panel's header — set once, applied to every pull,
  never a per-drag interrupt. Defaults: all from a library, none
  from a world (curation facts travel; world context does not). An
  OS drop has no source tags and therefore no border moment.

- **Capture flows to the library (the inbox mirror).** Optionally,
  per project, asked once: a drop into a world also performs a
  second ordinary import into the library project — bytes copied,
  an unplaced node created, provenance recorded. This makes "drop
  anything in the app and it is in your library" literally true
  while every project stays hermetic. Content hashes provide
  recognition without reference: when the library already holds the
  dropped bytes, the mirror is skipped and the drop border MAY
  offer the library's tags for the incoming item. The mirror is
  strictly one-way — nothing ever syncs out of the library — and a
  locked or unavailable library never blocks the foreground drop
  (queue or notice instead). Both surfaces ride the drop and never
  block it: the once-per-project ask is a two-button panel anchored
  to the first drop (the import runs either way; the answer stores
  as the "mirror drops to library" settings line), and the
  recognition offer is a transient chip beside the fresh node that
  obeys the engagement fade — ignoring it IS the dismissal gesture;
  it dissolves at the next idle with no dismissal debt. Bulk drops
  collapse to one summary chip.

- **The placement picker is the compressed gallery.** One grammar,
  three compressions: the full gallery is a takeover view; placing
  from a source presents the same rows in an anchored panel; an OS
  drag-in routes through the §4.7 importer dialogue.

- **The Allusion importer** is a versioned adapter per §4.7: walk
  the source library's locations, stage-import each file, create an
  unplaced node per file, and recreate tag assignments, flattening
  the source's tag hierarchy into flat project tags (duplicate leaf
  names disambiguate by rename). Before building it, verify the
  source's application version and whether its tags live in its
  internal database or in file metadata. Deprioritized (rev 0.19):
  with the inbox mirror and a native gallery, the tester's library
  can re-accrete through use, so this adapter is a convenience, not
  a gate.

- **First open teaches by example.** The first time the library
  surface opens, it is pre-seeded with a small public-domain art
  set arranged the intended way — a root board of artists whose
  nodes dive into per-artist boards with placed works, notes, and
  tags — so the user sees what the surface is for before owning
  it. The seed is ordinary records (nodes, placements, notes,
  tags), not a special content class, and the explainer is an
  ordinary pinned note whose one power is the "clear the example"
  action — an ordinary trash command over the example records and
  itself. Unmissable because it is open; not naggy because it is
  just a note; gone forever after clearing. The tutorial is made of
  the app's own furniture, which is itself the lesson.

The gallery depends on the thumbnail derivative pipeline —
renderer-generated over Chromium codecs, service-owned files (rev
0.27, §4.7). Watched directories stay deferred separately. One library surface still
awaits its design turn and is an open question: the OS-drop
importer dialogue as the third compression.

# 15. Future authoritative collaboration seam

Phase 1 remains local-only: no server, sync, account, or protocol
infrastructure, and no CRDTs merely to prepare for Phase 2. The single
permitted networking act is the user-initiated fetch of a dropped
image URL during import.

The architecture MUST preserve a future transition from:

```
Renderer → Project API → local project service → SQLite
```

to:

```
Renderer → Project API → HTTP/WebSocket → authoritative server → SQLite
```

A future shared project may be hosted by:

- A headless process on a VPS.

- A desktop client acting as the authoritative host.

Shared projects are expected to require a live connection. Offline
multi-master merging is outside the current design.

The versioned command envelope, project-scoped subscriptions, expected
project revisions, and monotonic project_revision are the compatibility
seam for this transition.

# 16. Export contract

A project export SHOULD include:

- Manifest, schema version, project ID, root node ID, and export
  version.

- Project database or normalized structured data.

- Markdown or plain-text note exports.

- Original managed assets.

- Note, node, canvas, placement, tag assignment, decoration, group,
  background, lifecycle, bookmark, and link metadata.

Caches, search indexes, thumbnails, and map tiles are regenerable and
need not be canonical export content.

A complete project backup SHOULD preserve Trash unless the user
explicitly requests an active-content-only export. Purged records and
evictable derivatives are not export requirements.

Export reports rather than blocks (rev 0.18): the computed size is
a live footer fact on every export surface, and when it exceeds a
warn threshold the first export adds one acknowledge line —
confirmed once per project, never repeated, never a gate. The
threshold is an application preference. There is no hard size
limiter.

The export surface is a sheet anchored to the ☰ charm rather than a
takeover — leaving is not browsing — with three sections mirroring
the three record kinds below (notes · files · boards).

**The escape-hatch export (rev 0.19, deferred with scope).**
Distinct from the roundtrip backup, this is the data-freedom answer
to "I am leaving; give me my work in a form that is mine," and it is
honest about what survives (everything made) versus what dies
(interactivity):

- Notes export as plain Markdown files named by title, wiki-link
  tokens intact — a folder an Obsidian vault reads natively. An
  optional appended section per note lists the nodes and images
  associated with that note, embedding Obsidian-style `![[...]]`
  links to the exported asset files, so the vault shows each note
  with its art. A canvas cannot be represented in another tool;
  linked images beside the prose is the best portable record.

- Assets export as original files under original filenames with a
  collision policy, plus a sidecar manifest (filename, hash, tags,
  source attribution) in a spreadsheet-readable form. Tag-named
  folder copies are a sub-option, default off — duplicative by
  design.

- Every canvas exports as a full-resolution rendered image: the
  human-readable format of a board is a picture of it. Every
  arrangement ever made stays viewable forever, in anything.

- **The standing vault mirror (rev 0.23, deferred with scope).**
  With the settings line "keep an Obsidian vault beside the
  project" on, ending a session regenerates the escape-hatch
  export in place — the vault stops being a one-time exit and
  becomes a continuously fresh mirror for people who like editing
  prose in a richer text editor. The mirror is one-way on write;
  the return path is a versioned importer over our OWN export
  format (§4.7 adapter rules): on the next open, changed `.md`
  files are detected against the export manifest (hash), and the
  app offers to pull changed note BODIES back in per note — title
  changes route through the §7.7 rename flow, links re-resolve
  through the existing sweep. Anything richer than body-and-title
  (vault-side file creation, canvas edits) is out of scope for the
  mirror; the app remains authoritative. When §11.4 session
  snapshots are on, the freshly regenerated vault is committed
  with the project, so git history holds readable note diffs at
  every session boundary (rev 0.24).

- Every canvas ALSO exports as a **JSON Canvas** `.canvas` file
  (rev 0.21) — the open format Obsidian's Canvas reads natively — so
  boards stay navigable in the vault, not just viewable: placed art
  becomes file nodes pointing at the exported assets with true
  position and size, notes become file nodes pointing at the
  exported Markdown, arrows and connectors become edges with their
  labels, and a nested canvas becomes a file node referencing the
  child `.canvas` — recursion survives the export. The format's
  honest limits: no rotation, crop, flip, or drawn ink — such items
  flatten to pre-rendered images or drop, which is why the rendered
  image above remains the pixel-true record.

Export is paired with import. Phase 1 MUST import a project export,
recreating the project in a new project directory with all record
identities preserved so that wiki links, bookmarks, command
provenance, and Trash survive the roundtrip losslessly; regenerable
derivatives rebuild lazily. Import never merges into an existing
project, and cross-project merge is out of scope. An imported project
MAY coexist with its original because commands, queries, and locks
scope to the project directory.

# 17. Phase 1 vertical slice

The first end-to-end prototype should prove:

1. Create a project atomically with a protected root node and root
canvas, then verify Home returns to it.

2. Set, edit, reset, replace, and remove a managed image background
on the root canvas.

3. Drop several images, paste a screenshot from the clipboard, and
drag an image from a browser including one URL-only drop; verify all
enter managed project storage with source URLs recorded when
available, and that an unsupported file is rejected with a clear
notice and no records.

4. Pan, zoom, select, move, resize, rotate, and reorder placements;
align and distribute a multi-selection; flip a placement; zoom to fit
and to selection; and verify snapping with smart guides during drag,
including the disable modifier.

5. Create a pin with dot, icon, or cropped-image appearance.

6. Create or attach a note and verify the placement now shows its
title as a label, then toggle the label off from the selection
controls.

7. Create a second node sharing that note.

8. Create flat project tags, assign different tags to the two nodes,
rename a tag, and open its tag panel view.

9. Place the same node more than once, including by dragging it from
the node library onto the canvas, and place a zero-node note from the
Uses list and verify the labeled dot appears.

10. Open a node's canvas, persist it immediately, and add nested
content.

11. Create a legal canvas cycle and verify navigation, graph queries,
and export do not recurse indefinitely.

12. Navigate with Back, Forward, Home, the path, and a bookmark
while preserving viewport and origin context; jump to a note and a
canvas through quick-open; and locate a canvas text decoration through
full-text search.

13. Click a wiki link and verify immediate note navigation and
link-table resolution.

14. Type a wiki link to a nonexistent title in two different notes,
verify unresolved rendering, title suggestions, and one aggregated
phantom view; materialize through Create and Place; and verify both
tokens bind project-wide in one command.

15. Rename a linked note while another editor holds uncommitted edits
to a source note, and verify the dirty buffer flushes before the
rewrite, inbound unaliased Markdown tokens and indexed links update
transactionally, unresolved tokens matching the new title bind, and
the rewritten text folds into the open editor's local undo history.

16. Verify zero-, one-, and many-location spatial behavior and the
grouped location chooser.

17. Detach a note from one node without modifying other uses, then
make one node's note independent.

18. Draw canvas text, basic shapes, a freehand path, lines, arrows,
and a placement-anchored connector.

19. Reorder, lock, hide, group, move, ungroup, and undo decorations;
confirm connectors remain visual rather than semantic edges. Undo a
move made on a different canvas and verify the workspace navigates to
and highlights the affected content.

20. Delete a placement; move a canvas, node, and note to Trash; inspect
impact summaries; restore the trashed records; and verify preserved
relationships, including a bookmark to the trashed canvas showing In
Trash, offering Restore, and working again after restoration.

21. Delete the last placement of a bare image node, verify the node
moves to Trash in the same command, use Keep in Project to restore it
unplaced, and locate it through the node library's Unplaced filter.

22. Verify a link to the trashed note presents In Trash affordances,
and that purging it produces a broken link offering explicit recreate.

23. Verify Trash retention defaults to Never and that permanent purge
invalidates dependent undo and enables safe garbage collection.

24. Open the outline and graph takeover views and confirm trashed
records are excluded by default and drawn connectors appear as
edges in neither.

25. Close and reopen the application without data loss, duplicate
project writers, or unreconciled temporary imports, including a note
edit still inside its debounce window at quit.

26. Export the project, import it into a fresh directory, and verify
record identities, links, tags, placements, bookmarks, Trash, and
original assets match the source project.

# 18. Acceptance criteria

The model is successfully implemented when:

- A newly created project persists with UUIDv7 identity, exactly one
  protected root node, and a root canvas used by Home.

- An untitled dropped image persists as a node with a stable UUIDv7
  identity.

- A note can exist with zero nodes.

- Several nodes can reference one note while retaining independent tags,
  appearances, canvases, and placements.

- One node can have several placements.

- A note title collision returns a structured conflict, preserves the
  draft, and offers context-appropriate use, open, restore, or rename
  actions.

- Wiki links continue working after note rename, with inbound unaliased
  Markdown tokens and indexed link records updated in one command.

- Activating a wiki link always updates the note pane immediately.

- An unresolved wiki link persists an indexed unresolved record,
  renders distinctly, and its title appears in wiki-link suggestions
  with a phantom indicator and reference count.

- Activating an unresolved link opens a phantom view that persists
  nothing until materialization.

- Materializing a phantom note through a first edit, Create Note, or
  Create and Place binds every matching unresolved token project-wide
  in one user-level command.

- A newly typed token matching a trashed note's title binds to that
  note and presents In Trash affordances on activation.

- A broken link never re-binds implicitly; activation offers explicit
  recreate and, when applicable, relink actions.

- One spatial destination navigates automatically.

- Several spatial destinations invoke a dismissible chooser.

- Dismissing the chooser does not undo note navigation or disturb the
  prior viewport.

- Matching placements can be highlighted together on one canvas.

- Detaching a note affects only one node.

- Moving a shared note to Trash presents an impact summary, preserves
  link targets and node attachments, and supports lossless restore.

- Moving a node to Trash preserves its placements, canvas, appearance,
  tags, and note attachment for restoration while leaving the note
  active.

- Deleting the last placement of a bare node moves the node to Trash
  in the same user-level command, with a Keep in Project action that
  restores it unplaced; nodes with a note, tags, or an owned canvas
  remain active.

- The node library lists every active node with appearance, note
  title, tags, and placement count, and filters to unplaced nodes.

- Full-text search finds notes, tags, asset filenames, and canvas text
  with kind-appropriate navigation, excluding Trash by default, and
  quick-open jumps to notes and canvases by title.

- Nodes place from the library by drag or Place on Current Canvas, and
  a zero-node note places as a labeled dot node in one transaction.

- History skips trashed or purged targets; bookmarks to trashed
  targets offer Restore, bookmarks to purged targets show broken and
  offer removal, and stale viewport or selection context is ignored
  gracefully.

- An exported project imports losslessly into a new project directory
  with all record identities preserved.

- Moving a non-root canvas to Trash preserves referenced nodes and notes
  by default; the root canvas cannot be trashed.

- Canvas text, shapes, paths, lines, arrows, and connectors persist as
  UID-bearing Decorations and do not appear as nodes or semantic graph
  edges.

- Placements and decorations share deterministic ordering while the
  background and temporary interaction overlays remain separate planes.

- Decorations support lock, visibility, group, ungroup, and
  placement-anchored connectors.

- Project-scoped tags with flat name identity are assigned only to
  nodes, can be renamed without rewriting assignments, and open the
  tag panel.

- Dot, icon, and image remain interchangeable appearances.

- A placement with an attached note shows the note title as a label by
  default, toggleable per placement from its selection controls, and
  the label follows note renames.

- Image cropping is non-destructive.

- Align, distribute, and flip operate as durable commands or placement
  presentation state without modifying assets; snapping remains an
  ephemeral drag aid within the one-command gesture rule.

- Oversized background maps use tiled or pyramidal derivatives.

- A canvas background references a managed Asset and supports set,
  replace, edit, reset, and remove operations without becoming a node or
  placement.

- A canvas background color can be set and cleared independently of
  the image background.

- Trash retention persists in the project database and survives
  export and import; application preferences persist outside projects.

- UI components perform durable mutations through the Project API using
  versioned command envelopes and expected project revisions.

- Structural undo emits inverse commands.

- Continuous drag, resize, rotate, freehand, and similar gestures commit
  one durable command on completion.

- Note editing has no explicit save action: an editing burst commits
  one UpdateNote on idle, blur, quit, or forced flush, advancing
  project_revision once and refreshing link records and search.

- Note-body edits undo through editor-local history only; structural
  undo never reverts prose, while note rename remains structurally
  undoable.

- One structural undo stack serves all views of an open project
  session, is in-memory only, and clears redo on any new command;
  command metadata persists as a non-replayable log.

- Undoing a change on an inactive canvas navigates to and highlights
  the affected content.

- Canvas cycles, including self-reference, remain legal and bounded by
  visited-set traversal.

- Trash retention defaults to Never; purge and garbage collection do not
  remove resources still referenced by active records, Trash, valid
  undo, or active jobs.

- The same project directory cannot acquire two independent
  authoritative writers.

- Imported originals remain available after their external source moves
  or disappears.

- Clipboard paste of image data and copied files imports through the
  same staged pipeline as file drop.

- A URL-only browser drop fetches and imports the image or fails with
  a clear error and no records; source URLs persist as attribution.

- Asset records carry a kind discriminator, with image as the only
  Phase 1 kind, and unsupported formats are rejected at staged-import
  validation.

# 19. Open questions

The following remain deliberately unresolved:

1. (Largely resolved, rev 0.17.) The location chooser is the
link-anchored panel sharing the §7.4 row grammar, and the phantom
view is the §8.5 panel lifecycle; wiki-link suggestion ranking
remains open.

2. Whether highlighted-placement mode activates automatically for a
large same-canvas group or only on explicit selection.

3. (Resolved, rev 0.17.) The §8.4 click grammar: single-click
selects, charms open their facet, double-click opens everything.

4. Whether placement-specific appearance overrides are introduced
after Phase 1.

5. (Resolved, rev 0.17.) The first graph is a force layout with
wiki links as the only edges (§14.2).

6. (Resolved, rev 0.17.) The shell model of §8.2 and the note
panels of §8.5 replace workspace tabs, docking, and the docked note
pane; only the project-switcher charm's menu remains undesigned.

7. (Resolved, rev 0.11.) Background replacement preserves canvas
coordinates by fitting the new image into the prior stage extent
(§6.7); the number is retained so later references stay stable.

8. (Resolved, rev 0.20.) Tags stay flat: a single-parent organizing
tree was accepted in rev 0.19 and dropped by the owner in the same
design cycle (§4.8). Aliases, groups, and visual tag relationships
remain open; reopening hierarchy is a deliberate domain decision,
not a growth path.

9. Whether named layers become necessary after prototype use.

10. Whether a project-wide archive or hide lifecycle is needed beyond
canvas-local visibility and view filters.

11. Exact project export container format.

12. Whether nodes may own more than one canvas in a future release.

13. Exact-node and exact-placement link syntax.

14. (Resolved in direction, rev 0.18.) The node library grows into
the §14.4 library shape: the gallery projection, library projects,
and cross-project sourcing with copy-on-ingest. Note browsing and
multi-facet detail still deserve their design pass.

15. Label styling (typography, chrome, and the exact
placement-proportional ratio with any legibility clamps), to be
settled by feel during canvas-engine prototyping. Zoom behavior
itself is decided: labels scale with their placement, and all canvas
content is world-space (rev 0.8, §4.5/§4.9).

16. Whether note-body preview cards later join dot, icon, and image as
an on-canvas appearance direction. The expected shape is a fourth
appearance kind rendering the attached note's title and a body excerpt
inside fixed card chrome, updating with note edits and reusing the
placement, label, and render-order machinery unchanged.

17. When the web-reference asset kind lands, its metadata fetch
pipeline, overlay playback behavior, and the configuration surface for
the optional media-backup adapter — now framed as adapter actions
inside the §4.7 importer dialogue, alongside format conversion and
the auto-optimize threshold.

18. Whether camera input mapping needs a user preference (mouse-wheel
zoom versus wheel pan) once artists with mixed trackpad and mouse
setups weigh in.

19. Whether frame objects — the on-canvas containers sanctioned in
section 6.8 — become necessary after prototype use, and what
containment semantics they carry (spatial capture on drag versus
explicit membership).

20. (Resolved, rev 0.20.) The pin tool in the dock replaces the
Create Pin dialog (§6.2): click places a dot node with its phantom
note focused; Escape before typing and nothing persisted. The
CreatePin command is unchanged as the one-transaction backbone. The
dialog retires when the tool ships.

21. Whether zero-node ("hidden") notes justify themselves —
equivalently, whether this is the user's entire campaign wiki or
their embodied-in-the-canvas campaign wiki. The feature stays for
now (its cost is near zero atop the phantom/Unplaced machinery);
the owner suspects the embodied reading ultimately wins.

22. Multi-tag queries (AND/OR) over the §4.8 tag panel, whose field
deliberately takes exactly one tag in Phase 1.

23. Note-attached tags — deferred, not rejected (§4.8): reasons a
note could own a tag exist, but they pollute the database without
demonstrated benefit; revisit on real need.

24. The hold-Mod switcher HUD (§8.1): a thumbnail flash of
bookmarked boards as the learned-shortcut reflex path, complementing
the bookmark menu, not replacing it.

25. Side-by-side comparison of two boards, formerly implicit in
workspace tabs. Expected shape: a second window onto the same
project, which requires the multi-window story the §11.1
single-writer rule already anticipates.

26. (Resolved, rev 0.25.) The gallery's navigation model gained
grouped time buckets with a header-anchored jump control (rev
0.22), and the keyboard half closed at EPIC-014 activation: cursor
distinct from selection, linear document-order ranges, Space
reserved for preview, kind-appropriate Enter, Escape peeling, and
bucket jumps (§14.4).

27. The OS-drop importer dialogue as the third compression of the
gallery grammar (§14.4, §4.7) awaits its design turn.

28. (Shaped, rev 0.26 — early musing, deliberately unclosed.) The
iPad direction: the web renderer carries over through a WKWebView
shell (Tauri-class), macOS becoming the WebKit lead platform when
that work actually starts — not before; Windows/Linux stay on
Electron/Chromium (WebKitGTK is the weak WebGL target). Persistence
authority STAYS a desktop feature: the iPad is a satellite holding
a read replica (the §16 export as the snapshot vehicle) plus a
command outbox the desktop grabs and replays through the real
pipeline — the single-writer rule (§11.1) is preserved, asset
transfer is idempotent by content hash, and §15's
command-as-sync-unit becomes concrete. Two live writers stay out
of scope; a server-authoritative client would be a different
product. The open half is the rejected-replay surface, and its
governing rule (rev 0.28) is that superposition is LAZY: a replay
that no longer applies never interrupts the sync and never demands
resolution — both versions persist as ordinary records, the board
shows one (default: the authoritative store's), and the stack of
unresolved alternates just sits there until the user feels like
picking, possibly never. There is no merge moment; "resolve" is a
browse-and-choose whenever, not a gate on anything. Nothing is
destroyed either way. Awaits its design turn with the satellite
work.

29. (Shaped, rev 0.29 — early musing.) The pitch bible: an
LLM-assisted export that reads the project's typed graph — boards,
placements, notes, tags, provenance — and narrates it into a
presentation artifact (PPTX/PDF), the world-bible/pitch-bible
deliverable an animation pipeline actually asks for. The model
tier is deliberately modest (Haiku-class riding the owner's
subscription, the idle-bell precedent) because the layout
intelligence lives in document-generation skills, not the model;
the app's job is only to expose the graph in readable order (the
§16 export plus queries already do). Two lives: near-term as
OWNER TOOLING — point a Claude Code session with a design/pptx
skill at a project.sqlite and generate the deck by hand, which
also field-tests what the eventual in-app export needs — and
long-term as an in-app export behind the §4.7 adapter grammar
(versioned, external endpoint, outside the core domain). No
schema involvement either way.

# 20. Decision summary

Accepted for the Phase 1 prototype:

- Notes are independently addressable semantic records.

- Notes may exist without nodes and may be shared by several nodes.

- Each project has exactly one protected root node and root canvas; Home
  targets that canvas.

- New persisted identities use RFC 9562 UUIDv7 without treating UUID
  order as authoritative chronology.

- Nodes own appearance, flat project-scoped tag assignments, optional
  canvas, and placements.

- Placements are spatial occurrences of nodes.

- Wiki links target note IDs through indexed link records; placements
  target nodes.

- Link records are bound, unresolved, or broken; unresolved records
  group into phantom notes by title_key.

- Note titles are restricted to characters expressible inside a
  wiki-link token in Phase 1; renames rewrite the title half of every
  inbound token, aliased or not, leaving aliased display labels
  untouched.

- All canvas content is world-space; nothing renders screen-constant.
  Placement labels are the single relative size, scaling
  proportionally with their placement; everything else, including
  canvas text, owns an independent fixed world size. Zoom reads the
  layout; it never rewrites it.

- Phantom notes materialize on first edit or through equal-peer Create
  Note and Create and Place actions; materialization, note creation,
  rename, and restore run the re-resolution sweep, while broken links
  require explicit recreation or relinking.

- Wiki-link autocomplete suggests existing and phantom titles without
  a separate create action.

- Note text updates immediately on link activation.

- Spatial resolution is independent and may navigate, ask, or remain
  still.

- Uses and location views group by canvas, then node, then placement
  count.

- Tags are first-class, flat, project-scoped records assigned only
  to nodes, never serialized into note text; activating a tag opens
  the tag panel (§4.8). Hierarchy was accepted (rev 0.19) and
  dropped (rev 0.20) in one design cycle: tags stay the thin layer,
  and reopening hierarchy is a deliberate domain decision.

- Pins and externally dropped images are nodes.

- Canvas text, shapes, drawing, lines, arrows, connectors, guides, and
  spacers are UID-bearing Decorations.

- Drawn connectors may anchor to placements but do not become semantic
  graph edges.

- Placements and decorations share deterministic ordering; background
  and interaction overlays remain separate planes.

- Decorations support lock, visibility, grouping, and ungrouping; named
  layers are deferred.

- Every canvas supports one managed image background with set, replace,
  edit, reset, and remove operations.

- Dot, icon, and image are appearances.

- Placement labels display attached note titles only; visibility is
  per-placement presentation state defaulting to visible, with an
  inline toggle on the selection controls. Note-body preview cards are
  deferred.

- Images selected inside Create Pin attach to that node and do not
  create a second node.

- Place Existing creates another placement of the same node.

- Create Another Using This Note creates a new node sharing only the
  note.

- Detach affects one node; recoverable deletion moves records to Trash
  while preserving identity and restoration relationships.

- Deleting the last placement of a bare node auto-trashes the node in
  the same command with a Keep in Project escape; invested nodes stay
  active.

- A nodes-only node library with an Unplaced filter is a Phase 1
  requirement and the durable home for unplaced material, realized by
  the outline takeover view (rev 0.17).

- Trash is a lifecycle state and query view, not a container; automatic
  purge defaults to Never.

- Hidden remains a presentation concern distinct from Trash.

- Canvas containment is a graph and cycles, including self-reference,
  are legal.

- SQLite is authoritative in Phase 1.

- Commands carry per-type versions and expected project revisions;
  committed mutations advance project_revision.

- Continuous pointer gestures commit one durable command on completion.

- Note text commits as debounced, gesture-style UpdateNote commands
  with forced flush before body-reading commands; body edits are
  excluded from structural undo and owned by editor-local history.

- Structural undo is project-global per session and in-memory, with a
  persisted command metadata log; cross-canvas undo navigates to its
  effect, with apply-in-place available as a setting.

- One project service holds the authoritative project write lock.

- Imported originals are copied into managed project storage.

- Import surfaces are file drop, clipboard paste, and browser drag;
  URL-only drops may fetch as the single Phase 1 networking carve-out.

- Phase 1 assets are raster images only, behind a kind discriminator;
  web-reference assets with overlay playback and a default-off
  media-backup adapter are the shaped deferred direction.

- The importer dialogue is the deferred expansion point for content
  entry: per-source adapter actions (format conversion, auto-optimize,
  web fetch) in one dialogue pattern, with converted originals kept
  as archived-original sidecar assets — nothing is discarded (§4.7).

- Align, distribute, flip, zoom to fit and selection, and snapping
  with smart guides are Phase 1 board tooling; auto-arrange and grid
  SNAPPING are deferred with scope in section 6.9. Adaptive
  multi-scale grid DISPLAY ships, hidden when a background stage
  exists.

- A background image defines the canvas's stage (§6.7, presentation
  only): grid hides inside, a distinct void renders beyond, fit/home
  target the extent, set-from-file normalizes to the canonical stage
  width (2048), set-from-selection preserves the placed rect, replace
  fits the prior extent, and the camera eases to frame a newly set
  background.

- Camera input follows platform muscle memory: pinch zooms at the
  pointer, two-finger scroll pans, wheel zooms, Space or middle-drag
  pans; the cursor communicates interaction state. Smart guides render
  quiet and appear only while engaged; snapping uses hysteresis.

- Rotation snaps by orientation (cardinal magnetism; Shift = 15°
  absolute steps); Shift while drawing constrains shapes to canonical
  proportions and segments to 45° steps; canvas text styling is
  whole-object (system fonts with stack fallbacks, bold/italic/size/
  color) with resize scaling the world size — per-span rich text
  deferred as styled runs, never HTML.

- Two arrow constructs (rev 0.13): the annotation arrow is a pen
  stroke (head from thickness, constant weight under resize,
  length-clamped) and the arrow shape is a ShapeKind variant scaling
  with its box; every new stroke is born legible at the creating
  viewport with the weight control as a multiplier (rev 0.14); the
  Baseline UI Vision's tool-rail split carried into the rev 0.17
  shell model's dock (§8.2).

- Grouping stays canvas-local presentation state; relational data
  never mirrors board arrangement. Frame-like on-canvas containers are
  the sanctioned future shape if groups need to be more (section 6.8),
  and a cycle-safe canvas contents outline is deferred with scope
  (section 14.3).

- Search indexes notes, tag names, asset filenames, and canvas text;
  quick-open covers notes and canvas-owning nodes and excludes phantom
  titles.

- The node library and Uses list are placement sources: library
  drag and Place on Current Canvas create placements, and zero-node
  notes embody as labeled dot nodes in one transaction.

- Stale navigation degrades explicitly: history skips dead targets,
  and bookmarks surface In Trash or broken states rather than being
  auto-deleted or silently retargeted.

- Exports reimport losslessly into a new project directory with
  preserved identities; merge remains out of scope.

- Note bodies are plain text in Phase 1; asset embedding is deferred
  with a records-based shape that never requires scanning prose.

- Canvases support a solid background color beneath the optional image
  background; settings split by blast radius into project-scoped data
  settings and application-scoped preferences.

- A full asset-library manager, asset tags, watched folders, and Eagle
  or Allusion importers are deferred behind future versioned adapters.

- Electron, TypeScript, Svelte 5, and CodeMirror 6 are accepted
  directions.

- PixiJS 8 is the canvas renderer, decided by the AI-EPIC-001 spike;
  evidence and Konva revival conditions live in
  RAG/spike-reports/renderer-comparison.md.

- The graph/data workspace is separate from the art canvas.

- Back, Forward, Home, bookmarks, and viewport restoration are
  project-scoped, with one session history per window rendered as
  the path (rev 0.17).

- No PostgreSQL, Docker, networking, or CRDT dependency is introduced in
  Phase 1.

- Drawn decorations stay restylable after placement (stroke, fill,
  weight, rect corner rounding), one command per edit (rev 0.16).

- Wiki-link activation in the source editor is Mod+Click with a
  mandatory hover affordance; the accepted long-term answer to the
  source-vs-presentation tension is a live-preview reading mode over
  the same source buffer, deferred with scope in section 7.3
  (rev 0.16).

- The Create Pin dialog retires when the pin dock tool ships
  (rev 0.20, §6.2): ◉ places a dot node with its phantom note
  focused, Escape-before-typing persists nothing, and pins mean
  places everywhere — the tool shares the bookmark control's glyph.
  The zero-node-note question stays open as question 21.

- The shell model (rev 0.17, from the July 2026 design-consult
  cycle): the window is the board; chrome floats and never reflows
  the canvas; node-local content opens as panels anchored to what
  summoned them while project-global views (graph ⊛, gallery ⊞,
  outline ▤,
  settings) take over the window, Esc-returning with the camera
  untouched. Mode charm rail, bottom dock, hover title strip, one
  shared engagement-fade clock, and the tooltip rule (every control
  teaches its shortcut). Workspace tabs, the docked note pane, and
  the persistent status strip are retired. macOS leads; Windows and
  Linux differ only by a ☰ menu entry point.

- Navigation chrome (rev 0.17): the path renders the back stack —
  entry route, never ancestry; Back/Forward are gestures first;
  Home is a dedicated button; the bookmark menu's row order IS the
  Mod+1–n binding with printed shortcuts, and stale bookmarks grey
  out in place. The switcher HUD and New Window side-by-side are
  deferred (questions 24–25).

- Node charms and click grammar (rev 0.17): page and frame hint
  charms as a no-hover census, single-click selects and shows the
  charm bar, charm clicks open exactly their facet, double-click
  opens everything. Selection is a thin outline with cursor zones —
  no drawn transform handles; Option-drag duplicates as a placement
  copy.

- Note panels (rev 0.17): one tethered panel at a time, pinned
  panels accumulate and never auto-unpin, and the "which node am I
  reading" indicator escalates exactly as far as the spatial link
  is broken — tail, halo, edge chip, cross-board origin label. The
  canvas's own note is the screen-fixed corner charm. The Uses list
  lives in the panel behind the places header; the location chooser
  anchors to the activated link.

- Tag surfaces (rev 0.17): the tag panel with name completion and
  the lens (a view state dimming the board to hits), reachable
  through three doors; frontmatter-derived tags considered and
  rejected; single-tag queries, with multi-tag and note-attached
  tags deferred (questions 22–23).

- The settings takeover (rev 0.17): translucent inset sheet from ☰,
  live-applying, commit-on-click, one-glance inventory; opinions
  ship as defaults and feel constants are not settings. Themes are
  dark, light, and Mac-only glass with scrim-chip legibility and
  CSS-custom-property tokens.

- Ongoing conditions get a rail perch that exists exactly as long
  as the condition does; transitions get toasts; the status strip
  retires when the perch ships (rev 0.17).

- The library direction (rev 0.18, §14.4): library entries are
  unplaced nodes; a library is internally a project ("library" is
  the project kind, "gallery" is the view, rev 0.20); the gallery
  projection is a view any project can open; projects
  source other projects read-only and ingest by copy, never by
  reference; tags cross that border by explicit decision; the
  placement picker is the compressed browser; the Allusion importer
  is a versioned adapter. Export gains a once-per-project size
  preflight instead of any hard limiter.

- The inbox mirror (rev 0.19): a drop anywhere may also import into
  the library project — asked once per project, one-way, never
  blocking the drop — with content hashes providing recognition
  without reference. Experientially one library; physically
  hermetic projects.

- The escape-hatch export (rev 0.19, deferred with scope): notes as
  Obsidian-readable Markdown with an optional appended uses section
  embedding `![[...]]` links to exported assets; originals with a
  tag manifest and optional tag folders; every canvas as a
  full-resolution rendered image — boards leave as pictures.

- Boards also leave as JSON Canvas (rev 0.21): each canvas exports
  as an Obsidian-readable `.canvas` with art, notes, edges, and
  nested-canvas references intact; rotation, crop, flip, and ink
  flatten or drop, with the rendered image as the pixel-true
  sibling.

- Ghost overlay mode (rev 0.21, deferred with scope, §8.7):
  transparent, always-on-top, click-through per window for drawing
  under the reference; entered past one hard confirmation naming
  the escape keybind; closing the window always resets it.

- Booru drop adapters (rev 0.21, deferred with scope, §4.7):
  dropping a booru post link imports media, curated tags (through
  the explicit tag border), thumbnail, and attribution as one
  CreatePin; versioned adapters keyed by API family (Danbooru,
  Moebooru), Sakugabooru first.

- Option splits by moment (rev 0.21, §6.9): at drag start it
  duplicates; mid-drag it bypasses snapping.

- The end-session surface (rev 0.23, deferred with scope, §11.4):
  ☰ → End session = flush, optional vault regeneration, close,
  release the lock — the clean boundary that makes cloud-synced
  project directories safe. The vault mirror (§16) regenerates on
  session end and gains a body-and-title pull-back importer over
  our own export format on next open.

- Session snapshots (rev 0.24, §11.4): the end-session boundary is
  a commit point — project directories ship git-ready (lock and
  WAL ignored, WAL checkpointed at close), a per-project setting
  offers off · git commit · commit + push, and snapshots include
  the vault mirror so history carries readable diffs. History
  browsing stays external; iCloud remains a location choice, not a
  mechanism.

- The gallery groups time instead of scrolling it (rev 0.22,
  §14.4): date sort renders bucketed sections (relative buckets
  aging into calendar months) whose current header IS the jump
  control; a kind facet (image · note · board) joins the facets;
  the tag facet orders by name or count; and the scope toggle —
  this world · everything — selects whose gallery is shown, the
  library being "everything" by construction of the mirror.

- The gallery keyboard model (rev 0.25, §14.4): a cursor distinct
  from selection; plain arrows collapse, Shift extends the linear
  document-order range, Mod toggles, and Space stays reserved for
  preview; Mod+A selects the current filter scope; Enter is the
  kind-appropriate primary action; Escape peels selection before
  the takeover; Mod+Up/Down jump buckets under date sort.

- Thumbnails ride the renderer's Chromium codecs (rev 0.27, §4.7):
  renderer claims → decodes/resizes → WebP-with-alpha → service
  owns queue and files; zero native dependencies, format envelope
  identical to the board's by construction, generation needs a
  live window, unclaimed jobs self-heal across opens.

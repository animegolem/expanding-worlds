# RFC-0001: Core Note, Node, and Canvas Model

Product semantics, persistence boundaries, and provisional desktop
architecture for the Phase 1 prototype

| **STATUS**  | **REVISION** | **LAST UPDATED** |
|-------------|--------------|------------------|
| In revision | 0.5-draft    | 1 July 2026      |

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

13. Provisional desktop technology direction

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

- Portable export of notes, project structure, and original assets.

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

- Hierarchical tags or tag-to-tag relationships.

- Named canvas layers.

- Automatic semantic graph relationships inferred from drawn connectors.

- Note-body preview cards rendered on canvas.

- SVG, video, audio, or PDF import.

- Web-reference assets, media playback, and the media-backup adapter,
  which remain the shaped deferred direction described in section 4.7.

- Auto-arrange (pack) and grid display or grid snapping, which remain
  the shaped deferred direction described in section 6.9.

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

Wiki-link occurrences are indexed in separate link records that store
source note, target note ID, source revision, and source range or token
identity. Markdown remains the user-editable canonical text.

A trashed note retains its title_key reservation until it is permanently
purged, so restoration remains deterministic.

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

A canvas may contain placements of nodes that themselves own canvases.
Containment is a graph rather than a tree: direct and indirect cycles,
including a node placed on its own canvas, are legal. Only the active
canvas is mounted as a live renderer.

The canvas has three conceptual render planes: a dedicated background
plane; one shared ordered plane for placements and decorations; and
temporary interaction overlays such as selection boxes and handles.
Named layers are deferred.

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
adapters outside the core domain model.

A deferred **web-reference** asset kind is shaped as follows so the
model leaves room for it. A web-reference stores a source URL and
fetched metadata such as title, site, and oEmbed or OpenGraph fields,
plus a thumbnail derivative that serves as node appearance; activating
such a node MAY open a DOM overlay above the canvas for playback or
preview. An optional user-configured media-backup adapter, such as a
self-hosted yt-dlp endpoint, MAY archive the underlying media into
managed storage; it defaults to off and remains a versioned adapter
outside the core domain model.

## 4.8 Tags

Tags are flat, project-scoped, first-class records assigned many-to-many
to nodes.

A Tag MUST have a stable UUIDv7 ID, project membership, a user-facing
name, a normalized name_key unique within the project, and creation and
modification metadata. A Tag MAY have a color or icon for presentation.

Tags distinguish nodes that share one generic note and form the final
thin organizational layer through which users create an ad hoc schema.
Tags do not belong to notes in Phase 1 and do not create built-in
application behavior or entity types.

Activating a tag opens a standard query or data view of nodes carrying
that tag. Results SHOULD expose node appearance, attached note title
when present, other tags, placement count, canvas locations, and an
Unplaced group.

Tag identity is independent of its name so renaming a tag does not
rewrite assignments. Tag hierarchy, tag aliases, and tag-to-tag
relationships are deferred until concrete usage demonstrates a need.

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

When a connector endpoint is anchored to a placement, it follows that
placement. If the placement is deleted, the endpoint SHOULD become a
free point at its last rendered position rather than deleting the
connector.

Canvas text is lightweight visual labeling. It is not a note, does not
participate in wiki links, and does not receive backlinks or node tags.

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

Commands, queries, subscriptions, workspace history, bookmarks, and tabs
MUST be scoped to one project. The initial UI MAY support one open
project per application window without defining a final multi-project
interface.

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

8. Tags are flat, project-scoped records assigned only to nodes in
Phase 1.

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
workspace tabs, and in-memory; committed command metadata persists as
a non-replayable log.

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

## 6.2 Create Pin

Create Pin opens an inspector or sidebar flow. The user chooses:

- New node or Place Existing.

- Appearance: colored dot, built-in icon, or image.

- Icon, color, or image file.

- Non-destructive crop and framing for an image appearance.

- Optional new note title.

- Optional existing note to share.

- Optional node tags.

Selecting an image inside this dialog attaches the asset as the pin
node's appearance. It does not create a second image node.

Pressing Create commits one user-level transaction: asset import when
applicable, node creation, note creation or attachment when applicable,
appearance assignment, tags, and placement creation.

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
a note Uses sidebar, a title-collision flow, or a node context menu.

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
Background.

Background editing occurs through an explicit mode so the background
cannot be accidentally selected during ordinary work. Oversized
backgrounds use tiled or pyramidal derivatives while retaining the
original Asset as canonical.

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

Connector endpoints MAY be free points or anchored to placements.
Connector geometry remains visual decoration and does not create a
semantic relationship.

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

While dragging, placements and decorations SHOULD snap to the edges
and centers of nearby content, with smart guides rendered in the
temporary interaction overlay plane. Snapping is an ephemeral
interaction aid: the gesture still commits exactly one durable command
on completion, and a modifier key SHOULD temporarily disable snapping.

**Deferred with scope.** Auto-arrange (pack) — algorithmic reflow of
the selected placements into a compact non-overlapping arrangement —
is deferred; when revisited it SHOULD operate on an explicit selection
and commit as one durable command. Grid display and grid snapping are
deferred together; when revisited, the grid SHOULD be a canvas
presentation setting whose spacing feeds the same snapping machinery
specified above.

## 6.10 Materialize a phantom note

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

Markdown source remains canonical and human-readable. Renaming a target
note transactionally rewrites inbound unaliased [[Title]] tokens and
rebuilds affected link positions; explicitly aliased display labels
remain unchanged. The rename and all rewrites form one user-level
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
| Zero | Keep the canvas workspace unchanged and indicate that the note has no placed locations. |
| One | Open the containing canvas, center the placement, and select or highlight it. |
| More than one | Keep the pre-link canvas viewport and present a dismissible location chooser. |

Dismissing the chooser keeps the newly opened note visible and leaves
the canvas where it was. The dismissal interaction MUST NOT also select
or drag content underneath it.

## 7.4 Uses sidebar and location chooser

A note MAY expose a closable Uses sidebar. The sidebar and the
link-activation chooser SHOULD use the same location query and grouping
model:

1. Group by containing canvas.

2. Within each canvas, group by node.

3. Show the number of placements for each node.

4. Show node appearance or thumbnail.

5. Show node tags when present.

6. Include an Unplaced group for nodes with no placements.

Selecting a canvas group may open that canvas with all matching
placements highlighted. Selecting a node group may highlight all
placements of that node. Selecting an individual placement may center
it.

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

Opening a node's canvas replaces the active canvas workspace or opens it
in a workspace tab. Descendant canvases are not rendered live inside the
parent. Home opens the current project's protected root canvas.

Navigation records per-workspace, project-scoped session history rather
than structural ancestry. Each workspace tab SHOULD retain:

- Independent Back and Forward history.

- The route used to enter a canvas.

- Previous viewport state when returning.

- The originating placement when practical.

- The view kind and target identity when the workspace contains a graph,
  query, search result, or other projection.

No canonical parent is assumed. A new navigation after Back clears that
workspace tab's Forward stack. Changing projects changes the applicable
history rather than sharing one global stack.

Bookmarks are durable project-scoped records. A bookmark MAY target a
canvas plus viewport and selection context, or another workspace
projection. Whether bookmarks appear as a bar or dropdown remains a
responsive UI decision.

## 8.2 Workspace composition

The following is provisional UI direction rather than a normative
ontology rule:

- The note editor remains persistently available in a pane or note tab
  area.

- The main workspace supports tabs.

- A workspace tab may contain a canvas, relationship graph, table or
  data view, search result, or other project projection.

- Notes may also be tabbed or pinned depending on prototype feedback.

- Relationship/data views are separate renderers from the art canvas
  while querying the same domain model.

The exact split layout, docking behavior, project switching, and tab
rules should be tested with the intended artist user rather than frozen
in this RFC. Architecture MUST still scope every workspace, command,
query, subscription, and navigation record to one Project ID.

## 8.3 Search and quick-open

Full-text search covers note titles and bodies, tag names, asset
original filenames, and canvas text decorations. Results open in a
search workspace tab grouped by kind: a note result opens in the note
pane, a tag result opens its node result view, a filename match
surfaces the nodes using that asset, and a canvas-text match opens the
containing canvas centered on the matching decoration. Trashed records
are excluded by default.

A keyboard-summoned quick-open MUST navigate by title across notes and
canvas-owning nodes. Selecting a note opens the note pane; selecting a
canvas opens it in the workspace. Quick-open matches by title_key and
does not include phantom titles, which remain reachable through links
and wiki-link suggestions.

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

- SetCanvasBackground.

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
command when it completes: on an idle debounce, on editor blur or pane
or tab switch, on application quit, and as a forced flush before any
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
shared across that project's workspace tabs; there is no per-tab undo
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

The leading renderer choice is PixiJS. Before locking it, the project
will compare PixiJS and Konva through the same focused spike.

The spike SHOULD include:

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

The decision should weigh implementation effort as well as frame time
and memory. PixiJS is preferred if its control and rendering headroom
justify the additional editor-interaction work. Konva is acceptable if
it meets the real workload and materially reduces implementation risk.

# 13. Provisional desktop technology direction

The following choices are accepted unless the renderer spike produces
contrary evidence:

| **Layer** | **Direction** | **Notes** |
|----|----|----|
| Desktop shell | Electron | Ships a consistent Chromium runtime and supports a future TypeScript server ecosystem. |
| Language | TypeScript | Shared domain, command, persistence-contract, and future protocol definitions. |
| Application UI | Svelte 5 | Owns panes, tabs, dialogs, inspectors, note shell, search, and data views. |
| Canvas renderer | PixiJS preferred; Konva spike | Renderer remains framework-independent behind a Canvas Controller. |
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

- Incremental synchronization to PixiJS or Konva.

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

## 14.1 Node library

Phase 1 MUST provide a node library: a data-view workspace tab listing
every active node in the project. Each entry SHOULD expose the node's
appearance or thumbnail, attached note title when present, tags,
placement count including zero, and canvas locations. The library MUST
support filtering to unplaced nodes.

The node library is the durable home for stashed and unplaced
material: keeping an unplaced node in the project is a legitimate
workflow, not an error state. The library covers nodes only in
Phase 1; multi-facet sorting, richer data views, and note browsing
remain future iterations.

## 14.2 Relationship graph

The relationship graph is a separate projection from the art canvas.

Phase 1 MAY provide a basic graph or data workspace tab that can show:

- Notes and note-to-note wiki links.

- Nodes grouped under or associated with notes.

- Untitled image and pin nodes.

- Placement counts.

- Canvas membership.

- Node tags.

- Tag result views that list all nodes assigned to one selected tag.

- Unplaced notes and nodes.

The maximal graph may show active records by default, with explicit
options for Trash and view-local hiding, and filters for image nodes,
untitled nodes, current-canvas scope, note links, placement
relationships, and node tags.

The graph renderer need not reuse the art-canvas renderer. Both query
the same project model.

Drawn lines, arrows, and connectors are decorations and do not appear as
semantic graph edges. A future explicit relationship feature may promote
or create semantic edges through a separate operation.

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
rename a tag, and open its result view.

9. Place the same node more than once.

10. Open a node's canvas, persist it immediately, and add nested
content.

11. Create a legal canvas cycle and verify navigation, graph queries,
and export do not recurse indefinitely.

12. Navigate with per-workspace Back, Forward, Home, and a bookmark
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
relationships.

21. Delete the last placement of a bare image node, verify the node
moves to Trash in the same command, use Keep in Project to restore it
unplaced, and locate it through the node library's Unplaced filter.

22. Verify a link to the trashed note presents In Trash affordances,
and that purging it produces a broken link offering explicit recreate.

23. Verify Trash retention defaults to Never and that permanent purge
invalidates dependent undo and enables safe garbage collection.

24. Open a minimal graph or data workspace tab and confirm Trash and
decoration edges are excluded by default.

25. Close and reopen the application without data loss, duplicate
project writers, or unreconciled temporary imports, including a note
edit still inside its debounce window at quit.

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

- Moving a non-root canvas to Trash preserves referenced nodes and notes
  by default; the root canvas cannot be trashed.

- Canvas text, shapes, paths, lines, arrows, and connectors persist as
  UID-bearing Decorations and do not appear as nodes or semantic graph
  edges.

- Placements and decorations share deterministic ordering while the
  background and temporary interaction overlays remain separate planes.

- Decorations support lock, visibility, group, ungroup, and
  placement-anchored connectors.

- Flat project-scoped tags are assigned only to nodes, can be renamed
  without rewriting assignments, and open node result views.

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

- One structural undo stack serves all workspace tabs of an open
  project session, is in-memory only, and clears redo on any new
  command; command metadata persists as a non-replayable log.

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

1. Exact visual design and keyboard behavior of the location chooser,
the phantom view, and wiki-link suggestion ranking.

2. Whether highlighted-placement mode activates automatically for a
large same-canvas group or only on explicit selection.

3. Default click, double-click, and primary-open behavior.

4. Whether placement-specific appearance overrides are introduced
after Phase 1.

5. The first graph layout and its default semantic edge projection.

6. Exact workspace tab, docking, note-pane, and project-switching
behavior.

7. How background replacement preserves or recalibrates existing
canvas coordinates.

8. Whether flat tags later gain hierarchy, aliases, groups, or visual
tag relationships.

9. Whether named layers become necessary after prototype use.

10. Whether a project-wide archive or hide lifecycle is needed beyond
canvas-local visibility and view filters.

11. Exact project export container format.

12. Whether nodes may own more than one canvas in a future release.

13. Exact-node and exact-placement link syntax.

14. Final PixiJS versus Konva choice after the renderer spike.

15. How far the node library grows beyond the Phase 1 nodes-only list:
multi-facet sorting, richer data views, and note browsing deserve a
dedicated design pass informed by prototype use.

16. Label zoom behavior (fixed screen size versus scaling with the
canvas) and label styling, to be settled during the renderer spike.

17. Whether note-body preview cards later join dot, icon, and image as
an on-canvas appearance direction.

18. When the web-reference asset kind lands, its metadata fetch
pipeline, overlay playback behavior, and the configuration surface for
the optional media-backup adapter.

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

- Tags are first-class, flat, project-scoped records assigned only to
  nodes; activating a tag opens a node result view.

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
  requirement and the durable home for unplaced material.

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

- Align, distribute, flip, zoom to fit and selection, and snapping
  with smart guides are Phase 1 board tooling; auto-arrange and grid
  are deferred with scope in section 6.9.

- Search indexes notes, tag names, asset filenames, and canvas text;
  quick-open covers notes and canvas-owning nodes and excludes phantom
  titles.

- A full asset-library manager, asset tags, watched folders, and Eagle
  or Allusion importers are deferred behind future versioned adapters.

- Electron, TypeScript, Svelte 5, and CodeMirror 6 are accepted
  directions.

- PixiJS is preferred, subject to a PixiJS-versus-Konva spike.

- The graph/data workspace is separate from the art canvas.

- Back, Forward, Home, bookmarks, and viewport restoration are
  project-scoped and per workspace.

- No PostgreSQL, Docker, networking, or CRDT dependency is introduced in
  Phase 1.

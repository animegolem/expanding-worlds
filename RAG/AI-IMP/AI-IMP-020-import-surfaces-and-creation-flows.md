---
node_id: AI-IMP-020
tags:
  - IMP-LIST
  - Implementation
  - import
  - creation
  - canvas
kanban_status: in-progress
depends_on: [AI-IMP-018]
parent_epic: [[AI-EPIC-004-canvas-board-loop]]
confidence_score: 0.7
date_created: 2026-07-04
date_completed:
---

# AI-IMP-020-import-surfaces-and-creation-flows

## Summary of Issue #1

No content can enter a canvas: §6.1 import surfaces (OS drop,
clipboard paste, browser drag, URL-only drop), §6.2 Create Pin, §6.3/
§6.10 Place Existing, and §6.6 attach/detach/make-independent have no
UI, and the domain cannot commit "node + appearance + note + tags +
placement" as one user-level transaction. Add the `CreatePin` v1
composite command and build every creation surface on it. Done means:
all §17 item-3 import paths land managed assets with correct
attribution and placements, Create Pin and note/node placement flows
work end to end, and rejection paths create no records.

### Out of Scope

Move/resize/rotate (AI-IMP-019). Decoration tools (AI-IMP-021).
Backgrounds (AI-IMP-022). Full node-library and Uses-sidebar views
(§14.1/§7.4, EPIC-005/006) — this ticket ships a minimal placement-
source panel only. ytdl/web-media assets (deferred in RFC). Do NOT
touch: scene-sync/controller/gesture modules, handlers other than the
new pin handler file, `service.ts` beyond appends.

### Design/Approach

One composite command covers every creation flow. `CreatePin` v1
payload (client supplies UUIDs per §10.1): {nodeId, canvasId,
placementId, x, y, appearance: NodeAppearance, note?: {kind:'create',
noteId, title} | {kind:'attach', noteId}, tagIds?: string[]}. Handler,
in one transaction: create active node, set appearance (image
appearances validate the asset exists and is active), create note
(linkable-title + title-free rules from handlers/notes.ts, link
refresh + unresolved binding) or attach existing, assign existing
tags, create placement at (x,y) with natural-aspect dimensions for
image appearances (width/height from asset columns). Inverse:
`DeleteDraftPin` v1 {placementId, nodeId, createdNoteId?} — hard-
deletes placement + tag assignments + node, trashes a created note
(purge-safe, mirroring CreateNote↔TrashNote). §6.1 image drop =
importAsset (existing staged pipeline; its CommitAssetImport is
infrastructure, not the user gesture) followed by CreatePin with image
appearance and no note; §6.10 zero-node note placement = CreatePin
with dot appearance + note attach; §6.2 dialog = the general form.
New tags typed in the dialog issue CreateTag when added, before
Create. Surfaces: drop/paste handlers in CanvasHost convert screen →
world via the controller (paste at cursor, else view center §6.1);
browser drops carrying bytes record the source page URL into
importAsset metadata (asset.source_url exists); URL-only drops ask
main to fetch (renderer is sandboxed; user-initiated act §6.1) — an
IPC `fetchUrlForImport` in main streams the response and rejects
non-image/oversized bodies; any failure surfaces a clear error and
creates no records. Attach/Detach/Make Independent (§6.6) are context-
menu entries on a selected placement's node using existing commands.

### Files to Touch

`packages/commands/src/payloads/pin.ts` (+ index export): CreatePin/DeleteDraftPin payloads.
`packages/persistence/src/handlers/pin.ts` (+ tests): composite handler + inverse.
`packages/persistence/src/service.ts`: register pin handlers (append-only).
`apps/desktop/src/main/index.ts`: `fetchUrlForImport` IPC (net fetch, image sniff, size cap).
`apps/desktop/src/preload/index.ts`: expose fetchUrlForImport.
`apps/desktop/src/renderer/canvas/import-surfaces.ts` (+ CanvasHost wiring): drop/paste/browser-drag/URL handling → importAsset → CreatePin.
`apps/desktop/src/renderer/CreatePinDialog.svelte`: §6.2 dialog (appearance choice, crop/framing writing appearance_crop, note title/existing, tags).
`apps/desktop/src/renderer/PlacementSourcePanel.svelte`: minimal listNodeLibrary/listNotes panel with drag-to-canvas + Place on Current Canvas.
`apps/desktop/src/renderer/canvas/node-menu.ts`: attach/detach/make-independent entries.
`apps/desktop/e2e/import.spec.ts`: import + creation e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] CreatePin v1 handler: all payload variants (no-note image, create-note, attach-note, tags), natural-aspect placement sizing from asset dimensions, title validation via requireLinkableTitle/requireTitleFree, link refresh + bindUnresolvedMatching for created notes; tests per variant incl. duplicate-title rejection leaving zero records.
- [ ] DeleteDraftPin v1 inverse: placement + tag assignments + node hard-deleted, created note trashed, attached note left untouched; round-trip tests (CreatePin → inverse → clean state, revision +1 each).
- [ ] OS file drop on CanvasHost: multi-file drop → importAsset each → CreatePin at drop point (offset cascade for multiples); unsupported file (sniff rejection) → clear notice, no records; e2e asserts asset in managed storage + placement visible.
- [ ] Clipboard paste: raw image data and copied files via navigator.clipboard/paste event → same pipeline; places at cursor position when over canvas, else view center.
- [ ] Browser drag: image bytes imported directly with source page URL recorded on the asset when the drag provides it; e2e/unit covers attribution present.
- [ ] URL-only drop: main-process fetchUrlForImport (image content-type sniff, size cap, timeout); success → import with source_url; failure → visible error, zero records (asserted).
- [ ] CreatePinDialog: new node vs Place Existing branch; dot color, built-in icon set, or image (file pick → importAsset) with non-destructive crop/framing stored in appearance_crop; optional note title or existing-note picker (listNotes); tag assignment (existing + CreateTag for new); Create issues exactly one CreatePin.
- [ ] PlacementSourcePanel: node list (listNodeLibrary incl. Unplaced filter) drag-to-canvas → CreatePlacement (§6.3); zero-node note list → Place on Current Canvas → CreatePin dot+attach (§6.10, labeled dot appears).
- [ ] Node context menu: Attach Note (create/existing), Detach Note (AttachNoteToNode/DetachNoteFromNode), Make Note Independent with title prompt (MakeNoteIndependent).
- [ ] e2e import.spec.ts: §17 item-3 sweep (drop several, paste screenshot via CDP clipboard, browser-drag simulation incl. URL-only, unsupported rejection) + Create Pin with cropped image + note → label shows title.
- [ ] Full gates green: `pnpm -r build && pnpm -r --filter '!@ew/desktop' test && pnpm lint` and desktop e2e.

### Acceptance Criteria

**Scenario:** §6.1/§6.2 flows are transactional and attributed.
**GIVEN** an open project with an empty root canvas.
**WHEN** the user drops two images and pastes a screenshot.
**THEN** three assets exist in managed storage (dedupe respected) and three placements render at drop/paste points with natural aspect.
**WHEN** a URL-only drop fails to fetch.
**THEN** the user sees a clear error and asset/node/placement tables gain zero rows.
**WHEN** Create Pin commits a dot pin with a new note title and one tag.
**THEN** the command log gains exactly one CreatePin, the placement shows the title label, and executing the returned inverse removes the pin and trashes the note.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

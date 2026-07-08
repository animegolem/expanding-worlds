<!--
  One floating note panel (RFC §8.5, AI-IMP-064). The EPIC-005 pane's
  editing machinery ports here whole — CM6 controller, autosave/flush,
  §7.2 phantom flows, §7.7 rename + conflicts, §7.1 broken links,
  trash recovery — with only the container changing: tethered beside
  its node (dashed tail, tracks the camera, type at screen scale) or
  pinned screen-fixed. It KEEPS the note-pane testids: the panel is
  the note pane's realization, not its replacement.
-->
<script lang="ts">
  import { onMount } from 'svelte'
  import { uuidv7, titleKey } from '@ew/domain'
  import { itemWorldAABB } from '@ew/canvas-engine'
  import type { CanvasHostHandle } from '../canvas/host'
  import { importFilesAt } from '../canvas/import-surfaces'
  import { navigateTo } from '../chrome/navigation'
  import { tooltip } from '../chrome/tooltip'
  import { LinkResolution } from './link-resolution'
  import { NoteEditorController, type NoteRecord, type ProjectPort } from './note-editor'
  import {
    requestCreateAndPlace,
    requestOpenNote,
    requestOpenPhantom,
    requestRevealNote,
  } from './open-note'
  import {
    closePanel,
    DEFAULT_PANEL_SIZE,
    movePanel,
    openBigEditor,
    pinPanel,
    registerPanelFlush,
    registerPanelRename,
    resizePanel,
    setPanelAnchor,
    setPanelRequest,
    unpinPanel,
    type PanelRecord,
  } from './panels'
  import { createNoteProjectPort } from './project-port'
  import { runAsUndoGroup } from '../undo/undo-store'
  import { tetheredPanelOpacity, tetheredPanelScale } from '../chrome/feel'
  import { EW_BEAT_TEAR_MS, EW_BEAT_UNTAPE_MS } from '../chrome/beats'
  import { pageDegradeStage, type PageDegradeStage } from '@ew/canvas-engine'
  import BinderRings from './paper/BinderRings.svelte'
  import Tape from './paper/Tape.svelte'
  import TornEdge from './paper/TornEdge.svelte'
  import { setLandmarkFact, tornEdgeSide } from './paper/lifecycle'
  import {
    boundEdgeLength,
    chooseBindSide,
    pageBaseSize,
    ringCount,
    ringOffsets,
    RING_RADIUS,
    type BindSide,
  } from './paper/bound-geometry'
  import { openTagPanel } from '../tags/tag-panel'
  import TagAddField from '../tags/TagAddField.svelte'
  import { wikiLinkSuggestions } from './suggestions'
  import { wikiLinkActivation, wikiLinkDecorations } from './wiki-link-plugin'
  import { themeTokenValue } from '../theme'
  import TitleConflictDialog, { type TitleConflict } from './TitleConflictDialog.svelte'
  import UsesList, { type UsesData } from './UsesList.svelte'
  import MetadataCard, { type MetadataCardData } from './MetadataCard.svelte'

  interface PhantomView {
    titleKey: string
    title: string
    referenceCount: number
    sources: Array<{
      noteId: string
      noteTitle: string
      references: Array<{ linkId: string; displayText: string }>
    }>
  }

  const {
    handle,
    record,
    overlayHost = null,
  }: {
    handle: CanvasHostHandle
    record: PanelRecord
    /** §8.5 big editor: when NotePanels opens the overlay for THIS
     * panel it hands the mounted container down; the live CM buffer
     * moves there and comes home when it turns null again. */
    overlayHost?: HTMLElement | null
  } = $props()

  let editorHost = $state<HTMLElement | null>(null)
  let note = $state<NoteRecord | null>(null)
  let dirty = $state(false)
  let error = $state<string | null>(null)

  // §7.4 in-panel Uses list behind the "⌖ n places" header (065).
  let usesOpen = $state(false)
  let usesRefresh = $state(0)
  let activeCanvasId = $state<string | null>(handle.canvasId)
  let uses = $state<UsesData | null>(null)

  async function refreshUses(): Promise<void> {
    const current = paneController?.note?.id ?? null
    if (!current) {
      uses = null
      return
    }
    const response = await window.ew.project.query('getNoteUses', { noteId: current })
    if ((paneController?.note?.id ?? null) === current)
      uses = response.ok ? (response.result as UsesData) : null
  }

  // §7.8 metadata card (AI-IMP-119): the live read model below the
  // editor. Always recomputed — the in-app display never reads the
  // persisted (lazily-refreshed) block.
  let metadata = $state<MetadataCardData | null>(null)

  async function refreshMetadata(): Promise<void> {
    const current = paneController?.note?.id ?? null
    if (!current) {
      metadata = null
      return
    }
    const response = await window.ew.project.query('getNoteMetadata', { noteId: current })
    if ((paneController?.note?.id ?? null) === current)
      metadata = response.ok ? (response.result as MetadataCardData | null) : null
  }

  // The per-note toggle is presentation state (a project-tier setting,
  // no migration): flip it, then refresh so the card reflects the new
  // state. Toggling OFF stops future refreshes and strips the persisted
  // block at the next system touch (§7.8) — it does not rewrite the
  // body now.
  async function toggleMetadata(enabled: boolean): Promise<void> {
    const current = paneController?.note?.id ?? null
    if (!current) return
    await window.ew.settings.setProject(`note_metadata_note:${current}`, { enabled })
    await refreshMetadata()
  }

  // §8.5 place-on-board (AI-IMP-084): the note's node, when one
  // exists. Zero-node notes keep their §6.10 embodiment flow (Uses
  // list / outline); the control simply doesn't exist for them.
  let placeNode = $state<{ id: string; appearanceKind: string | null } | null>(null)

  async function refreshPlaceNode(): Promise<void> {
    const project = paneProject
    const current = paneController?.note?.id ?? null
    if (!project || !current) {
      placeNode = null
      return
    }
    try {
      const rows = await project.query<
        Array<{ id: string; noteId: string | null; appearanceKind: string | null }>
      >('listNodeLibrary')
      if ((paneController?.note?.id ?? null) !== current) return
      const candidates = rows.filter((row) => row.noteId === current)
      // A shared note may ride several nodes (§6.4): prefer the
      // panel's own anchor node, else the first.
      const anchored = candidates.find((row) => row.id === subjectNodeId())
      placeNode = anchored ?? candidates[0] ?? null
    } catch {
      placeNode = null
    }
  }

  /** §8.5 place-on-board (AI-IMP-084): one deliberate control, one
   * way — like phantom → note. ONE PlaceAsCard command (AI-IMP-086):
   * dots (and appearance-less nodes) flip to the §4.6 card
   * appearance while icon/image nodes place as-is — their look
   * already represents them — and the placement lands at the panel's
   * board-projected position, all in a single transaction with a
   * single undo step. Then the panel closes: the world owns it now. */
  async function placeOnBoard(): Promise<void> {
    const project = paneProject
    const current = paneController?.note
    const node = placeNode
    if (!project || !current || !node) return
    // The card prints the note as saved: flush the burst first (§10.2).
    await paneController?.flushPending()
    try {
      const world = handle.controller.camera.screenToWorld({
        x: pos.x + size.width / 2,
        y: pos.y + size.height / 2,
      })
      const placementId = uuidv7()
      const placed = await project.execute('PlaceAsCard', {
        nodeId: node.id,
        canvasId: handle.canvasId,
        placementId,
        x: world.x,
        y: world.y,
      })
      if (placed.status !== 'committed') {
        error =
          placed.status === 'error' ? placed.message : 'the project changed underneath (retry)'
        return
      }
      // §8.5 rev 0.55 (AI-IMP-135): a STICKY placed on the board is the
      // LANDMARK — it keeps the torn edge and wears the push pin. The
      // fact is presentation state riding the settings table (the ONE
      // PlaceAsCard command above stays the undo entry); the overlay
      // layer decorates the placement from it. An ordinary pinned
      // panel's place-on-board stays plain, exactly as before.
      if (record.tornFrom && record.anchor.kind === 'placement') {
        setLandmarkFact(placementId, {
          noteId: current.id,
          canvasId: record.anchor.canvasId,
          sourcePlacementId: record.anchor.placementId,
          label: record.anchor.label,
          tornFrom: record.tornFrom,
        })
      }
      closePanel(record.key)
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
    }
  }

  // §8.5: the panel surfaces its SUBJECT NODE's tags as chips; a
  // zero-node note shows none.
  let tagChips = $state<Array<{ id: string; name: string; color: string | null }>>([])
  // §4.8 rev 0.45 add-field: the subject NODE (placement-anchored
  // only) the completing field assigns to — a real note panel, never a
  // phantom. Held in state because subjectNodeId() reads non-reactive
  // controller items.
  let tagNodeId = $state<string | null>(null)

  function subjectNodeId(): string | null {
    if (record.anchor.kind === 'placement') {
      const anchor = record.anchor
      const item = handle.controller.items().find((candidate) => candidate.id === anchor.placementId)
      return item && item.itemKind === 'placement' ? item.nodeId : null
    }
    return null
  }

  async function refreshTagChips(): Promise<void> {
    const subject = subjectNodeId()
    // The add-field assigns only to a placement-anchored subject node
    // (never a phantom); the chip DISPLAY additionally covers the
    // canvas-phantom fallback for parity with the prior behavior.
    tagNodeId = subject
    const nodeId =
      subject ?? (record.request.kind === 'canvas-phantom' ? record.request.nodeId : null)
    if (!nodeId) {
      tagChips = []
      return
    }
    const response = await window.ew.project.query('listNodeTags', { nodeId })
    tagChips = response.ok
      ? (response.result as Array<{ id: string; name: string; color: string | null }>)
      : []
  }

  // §7.2 phantom view: a projection only.
  let phantom = $state<PhantomView | null>(null)
  let phantomDraft = $state('')
  let returnNoteId = $state<string | null>(null)
  let paneProject = $state<ProjectPort | null>(null)
  let paneController: NoteEditorController | null = null
  let draftTimer: ReturnType<typeof setTimeout> | null = null
  let materializing = false

  // §8.5 canvas phantom: nothing persists until the first committed
  // edit; the first line becomes the title (§6.2's rule).
  let canvasDraft = $state('')
  let canvasDraftTimer: ReturnType<typeof setTimeout> | null = null
  let canvasMaterializing = false

  async function openPhantom(title: string): Promise<void> {
    if (!paneProject || !paneController) return
    returnNoteId = paneController.note?.id ?? returnNoteId
    await paneController.close()
    note = null
    const view = await paneProject.query<PhantomView | null>('getPhantom', { titleKey: title })
    if (!view) {
      error = `no unresolved references to "${title}"`
      if (returnNoteId) requestOpenNote(returnNoteId)
      return
    }
    phantom = view
    phantomDraft = ''
    error = null
  }

  function dismissPhantom(): void {
    if (draftTimer !== null) clearTimeout(draftTimer)
    draftTimer = null
    phantom = null
    phantomDraft = ''
    if (returnNoteId) requestOpenNote(returnNoteId)
    else closePanel(record.key)
    returnNoteId = null
  }

  /** Materialize via CreateNote (§7.2 items 1–2). */
  async function materialize(body: string): Promise<void> {
    const project = paneProject
    const view = phantom
    if (!project || !view || materializing) return
    materializing = true
    if (draftTimer !== null) clearTimeout(draftTimer)
    draftTimer = null
    try {
      const noteId = uuidv7()
      const result = await project.execute('CreateNote', {
        noteId,
        title: view.title,
        ...(body.length > 0 ? { body } : {}),
      })
      if (result.status === 'committed') {
        phantom = null
        phantomDraft = ''
        returnNoteId = null
        requestOpenNote(noteId)
      } else if (result.status === 'error') {
        const found = conflictFrom(result, 'create', view.title)
        if (found) conflict = found
        else error = result.message
      } else {
        error = 'the project changed underneath (retry)'
      }
    } finally {
      materializing = false
    }
  }

  // First-edit materialization gets a LONGER idle window than note
  // autosave (AI-IMP-058).
  const PHANTOM_FIRST_EDIT_IDLE_MS = 4000

  function onDraftInput(): void {
    if (draftTimer !== null) clearTimeout(draftTimer)
    draftTimer = setTimeout(() => {
      draftTimer = null
      if (phantomDraft.trim().length > 0) void materialize(phantomDraft)
    }, PHANTOM_FIRST_EDIT_IDLE_MS)
  }

  function createAndPlace(): void {
    const view = phantom
    if (!view) return
    if (draftTimer !== null) clearTimeout(draftTimer)
    draftTimer = null
    const body = phantomDraft.trim()
    phantom = null
    phantomDraft = ''
    returnNoteId = null
    requestCreateAndPlace(view.title, body)
  }

  /** First-committed-edit materialization for the draft-first
   * phantoms. Canvas phantom (§8.5): ONE CreateNoteAndAttach
   * (AI-IMP-086) — note + attachment as a single transaction.
   * Pin phantom (§6.2, AI-IMP-067): ONE CreatePin — note + dot node
   * + placement as a single user-level transaction. Title = first
   * line; Escape or close before this and nothing ever existed. */
  async function materializeCanvasNote(): Promise<void> {
    const project = paneProject
    const request = record.request
    if (
      !project ||
      (request.kind !== 'canvas-phantom' && request.kind !== 'pin-phantom') ||
      canvasMaterializing
    )
      return
    const text = canvasDraft.trim()
    if (text.length === 0) return
    canvasMaterializing = true
    if (canvasDraftTimer !== null) clearTimeout(canvasDraftTimer)
    canvasDraftTimer = null
    try {
      const lines = text.split('\n')
      const title = lines[0]!.trim()
      const body = lines.slice(1).join('\n').trim()
      const noteId = uuidv7()
      if (request.kind === 'pin-phantom') {
        const placementId = uuidv7()
        const result = await project.execute('CreatePin', {
          nodeId: uuidv7(),
          canvasId: request.canvasId,
          placementId,
          x: request.x,
          y: request.y,
          appearance: { kind: 'dot', color: themeTokenValue('--ew-node-dot-default') },
          note: { kind: 'create', noteId, title, ...(body.length > 0 ? { body } : {}) },
        })
        if (result.status === 'error') {
          const found = conflictFrom(result, 'create', title)
          if (found) conflict = found
          else error = result.message
          return
        }
        if (result.status !== 'committed') {
          error = 'the project changed underneath (retry)'
          return
        }
        canvasDraft = ''
        // Provisional point → the real placement (anchor handoff).
        setPanelAnchor(record.key, {
          kind: 'placement',
          canvasId: request.canvasId,
          placementId,
          label: title,
        })
        setPanelRequest(record.key, { kind: 'note', noteId })
        return
      }
      // AI-IMP-086: one act, ONE command — a failed attach can no
      // longer strand a loose note reserving the title.
      const created = await project.execute('CreateNoteAndAttach', {
        nodeId: request.nodeId,
        noteId,
        title,
        ...(body.length > 0 ? { body } : {}),
      })
      if (created.status === 'error') {
        const found = conflictFrom(created, 'create', title)
        if (found) conflict = found
        else error = created.message
        return
      }
      if (created.status !== 'committed') {
        error = 'the project changed underneath (retry)'
        return
      }
      canvasDraft = ''
      setPanelRequest(record.key, { kind: 'note', noteId })
    } finally {
      canvasMaterializing = false
    }
  }

  function onCanvasDraftInput(): void {
    if (canvasDraftTimer !== null) clearTimeout(canvasDraftTimer)
    canvasDraftTimer = setTimeout(() => {
      canvasDraftTimer = null
      void materializeCanvasNote()
    }, PHANTOM_FIRST_EDIT_IDLE_MS)
  }

  // ---- §7.7 rename + title collisions (AI-IMP-047) ----

  let titleDraft = $state('')
  let conflict = $state<TitleConflict | null>(null)

  function conflictFrom(
    result: { code: string; details?: Record<string, unknown> },
    flow: TitleConflict['flow'],
    requestedTitle: string,
  ): TitleConflict | null {
    if (result.code !== 'NOTE_TITLE_CONFLICT') return null
    const details = result.details ?? {}
    return {
      flow,
      requestedTitle,
      existingNoteId: String(details['existingNoteId'] ?? ''),
      conflictingLifecycle: details['conflictingLifecycle'] === 'trashed' ? 'trashed' : 'active',
    }
  }

  async function commitTitle(): Promise<void> {
    const controller = paneController
    const current = controller?.note
    if (!controller || !current) return
    const title = titleDraft.trim()
    if (title.length === 0 || title === current.title) {
      titleDraft = current.title
      return
    }
    const result = await controller.rename(title)
    if (!result || result.status === 'committed') {
      error = null
      return
    }
    if (result.status === 'error') {
      const found = conflictFrom(result, 'rename', title)
      if (found) conflict = found
      else error = result.message
    } else {
      error = 'the project changed underneath (retry)'
    }
  }

  /** Rename routed here by the store because THIS panel holds the
   * note: flush first, whatever the surface (§10.2). */
  async function renameHere(noteId: string, title: string): Promise<void> {
    if (paneController?.note?.id === noteId) {
      titleDraft = title
      await commitTitle()
      return
    }
    await paneController?.flushPending()
    const project = paneProject
    if (!project) return
    // AI-IMP-182: one Mod+Z per rename gesture (RenameNote is GROUP_ONLY).
    const result = await runAsUndoGroup(() => project.execute('RenameNote', { noteId, title }))
    if (result.status === 'error') {
      const found = conflictFrom(result, 'rename', title)
      if (found) conflict = found
      else error = result.message
    }
  }

  async function restoreExisting(noteId: string): Promise<void> {
    const project = paneProject
    if (!project) return
    const result = await project.execute('RestoreRecord', { kind: 'note', id: noteId })
    if (result.status === 'error') error = result.message
    conflict = null
  }

  // ---- link activation + degraded links (§7.1/§7.3, AI-IMP-048) ----

  let brokenLink = $state<{
    displayTitle: string
    activeMatch: { id: string; title: string } | null
    trashedMatch: boolean
  } | null>(null)

  async function findByTitle(
    title: string,
  ): Promise<{ id: string; title: string; lifecycleState: string } | null> {
    const project = paneProject
    if (!project) return null
    const key = titleKey(title)
    const rows = await project.query<
      Array<{ id: string; title: string; titleKey: string; lifecycleState: string }>
    >('listNoteTitles')
    return rows.find((row) => row.titleKey === key) ?? null
  }

  async function activateBound(
    title: string,
    tokenRect?: { x: number; y: number },
  ): Promise<void> {
    const match = await findByTitle(title)
    if (!match) return
    requestOpenNote(match.id)
    if (match.lifecycleState === 'active')
      requestRevealNote(match.id, match.title, tokenRect)
  }

  async function activateBroken(title: string): Promise<void> {
    const match = await findByTitle(title)
    brokenLink = {
      displayTitle: title,
      activeMatch: match && match.lifecycleState === 'active' ? match : null,
      trashedMatch: match?.lifecycleState === 'trashed',
    }
  }

  async function resolveBroken(kind: 'create' | 'relink'): Promise<void> {
    const project = paneProject
    const source = paneController?.note
    const panel = brokenLink
    if (!project || !source || !panel) return
    const noteId = uuidv7()
    const payload =
      kind === 'create'
        ? { sourceNoteId: source.id, displayTitle: panel.displayTitle, create: { noteId, title: panel.displayTitle } }
        : { sourceNoteId: source.id, displayTitle: panel.displayTitle, targetNoteId: panel.activeMatch!.id }
    const result = await project.execute('RelinkBrokenLinks', payload)
    brokenLink = null
    if (result.status === 'error') {
      error = result.message
    } else if (kind === 'create' && result.status === 'committed') {
      requestOpenNote(noteId)
    }
  }

  async function restoreOpenNote(): Promise<void> {
    const controller = paneController
    const current = controller?.note
    const project = paneProject
    if (!controller || !current || !project) return
    const result = await project.execute('RestoreRecord', { kind: 'note', id: current.id })
    if (result.status === 'error') {
      error = result.message
      return
    }
    await controller.open(current.id)
  }

  // ---- panel physics (§8.5) ----

  let panelEl = $state<HTMLElement | null>(null)
  let pos = $state<{ x: number; y: number }>({ x: 0, y: 0 })
  /** §8.5 rev 0.31: tethered panels render at THE default (size is
   * null until pinned); a pinned panel wears its own size. */
  const size = $derived(record.size ?? DEFAULT_PANEL_SIZE)
  /** Tail endpoints in host coordinates, tethered-with-anchor only. */
  let tail = $state<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  let anchorGone = $state(false)
  /** §8.5 rev 0.47: a TETHERED panel anchored to a placement is world
   * content — it scales with the camera (transform-origin at the tether
   * corner) so it stays glued to its node at every zoom, fading below
   * the legibility floor. Pinned/corner/point/anchorless panels stay at
   * scale 1 (screen-fixed). Opacity is 1 whenever scale is 1. */
  let scale = $state(1)

  // §8.5 rev 0.55 (AI-IMP-134): an image-anchored tethered panel is THE
  // OPEN BOOK — the page binds to the image's side, sized to the shared
  // edge, flat, scaling with the world (scale = raw zoom, uncapped, so
  // the locked edge tracks the image at every zoom). `bound` gates the
  // whole presentation; non-image placements and anchorless notes keep
  // the tethered card above.
  let bound = $state(false)
  let boundSide = $state<BindSide>('right')
  /** The page's base (world-unit) size: the shared edge locked to the
   * image, the free axis at the default extent. */
  let pageBase = $state<PanelSize>({ ...DEFAULT_PANEL_SIZE })
  /** Shrink-ladder stage of the bound page, keyed on its rendered edge
   * (§8.2): full → rings, degraded → bound-edge stroke, hidden → fade. */
  let pageStage = $state<PageDegradeStage>('full')
  /** Binder-ring hardware straddling the seam, in screen space + world
   * units; null when the page is faded whole or not a book. */
  let ringMount = $state<{
    x: number
    y: number
    scale: number
    orientation: 'vertical' | 'horizontal'
    offsets: number[]
    edgeLength: number
    stage: PageDegradeStage
  } | null>(null)
  /** The side choice is made once per anchored image and held for the
   * panel's life on that image (§8.5); this caches which placement it
   * was made for so a re-anchor recomputes it. */
  let boundForPlacement = ''

  const opacity = $derived(bound ? (pageStage === 'hidden' ? 0 : 1) : tetheredPanelOpacity(scale))
  const faded = $derived(opacity === 0)
  const renderWidth = $derived(bound ? pageBase.width : size.width)
  const renderHeight = $derived(bound ? pageBase.height : size.height)
  /** Scale about the binding corner so the page stays glued to the
   * seam: top-left for a right/below binding, top-right for a left one. */
  const transformOrigin = $derived(bound && boundSide === 'left' ? '100% 0' : '0 0')

  function viewportSize(): { width: number; height: number } {
    const bounds = panelEl?.parentElement?.getBoundingClientRect()
    return { width: bounds?.width ?? 1280, height: bounds?.height ?? 800 }
  }

  function layout(): void {
    activeCanvasId = handle.canvasId
    const view = viewportSize()
    const width = panelEl?.offsetWidth ?? 320
    const height = panelEl?.offsetHeight ?? 240
    // Every branch below except the world-tethered placement one is
    // screen-fixed; reset the scale so a panel that was scaled (e.g. a
    // pin phantom that just became a placement, or the reverse) never
    // keeps a stale factor. `bound` resets too, so a swap away from an
    // image clears the open-book presentation.
    scale = 1
    bound = false
    ringMount = null
    if (record.pinned) {
      if (record.screen) pos = record.screen
      tail = null
      return
    }
    if (record.anchor.kind === 'placement' && record.anchor.canvasId === handle.canvasId) {
      const item = handle.controller
        .items()
        .find((candidate) => candidate.id === (record.anchor as { placementId: string }).placementId)
      const aabb = item ? itemWorldAABB(item) : null
      if (aabb) {
        anchorGone = false
        const camera = handle.controller.camera
        // §8.5 rev 0.55: an IMAGE placement's note is the OPEN BOOK —
        // the page binds to the image's side, sized to the shared edge.
        // Other placement kinds (dot, card, icon) keep the tethered
        // card below (their look already represents them; a bound page
        // to a dot's height would be absurd).
        //
        // Rotation gate (AI-IMP-135, PR-review finding): the binding
        // mounts to the image's AXIS-ALIGNED AABB, so on a rotated
        // image the rings read as floating beside the art rather than
        // gripping its edge. Until a rotated-book design exists, a
        // rotated image keeps the tethered card — the gate is live, so
        // rotating an open book mid-life drops it to the card and
        // rotating back re-binds it.
        if (item && item.appearanceKind === 'image' && item.rotation === 0) {
          layoutBoundPage(aabb)
          return
        }
        // §8.5 rev 0.47: scale with the world, glued at the tether
        // corner (transform-origin 0 0). The gap stays a constant screen
        // distance so the panel never crashes into the node, and the
        // footprint used for the in-window clamp is the SCALED size.
        scale = tetheredPanelScale(camera.zoom)
        const rightEdge = camera.worldToScreen({ x: aabb.x + aabb.width, y: aabb.y })
        let x = rightEdge.x + 24
        let y = rightEdge.y
        // Keep the panel inside the window; the tail stretches.
        x = Math.min(Math.max(8, x), view.width - width * scale - 8)
        y = Math.min(Math.max(8, y), view.height - height * scale - 8)
        pos = { x, y }
        const nodeEdge = camera.worldToScreen({
          x: aabb.x + aabb.width,
          y: aabb.y + aabb.height / 2,
        })
        // The tail leaves the panel's tether corner; 18px down the
        // header scales with the panel so it stays on the border.
        tail = { x1: x, y1: y + 18 * scale, x2: nodeEdge.x, y2: nodeEdge.y }
        return
      }
      anchorGone = true
    }
    if (record.anchor.kind === 'corner') {
      pos = { x: 12, y: view.height - height - 46 }
      tail = null
      return
    }
    if (record.anchor.kind === 'point' && record.anchor.canvasId === handle.canvasId) {
      const camera = handle.controller.camera
      const at = camera.worldToScreen({ x: record.anchor.x, y: record.anchor.y })
      let x = Math.min(Math.max(8, at.x + 20), view.width - width - 8)
      let y = Math.min(Math.max(8, at.y - 10), view.height - height - 8)
      pos = { x, y }
      tail = { x1: x, y1: y + 18, x2: at.x, y2: at.y }
      return
    }
    // Anchorless (zero placements / stale anchor): a calm default.
    pos = { x: view.width - width - 16, y: 56 }
    tail = null
  }

  /** §8.5 rev 0.55 (AI-IMP-134): position the OPEN BOOK. The page binds
   * to the image's side (chosen once, stable), locks its shared edge to
   * the image's rendered edge through the world-scale transform (scale =
   * raw zoom, so the edge tracks the image at every zoom), and mounts
   * the binder rings straddling the seam. Degrades per the shrink ladder
   * (rings → bound-edge stroke → whole-page fade). No tail — the binding
   * is the attribution. */
  function layoutBoundPage(aabb: { x: number; y: number; width: number; height: number }): void {
    const camera = handle.controller.camera
    const view = viewportSize()
    const image = { width: aabb.width, height: aabb.height }
    const topLeft = camera.worldToScreen({ x: aabb.x, y: aabb.y })
    const bottomRight = camera.worldToScreen({ x: aabb.x + aabb.width, y: aabb.y + aabb.height })
    const imageLeft = topLeft.x
    const imageTop = topLeft.y
    const imageRight = bottomRight.x
    const imageBottom = bottomRight.y
    const zoom = camera.zoom

    // The side is chosen once per anchored image and held (§8.8 region
    // math); a re-anchor to a different placement recomputes it.
    const placementId = (record.anchor as { placementId: string }).placementId
    if (boundForPlacement !== placementId) {
      boundSide = chooseBindSide({
        aspect: image.height > 0 ? image.width / image.height : 1,
        imageLeft,
        imageRight,
        viewportWidth: view.width,
      })
      boundForPlacement = placementId
    }

    pageBase = pageBaseSize(boundSide, image)
    scale = zoom

    const edgeLength = boundEdgeLength(boundSide, image)
    // The page's rendered shared edge drives the shrink ladder.
    const pageEdgePx = edgeLength * zoom
    pageStage = pageDegradeStage(pageEdgePx)

    if (boundSide === 'right') pos = { x: imageRight, y: imageTop }
    else if (boundSide === 'left') pos = { x: imageLeft - pageBase.width, y: imageTop }
    else pos = { x: imageLeft, y: imageBottom }

    if (pageStage === 'hidden') {
      ringMount = null
    } else {
      const offsets = ringOffsets(edgeLength, ringCount(edgeLength))
      const orientation = boundSide === 'below' ? 'horizontal' : 'vertical'
      const mountX = boundSide === 'left' ? imageLeft : boundSide === 'right' ? imageRight : imageLeft
      const mountY = boundSide === 'below' ? imageBottom : imageTop
      ringMount = { x: mountX, y: mountY, scale: zoom, orientation, offsets, edgeLength, stage: pageStage }
    }

    bound = true
    tail = null
    anchorGone = false
  }

  let frame = 0
  function schedule(): void {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      layout()
    })
  }

  function pinHere(): void {
    pinPanel(record.key, pos)
  }

  // ---- §8.5 rev 0.55 lifecycle transitions (AI-IMP-135) ----

  /** TEAR: the bound page rips out of its book and tapes itself to the
   * glass — the pin verb wearing paper (presentation flip + one-shot
   * beat; nothing persists). The sticky spawns where the page sat, kept
   * inside the window at the pinned default size. */
  function tearOut(): void {
    const view = viewportSize()
    pinPanel(
      record.key,
      {
        x: Math.min(Math.max(8, pos.x), view.width - DEFAULT_PANEL_SIZE.width - 8),
        y: Math.min(Math.max(8, pos.y), view.height - DEFAULT_PANEL_SIZE.height - 8),
      },
      { tornFrom: boundSide },
    )
    // The rings/tail clear inside layout(); without an explicit
    // reschedule the flip waits on the next camera/scene event —
    // which on CI's still environment never comes (the rings sat
    // for 15s and went red). untape() already did this.
    schedule()
  }

  /** UNTAPE: the sticky returns to its book — the tear reversed. The
   * record re-tethers and the next layout re-binds the page. */
  function untape(): void {
    unpinPanel(record.key)
    schedule()
  }

  /** The scar's edge on the sticky (the side that faced the binding). */
  const stickyEdge = $derived(record.tornFrom ? tornEdgeSide(record.tornFrom) : null)

  /** One-shot transition beat rider (§8.2 world beat budget): the store
   * stamps `record.beat` on a transition; this plays it exactly once
   * (seq-guarded) and clears the class when the ease terminates. Never
   * looping — the CSS animations run at the default iteration count 1. */
  let beatKind = $state<'tear' | 'untape' | null>(null)
  let playedBeatSeq = 0
  $effect(() => {
    const beat = record.beat
    if (!beat || beat.seq === playedBeatSeq) return
    playedBeatSeq = beat.seq
    beatKind = beat.kind
    const ms = beat.kind === 'tear' ? EW_BEAT_TEAR_MS : EW_BEAT_UNTAPE_MS
    const timer = setTimeout(() => (beatKind = null), ms)
    return () => clearTimeout(timer)
  })

  /** CENTERED TEAR (§8.5 rev 0.55): double-click on the bound page's
   * chrome tears it to the modal editor over the dimmed board. The CM
   * surface keeps its own double-click (word select), as do the header
   * controls — the page margins are the tear grip. */
  function onPageDblClick(event: MouseEvent): void {
    if (!bound || !note) return
    const target = event.target as HTMLElement
    if (target.closest('button, input, textarea')) return
    if (editorHost && editorHost.contains(target)) return
    openBigEditor(record.key, { torn: true })
  }

  /** While the page's buffer sits in the CENTERED editor, the bound
   * shell hides — the page is torn out, its spot in the book empty. */
  const tornOut = $derived(bound && overlayHost !== null)

  // §6.1 note-pane image drop (AI-IMP-097): a note surface is not an
  // embed target yet (that waits on AI-EPIC-018) — so an image dropped
  // on the panel imports through the ORDINARY pipeline onto the active
  // board, placed BESIDE the note's placement. World point per anchor
  // kind: a live placement → just right of its node; a provisional pin
  // point → the point itself; corner/anchorless/stale → the view
  // center. Text drops never reach here (we only claim file drags), so
  // CM keeps its own drop behavior.
  function imageDropWorld(): { x: number; y: number } {
    const camera = handle.controller.camera
    const anchor = record.anchor
    if (anchor.kind === 'placement' && anchor.canvasId === handle.canvasId) {
      const item = handle.controller.items().find((candidate) => candidate.id === anchor.placementId)
      const aabb = item ? itemWorldAABB(item) : null
      if (aabb) {
        const gap = 32 / camera.zoom // a constant screen gap, in world units
        return { x: aabb.x + aabb.width + gap, y: aabb.y }
      }
    }
    if (anchor.kind === 'point' && anchor.canvasId === handle.canvasId) {
      return { x: anchor.x, y: anchor.y }
    }
    const view = viewportSize()
    return camera.screenToWorld({ x: view.width / 2, y: view.height / 2 })
  }

  // Capture phase so we claim an image drop before CodeMirror sees it
  // (and stopPropagation keeps CM out of file drops entirely). A text
  // drag carries no 'Files' type, so we never preventDefault it — CM's
  // own drop stays live.
  function onSurfaceDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes('Files')) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
  }

  function onSurfaceDrop(event: DragEvent): void {
    const dt = event.dataTransfer
    if (!dt || dt.files.length === 0) return // not a file drop → leave to CM
    event.preventDefault()
    event.stopPropagation()
    const images = [...dt.files].filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) return // a non-image file: nothing to place
    const canvasId = handle.canvasId // gesture-time board (AI-IMP-085)
    void importFilesAt(handle, images, imageDropWorld(), canvasId, {
      x: event.clientX,
      y: event.clientY,
    })
    window.dispatchEvent(
      new CustomEvent('ew-board-notice', {
        detail: { message: 'Images live on the board — placed beside the note.' },
      }),
    )
  }

  // Header drag repositions pinned panels (§8.5: unpinning and
  // closing are the user's acts; dragging is just placement).
  function onHeaderPointerDown(event: PointerEvent): void {
    if (!record.pinned) return
    const target = event.target as HTMLElement
    if (target.closest('button') || target.closest('input')) return
    const start = { x: event.clientX, y: event.clientY }
    const origin = { ...pos }
    const onMove = (move: PointerEvent): void => {
      movePanel(record.key, {
        x: origin.x + (move.clientX - start.x),
        y: origin.y + (move.clientY - start.y),
      })
      schedule()
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Corner resize grip, pinned panels only (§8.5: pinning is what
  // makes it a proper window). Pointer-driven — CSS `resize` is not
  // reliable across platforms in Electron overlay layers.
  function onGripPointerDown(event: PointerEvent): void {
    if (!record.pinned) return
    event.preventDefault()
    event.stopPropagation()
    const start = { x: event.clientX, y: event.clientY }
    const origin = { ...(record.size ?? DEFAULT_PANEL_SIZE) }
    const onMove = (move: PointerEvent): void => {
      resizePanel(record.key, {
        width: origin.width + (move.clientX - start.x),
        height: origin.height + (move.clientY - start.y),
      })
      schedule()
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // §8.5 big editor handoff: the LIVE CodeMirror DOM moves to the
  // overlay container and back — never a second editor instance
  // against the same note (one buffer per note; §7.1 untouched).
  $effect(() => {
    const target = overlayHost
    const home = editorHost
    if (!paneController) return
    if (target) {
      paneController.reparent(target)
      paneController.focus()
    } else if (home) {
      paneController.reparent(home)
    }
  })

  const originLabel = $derived(
    record.pinned &&
      record.anchor.kind === 'placement' &&
      record.anchor.canvasId !== activeCanvasId
      ? record.anchor.label || 'origin board'
      : null,
  )

  function flyToOrigin(): void {
    if (record.anchor.kind !== 'placement') return
    void navigateTo(record.anchor.canvasId, record.anchor.label || 'Board')
  }

  // Focus pulse when an open request landed on this pinned panel.
  let pulse = $state(false)
  $effect(() => {
    if (record.focus > 0) {
      pulse = true
      const timer = setTimeout(() => (pulse = false), 700)
      return () => clearTimeout(timer)
    }
  })

  // ---- lifecycle ----

  onMount(() => {
    let controller: NoteEditorController | null = null
    let disposers: Array<() => void> = []
    let cancelled = false

    void (async () => {
      const { port, dispose } = await createNoteProjectPort()
      if (cancelled) {
        dispose()
        return
      }
      const resolution = new LinkResolution(port)
      controller = new NoteEditorController(port, {
        onNoteChanged: (current) => {
          note = current
          titleDraft = current?.title ?? ''
          error = null
          void resolution.refresh(current?.id ?? null)
          void refreshUses()
          void refreshMetadata()
          void refreshPlaceNode()
          schedule()
        },
        onDirtyChanged: (value) => (dirty = value),
        onError: (message) => (error = message),
        extensions: [
          wikiLinkDecorations(resolution),
          wikiLinkSuggestions(port),
          wikiLinkActivation((link) => {
            if (link.state === 'unresolved') requestOpenPhantom(link.title)
            else if (link.state === 'bound' || link.state === 'bound-trashed')
              void activateBound(link.title, link.tokenRect)
            else if (link.state === 'broken') void activateBroken(link.title)
          }),
        ],
      })
      paneProject = port
      paneController = controller
      if (editorHost) controller.mount(editorHost)

      const disposeRefresh = window.ew.project.onChanged(() => {
        void resolution.refresh(controller?.note?.id ?? null)
        void controller?.syncExternal()
        void refreshTagChips()
        void refreshUses()
        void refreshMetadata()
        void refreshPlaceNode()
        usesRefresh += 1
        const view = phantom
        if (view && paneProject) {
          void paneProject
            .query<PhantomView | null>('getPhantom', { titleKey: view.titleKey })
            .then((fresh) => {
              if (phantom?.titleKey === view.titleKey) phantom = fresh
            })
        }
      })
      void resolution.refresh(null)

      disposers = [
        dispose,
        disposeRefresh,
        () => {
          if (draftTimer !== null) clearTimeout(draftTimer)
          if (canvasDraftTimer !== null) clearTimeout(canvasDraftTimer)
        },
        registerPanelFlush(record.key, () => controller?.flushPending() ?? Promise.resolve()),
        registerPanelRename(record.key, (noteId, title) => void renameHere(noteId, title)),
        handle.controller.camera.onChanged(() => schedule()),
        handle.onSceneApplied(() => schedule()),
      ]
      applyRequest()
      void refreshTagChips()
      schedule()
    })()

    return () => {
      cancelled = true
      for (const dispose of disposers) dispose()
      if (frame) cancelAnimationFrame(frame)
      controller?.destroy()
    }
  })

  /** Load whatever the store asks this panel to show. */
  function applyRequest(): void {
    const request = record.request
    if (!paneController) return
    if (request.kind === 'note') {
      phantom = null
      void paneController.open(request.noteId)
    } else if (request.kind === 'phantom') {
      void openPhantom(request.title)
    } else {
      // canvas/pin phantom: empty draft; nothing persists yet.
      void paneController.close()
      note = null
      phantom = null
      canvasDraft = ''
    }
  }

  let lastRequest = $state<string>('')
  $effect(() => {
    const signature = JSON.stringify(record.request)
    if (signature !== lastRequest) {
      lastRequest = signature
      applyRequest()
      void refreshTagChips()
    }
  })
</script>

{#if tail}
  <svg class="tail" aria-hidden="true" style={`opacity:${opacity}`}>
    <line x1={tail.x1} y1={tail.y1} x2={tail.x2} y2={tail.y2} />
  </svg>
{/if}

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
  class="note-panel"
  class:pinned={record.pinned}
  class:bound
  class:bound-left={bound && boundSide === 'left'}
  class:bound-below={bound && boundSide === 'below'}
  class:pulse
  class:beat-tear={beatKind === 'tear'}
  class:beat-untape={beatKind === 'untape'}
  style={`left:${pos.x}px;top:${pos.y}px;width:${renderWidth}px;height:${renderHeight}px;transform:scale(${scale});transform-origin:${transformOrigin};opacity:${tornOut ? 0 : opacity};--panel-beat-ms:${beatKind === 'tear' ? EW_BEAT_TEAR_MS : EW_BEAT_UNTAPE_MS}ms;${faded || tornOut ? 'pointer-events:none;' : ''}`}
  data-testid={record.pinned ? `note-panel-pinned-${record.key}` : 'note-pane'}
  data-panel-key={record.key}
  data-tether-scale={scale}
  data-bound-side={bound ? boundSide : null}
  data-page-stage={bound ? pageStage : null}
  data-paper={record.tornFrom ? 'torn' : null}
  data-torn-out={tornOut ? 'true' : null}
  bind:this={panelEl}
  ondragovercapture={onSurfaceDragOver}
  ondropcapture={onSurfaceDrop}
  ondblclick={onPageDblClick}
>
  <header onpointerdown={onHeaderPointerDown}>
    {#if note && !phantom}
      <input
        class="title-input"
        data-testid="note-title-input"
        bind:value={titleDraft}
        onblur={() => void commitTitle()}
        onkeydown={(event) => {
          if (event.key === 'Enter') (event.currentTarget as HTMLInputElement).blur()
          if (event.key === 'Escape') {
            // AI-IMP-183 (M-09): discarding the rename must not leak to the
            // canvas host underneath (which would clear the selection).
            event.stopPropagation()
            titleDraft = note?.title ?? ''
          }
        }}
      />
      {#if dirty}<span class="dirty" data-testid="note-pane-dirty" title="Unsaved burst">●</span>{/if}
      <span hidden data-testid="note-pane-title">{note.title}</span>
      <!-- §7.4: the header always shows "⌖ n places"; clicking it
           unfolds the uses list in-panel. -->
      <button
        type="button"
        class="chrome-btn places"
        data-testid="uses-toggle"
        onclick={() => (usesOpen = !usesOpen)}
        use:tooltip={{ name: 'Places — where this note lives' }}
      >
        ⌖ {uses?.totalPlacements ?? 0}
      </button>
    {:else}
      <h2 data-testid="note-pane-title">
        {phantom ? phantom.title : record.request.kind === 'canvas-phantom' ? 'Canvas note' : 'Note'}
        {#if dirty}<span class="dirty" data-testid="note-pane-dirty" title="Unsaved burst">●</span>{/if}
      </h2>
    {/if}
    {#if originLabel}
      <button
        type="button"
        class="origin"
        data-testid="panel-origin"
        onclick={flyToOrigin}
        use:tooltip={{ name: `Fly to ${originLabel}` }}
      >
        ⌂ {originLabel}
      </button>
    {/if}
    {#if record.pinned && note && !phantom && placeNode}
      <!-- §8.5 escalation, final step: place-on-board materializes
           board content (a card for dot nodes) and closes the panel.
           One-way, like phantom → note. Pinned panels only — the
           tethered card's next step is the pin. -->
      <button
        type="button"
        class="chrome-btn"
        data-testid="panel-place-on-board"
        onclick={() => void placeOnBoard()}
        use:tooltip={{ name: 'Place on board — make this note board content' }}
      >
        ⤓
      </button>
    {/if}
    {#if note && !phantom}
      <button
        type="button"
        class="chrome-btn"
        data-testid="panel-expand"
        onclick={() => openBigEditor(record.key)}
        use:tooltip={{ name: 'Expand — big editor over the board' }}
      >
        ⤢
      </button>
    {/if}
    {#if record.pinned && record.tornFrom}
      <!-- §8.5 rev 0.55: the sticky's un-tape — the tear reversed; the
           page returns to its book (~200ms one-shot). -->
      <button
        type="button"
        class="chrome-btn"
        data-testid="panel-untape"
        onclick={untape}
        use:tooltip={{ name: 'Un-tape — return this page to its book' }}
      >
        ⤶
      </button>
    {/if}
    {#if !record.pinned}
      {#if bound}
        <!-- §8.5 rev 0.55: on the open book the pin verb IS the tear —
             the page rips out and tapes itself to the glass. -->
        <button
          type="button"
          class="chrome-btn"
          data-testid="panel-tear"
          onclick={tearOut}
          use:tooltip={{ name: 'Tear out — tape this page to the glass' }}
        >
          ⇱
        </button>
      {:else}
        <button
          type="button"
          class="chrome-btn"
          data-testid="panel-pin"
          onclick={pinHere}
          use:tooltip={{ name: 'Pin — keep this panel on screen' }}
        >
          ⇱
        </button>
      {/if}
    {/if}
    <button
      type="button"
      class="chrome-btn"
      data-testid={record.pinned ? `panel-close-${record.key}` : 'panel-close'}
      onclick={() => closePanel(record.key)}
      use:tooltip={{ name: 'Close' }}
    >
      ✕
    </button>
  </header>
  {#if tagNodeId && !phantom && paneProject}
    <!-- §4.8 rev 0.45: chips PLUS the completing add-field, shown for
         any placement-anchored (non-phantom) note even at zero chips. -->
    <div class="tag-chips" data-testid="panel-tag-chips">
      {#each tagChips as tag (tag.id)}
        <!-- §4.8 door 2: a chip opens THE tag panel anchored to itself. -->
        <button
          type="button"
          class="tag-chip"
          data-testid={`panel-tag-chip-${tag.id}`}
          style={tag.color ? `color:${tag.color}` : ''}
          onclick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            openTagPanel(tag.id, { x: rect.left, y: rect.bottom })
          }}
        >
          #{tag.name}
        </button>
      {/each}
      <TagAddField
        nodeId={tagNodeId}
        execute={(type, payload) => paneProject!.execute(type, payload)}
        onAssigned={() => void refreshTagChips()}
      />
    </div>
  {/if}
  {#if error}
    <p class="error" data-testid="note-pane-error">{error}</p>
  {/if}
  {#if note?.lifecycleState === 'trashed'}
    <div class="trash-banner" data-testid="note-in-trash">
      <span>In Trash — read-only</span>
      <button type="button" data-testid="note-restore" onclick={() => void restoreOpenNote()}>
        Restore
      </button>
    </div>
  {/if}
  {#if brokenLink}
    <div class="broken-panel" data-testid="broken-link-panel">
      <p>“{brokenLink.displayTitle}” was permanently deleted; this link is broken.</p>
      {#if brokenLink.activeMatch}
        <button type="button" data-testid="broken-relink" onclick={() => void resolveBroken('relink')}>
          Relink to “{brokenLink.activeMatch.title}”
        </button>
      {:else if brokenLink.trashedMatch}
        <p class="hint">A trashed note holds this title; restore it from Trash first.</p>
      {:else}
        <button type="button" data-testid="broken-create" onclick={() => void resolveBroken('create')}>
          Create Note from “{brokenLink.displayTitle}”
        </button>
      {/if}
      <button type="button" data-testid="broken-cancel" onclick={() => (brokenLink = null)}>
        Cancel
      </button>
    </div>
  {/if}
  <div
    class="editor"
    data-testid="note-editor"
    hidden={note === null}
    bind:this={editorHost}
  ></div>
  {#if (record.request.kind === 'canvas-phantom' || record.request.kind === 'pin-phantom') && !note && !phantom}
    <div
      class="canvas-phantom"
      data-testid={record.request.kind === 'pin-phantom' ? 'pin-phantom' : 'canvas-phantom'}
    >
      <p class="phantom-summary">
        {record.request.kind === 'pin-phantom'
          ? 'A pin marks a place — nothing saves until you write.'
          : 'This board has no note yet — nothing saves until you write.'}
      </p>
      <!-- svelte-ignore a11y_autofocus -->
      <textarea
        class="phantom-draft"
        data-testid={record.request.kind === 'pin-phantom'
          ? 'pin-phantom-draft'
          : 'canvas-phantom-draft'}
        placeholder="First line becomes the title…"
        autofocus={record.request.kind === 'pin-phantom'}
        bind:value={canvasDraft}
        oninput={onCanvasDraftInput}
        onblur={() => void materializeCanvasNote()}
        onkeydown={(event) => {
          if (event.key === 'Escape') {
            // AI-IMP-183 (M-09): closing the phantom draft must not also
            // clear the canvas selection underneath it.
            event.stopPropagation()
            closePanel(record.key)
          }
        }}
      ></textarea>
    </div>
  {/if}
  {#if phantom}
    <section class="phantom" data-testid="phantom-view">
      <p class="phantom-summary">
        Phantom note — {phantom.referenceCount}
        reference{phantom.referenceCount === 1 ? '' : 's'}, nothing saved yet.
      </p>
      <div class="phantom-actions">
        <button type="button" data-testid="phantom-create-note" onclick={() => void materialize(phantomDraft)}>
          Create Note
        </button>
        <button type="button" data-testid="phantom-create-and-place" onclick={createAndPlace}>
          Create and Place on Current Canvas
        </button>
      </div>
      <textarea
        class="phantom-draft"
        data-testid="phantom-draft"
        placeholder="Start writing to create this note…"
        bind:value={phantomDraft}
        oninput={onDraftInput}
      ></textarea>
      <h3>References</h3>
      <ul class="phantom-sources" data-testid="phantom-sources">
        {#each phantom.sources as source (source.noteId)}
          <li>
            <button
              type="button"
              class="phantom-source"
              onclick={() => requestOpenNote(source.noteId)}
            >
              {source.noteTitle}
              <span class="ref-count">{source.references.length}</span>
            </button>
          </li>
        {/each}
      </ul>
      <button type="button" class="phantom-dismiss" data-testid="phantom-dismiss" onclick={dismissPhantom}>
        Dismiss
      </button>
    </section>
  {/if}
  {#if note && !phantom && metadata}
    <MetadataCard data={metadata} {activeCanvasId} onToggle={(value) => void toggleMetadata(value)} />
  {/if}
  {#if usesOpen && note && !phantom && uses}
    <UsesList
      {uses}
      noteId={note.id}
      {activeCanvasId}
      herePlacementId={record.anchor.kind === 'placement' ? record.anchor.placementId : null}
    />
  {/if}
  {#if conflict}
    <TitleConflictDialog
      {conflict}
      onOpenExisting={(noteId) => {
        conflict = null
        requestOpenNote(noteId)
      }}
      onUseExisting={(noteId) => {
        conflict = null
        phantom = null
        phantomDraft = ''
        requestOpenNote(noteId)
      }}
      onRestoreExisting={(noteId) => void restoreExisting(noteId)}
      onChooseDifferent={() => (conflict = null)}
    />
  {/if}
  {#if record.pinned}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="resize-grip"
      data-testid="panel-resize-grip"
      aria-hidden="true"
      onpointerdown={onGripPointerDown}
    ></div>
  {/if}
</section>

{#if ringMount && !tornOut}
  <!-- §8.5 rev 0.55 (AI-IMP-134): the binder rings straddle the seam.
       A sibling of the page (not a child) so the page's overflow clip
       never eats the half that overlaps the image; mounted at the seam
       and scaled by zoom so the hardware rides the world with the page. -->
  <div
    class="binder-mount"
    style={`left:${ringMount.x}px;top:${ringMount.y}px;transform:scale(${ringMount.scale});transform-origin:0 0;opacity:${opacity}`}
    data-testid="binder-rings"
    aria-hidden="true"
  >
    <BinderRings
      orientation={ringMount.orientation}
      offsets={ringMount.offsets}
      radius={RING_RADIUS}
      edgeLength={ringMount.edgeLength}
      stage={ringMount.stage}
    />
  </div>
{/if}

{#if record.pinned && record.tornFrom && stickyEdge}
  <!-- §8.5 rev 0.55 (AI-IMP-135): the STICKY's paper hardware — tape
       over the top edge, the torn scar on the edge that faced the
       binding. A sibling of the panel (the tape straddles the top edge,
       which the panel's own overflow clip would eat); it rides the same
       position and plays the same beat so the two move as one body. -->
  <div
    class="sticky-hardware"
    class:beat-tear={beatKind === 'tear'}
    style={`left:${pos.x}px;top:${pos.y}px;width:${size.width}px;height:${size.height}px;--panel-beat-ms:${EW_BEAT_TEAR_MS}ms`}
    data-testid="sticky-hardware"
    aria-hidden="true"
  >
    <div class="sticky-tape" data-testid="sticky-tape"><Tape /></div>
    <div class={`sticky-scar scar-${stickyEdge}`} data-testid="sticky-torn-edge">
      <TornEdge side={stickyEdge} />
    </div>
  </div>
{/if}

<style>
  .tail {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }

  .tail line {
    stroke: var(--ew-paper-tail);
    stroke-width: 1.5;
    stroke-dasharray: 4 4;
    opacity: 0.75;
  }

  /* Size comes from the record via inline style: THE default while
     tethered, the panel's own size once pinned (§8.5 rev 0.31). The
     shadow is the depth cue — screen-space panels float above the
     world; board cards render flat. */
  .note-panel {
    position: absolute;
    display: flex;
    flex-direction: column;
    box-sizing: border-box; /* the record size IS the rendered size */
    min-height: 0;
    overflow: hidden;
    background: var(--ew-paper-surface);
    border: 1px solid var(--ew-paper-border-strong);
    border-radius: 9px;
    box-shadow: 0 6px 22px var(--ew-shadow);
    pointer-events: auto;
    z-index: 8;
  }

  .note-panel.pinned {
    border-color: var(--ew-paper-pinned-border);
    box-shadow: 0 10px 30px var(--ew-shadow);
  }

  /* §8.5 rev 0.55 (AI-IMP-134): the OPEN BOOK. World content — FLAT (no
     shadow; a shadow is the §8.5 depth cue, reserved for viewport-
     floating things). A square corner on the BINDING edge, rounded on
     the free edges; mirrored per side. The whole-page fade rides an
     opacity transition so it dissolves rather than pops. */
  .note-panel.bound {
    box-shadow: none;
    /* Bound RIGHT: square left (binding) edge, rounded right. */
    border-radius: 0 9px 9px 0;
    transition: opacity 200ms ease;
  }

  .note-panel.bound.bound-left {
    /* Square right (binding) edge, rounded left. */
    border-radius: 9px 0 0 9px;
  }

  .note-panel.bound.bound-below {
    /* Square top (binding) edge, rounded bottom. */
    border-radius: 0 0 9px 9px;
  }

  /* The binder-ring mount: an unclipped seam-anchored layer above the
     page and image; scaled by zoom via inline transform. */
  .binder-mount {
    position: absolute;
    width: 0;
    height: 0;
    overflow: visible;
    pointer-events: none;
    z-index: 9;
  }

  .note-panel.pulse {
    animation: panel-pulse 700ms ease-out 1;
  }

  @keyframes panel-pulse {
    0% {
      box-shadow: 0 0 0 0 var(--ew-focus-ring);
    }
    100% {
      box-shadow: 0 0 0 14px var(--ew-focus-ring-fade);
    }
  }

  /* §8.5 rev 0.55 lifecycle beats (AI-IMP-135): ONE-SHOT eases on the
     independent translate/rotate properties so they compose with the
     inline transform:scale() instead of stomping it. Iteration count 1
     always (§8.2: never ambient, never looping); duration rides
     --panel-beat-ms from the chrome/beats constants. Mid-flight the body
     wears --ew-drag-shadow — the §8.5 depth cue for a floating thing. */
  .note-panel.beat-tear {
    animation: panel-beat-tear var(--panel-beat-ms) ease-out 1;
  }

  @keyframes panel-beat-tear {
    0% {
      translate: -14px -8px;
      rotate: -2.5deg;
      box-shadow: var(--ew-drag-shadow);
    }
    100% {
      translate: 0 0;
      rotate: 0deg;
    }
  }

  .note-panel.beat-untape {
    animation: panel-beat-untape var(--panel-beat-ms) ease-out 1;
  }

  @keyframes panel-beat-untape {
    0% {
      translate: 12px 6px;
      rotate: 1.5deg;
      box-shadow: var(--ew-drag-shadow);
      opacity: 0.9;
    }
    100% {
      translate: 0 0;
      rotate: 0deg;
    }
  }

  /* The sticky's paper hardware layer: same footprint as the panel,
     unclipped so the tape straddles the top edge. Above the panel (its
     own z), inert to the pointer. */
  .sticky-hardware {
    position: absolute;
    overflow: visible;
    pointer-events: none;
    z-index: 9;
  }

  /* The hardware mirrors the panel's tear beat minus the shadow (paper
     scraps cast no shadow of their own). Un-tape clears tornFrom, so
     the hardware is gone before that reverse beat plays — the page
     alone carries it. */
  .sticky-hardware.beat-tear {
    animation: hardware-beat-tear var(--panel-beat-ms) ease-out 1;
  }

  @keyframes hardware-beat-tear {
    0% {
      translate: -14px -8px;
      rotate: -2.5deg;
    }
    100% {
      translate: 0 0;
      rotate: 0deg;
    }
  }

  .sticky-tape {
    position: absolute;
    top: -11px;
    left: 50%;
    width: 0;
    height: 0;
    overflow: visible;
  }

  /* The scar hugs the edge that faced the binding; TornEdge fills it. */
  .sticky-scar {
    position: absolute;
    overflow: hidden;
  }

  .sticky-scar.scar-left {
    left: 0;
    top: 0;
    bottom: 0;
    width: 10px;
  }

  .sticky-scar.scar-right {
    right: 0;
    top: 0;
    bottom: 0;
    width: 10px;
  }

  .sticky-scar.scar-top {
    left: 0;
    right: 0;
    top: 0;
    height: 10px;
  }

  header {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.4rem 0.45rem 0.25rem;
    cursor: default;
  }

  .note-panel.pinned header {
    cursor: grab;
  }

  .chrome-btn {
    flex: none;
    padding: 0 0.3rem;
    border: none;
    background: transparent;
    font: inherit;
    color: var(--ew-paper-text-muted);
    cursor: pointer;
  }

  .chrome-btn.places {
    font-size: 0.72rem;
    white-space: nowrap;
  }

  .origin {
    flex: none;
    max-width: 9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0.05rem 0.4rem;
    border: 1px solid var(--ew-paper-info-border);
    border-radius: 9px;
    background: var(--ew-paper-info-panel);
    color: var(--ew-paper-info-text);
    font-size: 0.7rem;
    cursor: pointer;
  }

  h2 {
    flex: 1;
    margin: 0;
    overflow: hidden;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ew-paper-text-heading);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .title-input {
    flex: 1;
    min-width: 0;
    padding: 0.1rem 0.3rem;
    border: 1px solid transparent;
    border-radius: 3px;
    background: transparent;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ew-paper-text-heading);
  }

  .title-input:hover,
  .title-input:focus {
    border-color: var(--ew-paper-border-focus);
    background: var(--ew-paper-page);
    outline: none;
  }

  .dirty {
    margin-left: 0.3rem;
    color: var(--ew-paper-dirty);
    font-size: 0.6rem;
    vertical-align: middle;
  }

  .tag-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 0 0.55rem 0.3rem;
  }

  .tag-chip {
    padding: 0 0.45rem;
    border: 1px solid var(--ew-paper-chip-border);
    border-radius: 8px;
    background: var(--ew-paper-chip-surface);
    color: var(--ew-paper-chip-text);
    font-size: 0.7rem;
    font-family: inherit;
    cursor: pointer;
  }

  .editor {
    flex: 1;
    min-height: 0;
    overflow: auto;
    font-size: 0.85rem;
  }

  /* A definite height, not content-sized: the writing surface is a
     real page (clicking the empty area below the last line lands the
     cursor at document end, as in the docked pane). The ProseMirror
     contenteditable (AI-IMP-146) fills whatever the size grants. */
  .editor :global(.ew-note-prose) {
    box-sizing: border-box;
    min-height: 100%;
    padding: 4px 8px;
    background: var(--ew-paper-page);
    outline: none;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    /* §7.1 editor scale (AI-IMP-131): the face + size + line-height ride
       the global .ew-note-prose rule in editor-face.css (which also
       reaches the big-editor overlay, where this .editor-scoped rule
       does not). Line-height is pinned to the token here only so the
       docked pane and the overlay read identically. */
    line-height: var(--ew-editor-line);
  }

  .editor :global(.ew-note-prose p) {
    margin: 0 0 0.5em;
  }

  /* §7.1 wiki-link states (rev 0.55): bound blue · unresolved purple ·
     trashed grey · broken red STRIKETHROUGH (wavy retired). */
  .editor :global(.ew-link) {
    cursor: pointer;
  }
  .editor :global(.ew-link--bound) {
    color: var(--ew-link-bound);
    text-decoration: underline;
    text-decoration-color: var(--ew-link-bound-decoration);
  }
  .editor :global(.ew-link--bound-trashed) {
    color: var(--ew-link-muted);
    text-decoration: underline dotted;
  }
  .editor :global(.ew-link--unresolved) {
    color: var(--ew-link-unresolved);
    text-decoration: underline dashed;
    text-decoration-color: var(--ew-link-unresolved-decoration);
  }
  .editor :global(.ew-link--broken) {
    color: var(--ew-link-broken);
    text-decoration: line-through;
    text-decoration-color: var(--ew-link-broken-decoration);
  }

  /* §7.2 `[[` completion popup (AI-IMP-147). Mounted on document.body so
     it escapes panel overflow — hence unscoped :global. NEVER a
     <datalist> (burned in hidden-window Electron). */
  :global(.ew-suggestions) {
    position: fixed;
    /* rung: popover (Z.popover = 500). Was a pre-ladder 40 that only
       worked while panels sat at 8; an anchored completion list
       outranks the panels it floats over. */
    z-index: 500;
    margin: 0;
    padding: 4px 0;
    list-style: none;
    min-width: 160px;
    max-width: 280px;
    max-height: 220px;
    overflow-y: auto;
    background: var(--ew-paper-page);
    border: 1px solid var(--ew-paper-border);
    border-radius: 4px;
    box-shadow: 0 4px 16px var(--ew-menu-shadow);
    font-size: 0.8rem;
  }
  :global(.ew-suggestion) {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 3px 10px;
    cursor: pointer;
  }
  :global(.ew-suggestion--active) {
    background: var(--ew-paper-hover);
  }
  :global(.ew-suggestion-detail) {
    color: var(--ew-paper-text-subtle);
    font-size: 0.72rem;
  }

  .canvas-phantom {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0 0.6rem 0.6rem;
  }

  .phantom {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-height: 0;
    padding: 0 0.75rem 0.75rem;
    overflow: auto;
  }

  .phantom-summary {
    margin: 0;
    color: var(--ew-link-unresolved);
    font-size: 0.8rem;
  }

  .phantom-actions {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .phantom-actions button,
  .phantom-dismiss {
    padding: 0.3rem 0.6rem;
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .phantom-draft {
    min-height: 6rem;
    padding: 0.4rem;
    border: 1px solid var(--ew-paper-border);
    border-radius: 3px;
    font: inherit;
    font-size: 0.85rem;
    resize: vertical;
  }

  .phantom h3 {
    margin: 0.25rem 0 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ew-paper-text-subtle);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .phantom-sources {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .phantom-source {
    display: flex;
    justify-content: space-between;
    width: 100%;
    padding: 0.25rem 0.4rem;
    border: none;
    background: transparent;
    font: inherit;
    font-size: 0.8rem;
    text-align: left;
    cursor: pointer;
  }

  .phantom-source:hover {
    background: var(--ew-paper-hover);
  }

  .ref-count {
    color: var(--ew-paper-text-muted);
  }

  .trash-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 0.5rem 0.25rem;
    padding: 0.3rem 0.5rem;
    background: var(--ew-paper-trash-surface);
    border: 1px solid var(--ew-paper-trash-border);
    border-radius: 4px;
    font-size: 0.78rem;
    color: var(--ew-paper-trash-text);
  }

  .trash-banner button,
  .broken-panel button {
    padding: 0.2rem 0.55rem;
    font: inherit;
    font-size: 0.78rem;
    cursor: pointer;
  }

  .broken-panel {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin: 0 0.5rem 0.25rem;
    padding: 0.4rem 0.5rem;
    background: var(--ew-paper-broken-surface);
    border: 1px solid var(--ew-paper-broken-border);
    border-radius: 4px;
    font-size: 0.78rem;
    color: var(--ew-paper-broken-text);
  }

  .broken-panel p {
    margin: 0;
  }

  .broken-panel .hint {
    color: var(--ew-paper-broken-muted);
  }

  .error {
    margin: 0.4rem 0.6rem;
    color: var(--ew-danger);
    font-size: 0.8rem;
  }

  .resize-grip {
    position: absolute;
    right: 2px;
    bottom: 2px;
    width: 14px;
    height: 14px;
    border-right: 2px solid var(--ew-paper-text-muted);
    border-bottom: 2px solid var(--ew-paper-text-muted);
    border-bottom-right-radius: 7px;
    opacity: 0.55;
    cursor: nwse-resize;
    touch-action: none;
  }

  .resize-grip:hover {
    opacity: 1;
  }
</style>

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
    type PanelRecord,
  } from './panels'
  import { createNoteProjectPort } from './project-port'
  import { openTagPanel } from '../tags/tag-panel'
  import { wikiLinkCompletion } from './suggestions'
  import { wikiLinkActivation, wikiLinkHighlighter } from './wiki-link-plugin'
  import { themeTokenValue } from '../theme'
  import TitleConflictDialog, { type TitleConflict } from './TitleConflictDialog.svelte'
  import UsesList, { type UsesData } from './UsesList.svelte'

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
      const placed = await project.execute('PlaceAsCard', {
        nodeId: node.id,
        canvasId: handle.canvasId,
        placementId: uuidv7(),
        x: world.x,
        y: world.y,
      })
      if (placed.status !== 'committed') {
        error =
          placed.status === 'error' ? placed.message : 'the project changed underneath (retry)'
        return
      }
      closePanel(record.key)
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
    }
  }

  // §8.5: the panel surfaces its SUBJECT NODE's tags as chips; a
  // zero-node note shows none.
  let tagChips = $state<Array<{ id: string; name: string; color: string | null }>>([])

  function subjectNodeId(): string | null {
    if (record.anchor.kind === 'placement') {
      const anchor = record.anchor
      const item = handle.controller.items().find((candidate) => candidate.id === anchor.placementId)
      return item && item.itemKind === 'placement' ? item.nodeId : null
    }
    return null
  }

  async function refreshTagChips(): Promise<void> {
    const nodeId =
      subjectNodeId() ?? (record.request.kind === 'canvas-phantom' ? record.request.nodeId : null)
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
    const result = await project.execute('RenameNote', { noteId, title })
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

  function viewportSize(): { width: number; height: number } {
    const bounds = panelEl?.parentElement?.getBoundingClientRect()
    return { width: bounds?.width ?? 1280, height: bounds?.height ?? 800 }
  }

  function layout(): void {
    activeCanvasId = handle.canvasId
    const view = viewportSize()
    const width = panelEl?.offsetWidth ?? 320
    const height = panelEl?.offsetHeight ?? 240
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
        const rightEdge = camera.worldToScreen({ x: aabb.x + aabb.width, y: aabb.y })
        let x = rightEdge.x + 24
        let y = rightEdge.y
        // Keep the panel inside the window; the tail stretches.
        x = Math.min(Math.max(8, x), view.width - width - 8)
        y = Math.min(Math.max(8, y), view.height - height - 8)
        pos = { x, y }
        const nodeEdge = camera.worldToScreen({
          x: aabb.x + aabb.width,
          y: aabb.y + aabb.height / 2,
        })
        tail = { x1: x, y1: y + 18, x2: nodeEdge.x, y2: nodeEdge.y }
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
          void refreshPlaceNode()
          schedule()
        },
        onDirtyChanged: (value) => (dirty = value),
        onError: (message) => (error = message),
        extensions: [
          wikiLinkHighlighter(resolution),
          wikiLinkCompletion(port),
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
  <svg class="tail" aria-hidden="true">
    <line x1={tail.x1} y1={tail.y1} x2={tail.x2} y2={tail.y2} />
  </svg>
{/if}

<section
  class="note-panel"
  class:pinned={record.pinned}
  class:pulse
  style={`left:${pos.x}px;top:${pos.y}px;width:${size.width}px;height:${size.height}px`}
  data-testid={record.pinned ? `note-panel-pinned-${record.key}` : 'note-pane'}
  data-panel-key={record.key}
  bind:this={panelEl}
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
          if (event.key === 'Escape') titleDraft = note?.title ?? ''
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
    {#if !record.pinned}
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
  {#if tagChips.length > 0 && !phantom}
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
          if (event.key === 'Escape') closePanel(record.key)
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
     cursor at document end, as in the docked pane). The panel now has
     an explicit height, so the page fills whatever the size grants. */
  .editor :global(.cm-editor) {
    height: 100%;
    background: var(--ew-paper-page);
  }

  .editor :global(.cm-editor.cm-focused) {
    outline: none;
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

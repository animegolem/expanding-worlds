# UI promises — the note-paper family

**STATUS: DRAFT rev 2 — nothing below binds until owner ratification.**
Second ledger of the observability contract, seeded from the
ratified record (RFC rev 0.73 §8.5/§8.8.5, Note Paper kit 1.6) and
reconciled against AI-EPIC-031's round-0 census (settled
2026-07-19): cards that bundled independently-failing outcomes are
split per the census markup. Grammar, binding rules, and finding
classes are the dock ledger's (`RAG/design/promises/dock.md`); they
are not repeated here.

Census verdicts carried into this revision: the below-calendar
horizontal seam is UNRULED (design-queued) — PROP cards bind the
side-bound case only; the kit's zoom-ruler specimen (50/100/200)
and shadowed bound/landmark drawings are STALE — ZOOM cards cite
the RFC's ratified 100/50/25/8, never the drawings.

---

## Cards

### NOTE-PROP-01 — The measure is sovereign
- STATE: a note bound beside its image (side-bound).
- STRESS: image aspects 1:1, 1:1.4, and an extreme tall portrait
  (≥1:3), at 960 and full width.
- PROMISE: the page's column width derives from its readable
  measure (~45–65ch at its own type size) and NEVER from the
  image's aspect — the needle case (a text column starved below
  minimum measure by a tall image) cannot be produced at any
  aspect.
- EVIDENCE: per-aspect screenshots + measured ch-width of the
  rendered column.
- (Below-calendar binding is out of scope until the horizontal-seam
  ruling lands — DESIGN-QUEUE 2026-07-19.)

### NOTE-PROP-02 — Equal-height bind, honest seam
- STATE: the same bound notes as PROP-01.
- STRESS: the same aspects.
- PROMISE: image and page share the same vertical height at every
  viewport; the torn edge sits on the side the page separated
  from; rings ride the shared seam.
- EVIDENCE: rects (heights equal within tolerance) + seam-side
  check + screenshot.

### NOTE-FLOAT-01 — The window hugs its content
- STATE: a note taped to the glass; a loose standard panel.
- STRESS: minimal content (one line) vs long content.
- PROMISE: the header/chrome bar spans the surface's full width;
  height hugs content up to its max — one line of text gets a
  one-line window, never reserved emptiness.
- EVIDENCE: rects at both content extremes.

### NOTE-FLOAT-02 — The floor stows, never traps
- STATE: the same floating surfaces as FLOAT-01.
- STRESS: resize toward and past small.
- PROMISE: the surface never shrinks below 240×140; at the floor,
  further shrink stows it — a book-derived sticky rebinds to its
  book, a tethered panel returns to its anchor, a loose panel
  closes with a transient chip naming its reopen doors (settled
  notes-census r2; provisional pending kit sitting). Reopening
  restores a usable size.
- EVIDENCE: at-floor interaction capture + stow destination +
  reopen check per opener class.

### NOTE-ZOOM-01 — World paper keeps its rungs
- STATE: one board holding a bound page and a landmark.
- STRESS: camera at 100 / 50 / 25 / 8%.
- PROMISE: world paper renders its ruled rung — live text →
  rings-only with text as texture → bound-edge stroke → dot
  census — skipping none (no text shrinking to noise, no rings
  past legibility). Landmark hardware (scar, pin) joins the ruler:
  at the dot rung nothing remains screen-clamped over a world
  object.
- EVIDENCE: the zoom-ruler strip reproduced live: one capture per
  rung per posture. (Rungs cite RFC §8.5; the kit specimen is
  stale — census 2026-07-19.)

### NOTE-ZOOM-02 — Glass never scales
- STATE: a sticky taped to the glass over the same board.
- STRESS: the same four camera rungs.
- PROMISE: the sticky's rendered size is identical at every
  camera zoom — glass, not world.
- EVIDENCE: sticky rect equality across all four rungs.

### NOTE-FLY-01 — The reading flight round-trips exactly
- STATE: a bound note, camera at arbitrary board zoom.
- STRESS: open from extreme zoom-out; close from mid-reading pan.
- PROMISE: the flight flies until image + page fill the viewport
  (240ms ease-out); esc/✕ restores the pre-open camera exactly
  (byte-equal transform).
- EVIDENCE: camera state before/after round-trip + mid-flight
  capture. (Shipped AI-IMP-296 — this card pins it against
  regression.)

### NOTE-FLY-02 — Opening IS the flight
- STATE: a bound note, closed.
- STRESS: open through every note door (double-click, charm,
  outline, search).
- PROMISE: opening the note starts the reading flight — no second
  "Read" click after the note is already open.
- EVIDENCE: door census: one action per door from closed board to
  reading camera. (Ticket held on the owner's tiny-image cap
  ruling — DESIGN-QUEUE.)

### NOTE-PANEL-01 — The standard panel and honest doors
- STATE: a note opened from the note charm (non-canvas note
  included, via the charm-bar door).
- STRESS: long note body; both densities; a note with multiple
  placements.
- PROMISE: the standard panel opens (the 1.5 wireframe ruling —
  not a bespoke surface) and scrolls its overflow INSIDE the page,
  never the board; every door passes the exact anchor it already
  knows (the charm never drops its selection's placement); a
  multi-placement note is never silently resolved to "the first" —
  ambiguity gets the chooser.
- EVIDENCE: panel anatomy capture + overflow scroll check + anchor
  fidelity census per door.

### NOTE-PANEL-02 — The panel obeys the floating-window law
- STATE: the standard panel, loose and pinned.
- STRESS: FLOAT-01/02's clauses applied to this surface.
- PROMISE: identical to FLOAT-01 + FLOAT-02 — one law, every
  window; pinned-to-glass paper carries tape + torn scar (paper
  identity — settled notes-census r2).
- EVIDENCE: the FLOAT evidence set repeated on this surface +
  hardware capture when pinned.

### NOTE-EDIT-01 — The big editor loses nothing
- STATE: double-click tears a bound page into the centered editor.
- STRESS: esc mid-edit; click-off with unsaved keystrokes.
- PROMISE: esc/click-off tucks the page back into its book with
  every keystroke preserved — the editor is never a data hazard.
- EVIDENCE: content round-trip diff.

### NOTE-EDIT-02 — Typing stays out of the structural stack
- STATE: cursor in any note editor, text modified.
- STRESS: Mod+Z mid-typing; structural undo after blur.
- PROMISE: note-body typing never enters the structural undo
  stack — Mod+Z defers to the editor while typing; structural
  undo resumes after leaving text focus.
- EVIDENCE: undo-stack census across the sequence. (Shipped law —
  pinned here because the family's tickets will churn near it.)

### NOTE-EDIT-03 — The board beneath is inert
- STATE: the big editor open over the dimmed board.
- STRESS: clicks, wheel, and chords aimed at board content beneath
  the scrim.
- PROMISE: the dimmed board is fully inert (the §8.8.6 swallow) —
  nothing beneath reacts while the editor holds the surface.
- EVIDENCE: beneath-inertness census.

---

## Findings ledger

(Empty until the family's wave runs; classifications per the dock
ledger's six-way scheme.)

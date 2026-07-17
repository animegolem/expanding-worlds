# UI promises — the note-paper family

**STATUS: DRAFT rev 1 — nothing below binds until owner ratification.**
Second ledger of the observability contract, seeded from the
ratified record (RFC rev 0.73 §8.5/§8.8.5, Note Paper kit 1.6)
ahead of AI-EPIC-031's census — cards will be reconciled against
the census deltas before cosign. Grammar, binding rules, and
finding classes are the dock ledger's
(`RAG/design/promises/dock.md`); they are not repeated here.

---

## Cards

### NOTE-PROP-01 — The measure is sovereign
- STATE: a note bound beside its image.
- STRESS: image aspects 1:1, 1:1.4, and an extreme tall portrait
  (≥1:3), at 960 and full width.
- PROMISE: the page's column width derives from its readable
  measure (~45–65ch at its own type size) and NEVER from the
  image's aspect — the needle case (a text column starved below
  minimum measure by a tall image) cannot be produced at any
  aspect.
- EVIDENCE: per-aspect screenshots + measured ch-width of the
  rendered column.

### NOTE-PROP-02 — Equal-height bind, honest seam
- STATE: the same bound notes as PROP-01.
- STRESS: the same aspects.
- PROMISE: image and page share the same vertical height at every
  viewport; the torn edge sits on the side the page separated
  from; rings ride the shared seam.
- EVIDENCE: rects (heights equal within tolerance) + seam-side
  check + screenshot.

### NOTE-FLOAT-01 — The sticky obeys the floating-window law
- STATE: a note taped to the glass.
- STRESS: minimal content (one line) vs long content; resize
  toward small.
- PROMISE: the header/chrome bar spans the sticky's full width;
  height hugs content up to its max (no reserved emptiness); the
  surface never shrinks below 240×140 — at the floor, further
  shrink stows it to its opener instead.
- EVIDENCE: rects at both content extremes + at-floor
  interaction capture.

### NOTE-ZOOM-01 — Every posture keeps its rung
- STATE: one board holding a bound page, a landmark, and a sticky.
- STRESS: camera at 100 / 50 / 25 / 8%.
- PROMISE: each posture renders its ruled rung — live text →
  rings-only with text as texture → bound-edge stroke → dot
  census — and the sticky NEVER scales (glass, not world). No
  posture skips a rung (no text shrinking to noise, no rings past
  legibility).
- EVIDENCE: the zoom-ruler strip reproduced live: one capture per
  rung per posture.

### NOTE-FLY-01 — The reading flight round-trips exactly
- STATE: a bound note, camera at arbitrary board zoom.
- STRESS: open from extreme zoom-out; close from mid-reading pan.
- PROMISE: ✎ flies until image + page fill the viewport (240ms
  ease-out); esc/✕ restores the pre-open camera exactly
  (byte-equal transform).
- EVIDENCE: camera state before/after round-trip + mid-flight
  capture. (Shipped AI-IMP-296 — this card pins it against
  regression.)

### NOTE-PANEL-01 — The non-bound panel exists and follows one law
- STATE: a note opened from the note charm (non-canvas note
  included, via the charm-bar door).
- STRESS: long note body; both densities.
- PROMISE: the standard panel opens (the 1.5 wireframe ruling —
  not a bespoke surface), obeys the floating-window law
  (FLOAT-01's clauses), and scrolls its overflow INSIDE the page,
  never the board.
- EVIDENCE: panel anatomy capture + overflow scroll check.

### NOTE-EDIT-01 — The big editor is a return, not a trap
- STATE: double-click tears a bound page into the centered editor
  over the dimmed board.
- STRESS: esc mid-edit; click-off with unsaved keystrokes.
- PROMISE: esc/click-off tucks the page back into its book with
  every keystroke preserved (the editor is never a data hazard);
  the dimmed board beneath is fully inert (the §8.8.6 swallow).
- EVIDENCE: content round-trip diff + beneath-inertness census.

### NOTE-EDIT-02 — Typing stays out of the structural stack
- STATE: cursor in any note editor, text modified.
- STRESS: Mod+Z mid-typing; structural undo after blur.
- PROMISE: note-body typing never enters the structural undo
  stack — Mod+Z defers to the editor while typing; structural
  undo resumes after leaving text focus.
- EVIDENCE: undo-stack census across the sequence. (Shipped law —
  pinned here because the family's tickets will churn near it.)

---

## Findings ledger

(Empty until the census and wave run; classifications per the
dock ledger's six-way scheme.)

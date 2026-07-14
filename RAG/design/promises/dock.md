# UI promises — the dock family

**STATUS: DRAFT — nothing below binds until owner ratification.**
Pilot ledger of the four-layer observability contract
(`RAG/design/DESIGN-LETTER-geometry-and-promises.md` §1). Cards
were drafted by both operators during the `ui-observability-pilot`
consultation (2026-07-13); authorship confers nothing — every card
is equally unbound until ratified here, in a visible diff.

## How to read a card

Fixed four-line grammar. The **title** is the observable.
**STATE** and **STRESS** reproduce it. **PROMISE** is the binding
sentence. **EVIDENCE** is non-normative (how it was last shown) —
with one exception: when a card is classified
*automated-regression candidate*, its EVIDENCE line becomes the
seed of the test spec and travels with the promotion. A card that
bundles independently-failing outcomes must split.

## Binding rules

- A promise binds only on owner ratification, recorded as a
  visible edit to this file — same rule as kit rulings.
- A wave is graded against the ratified ledger at its BASE commit.
  A promise edit landed within that same wave remains PROPOSED and
  cannot make that wave's evidence pass.
- An implementer may report **exception requested**, never grant
  one. An exception binds only via a ratified ledger edit citing
  the kit page or ruling it rests on. Failing evidence is captured
  regardless.
- Findings classify six ways: implementation defect · missing kit
  ruling · missing promise · exception requested ·
  automated-regression candidate · intentionally human.

## Scope note

Dock chrome is DOM; board content is out of scope for this pilot
(the world is one canvas element to the AX and DOM trees). When a
canvas-surface promise arrives, the seam extends via a read-only
`__ewDebug.screenBounds(id)` — never DOM handles planted over
world objects, which would alter hit testing and become a shadow
scene graph.

---

## Cards

### DOCK-GEO-01 — Viewport containment
- STATE: shape defaults open.
- STRESS: minimum supported width; widest shipped defaults row.
- PROMISE: the dock stack's visual bounds remain inside the
  viewport.
- EVIDENCE: screenshot + geometry(dock, viewport).

### DOCK-GEO-02 — Stable main-row anchor ⚠ OPEN DEPENDENCY
- STATE: toggle any defaults row.
- STRESS: compact and minimum widths.
- PROMISE: the main row's horizontal center remains the RULED
  center. **Pending:** the proportion-law queue item must rule
  whether "center" means the viewport center or the optical center
  within the reservation frame — the v0.25.0 feel pass contested
  exactly this (the left-shunt finding). This card does not bind
  until that ruling lands.
- EVIDENCE: before/after rects + screenshots.

### DOCK-GEO-03 — Defaults row does not displace the dock
- STATE: open and close each tool's defaults row.
- STRESS: repeated toggles; compact density.
- PROMISE: the main row's rect is identical before, during, and
  after — the defaults row grows upward from the dock's top edge
  and takes no space from the dock itself.
- EVIDENCE: before/after geometry(main-row) + screenshot. *(The
  live defect from the v0.25.0 feel pass — the card that should
  have existed.)*

### DOCK-LAYER-01 — Dock stays frontmost
- STATE: a note panel intersects the dock footprint.
- STRESS: pinned and free note postures.
- PROMISE: every dock hit target remains frontmost and operable.
- EVIDENCE: `elementsFromPoint` samples + screenshot. *(Feel pass:
  bars rendered beneath notes.)*

### DOCK-FLY-01 — Flyout escapes without reflow
- STATE: open a dock flyout.
- STRESS: each window edge.
- PROMISE: the flyout stays viewport-contained while the dock and
  reservation rects remain unchanged.
- EVIDENCE: before/after geometry.

### DOCK-FLY-02 — Hold-arming is observable
- STATE: press-and-hold the shape slot.
- STRESS: release below the arm threshold; hold past it.
- PROMISE: `data-armed` appears only past the threshold; a short
  press acts as the default-shape press — never a half-armed
  state.
- EVIDENCE: scripted holds at both durations + attribute reads.
  *(Whether the beat itself feels right in the hand is
  intentionally human.)*

### DOCK-FLY-03 — Flyout dismissal is clean
- STATE: flyout open.
- STRESS: click the board beneath; press the slot again.
- PROMISE: click-away closes the flyout without acting on the
  board beneath; re-pressing the slot is idempotent-open, never
  toggle-shut.
- EVIDENCE: `elementsFromPoint` at the click + state reads +
  absence of any board command.

### DOCK-STATE-01 — Eyedropper inert-with-why
- STATE: no eligible sample target.
- STRESS: fresh empty board.
- PROMISE: the eyedropper renders present but inert, with its why
  reachable on hover/focus — never hidden, never silently dead.
- EVIDENCE: screenshot + control-state read.

### DOCK-ROW-01 — Recents honor the width breakpoints
- STATE: recents populated past capacity.
- STRESS: each breakpoint (3/6/9).
- PROMISE: exactly the breakpoint's count shows — never a clipped
  partial swatch.
- EVIDENCE: geometry(recents) + screenshot per breakpoint.

### DOCK-HIT-01 — Hit targets hold at compact
- STATE: compact density.
- STRESS: minimum supported width.
- PROMISE: every dock control's hit target meets the kit minimum.
- EVIDENCE: geometry per control.

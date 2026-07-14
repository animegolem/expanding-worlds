# UI promises — the dock family

**STATUS: DRAFT rev 2 — nothing below binds until owner ratification.**
Pilot ledger of the four-layer observability contract
(`RAG/design/DESIGN-LETTER-geometry-and-promises.md` §1). Rev 1 was
drafted by both operators; rev 2 folds in Codex's full driver's-seat
markup (ui-observability-pilot r3, 2026-07-14), every grade-critical
claim spot-verified against shipped source by the lead. Authorship
confers nothing — every card is equally unbound until ratified here,
in a visible diff.

## How to read a card

Fixed four-line grammar. The **title** is the observable.
**STATE** and **STRESS** reproduce it. **PROMISE** is the binding
sentence. **EVIDENCE** is non-normative (how it was last shown) —
with one exception: when a card is classified
*automated-regression candidate*, its EVIDENCE line becomes the
seed of the test spec and travels with the promotion. A card that
bundles independently-failing outcomes must split (rev 2 split
three of rev 1's cards for exactly this).

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

## Ledger-wide open dependency: MINIMUM SUPPORTED WIDTH

"Minimum supported width" is currently UNDEFINED: the window
launches 1280×800 and `BrowserWindow` declares no
`minWidth`/`minHeight` (verified, `apps/desktop/src/main/index.ts`).
Cards naming a narrow stress cannot reproduce it until the owner
rules a minimum (or explicit specimen widths). 1280 is NOT silently
the minimum.

## Scope note

Dock chrome is DOM; board content is out of scope for this pilot
(the world is one canvas element to the AX and DOM trees). When a
canvas-surface promise arrives, the seam extends via a read-only
`__ewDebug.screenBounds(id)` — never DOM handles planted over world
objects. Until `__ewGeometry.inspect` ships, evidence is captured ad
hoc (`getBoundingClientRect`, `element(s)FromPoint`, DPR/zoom,
screenshots) — the seam makes bundles repeatable; it is not what
makes these facts knowable.

---

## Cards

### DOCK-GEO-01 — Window-edge margin ⚠ width ruling
- STATE: each defaults row (text, shape, line) open, both densities.
- STRESS: every ruled specimen width (pending the width ruling).
- PROMISE: every dock-stack edge stays at least 12 CSS px inside
  the window (the kit's chrome-to-edge minimum, not mere
  containment).
- EVIDENCE: stack + viewport rects, DPR/zoom, screenshot.

### DOCK-GEO-02 — Stable main-row anchor ⚠ proportion-law ruling
- STATE: toggle any defaults row.
- STRESS: compact and comfortable densities; ruled widths.
- PROMISE: the main row's horizontal center remains the RULED
  center. **Pending:** viewport center vs optical center within the
  reservation frame is exactly the unruled choice the v0.25.0 feel
  pass contested. Does not bind until that ruling lands.
- EVIDENCE: before/after rects + screenshots.

### DOCK-GEO-03 — Defaults row does not displace the dock
- STATE: open and close each defaults row (text, shape, line).
- STRESS: repeated tool switches; both densities.
- PROMISE: the main row's rect is identical before, during, and
  after — the defaults row grows upward from the dock's top edge
  and takes no space from the dock itself.
- EVIDENCE: before/during/after geometry(main-row) + screenshot.

### DOCK-GEO-04 — Reservation follows the defaults row
- STATE: each defaults row open, then closed.
- STRESS: repeated tool switches; both densities.
- PROMISE: opening a defaults row changes the declared dock
  reservation from 64 to 112 CSS px; closing restores 64, with no
  stale intermediate state (kit owns 64→112; shipped in
  `reservation.ts` / Dock root state).
- EVIDENCE: root attribute + reservation-frame readout + screenshot.

### DOCK-LAYER-01 — Main-row controls own their hit point
- STATE: a note panel overlaps the dock footprint.
- STRESS: pinned and free note postures.
- PROMISE: while engaged, each enabled main-row control is the
  FIRST hit-test owner at its center. Modals and takeovers are
  explicitly excluded — they are supposed to intercept.
- EVIDENCE: `elementsFromPoint` center samples + screenshot.
  (Action smoke-proof is separate material, not this geometry card.)

### DOCK-FLY-01 — Flyout containment
- STATE: open each shipped dock flyout (shape, font, color).
- STRESS: every ruled width and both densities.
- PROMISE: the flyout's rect remains inside the 12px window margin.
  (Synthetic four-edge anchors belong to the placement helper's
  unit test, not this live-surface card.)
- EVIDENCE: flyout + viewport rects + screenshot.

### DOCK-FLY-02 — Flyout does not reflow residents
- STATE: open, then close, each shipped flyout.
- STRESS: both densities.
- PROMISE: main-row and reservation rects are identical before,
  during, and after — the flyout escapes through the overlay
  without expanding or displacing the dock.
- EVIDENCE: before/during/after rects.

### DOCK-FLY-03 — Quick press arms the remembered face
- STATE: shape slot pressed and released before the hold threshold
  (~300ms), starting from Select.
- STRESS: repeated quick presses.
- PROMISE: `data-armed=true`, `data-flyout-open=false`, and the
  remembered glyph remains the slot's face.
- EVIDENCE: attribute reads + face glyph read.

### DOCK-FLY-04 — Hold boundary opens the flyout
- STATE: shape slot held across the threshold.
- STRESS: release at 299ms vs 300ms.
- PROMISE: at 299ms the flyout remains closed; at 300ms
  `data-flyout-open=true`. Release outside closes without changing
  the remembered face; picking a row arms that shape.
- EVIDENCE: scripted holds bracketing the boundary + state reads.
  (The state transition is automated-regression material — a pure
  unit-test foothold exists in `shape-flyout.ts`; whether the beat
  FEELS right stays intentionally human.)

### DOCK-FLY-05 — Re-press is idempotent-open
- STATE: flyout open; the slot is pressed again.
- STRESS: repeated re-presses mid-aim.
- PROMISE: the flyout stays open — never toggles shut. Authority:
  the post-oracle ticket ruling (AI-IMP-290), which SUPERSEDES the
  kit demo's inline toggle script.
- EVIDENCE: state reads across repeated presses.

### DOCK-FLY-06 — Outside dismissal acts nowhere beneath ⚠ MISSING RULING
- STATE: flyout open; pointer-down on the board beneath.
- STRESS: down on a placement vs empty ground.
- PROMISE (proposed): dismissal leaves the observable board state
  unchanged — scene census, selection, camera, active tool, and
  decorations identical. **Held:** the kit does not draw click
  swallowing for this flyout, and the shipped listener is window
  `pointerup` (the board sees `pointerdown` first). Binds only if
  the owner extends the AI-IMP-215 board-menu swallow precedent.
  "No command occurred" is deliberately NOT the phrasing — no
  read-only command-count seam exists.
- EVIDENCE: before/after scene census + selection + camera + tool.

### DOCK-STATE-01 — Eyedropper inert-with-why
- STATE: `window.EyeDropper` API absent (the actual disabled
  condition — an empty board is a valid sampling surface).
- STRESS: mouse hover and keyboard focus.
- PROMISE: the control remains present with `aria-disabled=true`;
  its accessible name and hover tooltip state why; activation
  changes no ink.
- EVIDENCE: control state + AX name + hovered tooltip screenshot.

### DOCK-ROW-01 — Surface windows show 3/6/9 from one MRU
- STATE: one deduped MRU color queue with ≥12 entries.
- STRESS: open each of the three doors (defaults-row swatches ·
  eyedropper recents menu · full picker).
- PROMISE: the doors show exactly 3, 6, and 9 entries respectively,
  from the same ordering, with no duplicate or partial swatch.
  (3/6/9 are SURFACE CAPACITIES, not width breakpoints — rev 1 had
  this wrong.)
- EVIDENCE: per-door swatch census + screenshots.

### DOCK-HIT-01 — Main-row hit targets hold at compact
- STATE: compact density.
- STRESS: every enabled main-row tool and zoom button.
- PROMISE: each has a hit rect at least 1.9rem square (the kit's
  explicit number for these controls; deliberately NOT applied to
  swatches, which the kit draws smaller).
- EVIDENCE: per-control rects.
- **Held companion:** a comfortable/44px card awaits the owner's
  ruling on how "comfortable" maps to the grammar's 44px touch
  density — shipped comfortable currently retains 64/112 and no
  button-size rule, which is either a missing implementation or a
  missing mapping. Not a defect until ruled.

---

## Findings awaiting owner ratification (with ROW-01/STATE-01)

- **Implementation defects (pre-convicted by card drafting, filed
  as tickets only after ratification):** no 6-color eyedropper
  recents menu exists (dock invokes the native sampler directly);
  the full picker renders its 9-grid PLUS a duplicate nested
  3-swatch row (`ui/ColorPicker.svelte:26-27`, lead-verified).
- **Missing rulings (owner):** minimum supported width · shape-
  flyout click swallow (AI-IMP-215 generalization) · comfortable ↔
  44px grammar mapping.
- **Regression candidates:** all geometry/state cards once the
  `__ewGeometry` seam exists; the FLY-04 boundary already unit-
  testable pure.
- **Intentionally human, permanently:** the ~300ms beat's feel;
  optical center once the proportion law rules; final visual
  polish.

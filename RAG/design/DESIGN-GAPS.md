# Design gaps — a letter to the design session

*From the lead-dev session, 2026-07-08. Maintained like
HUMAN-TESTING.md and DESIGN-QUEUE.md: the build side appends gaps
as it finds them; the design side (owner + the design-session
Claude) works the checklist down; every resolved item lands in the
kit/mockups, gets its box checked with a one-line pointer to where
it landed, and the lead folds any behavior ruling back into an
implementation ticket.*

> **FORMAT RULING (owner, 2026-07-09): the design push's focus is
> ONE "document of actions" — drawn UI lifecycles.** Not a stack of
> per-widget documents: for each user action, the full drawn arc —
> trigger surface → intermediate states → resting state → exit/undo
> (the beat the app plays at each step). The note lifecycle (caption
> card → reading → close) and the boards-being-born family (New
> board / Make-canvas) are the first two lifecycles; the checklist
> below is INPUT to that document — each item names the lifecycle it
> belongs to rather than earning its own doc. Prototypes like the
> Pin & Menu Motion Prototype remain the format for anything that
> moves.
>
> **The worklist:** `LIFECYCLE-INVENTORY.md` (beside this file) is
> the full 40-lifecycle code sweep — graded COMPLETE/FUNCTIONAL/
> BROKEN-ARC/UNDESIGNED, holes cited file:line, top-10 ranked. The
> document of actions draws that list down: BROKEN-ARC first.

Dear design session,

The app has been shipping faster than the kit. The result is a
class of drift the build side can't fix alone: controls that exist
in code but were never drawn, families the kit is silent on (so
restyle tickets stall at "STOP where kit silent"), and interaction
rulings that need a drawn answer, not a prose one. This is the
consolidated list. Items marked **(conversation)** also sit in
RAG/DESIGN-QUEUE.md because they need a decision before drawing;
the rest are pure drawing/spec work. Ticket numbers point at the
build-side carrier for each.

## The checklist

### Drawn-control gaps (code shipped, kit silent)

- [ ] **Shape tool hold-picker** (AI-IMP-190): PARTIALLY resolved —
      the flyout is ruled and drawn (kit push 2a: one slot, hold
      ~300ms, centers on the armed slot, pointer tail; 4×4 grid is
      the 3D-family graduation). REMAINING: the shape set's fill-out
      toward the Miro baseline (190's comparison table) is a ticket
      concern, not a drawing gap — fold at ticket update.

### Surface-anatomy gaps

- [ ] **Gallery inspector + reflow** (AI-IMP-204)
      **(conversation)**: single-click side panel (larger preview,
      provenance-first metadata, tags) and double-click full view —
      alph's Allusion pattern. The owner's named concern is the
      GRID REFLOW when the panel opens; needs the drawn layout at
      common window sizes. Candidate first conversation to include
      alph.
### Interaction rulings needing a drawn answer

- [ ] **Frame drop feel** (AI-IMP-197): how a drop target
      brightens, the cursor-based partial-overlap rule (with the
      §4.9 cross-check), and resize→reflow expectations.
- [ ] **Palette picker** (EPIC-025 pending, alph's feature ask):
      will need its surface drawn when the epic cuts — flagging
      early so it queues with the rest.

### Small tabled calls (one drawing or one line each, from
DESIGN-QUEUE)

- [ ] Dot-palette regularization to `oklch(.76 .09 h)` — decide on
      real art.
- [ ] Charm rail vertical position (top-aligned vs centered).
- [ ] Frame charm-bar crowding at deep nesting (revisit when
      frames see real use).
- [ ] Menus loose ends: reverse-image "find info" slot (End
      Session row copy resolved rev 0.70 Q4; Empty-trash confirm
      resolved — the Trash kit's burn ceremony).

## Resolved

*(All pointers below: the kit push of 2026-07-12,
`RAG/design/design-push/`, ratified RFC rev 0.71 — DESIGN-LETTER.md
carries the ruling numbers.)*

- [x] **The New-board verb** — B1 "A Board Is Born" lifecycle +
      Home Canvas kit; birth doors ruled rev 0.70, drawn 0.71.
- [x] **Make-canvas charm** — same B1 family; post-click = the
      dive (birth carry shipped in AI-IMP-283).
- [x] **Dock family** (AI-IMP-189 unblocked) — Home Canvas kit:
      toolbelt, defaults row 1d, resting/hover/active against
      board art.
- [x] **Beta-era controls sweep** — ruled retirement: picker-list /
      stepper / swatch-row + kit color picker replace every native
      (letter, "one voice" completion); eyedropper ⊙ added
      (lead-cosigned).
- [x] **Note paper, non-bound presentations** (AI-IMP-194
      unblocked) — Note Paper kit: four postures, hardware law,
      open-as-flight (letter rulings 8–9).
- [x] **The caption card** — Caption Card kit: the plaque (letter
      rulings 24/29; §4.5 visual maturation ratified 0.71).
- [x] **Right-rail membership** (AI-IMP-207 half 2) — rail table
      RULED 2026-07-11 (lens toggles only + ⚠ perch; ☰ to strip,
      board menu to the crumb/❖, ⌕ to the palette); every rail
      surface now has a kit.
- [x] **Arrange/normalize surface** (AI-IMP-198) — ⌗ rides the
      selection charm bar, grouped glyph-grid popover (letter
      ruling 7; panel wiring is a recorded kit debt).
- [x] **Tag REMOVE gesture** — chip ✕ ruled rev 0.70; shipped with
      suppression in AI-IMP-285.

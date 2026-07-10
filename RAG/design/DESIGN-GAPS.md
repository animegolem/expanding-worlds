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

- [ ] **The New-board verb** (AI-IMP-239, owner ruling 2026-07-09
      — "first-time creation is the miss"): there is no affordance
      for a fresh board; the model is fine (boards belong to
      nodes) but the journey needs sugar — one gesture: name it,
      Enter, you're inside. Needs drawing: the menu row's place in
      the §8.4 empty-board grammar (and whether the Board menu
      carries a twin), the naming moment (the 211 palette reused —
      does "New board" get distinct framing from note creation?),
      what the board-object placed on the origin board LOOKS like
      (frame-family? does it carry the caption card once that
      lands?), and the arrival beat on dive. Sibling of the
      Make-canvas charm item below — one drawing session should
      settle both, they are the same family (boards being born).

- [ ] **Make-canvas charm** (AI-IMP-208, owner M-ticket): the
      charm bar's Make-canvas button — the core recursive verb —
      never landed in the charm-bar mockup. Needs: glyph (code
      uses the frame glyph), bar order, disabled state, AND a
      post-click ruling — today the click is nearly silent (no
      dive, no beat; just a hint chip fading in). Candidates:
      dive immediately (matches Enter and the context menu), a
      make-room-family beat, or a legible chip arrival.
- [ ] **Dock family** (AI-IMP-189): the restyle ticket is scoped
      "restyle only, STOP where kit silent" — the kit is silent on
      most of the dock. Needs the dock family drawn: resting,
      hover, active, and how it sits against board art.
- [ ] **Beta-era controls still standing** (owner screenshots,
      2026-07-08): pre-kit UI controls coexist on screen with the
      new charm grammar (text tool charm called out explicitly).
      Needs a sweep ruling: which beta controls get kit drawings
      vs which retire into charms/menus.
- [ ] **Shape tool hold-picker** (AI-IMP-190): Photoshop-style
      hold-to-pick flyout needs its mockup (flyout anatomy, shape
      set — ticket carries the Miro comparison table).

### Surface-anatomy gaps

- [ ] **Note paper, non-bound presentations** (AI-IMP-194): The
      Two Materials defines the material; the panel mockups don't
      draw the folds/anatomy for the non-bound presentation the
      shipped panels use. 194 is blocked on the drawn answer.
- [ ] **The caption card** (alph + owner, 2026-07-09 — the note
      lifecycle's ambient tier; owner is drafting the full Note
      Lifecycle Document, this is the drawn half): a noted image
      and its caption must read as ONE object — a card/mat
      encasing both (Pinterest tile / polaroid band; alph: today's
      title is "disconnected text … hierarchically not clear";
      done = "it feels connected"). Needs drawing: the mat's
      anatomy (border weight, does it wrap all sides or shoulder
      the image like a book cover edge — owner's musing), the
      caption band (alignment — alph leans Pinterest left-align —
      cutoff rule, type scale), how the card stretches as the note
      expands toward reading, and its relationship to the existing
      §4.6 card appearance (likely this IS that, matured). Two
      Materials rules apply: the mat is paper.
- [ ] **Gallery inspector + reflow** (AI-IMP-204)
      **(conversation)**: single-click side panel (larger preview,
      provenance-first metadata, tags) and double-click full view —
      alph's Allusion pattern. The owner's named concern is the
      GRID REFLOW when the panel opens; needs the drawn layout at
      common window sizes. Candidate first conversation to include
      alph.
- [ ] **Right-rail membership** (AI-IMP-207 half 2)
      **(conversation)**: classify every rail surface (full-screen
      lens / overlay / anchored menu / card / OS window); owner
      hypothesis — only lens-changing toggles belong on the rail.
      Exclusivity is already ruled and building; the rail's drawn
      composition awaits this.

### Interaction rulings needing a drawn answer

- [ ] **Frame drop feel** (AI-IMP-197): how a drop target
      brightens, the cursor-based partial-overlap rule (with the
      §4.9 cross-check), and resize→reflow expectations.
- [ ] **Arrange/normalize surface** (AI-IMP-198): the verbs exist
      but are undiscoverable, and align-center collapses spreads;
      ticket carries the PureRef/Figma audit — needs the drawn
      home for these verbs.
- [ ] **Tag REMOVE gesture** (DESIGN-QUEUE, from AI-IMP-182): the
      command exists, no affordance issues it. Chip ✕ on the
      node's tag chips? Tag panel row action? One drawing settles
      a one-line wrap ticket. Same shape for the gallery bulk-bar
      and recognition-chip tag-ADD copies.
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
- [ ] Menus loose ends: reverse-image "find info" slot, End
      Session row copy, Empty-trash confirm shape.

## Resolved

(Move checked items here with a pointer to where they landed.)

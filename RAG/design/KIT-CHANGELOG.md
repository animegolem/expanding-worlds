# Design System kit — changelog

The kit zip supersedes IN PLACE (one tracked
`Expanding Worlds Design System <ver>.zip` + its standalone HTML);
git history keeps every prior byte, so there is no zip archive.
Each swap gets an entry here: the lead diffs the incoming version
against the outgoing one and records the delta before committing.
Ratifications still route kit → DESIGN-QUEUE → RFC rev — this file
is the version record, not the decision log.

Since rev 0.71 the versioned
`expanding-worlds-design-package-<ver>.zip` (design root; prior
versions in `archive/`) is the kit-document home — its swaps are
recorded in the second section below. Extracted `design-push-*/`
dirs stay local (gitignored); the zip is canonical.

## Design package (the rev 0.71 kit-document home)

### package 1.6 — 2026-07-16

- The code-lead 1.5-review letter answered in full, same day
  (letter addendum 16, rulings 41–46): minimum supported window
  width RULED at 960 (owner) — edges specimens drawn at 960 + full
  width; the click-swallow law ruled app-wide (design, under owner
  delegation) — any dismissing outside-click is swallowed, one law,
  no split; density becomes a TRIAD (owner) — compact ·
  comfortable (~36px controls, reservations unchanged) · touch
  (44px, strip 0, bands grow), only touch changing the frame; the
  floating-window law's second half — bar fills width, window hugs
  content, 240×140 minimum honest size, else stow-to-opener; THE
  PROPORTION LAW drawn as a law-tier lifecycle page (sovereign
  measure 45–65ch · optical centering · minimum-measure floor,
  tall-portrait specimen proving the needle cannot return under
  the equal-height bind); the geometry contract (I1–I8 + sovereign
  measure/sacrifice order/visual axis) added to KIT-PREFLIGHT;
  Note Paper kit closeout — postures live, edges + zoom-ruler
  specimens, settings sheet respecting the released rail band and
  carrying the density triad. Ratified into the RFC at rev 0.73.

### package 1.5 — 2026-07-16 (design session of 07-14/15)

- Ruling 40/8c, the takeover chrome migration (letter addendum 15,
  Panel Stow Wireframes turn 8): during a takeover the vertical
  rail RETIRES and the bottom band changes identity into the
  takeover's chrome (mode switcher + ⌕; the lead ruled the strip's
  universal ☰ never duplicates — kit's bar-☰ pending a small
  redraw); 240ms reset both ways; board mode untouched; rail band
  releases; takeover panels relax to right:24/bottom:64. Wired in
  Outliner/Gallery/Graph/Search kits + grammar §1/§5. Note Paper
  wireframes: postures RULED (fly to read · pin to the world ·
  tape to the glass; equal-height bind; torn edge on the separated
  side); zoom ruler becomes a mandatory specimen. Ratified into
  the RFC at rev 0.73 (with 1.6). Review note: the design session
  ran against a stale implementation map (thought phases C/D
  un-gated; they had shipped in v0.25.0) — harmless to the
  rulings; its 293-brief-amendment note was moot and ruling 40 is
  post-ship work instead.

### package 1.4 — 2026-07-13

- The 1.3 correction queue resolved in full (letter addendum 14,
  items 35–39): reservation tokens ADDED to kit chrome.css with
  strip RULED at the shipped 46; the charm-halo envelope drawn
  unambiguously (12px all sides, charm height bottom-only — future
  furniture amends the section first); the BARE input ruled as a
  scoped third variant (legal only inside kit-drawn composed
  surfaces — palette, tag field, big-editor title; standalone keeps
  the two-variant grammar); eyedropper glyph master shipped
  (assets/eyedropper.svg, ⊙ retired); preflights filled for Menu /
  Outliner / Caption Card / Settings; multi-select arrange demo +
  edge-clamp specimen in the Home Canvas kit; note-paper edges +
  zoom-ruler specimens landed. UN-GATES EPIC-029 phases C and D in
  full. No RFC delta — every ruling lands kit-side or confirms
  shipped values.

### package 1.3 — 2026-07-12

- Addendum 13 + `DESIGN-1.3-QUEUE.md`: the code lead's one-object
  correction list and the frame-wave round-1 deltas captured as the
  next design session's work list (eyedropper glyph master,
  reservation tokens into chrome.css + the strip 40-vs-46 ruling
  with 46 recommended, multi-select arrange demo, edge-case edges
  specimen, bare-variant ruling, unambiguous halo envelope; then
  phase-C/D preflights and note-paper debts). Round-1 ratifications
  recorded verbatim. No kit-page changes — phase A ships against
  1.2 + rulings.

### package 1.2 — 2026-07-12

- Settings sheet kit (density segment as a user-visible setting);
  the fzf palette grammar RULED + WIRED (letter 32; RFC §8.3);
  GR-5 intro/footer cosmetic fix. Internally "design-push 1.13".

### package 1.1 — 2026-07-12

- Lead one-object review applied (letter addendum 11): GR-5 §5–6
  proposal→ratified with the dim-never-gone floor and dock-slot
  seam; always-on corner dots; graph sim sleeps; tag-panel
  preflight filled; drag-out placeable-rows rule recorded.

### package 1.0 — 2026-07-12

- The kit push: full surface coverage (home canvas, note paper,
  gallery, search, graph, outliner + the addendum-8 batch),
  lifecycle docs incl. GR-5, Motion Ledger, KIT-PREFLIGHT system,
  DESIGN-LETTER rulings 1–29. Reviewed as one object; ratified as
  RFC rev 0.71.

## Design System kit

### 1.3 — 2026-07-11 (lead-reviewed; corrections applied)

- **The signature pin pass absorbed** (2026-07-07 branch): frameless
  shell (strip = drag handle), canonical pin silhouette iv
  (`assets/icons/pin-canonical.svg`), the signature spot, the
  bookmark beat (~700ms), the menu cascade (≤190ms, MenuPopover to
  adopt), the crowned app icon.
- **The lifecycle push rulings landed** (GR-1..4, ⊡ birth glyph,
  provisional pin ghost, T2 remove gesture + R6 suppression,
  MultiDropAsk default, armed-tool tooltip exit clause) with the
  lead-review corrections of 11 Jul (GR-4 scoped to user gestures;
  P2 ritual carries push-tags; GR-3 status header; iPad ledger
  P2+P5+P1 row). Ratified as RFC rev 0.70.
- **The motion ledger promoted with an axis grammar** (zoom = depth
  · slide = siblings · fade = takeovers; new rows dive · surfacing
  · carry · seat · burn · cascade).
- Companion documents tracked beside the kit: the iPad port delta
  and the lifecycle sequencing map.
- (Entry backfilled 2026-07-12 — it previously existed only in the
  bundle's convenience mirror.)

## 1.2 — 2026-07-07

- **The "One voice" control-geometry ruling** (answers the
  AI-IMP-142 consolidation finding): inputs keep exactly TWO
  variants as grammar — pill (999) = typing filters-in-place
  (search, tags, facets) · standard (5px) = typing configures
  (settings, dialogs, rename). Buttons collapse to ONE geometry —
  5px radius · 1px `--ew-border-control` · raised surface · hover
  lightens one step · disabled .4 — color variants riding it; the
  4px dialog and 6px variants retire by mechanical sweep. Focus is
  UNIFORM: 2px `--ew-focus-ring` outline, offset 1px, on every
  field and control — never the browser default (paper habitats
  keep `--ew-paper-border-focus`). Stragglers (CharmRail source
  prompt, gallery facets/action bar) migrate in a follow-up; the
  guard allowlist then shrinks to zero and becomes absolute.
- `Button.jsx`/`TextInput.jsx` reference components updated to the
  ruled shapes (5px, focus ring, disabled .4); STYLE-GUIDE §4
  carries the ruling; readme records it. Tokens unchanged.

## 1.1 — 2026-07-07

- **The beat ledger formalized** (from The Two Materials):
  `chrome.css` gains the full constant set — lift 120 · settle 150
  · nudge 40 · cover/tuck 200 · away 180 · glide-max 300 ·
  lift/press scale ±1% · strain 2px — plus the no-beat list and
  shrink-ladder constants; STYLE-GUIDE §6 rewritten as the
  every-mouse-down ledger with the honest-metaphor rule. New
  `guidelines/motion-beats.html`; kit re-verified against RFC rev
  0.55. Ratified into the RFC at rev 0.56.
- New `Design Kit Overview.html` + standalone kit page.

## 1.0 — 2026-07-07 (baseline)

- First kit: verbatim token mirror + additions (obj gradients,
  tape/torn paper, note headings, drag shadow), 23 reference
  components, guidelines set, six object-icon SVG masters, Maple
  Mono woff2 + OFL, ui-kit screens, adherence config, STYLE-GUIDE
  with ■ TECH build contracts. Ratified into the RFC at rev 0.55.

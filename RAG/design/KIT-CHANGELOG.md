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

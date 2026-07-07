# Design System kit — changelog

The kit zip supersedes IN PLACE (one tracked
`Expanding Worlds Design System <ver>.zip` + its standalone HTML);
git history keeps every prior byte, so there is no zip archive.
Each swap gets an entry here: the lead diffs the incoming version
against the outgoing one and records the delta before committing.
Ratifications still route kit → DESIGN-QUEUE → RFC rev — this file
is the version record, not the decision log.

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

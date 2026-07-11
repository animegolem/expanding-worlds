# Expanding Worlds — Design System

**Expanding Worlds** is an art-first, recursive reference-board / world-building **desktop app** (Electron + Svelte + WebGL canvas, Mac-lead). Think PureRef until you learn it nests: you place image references on an infinite board, any image can become a canvas of its own, notes attach to anything, wiki-links weave the world, and the global views (graph · outline · gallery) reveal you've been building a database all along. Product strategy is **composability** — each tool powerful but narrow, layers revealing one at a time. AI features are connectors, off by default.

One product/surface: **the desktop app**. No marketing site, no mobile.

## Sources (given for this pass)

- Codebase: mounted local folder `expanding-worlds/` (pnpm monorepo; `apps/desktop` is the app; renderer chrome is Svelte, canvas is WebGL).
- Canonical spec: `expanding-worlds/RAG/RFC-0001-Core-Note-Node-and-Canvas-Model.md` (rev ~0.48) — domain semantics AND ratified design decisions (§5 invariants, §8 chrome, §20 decision log).
- Design pass entry points: `expanding-worlds/RAG/design/Design-letter-3.md` (the current worklist + load-bearing constraints), `surface-coverage.html` (surface census), and `Design-Artifacts-v1.0.zip` → **Design Spec v2**, **UI Vision** (five hero states), **How It Works**, **Shell Wireframes** — extracted into `_src/extracted/` here.
- Canonical token file: `apps/desktop/src/renderer/theme.css` → copied verbatim to `tokens/theme.css`. Compiled component CSS reference: `_src/compiled-app.css`.

## Load-bearing design constraints (not taste — guard-tested in CI)

- **Theme tokens only.** A guard test fails the build on raw hex/rgba outside theme.css. Every color is an `--ew-*` token first.
- **The window is the board.** Chrome is minimal, floating, and NEVER reflows the canvas. No docked sidebar, no status strip, no tab bar. Errors are toasts; ongoing conditions use the ⚠ perch charm.
- **One physics rule: panels grow out of the control you pressed.** Everything anchors to its opener.
- **Engagement cadence:** ALL chrome fades on ONE shared clock (4s idle → 240ms fade). Any element fading independently is a bug. Chrome rests at 0.92 opacity; hover lights that control alone to 1. Node hint charms rest at 0.7.
- **Shadow = screen-space; flat = world content.** Panels/menus/dock float with shadows; board cards render flat (tiny 3px radius, soft drop only).
- **Tooltip rule:** every hoverable control names itself + prints its shortcut, one chip style app-wide, ~500ms delay. The GUI is the tutorial.
- **Never the word "file" in copy** (§6.5). Verbs: "Replace image…", "Swap for…". Where a noun is unavoidable: "item" ("node" is a docs/graph word).
- **Never `<datalist>`** (Electron segfault); all completion UIs are custom lists.
- Themes: **dark (default) · light · glass** (Mac-only, falls back dark). Grid: lines · dots · none. Flat canvas colors: porcelain/putty/slate/ink.

## CONTENT FUNDAMENTALS

- **Sentence-case everything**; no title case in UI. Short, lowercase-leaning labels: "bookmark this board", "＋ bookmark this board", "esc to return", "in trash", "2 selected", "⌕ filter…".
- **No jargon nouns.** Never "file" (tester feared deleting pictures off his drive — the app copies bytes, never touches his files). "Item" when unavoidable. Verbs over nouns: "Replace image…", "Swap for…", "open as source".
- **First-run teaching copy** is plain and warm: "imports COPY bytes — your files are never touched; one item lives many places."
- **Confirmations state impact as fact**, not warning: "this will affect 35 placements — are you sure?" Passive teaching, not friction.
- **Tooltips** = name + printed shortcut ("Zoom to fit", "Pin N"). Menus print shortcuts in mono.
- **No emoji.** Glyphs are unicode symbols (see ICONOGRAPHY). No exclamation marks, no marketing voice anywhere in-app.
- Example world-content voice (seed/demo flavor): fantasy worldbuilding — "Chieftain of the warren beneath the Northern Reach… Owes Yorren a life-debt he resents."

## VISUAL FOUNDATIONS

- **Color:** near-black blue-grey chrome (`#17191d` family) with translucent surfaces (rgba alphas 0.82–0.97 by layer); one blue accent `#4a9df0` (light: `#2b6cb0`); desaturated semantic colors (danger `#b3403a`, warn `#e6b34a`). **Paper palette** — notes are light "paper" even in dark theme (`--ew-paper-*`: #fafafa surface, #ffffff page). **Node dot palette** (8, theme-independent world content): blue teal green gold orange red purple pink. **Flat canvas swatches** (6, theme-independent): user board paint. Link colors: bound blue, unresolved purple, broken red (+50% alpha underline decorations).
- **Type:** system UI stack only, NO webfonts. Chrome type is small: 0.6–0.95rem. `ui-monospace` for shortcuts, tags (#tag), counts, zoom % (tabular-nums). Weight 600 for titles/active; no bolder.
- **Spacing:** rem-based, compact — 0.15/0.2/0.25/0.3/0.35/0.4/0.45/0.6/0.75rem paddings. Controls ~30px (1.9–2rem) square.
- **Radii:** board cards 3px · buttons/menu rows 4–5px · controls 6–7px · charms/menus/toasts 7px · rail charms 8px · panels/dock/note panels 9px · action bars 10–12px · chips/facets 999px (full pill).
- **Shadows:** depth = layer grammar. Panels `0 6px 22px var(--ew-shadow)` · pinned `0 10px 30px` · menus `0 10px 28px` · board nodes `0 8px 22px rgba(0,0,0,.3)`. No inner shadows.
- **Borders:** 1px everywhere, token-tiered (border → strong → panel → control). Selection = 2px accent **outline** offset 3px (no drawn handles, ever). Lens/tag hits use the note-orange outline.
- **Backgrounds:** the canvas is `--ew-surface-solid` + grid (44px 1px lines, or 26px dots, or none). Takeover views use a darker flat `--ew-surface-overlay`-like field. Glass theme adds `backdrop-filter: blur(16–22px) saturate(1.15)`.
- **Motion:** fades and single pulses only, ease-out, 120–240ms. Perch pulse 700ms once. Panel-arrive pulse = focus-ring halo expanding to transparent. NO bounces, NO infinite loops.
- **Hover:** background lightens one surface step (`--ew-surface-hover`/`-raised`); chrome opacity 0.92 → 1. Press/active: accent fill + `--ew-on-accent` ink. Disabled: opacity 0.4–0.45.
- **Transparency/blur:** surfaces are translucent rgba over the board; blur only in glass theme.
- **Imagery:** user's own art is the hero; UI stays neutral. Placeholders (wireframes) use muted repeating diagonal stripes. Seed art: 9 public-domain-style generated PNGs (3 in `assets/seed/`).

## ICONOGRAPHY

- **No icon font, no SVG icon set, no emoji.** Icons are **unicode glyphs** chosen per-surface: rail ⧉ ⌕ ⊛ ⊞ ▤ ☰ · dock ⬚ T ▭ ◯ △ ➤ ✎ ╱ ↗ ⌁ ◉ − + ⤢ · charm bar ⌗ ⇋ ⇵ # ⊘ · misc ⌂ ⌖ ⇱ ✕ ⚠ ⚯ ◎ ↺ ▸ ‹ ›.
- Two **drawn hint charms** (page/frame) are built from bordered divs, not glyphs — see `components/board/`.
- The **pin/teardrop** motif: "pins mean places, everywhere" — a circle with one zeroed corner (`border-radius:50% 50% 50% 0` rotated -45°), used by the bookmark button and the ◉ pin tool.
- One inline-SVG exception: the rotate cursor (in `tokens/theme.css`, a cursor bitmap, not chrome).
- **There is no logo or brand mark** in the sources. Render "Expanding Worlds" in plain type where a mark would go. Do not invent one.
- **App icon glyph set (undesigned):** six icon ids exist (star pin flag heart bolt leaf) but render as a generic diamond placeholder — deliberately not designed yet (Design letter #3, item 3).

## Index

- `styles.css` — global entry (imports the three token files below).
- `tokens/theme.css` — the canonical `--ew-*` palette, 3 themes (verbatim from app).
- `tokens/chrome.css` — feel numbers (fade clock, opacities), grid, shadows, radii.
- `tokens/typography.css` — font stacks + chrome type scale.
- `assets/seed/` — 6 seed artworks + license.
- `guidelines/` — foundation specimen cards (Design System tab).
- `components/` — chrome/ controls/ panels/ board/ feedback/ (see cards).

### Components

- **chrome/**: `Charm` (rail charm button), `CharmRail` (⧉ ⌕ ⊛ ⊞ ▤ ☰ + ⚠ perch), `Dock` (floating tool dock), `PathBar` (entry-route crumbs + bookmark teardrop), `MenuPopover` (anchored menu rows w/ shortcuts, sections, deferred), `TooltipChip` (the one tooltip style).
- **controls/**: `Button` (default/accent/ghost), `Segmented` (pill segments), `FacetChip` (filter pills + active-tag ✕ form), `TextInput` (never datalist), `TagChip` (#tag mono, paper/dark habitats).
- **panels/**: `Panel` (screen-space shell), `NotePanel` (paper note, tethered/pinned, origin label, ⌖ places), `WikiLink` (bound/unresolved/broken link spans).
- **board/**: `NodeCard` (placed node: flat, hint charms, selected/hit/dimmed), `HintCharm` (drawn page/frame), `CharmBar` (selection charm bar ⌗ ⇋ ⇵ | make-canvas note # ⊘).
- **feedback/** (all in Toast.jsx): `Toast` (base/error/success), `ActionBar` (bulk-select bar), `ModeSwitcher` (⊛ ▤ ⊞ takeover switcher), `ImportProgressStrip` (never modal), `RecognitionChip` (transient offer chip).
- `ui_kits/desktop/` — interactive recreation of the app's core screens.
- `_src/` — extracted source artifacts (Design Spec v2, UI Vision, How It Works, Shell Wireframes, compiled app CSS) — reference only, not shipped.

## Caveats / intentional notes

- Fonts: none to copy — the app uses platform stacks by design.
- The icon-glyph set for node appearances (star/pin/flag/…) is explicitly undesigned in the source; components render the shipped diamond placeholder.

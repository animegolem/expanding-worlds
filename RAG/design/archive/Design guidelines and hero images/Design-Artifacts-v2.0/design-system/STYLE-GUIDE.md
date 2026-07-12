# Expanding Worlds — Style Guide

The visual system with its engineering callouts, as one linked document. Compiled at RFC rev 0.54 + the 2026-07-06 design pass. Precedence: RFC > this guide > readme/v1 artifacts. Canonical token source stays `apps/desktop/src/renderer/theme.css` (mirrored at [tokens/theme.css](tokens/theme.css)) — every proposed token lands there first. `■ TECH` blocks are the build contract; `~` marks provisional numbers.

## 1 · The doctrine — [example](guidelines/doctrine.html)

**Chrome is a terminal; the world is a desk.** Chrome is flat, mono-flavored, translucent, self-effacing: unicode glyphs, flat chips, printed shortcuts, one shared fade clock. World content carries gentle materiality: object icons, taped paper notes with torn edges, small one-shot physical beats. The red glossy pin is the one object admitted into chrome adjacency — and it lives ON the paper (panel pin control), never in the rail, dock, or path, which keep the flat teardrop. Bigger elements are flashier; text stays focused and thin.

> ■ TECH · the raw-hex guard stands: every color becomes an `--ew-*` token in theme.css BEFORE use. Object-icon gradients, tape, and torn-paper are world-content colors — theme-independent, defined once like the dot palette. Nothing relaxes the occlusion contract (§8.8) or the engagement clock (§8.2).

## 2 · Color — [surfaces](guidelines/colors-surfaces.html) · [accent](guidelines/colors-accent.html) · [paper](guidelines/colors-paper.html) · [dots](guidelines/colors-node-dots.html) · [proposed](guidelines/colors-node-dots-proposed.html)

Chrome: near-black blue-grey surfaces in translucency tiers (0.82–0.97 alpha by layer), one blue accent (`#4a9df0` dark · `#2b6cb0` light), desaturated danger/warn. Notes are light paper on every theme. Links: bound blue · unresolved purple · broken red, each with a 50%-alpha underline token. World content (theme-independent): 8 node dots, 6 canvas flats — and the object materials. Dot regularization to `oklch(.76 .09 h)` proposed, unratified.

> ■ TECH · tokens to ADD:
> - `--ew-void-surface`: runtime-derived — `color-mix(in oklab, [effective board color] ~78%, black)`; never a raw hex. Void grid = grid-line alpha × ~0.4. Void OFF on glass.
> - `--ew-tape-surface: rgba(214,205,182,.6)` · `--ew-tape-border: rgba(160,150,125,.4)` · `--ew-paper-torn: #f7f3ea`
> - `--ew-obj-{name}-hi/-lo` gradient pairs: blue `a8cbe8/6b9cc4` · gold `f2d878/d9ab2e` · red `f0847c/c0392f` · pink `e8b0d4/c46a9e` · orange `eec08a/c87d3e` · green `aad494/6f9e58`; stroke = `-lo` darkened ~20%; gloss `rgba(255,255,255,.4–.45)`.
> - Note headings: `--ew-note-h1 #2b6cb0` · `--ew-note-h2 #3b8a7d` · `--ew-note-h3 #9c7f2e` (~).

## 3 · Type — [chrome scale](guidelines/type-scale.html) · [editor face](guidelines/type-editor.html)

Chrome stays the platform stack, small: charm 1rem · tool .95 · toast/panel-base .85 · panel .78 · menu .75 · chip .7 · micro .62 ([tokens/typography.css](tokens/typography.css)). Mono for shortcuts, tags, counts; weight 600 max. **The one carve-out: note text is Maple Mono** — kerned, rounded, true cursive italics — loud colored headings, org-style folding presentation over the plain-Markdown carrier.

> ■ TECH · `--ew-font-editor: 'Maple Mono', ui-monospace, Menlo, monospace`. BUNDLE woff2 400/400i/700 (OFL license alongside); never fetched at runtime. Editor scale (~): body .85rem/1.65 · h1 1.15rem/700 · h2 1rem/700 · h3 .9rem/700, colored per §2. Applies to note panels, big editor, card excerpts, gallery text posts; NOWHERE in chrome.

## 4 · Space, shape, borders

Compact rem paddings (.15–.75); controls ~30px square. Radii tiers: board cards 3 · buttons/menu rows 4–5 · controls 6–7 · charms/menus/toasts 7 · rail charms 8 · panels/dock 9 · action bars 10–12 · chips 999. Borders 1px, token-tiered. Selection = 2px accent outline offset 3px, never handles. The bound page keeps a square corner on its binding edge.

> ■ TECH · `--ew-node-radius: 3px` stands. Bound page: `border-radius: 0 9px 9px 0` (mirrored opening left); binder rings ~11px, 2px stroke `--ew-text-muted`, punched (fill = board color), straddling the seam. Frame title sits ON the frame's top edge (item labels never do — position is the tell); frame furniture draws only past a rendered-size threshold (charm rule).

## 5 · Depth — [panels](components/panels/panels.card.html)

Shadow = screen-space; flat = world content. Panels `0 6px 22px` · pinned `0 10px 30px` · menus `0 10px 28px` ([tokens/chrome.css](tokens/chrome.css)). **New: floating things cast shadows** — anything torn off or riding a drag (mid-tear note, drag ghost, place cursor) picks up a shadow exactly while it floats.

> ■ TECH · add `--ew-drag-shadow: 0 12px 26px rgba(0,0,0,.5)` (~); on at drag/tear start, off on settle.

## 6 · Motion

Two budgets. **Chrome:** fades and single pulses only, ease-out, 120–240ms, one clock. **World:** small one-shot physical beats — tear, bloom, stage edge, (mused) book-cover open. One beat per user act; never ambient, never looping.

> ■ TECH · shipped (feel.ts / [tokens/chrome.css](tokens/chrome.css)): fade-delay 4000ms · fade 240ms · chrome-rest .92 · hint-rest .7 · tooltip 500ms · toast 6000ms · perch-pulse 700ms once. ADD: `EW_BEAT_TEAR_MS ~300` · `EW_BEAT_BLOOM_MS ~240` · `EW_BEAT_STAGE_EDGE_MS ~180` · `EW_BEAT_COVER_MS ~200` (musing). Guard idea: iteration-count ≠ 1 outside the interaction layer fails review.

## 7 · The z-ladder (§8.8)

World content → canvas affordances → note panels → takeover → chrome/source panel → anchored popovers → modal → notices → tooltip. Modals mount at the root host; everything anchored clamps via one shared helper; corner chrome declares reserved bands; flights reserve space for what they open; chrome never occludes what it annotates.

> ■ TECH · export `Z = { world:0, affordance:100, panel:200, takeover:300, chrome:400, popover:500, modal:600, notice:700, tooltip:800 }` (names normative); guard fails any literal z-index. The centered torn-off note is a MODAL-rung tenant with a scrim; its scroll never reaches the board.

## 8 · Iconography — [objects](guidelines/icons-objects.html) · [chrome](components/chrome/chrome.card.html)

Chrome glyphs stay unicode per surface: rail `⧉ ⌕ ⊛ ⊞ ▤ ☰ (+⚠)` · dock `▸ T ▭ ✎ ╱ ↗ ⌁ ◉ − % + ⤢` · charm bar `⌗ ⇋ ⇵ | swatch ▦ ▤ # ⊘`. Hint charms stay drawn bordered-divs. The teardrop means "place" everywhere — flat in chrome, glossy object on paper. The six node icons are the painted object set, degrading to the plain dot below ~8px rendered size.

> ■ TECH · icons render in the WebGL canvas: bake object glyphs to a texture atlas (SVG → raster at 2–3 sizes) or geometry; one color token tints dot and icon alike. Below ~8px, swap to the dot. Objects show in the switcher popover at chrome size but remain world assets.

## 9 · Component rules digest — [tooltips](guidelines/tooltip-shapes.html) · [stage/void](guidelines/stage-void.html)

- **Notes:** the bound page's height EXACTLY matches its image (a book; width is the free variable); rings on the seam; corner controls identical everywhere (⌖ · pin · ⤢); tethered never resizes, scales with the world; pin = the tear (tape + torn edge persist); pinned resizes, past a threshold → big editor; double-click tears to center over a dimmed board, scroll stays inside.
- **Tooltips:** five legal shapes only — name+shortcut · name-only · disabled-with-reason · state-with-exit · coming-soon. One chip, 500ms, clamp-and-flip.
- **Search track:** ⌕ icon → bar → committed terms crystallize into pills (AND, booru-style) → trailing ✕ clears all → double-click melts pills back to text; empty collapses to the icon.
- **Frames:** title + sort chip ON the top edge, zoom-gated; grid · rows · float; fresh frames default sorted; only item drags across the boundary edit membership.
- **Settings:** trailing fold carets; "this world" chips on project-tier rows; Advanced reveals store → AI; git native, other storage = connectors.
- **Gallery:** scope toggle · facets incl. inbox + low quality · bucketed time, header-as-jump · size slider · Space = Quick-Look peek · import strip centered above the action bar.

## 10 · Copy

Sentence case. Never "file" — the app copies bytes and must never imply it could touch the user's drive; "item" where a noun is unavoidable. Verbs over nouns: Replace image… · Swap for… · open as source · pull into this world. Confirmations state impact as fact. Tooltips teach; menus print shortcuts; no emoji, no exclamation marks, no marketing voice.

---

Change control: this guide absorbs ratified decisions only; explorations live in the satellite documents; amendments route Design-Team-Letter-1 → DESIGN-QUEUE → RFC rev bump → here.

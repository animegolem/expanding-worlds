# Letter to the designer — the style kit turn

From the design pass (2026-07-06/07), to whoever holds the pen next.
You're inheriting a system that is DECIDED in shape and OPEN in craft.
This letter is your orientation; `Design-Team-Letter-1.md` is the
formal decision log the engineering lead works from (read it second —
every claim below has its ratification trail there). The RFC
(`RAG/RFC-0001…`, rev 0.54+) outranks everything, including us.

## The one sentence

**Chrome is a terminal; the world is a desk.** The canvas has little
easy animations and feels like objects with physics; the UI is a
terminal. Everything you make should be explainable by that sentence.

## What is ratified (don't relitigate, do execute better)

- **Doctrine + motion:** flat mono chrome, one fade clock; world
  content gets small ONE-SHOT physical beats (tear ~300ms, bloom,
  stage-edge ease). Never ambient, never looping.
- **The note is a book page:** bound beside its image at EXACTLY the
  image's height (width free), rings on the seam; pinning tears it
  out (tape + torn edge persist); double-click tears to center;
  esc/click-off tucks it home. Editor face is **Maple Mono**
  (bundled, OFL, true italics), loud colored headings, org-style
  folding over a Markdown carrier.
- **The six node icons are objects** (star·pin·flag·heart·bolt·leaf,
  top-light gradients, restrained gloss); they degrade to the plain
  dot below ~8px. The glossy red pin lives ON paper only; chrome
  keeps the flat teardrop.
- **The shrink ladder:** world shrinks honestly · chrome holds size ·
  furniture exists only above ONE shared threshold. Two constants,
  no per-element special cases.
- **Menus speak verbs** (never "file"); trash is archive-toned;
  tooltips have exactly five legal shapes; the gallery's search
  track crystallizes pills (AND, booru-style).

## Your actual job: the style kit

The mock gradients and geometry I ratified are PLACEHOLDER-QUALITY
executions of decided designs. Production wants a craftsperson's hand:

1. **The object icon set** — six glyphs as real assets (SVG masters →
   texture atlas for the WebGL renderer, 2–3 raster sizes). The hex
   pairs and geometry are in STYLE-GUIDE.md §2/§8; improve the
   drawing, keep the palette hooks (one color token tints dot and
   icon alike).
2. **Paper materials** — tape, torn edge, ring stubs as a reusable
   set that survives light/dark/glass. My clip-path tears are
   sketches; yours should feel like paper.
3. **Maple Mono bundling** — woff2 400/400i/700 + license, and the
   editor scale tuned at real sizes (the heading colors are marked
   provisional; ride theme tokens).
4. **The dot palette call** — regularized oklch(.76 .09 h) row is
   drawn beside the shipped tokens (Icon Document 1g–1j) and
   UNRATIFIED. Make the call with real art on the board.
5. **New tokens** — the full add-list with values is in
   STYLE-GUIDE.md's ■ TECH blocks (void color-mix, tape/torn, obj
   gradients, drag shadow, beat constants, z-ladder). Land them in
   theme.css FIRST; the guard test is your friend.

## Where craft is still open (flagged, not decided)

Label floor at deep zoom-out (RFC says no clamp — feel-test it on a
40-board overview) · the book-cover-open beat (musing, ~200ms) ·
object shapes for skeuo maps (sketched t7, awaits the decorations
epic) · seed/demo art (owner + first tester curate; NEVER generated —
this audience is artists and generated art is fatal).

## How to work here

Documents are append-only decision logs: new explorations are new
turns on top with stable option ids; the storyboard absorbs ratified
outcomes; amendments route through the team letter → DESIGN-QUEUE →
RFC rev bump. Sentence case, no emoji, impact as fact. When in doubt,
reread the one sentence.

Good luck. The bones are good.

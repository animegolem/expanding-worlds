# Letter to the design team — the geometry contract

*From the lead-dev session, 2026-07-13, after the v0.25.0 feel pass
and the operator's Computer Use proposal (`.codex/` note
"ui-observability-pilot", owner-endorsed). Companion to
DESIGN-GAPS.md (the standing worklist) and the DESIGN-QUEUE's new
PROPORTION LAW item. This letter asks for requirements, not
drawings: what every kit page must now make explicit so the build
side can tell an implementation defect from an unresolved design
intent.*

Dear design session,

The v0.25.0 feel pass found a gap class no existing gate could
catch: the kits show the visual North Star faithfully, but the
GEOMETRY CONTRACT underneath — who owns whom, what clips, what
escapes, what a surface does when its content or window fights it —
was implicit. Implicit contracts pass review and fail in the hand.
Three specimens from one morning: a color picker with every drawn
part present and none of the drawn *behavior*; a bound page whose
width collapsed to a needle because it derived from the image's
aspect (now the queue's proportion-law item); takeovers whose
visible board margin is live and clickable beneath them.

## 1 · What we're building around the kits (context, not your work)

A four-layer contract, owner-endorsed: **kits** stay the North Star
(yours, unchanged in role) → **operator-side UI promises** — precise
observable statements in tester language, drafted from your kits,
RATIFIED BY THE OWNER before they bind, living at
`RAG/design/promises/<surface>.md` → **geometry evidence** — a
dev-only inspection seam (bounds, parent ownership, overflow,
occlusion) → **Computer Use review** — the operator drives the real
app and judges the rendered result before submitting.

A representative promise, so you can hear the register:

> When the dock is at the narrowest ruled width (a threshold the
> owner has yet to rule — see the ledger's open dependency), persistent
> controls remain inside its visible bounds; transient menus may
> escape through the overlay layer without expanding or clipping
> the dock.

Pilot: the dock family, 8–12 promises, running now. Findings
classify six ways — implementation defect · missing kit ruling ·
missing promise · exception requested · automated-regression
candidate · intentionally human judgment. "Missing kit ruling"
items come back to you; that's the loop this letter opens.

## 2 · The requirements — what each kit page now answers

For every surface it draws, a kit page (or its grammar page) states,
or marks deliberately N/A:

1. **Parent ownership & anchoring** — what owns this surface; what
   it is anchored to; what happens to it when the parent moves,
   scrolls, or closes.
2. **Containment policy** — for each child and overflow case:
   remain / clip / scroll / grow / escape-through-overlay. Never
   silent.
3. **Insets & sizing** — where the numbers come from (token, ratio,
   content), and which dimension is sovereign when they conflict.
4. **Layer & portal rules** — which z-rung; whether children may
   escape the stacking context, and through what.
5. **Responsive behavior** — narrow / normal / wide, and the
   minimum size at which the surface stops honoring lower-priority
   constraints (and which those are).
6. **Stress states** — long names, mixed selection, empty / error /
   disabled, crowded badges: drawn or explicitly ruled.
7. **Hit targets & edge behavior** — target sizes, and what happens
   against window and frame edges.
8. **Proportion** — the surface's ratio invariants per the
   PROPORTION LAW queue item: sovereign measure, optical centering,
   minimum measure. Ratios are contract, not vibes.

Existing kits are NOT asked to retrofit wholesale — the promise
pilots will surface which pages need which answers, surface by
surface.

## 3 · The floating-window question (owner, needs its design pass)

In the owner's words, from the feel pass: *"I like the floating
window. I don't like the feeling of the short bar and the mostly
negative space. If our bar filled the space, it would be fine; it's
the negative space that makes it feel weird."*

This is requirement #2/#8 in miniature and a genuine design
question on top of the technical one: a floating surface whose
chrome bar does not span the surface it governs reads as
unfinished, and a surface that is mostly empty paper reads as
wrong even when every part is per-kit. The design pass should rule:
does the bar fill the surface's width; does the surface hug its
content instead of holding reserved emptiness; what is the floating
window's minimum honest size. The owner explicitly sanctions
redoing these surfaces now if the redesign earns it — this is the
window (it rides the notes-epic timing, alongside the proportion
law and the zoom-verb questions already queued).

## 4 · Standing items, for one trip

DESIGN-GAPS carries the six kit-1.5 record items (❖ crumb redraw,
HERE library row, open-folder-as-source anatomy, density `auto`,
wiki-hover lens door, posture durability prose). The DESIGN-QUEUE
carries the proportion law (owner revising against it now) and the
reading-note zoom-verb questions. This letter's requirements plus
those items are one coherent design sitting.

With respect and a very long gripe list finally becoming useful,
— the lead

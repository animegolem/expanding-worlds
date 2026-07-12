# KIT-PREFLIGHT — the per-kit audit checklist (blank)

Compiled from GR-1..4, the motion-axis grammar, the iPad delta
ledger, and the reservation-frame/charm-halo invariants (RFC
§8.8.3/§8.8.4). Every UI kit ships three artifacts: the kit DC, its
grammar page, and this checklist filled. A ✗ with no waiver note
fails lead review; a kit with NO filled checklist does not proceed
to implementation tickets (rev 0.71 waiver terms — coverage-sprint
kits fill before their tickets cut).

Fill: ✓ pass · ✗ fail · △ debt noted · — not applicable (say why).

## A · finding surfaces (GR-1)
- [ ] A1 every finding/empty surface draws its three sentences (what this is · why it's empty or shown · what to do next)
- [ ] A2 empty ≠ loading — distinct drawn states, never one doubling
- [ ] A3 error states drawn, not just happy path

## B · exits (GR-2)
- [ ] B1 every dismissible surface has ≥3 exits: esc · explicit ✕/close · click-away (or ruled exception noted)
- [ ] B2 exits land somewhere ruled — camera/selection state after exit is specified
- [ ] B3 touch: every keyboard exit has an on-screen twin

## C · outcomes & voice (GR-3)
- [ ] C1 each verb classified into one of the seven outcome classes; only the speaking classes toast
- [ ] C2 silence budget respected — no toast for silent classes, no silent mutation for speaking ones
- [ ] C3 copy: sentence case, no "file", verbs over nouns, impact stated as fact

## D · gesture-undo (GR-4)
- [ ] D1 every mutating gesture the surface owns maps to single-step undo
- [ ] D2 composite verbs (create-and-attach etc.) commit as ONE undoable command
- [ ] D3 undo answers with its named beat

## E · motion ledger
- [ ] E1 every animated transition uses a named beat from the ledger (no ad-hoc motion)
- [ ] E2 fades/pulses only, ease-out 120–240ms, no loops/bounces
- [ ] E3 all chrome fades on the one shared clock

## F · integration edges (reservation frame + charm halo, §8.8.3–4)
- [ ] F1 surface clamps inside the reservation frame + gutter (all four bands)
- [ ] F2 clearance measured against charm HALOS, not card edges
- [ ] F3 edges specimen shipped: surface over live board, selected node + charms, reservations tinted, at rest/hover/engaged
- [ ] F4 defaults-row growth accounted for (dock band grows when a tool arms) if the surface coexists with an armed tool

## G · one-voice geometry (kit 1.2/1.3)
- [ ] G1 radii/borders/shadows from the token tiers; no local geometry
- [ ] G2 controls are kit components — no native select/color/number/datalist
- [ ] G3 anchored surfaces grow from their opener (one-physics), pointer/anchor honest (centered search palette is the one ruled exception)

## H · iPad delta (GR-5)
- [ ] H1 44px targets at touch density; density switch is one token, not per-surface forks
- [ ] H2 no hover-gated affordance without a touch synonym (long-press = context menu on content, tooltip chip on controls; dock slots: the flyout header names the tool)
- [ ] H3 strip band = 0 on touch; surface still reachable

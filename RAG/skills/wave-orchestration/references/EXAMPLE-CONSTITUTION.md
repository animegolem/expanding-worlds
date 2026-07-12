> Verbatim excerpts from the expanding-worlds constitution
> (RAG/RFC-0001-Core-Note-Node-and-Canvas-Model.md — 4,805 lines,
> rev 0.69 at snapshot time, cited by 90 of 272 implementation
> tickets; §8.2 alone is cited 75 times across the corpus). The
> instance keeps the "RFC" name because hundreds of citations
> point at it — pointer stability applies to the document's own
> name. Three exhibits of the genre follow.

## Exhibit 1 — the header: alive by design

```markdown
# RFC-0001: Core Note, Node, and Canvas Model

Product semantics, persistence boundaries, and provisional desktop
architecture for the Phase 1 prototype

| **STATUS**           | **REVISION** | **LAST UPDATED** |
|----------------------|--------------|------------------|
| Accepted for Phase 1 | 0.69         | 10 July 2026     |

> **WORKING PRODUCT STATEMENT**
>
> **A visual reference board where any meaningful object can
> become a reusable, documented doorway into another board, while
> shared notes let related instances retain one common body of
> meaning.**

**Decision scope**

Phase 1 product semantics, project roots, core lifecycle rules,
rendering and persistence seams, and accepted technology
direction. Fine UI composition remains subject to prototype
feedback.
```

Note the covenant at work: STATUS says accepted, yet REVISION is
0.69 — acceptance froze the *scope*, not the text. Every ruling
since has bumped the number.

## Exhibit 2 — the decision summary: flattened current state

```markdown
# 20. Decision summary

Accepted for the Phase 1 prototype:

- Notes are independently addressable semantic records.

- Notes may exist without nodes and may be shared by several
  nodes.

- Each project has exactly one protected root node and root
  canvas; Home targets that canvas.
```

One bullet per accepted decision, present tense, no rationale —
the rationale lives in the body sections the bullets compress. A
reader who reads only §5 (invariants) and §20 should not be wrong
about anything.

## Exhibit 3 — a preserved reversal: the negative space

```markdown
- Tags are first-class, flat, project-scoped records assigned only
  to nodes, never serialized into note text; activating a tag
  opens the tag panel (§4.8). Hierarchy was accepted (rev 0.19)
  and dropped (rev 0.20) in one design cycle: tags stay the thin
  layer, and reopening hierarchy is a deliberate domain decision.
```

The reversal stays in the text with both rev markers. Nobody
relitigates tag hierarchy by accident: the record shows it was
tried, when, and that reopening it is a decision rather than a
discovery. The instance carries 222 inline rev markers of this
kind — the decision log woven through the normative prose rather
than appended to it.

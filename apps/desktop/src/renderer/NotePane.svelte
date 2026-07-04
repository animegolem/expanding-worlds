<!--
  Persistent note editor pane (RFC-0001 §8.2). Placeholder until the
  real note editor lands.
-->
<aside class="note-pane" data-testid="note-pane">
  <h2>Notes</h2>
  <p>Note editor lands in a later ticket.</p>
</aside>

<style>
  .note-pane {
    grid-area: note-pane;
    overflow: auto;
    padding: 0.75rem 1rem;
    border-right: 1px solid #ddd;
    background: #fafafa;
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #666;
  }

  p {
    margin: 0;
    color: #888;
  }
</style>

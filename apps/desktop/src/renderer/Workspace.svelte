<!--
  Tabbed main workspace (RFC-0001 §8.2). One placeholder tab for now;
  real tab management is out of scope for AI-IMP-007.
-->
<main class="workspace" data-testid="workspace">
  <div class="tab-bar" role="tablist">
    <button class="tab active" role="tab" aria-selected="true">Canvas</button>
  </div>
  <section class="tab-content" role="tabpanel">
    <p>Workspace content lands in a later ticket.</p>
  </section>
</main>

<style>
  .workspace {
    grid-area: workspace;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .tab-bar {
    display: flex;
    border-bottom: 1px solid #ddd;
    background: #f4f4f4;
  }

  .tab {
    padding: 0.4rem 1rem;
    border: none;
    border-right: 1px solid #ddd;
    background: transparent;
    font: inherit;
    color: #666;
    cursor: default;
  }

  .tab.active {
    background: #fff;
    color: #222;
  }

  .tab-content {
    flex: 1;
    overflow: auto;
    padding: 1rem;
  }

  .tab-content p {
    margin: 0;
    color: #888;
  }
</style>

<script lang="ts">
  /**
   * Proves the renderer → preload → main → utility seam is live by
   * pinging the project service on mount and rendering the raw JSON.
   */
  let status = $state('checking…')

  $effect(() => {
    void window.ew.project
      .ping()
      .then((response) => {
        status = JSON.stringify(response)
      })
      .catch((error: unknown) => {
        status = `ping failed: ${String(error)}`
      })
  })
</script>

<footer class="status-strip" data-testid="status-strip">
  <span>Project service seam:</span>
  <code>{status}</code>
</footer>

<style>
  .status-strip {
    grid-area: status;
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    padding: 0.25rem 1rem;
    border-top: 1px solid #ddd;
    background: #f4f4f4;
    font-size: 0.8rem;
    color: #666;
  }

  code {
    font-family: ui-monospace, monospace;
    color: #2a6;
  }
</style>

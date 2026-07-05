<script lang="ts">
  /**
   * Proves the renderer → preload → main → utility seam is live by
   * pinging the project service on mount, and surfaces
   * utility-process outages (AI-IMP-053) — the failure that used to
   * present as a mute black canvas.
   */
  let status = $state('checking…')
  let service = $state<{ status: 'restarting' | 'ok' | 'failed'; message?: string } | null>(null)

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

  $effect(() => {
    const dispose = window.ew.project.onServiceStatus((event) => {
      service = event
      if (event.status === 'ok') {
        // Clear the notice a beat after recovery.
        setTimeout(() => {
          if (service?.status === 'ok') service = null
        }, 5000)
      }
    })
    return dispose
  })
</script>

<footer class="status-strip" data-testid="status-strip">
  <span>Project service seam:</span>
  <code>{status}</code>
  {#if service}
    <span
      class="service"
      class:failed={service.status === 'failed'}
      class:restarting={service.status === 'restarting'}
      data-testid="service-status"
      data-status={service.status}
    >
      {#if service.status === 'restarting'}
        project service crashed — restarting…
      {:else if service.status === 'ok'}
        project service recovered
      {:else}
        project service failed: {service.message ?? 'unknown'} — restart the app
      {/if}
    </span>
  {/if}
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

  .service {
    font-weight: 600;
    color: #2a6;
  }

  .service.restarting {
    color: #b07d1a;
  }

  .service.failed {
    color: #b3403a;
  }
</style>

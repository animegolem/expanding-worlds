<script lang="ts">
  const {
    message,
    error = false,
    testid,
    onretry,
    afterRetry = '',
  }: { message: string; error?: boolean; testid: string; onretry?: () => void; afterRetry?: string } = $props()
</script>

<p class="state" class:error data-testid={testid} role={error ? 'alert' : undefined}>
  {message}
  {#if onretry}<button type="button" onclick={onretry}>try again</button>.{afterRetry}{/if}
</p>

<style>
  .state { margin: 0; padding: 0.9rem 0.8rem; color: var(--ew-text-muted); }
  .state.error { color: var(--ew-danger); }
  button { padding: 0; border: 0; background: transparent; color: inherit; text-decoration: underline; cursor: pointer; }
</style>

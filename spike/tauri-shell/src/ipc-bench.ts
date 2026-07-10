import { invoke } from '@tauri-apps/api/core'
import { round } from './metrics'

/**
 * IPC risk (#2): round-trip latency of a single `#[tauri::command]` echo
 * at two payload sizes. Each call is a full invoke → Rust → serialize
 * back cycle, so the number folds in Tauri v2's JSON IPC serialization
 * on both legs — the cost a real persistence bridge would pay per call.
 */
export interface EchoStats {
  bytes: number
  iterations: number
  minMs: number
  medianMs: number
  p95Ms: number
  maxMs: number
  meanMs: number
  verified: boolean
}

export async function benchEcho(bytes: number, iterations: number): Promise<EchoStats> {
  const payload = 'x'.repeat(bytes)
  // warmup (first invoke pays one-time channel setup)
  await invoke<string>('echo', { payload })
  const samples: number[] = []
  let verified = true
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now()
    const echoed = await invoke<string>('echo', { payload })
    samples.push(performance.now() - t0)
    if (echoed.length !== payload.length) verified = false
  }
  const s = samples.sort((a, b) => a - b)
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))]!
  return {
    bytes,
    iterations,
    minMs: round(s[0]!, 3),
    medianMs: round(at(0.5), 3),
    p95Ms: round(at(0.95), 3),
    maxMs: round(s[s.length - 1]!, 3),
    meanMs: round(s.reduce((a, b) => a + b, 0) / s.length, 3),
    verified,
  }
}

export type SettingsIntent = 'export'

let pending: SettingsIntent | null = null
const listeners = new Set<(intent: SettingsIntent) => void>()

export function requestSettingsIntent(intent: SettingsIntent): void {
  pending = intent
  for (const listener of listeners) listener(intent)
}

export function onSettingsIntent(listener: (intent: SettingsIntent) => void): () => void {
  listeners.add(listener)
  if (pending) {
    const intent = pending
    pending = null
    listener(intent)
  }
  return () => listeners.delete(listener)
}

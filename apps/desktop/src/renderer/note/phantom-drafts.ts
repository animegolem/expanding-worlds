/** Session-only drafts for unresolved-link phantoms (AI-IMP-284). */
const drafts = new Map<string, string>()

export function phantomDraft(key: string): string {
  return drafts.get(key) ?? ''
}

export function rememberPhantomDraft(key: string, body: string): void {
  if (body.length === 0) drafts.delete(key)
  else drafts.set(key, body)
}

export function discardPhantomDraft(key: string): void {
  drafts.delete(key)
}

export function clearPhantomDrafts(): void {
  drafts.clear()
}

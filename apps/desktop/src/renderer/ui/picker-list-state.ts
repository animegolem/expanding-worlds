export interface PickerItem<T = string> { id: string; label: string; value: T; group?: string; keywords?: readonly string[]; curated?: boolean }

export function visiblePickerItems<T>(items: readonly PickerItem<T>[], query: string, longTailOpen: boolean): PickerItem<T>[] {
  const needle = query.trim().toLocaleLowerCase()
  const matching = needle
    ? items.filter((item) => `${item.label} ${(item.keywords ?? []).join(' ')}`.toLocaleLowerCase().includes(needle))
    : items.filter((item) => longTailOpen || item.curated)
  return [...matching].sort((a, b) => Number(Boolean(b.curated)) - Number(Boolean(a.curated)))
}

export function moveActiveIndex(index: number, direction: -1 | 1, length: number): number {
  if (length <= 0) return -1
  return Math.min(length - 1, Math.max(0, index < 0 ? (direction > 0 ? 0 : length - 1) : index + direction))
}

export function appendTypeahead(previous: string, key: string): string {
  return key.length === 1 && !/\s/.test(key) ? `${previous}${key}` : previous
}

export interface StepOptions { min?: number; max?: number; step?: number }
const decimals = (value: number): number => (String(value).split('.')[1] ?? '').length

export function normalizeStep(value: number, options: StepOptions = {}): number {
  const min = Number.isFinite(options.min) ? options.min! : Number.NEGATIVE_INFINITY
  const max = Number.isFinite(options.max) ? options.max! : Number.POSITIVE_INFINITY
  const step = Number.isFinite(options.step) && options.step! > 0 ? options.step! : 1
  const origin = Number.isFinite(min) ? min : 0
  const snapped = origin + Math.round((value - origin) / step) * step
  const precision = Math.min(12, Math.max(decimals(step), decimals(origin)))
  return Number(Math.min(max, Math.max(min, snapped)).toFixed(precision))
}

export function stepValue(value: number, direction: -1 | 1, options: StepOptions = {}): number {
  const step = Number.isFinite(options.step) && options.step! > 0 ? options.step! : 1
  return normalizeStep(value + direction * step, options)
}
export function stepFromKey(key: string): -1 | 1 | null { return key === 'ArrowUp' ? 1 : key === 'ArrowDown' ? -1 : null }
export function stepFromWheel(deltaY: number): -1 | 1 | null { return deltaY < 0 ? 1 : deltaY > 0 ? -1 : null }

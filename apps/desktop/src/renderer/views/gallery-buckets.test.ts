import { describe, expect, it } from 'vitest'
import { bucketByDate } from './gallery-buckets'

/** §14.4 grouped time: relative → months → years degradation. */
describe('gallery date buckets', () => {
  // A Wednesday mid-year keeps every relative boundary distinct.
  const now = new Date(2026, 6, 8, 15, 0, 0) // 2026-07-08 (Wed)

  const at = (iso: string): { createdAt: string } => ({ createdAt: iso })

  it('degrades today → this week → this month → named months → years', () => {
    const entries = [
      at('2026-07-08T09:00:00.000Z'), // today
      at('2026-07-06T12:00:00.000Z'), // Monday: this week
      at('2026-07-01T12:00:00.000Z'), // this month
      at('2026-05-20T12:00:00.000Z'), // named month, current year
      at('2025-11-03T12:00:00.000Z'), // named month, trailing year
      at('2024-08-15T12:00:00.000Z'), // beyond a year: whole-year bucket
      at('2024-02-02T12:00:00.000Z'), // same year bucket continues
      at('2023-01-01T12:00:00.000Z'),
    ]
    expect(bucketByDate(entries, now)).toEqual([
      { key: 'today', label: 'Today', startIndex: 0, count: 1 },
      { key: 'week', label: 'This week', startIndex: 1, count: 1 },
      { key: 'month', label: 'This month', startIndex: 2, count: 1 },
      { key: 'm-2026-4', label: 'May 2026', startIndex: 3, count: 1 },
      { key: 'm-2025-10', label: 'November 2025', startIndex: 4, count: 1 },
      { key: 'y-2024', label: '2024', startIndex: 5, count: 2 },
      { key: 'y-2023', label: '2023', startIndex: 7, count: 1 },
    ])
  })

  it('collapses runs and handles empty input', () => {
    expect(bucketByDate([], now)).toEqual([])
    const sameDay = [
      at('2026-07-08T10:00:00.000Z'),
      at('2026-07-08T09:00:00.000Z'),
      at('2026-07-08T08:00:00.000Z'),
    ]
    expect(bucketByDate(sameDay, now)).toEqual([
      { key: 'today', label: 'Today', startIndex: 0, count: 3 },
    ])
  })
})

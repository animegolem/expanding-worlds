/**
 * Grouped time for the gallery (RFC-0001 §14.4 rev 0.22,
 * AI-IMP-077): date sort renders bucketed sections, relative near
 * the top and degrading with age — today · this week · this month,
 * then named calendar months back through the trailing year, then
 * whole-year buckets. ("Earlier this year" from the rev 0.22 sketch
 * is realized as named months: same territory, and the header's
 * period list needs jumpable names more than a catch-all.) Pure
 * view math over indexed timestamps; no schema.
 *
 * Input MUST be sorted newest-first (the gallery index order);
 * buckets come back in render order with index ranges into it.
 */

export interface GalleryBucket {
  key: string
  label: string
  /** Range into the newest-first entry array. */
  startIndex: number
  count: number
}

/** Name headers stay quiet on small galleries; once the collection is
 * past this exact kit threshold, contiguous first-letter runs become
 * sections. Untitled items share the visible fallback header `#` — raw
 * node ids never leak into presentation. */
export const NAME_GROUP_THRESHOLD = 24

export function bucketByName(
  entries: ReadonlyArray<{ noteTitle: string | null }>,
): GalleryBucket[] {
  if (entries.length <= NAME_GROUP_THRESHOLD) return []
  const buckets: GalleryBucket[] = []
  for (let i = 0; i < entries.length; i += 1) {
    const initial = entries[i]!.noteTitle?.trim().charAt(0).toLocaleUpperCase() ?? ''
    const label = /^\p{L}$/u.test(initial) ? initial : '#'
    const current = buckets.at(-1)
    if (current?.label === label) current.count += 1
    else buckets.push({ key: `name-${label}-${i}`, label, startIndex: i, count: 1 })
  }
  return buckets
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

interface BucketRule {
  key: string
  label: string
  /** Earliest instant (inclusive) this bucket covers. */
  floor: number
}

function startOfDay(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

/** Monday-start week, matching the calendar the tester lives in. */
function startOfWeek(now: Date): number {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const offset = (day.getDay() + 6) % 7
  return day.getTime() - offset * 24 * 60 * 60 * 1000
}

function bucketFor(timestamp: number, now: Date): BucketRule {
  const today = startOfDay(now)
  if (timestamp >= today) return { key: 'today', label: 'Today', floor: today }
  const week = startOfWeek(now)
  if (timestamp >= week) return { key: 'week', label: 'This week', floor: week }
  const month = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  if (timestamp >= month) return { key: 'month', label: 'This month', floor: month }

  const when = new Date(timestamp)
  const monthsBack =
    (now.getFullYear() - when.getFullYear()) * 12 + (now.getMonth() - when.getMonth())
  if (monthsBack <= 12) {
    const label = `${MONTHS[when.getMonth()]} ${when.getFullYear()}`
    return {
      key: `m-${when.getFullYear()}-${when.getMonth()}`,
      label,
      floor: new Date(when.getFullYear(), when.getMonth(), 1).getTime(),
    }
  }
  return {
    key: `y-${when.getFullYear()}`,
    label: String(when.getFullYear()),
    floor: new Date(when.getFullYear(), 0, 1).getTime(),
  }
}

export function bucketByDate(
  entries: ReadonlyArray<{ createdAt: string }>,
  now: Date,
): GalleryBucket[] {
  const buckets: GalleryBucket[] = []
  let current: GalleryBucket | null = null
  for (let i = 0; i < entries.length; i += 1) {
    const ts = Date.parse(entries[i]!.createdAt)
    const rule = bucketFor(Number.isNaN(ts) ? 0 : ts, now)
    if (current && current.key === rule.key) {
      current.count += 1
      continue
    }
    current = { key: rule.key, label: rule.label, startIndex: i, count: 1 }
    buckets.push(current)
  }
  return buckets
}

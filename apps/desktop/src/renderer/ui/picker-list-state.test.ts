import { describe, expect, it } from 'vitest'
import { appendTypeahead, moveActiveIndex, visiblePickerItems, type PickerItem } from './picker-list-state'
const items: PickerItem[] = [
  { id: 'tail', label: 'Zeta', value: 'z', group: 'all' },
  { id: 'curated', label: 'Alpha', value: 'a', group: 'best', curated: true },
]
describe('picker list state', () => {
  it('shows curated first until the long tail opens', () => {
    expect(visiblePickerItems(items, '', false).map((item) => item.id)).toEqual(['curated'])
    expect(visiblePickerItems(items, '', true).map((item) => item.id)).toEqual(['curated', 'tail'])
  })
  it('search reaches the long tail', () => expect(visiblePickerItems(items, 'zet', false)[0]?.id).toBe('tail'))
  it('clamps keyboard movement and accumulates typeahead', () => {
    expect(moveActiveIndex(-1, 1, 2)).toBe(0); expect(moveActiveIndex(1, 1, 2)).toBe(1)
    expect(appendTypeahead('a', 'b')).toBe('ab')
  })
})

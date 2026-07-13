import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
const read = (file: string): string => readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
describe('kit input component contracts', () => {
  it('anchors and dismisses the color picker through the shared physics', () => { const source = read('./ColorPicker.svelte'); expect(source).toContain('placeAnchoredElement'); expect(source).toContain("event.key === 'Escape'"); expect(source).toContain('anchor.focus()') })
  it('keeps the picker list semantic and keyboard reachable', () => { const source = read('./PickerList.svelte'); expect(source).toContain('role="combobox"'); expect(source).toContain('role="listbox"'); expect(source).toContain("event.key === 'ArrowDown'") })
  it('uses text rather than a native number input and exposes comfortable targets', () => { const source = read('./Stepper.svelte'); expect(source).toContain('type="text"'); expect(source).not.toContain('type="number"'); expect(source).toContain("data-density='comfortable'"); expect(source).toContain('44px') })
  it('keeps the bare text input as a furniture-free palette rider', () => { const source = read('./TextInput.svelte'); expect(source).toContain("variant?: 'standard' | 'pill' | 'bare'"); expect(source).toContain('.ew-text-input.bare'); expect(source).toContain('background: transparent') })
  it('pins the shared segmented and facet controls to kit focus + pressed semantics', () => { for (const file of ['Segmented.svelte', 'FacetChip.svelte']) { const source = read(`./${file}`); expect(source).toContain("aria-pressed"); expect(source).toContain('outline: 2px solid var(--ew-focus-ring)') } })
  it('keeps gallery chrome on shared controls rather than local button geometry', () => { for (const file of ['../views/GalleryView.svelte', '../views/GalleryFacets.svelte', '../views/GalleryActionBar.svelte', '../views/GalleryQuickLook.svelte']) expect(read(file)).not.toMatch(/<button\b/) })
  it.each(['ColorPicker.svelte', 'SwatchRow.svelte', 'PickerList.svelte', 'Stepper.svelte'])('%s wears one-voice focus and radius', (file) => { const source = read(`./${file}`); expect(source).toContain('border-radius:5px'); expect(source).toContain('outline:2px solid var(--ew-focus-ring)') })
})

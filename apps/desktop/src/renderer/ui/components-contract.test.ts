import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
const read = (file: string): string => readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
describe('kit input component contracts', () => {
  it('anchors and dismisses the color picker through the shared physics', () => { const source = read('./ColorPicker.svelte'); expect(source).toContain('placeAnchoredElement'); expect(source).toContain("event.key === 'Escape'"); expect(source).toContain('anchor.focus()') })
  it('keeps the picker list semantic and keyboard reachable', () => { const source = read('./PickerList.svelte'); expect(source).toContain('role="combobox"'); expect(source).toContain('role="listbox"'); expect(source).toContain("event.key === 'ArrowDown'") })
  it('uses text rather than a native number input and exposes comfortable targets', () => { const source = read('./Stepper.svelte'); expect(source).toContain('type="text"'); expect(source).not.toContain('type="number"'); expect(source).toContain("data-density='comfortable'"); expect(source).toContain('44px') })
  it.each(['ColorPicker.svelte', 'SwatchRow.svelte', 'PickerList.svelte', 'Stepper.svelte'])('%s wears one-voice focus and radius', (file) => { const source = read(`./${file}`); expect(source).toContain('border-radius:5px'); expect(source).toContain('outline:2px solid var(--ew-focus-ring)') })
})

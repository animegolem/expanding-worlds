/**
 * title_key derivation per RFC-0001 §4.2, applied in order:
 * 1. trim leading/trailing whitespace
 * 2. collapse internal whitespace runs to one space
 * 3. Unicode-normalize to NFC
 * 4. locale-independent case folding
 *
 * Folding uses the default (non-locale) Unicode lowercase mapping.
 * Full case folding (e.g. ß → ss) and confusable folding are out of
 * scope for Phase 1 per §4.2. A trailing NFC pass keeps keys stable
 * where lowercasing denormalizes.
 */
export function titleKey(title: string): string {
  return title
    .trim()
    .replace(/\s+/gu, ' ')
    .normalize('NFC')
    .toLowerCase()
    .normalize('NFC')
}

/** Tag name_key per §4.8 uses the same normalization. */
export const nameKey = titleKey

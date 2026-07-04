/** @ew/domain — pure domain primitives and record types (RFC-0001 §4). */
export const PACKAGE_NAME = '@ew/domain' as const

export { uuidv7, shortCode } from './ids'
export { titleKey, nameKey } from './title-key'
export { extractWikiLinks, type WikiLinkToken } from './wiki-links'
export * from './records'

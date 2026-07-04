/** @ew/domain — pure domain primitives and record types (RFC-0001 §4). */
export const PACKAGE_NAME = '@ew/domain' as const

export { uuidv7, shortCode } from './ids'
export { titleKey, nameKey } from './title-key'
export * from './records'

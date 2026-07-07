/** @ew/domain — pure domain primitives and record types (RFC-0001 §4). */
export const PACKAGE_NAME = '@ew/domain' as const

export { uuidv7, shortCode } from './ids'
export { titleKey, nameKey } from './title-key'
export {
  extractWikiLinks,
  matchWikiLinkAt,
  linkDisplayState,
  type LinkResolutionContext,
  type WikiLinkDisplayState,
  type WikiLinkToken,
} from './wiki-links'
export {
  MARKDOWN_DIALECT,
  MARKDOWN_ROUNDTRIP_CORPUS,
  type MarkdownRoundTripCase,
} from './markdown-dialect'
export * from './records'
export {
  METADATA_OPEN,
  METADATA_CLOSE,
  stripMetadataBlock,
  renderMetadataBlock,
  composeNoteBody,
  type MetadataBoard,
  type MetadataProvenanceEntry,
  type MetadataSectionsInput,
} from './note-metadata'

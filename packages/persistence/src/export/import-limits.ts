/**
 * Uncompressed-resource budgets for `.ewproj` import (CA-011, P2).
 *
 * A `.ewproj` is a user-selected file; it may be damaged or hostile.
 * The importer must decide what it is willing to spend on memory and
 * disk BEFORE it extracts anything, because a crafted archive can
 * declare a tiny compressed body that inflates to gigabytes (a zip
 * bomb) or list millions of entries. These budgets are the ceiling;
 * the importer refuses (typed, user-phrasable) the moment a declared
 * or streamed value crosses one, and a refused import leaves nothing
 * on disk (the existing failed-import guarantee).
 *
 * ── Budget rationale (sanity-checked against a realistic big project)
 *
 * The exporter's own profile (project-export.ts) is the ground truth
 * for what "legitimate and large" looks like: one STORED entry per
 * asset blob (media is already compressed — ratio ≈ 1:1), one DEFLATE
 * entry per note `.md`, one DEFLATE `project.sqlite` (VACUUM INTO, so
 * compact with little slack), and one pretty-printed `manifest.json`.
 *
 * - maxEntries = 100_000. Entries = 1 db + N notes + M asset blobs +
 *   1 manifest. A heavy world-building board — tens of thousands of
 *   nodes and tens of thousands of reference images — lands well under
 *   100k. This is a Phase-1 ceiling, not a hard architectural limit;
 *   it is one constant to raise. Enforced during the central-directory
 *   scan so an "list a billion entries" archive is refused before the
 *   entry map is ever built.
 *
 * - maxManifestBytes = 64 MiB. The manifest carries one inventory row
 *   per entry, and the exporter writes it pretty-printed
 *   (`JSON.stringify(m, null, 2)`): a single asset row costs ~225
 *   bytes with its 64-hex path, 64-hex sha256, byte count, braces, and
 *   newlines. At the 100k-entry ceiling that is ~22 MB, so the
 *   ticket's suggested 16 MB would REFUSE a legitimate max-size
 *   archive. 64 MiB keeps >2.5x headroom over the largest manifest
 *   this exporter can produce while still bounding the buffer we hold
 *   in memory before parse. (This coupling — manifest budget must
 *   exceed maxEntries × pretty-row — is the substantive deviation from
 *   the ticket's suggested value; see Issues Encountered.)
 *
 * - maxEntryUncompressedBytes = 8 GiB. The largest single member an
 *   honest export can hold is one asset blob; 8 GiB covers a long 4K
 *   video reference with room to spare.
 *
 * - maxAggregateUncompressedBytes = 64 GiB. Total uncompressed payload
 *   across every entry. A professional media library can be large;
 *   64 GiB is a generous-but-real Phase-1 total. Enforced as a running
 *   sum during the scan so the aggregate can never be exceeded by many
 *   individually-legal entries.
 *
 * - maxCompressionRatio = 200:1, applied only above ratioCheckFloor.
 *   STORED assets are 1:1; a VACUUM'd SQLite db and small markdown
 *   deflate at realistically ≤ ~20:1, so 200:1 leaves ~10x headroom
 *   over anything this exporter emits. A zip bomb, by contrast, runs
 *   1000:1 to 10^6:1, so the gap is wide. The floor exempts small
 *   entries (a tiny, highly-repetitive note could show a high ratio on
 *   a handful of bytes and can exhaust nothing) so the ratio gate
 *   never false-refuses a legitimate small file — the per-entry and
 *   aggregate byte caps guard those.
 *
 * - ratioCheckFloorBytes = 1 MiB. Below this uncompressed size the
 *   ratio check does not apply; a bomb's inflated size is far above it.
 */
export interface ImportLimits {
  /** Max entries in the central directory (excludes directory records). */
  maxEntries: number
  /** Max uncompressed bytes for `manifest.json` before we buffer/parse it. */
  maxManifestBytes: number
  /** Max uncompressed bytes for any single entry. */
  maxEntryUncompressedBytes: number
  /** Max uncompressed bytes summed across every entry. */
  maxAggregateUncompressedBytes: number
  /** Max uncompressed:compressed ratio for an entry above the floor. */
  maxCompressionRatio: number
  /** Entries whose uncompressed size is at or below this skip the ratio gate. */
  ratioCheckFloorBytes: number
}

const MiB = 1024 * 1024
const GiB = 1024 * MiB

/** Production budgets. The service seam always imports with these; the
 * override parameter on the importer exists so tests can drive the
 * count/size gates with a tiny synthetic archive instead of a real
 * multi-gigabyte or hundred-thousand-entry corpus. */
export const IMPORT_LIMITS: ImportLimits = {
  maxEntries: 100_000,
  maxManifestBytes: 64 * MiB,
  maxEntryUncompressedBytes: 8 * GiB,
  maxAggregateUncompressedBytes: 64 * GiB,
  maxCompressionRatio: 200,
  ratioCheckFloorBytes: 1 * MiB,
}

/** A budget refusal: a typed code plus a user-phrasable message. The
 * importer owns the Error class; these helpers stay pure so the limits
 * module has no dependency on the importer's refusal machinery. */
export interface BudgetViolation {
  code: string
  message: string
}

/** True only for a finite, non-negative, safe integer. ZIP sizes are
 * attacker-influenced; a NaN, fraction, negative, or 2^53-overflowing
 * value must never be trusted as a byte count. */
export function isFiniteNonNegativeInteger(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
}

/** Validate one central-directory entry's DECLARED sizes against the
 * per-entry budgets (size, ratio, well-formedness). Returns the first
 * violation or null. Aggregate and count are tracked by the caller
 * across the scan. */
export function checkEntryDeclaredSize(
  fileName: string,
  uncompressedSize: unknown,
  compressedSize: unknown,
  limits: ImportLimits,
): BudgetViolation | null {
  if (!isFiniteNonNegativeInteger(uncompressedSize) || !isFiniteNonNegativeInteger(compressedSize)) {
    return {
      code: 'BAD_ARCHIVE',
      message: `entry has a malformed size: ${fileName}`,
    }
  }
  if (uncompressedSize > limits.maxEntryUncompressedBytes) {
    return {
      code: 'ENTRY_TOO_LARGE',
      message:
        `an entry in this archive is too large to import ` +
        `(${uncompressedSize} bytes, limit ${limits.maxEntryUncompressedBytes}): ${fileName}`,
    }
  }
  if (
    uncompressedSize > limits.ratioCheckFloorBytes &&
    uncompressedSize > compressedSize * limits.maxCompressionRatio
  ) {
    return {
      code: 'COMPRESSION_RATIO_EXCEEDED',
      message:
        `an entry in this archive is too compressible to trust ` +
        `(${uncompressedSize} from ${compressedSize} bytes exceeds ` +
        `${limits.maxCompressionRatio}:1): ${fileName}`,
    }
  }
  return null
}

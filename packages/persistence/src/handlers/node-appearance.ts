import { DomainError, type NodeAppearance } from '@ew/commands'
import { isAppearanceCrop } from '@ew/domain'
import type { CommandContext } from '../dispatcher'

export type NodeAppearanceKind = NodeAppearance['kind']

/** The five fixed node columns that encode one appearance. Callers may
 * insert them with a new node; all updates live in this module. */
export interface AppearanceColumns {
  [key: string]: unknown
  /** Runtime DB rows are untrusted even though encoders emit only the
   * current union; keep this string-wide so decode checks unknown kinds. */
  kind: string | null
  color: string | null
  icon: string | null
  assetId: string | null
  crop: string | null
}

export interface AppearanceAsset {
  id: string
  width: number | null
  height: number | null
}

export interface AppearanceValidationOptions {
  allowedKinds: ReadonlySet<NodeAppearanceKind>
  allowNull: boolean
  kindMessage: string
}

export interface PreparedAppearance {
  appearance: NodeAppearance | null
  columns: AppearanceColumns
  asset: AppearanceAsset | null
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

/** Runtime validation stays at the handler boundary. The allowed-kind
 * set is explicit per command so extraction cannot widen CreatePin or a
 * server-issued inverse when the domain grows. */
export function validateNodeAppearance(
  value: unknown,
  options: AppearanceValidationOptions,
): NodeAppearance | null {
  if (value === null) {
    if (options.allowNull) return null
    throw new DomainError('VALIDATION_FAILED', options.kindMessage)
  }

  const candidate = record(value)
  const kind = candidate?.['kind']
  if (typeof kind !== 'string' || !options.allowedKinds.has(kind as NodeAppearanceKind)) {
    throw new DomainError('VALIDATION_FAILED', options.kindMessage)
  }

  if (kind === 'dot') {
    const color = candidate?.['color']
    if (typeof color !== 'string' || color.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'dot appearance requires a color')
    }
    return { kind, color }
  }

  if (kind === 'icon') {
    const icon = candidate?.['icon']
    if (typeof icon !== 'string' || icon.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'icon appearance requires an icon name')
    }
    return { kind, icon }
  }

  if (kind === 'image') {
    const assetId = candidate?.['assetId']
    if (typeof assetId !== 'string' || assetId.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'image appearance requires an asset id')
    }
    const crop = candidate?.['crop']
    if (crop !== null && !isAppearanceCrop(crop)) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'image appearance crop must be a finite normalized rectangle',
      )
    }
    return { kind, assetId, crop }
  }

  // card and frame are deliberately payload-less.
  if (kind === 'card' || kind === 'frame') return { kind }
  throw new DomainError('VALIDATION_FAILED', options.kindMessage)
}

export function encodeAppearanceColumns(appearance: NodeAppearance | null): AppearanceColumns {
  if (appearance === null) {
    return { kind: null, color: null, icon: null, assetId: null, crop: null }
  }
  if (appearance.kind === 'dot') {
    return { kind: appearance.kind, color: appearance.color, icon: null, assetId: null, crop: null }
  }
  if (appearance.kind === 'icon') {
    return { kind: appearance.kind, color: null, icon: appearance.icon, assetId: null, crop: null }
  }
  if (appearance.kind === 'image') {
    return {
      kind: appearance.kind,
      color: null,
      icon: null,
      assetId: appearance.assetId,
      crop: appearance.crop === null ? null : JSON.stringify(appearance.crop),
    }
  }
  return { kind: appearance.kind, color: null, icon: null, assetId: null, crop: null }
}

/** Decode durable columns for an inverse. A malformed row refuses the
 * command instead of silently converting an unknown appearance to null. */
export function decodeAppearanceColumns(columns: AppearanceColumns): NodeAppearance | null {
  let candidate: unknown
  if (columns.kind === null) candidate = null
  else if (columns.kind === 'dot') candidate = { kind: columns.kind, color: columns.color }
  else if (columns.kind === 'icon') candidate = { kind: columns.kind, icon: columns.icon }
  else if (columns.kind === 'image') {
    let crop: unknown = null
    if (columns.crop !== null) {
      try {
        crop = JSON.parse(columns.crop) as unknown
      } catch {
        throw new DomainError('VALIDATION_FAILED', 'stored image appearance crop is malformed')
      }
    }
    candidate = { kind: columns.kind, assetId: columns.assetId, crop }
  } else if (columns.kind === 'card' || columns.kind === 'frame') candidate = { kind: columns.kind }
  else throw new DomainError('VALIDATION_FAILED', `stored appearance kind is invalid: ${columns.kind}`)

  return validateNodeAppearance(candidate, {
    allowedKinds: ALL_APPEARANCE_KINDS,
    allowNull: true,
    kindMessage: 'stored node appearance is invalid',
  })
}

function requireActiveAsset(ctx: CommandContext, appearance: NodeAppearance | null): AppearanceAsset | null {
  if (appearance?.kind !== 'image') return null
  const asset = ctx.db.get<AppearanceAsset>(
    `SELECT id, width, height FROM asset
     WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
    appearance.assetId,
    ctx.projectId,
  )
  if (!asset) throw new DomainError('ASSET_NOT_FOUND', `no active asset ${appearance.assetId}`)
  return asset
}

/** Validate, resolve any image asset, and encode in one call so every
 * command path crosses the complete codec boundary. */
export function prepareNodeAppearance(
  ctx: CommandContext,
  value: unknown,
  options: AppearanceValidationOptions,
): PreparedAppearance {
  const appearance = validateNodeAppearance(value, options)
  return {
    appearance,
    columns: encodeAppearanceColumns(appearance),
    asset: requireActiveAsset(ctx, appearance),
  }
}

/** The one update grammar for the fixed appearance columns. */
export function updateNodeAppearance(
  ctx: CommandContext,
  nodeId: string,
  columns: AppearanceColumns,
  updatedAt = ctx.now(),
): void {
  ctx.db.run(
    `UPDATE node SET appearance_kind = ?, appearance_color = ?, appearance_icon = ?,
            appearance_asset_id = ?, appearance_crop = ?, updated_at = ?
     WHERE id = ?`,
    columns.kind,
    columns.color,
    columns.icon,
    columns.assetId,
    columns.crop,
    updatedAt,
    nodeId,
  )
}

export const ALL_APPEARANCE_KINDS: ReadonlySet<NodeAppearanceKind> = new Set([
  'dot',
  'icon',
  'image',
  'card',
  'frame',
])

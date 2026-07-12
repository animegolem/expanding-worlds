import React from 'react';

/** Facet/filter chip (gallery facet bar, graph filters): full pill,
 * raised at rest, accent when on; tag facets use the active-tag form
 * with a ✕. */
export function FacetChip({ label, on, tag, onToggle, onClear, style }) {
  if (tag)
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.14rem 0.3rem 0.14rem 0.55rem', background: 'var(--ew-surface-raised)', border: '1px solid var(--ew-border-strong)', borderRadius: 999, fontSize: '0.78rem', color: 'var(--ew-text)', fontFamily: 'var(--ew-font-ui)', ...style }}>
        {label}
        <button type="button" onClick={onClear} style={{ padding: '0 0.15rem', background: 'transparent', border: 'none', color: 'var(--ew-text-muted)', fontSize: '0.7rem', cursor: 'pointer' }}>✕</button>
      </span>
    );
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        padding: '0.18rem 0.6rem',
        fontSize: '0.78rem',
        fontFamily: 'var(--ew-font-ui)',
        background: on ? 'var(--ew-accent)' : 'var(--ew-surface-raised)',
        color: on ? 'var(--ew-on-accent)' : 'var(--ew-text-muted)',
        border: `1px solid ${on ? 'var(--ew-accent)' : 'var(--ew-border-strong)'}`,
        borderRadius: 999,
        cursor: 'pointer',
        ...style,
      }}
    >
      {label}
    </button>
  );
}

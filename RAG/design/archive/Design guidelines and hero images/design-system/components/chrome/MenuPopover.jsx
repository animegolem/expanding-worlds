import React from 'react';

/** Anchored menu popover (☰ grammar, RFC §8.2): grows out of the
 * control that opened it. Rows: label + printed mono shortcut;
 * deferred rows rest at .45 with naming tooltips; dividers and
 * section labels for the library door's two sections. */
export function MenuPopover({ rows = [], style }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.2rem',
        padding: '0.35rem',
        background: 'var(--ew-surface-menu)',
        border: '1px solid var(--ew-border)',
        borderRadius: 7,
        whiteSpace: 'nowrap',
        fontFamily: 'var(--ew-font-ui)',
        width: 'fit-content',
        ...style,
      }}
    >
      {rows.map((r, i) => {
        if (r.divider) return <div key={i} style={{ height: 1, background: 'var(--ew-border)', margin: '0.15rem 0' }}></div>;
        if (r.section)
          return (
            <div key={i} style={{ padding: '0.25rem 0.6rem 0', fontSize: '0.75rem', color: 'var(--ew-text-muted)' }}>
              {r.section}
            </div>
          );
        return (
          <button
            key={i}
            type="button"
            title={r.deferred ? `${r.label} — coming soon` : undefined}
            onClick={r.onClick}
            onMouseEnter={(e) => { if (!r.deferred) e.currentTarget.style.background = 'var(--ew-surface-raised)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.8rem',
              justifyContent: 'space-between',
              padding: '0.25rem 0.6rem',
              textAlign: 'left',
              background: 'transparent',
              color: r.danger ? 'var(--ew-danger-muted)' : 'var(--ew-text)',
              border: 'none',
              borderRadius: 4,
              fontSize: '0.75rem',
              cursor: r.deferred ? 'default' : 'pointer',
              opacity: r.deferred ? 0.45 : 1,
              font: 'inherit',
            }}
          >
            <span style={{ fontSize: '0.75rem' }}>{r.label}</span>
            {r.shortcut && (
              <span style={{ fontFamily: 'var(--ew-font-mono)', fontSize: '0.7rem', opacity: 0.6 }}>{r.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

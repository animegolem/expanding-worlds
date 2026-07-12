import React from 'react';

/** Segmented pill control (gallery facets, source-panel tag-border
 * toggle): full-pill outer border, on-segment = accent fill. */
export function Segmented({ options = [], value, onChange, style }) {
  return (
    <span style={{ display: 'inline-flex', border: '1px solid var(--ew-border-strong)', borderRadius: 999, overflow: 'hidden', ...style }}>
      {options.map((opt, i) => (
        <button
          key={opt}
          type="button"
          onClick={onChange ? () => onChange(opt) : undefined}
          style={{
            padding: '0.2rem 0.65rem',
            fontSize: '0.78rem',
            fontFamily: 'var(--ew-font-ui)',
            background: value === opt ? 'var(--ew-accent)' : 'transparent',
            color: value === opt ? 'var(--ew-on-accent)' : 'var(--ew-text-muted)',
            border: 'none',
            borderLeft: i > 0 ? '1px solid var(--ew-border)' : 'none',
            cursor: 'pointer',
          }}
        >
          {opt}
        </button>
      ))}
    </span>
  );
}

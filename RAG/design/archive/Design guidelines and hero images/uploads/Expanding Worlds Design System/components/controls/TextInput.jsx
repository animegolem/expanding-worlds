import React from 'react';

/** Text input (search fields, tag fields, source prompt): input
 * surface, strong border. pill=true for facet-bar search fields.
 * NEVER back with <datalist> — completions are custom lists. */
export function TextInput({ value, placeholder, pill, prefix, onChange, style }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
      {prefix && <span style={{ color: 'var(--ew-text-muted)', fontWeight: 600, fontSize: '0.78rem' }}>{prefix}</span>}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        style={{
          width: '9rem',
          boxSizing: 'border-box',
          padding: '0.18rem 0.55rem',
          background: 'var(--ew-surface-input)',
          color: 'var(--ew-text)',
          border: '1px solid var(--ew-border-strong)',
          borderRadius: pill ? 999 : 5,
          font: 'inherit',
          fontSize: '0.78rem',
          fontFamily: 'var(--ew-font-ui)',
          outline: 'none',
          ...style,
        }}
      />
    </span>
  );
}

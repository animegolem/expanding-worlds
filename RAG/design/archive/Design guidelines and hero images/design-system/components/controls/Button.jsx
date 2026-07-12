import React from 'react';

/** Chrome button (shipped control grammar): raised surface, 1px
 * control border, 6px radius, hover lightens one surface step.
 * variant 'accent' = active/committed state; 'ghost' = borderless. */
export function Button({ children, variant = 'default', disabled, onClick, style }) {
  const [hover, setHover] = React.useState(false);
  const accent = variant === 'accent';
  const ghost = variant === 'ghost';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '0.2rem 0.7rem',
        background: accent
          ? 'var(--ew-accent)'
          : ghost
            ? hover && !disabled ? 'var(--ew-surface-raised)' : 'transparent'
            : hover && !disabled ? 'var(--ew-surface-control-hover)' : 'var(--ew-surface-raised)',
        color: accent ? 'var(--ew-on-accent)' : 'var(--ew-text)',
        border: ghost ? 'none' : `1px solid ${accent ? 'var(--ew-accent)' : 'var(--ew-border-control)'}`,
        borderRadius: 6,
        fontSize: '0.8rem',
        fontFamily: 'var(--ew-font-ui)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

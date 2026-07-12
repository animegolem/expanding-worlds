import React from 'react';

/** Toast (§8.6): transitions in and out of conditions. Bottom-right
 * stack; 6s lifetime; error = danger surface; success = green border. */
export function Toast({ children, kind = 'base', actionLabel, onAction, style }) {
  const err = kind === 'error';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        maxWidth: '26rem',
        width: 'fit-content',
        padding: '0.5rem 0.75rem',
        background: err ? 'var(--ew-danger-surface)' : 'var(--ew-surface)',
        color: err ? 'var(--ew-danger-text)' : 'var(--ew-text-soft)',
        border: `1px solid ${err ? 'var(--ew-danger-border)' : kind === 'success' ? 'var(--ew-success-border)' : 'var(--ew-border-panel)'}`,
        borderRadius: 7,
        fontSize: '0.85rem',
        fontFamily: 'var(--ew-font-ui)',
        ...style,
      }}
    >
      <span>{children}</span>
      {actionLabel && (
        <button type="button" onClick={onAction} style={{ flex: 'none', padding: '0.15rem 0.6rem', font: 'inherit', color: 'inherit', background: 'var(--ew-control-tint)', border: '1px solid var(--ew-border-panel)', borderRadius: 5, cursor: 'pointer' }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/** Selection action bar (gallery bulk select): floats bottom-center,
 * count pill in accent, actions beside. */
export function ActionBar({ count, actions = [], style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.45rem 0.6rem', background: 'var(--ew-surface-menu)', border: '1px solid var(--ew-border)', borderRadius: 10, boxShadow: '0 6px 22px var(--ew-shadow)', fontSize: '0.8rem', color: 'var(--ew-text)', width: 'fit-content', fontFamily: 'var(--ew-font-ui)', ...style }}>
      <span style={{ minWidth: '1.6rem', padding: '0.1rem 0.4rem', textAlign: 'center', fontWeight: 600, background: 'var(--ew-accent)', color: 'var(--ew-on-accent)', borderRadius: 999 }}>{count}</span>
      <span style={{ opacity: 0.7 }}>selected</span>
      {actions.map((a) => (
        <button key={a.label} type="button" onClick={a.onClick} style={{ padding: '0.2rem 0.65rem', background: 'var(--ew-surface-raised)', color: a.danger ? 'var(--ew-danger-muted)' : 'var(--ew-text)', border: '1px solid var(--ew-border-strong)', borderRadius: 6, font: 'inherit', cursor: 'pointer' }}>
          {a.label}
        </button>
      ))}
    </div>
  );
}

/** Takeover mode switcher (§7): ⊛ graph · ▤ outline · ⊞ gallery —
 * three projections of one database; enter anywhere, hop freely. */
export function ModeSwitcher({ mode = 'gallery', onChange, style }) {
  const modes = [
    { id: 'graph', label: '⊛ graph' },
    { id: 'outline', label: '▤ outline' },
    { id: 'gallery', label: '⊞ gallery' },
  ];
  return (
    <span style={{ display: 'inline-flex', border: '1px solid var(--ew-border)', borderRadius: 8, overflow: 'hidden', fontSize: 12, fontFamily: 'var(--ew-font-ui)', ...style }}>
      {modes.map((m, i) => (
        <button key={m.id} type="button" onClick={onChange ? () => onChange(m.id) : undefined} style={{ padding: '5px 14px', border: 'none', borderLeft: i > 0 ? '1px solid var(--ew-border)' : 'none', background: mode === m.id ? 'var(--ew-accent)' : 'transparent', color: mode === m.id ? 'var(--ew-on-accent)' : 'var(--ew-text-muted)', cursor: 'pointer', font: 'inherit' }}>
          {m.label}
        </button>
      ))}
    </span>
  );
}

/** Import progress strip: interruptible, never modal. 3px accent bar. */
export function ImportProgressStrip({ done = 0, total = 0, deduped = 0, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', maxWidth: '24rem', padding: '0.45rem 0.65rem', background: 'var(--ew-surface)', color: 'var(--ew-text-soft)', border: '1px solid var(--ew-border-panel)', borderRadius: 7, fontSize: '0.85rem', fontFamily: 'var(--ew-font-ui)', ...style }}>
      <span style={{ whiteSpace: 'nowrap' }}>importing {done} / {total}{deduped > 0 ? ` · ${deduped} already here` : ''}</span>
      <span style={{ flex: '1 1 5rem', minWidth: '5rem', height: 3, background: 'var(--ew-control-tint)', borderRadius: 2, overflow: 'hidden' }}>
        <span style={{ display: 'block', width: `${total ? Math.round((done / total) * 100) : 0}%`, height: '100%', background: 'var(--ew-accent)', borderRadius: 2 }}></span>
      </span>
      <button type="button" style={{ flex: 'none', padding: '0.1rem 0.45rem', font: 'inherit', color: 'inherit', background: 'var(--ew-control-tint)', border: '1px solid var(--ew-border-panel)', borderRadius: 5, cursor: 'pointer' }}>pause</button>
    </div>
  );
}

/** Recognition chip: transient offer riding the engagement fade —
 * ignoring it is the dismissal gesture. Full-pill scrim chip. */
export function RecognitionChip({ children, actions = [], style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', maxWidth: '26rem', width: 'fit-content', padding: '0.35rem 0.7rem', background: 'var(--ew-chip-scrim)', color: 'var(--ew-chip-text)', border: '1px solid var(--ew-border-panel)', borderRadius: 999, fontSize: '0.8rem', whiteSpace: 'nowrap', fontFamily: 'var(--ew-font-ui)', ...style }}>
      <span>{children}</span>
      {actions.map((a) => (
        <button key={a.label} type="button" onClick={a.onClick} style={{ padding: '0.15rem 0.6rem', background: 'var(--ew-surface-raised)', color: 'var(--ew-text)', border: '1px solid var(--ew-border-control)', borderRadius: 999, fontSize: '0.75rem', cursor: 'pointer' }}>
          {a.label}
        </button>
      ))}
    </div>
  );
}

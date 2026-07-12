import React from 'react';
import { HintCharm } from './NodeCard.jsx';

/** Selection charm bar (§4.3), beneath the selected node: crop ·
 * flip H · flip V · divider · make-canvas · note · tags # · lock.
 * Grows out of the selection like every panel grows from its control. */
export function CharmBar({ noteActive, onAction, style }) {
  const btn = (extra) => ({
    width: 26,
    height: 26,
    borderRadius: 7,
    color: 'var(--ew-text)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'var(--ew-font-ui)',
    ...extra,
  });
  const fire = (id) => (onAction ? () => onAction(id) : undefined);
  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        padding: '6px 8px',
        borderRadius: 10,
        background: 'var(--ew-surface-menu)',
        border: '1px solid var(--ew-border)',
        boxShadow: '0 8px 22px var(--ew-shadow)',
        whiteSpace: 'nowrap',
        width: 'fit-content',
        ...style,
      }}
    >
      <button type="button" title="Crop" onClick={fire('crop')} style={btn()}>⌗</button>
      <button type="button" title="Flip horizontal" onClick={fire('flipH')} style={btn()}>⇋</button>
      <button type="button" title="Flip vertical" onClick={fire('flipV')} style={btn()}>⇵</button>
      <span style={{ width: 1, height: 16, background: 'var(--ew-border)', margin: '0 3px' }}></span>
      <button type="button" title="Make canvas" onClick={fire('canvas')} style={btn()}><HintCharm kind="frame" muted style={{ width: 13, height: 12 }} /></button>
      <button type="button" title="Note" onClick={fire('note')} style={btn(noteActive ? { background: 'var(--ew-control-tint)', color: 'var(--ew-node-dot-orange)' } : {})}><HintCharm kind="page" muted style={{ width: 11, height: 14 }} /></button>
      <button type="button" title="Tags" onClick={fire('tags')} style={btn()}>#</button>
      <button type="button" title="Lock" onClick={fire('lock')} style={btn()}>⊘</button>
    </div>
  );
}

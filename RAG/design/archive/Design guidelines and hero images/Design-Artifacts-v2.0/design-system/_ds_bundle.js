/* @ds-bundle: {"format":4,"namespace":"ExpandingWorldsDesignSystem_5b63d5","components":[{"name":"CharmBar","sourcePath":"components/board/CharmBar.jsx"},{"name":"HintCharm","sourcePath":"components/board/NodeCard.jsx"},{"name":"NodeCard","sourcePath":"components/board/NodeCard.jsx"},{"name":"Charm","sourcePath":"components/chrome/Charm.jsx"},{"name":"CharmRail","sourcePath":"components/chrome/CharmRail.jsx"},{"name":"Dock","sourcePath":"components/chrome/Dock.jsx"},{"name":"MenuPopover","sourcePath":"components/chrome/MenuPopover.jsx"},{"name":"PathBar","sourcePath":"components/chrome/PathBar.jsx"},{"name":"TooltipChip","sourcePath":"components/chrome/TooltipChip.jsx"},{"name":"Button","sourcePath":"components/controls/Button.jsx"},{"name":"FacetChip","sourcePath":"components/controls/FacetChip.jsx"},{"name":"Segmented","sourcePath":"components/controls/Segmented.jsx"},{"name":"TagChip","sourcePath":"components/controls/TagChip.jsx"},{"name":"TextInput","sourcePath":"components/controls/TextInput.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"ActionBar","sourcePath":"components/feedback/Toast.jsx"},{"name":"ModeSwitcher","sourcePath":"components/feedback/Toast.jsx"},{"name":"ImportProgressStrip","sourcePath":"components/feedback/Toast.jsx"},{"name":"RecognitionChip","sourcePath":"components/feedback/Toast.jsx"},{"name":"NotePanel","sourcePath":"components/panels/NotePanel.jsx"},{"name":"WikiLink","sourcePath":"components/panels/NotePanel.jsx"},{"name":"Panel","sourcePath":"components/panels/Panel.jsx"}],"sourceHashes":{"components/board/CharmBar.jsx":"3798af9e5978","components/board/NodeCard.jsx":"26711daccb76","components/chrome/Charm.jsx":"a53578290276","components/chrome/CharmRail.jsx":"76f7eda14e7c","components/chrome/Dock.jsx":"9ec64c2b1f2a","components/chrome/MenuPopover.jsx":"b192e9c7a118","components/chrome/PathBar.jsx":"f3cdab92ab35","components/chrome/TooltipChip.jsx":"c55afd5f1d66","components/controls/Button.jsx":"a47f7ded676c","components/controls/FacetChip.jsx":"df1b43f88f4b","components/controls/Segmented.jsx":"80c1d073b3fa","components/controls/TagChip.jsx":"83d2ae3868d0","components/controls/TextInput.jsx":"f337045cfaaa","components/feedback/Toast.jsx":"79bfe8a2ee7f","components/panels/NotePanel.jsx":"febc17304873","components/panels/Panel.jsx":"9b8c80667172"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.ExpandingWorldsDesignSystem_5b63d5 = window.ExpandingWorldsDesignSystem_5b63d5 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/board/NodeCard.jsx
try { (() => {
/** Drawn hint charms (§4.1) — built from bordered divs, not glyphs.
 * page = has a note · frame = has a nested canvas. */
function HintCharm({
  kind = 'page',
  muted,
  style
}) {
  const ink = muted ? 'var(--ew-text-muted)' : 'rgba(255,255,255,.92)';
  const bg = muted ? 'var(--ew-chip-bg, var(--ew-control-tint))' : 'var(--ew-art-chip-scrim)';
  if (kind === 'frame') return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 17,
      height: 17,
      border: `1.5px solid ${ink}`,
      borderRadius: 2.5,
      background: bg,
      position: 'relative',
      overflow: 'hidden',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 3,
      top: 3,
      width: 4,
      height: 4,
      border: `1.2px solid ${ink}`,
      borderRadius: '50%'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 5,
      bottom: -1,
      width: 0,
      height: 0,
      borderLeft: '5px solid transparent',
      borderRight: '5px solid transparent',
      borderBottom: `8px solid ${ink}`
    }
  }));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 14,
      height: 17,
      border: `1.5px solid ${ink}`,
      borderRadius: 2.5,
      background: bg,
      position: 'relative',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 3,
      top: 4,
      right: 3,
      borderTop: `1.5px solid ${ink}`
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 3,
      top: 8,
      right: 5,
      borderTop: `1.5px solid ${ink}`
    }
  }));
}

/** A placed node on the board (world content: FLAT, 3px radius, soft
 * drop shadow, never a panel). Selection = thin accent outline, no
 * drawn handles ever. Hint charms sit INSIDE the lower-right corner
 * at rest opacity .7 — a glanceable census. */
function NodeCard({
  title,
  src,
  stripes = '115deg,#4a5560,#414b55',
  width = 190,
  height = 250,
  label,
  hasNote,
  hasCanvas,
  selected,
  hit,
  dimmed,
  onClick,
  style
}) {
  const [angle, c1, c2] = stripes.split(',');
  const outline = selected ? '2px solid var(--ew-accent)' : hit ? '2px solid var(--ew-node-dot-orange)' : 'none';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      opacity: dimmed ? 0.18 : 1,
      ...style
    },
    onClick: onClick
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width,
      height,
      borderRadius: 3,
      background: src ? `center/cover no-repeat url(${src})` : `repeating-linear-gradient(${angle}, ${c1} 0 12px, ${c2} 12px 24px)`,
      boxShadow: dimmed ? 'none' : 'var(--ew-node-shadow)',
      outline,
      outlineOffset: 3,
      cursor: onClick ? 'pointer' : 'default'
    }
  }, !src && label && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      font: '11px var(--ew-font-mono)',
      color: 'rgba(255,255,255,.38)'
    }
  }, label), (hasNote || hasCanvas) && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      right: 6,
      bottom: 6,
      display: 'flex',
      gap: 4,
      opacity: 'var(--ew-hint-charm-rest-opacity)'
    }
  }, hasNote && /*#__PURE__*/React.createElement(HintCharm, {
    kind: "page"
  }), hasCanvas && /*#__PURE__*/React.createElement(HintCharm, {
    kind: "frame"
  }))), title && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      textAlign: 'center',
      fontSize: 12,
      color: 'var(--ew-text-muted)',
      fontFamily: 'var(--ew-font-ui)'
    }
  }, title));
}
Object.assign(__ds_scope, { HintCharm, NodeCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/board/NodeCard.jsx", error: String((e && e.message) || e) }); }

// components/board/CharmBar.jsx
try { (() => {
/** Selection charm bar (§4.3), beneath the selected node: crop ·
 * flip H · flip V · divider · make-canvas · note · tags # · lock.
 * Grows out of the selection like every panel grows from its control. */
function CharmBar({
  noteActive,
  onAction,
  style
}) {
  const btn = extra => ({
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
    ...extra
  });
  const fire = id => onAction ? () => onAction(id) : undefined;
  return /*#__PURE__*/React.createElement("div", {
    style: {
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
      ...style
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "Crop",
    onClick: fire('crop'),
    style: btn()
  }, "\u2317"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "Flip horizontal",
    onClick: fire('flipH'),
    style: btn()
  }, "\u21CB"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "Flip vertical",
    onClick: fire('flipV'),
    style: btn()
  }, "\u21F5"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 1,
      height: 16,
      background: 'var(--ew-border)',
      margin: '0 3px'
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "Make canvas",
    onClick: fire('canvas'),
    style: btn()
  }, /*#__PURE__*/React.createElement(__ds_scope.HintCharm, {
    kind: "frame",
    muted: true,
    style: {
      width: 13,
      height: 12
    }
  })), /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "Note",
    onClick: fire('note'),
    style: btn(noteActive ? {
      background: 'var(--ew-control-tint)',
      color: 'var(--ew-node-dot-orange)'
    } : {})
  }, /*#__PURE__*/React.createElement(__ds_scope.HintCharm, {
    kind: "page",
    muted: true,
    style: {
      width: 11,
      height: 14
    }
  })), /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "Tags",
    onClick: fire('tags'),
    style: btn()
  }, "#"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "Lock",
    onClick: fire('lock'),
    style: btn()
  }, "\u2298"));
}
Object.assign(__ds_scope, { CharmBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/board/CharmBar.jsx", error: String((e && e.message) || e) }); }

// components/chrome/Charm.jsx
try { (() => {
/** Mode-rail charm button (RFC §8.2). 2rem square, 7px radius,
 * rail surface; active = accent fill + on-accent ink; deferred rests
 * at .45 opacity. Glyphs: ⧉ ⌕ ⊛ ⊞ ▤ ☰ (rail) · ⚠ (perch). */
function Charm({
  glyph,
  label,
  active,
  deferred,
  warn,
  count,
  onClick,
  style
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": label,
    title: label,
    onClick: onClick,
    style: {
      position: 'relative',
      width: '2rem',
      height: '2rem',
      display: 'grid',
      placeItems: 'center',
      fontSize: '1rem',
      fontFamily: 'var(--ew-font-ui)',
      background: active ? 'var(--ew-accent)' : 'var(--ew-surface-rail)',
      color: warn ? 'var(--ew-warn)' : active ? 'var(--ew-on-accent)' : 'var(--ew-text)',
      border: `1px solid ${active ? 'var(--ew-accent)' : warn ? 'var(--ew-warn-border)' : 'var(--ew-border)'}`,
      borderRadius: 7,
      cursor: deferred ? 'default' : 'pointer',
      opacity: deferred ? 0.45 : 1,
      ...style
    }
  }, glyph, count != null && count > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: '-0.3rem',
      right: '-0.3rem',
      minWidth: '0.9rem',
      height: '0.9rem',
      padding: '0 0.15rem',
      display: 'grid',
      placeItems: 'center',
      background: 'var(--ew-danger)',
      color: 'var(--ew-on-danger)',
      borderRadius: '0.45rem',
      fontSize: '0.6rem',
      lineHeight: 1
    }
  }, count));
}
Object.assign(__ds_scope, { Charm });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/chrome/Charm.jsx", error: String((e && e.message) || e) }); }

// components/chrome/CharmRail.jsx
try { (() => {
/** The vertical mode charm rail, upper-right (RFC §8.2): project ⧉ ·
 * search ⌕ · graph ⊛ · gallery ⊞ · outline ▤ · menu ☰. An ongoing-
 * condition ⚠ perch appends below only while a condition holds.
 * Chrome rests at 0.92 opacity on the shared engagement clock. */
function CharmRail({
  active,
  conditionCount = 0,
  floating = true,
  onSelect,
  style
}) {
  const charms = [{
    id: 'project',
    glyph: '⧉',
    label: 'Library'
  }, {
    id: 'search',
    glyph: '⌕',
    label: 'Search'
  }, {
    id: 'graph',
    glyph: '⊛',
    label: 'Graph'
  }, {
    id: 'gallery',
    glyph: '⊞',
    label: 'Gallery'
  }, {
    id: 'outline',
    glyph: '▤',
    label: 'Outline'
  }, {
    id: 'menu',
    glyph: '☰',
    label: 'Menu'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: floating ? 'absolute' : 'relative',
      ...(floating ? {
        top: '2.4rem',
        right: '0.6rem'
      } : {}),
      display: 'flex',
      flexDirection: 'column',
      gap: '0.35rem',
      opacity: 'var(--ew-chrome-rest-opacity)',
      ...style
    }
  }, charms.map(c => /*#__PURE__*/React.createElement(__ds_scope.Charm, {
    key: c.id,
    glyph: c.glyph,
    label: c.label,
    active: active === c.id,
    onClick: onSelect ? () => onSelect(c.id) : undefined
  })), conditionCount > 0 && /*#__PURE__*/React.createElement(__ds_scope.Charm, {
    glyph: "\u26A0",
    label: "Ongoing conditions",
    warn: true,
    count: conditionCount
  }));
}
Object.assign(__ds_scope, { CharmRail });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/chrome/CharmRail.jsx", error: String((e && e.message) || e) }); }

// components/chrome/Dock.jsx
try { (() => {
const toolBtn = active => ({
  minWidth: '1.9rem',
  height: '1.9rem',
  display: 'inline-grid',
  placeItems: 'center',
  fontSize: '0.95rem',
  padding: '0.15rem 0.45rem',
  background: active ? 'var(--ew-accent)' : 'var(--ew-surface-raised)',
  color: active ? 'var(--ew-on-accent)' : 'var(--ew-text)',
  border: `1px solid ${active ? 'var(--ew-accent)' : 'var(--ew-border-strong)'}`,
  borderRadius: 5,
  cursor: 'pointer',
  fontFamily: 'var(--ew-font-ui)'
});

/** The floating dock, bottom-center (RFC §8.2): tool modes (shapes
 * behind one flyout) · divider · zoom cluster. Nothing docks; the
 * dock floats over the board and never reflows it. */
function Dock({
  activeTool = 'select',
  zoomPct = 100,
  shapeGlyph = '▭',
  floating = true,
  onTool,
  onZoom,
  style
}) {
  const tools = [{
    kind: 'select',
    glyph: '⬚',
    label: 'Select'
  }, {
    kind: 'text',
    glyph: 'T',
    label: 'Text'
  }, {
    kind: 'shapes',
    glyph: shapeGlyph,
    label: 'Shapes'
  }, {
    kind: 'path',
    glyph: '✎',
    label: 'Draw'
  }, {
    kind: 'line',
    glyph: '╱',
    label: 'Line'
  }, {
    kind: 'arrow',
    glyph: '↗',
    label: 'Arrow'
  }, {
    kind: 'connector',
    glyph: '⌁',
    label: 'Connector'
  }, {
    kind: 'pin',
    glyph: '◉',
    label: 'Pin'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: floating ? 'absolute' : 'relative',
      ...(floating ? {
        bottom: '0.6rem',
        left: '50%',
        transform: 'translateX(-50%)'
      } : {}),
      display: 'flex',
      alignItems: 'center',
      gap: '0.25rem',
      padding: '0.3rem 0.45rem',
      background: 'var(--ew-surface)',
      border: '1px solid var(--ew-border)',
      borderRadius: 9,
      fontSize: '0.75rem',
      color: 'var(--ew-text)',
      opacity: 'var(--ew-chrome-rest-opacity)',
      ...style
    }
  }, tools.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.kind,
    type: "button",
    title: t.label,
    style: toolBtn(activeTool === t.kind),
    onClick: onTool ? () => onTool(t.kind) : undefined
  }, t.glyph)), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 1,
      height: '1.4rem',
      background: 'var(--ew-border-strong)',
      margin: '0 0.25rem'
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "Zoom out",
    style: toolBtn(false),
    onClick: onZoom ? () => onZoom(-1) : undefined
  }, "\u2212"), /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: '3.1rem',
      textAlign: 'center',
      fontVariantNumeric: 'tabular-nums',
      opacity: 0.85
    }
  }, zoomPct, "%"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "Zoom in",
    style: toolBtn(false),
    onClick: onZoom ? () => onZoom(1) : undefined
  }, "+"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "Zoom to fit",
    style: toolBtn(false),
    onClick: onZoom ? () => onZoom(0) : undefined
  }, "\u2922"));
}
Object.assign(__ds_scope, { Dock });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/chrome/Dock.jsx", error: String((e && e.message) || e) }); }

// components/chrome/MenuPopover.jsx
try { (() => {
/** Anchored menu popover (☰ grammar, RFC §8.2): grows out of the
 * control that opened it. Rows: label + printed mono shortcut;
 * deferred rows rest at .45 with naming tooltips; dividers and
 * section labels for the library door's two sections. */
function MenuPopover({
  rows = [],
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
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
      ...style
    }
  }, rows.map((r, i) => {
    if (r.divider) return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        height: 1,
        background: 'var(--ew-border)',
        margin: '0.15rem 0'
      }
    });
    if (r.section) return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        padding: '0.25rem 0.6rem 0',
        fontSize: '0.75rem',
        color: 'var(--ew-text-muted)'
      }
    }, r.section);
    return /*#__PURE__*/React.createElement("button", {
      key: i,
      type: "button",
      title: r.deferred ? `${r.label} — coming soon` : undefined,
      onClick: r.onClick,
      onMouseEnter: e => {
        if (!r.deferred) e.currentTarget.style.background = 'var(--ew-surface-raised)';
      },
      onMouseLeave: e => {
        e.currentTarget.style.background = 'transparent';
      },
      style: {
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
        font: 'inherit'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: '0.75rem'
      }
    }, r.label), r.shortcut && /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--ew-font-mono)',
        fontSize: '0.7rem',
        opacity: 0.6
      }
    }, r.shortcut));
  }));
}
Object.assign(__ds_scope, { MenuPopover });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/chrome/MenuPopover.jsx", error: String((e && e.message) || e) }); }

// components/chrome/PathBar.jsx
try { (() => {
/** Navigation path bar, upper-left (RFC §8.1): renders the ENTRY
 * ROUTE (a back-stack), not structural ancestry. ⌂ home at the head,
 * hover-revealed ‹ › arrows, bookmark pin (teardrop) at the tail —
 * pins mean places, everywhere. */
function PathBar({
  crumbs = ['Homeworld'],
  pinOpen,
  floating = true,
  onCrumb,
  onPin,
  style
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      position: floating ? 'absolute' : 'relative',
      ...(floating ? {
        top: '0.55rem',
        left: '0.6rem'
      } : {}),
      width: 'fit-content',
      display: 'flex',
      alignItems: 'center',
      gap: '0.15rem',
      padding: '0.15rem 0.3rem',
      background: 'var(--ew-surface-subtle)',
      border: '1px solid var(--ew-border)',
      borderRadius: 7,
      fontSize: '0.75rem',
      color: 'var(--ew-text)',
      fontFamily: 'var(--ew-font-ui)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "Home",
    style: crumbBtn
  }, "\u2302"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      opacity: hover ? 1 : 0,
      transition: 'opacity 120ms ease-out'
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "Back",
    style: crumbBtn
  }, "\u2039"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "Forward",
    style: {
      ...crumbBtn,
      opacity: 0.35
    }
  }, "\u203A")), crumbs.map((c, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.4
    }
  }, "\u25B8"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onCrumb ? () => onCrumb(i) : undefined,
    style: {
      ...crumbBtn,
      color: i === crumbs.length - 1 ? 'var(--ew-accent-soft)' : 'var(--ew-text)'
    }
  }, c))), /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "Bookmarks",
    onClick: onPin,
    style: {
      ...crumbBtn,
      display: 'inline-grid',
      placeItems: 'center',
      minWidth: '1.6rem',
      minHeight: '1.3rem',
      marginLeft: '0.15rem'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 9,
      height: 9,
      border: `1.5px solid ${pinOpen ? 'var(--ew-accent-soft)' : 'var(--ew-text)'}`,
      background: pinOpen ? 'var(--ew-accent-soft)' : 'transparent',
      borderRadius: '50% 50% 50% 0',
      transform: `rotate(-45deg) translateY(${pinOpen ? 1 : -1}px)`,
      transition: 'background 120ms ease-out, transform 120ms ease-out',
      display: 'block'
    }
  })));
}
const crumbBtn = {
  padding: '0.1rem 0.4rem',
  background: 'transparent',
  color: 'var(--ew-text)',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  font: 'inherit'
};
Object.assign(__ds_scope, { PathBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/chrome/PathBar.jsx", error: String((e && e.message) || e) }); }

// components/chrome/TooltipChip.jsx
try { (() => {
/** The one tooltip chip style, app-wide (RFC §8.2): every hoverable
 * control names itself and prints its shortcut. ~500ms delay in app. */
function TooltipChip({
  name,
  shortcut,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.22rem 0.55rem',
      background: 'var(--ew-tooltip-scrim)',
      color: 'var(--ew-chip-text)',
      border: '1px solid var(--ew-chip-border)',
      borderRadius: 5,
      fontSize: '0.72rem',
      fontFamily: 'var(--ew-font-ui)',
      whiteSpace: 'nowrap',
      ...style
    }
  }, name, shortcut && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--ew-font-mono)',
      opacity: 0.65
    }
  }, shortcut));
}
Object.assign(__ds_scope, { TooltipChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/chrome/TooltipChip.jsx", error: String((e && e.message) || e) }); }

// components/controls/Button.jsx
try { (() => {
/** Chrome button (shipped control grammar): raised surface, 1px
 * control border, 6px radius, hover lightens one surface step.
 * variant 'accent' = active/committed state; 'ghost' = borderless. */
function Button({
  children,
  variant = 'default',
  disabled,
  onClick,
  style
}) {
  const [hover, setHover] = React.useState(false);
  const accent = variant === 'accent';
  const ghost = variant === 'ghost';
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    disabled: disabled,
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      padding: '0.2rem 0.7rem',
      background: accent ? 'var(--ew-accent)' : ghost ? hover && !disabled ? 'var(--ew-surface-raised)' : 'transparent' : hover && !disabled ? 'var(--ew-surface-control-hover)' : 'var(--ew-surface-raised)',
      color: accent ? 'var(--ew-on-accent)' : 'var(--ew-text)',
      border: ghost ? 'none' : `1px solid ${accent ? 'var(--ew-accent)' : 'var(--ew-border-control)'}`,
      borderRadius: 6,
      fontSize: '0.8rem',
      fontFamily: 'var(--ew-font-ui)',
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/controls/Button.jsx", error: String((e && e.message) || e) }); }

// components/controls/FacetChip.jsx
try { (() => {
/** Facet/filter chip (gallery facet bar, graph filters): full pill,
 * raised at rest, accent when on; tag facets use the active-tag form
 * with a ✕. */
function FacetChip({
  label,
  on,
  tag,
  onToggle,
  onClear,
  style
}) {
  if (tag) return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem',
      padding: '0.14rem 0.3rem 0.14rem 0.55rem',
      background: 'var(--ew-surface-raised)',
      border: '1px solid var(--ew-border-strong)',
      borderRadius: 999,
      fontSize: '0.78rem',
      color: 'var(--ew-text)',
      fontFamily: 'var(--ew-font-ui)',
      ...style
    }
  }, label, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClear,
    style: {
      padding: '0 0.15rem',
      background: 'transparent',
      border: 'none',
      color: 'var(--ew-text-muted)',
      fontSize: '0.7rem',
      cursor: 'pointer'
    }
  }, "\u2715"));
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onToggle,
    style: {
      padding: '0.18rem 0.6rem',
      fontSize: '0.78rem',
      fontFamily: 'var(--ew-font-ui)',
      background: on ? 'var(--ew-accent)' : 'var(--ew-surface-raised)',
      color: on ? 'var(--ew-on-accent)' : 'var(--ew-text-muted)',
      border: `1px solid ${on ? 'var(--ew-accent)' : 'var(--ew-border-strong)'}`,
      borderRadius: 999,
      cursor: 'pointer',
      ...style
    }
  }, label);
}
Object.assign(__ds_scope, { FacetChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/controls/FacetChip.jsx", error: String((e && e.message) || e) }); }

// components/controls/Segmented.jsx
try { (() => {
/** Segmented pill control (gallery facets, source-panel tag-border
 * toggle): full-pill outer border, on-segment = accent fill. */
function Segmented({
  options = [],
  value,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      border: '1px solid var(--ew-border-strong)',
      borderRadius: 999,
      overflow: 'hidden',
      ...style
    }
  }, options.map((opt, i) => /*#__PURE__*/React.createElement("button", {
    key: opt,
    type: "button",
    onClick: onChange ? () => onChange(opt) : undefined,
    style: {
      padding: '0.2rem 0.65rem',
      fontSize: '0.78rem',
      fontFamily: 'var(--ew-font-ui)',
      background: value === opt ? 'var(--ew-accent)' : 'transparent',
      color: value === opt ? 'var(--ew-on-accent)' : 'var(--ew-text-muted)',
      border: 'none',
      borderLeft: i > 0 ? '1px solid var(--ew-border)' : 'none',
      cursor: 'pointer'
    }
  }, opt)));
}
Object.assign(__ds_scope, { Segmented });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/controls/Segmented.jsx", error: String((e && e.message) || e) }); }

// components/controls/TagChip.jsx
try { (() => {
/** Tag chip. Two habitats: on='paper' (note panel header — paper chip
 * tokens, 8px radius) and on='dark' (chrome scrim chip). Mono #tag. */
function TagChip({
  tag,
  on = 'paper',
  onClick,
  style
}) {
  const paper = on === 'paper';
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClick,
    style: {
      padding: paper ? '0 0.45rem' : '0.14rem 0.55rem',
      border: `1px solid ${paper ? 'var(--ew-paper-chip-border)' : 'var(--ew-chip-border)'}`,
      borderRadius: paper ? 8 : 9,
      background: paper ? 'var(--ew-paper-chip-surface)' : 'var(--ew-chip-scrim)',
      color: paper ? 'var(--ew-paper-chip-text)' : 'var(--ew-chip-text)',
      fontSize: '0.7rem',
      fontFamily: 'var(--ew-font-mono)',
      cursor: onClick ? 'pointer' : 'default',
      ...style
    }
  }, "#", String(tag).replace(/^#/, ''));
}
Object.assign(__ds_scope, { TagChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/controls/TagChip.jsx", error: String((e && e.message) || e) }); }

// components/controls/TextInput.jsx
try { (() => {
/** Text input (search fields, tag fields, source prompt): input
 * surface, strong border. pill=true for facet-bar search fields.
 * NEVER back with <datalist> — completions are custom lists. */
function TextInput({
  value,
  placeholder,
  pill,
  prefix,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem'
    }
  }, prefix && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ew-text-muted)',
      fontWeight: 600,
      fontSize: '0.78rem'
    }
  }, prefix), /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: value,
    placeholder: placeholder,
    onChange: onChange ? e => onChange(e.target.value) : undefined,
    style: {
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
      ...style
    }
  }));
}
Object.assign(__ds_scope, { TextInput });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/controls/TextInput.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
/** Toast (§8.6): transitions in and out of conditions. Bottom-right
 * stack; 6s lifetime; error = danger surface; success = green border. */
function Toast({
  children,
  kind = 'base',
  actionLabel,
  onAction,
  style
}) {
  const err = kind === 'error';
  return /*#__PURE__*/React.createElement("div", {
    style: {
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
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", null, children), actionLabel && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onAction,
    style: {
      flex: 'none',
      padding: '0.15rem 0.6rem',
      font: 'inherit',
      color: 'inherit',
      background: 'var(--ew-control-tint)',
      border: '1px solid var(--ew-border-panel)',
      borderRadius: 5,
      cursor: 'pointer'
    }
  }, actionLabel));
}

/** Selection action bar (gallery bulk select): floats bottom-center,
 * count pill in accent, actions beside. */
function ActionBar({
  count,
  actions = [],
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.45rem',
      padding: '0.45rem 0.6rem',
      background: 'var(--ew-surface-menu)',
      border: '1px solid var(--ew-border)',
      borderRadius: 10,
      boxShadow: '0 6px 22px var(--ew-shadow)',
      fontSize: '0.8rem',
      color: 'var(--ew-text)',
      width: 'fit-content',
      fontFamily: 'var(--ew-font-ui)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: '1.6rem',
      padding: '0.1rem 0.4rem',
      textAlign: 'center',
      fontWeight: 600,
      background: 'var(--ew-accent)',
      color: 'var(--ew-on-accent)',
      borderRadius: 999
    }
  }, count), /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.7
    }
  }, "selected"), actions.map(a => /*#__PURE__*/React.createElement("button", {
    key: a.label,
    type: "button",
    onClick: a.onClick,
    style: {
      padding: '0.2rem 0.65rem',
      background: 'var(--ew-surface-raised)',
      color: a.danger ? 'var(--ew-danger-muted)' : 'var(--ew-text)',
      border: '1px solid var(--ew-border-strong)',
      borderRadius: 6,
      font: 'inherit',
      cursor: 'pointer'
    }
  }, a.label)));
}

/** Takeover mode switcher (§7): ⊛ graph · ▤ outline · ⊞ gallery —
 * three projections of one database; enter anywhere, hop freely. */
function ModeSwitcher({
  mode = 'gallery',
  onChange,
  style
}) {
  const modes = [{
    id: 'graph',
    label: '⊛ graph'
  }, {
    id: 'outline',
    label: '▤ outline'
  }, {
    id: 'gallery',
    label: '⊞ gallery'
  }];
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      border: '1px solid var(--ew-border)',
      borderRadius: 8,
      overflow: 'hidden',
      fontSize: 12,
      fontFamily: 'var(--ew-font-ui)',
      ...style
    }
  }, modes.map((m, i) => /*#__PURE__*/React.createElement("button", {
    key: m.id,
    type: "button",
    onClick: onChange ? () => onChange(m.id) : undefined,
    style: {
      padding: '5px 14px',
      border: 'none',
      borderLeft: i > 0 ? '1px solid var(--ew-border)' : 'none',
      background: mode === m.id ? 'var(--ew-accent)' : 'transparent',
      color: mode === m.id ? 'var(--ew-on-accent)' : 'var(--ew-text-muted)',
      cursor: 'pointer',
      font: 'inherit'
    }
  }, m.label)));
}

/** Import progress strip: interruptible, never modal. 3px accent bar. */
function ImportProgressStrip({
  done = 0,
  total = 0,
  deduped = 0,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.6rem',
      maxWidth: '24rem',
      padding: '0.45rem 0.65rem',
      background: 'var(--ew-surface)',
      color: 'var(--ew-text-soft)',
      border: '1px solid var(--ew-border-panel)',
      borderRadius: 7,
      fontSize: '0.85rem',
      fontFamily: 'var(--ew-font-ui)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      whiteSpace: 'nowrap'
    }
  }, "importing ", done, " / ", total, deduped > 0 ? ` · ${deduped} already here` : ''), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: '1 1 5rem',
      minWidth: '5rem',
      height: 3,
      background: 'var(--ew-control-tint)',
      borderRadius: 2,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      width: `${total ? Math.round(done / total * 100) : 0}%`,
      height: '100%',
      background: 'var(--ew-accent)',
      borderRadius: 2
    }
  })), /*#__PURE__*/React.createElement("button", {
    type: "button",
    style: {
      flex: 'none',
      padding: '0.1rem 0.45rem',
      font: 'inherit',
      color: 'inherit',
      background: 'var(--ew-control-tint)',
      border: '1px solid var(--ew-border-panel)',
      borderRadius: 5,
      cursor: 'pointer'
    }
  }, "pause"));
}

/** Recognition chip: transient offer riding the engagement fade —
 * ignoring it is the dismissal gesture. Full-pill scrim chip. */
function RecognitionChip({
  children,
  actions = [],
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.6rem',
      maxWidth: '26rem',
      width: 'fit-content',
      padding: '0.35rem 0.7rem',
      background: 'var(--ew-chip-scrim)',
      color: 'var(--ew-chip-text)',
      border: '1px solid var(--ew-border-panel)',
      borderRadius: 999,
      fontSize: '0.8rem',
      whiteSpace: 'nowrap',
      fontFamily: 'var(--ew-font-ui)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", null, children), actions.map(a => /*#__PURE__*/React.createElement("button", {
    key: a.label,
    type: "button",
    onClick: a.onClick,
    style: {
      padding: '0.15rem 0.6rem',
      background: 'var(--ew-surface-raised)',
      color: 'var(--ew-text)',
      border: '1px solid var(--ew-border-control)',
      borderRadius: 999,
      fontSize: '0.75rem',
      cursor: 'pointer'
    }
  }, a.label)));
}
Object.assign(__ds_scope, { Toast, ActionBar, ModeSwitcher, ImportProgressStrip, RecognitionChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/panels/NotePanel.jsx
try { (() => {
/** Note panel (§8.5): notes are light PAPER even in dark theme.
 * Tethered = a glance (one at a time, dashed tail to its node);
 * pinned = a commitment (accumulate, stronger border + shadow, ⇱).
 * Header always shows ⌖ n places; origin label appears only when the
 * node lives on another board. */
function NotePanel({
  title,
  tags = [],
  places = 1,
  pinned,
  origin,
  dirty,
  width = 340,
  height,
  children,
  onPin,
  onClose,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      width,
      height,
      boxSizing: 'border-box',
      overflow: 'hidden',
      background: 'var(--ew-paper-surface)',
      border: `1px solid ${pinned ? 'var(--ew-paper-pinned-border)' : 'var(--ew-paper-border-strong)'}`,
      borderRadius: 9,
      boxShadow: pinned ? '0 10px 30px var(--ew-shadow)' : '0 6px 22px var(--ew-shadow)',
      fontFamily: 'var(--ew-font-ui)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.3rem',
      padding: '0.4rem 0.45rem 0.25rem',
      cursor: pinned ? 'grab' : 'default'
    }
  }, origin && /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 'none',
      maxWidth: '9rem',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      padding: '0.05rem 0.4rem',
      border: '1px solid var(--ew-paper-info-border)',
      borderRadius: 9,
      background: 'var(--ew-paper-info-panel)',
      color: 'var(--ew-paper-info-text)',
      fontSize: '0.7rem',
      cursor: 'pointer'
    }
  }, "\u2302 ", origin), /*#__PURE__*/React.createElement("h2", {
    style: {
      flex: 1,
      margin: 0,
      overflow: 'hidden',
      fontSize: '0.85rem',
      fontWeight: 600,
      color: 'var(--ew-paper-text-heading)',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, title, dirty && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: '0.3rem',
      color: 'var(--ew-paper-dirty)',
      fontSize: '0.6rem',
      verticalAlign: 'middle'
    }
  }, "\u25CF")), /*#__PURE__*/React.createElement("button", {
    type: "button",
    style: paperBtn,
    title: `${places} places`
  }, "\u2316 ", places, " ", places === 1 ? 'place' : 'places'), onPin && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onPin,
    style: paperBtn,
    title: pinned ? 'Unpin' : 'Pin'
  }, "\u21F1"), onClose && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClose,
    style: paperBtn,
    title: "Close"
  }, "\u2715")), tags.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '0.25rem',
      padding: '0 0.55rem 0.3rem'
    }
  }, tags.map(t => /*#__PURE__*/React.createElement(__ds_scope.TagChip, {
    key: t,
    tag: t,
    on: "paper"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      overflow: 'auto',
      fontSize: '0.85rem',
      background: 'var(--ew-paper-page)',
      color: 'var(--ew-paper-text)',
      padding: '0.5rem 0.65rem',
      lineHeight: 1.6
    }
  }, children));
}
const paperBtn = {
  flex: 'none',
  padding: '0 0.3rem',
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  fontSize: '0.72rem',
  color: 'var(--ew-paper-text-muted)',
  cursor: 'pointer',
  whiteSpace: 'nowrap'
};

/** Wiki-link span for note bodies: bound blue · unresolved purple ·
 * broken red+wavy (grey = recoverable-trashed). */
function WikiLink({
  state = 'bound',
  children
}) {
  const color = `var(--ew-link-${state})`;
  const deco = state === 'broken' ? 'underline wavy' : 'underline';
  return /*#__PURE__*/React.createElement("span", {
    style: {
      color,
      textDecoration: deco,
      textDecorationColor: `var(--ew-link-${state}-decoration)`,
      textUnderlineOffset: 2,
      cursor: 'pointer'
    }
  }, children);
}
Object.assign(__ds_scope, { NotePanel, WikiLink });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/panels/NotePanel.jsx", error: String((e && e.message) || e) }); }

// components/panels/Panel.jsx
try { (() => {
/** Screen-space panel shell (§8.5 grammar): shadow = screen-space.
 * Menu surface, strong border, 9px radius, grab-cursor header, ✕. */
function Panel({
  title,
  headerExtra,
  width = 360,
  children,
  onClose,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      width,
      overflow: 'hidden',
      background: 'var(--ew-surface-menu)',
      border: '1px solid var(--ew-border-strong)',
      borderRadius: 9,
      boxShadow: '0 10px 30px var(--ew-shadow)',
      fontSize: '0.78rem',
      color: 'var(--ew-text)',
      fontFamily: 'var(--ew-font-ui)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '0.5rem',
      padding: '0.4rem 0.4rem 0.4rem 0.7rem',
      borderBottom: '1px solid var(--ew-border)',
      cursor: 'grab',
      userSelect: 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, title), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.4rem'
    }
  }, headerExtra, onClose && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClose,
    style: {
      flex: 'none',
      padding: '0.1rem 0.4rem',
      background: 'transparent',
      color: 'var(--ew-text-muted)',
      border: 'none',
      borderRadius: 4,
      font: 'inherit',
      cursor: 'pointer'
    }
  }, "\u2715"))), children);
}
Object.assign(__ds_scope, { Panel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/panels/Panel.jsx", error: String((e && e.message) || e) }); }

__ds_ns.CharmBar = __ds_scope.CharmBar;

__ds_ns.HintCharm = __ds_scope.HintCharm;

__ds_ns.NodeCard = __ds_scope.NodeCard;

__ds_ns.Charm = __ds_scope.Charm;

__ds_ns.CharmRail = __ds_scope.CharmRail;

__ds_ns.Dock = __ds_scope.Dock;

__ds_ns.MenuPopover = __ds_scope.MenuPopover;

__ds_ns.PathBar = __ds_scope.PathBar;

__ds_ns.TooltipChip = __ds_scope.TooltipChip;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.FacetChip = __ds_scope.FacetChip;

__ds_ns.Segmented = __ds_scope.Segmented;

__ds_ns.TagChip = __ds_scope.TagChip;

__ds_ns.TextInput = __ds_scope.TextInput;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.ActionBar = __ds_scope.ActionBar;

__ds_ns.ModeSwitcher = __ds_scope.ModeSwitcher;

__ds_ns.ImportProgressStrip = __ds_scope.ImportProgressStrip;

__ds_ns.RecognitionChip = __ds_scope.RecognitionChip;

__ds_ns.NotePanel = __ds_scope.NotePanel;

__ds_ns.WikiLink = __ds_scope.WikiLink;

__ds_ns.Panel = __ds_scope.Panel;

})();

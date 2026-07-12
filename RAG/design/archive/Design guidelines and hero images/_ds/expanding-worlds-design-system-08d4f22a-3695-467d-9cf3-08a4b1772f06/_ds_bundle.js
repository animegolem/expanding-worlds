/* @ds-bundle: {"format":4,"namespace":"ExpandingWorldsDesignSystem_08d4f2","components":[{"name":"CharmBar","sourcePath":"components/board/CharmBar.jsx"},{"name":"HintCharm","sourcePath":"components/board/NodeCard.jsx"},{"name":"NodeCard","sourcePath":"components/board/NodeCard.jsx"},{"name":"ObjectIcon","sourcePath":"components/board/ObjectIcon.jsx"},{"name":"Charm","sourcePath":"components/chrome/Charm.jsx"},{"name":"CharmRail","sourcePath":"components/chrome/CharmRail.jsx"},{"name":"Dock","sourcePath":"components/chrome/Dock.jsx"},{"name":"MenuPopover","sourcePath":"components/chrome/MenuPopover.jsx"},{"name":"PathBar","sourcePath":"components/chrome/PathBar.jsx"},{"name":"TooltipChip","sourcePath":"components/chrome/TooltipChip.jsx"},{"name":"Button","sourcePath":"components/controls/Button.jsx"},{"name":"FacetChip","sourcePath":"components/controls/FacetChip.jsx"},{"name":"Segmented","sourcePath":"components/controls/Segmented.jsx"},{"name":"TagChip","sourcePath":"components/controls/TagChip.jsx"},{"name":"TextInput","sourcePath":"components/controls/TextInput.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"ActionBar","sourcePath":"components/feedback/Toast.jsx"},{"name":"ModeSwitcher","sourcePath":"components/feedback/Toast.jsx"},{"name":"ImportProgressStrip","sourcePath":"components/feedback/Toast.jsx"},{"name":"RecognitionChip","sourcePath":"components/feedback/Toast.jsx"},{"name":"NotePanel","sourcePath":"components/panels/NotePanel.jsx"},{"name":"NoteHeading","sourcePath":"components/panels/NotePanel.jsx"},{"name":"WikiLink","sourcePath":"components/panels/NotePanel.jsx"},{"name":"Panel","sourcePath":"components/panels/Panel.jsx"},{"name":"Tape","sourcePath":"components/panels/Paper.jsx"},{"name":"TornEdge","sourcePath":"components/panels/Paper.jsx"},{"name":"BinderRings","sourcePath":"components/panels/Paper.jsx"},{"name":"GlossyPin","sourcePath":"components/panels/Paper.jsx"}],"sourceHashes":{"components/board/CharmBar.jsx":"3798af9e5978","components/board/NodeCard.jsx":"26711daccb76","components/board/ObjectIcon.jsx":"fd332b5b0c9f","components/chrome/Charm.jsx":"a53578290276","components/chrome/CharmRail.jsx":"76f7eda14e7c","components/chrome/Dock.jsx":"9ec64c2b1f2a","components/chrome/MenuPopover.jsx":"b192e9c7a118","components/chrome/PathBar.jsx":"f3cdab92ab35","components/chrome/TooltipChip.jsx":"c55afd5f1d66","components/controls/Button.jsx":"a47f7ded676c","components/controls/FacetChip.jsx":"df1b43f88f4b","components/controls/Segmented.jsx":"80c1d073b3fa","components/controls/TagChip.jsx":"83d2ae3868d0","components/controls/TextInput.jsx":"f337045cfaaa","components/feedback/Toast.jsx":"79bfe8a2ee7f","components/panels/NotePanel.jsx":"7415713169ed","components/panels/Panel.jsx":"9b8c80667172","components/panels/Paper.jsx":"0f94ca6ad55e"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.ExpandingWorldsDesignSystem_08d4f2 = window.ExpandingWorldsDesignSystem_08d4f2 || {});

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

// components/board/ObjectIcon.jsx
try { (() => {
/** The six node object icons (Icon Document 2b family, ratified at the
 * doctrine): star · pin · flag · heart · bolt · leaf. World content —
 * top-light gradient, soft stroke, restrained gloss. Below ~8px
 * rendered size the icon degrades to its plain dot (the shrink
 * ladder). SVG masters live in assets/icons/; this component is the
 * chrome-size/live render, driven by the same --ew-obj-* tokens. */

const DOT = {
  star: 'var(--ew-node-dot-gold)',
  pin: 'var(--ew-node-dot-blue)',
  flag: 'var(--ew-node-dot-red)',
  heart: 'var(--ew-node-dot-pink)',
  bolt: 'var(--ew-node-dot-orange)',
  leaf: 'var(--ew-node-dot-green)'
};
const PAIR = {
  star: 'gold',
  pin: 'blue',
  flag: 'red',
  heart: 'pink',
  bolt: 'orange',
  leaf: 'green'
};
function Shape({
  icon,
  gid
}) {
  const fill = `url(#${gid})`;
  const stroke = `var(--ew-obj-${PAIR[icon]}-stroke)`;
  const gloss = 'var(--ew-obj-gloss)';
  switch (icon) {
    case 'star':
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
        d: "M12 2.5l2.8 6 6.4.6-4.8 4.3 1.4 6.3-5.8-3.3-5.8 3.3 1.4-6.3-4.8-4.3 6.4-.6z",
        fill: fill,
        stroke: stroke,
        strokeWidth: ".8",
        strokeLinejoin: "round"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M12 4.5l1.6 3.4-3.2.2z",
        fill: gloss
      }));
    case 'pin':
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
        d: "M12 3.2a7.3 7.3 0 0 1 7.3 7.3c0 2.1-1 3.7-2.6 5.3L12 21l-4.7-5.2C5.7 14.2 4.7 12.6 4.7 10.5A7.3 7.3 0 0 1 12 3.2z",
        fill: fill,
        stroke: stroke,
        strokeWidth: ".8"
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "12",
        cy: "10.5",
        r: "2.6",
        fill: "var(--ew-obj-pin-hole)"
      }), /*#__PURE__*/React.createElement("ellipse", {
        cx: "9.6",
        cy: "6.8",
        rx: "2.6",
        ry: "1.4",
        fill: gloss
      }));
    case 'flag':
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
        d: "M6 2.5h2.2v19H6z",
        fill: "var(--ew-obj-flag-pole)"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M8 4h10.5l-3 3.8 3 3.8H8z",
        fill: fill,
        stroke: stroke,
        strokeWidth: ".6"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M8.6 4.6h6.2l-.5.9H8.6z",
        fill: gloss
      }));
    case 'heart':
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
        d: "M12 20.6C6.4 16.2 3 13 3 9.6 3 7 5 5 7.4 5c1.8 0 3.4 1 4.6 2.7C13.2 6 14.8 5 16.6 5 19 5 21 7 21 9.6c0 3.4-3.4 6.6-9 11z",
        fill: fill,
        stroke: stroke,
        strokeWidth: ".6"
      }), /*#__PURE__*/React.createElement("ellipse", {
        cx: "8.4",
        cy: "7.8",
        rx: "2.4",
        ry: "1.3",
        fill: gloss
      }));
    case 'bolt':
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
        d: "M13.5 2L4.5 13.5h5.5L9 22l9-11.5h-5.5z",
        fill: fill,
        stroke: stroke,
        strokeWidth: ".6",
        strokeLinejoin: "round"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M12.6 3.6L7.2 10.5l2.1.2z",
        fill: gloss
      }));
    case 'leaf':
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
        d: "M4.5 19.5C4.5 10.5 10.5 4.5 19.5 4.5c0 9-6 15-15 15z",
        fill: fill,
        stroke: stroke,
        strokeWidth: ".6"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M6 18C10 14 14 10 18 6",
        stroke: "var(--ew-obj-leaf-vein)",
        strokeWidth: "1.2",
        fill: "none"
      }));
    default:
      return null;
  }
}
function ObjectIcon({
  icon = 'star',
  size = 24,
  dot = false,
  title,
  style
}) {
  const gid = React.useId();
  // The shrink ladder: below ~8px rendered size, swap to the plain dot.
  if (dot || size < 8) {
    const d = Math.max(4, Math.round(size * 0.66));
    return /*#__PURE__*/React.createElement("span", {
      title: title,
      style: {
        display: 'inline-block',
        width: d,
        height: d,
        borderRadius: '50%',
        background: DOT[icon] || 'var(--ew-node-dot-default)',
        ...style
      }
    });
  }
  const pair = PAIR[icon] || 'gold';
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    style: style,
    role: title ? 'img' : undefined,
    "aria-label": title
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: gid,
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0",
    stopColor: `var(--ew-obj-${pair}-hi)`
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "1",
    stopColor: `var(--ew-obj-${pair}-lo)`
  }))), /*#__PURE__*/React.createElement(Shape, {
    icon: icon,
    gid: gid
  }));
}
Object.assign(__ds_scope, { ObjectIcon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/board/ObjectIcon.jsx", error: String((e && e.message) || e) }); }

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

// components/panels/Paper.jsx
try { (() => {
/** Paper materials (the doctrine, ratified 2026-07-06): the pinned
 * state's permanent marks — tape holding the page to the glass, the
 * torn edge where it left its binding, and the binder rings of the
 * bound page. World content: gentle materiality that survives
 * light/dark/glass via the --ew-tape-* / --ew-paper-torn tokens. */

/** A strip of translucent tape. Place absolutely over a panel edge. */
function Tape({
  width = 46,
  height = 15,
  angle = -4,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: 'inline-block',
      width,
      height,
      background: 'var(--ew-tape-surface)',
      border: '1px solid var(--ew-tape-border)',
      borderRadius: 1,
      transform: `rotate(${angle}deg)`,
      boxSizing: 'border-box',
      ...style
    }
  });
}

/* One ragged silhouette, reused: x pairs are [outer, inner] steps. */
const TORN_POINTS = '100% 0%, 100% 100%, 55% 100%, 20% 96%, 68% 91%, 28% 85%, 60% 79%, 15% 72%, 55% 66%, 30% 60%, 70% 53%, 22% 46%, 58% 40%, 12% 33%, 62% 27%, 25% 20%, 65% 13%, 18% 7%, 52% 0%';

/** The torn edge — the ragged strip left where the page tore out of
 * its binding. Hangs just outside the panel's binding edge. */
function TornEdge({
  edge = 'left',
  style
}) {
  const flip = edge === 'right';
  return /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      [flip ? 'right' : 'left']: -7,
      width: 8,
      background: 'var(--ew-paper-torn)',
      clipPath: `polygon(${TORN_POINTS})`,
      transform: flip ? 'scaleX(-1)' : 'none',
      filter: 'drop-shadow(-1px 0 0 var(--ew-paper-border))',
      ...style
    }
  });
}

/** Binder rings straddling the seam of the bound page (~11px, 2px
 * stroke, punched — the fill is the board color showing through).
 * Absolutely fills the binding edge; rings space themselves. */
function BinderRings({
  edge = 'left',
  count = 5,
  ring = 11,
  style
}) {
  const flip = edge === 'right';
  return /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      top: 10,
      bottom: 10,
      [flip ? 'right' : 'left']: -(ring / 2 + 1),
      width: ring,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      alignItems: 'center',
      ...style
    }
  }, Array.from({
    length: count
  }).map((_, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      width: ring,
      height: ring,
      borderRadius: '50%',
      border: '2px solid var(--ew-text-muted)',
      background: 'var(--ew-board-color, var(--ew-surface-solid))',
      boxSizing: 'border-box'
    }
  })));
}

/** The red glossy pin — the ONE object admitted into chrome adjacency,
 * and only ON the paper (the panel pin control). Chrome pin instances
 * (path-tail bookmark, dock ◉) stay the flat teardrop. */
function GlossyPin({
  size = 15,
  title,
  style
}) {
  const gid = React.useId();
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    style: style,
    role: title ? 'img' : undefined,
    "aria-label": title
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: gid,
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0",
    stopColor: "var(--ew-obj-red-hi)"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "1",
    stopColor: "var(--ew-obj-red-lo)"
  }))), /*#__PURE__*/React.createElement("path", {
    d: "M12 3.2a7.3 7.3 0 0 1 7.3 7.3c0 2.1-1 3.7-2.6 5.3L12 21l-4.7-5.2C5.7 14.2 4.7 12.6 4.7 10.5A7.3 7.3 0 0 1 12 3.2z",
    fill: `url(#${gid})`,
    stroke: "var(--ew-obj-red-stroke)",
    strokeWidth: ".8"
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "9.6",
    cy: "6.8",
    rx: "2.6",
    ry: "1.4",
    fill: "var(--ew-obj-gloss)"
  }));
}
Object.assign(__ds_scope, { Tape, TornEdge, BinderRings, GlossyPin });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/panels/Paper.jsx", error: String((e && e.message) || e) }); }

// components/panels/NotePanel.jsx
try { (() => {
/** Note panel (§8.5 + the 2026-07-06 design pass): notes are light
 * PAPER on every theme, set in the editor face (Maple Mono).
 *
 * Variants:
 * - `tethered` — a glance; one at a time; flat dashed tail to its node
 *   (the tail is board content — draw it in the host). Never resizes.
 * - `bound` — the book page: affixed beside its image at EXACTLY the
 *   image's height (width is the free variable), square corner and
 *   binder rings on the seam. Height is required.
 * - `pinned` — a commitment: torn out (tape + torn edge are the
 *   permanent marks), stronger border + shadow, resizes; past a
 *   threshold it escalates to the big editor.
 *
 * Corner controls are IDENTICAL everywhere: ⌖ places · pin · ⤢ expand.
 * The pin control is the one glossy object in chrome adjacency —
 * flat teardrop when off, the red GlossyPin when on. */
function NotePanel({
  title,
  tags = [],
  places = 1,
  variant,
  pinned,
  origin,
  dirty,
  width = 340,
  height,
  bindEdge = 'left',
  children,
  onPin,
  onExpand,
  onClose,
  onPlaces,
  style
}) {
  const v = variant || (pinned ? 'pinned' : 'tethered');
  const isPinned = v === 'pinned';
  const isBound = v === 'bound';
  const seamRadius = bindEdge === 'right' ? '9px 0 0 9px' : '0 9px 9px 0';
  const ringCount = Math.max(3, Math.round((typeof height === 'number' ? height : 300) / 72));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      width,
      height,
      boxSizing: 'border-box',
      background: 'var(--ew-paper-surface)',
      border: `1px solid ${isPinned ? 'var(--ew-paper-pinned-border)' : 'var(--ew-paper-border-strong)'}`,
      borderRadius: isBound || isPinned ? seamRadius : 9,
      boxShadow: isPinned ? 'var(--ew-panel-shadow-pinned)' : 'var(--ew-panel-shadow)',
      fontFamily: 'var(--ew-font-ui)',
      ...style
    }
  }, isBound && /*#__PURE__*/React.createElement(__ds_scope.BinderRings, {
    edge: bindEdge,
    count: ringCount
  }), isPinned && /*#__PURE__*/React.createElement(__ds_scope.TornEdge, {
    edge: bindEdge
  }), isPinned && /*#__PURE__*/React.createElement(__ds_scope.Tape, {
    style: {
      position: 'absolute',
      top: -7,
      left: '50%',
      marginLeft: -23
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0,
      overflow: 'hidden',
      borderRadius: 'inherit'
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.3rem',
      padding: '0.4rem 0.45rem 0.25rem',
      cursor: isPinned ? 'grab' : 'default'
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
    onClick: onPlaces,
    style: paperBtn,
    title: `${places} places`
  }, "\u2316 ", places, " ", places === 1 ? 'place' : 'places'), onPin && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onPin,
    style: {
      ...paperBtn,
      display: 'inline-flex',
      alignItems: 'center'
    },
    title: isPinned ? 'Pinned · tears back in on unpin' : 'Pin'
  }, isPinned ? /*#__PURE__*/React.createElement(__ds_scope.GlossyPin, {
    size: 15
  }) : /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      width: 9,
      height: 9,
      margin: '0 2px 1px 0',
      border: '1.5px solid var(--ew-paper-text-muted)',
      borderRadius: '50% 50% 50% 0',
      transform: 'rotate(-45deg)',
      boxSizing: 'border-box'
    }
  })), onExpand && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onExpand,
    style: paperBtn,
    title: "Open big editor"
  }, "\u2922"), onClose && /*#__PURE__*/React.createElement("button", {
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
      background: 'var(--ew-paper-page)',
      color: 'var(--ew-paper-text)',
      padding: '0.5rem 0.65rem',
      fontFamily: 'var(--ew-font-editor)',
      fontSize: 'var(--ew-editor-body)',
      lineHeight: 1.65
    }
  }, children)));
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

/** LOUD note heading (EPIC-018 values): size AND color at a glance,
 * riding --ew-note-h1/2/3. Use inside note bodies only. */
function NoteHeading({
  level = 1,
  children,
  style
}) {
  const l = Math.min(3, Math.max(1, level));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--ew-font-editor)',
      fontWeight: 700,
      fontSize: `var(--ew-editor-h${l})`,
      color: `var(--ew-note-h${l})`,
      margin: '0.35em 0 0.15em',
      ...style
    }
  }, children);
}

/** Wiki-link span for note bodies: bound blue · unresolved purple ·
 * trashed grey (recoverable) · broken red STRIKETHROUGH (purged —
 * wavy retired at t6: it read as spell-check). Every state carries
 * the one tooltip chip on hover; states never rely on color alone. */
function WikiLink({
  state = 'bound',
  title,
  children
}) {
  const color = state === 'trashed' ? 'var(--ew-link-muted)' : `var(--ew-link-${state})`;
  const deco = state === 'broken' ? 'line-through' : 'underline';
  const decoColor = state === 'trashed' ? 'var(--ew-link-muted)' : `var(--ew-link-${state}-decoration)`;
  return /*#__PURE__*/React.createElement("span", {
    title: title,
    style: {
      color,
      textDecoration: deco,
      textDecorationColor: decoColor,
      textUnderlineOffset: 2,
      cursor: 'pointer'
    }
  }, children);
}
Object.assign(__ds_scope, { NotePanel, NoteHeading, WikiLink });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/panels/NotePanel.jsx", error: String((e && e.message) || e) }); }

__ds_ns.CharmBar = __ds_scope.CharmBar;

__ds_ns.HintCharm = __ds_scope.HintCharm;

__ds_ns.NodeCard = __ds_scope.NodeCard;

__ds_ns.ObjectIcon = __ds_scope.ObjectIcon;

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

__ds_ns.NoteHeading = __ds_scope.NoteHeading;

__ds_ns.WikiLink = __ds_scope.WikiLink;

__ds_ns.Panel = __ds_scope.Panel;

__ds_ns.Tape = __ds_scope.Tape;

__ds_ns.TornEdge = __ds_scope.TornEdge;

__ds_ns.BinderRings = __ds_scope.BinderRings;

__ds_ns.GlossyPin = __ds_scope.GlossyPin;

})();

/** The floating tool dock, bottom-center (RFC §8.2).
 * @startingPoint section="Chrome" subtitle="Floating tool dock" viewport="520x60"
 */
export interface DockProps {
  /** select | text | shapes | path | line | arrow | connector | pin */
  activeTool?: string;
  zoomPct?: number;
  /** Last-used shape glyph shown on the flyout button: ▭ ◯ △ ➤ */
  shapeGlyph?: string;
  /** Absolute bottom-center (app default) vs inline */
  floating?: boolean;
  onTool?: (kind: string) => void;
  /** -1 zoom out · +1 zoom in · 0 fit */
  onZoom?: (dir: number) => void;
  style?: React.CSSProperties;
}

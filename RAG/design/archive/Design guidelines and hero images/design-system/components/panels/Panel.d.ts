/** Screen-space panel shell (§8.5). */
export interface PanelProps {
  title?: React.ReactNode;
  /** Extra header controls before ✕ (e.g. a Segmented) */
  headerExtra?: React.ReactNode;
  width?: number | string;
  children?: React.ReactNode;
  onClose?: () => void;
  style?: React.CSSProperties;
}

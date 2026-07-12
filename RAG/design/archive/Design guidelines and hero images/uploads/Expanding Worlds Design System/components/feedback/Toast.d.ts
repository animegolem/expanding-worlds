/** Toast (§8.6). */
export interface ToastProps {
  children?: React.ReactNode;
  /** base | error | success */
  kind?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: React.CSSProperties;
}

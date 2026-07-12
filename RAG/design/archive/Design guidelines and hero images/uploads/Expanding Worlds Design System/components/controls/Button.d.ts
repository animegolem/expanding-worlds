/** Chrome button. */
export interface ButtonProps {
  children?: React.ReactNode;
  /** default | accent | ghost */
  variant?: string;
  disabled?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

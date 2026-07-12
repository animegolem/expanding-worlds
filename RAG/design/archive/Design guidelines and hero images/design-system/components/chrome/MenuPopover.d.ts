/** Anchored menu popover (☰ grammar, RFC §8.2). */
export interface MenuPopoverProps {
  /** Rows in order. divider:true renders a rule; section renders a muted label. */
  rows?: Array<{
    label?: string;
    /** Printed shortcut, mono: '⌘Z' */
    shortcut?: string;
    deferred?: boolean;
    danger?: boolean;
    divider?: boolean;
    section?: string;
    onClick?: () => void;
  }>;
  style?: React.CSSProperties;
}
